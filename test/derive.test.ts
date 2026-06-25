import { describe, it, expect } from 'vitest';
import { DEFAULT_SPEC } from '../src/lib/enclosure/schema';
import { deriveDims, resolvePort } from '../src/lib/enclosure/derive';

describe('deriveDims', () => {
  it('computes outer box from pcb + clearances', () => {
    const d = deriveDims(DEFAULT_SPEC);
    // innerL = L + 2*pcbGap = 60 + 2 = 62; outerL = inner + 2*wall = 66
    expect(d.innerL).toBeCloseTo(62);
    expect(d.outerL).toBeCloseTo(66);
    expect(d.innerW).toBeCloseTo(42);
    expect(d.outerW).toBeCloseTo(46);
    // cavityH = standoff(3) + board(1.6) + maxCompH(3.2) + ceiling(6) = 13.8
    expect(d.cavityH).toBeCloseTo(13.8);
    // outerH = floor(2) + cavityH = 15.8
    expect(d.outerH).toBeCloseTo(15.8);
    // boardTopZ = floor(2) + standoff(3) + board(1.6) = 6.6
    expect(d.boardTopZ).toBeCloseTo(6.6);
  });
});

describe('resolvePort', () => {
  it('places the USB-C port on the north face from its keepout', () => {
    const d = deriveDims(DEFAULT_SPEC);
    const r = resolvePort(DEFAULT_SPEC, DEFAULT_SPEC.ports[0], d);
    expect(r.face).toBe('N');
    // keepout usb: x=24,w=9 -> centerX = 24+4.5 = 28.5; centered = 28.5 - 60/2 = -1.5
    expect(r.alongCenter).toBeCloseTo(-1.5);
    // zCenter = boardTopZ(6.6) + z(0) + h/2(1.6) = 8.2
    expect(r.zCenter).toBeCloseTo(8.2);
    // usb-c catalog opening 9 x 3.2 + 2*margin(0.5) = 10 x 4.2
    expect(r.openW).toBeCloseTo(10);
    expect(r.openH).toBeCloseTo(4.2);
  });
});
