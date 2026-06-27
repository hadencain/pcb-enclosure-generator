import { describe, it, expect } from 'vitest';
import { DEFAULT_SPEC } from '../src/lib/enclosure/schema';

describe('faceplate schema', () => {
  it('defaults to an empty faceplate with a 2.5mm snap grid', () => {
    expect(DEFAULT_SPEC.faceplate.snap).toBe(2.5);
    expect(DEFAULT_SPEC.faceplate.components).toEqual([]);
  });
});
