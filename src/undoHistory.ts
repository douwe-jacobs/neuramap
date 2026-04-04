import { worlds, _worldColorCache } from './worldData';
import { saveWorldToStorage } from './storage';
import { reflowNeurons } from './utils';
import type { World } from './types';

interface UndoEntry {
  clusterId: string;
  snapshot: World;
}

const MAX_HISTORY = 20;
const history: UndoEntry[] = [];
let onUndoAvailableCallback: ((available: boolean) => void) | null = null;

export function setOnUndoAvailable(cb: (available: boolean) => void) {
  onUndoAvailableCallback = cb;
}

export function pushUndo(clusterId: string) {
  const world = worlds[clusterId];
  if (!world) return;
  const snapshot: World = JSON.parse(JSON.stringify(world));
  history.push({ clusterId, snapshot });
  if (history.length > MAX_HISTORY) history.shift();
  onUndoAvailableCallback?.(true);
}

export function canUndo(): boolean {
  return history.length > 0;
}

export async function performUndo(onWorldChanged: () => void): Promise<string | null> {
  const entry = history.pop();
  if (!entry) return null;
  const { clusterId, snapshot } = entry;
  worlds[clusterId] = JSON.parse(JSON.stringify(snapshot));
  reflowNeurons(worlds[clusterId].neurons);
  Object.keys(_worldColorCache).forEach(k => delete _worldColorCache[k]);
  await saveWorldToStorage(clusterId);
  onWorldChanged();
  onUndoAvailableCallback?.(history.length > 0);
  return clusterId;
}
