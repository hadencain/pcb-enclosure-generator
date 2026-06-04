import type { TerrainParams } from './terrain';

export interface BatchEntry {
  id: string;
  params: TerrainParams;
  quantity: number;
}
