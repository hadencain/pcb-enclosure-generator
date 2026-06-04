/**
 * OpenLOCK-compatible dungeon tile mesh generator.
 * Uses manifold-3d (WebAssembly CSG) for watertight boolean operations.
 *
 * Coordinate convention
 *   X/Y = horizontal plane, tile centered at origin
 *   Z   = up  (base bottom at z=0, base top at z=BASE_T, wall top at z=BASE_T+wallH)
 *   "north" = +Y direction  (wall faces here by default)
 */

import type { Mesh } from './types';

// ── OpenLOCK constants ────────────────────────────────────────────────────────
export const GRID        = 25.4;   // mm per grid unit (1 inch)
export const WALL_W      = 12.7;   // mm wall thickness (0.5 inch)
export const BASE_T      = 6.0;    // mm base thickness
export const WALL_H_FULL = 50.8;   // mm full wall height
export const WALL_H_HALF = 25.4;   // mm half wall height
const PORT_SPACING       = 12.7;   // mm between port centers on edge
const SLOT_LEN           = 14.0;   // mm port slot depth into tile
const WIDE_W             = 8.78;   // mm T-slot wide channel width
const STEM_W             = 4.44;   // mm T-slot stem width
const CHAN_D             = 1.78;   // mm each T-channel step depth

// ── Public types ──────────────────────────────────────────────────────────────

export type PieceType  = 'wall_straight' | 'wall_corner' | 'wall_t' | 'wall_doorway' | 'wall_cross' | 'wall_window' | 'wall_curved' | 'column' | 'staircase' | 'floor' | 'clip';
export type GridSize   = '1x1' | '2x1' | '2x2';
export type WallHeight = 'full' | 'half';
export type Theme      = 'clean' | 'dungeon' | 'gothic' | 'cave' | 'scifi' | 'wood';

export interface TerrainParams {
  pieceType:   PieceType;
  gridSize:    GridSize;
  wallHeight:  WallHeight;
  theme:       Theme;
  tolerance:   number;   // mm added to port slot widths for fit tuning
  // dungeon / gothic
  brickScale:  number;   // 0.5–2.0  (multiplier on base brick size)
  mortarDepth: number;   // 0.3–1.5  mm depth of mortar cuts
  // cave
  stoneScale:  number;   // 0.5–2.0
  roughness:   number;   // 1–5
  // sci-fi
  panelSize:   number;   // 12–40 mm panel grid pitch
  panelDepth:  number;   // 0.3–1.0 mm groove depth
  // wood
  plankWidth:  number;   // 10–30 mm per plank
}

export const DEFAULT_TERRAIN_PARAMS: TerrainParams = {
  pieceType:   'wall_straight',
  gridSize:    '1x1',
  wallHeight:  'full',
  theme:       'clean',
  tolerance:   0.0,
  brickScale:  1.0,
  mortarDepth: 0.8,
  stoneScale:  1.0,
  roughness:   3,
  panelSize:   20,
  panelDepth:  0.5,
  plankWidth:  20,
};

// ── Manifold WASM singleton ───────────────────────────────────────────────────

type M3 = any;
let _wasm: M3 | null = null;
let _loading: Promise<M3> | null = null;

export async function loadManifold(): Promise<M3> {
  if (_wasm) return _wasm;
  if (!_loading) {
    _loading = (async () => {
      const mod = await import('manifold-3d');
      const wasm = await (mod.default as () => Promise<M3>)();
      wasm.setup();
      _wasm = wasm;
      return wasm;
    })();
  }
  return _loading;
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function buildTerrainMesh(params: TerrainParams): Promise<Mesh> {
  const wasm = await loadManifold();
  const M    = wasm.Manifold as M3;

  const [gx, gy] = parseGrid(params.gridSize);
  const wh  = params.wallHeight === 'full' ? WALL_H_FULL : WALL_H_HALF;

  let solid: M3;
  switch (params.pieceType) {
    case 'wall_straight': solid = pWallStraight(M, gx, wh, params); break;
    case 'wall_corner':   solid = pWallCorner  (M, gx, wh, params); break;
    case 'wall_t':        solid = pWallT       (M, gx, wh, params); break;
    case 'wall_doorway':  solid = pWallDoorway (M, gx, wh, params); break;
    case 'wall_cross':    solid = pWallCross   (M, gx, wh, params); break;
    case 'wall_window':   solid = pWallWindow  (M, gx, wh, params); break;
    case 'wall_curved':   solid = pWallCurved  (M, gx, wh, params); break;
    case 'column':        solid = pColumn      (M, gx, wh, params); break;
    case 'staircase':     solid = pStaircase   (M, gx, wh, params); break;
    case 'floor':         solid = pFloor       (M, gx, gy, params); break;
    case 'clip':          solid = pClip        (M, params);          break;
    default:              solid = pFloor       (M, 1, 1, params);
  }

  return manifoldToMesh(solid.getMesh());
}

// ── Wall-edge helper ──────────────────────────────────────────────────────────

/**
 * Returns the center-offset for a wall placed flush against the tile edge.
 * Wall is WALL_W wide; tile edge is at ±dim/2.
 * Center = dim/2 − WALL_W/2  (works for any dim, not just 1× tiles)
 */
function edgeCenter(dim: number): number {
  return dim / 2 - WALL_W / 2;
}

// ── Piece builders ────────────────────────────────────────────────────────────

function pWallStraight(M: M3, gx: number, wh: number, p: TerrainParams) {
  const tx = gx * GRID, ty = GRID;

  let solid = box(M, tx, ty, BASE_T).translate(0, 0, BASE_T / 2);

  // Wall flush against +Y (north) edge — extends from z=0 through base for guaranteed union
  solid = solid.add(box(M, tx, WALL_W, wh + BASE_T).translate(0, edgeCenter(ty), (wh + BASE_T) / 2));

  solid = addAllPorts(M, solid, tx, ty, p.tolerance);

  return applyTheme(M, solid, 'wall_straight', tx, ty, wh, p);
}

function pWallCorner(M: M3, gx: number, wh: number, p: TerrainParams) {
  const tx = gx * GRID, ty = GRID;

  let solid = box(M, tx, ty, BASE_T).translate(0, 0, BASE_T / 2);

  // Walls on +Y (north) and +X (east)
  solid = solid
    .add(box(M, tx,     WALL_W, wh + BASE_T).translate(0,              edgeCenter(ty), (wh + BASE_T) / 2))
    .add(box(M, WALL_W, ty,     wh + BASE_T).translate(edgeCenter(tx), 0,              (wh + BASE_T) / 2));

  solid = addAllPorts(M, solid, tx, ty, p.tolerance);

  return applyTheme(M, solid, 'wall_corner', tx, ty, wh, p);
}

function pWallT(M: M3, gx: number, wh: number, p: TerrainParams) {
  const tx = gx * GRID, ty = GRID;

  let solid = box(M, tx, ty, BASE_T).translate(0, 0, BASE_T / 2);

  // Walls on north (+Y), east (+X), west (−X) — open on south
  const ew = edgeCenter(tx);
  solid = solid
    .add(box(M, tx,     WALL_W, wh + BASE_T).translate(0,   edgeCenter(ty), (wh + BASE_T) / 2))
    .add(box(M, WALL_W, ty,     wh + BASE_T).translate( ew, 0,              (wh + BASE_T) / 2))
    .add(box(M, WALL_W, ty,     wh + BASE_T).translate(-ew, 0,              (wh + BASE_T) / 2));

  solid = addAllPorts(M, solid, tx, ty, p.tolerance);

  return applyTheme(M, solid, 'wall_t', tx, ty, wh, p);
}

function pWallDoorway(M: M3, gx: number, wh: number, p: TerrainParams) {
  const tx = gx * GRID, ty = GRID;
  const doorW = Math.min(GRID * 0.8, tx * 0.4);
  const doorH = wh * 0.72;
  const wallY = edgeCenter(ty);

  let solid = box(M, tx, ty, BASE_T).translate(0, 0, BASE_T / 2);

  // Full-width north wall (extends through base for guaranteed union)
  const northWall = box(M, tx, WALL_W, wh + BASE_T).translate(0, wallY, (wh + BASE_T) / 2);
  // Door cutout: rectangular opening, extra depth to pierce fully through wall
  const doorCut  = box(M, doorW, WALL_W + 2, doorH + BASE_T).translate(0, wallY, (doorH + BASE_T) / 2);

  solid = solid.add(northWall).subtract(doorCut);

  // Gothic: round arch cut into the wall above the door
  if (p.theme === 'gothic') {
    const archR   = doorW / 2;
    const archCyl = M.cylinder(WALL_W + 2, archR, archR, 32)
      .rotate(90, 0, 0)
      .translate(0, ty / 2 + 1, BASE_T + doorH);
    solid = solid.subtract(archCyl);
  }

  solid = addAllPorts(M, solid, tx, ty, p.tolerance);

  return applyTheme(M, solid, 'wall_doorway', tx, ty, wh, p);
}

function pFloor(M: M3, gx: number, gy: number, p: TerrainParams) {
  const tx = gx * GRID, ty = gy * GRID;

  let solid = box(M, tx, ty, BASE_T).translate(0, 0, BASE_T / 2);
  solid = addAllPorts(M, solid, tx, ty, p.tolerance);

  if (p.theme !== 'clean') {
    solid = floorTexture(M, solid, p.theme, tx, ty, p);
  }

  return solid;
}

function pWallCross(M: M3, gx: number, wh: number, p: TerrainParams) {
  const tx = gx * GRID, ty = GRID;
  let solid = box(M, tx, ty, BASE_T).translate(0, 0, BASE_T / 2);
  const ew = edgeCenter(tx), ey = edgeCenter(ty);
  solid = solid
    .add(box(M, tx,     WALL_W, wh + BASE_T).translate(0,   ey, (wh + BASE_T) / 2))
    .add(box(M, tx,     WALL_W, wh + BASE_T).translate(0,  -ey, (wh + BASE_T) / 2))
    .add(box(M, WALL_W, ty,     wh + BASE_T).translate( ew,  0, (wh + BASE_T) / 2))
    .add(box(M, WALL_W, ty,     wh + BASE_T).translate(-ew,  0, (wh + BASE_T) / 2));
  solid = addAllPorts(M, solid, tx, ty, p.tolerance);
  return applyTheme(M, solid, 'wall_cross', tx, ty, wh, p);
}

function pWallWindow(M: M3, gx: number, wh: number, p: TerrainParams) {
  const tx = gx * GRID, ty = GRID;
  const wallY = edgeCenter(ty);
  const winW  = Math.min(GRID * 0.5, tx * 0.3);
  const winH  = wh * 0.35;
  const sill  = BASE_T + wh * 0.35;

  let solid = box(M, tx, ty, BASE_T).translate(0, 0, BASE_T / 2);
  const northWall = box(M, tx, WALL_W, wh + BASE_T).translate(0, wallY, (wh + BASE_T) / 2);
  const winCut    = box(M, winW, WALL_W + 2, winH).translate(0, wallY, sill + winH / 2);
  solid = solid.add(northWall).subtract(winCut);

  if (p.theme === 'gothic') {
    const archR = winW / 2;
    const archCyl = M.cylinder(WALL_W + 2, archR, archR, 32)
      .rotate(90, 0, 0)
      .translate(0, ty / 2 + 1, sill + winH);
    solid = solid.subtract(archCyl);
  }

  solid = addAllPorts(M, solid, tx, ty, p.tolerance);
  return applyTheme(M, solid, 'wall_window', tx, ty, wh, p);
}

function pWallCurved(M: M3, gx: number, wh: number, p: TerrainParams) {
  const tx = gx * GRID, ty = GRID;
  const wallH = wh + BASE_T;

  let solid = box(M, tx, ty, BASE_T).translate(0, 0, BASE_T / 2);
  const wallMass = box(M, tx, ty, wallH).translate(0, 0, wallH / 2);
  const innerCyl = M.cylinder(wallH + 2, tx / 2, tx / 2, 64).translate(tx / 2, ty / 2, -1);
  solid = solid.add(wallMass.subtract(innerCyl));
  solid = addAllPorts(M, solid, tx, ty, p.tolerance);
  return solid;
}

function pColumn(M: M3, gx: number, wh: number, p: TerrainParams) {
  const tx = gx * GRID, ty = GRID;
  const colW = GRID * 0.35;
  let solid = box(M, tx, ty, BASE_T).translate(0, 0, BASE_T / 2);
  solid = solid.add(box(M, colW, colW, wh).translate(0, 0, BASE_T + wh / 2));
  solid = addAllPorts(M, solid, tx, ty, p.tolerance);
  return solid;
}

function pStaircase(M: M3, gx: number, wh: number, p: TerrainParams) {
  const tx = gx * GRID, ty = GRID;
  const stepD = ty / 4;
  const stepR = wh / 4;

  let solid = box(M, tx, ty, BASE_T).translate(0, 0, BASE_T / 2);
  for (let n = 0; n < 4; n++) {
    const h  = BASE_T + (n + 1) * stepR;
    const yc = -ty / 2 + n * stepD + stepD / 2;
    solid = solid.add(box(M, tx, stepD, h).translate(0, yc, h / 2));
  }
  solid = solid.add(box(M, tx, WALL_W, wh + BASE_T).translate(0, edgeCenter(ty), (wh + BASE_T) / 2));
  solid = addAllPorts(M, solid, tx, ty, p.tolerance);
  return applyTheme(M, solid, 'staircase', tx, ty, wh, p);
}

function pClip(M: M3, p: TerrainParams) {
  const tol     = p.tolerance;
  const clipLen = SLOT_LEN - 1.0;
  const flange  = box(M, WIDE_W - 0.2 + tol, clipLen, CHAN_D - 0.1)
    .translate(0, 0, (CHAN_D - 0.1) / 2);
  const stem    = box(M, STEM_W - 0.2 + tol, clipLen, CHAN_D - 0.1)
    .translate(0, 0, CHAN_D - 0.1 + (CHAN_D - 0.1) / 2);
  return flange.add(stem);
}

// ── Port helpers ──────────────────────────────────────────────────────────────

function addAllPorts(M: M3, solid: M3, tx: number, ty: number, tol: number): M3 {
  solid = cutPortsY(M, solid, tx, +ty / 2, -1, tol);
  solid = cutPortsY(M, solid, tx, -ty / 2, +1, tol);
  solid = cutPortsX(M, solid, ty, +tx / 2, -1, tol);
  solid = cutPortsX(M, solid, ty, -tx / 2, +1, tol);
  return solid;
}

function cutPortsY(M: M3, solid: M3, edgeLen: number, edgeY: number, inward: 1|-1, tol: number): M3 {
  for (const px of portPositions(edgeLen))
    solid = solid.subtract(tSlot(M, px, 0, edgeY, inward, 'y', tol));
  return solid;
}

function cutPortsX(M: M3, solid: M3, edgeLen: number, edgeX: number, inward: 1|-1, tol: number): M3 {
  for (const py of portPositions(edgeLen))
    solid = solid.subtract(tSlot(M, 0, py, edgeX, inward, 'x', tol));
  return solid;
}

function tSlot(M: M3, posA: number, posB: number, edgeCoord: number, inward: 1|-1, axis: 'x'|'y', tol: number): M3 {
  const ww = WIDE_W + tol;
  const sw = STEM_W + tol;
  const sc = edgeCoord + inward * SLOT_LEN / 2;  // slot center along perpendicular axis
  if (axis === 'y') {
    return box(M, ww, SLOT_LEN, CHAN_D).translate(posA, sc, CHAN_D / 2)
      .add(box(M, sw, SLOT_LEN, CHAN_D).translate(posA, sc, CHAN_D + CHAN_D / 2));
  } else {
    return box(M, SLOT_LEN, ww, CHAN_D).translate(sc, posB, CHAN_D / 2)
      .add(box(M, SLOT_LEN, sw, CHAN_D).translate(sc, posB, CHAN_D + CHAN_D / 2));
  }
}

// ── Theme dispatch ────────────────────────────────────────────────────────────

type WallFace = { axis: 'x' | 'y'; coord: number; width: number };

/** Returns the outward-facing wall surfaces for a given piece type. */
function wallFaces(pieceType: PieceType, tx: number, ty: number): WallFace[] {
  const N: WallFace = { axis: 'y', coord: +ty / 2, width: tx };
  const E: WallFace = { axis: 'x', coord: +tx / 2, width: ty };
  const W: WallFace = { axis: 'x', coord: -tx / 2, width: ty };
  const S: WallFace = { axis: 'y', coord: -ty / 2, width: tx };
  switch (pieceType) {
    case 'wall_straight': return [N];
    case 'wall_corner':   return [N, E];
    case 'wall_t':        return [N, E, W];
    case 'wall_doorway':  return [N];
    case 'wall_cross':    return [N, E, W, S];
    case 'wall_window':   return [N];
    case 'wall_curved':   return [];
    case 'column':        return [];
    case 'staircase':     return [N];
    case 'clip':          return [];
    default:              return [];
  }
}

function applyTheme(M: M3, solid: M3, pieceType: PieceType, tx: number, ty: number, wh: number, p: TerrainParams): M3 {
  if (p.theme === 'clean') return solid;

  const faces = wallFaces(pieceType, tx, ty);
  for (const face of faces) {
    switch (p.theme) {
      case 'dungeon':
        solid = brickCutsOnFace(M, solid, face, wh, p.brickScale, p.mortarDepth);
        break;
      case 'gothic':
        solid = brickCutsOnFace(M, solid, face, wh, p.brickScale, p.mortarDepth);
        solid = gothicArchWindowOnFace(M, solid, face, wh);
        solid = gothicCrenellationsOnFace(M, solid, face, wh);
        break;
      case 'cave':
        solid = caveCutsOnFace(M, solid, face, wh, p.stoneScale, p.roughness);
        break;
      case 'scifi':
        solid = panelCutsOnFace(M, solid, face, wh, p.panelSize, p.panelDepth);
        break;
      case 'wood':
        solid = woodCutsOnFace(M, solid, face, wh, p.plankWidth);
        break;
    }
  }
  return solid;
}

// ── Theme: dungeon / gothic bricks ────────────────────────────────────────────

function brickCutsOnFace(M: M3, solid: M3, face: WallFace, wh: number, brickScale: number, mortarDepth: number): M3 {
  const MD   = Math.max(0.3, mortarDepth);   // mortar depth (into wall)
  const MT   = 1.2 * brickScale;             // mortar line thickness (visible height)
  const RH   = 13.0 * brickScale;            // row height
  const CW   = 25.4 * brickScale;            // column width

  const numRows = Math.floor(wh / RH);
  const W = face.width;
  // How far the cutter center sits inside the face
  const inset = Math.sign(face.coord) * MD / 2;
  const fc    = face.coord - inset;

  // Horizontal mortar lines
  for (let r = 1; r < numRows; r++) {
    const z = BASE_T + r * RH;
    if (z >= BASE_T + wh) continue;
    solid = solid.subtract(
      face.axis === 'y'
        ? box(M, W + 0.2, MD, MT).translate(0,  fc, z)
        : box(M, MD, W + 0.2, MT).translate(fc, 0,  z)
    );
  }

  // Vertical mortar joints (running bond — alternating row offset)
  for (let r = 0; r < numRows; r++) {
    const rowOff = (r % 2) * (CW / 2);
    const z0 = BASE_T + r * RH + MT / 2;
    const z1 = BASE_T + (r + 1) * RH - MT / 2;
    const bh = z1 - z0;
    if (bh <= 0) continue;

    const cols = Math.ceil(W / CW) + 1;
    for (let c = -1; c <= cols; c++) {
      const pos = -W / 2 + c * CW + rowOff;
      if (pos <= -W / 2 + 1 || pos >= W / 2 - 1) continue;
      solid = solid.subtract(
        face.axis === 'y'
          ? box(M, MT, MD, bh).translate(pos, fc, z0 + bh / 2)
          : box(M, MD, MT, bh).translate(fc, pos, z0 + bh / 2)
      );
    }
  }
  return solid;
}

function gothicArchWindowOnFace(M: M3, solid: M3, face: WallFace, wh: number): M3 {
  const winW  = Math.min(face.width * 0.28, 7);
  const winH  = wh * 0.42;
  const sill  = BASE_T + wh * 0.28;
  const wallD = WALL_W + 2;
  const inset = Math.sign(face.coord) * WALL_W / 2;
  const fc    = face.coord - inset;
  const rectH = winH * 0.65;

  solid = solid.subtract(
    face.axis === 'y'
      ? box(M, winW, wallD, rectH).translate(0,  fc, sill + rectH / 2)
      : box(M, wallD, winW, rectH).translate(fc, 0,  sill + rectH / 2)
  );

  const archR  = winW / 2;
  const archZ  = sill + rectH;
  const offset = winW * 0.22;
  for (const sign of [-1, 1] as const) {
    const cyl = M.cylinder(wallD, archR, archR, 32)
      .rotate(90, 0, 0)
      .translate(
        face.axis === 'y' ? sign * offset : fc,
        face.axis === 'y' ? fc            : sign * offset,
        archZ + archR * 0.55
      );
    solid = solid.subtract(cyl);
  }
  return solid;
}

function gothicCrenellationsOnFace(M: M3, solid: M3, face: WallFace, wh: number): M3 {
  const notchW = 4.0;
  const notchH = 6.0;
  const pitch  = 10.0;
  const W      = face.width;
  const wallD  = WALL_W + 2;
  const inset  = Math.sign(face.coord) * WALL_W / 2;
  const fc     = face.coord - inset;
  const topZ   = BASE_T + wh;
  const count  = Math.floor(W / pitch);

  for (let i = 0; i < count; i++) {
    if (i % 2 === 0) continue;
    const pos = -W / 2 + (i + 0.5) * (W / count);
    solid = solid.subtract(
      face.axis === 'y'
        ? box(M, notchW, wallD, notchH).translate(pos, fc, topZ - notchH / 2)
        : box(M, wallD, notchW, notchH).translate(fc, pos, topZ - notchH / 2)
    );
  }
  return solid;
}

// ── Theme: cave ───────────────────────────────────────────────────────────────

function caveCutsOnFace(M: M3, solid: M3, face: WallFace, wh: number, stoneScale: number, roughness: number): M3 {
  const MD    = 0.9;
  const MT    = 1.8 * stoneScale;
  const PITCH = 18 * stoneScale;
  const W     = face.width;
  const inset = Math.sign(face.coord) * MD / 2;
  const fc    = face.coord - inset;
  const numSeams = Math.floor(wh / PITCH);

  // Irregular horizontal seam lines (height varies with pseudo-random noise)
  for (let s = 1; s < numSeams; s++) {
    const noise = Math.sin(s * 7.3 + face.coord) * PITCH * 0.12 * roughness * 0.4;
    const z = BASE_T + s * PITCH + noise;
    if (z < BASE_T + 2 || z >= BASE_T + wh - 2) continue;
    const seamW = MT * (1 + Math.abs(Math.sin(s * 3.1)) * 0.5);
    solid = solid.subtract(
      face.axis === 'y'
        ? box(M, W + 0.2, MD, seamW).translate(0,  fc, z)
        : box(M, MD, W + 0.2, seamW).translate(fc, 0,  z)
    );
  }

  // Irregular vertical joints per row
  for (let s = 0; s < numSeams; s++) {
    const z0  = BASE_T + s * PITCH;
    const z1  = BASE_T + (s + 1) * PITCH;
    const bh  = z1 - z0 - MT;
    if (bh <= 0) continue;

    const nj = Math.max(1, Math.round(1 + (roughness * 0.4) + Math.sin(s * 4.1) * 0.8));
    for (let j = 0; j < nj; j++) {
      const noise  = Math.sin(s * 5.1 + j * 9.3) * 0.15;
      const t      = (j + 0.5) / nj + noise;
      const pos    = W * t - W / 2;
      if (pos <= -W / 2 + 2 || pos >= W / 2 - 2) continue;
      const jw = MT * (1.2 + Math.abs(Math.sin(j * 6.7 + s)) * 0.6);
      solid = solid.subtract(
        face.axis === 'y'
          ? box(M, jw, MD, bh).translate(pos, fc, z0 + MT / 2 + bh / 2)
          : box(M, MD, jw, bh).translate(fc, pos, z0 + MT / 2 + bh / 2)
      );
    }
  }
  return solid;
}

// ── Theme: sci-fi panel lines ─────────────────────────────────────────────────

function panelCutsOnFace(M: M3, solid: M3, face: WallFace, wh: number, panelSize: number, panelDepth: number): M3 {
  const GW = 0.7;  // groove width
  const W  = face.width;
  const inset = Math.sign(face.coord) * panelDepth / 2;
  const fc    = face.coord - inset;

  // Horizontal grooves
  const nh = Math.max(1, Math.floor(wh / panelSize));
  for (let i = 1; i <= nh - 1; i++) {
    const z = BASE_T + i * (wh / nh);
    solid = solid.subtract(
      face.axis === 'y'
        ? box(M, W + 0.2, panelDepth, GW).translate(0,  fc, z)
        : box(M, panelDepth, W + 0.2, GW).translate(fc, 0,  z)
    );
  }
  // Vertical grooves
  const nv = Math.max(1, Math.floor(W / panelSize));
  for (let i = 1; i <= nv - 1; i++) {
    const pos = -W / 2 + i * (W / nv);
    solid = solid.subtract(
      face.axis === 'y'
        ? box(M, GW, panelDepth, wh).translate(pos, fc, BASE_T + wh / 2)
        : box(M, panelDepth, GW, wh).translate(fc, pos, BASE_T + wh / 2)
    );
  }
  // Tech insets at panel corners (small deeper squares)
  const insetSize = Math.min(4, panelSize * 0.15);
  for (let ih = 0; ih <= nh - 1; ih++) {
    for (let iv = 0; iv <= nv - 1; iv++) {
      const iz = BASE_T + (ih + 0.5) * (wh / nh);
      const ip = -W / 2 + (iv + 0.5) * (W / nv);
      const techD = panelDepth * 1.5;
      const insetI = Math.sign(face.coord) * techD / 2;
      solid = solid.subtract(
        face.axis === 'y'
          ? box(M, insetSize, techD, insetSize).translate(ip, face.coord - insetI, iz)
          : box(M, techD, insetSize, insetSize).translate(face.coord - insetI, ip, iz)
      );
    }
  }
  return solid;
}

// ── Theme: wood planks ────────────────────────────────────────────────────────

function woodCutsOnFace(M: M3, solid: M3, face: WallFace, wh: number, plankWidth: number): M3 {
  const GW = 0.8;
  const GD = 0.6;
  const W  = face.width;
  const inset = Math.sign(face.coord) * GD / 2;
  const fc    = face.coord - inset;

  // Vertical plank lines on walls
  const np = Math.max(1, Math.floor(W / plankWidth));
  for (let i = 1; i <= np - 1; i++) {
    const pos = -W / 2 + i * (W / np);
    solid = solid.subtract(
      face.axis === 'y'
        ? box(M, GW, GD, wh).translate(pos, fc, BASE_T + wh / 2)
        : box(M, GD, GW, wh).translate(fc, pos, BASE_T + wh / 2)
    );
  }
  // Horizontal grain lines (subtle, spaced ~15mm)
  const GRAIN_PITCH = 15;
  const ng = Math.floor(wh / GRAIN_PITCH);
  for (let i = 1; i < ng; i++) {
    const z = BASE_T + i * GRAIN_PITCH;
    solid = solid.subtract(
      face.axis === 'y'
        ? box(M, W + 0.2, GD * 0.4, GW * 0.4).translate(0,  fc, z)
        : box(M, GD * 0.4, W + 0.2, GW * 0.4).translate(fc, 0,  z)
    );
  }
  return solid;
}

// ── Floor surface textures ────────────────────────────────────────────────────

function floorTexture(M: M3, solid: M3, theme: Theme, tx: number, ty: number, p: TerrainParams): M3 {
  const D  = 0.5;   // cut depth into top face
  const fc = BASE_T - D / 2;

  switch (theme) {
    case 'dungeon':
    case 'gothic': {
      // Stone flag grid (GRID × GRID squares)
      return flagstoneLines(M, solid, tx, ty, GRID * p.brickScale, D);
    }
    case 'cave': {
      solid = flagstoneLines(M, solid, tx, ty, GRID * 1.5 * p.stoneScale, D);
      return addStalagmites(M, solid, tx, ty, p.roughness);
    }
    case 'scifi': {
      // Smaller panel grid
      return flagstoneLines(M, solid, tx, ty, p.panelSize, D * (p.panelDepth / 0.5));
    }
    case 'wood': {
      // Plank lines parallel to X axis (planks run Y direction)
      const GW = 0.7, GD = 0.4;
      const np = Math.max(1, Math.floor(tx / p.plankWidth));
      for (let i = 1; i <= np - 1; i++) {
        const x = -tx / 2 + i * (tx / np);
        solid = solid.subtract(box(M, GW, ty + 0.2, GD).translate(x, 0, fc));
      }
      return solid;
    }
    default: return solid;
  }
}

function addStalagmites(M: M3, solid: M3, tx: number, ty: number, roughness: number): M3 {
  const count = Math.round(roughness * 1.5 + 1);
  for (let i = 0; i < count; i++) {
    const nx = Math.sin(i * 7.3 + 1.1) * 0.5 + 0.5;
    const ny = Math.sin(i * 3.7 + 2.3) * 0.5 + 0.5;
    const x  = (nx - 0.5) * (tx - 8);
    const y  = (ny - 0.5) * (ty - 8);
    const h  = 3 + Math.abs(Math.sin(i * 5.1)) * 4;
    const r  = 1.0 + Math.abs(Math.sin(i * 2.3)) * 0.8;
    solid = solid.add(M.cylinder(h, r, 0, 12).translate(x, y, BASE_T + h / 2));
  }
  return solid;
}

function flagstoneLines(M: M3, solid: M3, tx: number, ty: number, pitch: number, depth: number): M3 {
  const GW = 1.0, fc = BASE_T - depth / 2;
  const ny = Math.floor(ty / pitch) - 1;
  for (let i = 1; i <= ny; i++)
    solid = solid.subtract(box(M, tx + 0.2, GW, depth).translate(0, -ty/2 + i*pitch, fc));
  const nx = Math.floor(tx / pitch) - 1;
  for (let i = 1; i <= nx; i++)
    solid = solid.subtract(box(M, GW, ty + 0.2, depth).translate(-tx/2 + i*pitch, 0, fc));
  return solid;
}

// ── Shared geometry utilities ─────────────────────────────────────────────────

/** Centered box. Manifold.cube([x,y,z], true) = cube centered at origin. */
function box(M: M3, x: number, y: number, z: number): M3 {
  return M.cube([x, y, z], true);
}

/** Port center positions along an edge of given length, centered at 0. */
function portPositions(edgeLen: number): number[] {
  const n = Math.max(1, Math.round(edgeLen / PORT_SPACING));
  return Array.from({ length: n }, (_, i) => -edgeLen / 2 + PORT_SPACING * (0.5 + i));
}

function parseGrid(g: GridSize): [number, number] {
  const parts = g.split('x').map(Number);
  return [parts[0] ?? 1, parts[1] ?? 1];
}

// ── Mesh conversion ───────────────────────────────────────────────────────────

function manifoldToMesh(mm: { numProp: number; vertProperties: Float32Array; triVerts: Uint32Array }): Mesh {
  const np   = mm.numProp;
  const verts: [number, number, number][] = [];
  const tris:  [number, number, number][] = [];
  for (let i = 0; i < mm.vertProperties.length; i += np)
    verts.push([mm.vertProperties[i]!, mm.vertProperties[i+1]!, mm.vertProperties[i+2]!]);
  for (let i = 0; i < mm.triVerts.length; i += 3)
    tris.push([mm.triVerts[i]!, mm.triVerts[i+1]!, mm.triVerts[i+2]!]);
  return { verts, tris };
}
