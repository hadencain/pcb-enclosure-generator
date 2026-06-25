import { describe, it, expect } from 'vitest';
import { getJoint, type RimGeometry } from '../src/lib/enclosure/joints';

const rim: RimGeometry = { outerL: 66, outerW: 46, rimZ: 15.8, wall: 2.0 };

describe('openlock-clip joint', () => {
  it('produces body cut features and lid add features', () => {
    const j = getJoint('openlock-clip');
    const body = j.bodyFeatures(rim, 0.2);
    const lid = j.lidFeatures(rim, 0.2);
    expect(body.length).toBeGreaterThan(0);
    expect(lid.length).toBeGreaterThan(0);
  });

  it('throws for the not-yet-built cantilever joint', () => {
    expect(() => getJoint('cantilever')).toThrow(/cantilever/);
  });
});
