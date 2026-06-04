import { useState } from 'react';
import type { BatchEntry } from '../lib/batch';
import type { TerrainParams } from '../lib/terrain';

interface Props {
  currentParams: TerrainParams;
  entries: BatchEntry[];
  onAdd:    (params: TerrainParams, qty: number) => void;
  onRemove: (id: string) => void;
}

export function BatchPanel({ currentParams, entries, onAdd, onRemove }: Props) {
  const [qty, setQty] = useState(1);
  const totalTiles = entries.reduce((s, e) => s + e.quantity, 0);

  return (
    <div className="panel" style={{ marginTop: 8 }}>
      <div className="section-label">batch queue</div>

      {entries.length === 0 && (
        <div style={{ fontSize: 10, color: 'rgba(200,200,220,0.4)', marginBottom: 8 }}>
          No tiles queued
        </div>
      )}

      {entries.map(e => (
        <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 10, flex: 1, color: 'rgba(200,200,220,0.75)' }}>
            {e.params.pieceType} · {e.params.gridSize} · {e.params.theme} × {e.quantity}
          </span>
          <button
            className="tab-btn"
            style={{ padding: '1px 6px', fontSize: 11 }}
            onClick={() => onRemove(e.id)}
          >×</button>
        </div>
      ))}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
        <input
          type="number" min={1} max={20} value={qty}
          onChange={e => setQty(Math.max(1, Math.min(20, +e.target.value)))}
          style={{
            width: 44, background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 3, color: 'inherit', padding: '2px 4px', fontSize: 11,
          }}
        />
        <button
          className="tab-btn"
          style={{ flex: 1 }}
          onClick={() => onAdd(currentParams, qty)}
        >+ Add to batch</button>
      </div>

      {totalTiles > 0 && (
        <div className="stats" style={{ marginTop: 8 }}>
          <span className="stat">{entries.length} configs</span>
          <span className="stat">·</span>
          <span className="stat">{totalTiles} tiles total</span>
        </div>
      )}
    </div>
  );
}
