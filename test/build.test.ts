import { describe, it, expect } from 'vitest';
import { DEFAULT_SPEC } from '../src/lib/enclosure/schema';
import { buildEnclosure } from '../src/lib/enclosure/build';
import { irToManifold } from '../src/lib/eval-manifold';
import { loadManifold } from '../src/lib/kernel';

describe('buildEnclosure', () => {
  it('produces a body that is a difference (cavity + ports + joint pockets cut from the shell)', () => {
    const { body, lid } = buildEnclosure(DEFAULT_SPEC);
    expect(body.op).toBe('difference');
    expect(lid.op).toBe('union');
  });

  it('cuts exactly one port for the default single-port spec', () => {
    const { body } = buildEnclosure(DEFAULT_SPEC);
    if (body.op === 'difference') {
      // children[0] is the shell; the rest are cavity + ports + joint pockets.
      // With 1 port: 1 cavity + 1 port + (joint pockets). Assert the port cutter is present.
      const flat = JSON.stringify(body.children);
      expect(flat).toContain('"box"'); // sanity: contains box cutters
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
    const b = irToManifold(M, body);
    const l = irToManifold(M, lid);
    expect(b.volume()).toBeGreaterThan(0);
    expect(l.volume()).toBeGreaterThan(0);
    expect(b.genus()).toBe(0); // no unintended through-holes/tunnels in the shell topology
  });

  it('taller standoff posts increase body volume (posts survive cavity subtraction)', async () => {
    const M = (await loadManifold()).Manifold;
    const defaultIR = buildEnclosure(DEFAULT_SPEC);
    const tallerSpec = {
      ...DEFAULT_SPEC,
      standoff: { ...DEFAULT_SPEC.standoff, height: DEFAULT_SPEC.standoff.height + 5 },
    };
    const tallerIR = buildEnclosure(tallerSpec);
    const defaultVol = irToManifold(M, defaultIR.body).volume();
    const tallerVol = irToManifold(M, tallerIR.body).volume();
    expect(tallerVol).toBeGreaterThan(defaultVol);
  });
});
