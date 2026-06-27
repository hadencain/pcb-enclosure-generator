import { useState } from 'react';
import { Preview3D } from './Preview3D';
import { DEFAULT_SPEC, type EnclosureSpec } from '../lib/enclosure/schema';
import { enclosureToMeshes, exportEnclosure } from '../lib/enclosure/export';
import type { Mesh } from '../lib/types';

export function EnclosurePanel() {
  const [spec, setSpec] = useState<EnclosureSpec>(DEFAULT_SPEC);
  const [mesh, setMesh] = useState<Mesh | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function patchPcb(key: keyof EnclosureSpec['pcb'], v: number) {
    setSpec(s => ({ ...s, pcb: { ...s.pcb, [key]: v } }));
  }
  function patchClear(key: keyof EnclosureSpec['clearances'], v: number) {
    setSpec(s => ({ ...s, clearances: { ...s.clearances, [key]: v } }));
  }

  async function generate() {
    setBusy(true); setErr(null);
    try {
      const { body } = await enclosureToMeshes(spec);
      setMesh(body);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleExport() {
    setBusy(true); setErr(null);
    try {
      await exportEnclosure(spec);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  const num = (label: string, value: number, on: (v: number) => void) => (
    <label style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span>{label}</span>
      <input type="number" value={value} step="0.1"
        onChange={e => on(parseFloat(e.target.value) || 0)} style={{ width: 80 }} />
    </label>
  );

  return (
    <div style={{ display: 'flex', gap: 24, padding: 16, fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 240 }}>
        <h3>PCB (mm)</h3>
        {num('length', spec.pcb.length, v => patchPcb('length', v))}
        {num('width', spec.pcb.width, v => patchPcb('width', v))}
        {num('board thickness', spec.pcb.height, v => patchPcb('height', v))}
        <h3>Clearances (mm)</h3>
        {num('wall', spec.clearances.wall, v => patchClear('wall', v))}
        {num('floor', spec.clearances.floor, v => patchClear('floor', v))}
        {num('ceiling', spec.clearances.ceiling, v => patchClear('ceiling', v))}
        {num('pcb gap', spec.clearances.pcbGap, v => patchClear('pcbGap', v))}
        <h3>Fit</h3>
        {num('tolerance', spec.tolerance, v => setSpec(s => ({ ...s, tolerance: v, joint: { ...s.joint, tolerance: v } })))}
        <label>joint:&nbsp;
          <select value={spec.joint.type}
            onChange={e => setSpec(s => ({ ...s, joint: { ...s.joint, type: e.target.value as EnclosureSpec['joint']['type'] } }))}>
            <option value="openlock-clip">openlock-clip</option>
            <option value="cantilever">cantilever (Phase B)</option>
          </select>
        </label>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={generate} disabled={busy}>{busy ? 'Generating…' : 'Generate'}</button>
          <button onClick={handleExport} disabled={busy}>Export</button>
        </div>
        {err && <p style={{ color: 'crimson', maxWidth: 240 }}>{err}</p>}
      </div>
      <Preview3D mesh={mesh} />
    </div>
  );
}
