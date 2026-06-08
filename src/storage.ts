import { supabase } from './supabase';
import { worlds, clusterMeta, GALAXY_MAPS, CLUSTER_LISTS, _worldColorCache, galaxyBasePositions, galaxyMapOffsets } from './worldData';
import { reflowNeurons } from './utils';
import type { MapDef } from './types';

const t = () => performance.now().toFixed(1);

export async function loadFromStorage(): Promise<void> {
  try {
    const t0 = performance.now();
    console.log(`[neura:db] loadFromStorage START ${t()}`);
    const { data: rows, error } = await supabase.from('neura_storage').select('key,value');
    if (error) throw error;
    console.log(`[neura:db] loadFromStorage SELECT done +${(performance.now() - t0).toFixed(0)}ms — ${rows?.length ?? 0} rows`);

    const store: Record<string, string> = {};
    for (const row of rows ?? []) store[row.key] = row.value;

    const indexRaw = store['maps:index'];
    if (!indexRaw) {
      console.log('[neura:db] loadFromStorage: no maps:index → empty canvas, done');
      return;
    }
    const index: MapDef[] = JSON.parse(indexRaw);
    console.log('[neura:db] loadFromStorage: found', index.length, 'map(s)');

    GALAXY_MAPS.length = 0;
    Object.keys(CLUSTER_LISTS).forEach(k => delete CLUSTER_LISTS[k]);

    for (const mapDef of index) {
      GALAXY_MAPS.push(mapDef);
      CLUSTER_LISTS[mapDef.id] = mapDef.clusterIds || [mapDef.rootCluster];
      for (const clusterId of (mapDef.clusterIds || [mapDef.rootCluster])) {
        const wRaw = store[`world:${clusterId}`];
        if (wRaw) {
          worlds[clusterId] = JSON.parse(wRaw);
          reflowNeurons(worlds[clusterId].neurons, true);
        }
        const mRaw = store[`meta:${clusterId}`];
        if (mRaw) clusterMeta[clusterId] = JSON.parse(mRaw);
      }
    }

    Object.keys(_worldColorCache).forEach(k => delete _worldColorCache[k]);

    Object.keys(galaxyBasePositions).forEach(k => delete galaxyBasePositions[k]);
    if (store['galaxy:base_positions']) Object.assign(galaxyBasePositions, JSON.parse(store['galaxy:base_positions']));

    Object.keys(galaxyMapOffsets).forEach(k => delete galaxyMapOffsets[k]);
    if (store['galaxy:map_offsets']) Object.assign(galaxyMapOffsets, JSON.parse(store['galaxy:map_offsets']));

    console.log(`[neura:db] loadFromStorage DONE +${(performance.now() - t0).toFixed(0)}ms total`);
  } catch (e) {
    console.warn('[neura:db] loadFromStorage ERROR', e);
  }
}

let basePosSaveTimer: ReturnType<typeof setTimeout> | null = null;
export function saveGalaxyBasePositionsToStorage(positions: Record<string, { x: number; y: number }>): void {
  console.log(`[neura:db] saveGalaxyBasePositions SCHEDULED (debounce reset) ${t()}`);
  if (basePosSaveTimer) clearTimeout(basePosSaveTimer);
  basePosSaveTimer = setTimeout(async () => {
    basePosSaveTimer = null;
    const t0 = performance.now();
    console.log(`[neura:db] saveGalaxyBasePositions UPSERT START ${t()}`);
    try {
      const { error } = await supabase.from('neura_storage').upsert(
        { key: 'galaxy:base_positions', value: JSON.stringify(positions) },
        { onConflict: 'user_id,key' }
      );
      if (error) throw error;
      console.log(`[neura:db] saveGalaxyBasePositions UPSERT DONE +${(performance.now() - t0).toFixed(0)}ms`);
    } catch (e) {
      console.error(`[neura:db] saveGalaxyBasePositions UPSERT FAILED +${(performance.now() - t0).toFixed(0)}ms`, e);
    }
  }, 1000);
}

let mapOffsetSaveTimer: ReturnType<typeof setTimeout> | null = null;
export function saveGalaxyMapOffsetsToStorage(offsets: Record<string, { x: number; y: number }>): void {
  console.log(`[neura:db] saveGalaxyMapOffsets SCHEDULED (debounce reset) ${t()}`);
  if (mapOffsetSaveTimer) clearTimeout(mapOffsetSaveTimer);
  mapOffsetSaveTimer = setTimeout(async () => {
    mapOffsetSaveTimer = null;
    const t0 = performance.now();
    console.log(`[neura:db] saveGalaxyMapOffsets UPSERT START ${t()}`);
    try {
      const { error } = await supabase.from('neura_storage').upsert(
        { key: 'galaxy:map_offsets', value: JSON.stringify(offsets) },
        { onConflict: 'user_id,key' }
      );
      if (error) throw error;
      console.log(`[neura:db] saveGalaxyMapOffsets UPSERT DONE +${(performance.now() - t0).toFixed(0)}ms`);
    } catch (e) {
      console.error(`[neura:db] saveGalaxyMapOffsets UPSERT FAILED +${(performance.now() - t0).toFixed(0)}ms`, e);
    }
  }, 1000);
}

export async function saveWorldToStorage(clusterId: string): Promise<void> {
  const t0 = performance.now();
  console.log(`[neura:db] saveWorld(${clusterId}) UPSERT START ${t()}`);
  try {
    if (worlds[clusterId]) {
      const { error } = await supabase
        .from('neura_storage')
        .upsert(
          { key: `world:${clusterId}`, value: JSON.stringify(worlds[clusterId]) },
          { onConflict: 'user_id,key' }
        );
      if (error) throw error;
      console.log(`[neura:db] saveWorld(${clusterId}) UPSERT DONE +${(performance.now() - t0).toFixed(0)}ms`);
    } else {
      console.log(`[neura:db] saveWorld(${clusterId}) skipped — world not in memory`);
    }
    Object.keys(_worldColorCache).forEach(k => delete _worldColorCache[k]);
  } catch (e) {
    console.error(`[neura:db] saveWorld(${clusterId}) FAILED +${(performance.now() - t0).toFixed(0)}ms`, e);
    throw e;
  }
}

export async function deleteMapFromStorage(mapId: string): Promise<void> {
  const t0 = performance.now();
  console.log(`[neura:db] deleteMap(${mapId}) START ${t()}`);
  try {
    const { data: indexRow } = await supabase.from('neura_storage').select('value').eq('key', 'maps:index').maybeSingle();
    console.log(`[neura:db] deleteMap SELECT index +${(performance.now() - t0).toFixed(0)}ms`);
    if (!indexRow) return;
    const index: MapDef[] = JSON.parse(indexRow.value);
    const mapDef = index.find(m => m.id === mapId);
    if (!mapDef) return;
    const clusterIds = mapDef.clusterIds || [mapDef.rootCluster];
    for (const cid of clusterIds) {
      await supabase.from('neura_storage').delete().eq('key', `world:${cid}`);
      await supabase.from('neura_storage').delete().eq('key', `meta:${cid}`);
      delete worlds[cid];
      delete clusterMeta[cid];
    }
    const newIndex = index.filter(m => m.id !== mapId);
    await supabase.from('neura_storage').upsert({ key: 'maps:index', value: JSON.stringify(newIndex) }, { onConflict: 'user_id,key' });
    const gIdx = GALAXY_MAPS.findIndex(m => m.id === mapId);
    if (gIdx >= 0) GALAXY_MAPS.splice(gIdx, 1);
    delete CLUSTER_LISTS[mapId];
    Object.keys(_worldColorCache).forEach(k => delete _worldColorCache[k]);
    console.log(`[neura:db] deleteMap(${mapId}) DONE +${(performance.now() - t0).toFixed(0)}ms total`);
  } catch (e) {
    console.error(`[neura:db] deleteMap(${mapId}) FAILED +${(performance.now() - t0).toFixed(0)}ms`, e);
    throw e;
  }
}

export async function saveMapToStorage(mapDef: MapDef, worldsData: Record<string, any>, metaData: Record<string, any>): Promise<void> {
  const t0 = performance.now();
  console.log(`[neura:db] saveMap(${mapDef.id}) START ${t()}`);
  try {
    const { data: indexRow } = await supabase.from('neura_storage').select('value').eq('key', 'maps:index').maybeSingle();
    console.log(`[neura:db] saveMap SELECT index +${(performance.now() - t0).toFixed(0)}ms`);
    const index: MapDef[] = indexRow ? JSON.parse(indexRow.value) : [];
    const existing = index.findIndex(m => m.id === mapDef.id);
    if (existing >= 0) index[existing] = mapDef; else index.push(mapDef);
    const upsert = async (key: string, value: string) => {
      const tu = performance.now();
      const { error } = await supabase.from('neura_storage').upsert({ key, value }, { onConflict: 'user_id,key' });
      console.log(`[neura:db] saveMap UPSERT ${key} +${(performance.now() - tu).toFixed(0)}ms`);
      if (error) throw error;
    };
    await upsert('maps:index', JSON.stringify(index));
    for (const clusterId of (mapDef.clusterIds || [])) {
      if (worldsData[clusterId]) await upsert(`world:${clusterId}`, JSON.stringify(worldsData[clusterId]));
      if (metaData[clusterId]) await upsert(`meta:${clusterId}`, JSON.stringify(metaData[clusterId]));
    }
    Object.assign(worlds, worldsData);
    Object.assign(clusterMeta, metaData);
    const idx = GALAXY_MAPS.findIndex(m => m.id === mapDef.id);
    if (idx >= 0) GALAXY_MAPS[idx] = mapDef;
    else GALAXY_MAPS.push(mapDef);
    CLUSTER_LISTS[mapDef.id] = mapDef.clusterIds || [];
    Object.keys(_worldColorCache).forEach(k => delete _worldColorCache[k]);
    console.log(`[neura:db] saveMap(${mapDef.id}) DONE +${(performance.now() - t0).toFixed(0)}ms total`);
  } catch (e) {
    console.error(`[neura:db] saveMap(${mapDef.id}) FAILED +${(performance.now() - t0).toFixed(0)}ms`, e);
  }
}

export async function saveGalaxyIndexToStorage(): Promise<void> {
  const t0 = performance.now();
  console.log(`[neura:db] saveGalaxyIndex UPSERT START ${t()}`);
  try {
    const { error } = await supabase
      .from('neura_storage')
      .upsert({ key: 'maps:index', value: JSON.stringify(GALAXY_MAPS) }, { onConflict: 'user_id,key' });
    if (error) throw error;
    console.log(`[neura:db] saveGalaxyIndex UPSERT DONE +${(performance.now() - t0).toFixed(0)}ms`);
  } catch (e) {
    console.error(`[neura:db] saveGalaxyIndex UPSERT FAILED +${(performance.now() - t0).toFixed(0)}ms`, e);
    throw e;
  }
}
