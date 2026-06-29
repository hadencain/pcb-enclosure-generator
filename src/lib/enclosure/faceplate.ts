import type { IR } from '../ir';
import { bx, cy, tr, rot, uni } from '../ir';
import type { ComponentType, ComponentSize, PlacedComponent, EnclosureSpec, ComponentArray } from './schema';
import type { DerivedDims } from './derive';
import { deriveDims } from './derive';

export type Shape = 'round' | 'rect' | 'slot';
export interface CatalogEntry { label: string; shape: Shape; default: ComponentSize; }

export const COMPONENT_CATALOG: Record<ComponentType, CatalogEntry> = {
  'pot':         { label: 'Potentiometer',  shape: 'round', default: { dia: 7.0 } },
  'push-button': { label: 'Push Button',    shape: 'round', default: { dia: 12.0 } },
  'toggle':      { label: 'Toggle Switch',  shape: 'round', default: { dia: 6.5 } },
  'encoder':     { label: 'Rotary Encoder', shape: 'round', default: { dia: 7.0 } },
  'led':         { label: 'LED',            shape: 'round', default: { dia: 5.0 } },
  'slider':      { label: 'Slide Pot',      shape: 'slot',  default: { travel: 30, slotW: 2.0 } },
  'display':     { label: 'Display/Window', shape: 'rect',  default: { w: 25, h: 15 } },
};

export function resolveSize(comp: PlacedComponent): ComponentSize {
  return comp.size ?? COMPONENT_CATALOG[comp.type].default;
}

/** A cutter (lid-assembled coords) that fully pierces the lid plate at the component's position. */
export function componentHole(comp: PlacedComponent, d: DerivedDims, lidThickness: number): IR {
  const zc = d.outerH + lidThickness / 2;
  const pierce = lidThickness + 2;
  const size = resolveSize(comp);
  const shape = COMPONENT_CATALOG[comp.type].shape;

  let cutter: IR;
  if (shape === 'round') {
    const r = (size as { dia: number }).dia / 2;
    cutter = cy(pierce, r, r, 48);
  } else if (shape === 'rect') {
    const { w, h } = size as { w: number; h: number };
    cutter = rot([0, 0, comp.rotation], bx([w, h, pierce]));
  } else {
    const { travel, slotW } = size as { travel: number; slotW: number };
    const r = slotW / 2;
    cutter = rot([0, 0, comp.rotation], uni([
      bx([travel, slotW, pierce]),
      tr([travel / 2, 0, 0], cy(pierce, r, r, 24)),
      tr([-travel / 2, 0, 0], cy(pierce, r, r, 24)),
    ]));
  }
  return tr([comp.x, comp.y, zc], cutter);
}

const EDGE_MARGIN = 3;

export interface Footprint { hw: number; hh: number }

/** Axis-aligned half-extents of a component's footprint on the panel, after rotation. */
export function componentFootprint(comp: PlacedComponent): Footprint {
  const size = resolveSize(comp);
  const shape = COMPONENT_CATALOG[comp.type].shape;
  let w: number, h: number;
  if (shape === 'round') {
    const dia = (size as { dia: number }).dia;
    return { hw: dia / 2, hh: dia / 2 };
  } else if (shape === 'rect') {
    ({ w, h } = size as { w: number; h: number });
  } else {
    const { travel, slotW } = size as { travel: number; slotW: number };
    w = travel + slotW; h = slotW; // capsule bounding box
  }
  const rad = (comp.rotation * Math.PI) / 180;
  const ca = Math.abs(Math.cos(rad)), sa = Math.abs(Math.sin(rad));
  return { hw: (w * ca + h * sa) / 2, hh: (w * sa + h * ca) / 2 };
}

export type DiagnosticKind = 'overlap' | 'screw-boss' | 'off-panel';
export interface Diagnostic { componentId: string; kind: DiagnosticKind; message: string }

export function validateFaceplate(spec: EnclosureSpec): Diagnostic[] {
  const d = deriveDims(spec);
  const comps = spec.faceplate.components;
  const out: Diagnostic[] = [];
  const fps = comps.map(componentFootprint);

  // off-panel
  comps.forEach((c, i) => {
    const f = fps[i];
    if (Math.abs(c.x) + f.hw > d.outerL / 2 - EDGE_MARGIN ||
        Math.abs(c.y) + f.hh > d.outerW / 2 - EDGE_MARGIN) {
      out.push({ componentId: c.id, kind: 'off-panel', message: `${c.type} extends past the panel edge` });
    }
  });

  // screw-boss collision (only when screw closure)
  if (spec.closure.type === 'screw') {
    const bossR = spec.screw.bossDia / 2;
    // cornerR covers both the boss column and the lid countersink bore (whichever is larger).
    const cornerR = Math.max(spec.screw.bossDia, spec.screw.headDia) / 2;
    const cx = d.outerL / 2 - bossR, cy0 = d.outerW / 2 - bossR;
    const corners = [[cx, cy0], [cx, -cy0], [-cx, cy0], [-cx, -cy0]];
    comps.forEach((c, i) => {
      const f = fps[i];
      for (const [bx0, by0] of corners) {
        // AABB-vs-circle: nearest point on the footprint box to the boss center
        const nx = Math.max(c.x - f.hw, Math.min(bx0, c.x + f.hw));
        const ny = Math.max(c.y - f.hh, Math.min(by0, c.y + f.hh));
        if ((nx - bx0) ** 2 + (ny - by0) ** 2 < cornerR ** 2) {
          out.push({ componentId: c.id, kind: 'screw-boss', message: `${c.type} overlaps a corner screw boss` });
          break;
        }
      }
    });
  }

  // pairwise overlap (AABB intersection)
  for (let i = 0; i < comps.length; i++) {
    for (let j = i + 1; j < comps.length; j++) {
      const a = comps[i], b = comps[j], fa = fps[i], fb = fps[j];
      if (Math.abs(a.x - b.x) < fa.hw + fb.hw && Math.abs(a.y - b.y) < fa.hh + fb.hh) {
        out.push({ componentId: a.id, kind: 'overlap', message: `${a.type} overlaps ${b.type}` });
        out.push({ componentId: b.id, kind: 'overlap', message: `${b.type} overlaps ${a.type}` });
      }
    }
  }
  return out;
}

/** Even column/row offsets across a span (centered). Count 1 → [0]. */
function spread(count: number, span: number): number[] {
  if (count <= 1) return [0];
  const step = span / (count - 1);
  return Array.from({ length: count }, (_, i) => -span / 2 + step * i);
}

/** Member centers of an array (row-major), in lid-center coords. */
export function arrayMembers(a: ComponentArray): { x: number; y: number }[] {
  const xs = spread(a.cols, a.width);
  const ys = spread(a.rows, a.length);
  const rad = (a.rotation * Math.PI) / 180;
  const c = Math.cos(rad), s = Math.sin(rad);
  const out: { x: number; y: number }[] = [];
  for (const oy of ys) for (const ox of xs) {
    out.push({ x: a.x + ox * c - oy * s, y: a.y + ox * s + oy * c });
  }
  return out;
}

export function arrayPitch(a: ComponentArray): { col: number; row: number } {
  return {
    col: a.cols > 1 ? a.width / (a.cols - 1) : 0,
    row: a.rows > 1 ? a.length / (a.rows - 1) : 0,
  };
}
