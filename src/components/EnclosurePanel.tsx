import { useState, useEffect, useRef } from 'react';
import { Preview3D } from './Preview3D';
import { FaceplatePanel } from './FaceplatePanel';
import { NumberField, Seg } from './Field';
import { DEFAULT_SPEC, type EnclosureSpec } from '../lib/enclosure/schema';
import { enclosureToMeshes, exportEnclosure } from '../lib/enclosure/export';
import { deriveDims } from '../lib/enclosure/derive';
import type { Mesh } from '../lib/types';

const REBUILD_DELAY = 180; // ms after the last change before the model recomputes
const PLA_DENSITY = 1.24;  // g/cm³, for the material estimate

/** Real solid volume (signed-tetrahedron sum) and bounding box of a triangle mesh. */
function meshStats(m: Mesh): { vol: number; dims: [number, number, number]; tris: number } {
  let vol = 0;
  for (const [a, b, c] of m.tris) {
    const p = m.verts[a], q = m.verts[b], r = m.verts[c];
    vol += p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0]);
  }
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const v of m.verts) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], v[i]); mx[i] = Math.max(mx[i], v[i]); }
  return { vol: Math.abs(vol) / 6, dims: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]], tris: m.tris.length };
}

export function EnclosurePanel() {
  const [spec, setSpec] = useState<EnclosureSpec>(DEFAULT_SPEC);
  const [parts, setParts] = useState<{ body: Mesh; lid: Mesh } | null>(null);
  const [view, setView] = useState<'body' | 'lid'>('body');
  const [building, setBuilding] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reqRef = useRef(0);

  const d = deriveDims(spec);

  // Live rebuild: debounce the change, then recompute — guarded by a request id
  // so a slower in-flight build can never overwrite the result of a newer one.
  useEffect(() => {
    const id = ++reqRef.current;
    setBuilding(true);
    const t = setTimeout(async () => {
      try {
        const next = await enclosureToMeshes(spec);
        if (reqRef.current === id) { setParts(next); setErr(null); }
      } catch (e) {
        if (reqRef.current === id) setErr(String(e));
      } finally {
        if (reqRef.current === id) setBuilding(false);
      }
    }, REBUILD_DELAY);
    return () => clearTimeout(t);
  }, [spec]);

  const patchPcb = (k: keyof EnclosureSpec['pcb'], v: number) =>
    setSpec(s => ({ ...s, pcb: { ...s.pcb, [k]: v } }));
  const patchClear = (k: keyof EnclosureSpec['clearances'], v: number) =>
    setSpec(s => ({ ...s, clearances: { ...s.clearances, [k]: v } }));

  async function handleExport() {
    setExporting(true); setErr(null);
    try { await exportEnclosure(spec); }
    catch (e) { setErr(String(e)); }
    finally { setExporting(false); }
  }

  const shown = parts ? parts[view] : null;

  return (
    <div className="ws">
      <header className="topbar">
        <div className="brand"><span className="mk">ENCLOSURE</span><span className="dot">/</span>WORKSTATION</div>
        <span className="spec">
          pcb {spec.pcb.length}×{spec.pcb.width} · box {d.outerL.toFixed(0)}×{d.outerW.toFixed(0)}×{d.outerH.toFixed(0)}mm
        </span>
        <span className="grow" />
        <span className={building ? 'live on' : 'live'}><span className="dot" />{building ? 'rebuilding' : 'up to date'}</span>
        <button className="btn primary" onClick={handleExport} disabled={exporting || building}>{exporting ? 'Exporting…' : 'Export STL / SCAD'}</button>
      </header>

      <div className="stage">
        <aside className="rail">
          <section className="sec">
            <div className="sec-h">PCB</div>
            <NumberField label="length" value={spec.pcb.length} onChange={v => patchPcb('length', v)} />
            <NumberField label="width" value={spec.pcb.width} onChange={v => patchPcb('width', v)} />
            <NumberField label="board thickness" value={spec.pcb.height} onChange={v => patchPcb('height', v)} />
          </section>

          <section className="sec">
            <div className="sec-h">Enclosure</div>
            <NumberField label="wall" value={spec.clearances.wall} onChange={v => patchClear('wall', v)} />
            <NumberField label="floor" value={spec.clearances.floor} onChange={v => patchClear('floor', v)} />
            <NumberField label="ceiling" value={spec.clearances.ceiling} onChange={v => patchClear('ceiling', v)} />
            <NumberField label="pcb gap" value={spec.clearances.pcbGap} onChange={v => patchClear('pcbGap', v)} />
          </section>

          <section className="sec">
            <div className="sec-h">Closure</div>
            <div style={{ marginBottom: 9 }}>
              <Seg
                value={spec.closure.type}
                options={[{ value: 'screw', label: 'Screw bosses' }, { value: 'snap', label: 'Snap rim' }]}
                onChange={t => setSpec(s => ({ ...s, closure: { type: t } }))}
              />
            </div>
            {spec.closure.type === 'screw'
              ? <NumberField label="screw Ø" value={spec.screw.dia} onChange={v => setSpec(s => ({ ...s, screw: { ...s.screw, dia: v } }))} />
              : <Seg
                  value={spec.joint.type}
                  options={[{ value: 'openlock-clip', label: 'OpenLock' }, { value: 'cantilever', label: 'Cantilever' }]}
                  onChange={t => setSpec(s => ({ ...s, joint: { ...s.joint, type: t } }))}
                />}
          </section>

          <section className="sec">
            <div className="sec-h">Fit</div>
            <NumberField label="tolerance" value={spec.tolerance}
              onChange={v => setSpec(s => ({ ...s, tolerance: v, joint: { ...s.joint, tolerance: v } }))} />
            <NumberField label="chamfer" value={spec.chamfer} onChange={v => setSpec(s => ({ ...s, chamfer: v }))} />
          </section>
        </aside>

        <main className="center">
          <FaceplatePanel spec={spec} onChange={setSpec} />
        </main>

        <aside className="preview-col">
          <div className="pv-h">
            <span className="lbl">Solid preview</span>
            <div className="pv-seg">
              <button className={view === 'body' ? 'on' : ''} onClick={() => setView('body')}>Body</button>
              <button className={view === 'lid' ? 'on' : ''} onClick={() => setView('lid')}>Lid</button>
            </div>
            <span className="grow" />
            <span className={building ? 'live on' : 'live'}><span className="dot" /></span>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Preview3D mesh={shown} />
            {!shown && <span className="stat" style={{ textAlign: 'center', paddingBottom: 10 }}>building…</span>}
          </div>
          {parts && (() => {
            const b = meshStats(parts.body), l = meshStats(parts.lid);
            const cm = (v: number) => (v / 1000).toFixed(1);
            const g = (v: number) => (v / 1000 * PLA_DENSITY).toFixed(0);
            const dim = (s: { dims: [number, number, number] }) => s.dims.map(x => x.toFixed(0)).join('×');
            return (
              <div className="readout">
                <div className="rh">Print readout</div>
                <div className="rrow"><span className="rk">body</span><span className="rv">{dim(b)}<span className="u"> mm</span> · {cm(b.vol)}<span className="u"> cm³</span> · ~{g(b.vol)}<span className="u"> g</span></span></div>
                <div className="rrow"><span className="rk">lid</span><span className="rv">{dim(l)}<span className="u"> mm</span> · {cm(l.vol)}<span className="u"> cm³</span> · ~{g(l.vol)}<span className="u"> g</span></span></div>
                <div className="rrow tot"><span className="rk">total</span><span className="rv">{cm(b.vol + l.vol)}<span className="u"> cm³</span> · ~{g(b.vol + l.vol)}<span className="u"> g PLA</span></span></div>
                <div className="rrow"><span className="rk">mesh</span><span className="rv" style={{ color: 'var(--ink-dim)' }}>{((b.tris + l.tris) / 1000).toFixed(1)}k tris</span></div>
              </div>
            );
          })()}
          {err && <div className="pv-err">{err}</div>}
          <div className="pv-actions">
            <button className="btn primary" onClick={handleExport} disabled={exporting || building}>{exporting ? 'Exporting…' : 'Export STL / SCAD'}</button>
          </div>
        </aside>
      </div>
    </div>
  );
}
