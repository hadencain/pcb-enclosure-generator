import type { Mesh } from '../types';
import type { IR } from '../ir';
import { rot, tr } from '../ir';
import type { EnclosureSpec } from './schema';
import { buildEnclosure } from './build';
import { deriveDims } from './derive';
import { irToMesh } from '../eval-manifold';
import { emitScad } from '../emit-scad';
import { buildSTL } from '../mesh';

/**
 * Re-orient the parts for printing: the body is already floor-down, but the lid
 * is modeled in its assembled (lid-on) position. Flip it 180° about X and drop
 * it so it rests plate-down on the bed (z ≥ 0) with the lip/bosses pointing up —
 * slicer-ready without manual reorienting.
 */
export function printLayout(spec: EnclosureSpec, parts: { body: IR; lid: IR }): { body: IR; lid: IR } {
  const d = deriveDims(spec);
  const lidTopZ = d.outerH + spec.lid.thickness;
  return { body: parts.body, lid: tr([0, 0, lidTopZ], rot([180, 0, 0], parts.lid)) };
}

export function enclosureToScad(spec: EnclosureSpec): { body: string; lid: string } {
  const { body, lid } = buildEnclosure(spec);
  return { body: emitScad(body), lid: emitScad(lid) };
}

export async function enclosureToMeshes(spec: EnclosureSpec): Promise<{ body: Mesh; lid: Mesh }> {
  const { body, lid } = buildEnclosure(spec);
  return { body: await irToMesh(body), lid: await irToMesh(lid) };
}

export function triggerDownload(filename: string, data: BlobPart, mime: string): void {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type ExportWhich = 'both' | 'body' | 'lid';

export async function exportEnclosure(spec: EnclosureSpec, which: ExportWhich = 'both'): Promise<void> {
  // Build the IR once, lay it out flat for printing, then derive mesh and scad.
  const ir = printLayout(spec, buildEnclosure(spec));
  const wantBody = which === 'both' || which === 'body';
  const wantLid = which === 'both' || which === 'lid';

  if (spec.exports.includes('stl')) {
    if (wantBody) triggerDownload('enclosure_body.stl', buildSTL(await irToMesh(ir.body)), 'application/octet-stream');
    if (wantLid) triggerDownload('enclosure_lid.stl', buildSTL(await irToMesh(ir.lid)), 'application/octet-stream');
  }
  if (spec.exports.includes('scad')) {
    if (wantBody) triggerDownload('enclosure_body.scad', emitScad(ir.body), 'text/plain');
    if (wantLid) triggerDownload('enclosure_lid.scad', emitScad(ir.lid), 'text/plain');
  }
}
