import type { Mesh } from './types';

type M3 = any;
let _wasm: M3 | null = null;
let _loading: Promise<M3> | null = null;

export async function loadManifold(): Promise<M3> {
  if (_wasm) return _wasm;
  if (!_loading) {
    _loading = (async () => {
      const mod = await import('manifold-3d');
      const wasm = await (mod.default as () => Promise<M3>)();
      wasm.setup();
      _wasm = wasm;
      return wasm;
    })();
  }
  return _loading;
}

/** Centered box. M.cube([x,y,z], true) = cube centered at origin. */
export function box(M: M3, x: number, y: number, z: number): M3 {
  return M.cube([x, y, z], true);
}

export function manifoldToMesh(
  mm: { numProp: number; vertProperties: Float32Array; triVerts: Uint32Array },
): Mesh {
  const np = mm.numProp;
  const verts: [number, number, number][] = [];
  const tris: [number, number, number][] = [];
  for (let i = 0; i < mm.vertProperties.length; i += np)
    verts.push([mm.vertProperties[i]!, mm.vertProperties[i + 1]!, mm.vertProperties[i + 2]!]);
  for (let i = 0; i < mm.triVerts.length; i += 3)
    tris.push([mm.triVerts[i]!, mm.triVerts[i + 1]!, mm.triVerts[i + 2]!]);
  return { verts, tris };
}
