import { describe, it, expect } from 'vitest';
import { DEFAULT_SPEC } from '../src/lib/enclosure/schema';

describe('DEFAULT_SPEC', () => {
  it('is a sane starting enclosure', () => {
    expect(DEFAULT_SPEC.pcb.length).toBeGreaterThan(0);
    expect(DEFAULT_SPEC.clearances.wall).toBeGreaterThan(0);
    expect(DEFAULT_SPEC.joint.type).toBe('openlock-clip');
    expect(Array.isArray(DEFAULT_SPEC.ports)).toBe(true);
    expect(DEFAULT_SPEC.exports).toContain('stl');
  });
});
