import type { IR } from '../ir';
import { bx, cy, tr, rot, uni } from '../ir';
import type { ComponentType, ComponentSize, PlacedComponent } from './schema';
import type { DerivedDims } from './derive';

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
