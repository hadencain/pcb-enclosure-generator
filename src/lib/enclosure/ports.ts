import type { IR } from '../ir';
import { bx, tr } from '../ir';
import type { ResolvedPort, DerivedDims } from './derive';

export const PORT_CATALOG: Record<string, { w: number; h: number } | undefined> = {
  'usb-c': { w: 9, h: 3.2 },
  'usb-a': { w: 13, h: 6 },
  'micro-usb': { w: 8, h: 3 },
  'barrel': { w: 8, h: 8 },
  'rect': undefined,
  'circle': undefined,
};

/** A box that pierces the wall on the port's face, sized to the opening. */
export function buildPortCutter(rp: ResolvedPort, dims: DerivedDims, wall: number): IR {
  const pierce = wall + 1.0; // ensure clean through-cut
  const halfL = dims.outerL / 2;
  const halfW = dims.outerW / 2;

  switch (rp.face) {
    case 'N': return tr([rp.alongCenter, halfW, rp.zCenter], bx([rp.openW, pierce, rp.openH]));
    case 'S': return tr([rp.alongCenter, -halfW, rp.zCenter], bx([rp.openW, pierce, rp.openH]));
    case 'E': return tr([halfL, rp.alongCenter, rp.zCenter], bx([pierce, rp.openW, rp.openH]));
    case 'W': return tr([-halfL, rp.alongCenter, rp.zCenter], bx([pierce, rp.openW, rp.openH]));
  }
}
