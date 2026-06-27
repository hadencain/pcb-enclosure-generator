import { describe, it, expect } from 'vitest';
import { PORT_CATALOG, buildPortCutter } from '../src/lib/enclosure/ports';
import type { ResolvedPort } from '../src/lib/enclosure/derive';
import type { DerivedDims } from '../src/lib/enclosure/derive';

const dims: DerivedDims = {
  outerL: 66, outerW: 46, outerH: 15.8,
  innerL: 62, innerW: 42, cavityH: 13.8, floorZ: 2, boardTopZ: 6.6,
};

describe('PORT_CATALOG', () => {
  it('has usb-c opening dims', () => {
    expect(PORT_CATALOG['usb-c']).toEqual({ w: 9, h: 3.2 });
  });
});

describe('buildPortCutter', () => {
  it('builds a translated box cutter on the north face', () => {
    const rp: ResolvedPort = { face: 'N', alongCenter: -1.5, zCenter: 8.2, openW: 10, openH: 4.2 };
    const ir = buildPortCutter(rp, dims, 2.0);
    expect(ir.op).toBe('translate');
    if (ir.op === 'translate') {
      // north face: y at +outerW/2 = 23; box centered there, cut spans wall
      expect(ir.v[0]).toBeCloseTo(-1.5);
      expect(ir.v[1]).toBeCloseTo(23);
      expect(ir.v[2]).toBeCloseTo(8.2);
      expect(ir.child.op).toBe('box');
      if (ir.child.op === 'box') {
        expect(ir.child.size[0]).toBeCloseTo(10); // openW along X
        expect(ir.child.size[2]).toBeCloseTo(4.2); // openH along Z
        expect(ir.child.size[1]).toBeGreaterThan(2.0); // pierces the wall
      }
    }
  });
});
