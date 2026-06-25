export type Vec3 = [number, number, number];

export type IR =
  | { op: 'box'; size: Vec3 }
  | { op: 'cyl'; h: number; r1: number; r2: number; fn: number }
  | { op: 'translate'; v: Vec3; child: IR }
  | { op: 'rotate'; deg: Vec3; child: IR }
  | { op: 'union'; children: IR[] }
  | { op: 'difference'; children: IR[] }
  | { op: 'intersection'; children: IR[] };

export const bx = (size: Vec3): IR => ({ op: 'box', size });
export const cy = (h: number, r1: number, r2: number, fn = 32): IR => ({ op: 'cyl', h, r1, r2, fn });
export const tr = (v: Vec3, child: IR): IR => ({ op: 'translate', v, child });
export const rot = (deg: Vec3, child: IR): IR => ({ op: 'rotate', deg, child });
export const uni = (children: IR[]): IR => ({ op: 'union', children });
export const diff = (children: IR[]): IR => ({ op: 'difference', children });
export const inter = (children: IR[]): IR => ({ op: 'intersection', children });
