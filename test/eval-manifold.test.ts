import { describe, it, expect } from 'vitest';
import { bx, cy, tr, diff } from '../src/lib/ir';
import { irToManifold, irToMesh } from '../src/lib/eval-manifold';
import { loadManifold } from '../src/lib/kernel';

describe('irToManifold', () => {
  it('evaluates a box to the correct volume and bbox', async () => {
    const M = (await loadManifold()).Manifold;
    const m = irToManifold(M, bx([10, 20, 4]));
    expect(m.volume()).toBeCloseTo(800, 1);
    const bb = m.boundingBox();
    expect(bb.min).toEqual([-5, -10, -2]);
    expect(bb.max).toEqual([5, 10, 2]);
  });

  it('evaluates a difference (box minus translated cylinder hole)', async () => {
    const M = (await loadManifold()).Manifold;
    const ir = diff([bx([10, 10, 4]), tr([0, 0, 0], cy(10, 2, 2, 64))]);
    const m = irToManifold(M, ir);
    // 400 minus a ~r2 cylinder of height 4 through it: pi*4*4 = ~50.3
    expect(m.volume()).toBeCloseTo(400 - Math.PI * 4 * 4, 0);
  });

  it('irToMesh returns a triangle mesh', async () => {
    const mesh = await irToMesh(bx([5, 5, 5]));
    expect(mesh.tris.length).toBe(12);
  });

  it('throws on a CSG node with no children', async () => {
    const M = (await loadManifold()).Manifold;
    expect(() => irToManifold(M, { op: 'union', children: [] } as any)).toThrow(/no children/);
  });
});
