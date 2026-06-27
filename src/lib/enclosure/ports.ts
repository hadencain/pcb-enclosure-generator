import type { IR } from '../ir';
import { bx, tr, uni } from '../ir';
import type { ResolvedPort, DerivedDims } from './derive';
import { chamferBar } from './chamfer';

export const PORT_CATALOG: Record<string, { w: number; h: number } | undefined> = {
  'usb-c': { w: 9, h: 3.2 },
  'usb-a': { w: 13, h: 6 },
  'micro-usb': { w: 8, h: 3 },
  'barrel': { w: 8, h: 8 },
  'rect': undefined,
  'circle': undefined,
};

/**
 * A box that pierces fully through the wall on the port's face, opening into the
 * cavity. The cutter spans from ~1mm inside the cavity to ~1mm outside the shell
 * (depth = wall + 2, centered on the wall mid-plane) so the opening is a real
 * through-hole, not a blind recess.
 *
 * When `chamfer > 0`, a 45° bar is unioned onto the top edge so the printed
 * opening has a self-supporting sloped roof instead of an unsupported bridge.
 */
export function buildPortCutter(rp: ResolvedPort, dims: DerivedDims, wall: number, chamfer = 0): IR {
  const depth = wall + 2;
  const cN = dims.outerW / 2 - wall / 2; // |y| center for N/S so the box spans inner−1 .. outer+1
  const cE = dims.outerL / 2 - wall / 2; // |x| center for E/W
  const topZ = rp.zCenter + rp.openH / 2;

  let box: IR;
  let relief: IR | null = null;
  switch (rp.face) {
    case 'N':
      box = tr([rp.alongCenter, cN, rp.zCenter], bx([rp.openW, depth, rp.openH]));
      if (chamfer > 0) relief = chamferBar('x', [rp.alongCenter, cN, topZ], rp.openW, chamfer);
      break;
    case 'S':
      box = tr([rp.alongCenter, -cN, rp.zCenter], bx([rp.openW, depth, rp.openH]));
      if (chamfer > 0) relief = chamferBar('x', [rp.alongCenter, -cN, topZ], rp.openW, chamfer);
      break;
    case 'E':
      box = tr([cE, rp.alongCenter, rp.zCenter], bx([depth, rp.openW, rp.openH]));
      if (chamfer > 0) relief = chamferBar('y', [cE, rp.alongCenter, topZ], rp.openW, chamfer);
      break;
    case 'W':
      box = tr([-cE, rp.alongCenter, rp.zCenter], bx([depth, rp.openW, rp.openH]));
      if (chamfer > 0) relief = chamferBar('y', [-cE, rp.alongCenter, topZ], rp.openW, chamfer);
      break;
  }
  return relief ? uni([box, relief]) : box;
}
