import type { IR } from '../ir';
import { bx, tr } from '../ir';
import type { JointType } from './schema';

export interface RimGeometry {
  outerL: number;
  outerW: number;
  rimZ: number; // body top surface Z (= outerH)
  wall: number;
}

export interface JointGenerator {
  /** Solids to SUBTRACT from / shape into the body rim. */
  bodyFeatures(rim: RimGeometry, tol: number): IR[];
  /** Solids to UNION into the lid so it mates. */
  lidFeatures(rim: RimGeometry, tol: number): IR[];
}

// OpenLock-derived T-clip dimensions (mm), retuned for a lid lip rather than tabletop tiles.
const CHAN_D = 1.78;   // channel step depth
const WIDE_W = 8.78;   // wide flange width
const CLIP_LEN = 12.0; // clip length along the rim

/** Evenly spaced clip center positions along an edge of given length. */
function clipPositions(edgeLen: number, spacing = 20): number[] {
  const n = Math.max(1, Math.round(edgeLen / spacing));
  return Array.from({ length: n }, (_, i) => -edgeLen / 2 + (edgeLen / n) * (i + 0.5));
}

const openlock: JointGenerator = {
  bodyFeatures(rim, tol) {
    // A shallow pocket on each of the four inner rim edges that the lid clip drops into.
    const feats: IR[] = [];
    const pocketDepth = CHAN_D + tol;
    const z = rim.rimZ - pocketDepth / 2;
    const innerHalfL = rim.outerL / 2 - rim.wall / 2;
    const innerHalfW = rim.outerW / 2 - rim.wall / 2;
    for (const x of clipPositions(rim.outerL)) {
      feats.push(tr([x, innerHalfW, z], bx([WIDE_W + tol, rim.wall + 0.2, pocketDepth])));
      feats.push(tr([x, -innerHalfW, z], bx([WIDE_W + tol, rim.wall + 0.2, pocketDepth])));
    }
    for (const y of clipPositions(rim.outerW)) {
      feats.push(tr([innerHalfL, y, z], bx([rim.wall + 0.2, WIDE_W + tol, pocketDepth])));
      feats.push(tr([-innerHalfL, y, z], bx([rim.wall + 0.2, WIDE_W + tol, pocketDepth])));
    }
    return feats;
  },
  lidFeatures(rim, tol) {
    // Matching clip bosses on the lid underside that seat into the body pockets.
    const feats: IR[] = [];
    const clipH = CHAN_D - 0.1;
    const z = rim.rimZ + clipH / 2; // sits just below the lid plate (lid placed at rimZ)
    const innerHalfL = rim.outerL / 2 - rim.wall / 2;
    const innerHalfW = rim.outerW / 2 - rim.wall / 2;
    for (const x of clipPositions(rim.outerL)) {
      feats.push(tr([x, innerHalfW, z], bx([WIDE_W - 0.2 - tol, rim.wall, clipH])));
      feats.push(tr([x, -innerHalfW, z], bx([WIDE_W - 0.2 - tol, rim.wall, clipH])));
    }
    for (const y of clipPositions(rim.outerW)) {
      feats.push(tr([innerHalfL, y, z], bx([rim.wall, WIDE_W - 0.2 - tol, clipH])));
      feats.push(tr([-innerHalfL, y, z], bx([rim.wall, WIDE_W - 0.2 - tol, clipH])));
    }
    return feats;
  },
};

export function getJoint(type: JointType): JointGenerator {
  switch (type) {
    case 'openlock-clip':
      return openlock;
    case 'cantilever':
      throw new Error('cantilever joint not yet implemented');
  }
}

export { CLIP_LEN };
