import type { IR } from '../ir';
import { bx, cy, tr, uni, diff } from '../ir';
import type { EnclosureSpec } from './schema';
import { deriveDims, resolvePort, type DerivedDims } from './derive';
import { getJoint, type RimGeometry } from './joints';
import { buildPortCutter } from './ports';
import { perimeterChamfer } from './chamfer';
import { componentHole } from './faceplate';

/** Centered XY positions of the four corner screw bosses (tucked into the outer corners). */
function screwCorners(d: DerivedDims, bossR: number): [number, number][] {
  const cx = d.outerL / 2 - bossR;
  const cy0 = d.outerW / 2 - bossR;
  return [[cx, cy0], [cx, -cy0], [-cx, cy0], [-cx, -cy0]];
}

export function buildEnclosure(spec: EnclosureSpec): { body: IR; lid: IR } {
  const d = deriveDims(spec);
  const wall = spec.clearances.wall;
  const c = spec.chamfer;

  // Outer shell, base bottom at z=0.
  const shell = tr([0, 0, d.outerH / 2], bx([d.outerL, d.outerW, d.outerH]));

  // Cavity: open-topped interior. Extends slightly above outerH to open the top.
  const cavity = tr(
    [0, 0, d.floorZ + d.cavityH / 2 + 0.5],
    bx([d.innerL, d.innerW, d.cavityH + 1.0]),
  );

  // Standoff posts at the four board corners.
  const sx = spec.pcb.length / 2;
  const sy = spec.pcb.width / 2;
  const postR = spec.standoff.holeDia / 2 + 1.5;
  const postXY = [[sx, sy], [sx, -sy], [-sx, sy], [-sx, -sy]] as const;
  const posts: IR[] = postXY.map(([px, py]) =>
    tr([px, py, d.floorZ + spec.standoff.height / 2], cy(spec.standoff.height, postR, postR, 24)),
  );
  const postHoles: IR[] = postXY.map(([px, py]) =>
    tr([px, py, d.floorZ + spec.standoff.height / 2 + 0.5],
       cy(spec.standoff.height + 2, spec.standoff.holeDia / 2, spec.standoff.holeDia / 2, 16)),
  );

  // Ports (with self-supporting overhang relief on the top edge when c > 0).
  const portCuts: IR[] = spec.ports.map(p => buildPortCutter(resolvePort(spec, p, d), d, wall, c));

  // ── Closure: corner screws or rim snap ─────────────────────────────────────
  const bodyAdds: IR[] = [...posts];        // unioned AFTER the cavity cut so they survive
  const shellSubs: IR[] = [cavity, ...portCuts]; // cut from the shell before posts/bosses are added
  const bodyDrills: IR[] = [...postHoles];  // subtracted from the final body
  const lidAdds: IR[] = [];
  const lidSubs: IR[] = [];

  if (spec.closure.type === 'screw') {
    const bossR = spec.screw.bossDia / 2;
    const pilotR = spec.screw.pilotDia / 2;
    const clrR = (spec.screw.dia + 0.6) / 2;
    const headR = spec.screw.headDia / 2;
    const lidTop = d.outerH + spec.lid.thickness;
    for (const [px, py] of screwCorners(d, bossR)) {
      // Body: solid boss floor→rim, with a blind self-tapping pilot bore from the top.
      bodyAdds.push(tr([px, py, (d.floorZ + d.outerH) / 2], cy(d.outerH - d.floorZ, bossR, bossR, 24)));
      const pilotTop = d.outerH + 0.5, pilotBot = d.floorZ + 1.0;
      bodyDrills.push(tr([px, py, (pilotTop + pilotBot) / 2], cy(pilotTop - pilotBot, pilotR, pilotR, 16)));
      // Lid: through clearance hole + countersink cone (wide at the outer face).
      lidSubs.push(tr([px, py, d.outerH + spec.lid.thickness / 2], cy(spec.lid.thickness + 1, clrR, clrR, 16)));
      const coneH = Math.max(0.1, headR - clrR);
      lidSubs.push(tr([px, py, lidTop + 0.2 - coneH / 2], cy(coneH, clrR, headR, 16)));
    }
  } else {
    const rim: RimGeometry = { outerL: d.outerL, outerW: d.outerW, rimZ: d.outerH, wall };
    const joint = getJoint(spec.joint.type);
    shellSubs.push(...joint.bodyFeatures(rim, spec.joint.tolerance));
    lidAdds.push(...joint.lidFeatures(rim, spec.joint.tolerance));
  }

  // ── Body assembly ──────────────────────────────────────────────────────────
  // Posts/bosses are unioned after the cavity is cut, then holes are drilled.
  if (c > 0) {
    bodyDrills.push(...perimeterChamfer(d.outerL / 2, d.outerW / 2, d.outerH, c)); // outer top edge
    bodyDrills.push(...perimeterChamfer(d.innerL / 2, d.innerW / 2, d.outerH, c)); // cavity mouth lead-in
  }
  const body: IR = diff([
    uni([diff([shell, ...shellSubs]), ...bodyAdds]),
    ...bodyDrills,
  ]);

  // ── Lid assembly ─────────────────────────────────────────────────────────────
  // Plate sits on the rim; a shallow lip drops into the cavity as an alignment register.
  const lidPlate = tr([0, 0, d.outerH + spec.lid.thickness / 2],
    bx([d.outerL, d.outerW, spec.lid.thickness]));
  const lipL = d.innerL - 2 * spec.lid.lipInset;
  const lipW = d.innerW - 2 * spec.lid.lipInset;
  const lipBottomZ = d.outerH - spec.lid.lipDepth;
  const lip = tr([0, 0, d.outerH - spec.lid.lipDepth / 2],
    diff([
      bx([lipL, lipW, spec.lid.lipDepth]),
      bx([lipL - 2 * wall, lipW - 2 * wall, spec.lid.lipDepth + 1]),
    ]));
  lidAdds.unshift(lidPlate, lip);
  if (c > 0) {
    lidSubs.push(...perimeterChamfer(lipL / 2, lipW / 2, lipBottomZ, c));               // lip lead-in
    lidSubs.push(...perimeterChamfer(d.outerL / 2, d.outerW / 2, d.outerH + spec.lid.thickness, c)); // lid top edge
  }
  for (const comp of spec.faceplate.components) {
    lidSubs.push(componentHole(comp, d, spec.lid.thickness));
  }
  const lid: IR = lidSubs.length ? diff([uni(lidAdds), ...lidSubs]) : uni(lidAdds);

  return { body, lid };
}
