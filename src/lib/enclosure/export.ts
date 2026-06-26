import type { Mesh } from '../types';
import type { EnclosureSpec } from './schema';
import { buildEnclosure } from './build';
import { irToMesh } from '../eval-manifold';
import { emitScad } from '../emit-scad';
import { buildSTL } from '../mesh';

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

export async function exportEnclosure(spec: EnclosureSpec): Promise<void> {
  if (spec.exports.includes('stl')) {
    const { body, lid } = await enclosureToMeshes(spec);
    triggerDownload('enclosure_body.stl', buildSTL(body), 'application/octet-stream');
    triggerDownload('enclosure_lid.stl', buildSTL(lid), 'application/octet-stream');
  }
  if (spec.exports.includes('scad')) {
    const { body, lid } = enclosureToScad(spec);
    triggerDownload('enclosure_body.scad', body, 'text/plain');
    triggerDownload('enclosure_lid.scad', lid, 'text/plain');
  }
}
