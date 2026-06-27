import { describe, it, expect } from 'vitest';
import { DEFAULT_SPEC } from '../src/lib/enclosure/schema';
import { COMPONENT_CATALOG, resolveSize, componentHole } from '../src/lib/enclosure/faceplate';
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
