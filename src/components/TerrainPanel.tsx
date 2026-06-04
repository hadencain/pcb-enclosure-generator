import { useState, useEffect, useRef, useCallback } from 'react';
import type { Mesh } from '../lib/types';
import {
  buildTerrainMesh, loadManifold,
  DEFAULT_TERRAIN_PARAMS, GRID, WALL_W, BASE_T, WALL_H_FULL, WALL_H_HALF,
} from '../lib/terrain';
import type { TerrainParams, PieceType, GridSize, WallHeight, Theme } from '../lib/terrain';
import { buildSTL } from '../lib/mesh';
import { Preview3D } from './Preview3D';

const PIECE_TYPES: { id: PieceType; label: string; desc: string }[] = [
  { id: 'wall_straight', label: 'Straight',   desc: 'Wall on one edge'              },
  { id: 'wall_corner',   label: 'Corner',     desc: 'L-shaped, walls on two edges'  },
  { id: 'wall_t',        label: 'T-Junction', desc: 'Walls on three edges'          },
  { id: 'wall_doorway',  label: 'Doorway',    desc: 'Wall with centered opening'    },
  { id: 'floor',         label: 'Floor',      desc: 'Flat base tile, no walls'      },
];

const GRID_SIZES: { id: GridSize; label: string }[] = [
  { id: '1x1', label: '1×1' },
  { id: '2x1', label: '2×1' },
  { id: '2x2', label: '2×2' },
];

const WALL_HEIGHTS: { id: WallHeight; label: string; mm: number }[] = [
  { id: 'full', label: 'Full',  mm: WALL_H_FULL },
  { id: 'half', label: 'Half',  mm: WALL_H_HALF },
];

const THEMES: { id: Theme; label: string; desc: string }[] = [
  { id: 'clean',   label: 'Clean',   desc: 'No surface detail'            },
  { id: 'dungeon', label: 'Dungeon', desc: 'Running-bond brick/stone'     },
  { id: 'gothic',  label: 'Gothic',  desc: 'Brick + arched doorways'      },
  { id: 'cave',    label: 'Cave',    desc: 'Irregular rough-stone seams'  },
  { id: 'scifi',   label: 'Sci-Fi',  desc: 'Hull plating panel lines'     },
  { id: 'wood',    label: 'Wood',    desc: 'Plank grooves on walls/floor' },
];

function SliderRow({
  label, id, min, max, step, value, unit, onChange,
}: {
  label: string; id: string; min: number; max: number; step: number;
  value: number; unit: string; onChange: (v: number) => void;
}) {
  return (
    <div className="row">
      <label htmlFor={id}>{label}</label>
      <input
        type="range" id={id}
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(+e.target.value)}
      />
      <span className="val">{value.toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0)}{unit}</span>
    </div>
  );
}

export function TerrainPanel() {
  const [params,     setParams]     = useState<TerrainParams>(DEFAULT_TERRAIN_PARAMS);
  const [mesh,       setMesh]       = useState<Mesh | null>(null);
  const [status,     setStatus]     = useState<'idle' | 'loading-wasm' | 'generating' | 'ready' | 'error'>('idle');
  const [errorMsg,   setErrorMsg]   = useState('');
  const [triCount,   setTriCount]   = useState(0);
  const buildIdRef = useRef(0);

  // Load WASM eagerly on mount
  useEffect(() => {
    setStatus('loading-wasm');
    loadManifold()
      .then(() => setStatus('idle'))
      .catch(e  => { setStatus('error'); setErrorMsg(String(e)); });
  }, []);

  // Re-generate mesh on param changes (debounced 150ms)
  const generate = useCallback(async (p: TerrainParams) => {
    const id = ++buildIdRef.current;
    setStatus('generating');
    try {
      const m = await buildTerrainMesh(p);
      if (buildIdRef.current !== id) return; // stale
      setMesh(m);
      setTriCount(m.tris.length);
      setStatus('ready');
    } catch (e) {
      if (buildIdRef.current !== id) return;
      setStatus('error');
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (status === 'loading-wasm') return;
    const id = setTimeout(() => generate(params), 150);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, generate]);

  function handleChange(patch: Partial<TerrainParams>) {
    setParams(prev => ({ ...prev, ...patch }));
  }

  function handleExport() {
    if (!mesh) return;
    const buf  = buildSTL(mesh);
    const blob = new Blob([buf], { type: 'application/octet-stream' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `${params.pieceType}_${params.gridSize}_${params.wallHeight}_${params.theme}.stl`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const isFloor = params.pieceType === 'floor';
  const busy    = status === 'loading-wasm' || status === 'generating';

  return (
    <div className="app" style={{ flexDirection: 'row' }}>
      {/* ── Left control panel ── */}
      <div className="panel">
        <div className="section-label" style={{ fontSize: 13, marginBottom: 4 }}>
          OpenLOCK Terrain Generator
        </div>
        <div style={{ fontSize: 10, color: 'rgba(200,200,220,0.45)', marginBottom: 12, lineHeight: 1.5 }}>
          Grid: {GRID}mm · Wall: {WALL_W}mm wide · Base: {BASE_T}mm
        </div>

        {/* Piece type */}
        <div className="section-label">piece type</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
          {PIECE_TYPES.map(p => (
            <button
              key={p.id}
              className={`tab-btn${params.pieceType === p.id ? ' active' : ''}`}
              style={{ textAlign: 'left', justifyContent: 'flex-start', paddingLeft: 8 }}
              onClick={() => handleChange({ pieceType: p.id })}
            >
              <span style={{ minWidth: 72, display: 'inline-block' }}>{p.label}</span>
              <span style={{ fontSize: 9, opacity: 0.55 }}>{p.desc}</span>
            </button>
          ))}
        </div>

        {/* Grid size */}
        <div className="section-label">grid size</div>
        <div className="seg-buttons" style={{ marginBottom: 8 }}>
          {GRID_SIZES.map(g => (
            <button
              key={g.id}
              className={`tab-btn${params.gridSize === g.id ? ' active' : ''}`}
              onClick={() => handleChange({ gridSize: g.id })}
            >{g.label}</button>
          ))}
        </div>

        {/* Wall height */}
        {!isFloor && <>
          <div className="section-label">wall height</div>
          <div className="seg-buttons" style={{ marginBottom: 8 }}>
            {WALL_HEIGHTS.map(h => (
              <button
                key={h.id}
                className={`tab-btn${params.wallHeight === h.id ? ' active' : ''}`}
                onClick={() => handleChange({ wallHeight: h.id })}
              >{h.label} — {h.mm}mm</button>
            ))}
          </div>
        </>}

        {/* Theme */}
        <div className="section-label">theme</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 8 }}>
          {THEMES.map(t => (
            <button
              key={t.id}
              className={`tab-btn${params.theme === t.id ? ' active' : ''}`}
              onClick={() => handleChange({ theme: t.id })}
              title={t.desc}
            >{t.label}</button>
          ))}
        </div>
        {params.theme !== 'clean' && (
          <div style={{ fontSize: 10, color: 'rgba(200,200,220,0.45)', marginBottom: 6 }}>
            {THEMES.find(t => t.id === params.theme)?.desc}
          </div>
        )}

        {/* Per-theme parameters */}
        {(params.theme === 'dungeon' || params.theme === 'gothic') && <>
          <div className="section-label">brick detail</div>
          <SliderRow
            label="Brick Scale" id="brickScale"
            min={0.5} max={2.0} step={0.1}
            value={params.brickScale} unit="×"
            onChange={v => handleChange({ brickScale: v })}
          />
          <SliderRow
            label="Mortar Depth" id="mortarDepth"
            min={0.3} max={1.5} step={0.1}
            value={params.mortarDepth} unit="mm"
            onChange={v => handleChange({ mortarDepth: v })}
          />
        </>}

        {params.theme === 'cave' && <>
          <div className="section-label">stone detail</div>
          <SliderRow
            label="Stone Scale" id="stoneScale"
            min={0.5} max={2.0} step={0.1}
            value={params.stoneScale} unit="×"
            onChange={v => handleChange({ stoneScale: v })}
          />
          <SliderRow
            label="Roughness" id="roughness"
            min={1} max={5} step={1}
            value={params.roughness} unit=""
            onChange={v => handleChange({ roughness: v })}
          />
        </>}

        {params.theme === 'scifi' && <>
          <div className="section-label">panel detail</div>
          <SliderRow
            label="Panel Size" id="panelSize"
            min={12} max={40} step={2}
            value={params.panelSize} unit="mm"
            onChange={v => handleChange({ panelSize: v })}
          />
          <SliderRow
            label="Panel Depth" id="panelDepth"
            min={0.3} max={1.0} step={0.1}
            value={params.panelDepth} unit="mm"
            onChange={v => handleChange({ panelDepth: v })}
          />
        </>}

        {params.theme === 'wood' && <>
          <div className="section-label">plank detail</div>
          <SliderRow
            label="Plank Width" id="plankWidth"
            min={10} max={30} step={2}
            value={params.plankWidth} unit="mm"
            onChange={v => handleChange({ plankWidth: v })}
          />
        </>}

        {/* Port tolerance */}
        <div className="section-label">port tolerance</div>
        <div className="row">
          <label htmlFor="tol">Tolerance</label>
          <input
            type="range" id="tol"
            min={-0.2} max={0.3} step={0.05}
            value={params.tolerance}
            onChange={e => handleChange({ tolerance: +e.target.value })}
          />
          <span className="val">
            {params.tolerance >= 0 ? '+' : ''}{params.tolerance.toFixed(2)}mm
          </span>
        </div>
        <div style={{ fontSize: 10, color: 'rgba(200,200,220,0.4)', marginBottom: 12 }}>
          Print and test-fit a tile first. Increase if clips are too tight.
        </div>

        {/* Status / export */}
        {status === 'loading-wasm' && (
          <div style={{ fontSize: 11, color: 'rgba(200,200,220,0.5)', marginBottom: 8 }}>
            Loading geometry engine…
          </div>
        )}
        {status === 'generating' && (
          <div style={{ fontSize: 11, color: 'rgba(200,200,220,0.5)', marginBottom: 8 }}>
            Building mesh…
          </div>
        )}
        {status === 'error' && (
          <div style={{ padding: '6px 10px', background: 'rgba(220,60,60,0.15)',
                        border: '1px solid rgba(220,60,60,0.4)', borderRadius: 4,
                        fontSize: 11, color: '#f87171', marginBottom: 8 }}>
            {errorMsg}
          </div>
        )}

        <button
          className="export-btn"
          onClick={handleExport}
          disabled={!mesh || busy}
        >
          Export STL
        </button>

        {triCount > 0 && (
          <div className="stats" style={{ marginTop: 8 }}>
            <span className="stat">{triCount.toLocaleString()} tris</span>
            <span className="stat">·</span>
            <span className="stat">manifold</span>
          </div>
        )}
      </div>

      {/* ── Right 3D preview ── */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        <Preview3D mesh={mesh} defaultTheta={0.7} defaultPhi={-0.9} />
      </div>
    </div>
  );
}
