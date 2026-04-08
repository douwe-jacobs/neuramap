import { supabase } from './supabase';
import { worlds, clusterMeta, GALAXY_MAPS, CLUSTER_LISTS, _worldColorCache } from './worldData';
import type { MapDef } from './types';


export async function loadFromStorage(): Promise<void> {
  try {
    const { data: indexRow } = await supabase.from('neura_storage').select('value').eq('key', 'maps:index').maybeSingle();
    if (!indexRow) {
      return; // New user — start with an empty canvas
    }
    const index: MapDef[] = JSON.parse(indexRow.value);
    GALAXY_MAPS.length = 0;
    Object.keys(CLUSTER_LISTS).forEach(k => delete CLUSTER_LISTS[k]);

    const allClusterIds: string[] = [];
    for (const mapDef of index) {
      GALAXY_MAPS.push({ id: mapDef.id, label: mapDef.label, rootCluster: mapDef.rootCluster });
      CLUSTER_LISTS[mapDef.id] = mapDef.clusterIds || [mapDef.rootCluster];
      for (const clusterId of (mapDef.clusterIds || [mapDef.rootCluster])) {
        const { data: wRow } = await supabase.from('neura_storage').select('value').eq('key', `world:${clusterId}`).maybeSingle();
        if (wRow) worlds[clusterId] = JSON.parse(wRow.value);
        const { data: mRow } = await supabase.from('neura_storage').select('value').eq('key', `meta:${clusterId}`).maybeSingle();
        if (mRow) clusterMeta[clusterId] = JSON.parse(mRow.value);
        allClusterIds.push(clusterId);
      }
    }

    Object.keys(_worldColorCache).forEach(k => delete _worldColorCache[k]);
  } catch (e) {
    console.warn('Storage load failed:', e);
  }
}

export async function saveWorldToStorage(clusterId: string): Promise<void> {
  try {
    if (worlds[clusterId]) {
      const { error } = await supabase
        .from('neura_storage')
        .upsert(
          { key: `world:${clusterId}`, value: JSON.stringify(worlds[clusterId]) },
          { onConflict: 'key' }
        );
      if (error) throw error;
    }
    Object.keys(_worldColorCache).forEach(k => delete _worldColorCache[k]);
  } catch (e) {
    console.error('saveWorldToStorage failed:', e);
    throw e;
  }
}

export async function deleteMapFromStorage(mapId: string): Promise<void> {
  try {
    const { data: indexRow } = await supabase.from('neura_storage').select('value').eq('key', 'maps:index').maybeSingle();
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
    await supabase.from('neura_storage').upsert({ key: 'maps:index', value: JSON.stringify(newIndex) }, { onConflict: 'key' });
    const gIdx = GALAXY_MAPS.findIndex(m => m.id === mapId);
    if (gIdx >= 0) GALAXY_MAPS.splice(gIdx, 1);
    delete CLUSTER_LISTS[mapId];
    Object.keys(_worldColorCache).forEach(k => delete _worldColorCache[k]);
  } catch (e) {
    console.error('deleteMapFromStorage failed:', e);
    throw e;
  }
}

export async function saveMapToStorage(mapDef: MapDef, worldsData: Record<string, any>, metaData: Record<string, any>): Promise<void> {
  try {
    const { data: indexRow } = await supabase.from('neura_storage').select('value').eq('key', 'maps:index').maybeSingle();
    const index: MapDef[] = indexRow ? JSON.parse(indexRow.value) : [];
    const existing = index.findIndex(m => m.id === mapDef.id);
    if (existing >= 0) index[existing] = mapDef; else index.push(mapDef);
    const upsert = async (key: string, value: string) => {
      const { error } = await supabase.from('neura_storage').upsert({ key, value }, { onConflict: 'key' });
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
    if (idx >= 0) GALAXY_MAPS[idx] = { id: mapDef.id, label: mapDef.label, rootCluster: mapDef.rootCluster };
    else GALAXY_MAPS.push({ id: mapDef.id, label: mapDef.label, rootCluster: mapDef.rootCluster });
    CLUSTER_LISTS[mapDef.id] = mapDef.clusterIds || [];
    Object.keys(_worldColorCache).forEach(k => delete _worldColorCache[k]);
  } catch (e) {
    console.error('saveMapToStorage failed:', e);
  }
}
