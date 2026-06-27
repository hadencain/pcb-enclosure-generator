import { describe, it, expect } from 'vitest';
import { DEFAULT_SPEC } from '../src/lib/enclosure/schema';
import { enclosureToScad, printLayout } from '../src/lib/enclosure/export';
import { buildEnclosure } from '../src/lib/enclosure/build';
import { irToManifold } from '../src/lib/eval-manifold';
import { loadManifold } from '../src/lib/kernel';

describe('enclosureToScad', () => {
  it('emits valid-looking OpenSCAD for body and lid', () => {
    const { body, lid } = enclosureToScad(DEFAULT_SPEC);
    expect(body.startsWith('difference()')).toBe(true);
    expect(body).toContain('cube([');
    // screw-closure lid has countersink holes subtracted → difference at the top
    expect(lid.startsWith('difference()')).toBe(true);
  });
});

describe('printLayout', () => {
  it('lays both parts flat on the bed (z ≥ 0)', async () => {
    const M = (await loadManifold()).Manifold;
    const laid = printLayout(DEFAULT_SPEC, buildEnclosure(DEFAULT_SPEC));
    const bodyMinZ = irToManifold(M, laid.body).boundingBox().min[2];
    const lidMinZ = irToManifold(M, laid.lid).boundingBox().min[2];
    expect(bodyMinZ).toBeCloseTo(0, 1);
    expect(lidMinZ).toBeCloseTo(0, 1);
  });
});
