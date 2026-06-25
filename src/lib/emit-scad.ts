import type { IR, Vec3 } from './ir';

const num = (n: number): string => parseFloat(n.toFixed(4)).toString();
const vec = (v: Vec3): string => `[${num(v[0])}, ${num(v[1])}, ${num(v[2])}]`;
const pad = (depth: number): string => '  '.repeat(depth);

function emit(ir: IR, depth: number): string {
  const i = pad(depth);
  switch (ir.op) {
    case 'box':
      return `${i}cube(${vec(ir.size)}, center=true);`;
    case 'cyl':
      return `${i}cylinder(h=${num(ir.h)}, r1=${num(ir.r1)}, r2=${num(ir.r2)}, $fn=${ir.fn}, center=true);`;
    case 'translate':
      return `${i}translate(${vec(ir.v)}) {\n${emit(ir.child, depth + 1)}\n${i}}`;
    case 'rotate':
      return `${i}rotate(${vec(ir.deg)}) {\n${emit(ir.child, depth + 1)}\n${i}}`;
    case 'union':
    case 'difference':
    case 'intersection': {
      const kw = ir.op === 'union' ? 'union' : ir.op === 'difference' ? 'difference' : 'intersection';
      const body = ir.children.map(c => emit(c, depth + 1)).join('\n');
      return `${i}${kw}() {\n${body}\n${i}}`;
    }
  }
}

export function emitScad(ir: IR): string {
  return emit(ir, 0);
}
