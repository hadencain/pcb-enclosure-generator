import { describe, it, expect } from 'vitest';
import { bx, cy, tr, diff } from '../src/lib/ir';
import { emitScad } from '../src/lib/emit-scad';

describe('emitScad', () => {
  it('emits a centered cube', () => {
    expect(emitScad(bx([10, 20, 5]))).toBe('cube([10, 20, 5], center=true);');
  });

  it('emits a cylinder with $fn', () => {
    expect(emitScad(cy(5, 2, 2, 32))).toBe('cylinder(h=5, r1=2, r2=2, $fn=32, center=true);');
  });

  it('formats floats without binary noise', () => {
    expect(emitScad(bx([0.1 + 0.2, 1, 1]))).toBe('cube([0.3, 1, 1], center=true);');
  });

  it('nests a difference of translated boxes with indentation', () => {
    const ir = diff([bx([10, 10, 10]), tr([1, 2, 3], bx([4, 4, 12]))]);
    expect(emitScad(ir)).toBe(
      'difference() {\n' +
      '  cube([10, 10, 10], center=true);\n' +
      '  translate([1, 2, 3]) {\n' +
      '    cube([4, 4, 12], center=true);\n' +
      '  }\n' +
      '}'
    );
  });
});
