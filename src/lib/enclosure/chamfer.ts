import type { IR, Vec3 } from '../ir';
import { bx, rot, tr } from '../ir';

const SQRT2 = Math.SQRT2;

/**
 * A single 45° chamfer bar centered on an edge line.
 * `axis` is the world axis the edge runs along. The bar is a square-section
 * prism rotated 45° about that axis; subtracting it bevels whatever material
 * touches the edge by leg `c` (a square of side c·√2 rotated 45° has half-
 * diagonal c). `length` is the bar's extent along its axis.
 */
export function chamferBar(axis: 'x' | 'y', center: Vec3, length: number, c: number): IR {
  const s = c * SQRT2;
  return axis === 'x'
    ? tr(center, rot([45, 0, 0], bx([length, s, s])))
    : tr(center, rot([0, 45, 0], bx([s, length, s])));
}

/**
 * Four chamfer bars beveling the perimeter edge of a centered rectangle
 * (half-extents hx, hy) lying in the plane z. Subtract these to chamfer that
 * edge ring — works for an outer-top edge, an inner cavity mouth, a lip
 * bottom, etc., because each bar only removes material that actually touches
 * its edge.
 */
export function perimeterChamfer(hx: number, hy: number, z: number, c: number): IR[] {
  return [
    chamferBar('x', [0, hy, z], 2 * hx + 2 * c, c),
    chamferBar('x', [0, -hy, z], 2 * hx + 2 * c, c),
    chamferBar('y', [hx, 0, z], 2 * hy + 2 * c, c),
    chamferBar('y', [-hx, 0, z], 2 * hy + 2 * c, c),
  ];
}
