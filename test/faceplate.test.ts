import { describe, it, expect } from 'vitest';
import { DEFAULT_SPEC } from '../src/lib/enclosure/schema';
import { COMPONENT_CATALOG, resolveSize, componentHole, componentFootprint, validateFaceplate } from '../src/lib/enclosure/faceplate';
import type { PlacedComponent } from '../src/lib/enclosure/schema';
import type { DerivedDims } from '../src/lib/enclosure/derive';

describe('faceplate schema', () => {
  it('defaults to an empty faceplate with a 2.5mm snap grid', () => {
    expect(DEFAULT_SPEC.faceplate.snap).toBe(2.5);
    expect(DEFAULT_SPEC.faceplate.components).toEqual([]);
  });
});

const dims: DerivedDims = {
  outerL: 66, outerW: 46, outerH: 15.8,
  innerL: 62, innerW: 42, cavityH: 13.8, floorZ: 2, boardTopZ: 6.6,
};
const at = (over: Partial<PlacedComponent>): PlacedComponent =>
  ({ id: 'c', type: 'pot', x: 0, y: 0, rotation: 0, ...over });

describe('COMPONENT_CATALOG', () => {
  it('has the seven v1 presets with expected shapes and default sizes', () => {
    expect(COMPONENT_CATALOG['pot']).toEqual({ label: 'Potentiometer', shape: 'round', default: { dia: 7.0 } });
    expect(COMPONENT_CATALOG['slider'].shape).toBe('slot');
    expect(COMPONENT_CATALOG['display'].shape).toBe('rect');
    expect(Object.keys(COMPONENT_CATALOG).length).toBe(7);
  });
});

describe('resolveSize', () => {
  it('returns the catalog default when no override', () => {
    expect(resolveSize(at({ type: 'led' }))).toEqual({ dia: 5.0 });
  });
  it('returns the instance override when present', () => {
    expect(resolveSize(at({ type: 'pot', size: { dia: 9.5 } }))).toEqual({ dia: 9.5 });
  });
});

describe('componentHole', () => {
  it('builds a round hole as a centered cylinder piercing the lid', () => {
    const ir = componentHole(at({ type: 'pot', x: 10, y: -5 }), dims, 2.0);
    expect(ir.op).toBe('translate');
    if (ir.op === 'translate') {
      expect(ir.v[0]).toBeCloseTo(10);
      expect(ir.v[1]).toBeCloseTo(-5);
      expect(ir.v[2]).toBeCloseTo(16.8); // outerH + thickness/2
      expect(ir.child.op).toBe('cyl');
      if (ir.child.op === 'cyl') {
        expect(ir.child.r1).toBeCloseTo(3.5);   // dia 7 / 2
        expect(ir.child.h).toBeCloseTo(4);       // thickness + 2
      }
    }
  });

  it('builds a rect window rotated about Z', () => {
    const ir = componentHole(at({ type: 'display', rotation: 90 }), dims, 2.0);
    // translate → rotate → box
    expect(ir.op).toBe('translate');
    if (ir.op === 'translate') {
      expect(ir.child.op).toBe('rotate');
      if (ir.child.op === 'rotate') {
        expect(ir.child.deg).toEqual([0, 0, 90]);
        expect(ir.child.child.op).toBe('box');
        if (ir.child.child.op === 'box') {
          expect(ir.child.child.size[0]).toBeCloseTo(25);
          expect(ir.child.child.size[1]).toBeCloseTo(15);
        }
      }
    }
  });

  it('builds a slider slot as a union of a box and two end caps', () => {
    const ir = componentHole(at({ type: 'slider' }), dims, 2.0);
    // translate → rotate → union([box, cyl, cyl])
    if (ir.op === 'translate' && ir.child.op === 'rotate' && ir.child.child.op === 'union') {
      const u = ir.child.child;
      expect(u.children.length).toBe(3);
      expect(u.children[0].op).toBe('box');
      expect(u.children[1].op).toBe('translate'); // shifted end-cap cylinder
      expect(u.children[2].op).toBe('translate');
    } else {
      throw new Error('slot shape should be translate→rotate→union');
    }
  });
});

describe('componentFootprint', () => {
  it('round footprint is the diameter square regardless of rotation', () => {
    expect(componentFootprint(at({ type: 'pot', rotation: 37 }))).toEqual({ hw: 3.5, hh: 3.5 });
  });
  it('rect footprint swaps with a 90° rotation', () => {
    const f0 = componentFootprint(at({ type: 'display', rotation: 0 }));
    const f90 = componentFootprint(at({ type: 'display', rotation: 90 }));
    expect(f0.hw).toBeCloseTo(12.5); expect(f0.hh).toBeCloseTo(7.5);
    expect(f90.hw).toBeCloseTo(7.5); expect(f90.hh).toBeCloseTo(12.5);
  });
});

describe('faceplate arrays schema', () => {
  it('defaults to no arrays', () => {
    expect(DEFAULT_SPEC.faceplate.arrays).toEqual([]);
  });
});

describe('validateFaceplate', () => {
  const withComps = (components: any[]) => ({ ...DEFAULT_SPEC, faceplate: { snap: 2.5, components, arrays: [] } });

  it('flags a component that runs off the panel edge', () => {
    const diags = validateFaceplate(withComps([at({ id: 'a', type: 'pot', x: 40, y: 0 })]));
    expect(diags.some((d: any) => d.componentId === 'a' && d.kind === 'off-panel')).toBe(true);
  });

  it('flags a component overlapping a corner screw boss', () => {
    // default screw boss center ≈ (outerL/2 - bossDia/2, outerW/2 - bossDia/2) = (30, 20)
    const diags = validateFaceplate(withComps([at({ id: 'b', type: 'pot', x: 30, y: 20 })]));
    expect(diags.some((d: any) => d.componentId === 'b' && d.kind === 'screw-boss')).toBe(true);
  });

  it('flags two overlapping components (both ids)', () => {
    const diags = validateFaceplate(withComps([
      at({ id: 'p', type: 'pot', x: 0, y: 0 }),
      at({ id: 'q', type: 'pot', x: 2, y: 0 }),
    ]));
    expect(diags.some((d: any) => d.componentId === 'p' && d.kind === 'overlap')).toBe(true);
    expect(diags.some((d: any) => d.componentId === 'q' && d.kind === 'overlap')).toBe(true);
  });

  it('returns no diagnostics for a clean central layout', () => {
    expect(validateFaceplate(withComps([at({ id: 'ok', type: 'led', x: 0, y: 0 })]))).toEqual([]);
  });

  it('flags a component overlapping the countersink even when it clears the boss (headDia > bossDia)', () => {
    const spec = {
      ...DEFAULT_SPEC,
      screw: { ...DEFAULT_SPEC.screw, bossDia: 4, headDia: 10 },
      faceplate: { snap: 2.5, components: [
        // outer box is 66x46; corner center = (outerL/2 - bossDia/2, outerW/2 - bossDia/2) = (31, 21).
        // LED Ø5 → footprint hw=hh=2.5. Place at x=26, y=21: nearest AABB point to corner is
        // (28.5, 21), distance = 2.5 — outside bossR(2) but inside cornerR(max(4,10)/2=5).
        { id: 'cs', type: 'led' as const, x: 26, y: 21, rotation: 0 },
      ], arrays: [] },
    };
    const diags = validateFaceplate(spec);
    expect(diags.some(d => d.componentId === 'cs' && d.kind === 'screw-boss')).toBe(true);
  });
});
