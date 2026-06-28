import { useRef, useEffect, useState } from 'react';
import type { Mesh } from '../lib/types';

interface Props {
  mesh: Mesh | null;
  defaultTheta?: number;
  defaultPhi?: number;
}

// 4×4 matrix helpers (column-major, typed as flat 16-element arrays)
type Mat4 = Float32Array;

function mat4Identity(): Mat4 {
  return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
}

function mat4Mul(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[i + k*4]! * b[k + j*4]!;
      out[i + j*4] = s;
    }
  }
  return out;
}

function mat4Perspective(fov: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fov / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect; m[5] = f;
  m[10] = (far + near) / (near - far); m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

function mat4RotateX(angle: number): Mat4 {
  const c = Math.cos(angle), s = Math.sin(angle);
  const m = mat4Identity();
  m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
  return m;
}

function mat4RotateZ(angle: number): Mat4 {
  const c = Math.cos(angle), s = Math.sin(angle);
  const m = mat4Identity();
  m[0] = c; m[1] = s; m[4] = -s; m[5] = c;
  return m;
}

function mat4Translate(tx: number, ty: number, tz: number): Mat4 {
  const m = mat4Identity();
  m[12] = tx; m[13] = ty; m[14] = tz;
  return m;
}

const VERT_SRC = `#version 300 es
precision mediump float;
in vec3 aPos;
in vec3 aNormal;
uniform mat4 uMVP;
uniform mat4 uModelIT; // inverse-transpose of model for normals
out vec3 vNormal;
void main() {
  vNormal = normalize((uModelIT * vec4(aNormal, 0.0)).xyz);
  gl_Position = uMVP * vec4(aPos, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision mediump float;
in vec3 vNormal;
out vec4 fragColor;
void main() {
  vec3 light1 = normalize(vec3(0.6, 0.8, 1.0));
  vec3 light2 = normalize(vec3(-0.4, -0.3, 0.5));
  float d1 = max(0.0, dot(vNormal, light1));
  float d2 = max(0.0, dot(vNormal, light2)) * 0.3;
  float ambient = 0.25;
  float lum = ambient + d1 * 0.65 + d2;
  vec3 col = vec3(0.76, 0.75, 0.80) * lum;
  fragColor = vec4(col, 1.0);
}`;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader error');
  return sh;
}

function buildProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER,   VERT_SRC));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link error');
  return prog;
}

// Build flat-shaded vertex buffer: for each triangle, 3 verts × [x,y,z,nx,ny,nz]
function buildBuffer(mesh: Mesh): { data: Float32Array; count: number } {
  const data = new Float32Array(mesh.tris.length * 18);
  let off = 0;
  for (const [i0, i1, i2] of mesh.tris) {
    const v0 = mesh.verts[i0]!, v1 = mesh.verts[i1]!, v2 = mesh.verts[i2]!;
    const ax = v1[0]-v0[0], ay = v1[1]-v0[1], az = v1[2]-v0[2];
    const bx = v2[0]-v0[0], by = v2[1]-v0[1], bz = v2[2]-v0[2];
    const nx = ay*bz-az*by, ny = az*bx-ax*bz, nz = ax*by-ay*bx;
    const len = Math.sqrt(nx*nx+ny*ny+nz*nz) || 1;
    const fn = [nx/len, ny/len, nz/len];
    for (const v of [v0, v1, v2]) {
      data[off++] = v[0]; data[off++] = v[1]; data[off++] = v[2];
      data[off++] = fn[0]!; data[off++] = fn[1]!; data[off++] = fn[2]!;
    }
  }
  return { data, count: mesh.tris.length * 3 };
}

export function Preview3D({ mesh, defaultTheta = 0.4, defaultPhi = -0.5 }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const glRef       = useRef<WebGL2RenderingContext | null>(null);
  const progRef     = useRef<WebGLProgram | null>(null);
  const vaoRef      = useRef<WebGLVertexArrayObject | null>(null);
  const vboRef      = useRef<WebGLBuffer | null>(null);
  const vtxCount    = useRef(0);
  // meshRef lets render() always see the current mesh even from stale closures (RAF loop)
  const meshRef     = useRef<Mesh | null>(null);
  const theta       = useRef(defaultTheta);
  const phi         = useRef(defaultPhi);
  const zoom        = useRef(1.0);
  const dragging    = useRef(false);
  const lastMouse   = useRef({ x: 0, y: 0 });
  const rafRef      = useRef<number>(0);
  const [autoRotate, setAutoRotate] = useState(false);
  const autoRotRef  = useRef(false);
  autoRotRef.current = autoRotate;

  // Init WebGL once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2');
    if (!gl) return;
    glRef.current = gl;

    try {
      const prog = buildProgram(gl);
      progRef.current = prog;

      const vao = gl.createVertexArray()!;
      vaoRef.current = vao;
      const vbo = gl.createBuffer()!;
      vboRef.current = vbo;
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      const STRIDE = 24; // 6 floats × 4 bytes
      const aPosLoc = gl.getAttribLocation(prog, 'aPos');
      const aNrmLoc = gl.getAttribLocation(prog, 'aNormal');
      gl.vertexAttribPointer(aPosLoc, 3, gl.FLOAT, false, STRIDE, 0);
      gl.enableVertexAttribArray(aPosLoc);
      gl.vertexAttribPointer(aNrmLoc, 3, gl.FLOAT, false, STRIDE, 12);
      gl.enableVertexAttribArray(aNrmLoc);
      gl.bindVertexArray(null);

      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
    } catch (e) {
      console.warn('WebGL init failed', e);
    }

    // Size the drawing buffer to the element's display size, and keep it in sync.
    const resize = () => {
      const c = canvasRef.current;
      if (!c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(c.clientWidth * dpr));
      const h = Math.max(1, Math.floor(c.clientHeight * dpr));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      renderFrame();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    return () => { ro.disconnect(); cancelAnimationFrame(rafRef.current); };
  }, []);

  // Upload mesh whenever it changes — reuse the single VBO, just stream new data
  useEffect(() => {
    meshRef.current = mesh; // keep ref current so render() never sees a stale value
    const gl  = glRef.current;
    const vbo = vboRef.current;
    if (!gl || !vbo || !mesh) return;
    const { data, count } = buildBuffer(mesh);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    vtxCount.current = count;
    renderFrame();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesh]);

  function renderFrame() {
    const gl   = glRef.current;
    const prog = progRef.current;
    const vao  = vaoRef.current;
    const canvas = canvasRef.current;
    if (!gl || !prog || !vao || !canvas || vtxCount.current === 0) return;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.039, 0.043, 0.051, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Always read from ref so this function is safe to call from any closure age
    const m = meshRef.current;
    if (!m) return;
    let minZ = Infinity, maxZ = -Infinity, maxR = 0;
    for (const v of m.verts) {
      minZ = Math.min(minZ, v[2]); maxZ = Math.max(maxZ, v[2]);
      maxR = Math.max(maxR, Math.sqrt(v[0]*v[0] + v[1]*v[1]));
    }
    const cy = (minZ + maxZ) / 2;
    const extent = Math.max(maxZ - minZ, maxR * 2);
    const scale  = 1.6 / extent * zoom.current;

    const proj  = mat4Perspective(0.8, canvas.width / canvas.height, 0.01, 100);
    const view  = mat4Translate(0, 0, -2.5);
    const rotZ  = mat4RotateZ(theta.current);
    const rotX  = mat4RotateX(phi.current);
    const center= mat4Translate(0, 0, -cy * scale);
    const sc    = new Float32Array([scale,0,0,0, 0,0,scale,0, 0,scale,0,0, 0,0,0,1]);
    // Model: scale → center → rotX → rotZ
    const model = mat4Mul(mat4Mul(rotX, mat4Mul(rotZ, mat4Mul(center, sc))), mat4Identity());
    const mvp   = mat4Mul(proj, mat4Mul(view, model));
    // Model inverse-transpose (same as model for uniform scale + rotations)
    const modelIT = model;

    gl.useProgram(prog);
    gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'uMVP'),     false, mvp);
    gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'uModelIT'), false, modelIT);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, vtxCount.current);
    gl.bindVertexArray(null);
  }

  // Render loop for auto-rotate
  useEffect(() => {
    function loop() {
      if (autoRotRef.current) {
        theta.current += 0.008;
        renderFrame();
      }
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render when rotation/zoom changes
  function onMouseDown(e: React.MouseEvent) {
    dragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    theta.current += dx * 0.01;
    phi.current   += dy * 0.01;
    phi.current    = Math.max(-Math.PI/2, Math.min(Math.PI/2, phi.current));
    lastMouse.current = { x: e.clientX, y: e.clientY };
    renderFrame();
  }
  function onMouseUp() { dragging.current = false; }
  function onWheel(e: React.WheelEvent) {
    zoom.current = Math.max(0.2, Math.min(4, zoom.current * (e.deltaY > 0 ? 0.9 : 1.1)));
    renderFrame();
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        width={360}
        height={480}
        style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      />
      <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <label className="stat" style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input type="checkbox" checked={autoRotate} onChange={e => setAutoRotate(e.target.checked)} />
          auto-rotate
        </label>
        <span className="stat">· drag to orbit · scroll to zoom</span>
      </div>
    </div>
  );
}
