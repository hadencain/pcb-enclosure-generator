import type { IR } from './ir';
import type { Mesh } from './types';
import { loadManifold, manifoldToMesh } from './kernel';

type M3 = any;

export function irToManifold(M: M3, ir: IR): M3 {
  switch (ir.op) {
    case 'box':
      return M.cube(ir.size, true);
    case 'cyl':
      return M.cylinder(ir.h, ir.r1, ir.r2, ir.fn, true); // centered on Z
    case 'translate':
      return irToManifold(M, ir.child).translate(ir.v[0], ir.v[1], ir.v[2]);
    case 'rotate':
      return irToManifold(M, ir.child).rotate(ir.deg[0], ir.deg[1], ir.deg[2]);
    case 'union':
      return ir.children.map(c => irToManifold(M, c)).reduce((a, b) => a.add(b));
    case 'difference': {
      const [first, ...rest] = ir.children.map(c => irToManifold(M, c));
      return rest.reduce((a, b) => a.subtract(b), first);
    }
    case 'intersection':
      return ir.children.map(c => irToManifold(M, c)).reduce((a, b) => a.intersect(b));
  }
}

export async function irToMesh(ir: IR): Promise<Mesh> {
  const M = (await loadManifold()).Manifold;
  return manifoldToMesh(irToManifold(M, ir).getMesh());
}
