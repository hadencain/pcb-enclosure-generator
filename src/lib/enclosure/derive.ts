import type { EnclosureSpec, Port, Face } from './schema';
import { PORT_CATALOG } from './ports';

export interface DerivedDims {
  outerL: number; outerW: number; outerH: number;
  innerL: number; innerW: number; cavityH: number;
  floorZ: number; boardTopZ: number;
}

export function deriveDims(spec: EnclosureSpec): DerivedDims {
  const { pcb, clearances: c, standoff } = spec;
  const innerL = pcb.length + 2 * c.pcbGap;
  const innerW = pcb.width + 2 * c.pcbGap;
  const outerL = innerL + 2 * c.wall;
  const outerW = innerW + 2 * c.wall;
  const maxCompH = spec.keepouts.reduce((m, k) => Math.max(m, k.z + k.h), 0);
  const cavityH = standoff.height + pcb.height + maxCompH + c.ceiling;
  const outerH = c.floor + cavityH;
  const floorZ = c.floor;
  const boardTopZ = c.floor + standoff.height + pcb.height;
  return { outerL, outerW, outerH, innerL, innerW, cavityH, floorZ, boardTopZ };
}

export interface ResolvedPort {
  face: Face;
  alongCenter: number; // centered-space coordinate along the face tangent axis
  zCenter: number;     // centered-space Z
  openW: number;       // opening width along the face
  openH: number;       // opening height (Z)
}

export function resolvePort(spec: EnclosureSpec, port: Port, dims: DerivedDims): ResolvedPort {
  const k = spec.keepouts.find(ko => ko.label === port.anchor);
  if (!k) throw new Error(`port anchor '${port.anchor}' matches no keepout`);

  const alongIsX = port.face === 'N' || port.face === 'S';
  const alongCenter = alongIsX
    ? (k.x + k.w / 2) - spec.pcb.length / 2
    : (k.y + k.d / 2) - spec.pcb.width / 2;

  const zCenter = dims.boardTopZ + k.z + k.h / 2;

  // Opening size: catalog if a known connector, else the keepout cross-section facing the wall.
  const cat = PORT_CATALOG[port.type];
  let baseW: number, baseH: number;
  if (cat) {
    baseW = cat.w; baseH = cat.h;
  } else if (port.type === 'circle') {
    baseW = port.size?.w ?? k.w; baseH = baseW;
  } else { // 'rect'
    baseW = port.size?.w ?? (alongIsX ? k.w : k.d);
    baseH = port.size?.h ?? k.h;
  }
  return {
    face: port.face,
    alongCenter,
    zCenter,
    openW: baseW + 2 * port.margin,
    openH: baseH + 2 * port.margin,
  };
}
