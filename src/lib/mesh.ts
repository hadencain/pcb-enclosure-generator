import type { Mesh } from './types';

function triNormal(
  v0: [number, number, number],
  v1: [number, number, number],
  v2: [number, number, number],
): [number, number, number] {
  const ax = v1[0]-v0[0], ay = v1[1]-v0[1], az = v1[2]-v0[2];
  const bx = v2[0]-v0[0], by = v2[1]-v0[1], bz = v2[2]-v0[2];
  const nx = ay*bz-az*by, ny = az*bx-ax*bz, nz = ax*by-ay*bx;
  const len = Math.sqrt(nx*nx+ny*ny+nz*nz) || 1;
  return [nx/len, ny/len, nz/len];
}

export function buildSTL(mesh: Mesh): ArrayBuffer {
  const { verts, tris } = mesh;
  const buf  = new ArrayBuffer(84 + tris.length * 50);
  const view = new DataView(buf);
  let off = 80;
  view.setUint32(off, tris.length, true); off += 4;
  for (const [i0, i1, i2] of tris) {
    const v0 = verts[i0]!, v1 = verts[i1]!, v2 = verts[i2]!;
    const n  = triNormal(v0, v1, v2);
    view.setFloat32(off, n[0], true); off += 4;
    view.setFloat32(off, n[1], true); off += 4;
    view.setFloat32(off, n[2], true); off += 4;
    for (const v of [v0, v1, v2]) {
      view.setFloat32(off, v[0], true); off += 4;
      view.setFloat32(off, v[1], true); off += 4;
      view.setFloat32(off, v[2], true); off += 4;
    }
    view.setUint16(off, 0, true); off += 2;
  }
  return buf;
}
