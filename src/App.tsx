import { useState } from 'react';
import { TerrainPanel } from './components/TerrainPanel';
import { BatchPanel } from './components/BatchPanel';
import type { BatchEntry } from './lib/batch';
import { DEFAULT_TERRAIN_PARAMS } from './lib/terrain';
import type { TerrainParams } from './lib/terrain';

export function App() {
  const [currentParams, setCurrentParams] = useState<TerrainParams>(DEFAULT_TERRAIN_PARAMS);
  const [entries, setEntries] = useState<BatchEntry[]>([]);

  function handleAdd(params: TerrainParams, qty: number) {
    setEntries(prev => [...prev, { id: crypto.randomUUID(), params, quantity: qty }]);
  }

  function handleRemove(id: string) {
    setEntries(prev => prev.filter(e => e.id !== id));
  }

  return (
    <TerrainPanel
      onParamsChange={setCurrentParams}
      batchSlot={
        <BatchPanel
          currentParams={currentParams}
          entries={entries}
          onAdd={handleAdd}
          onRemove={handleRemove}
        />
      }
    />
  );
}
