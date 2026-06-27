import { describe, it, expect } from 'vitest';
import { DEFAULT_SPEC } from '../src/lib/enclosure/schema';
import { buildEnclosure } from '../src/lib/enclosure/build';
import { irToManifold } from '../src/lib/eval-manifold';
import { loadManifold } from '../src/lib/kernel';

describe('buildEnclosure', () => {
  it('produces a body and lid that are both differences (cuts from assembled solids)', () => {
    const { body, lid } = buildEnclosure(DEFAULT_SPEC);
    expect(body.op).toBe('difference');
    expect(lid.op).toBe('difference'); // screw closure: countersink holes cut the lid
  });

  it('cuts the port from the body', () => {
    const { body } = buildEnclosure(DEFAULT_SPEC);
    if (body.op === 'difference') {
      const flat = JSON.stringify(body.children);
      expect(flat).toContain('"box"');
      expect(body.children.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('is fully serializable (pure IR, no functions)', () => {
    const out = buildEnclosure(DEFAULT_SPEC);
    expect(() => JSON.stringify(out)).not.toThrow();
  });
});

describe('buildEnclosure (manifold smoke)', () => {
  it('evaluates to non-empty manifolds with positive volume', async () => {
    const M = (await loadManifold()).Manifold;
    const { body, lid } = buildEnclosure(DEFAULT_SPEC);
    expect(irToManifold(M, body).volume()).toBeGreaterThan(0);
    expect(irToManifold(M, lid).volume()).toBeGreaterThan(0);
  });

  it('opens one real through-port (open-top shell + 1 side port → genus 1)', async () => {
    const M = (await loadManifold()).Manifold;
    const { body } = buildEnclosure(DEFAULT_SPEC);
    // A blind (non-piercing) port would leave genus 0; a true opening adds a handle.
    expect(irToManifold(M, body).genus()).toBe(DEFAULT_SPEC.ports.length);
  });

  it('drills four screw clearance holes through the lid (genus 4)', async () => {
    const M = (await loadManifold()).Manifold;
    const { lid } = buildEnclosure(DEFAULT_SPEC); // screw closure
    expect(irToManifold(M, lid).genus()).toBe(4);
  });

  it('adds corner screw bosses to the body (screw closure has more material than snap)', async () => {
    const M = (await loadManifold()).Manifold;
    const screwVol = irToManifold(M, buildEnclosure(DEFAULT_SPEC).body).volume();
    const snapSpec = { ...DEFAULT_SPEC, closure: { type: 'snap' as const } };
    const snapVol = irToManifold(M, buildEnclosure(snapSpec).body).volume();
    expect(screwVol).toBeGreaterThan(snapVol);
  });

  it('taller standoff posts increase body volume (posts survive cavity subtraction)', async () => {
    const M = (await loadManifold()).Manifold;
    const defaultVol = irToManifold(M, buildEnclosure(DEFAULT_SPEC).body).volume();
    const tallerSpec = {
      ...DEFAULT_SPEC,
      standoff: { ...DEFAULT_SPEC.standoff, height: DEFAULT_SPEC.standoff.height + 5 },
    };
    const tallerVol = irToManifold(M, buildEnclosure(tallerSpec).body).volume();
    expect(tallerVol).toBeGreaterThan(defaultVol);
  });
});
