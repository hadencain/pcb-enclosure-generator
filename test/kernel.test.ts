import { describe, it, expect } from 'vitest';
import { loadManifold, box, manifoldToMesh } from '../src/lib/kernel';

describe('kernel', () => {
  it('builds a watertight centered cube mesh', async () => {
    const wasm = await loadManifold();
    const M = wasm.Manifold;
    const solid = box(M, 10, 20, 5);
    const mesh = manifoldToMesh(solid.getMesh());
    expect(mesh.verts.length).toBeGreaterThan(0);
    expect(mesh.tris.length).toBe(12); // a box is 12 triangles
    // centered: x spans -5..5
    const xs = mesh.verts.map(v => v[0]);
    expect(Math.min(...xs)).toBeCloseTo(-5);
    expect(Math.max(...xs)).toBeCloseTo(5);
  });
});
