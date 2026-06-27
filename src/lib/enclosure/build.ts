import type { IR } from '../ir';
import { bx, cy, tr, uni, diff } from '../ir';
import type { EnclosureSpec } from './schema';
import { deriveDims, resolvePort } from './derive';
import { getJoint, type RimGeometry } from './joints';
import { buildPortCutter } from './ports';

export function buildEnclosure(spec: EnclosureSpec): { body: IR; lid: IR } {
  const d = deriveDims(spec);
  const wall = spec.clearances.wall;

  // Outer shell, base bottom at z=0.
  const shell = tr([0, 0, d.outerH / 2], bx([d.outerL, d.outerW, d.outerH]));

  // Cavity: open-topped interior. Extends slightly above outerH to open the top.
  const cavity = tr(
    [0, 0, d.floorZ + d.cavityH / 2 + 0.5],
    bx([d.innerL, d.innerW, d.cavityH + 1.0]),
  );

  // Standoff posts at the four board corners (board corner inset by pcbGap from cavity wall).
  const sx = spec.pcb.length / 2;
  const sy = spec.pcb.width / 2;
  const postR = spec.standoff.holeDia / 2 + 1.5;
  const posts: IR[] = ([[sx, sy], [sx, -sy], [-sx, sy], [-sx, -sy]] as const).map(([px, py]) =>
    tr([px, py, d.floorZ + spec.standoff.height / 2], cy(spec.standoff.height, postR, postR, 24)),
  );
  const postHoles: IR[] = ([[sx, sy], [sx, -sy], [-sx, sy], [-sx, -sy]] as const).map(([px, py]) =>
    tr([px, py, d.floorZ + spec.standoff.height / 2 + 0.5],
       cy(spec.standoff.height + 2, spec.standoff.holeDia / 2, spec.standoff.holeDia / 2, 16)),
  );

  // Ports.
  const portCuts: IR[] = spec.ports.map(p => buildPortCutter(resolvePort(spec, p, d), d, wall));

  // Joint.
  const rim: RimGeometry = { outerL: d.outerL, outerW: d.outerW, rimZ: d.outerH, wall };
  const joint = getJoint(spec.joint.type);
  const jointPockets = joint.bodyFeatures(rim, spec.joint.tolerance);
  const jointClips = joint.lidFeatures(rim, spec.joint.tolerance);

  // Body = (shell − cavity − ports − jointPockets) + posts, then drill postHoles.
  // Posts are added AFTER the cavity subtraction so they survive the interior cut.
  const body: IR = diff([
    uni([
      diff([shell, cavity, ...portCuts, ...jointPockets]),
      ...posts,
    ]),
    ...postHoles,
  ]);

  // Lid = plate (sits on rim) + lip (drops into cavity) + clips, lipInset back from outer wall.
  const lidPlate = tr([0, 0, d.outerH + spec.lid.thickness / 2],
    bx([d.outerL, d.outerW, spec.lid.thickness]));
  const lipL = d.innerL - 2 * spec.lid.lipInset;
  const lipW = d.innerW - 2 * spec.lid.lipInset;
  const lip = tr([0, 0, d.outerH - spec.lid.lipDepth / 2],
    diff([
      bx([lipL, lipW, spec.lid.lipDepth]),
      bx([lipL - 2 * wall, lipW - 2 * wall, spec.lid.lipDepth + 1]),
    ]));
  const lid: IR = uni([lidPlate, lip, ...jointClips]);

  return { body, lid };
}
