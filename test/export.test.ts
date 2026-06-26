import { describe, it, expect } from 'vitest';
import { DEFAULT_SPEC } from '../src/lib/enclosure/schema';
import { enclosureToScad } from '../src/lib/enclosure/export';

describe('enclosureToScad', () => {
  it('emits valid-looking OpenSCAD for body and lid', () => {
    const { body, lid } = enclosureToScad(DEFAULT_SPEC);
    expect(body.startsWith('difference()')).toBe(true);
    expect(body).toContain('cube([');
    expect(lid.startsWith('union()')).toBe(true);
  });
});
