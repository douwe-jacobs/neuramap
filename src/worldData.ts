import type { World, ClusterMeta, MapDef } from './types';

export const APP_VERSION = '0.9.6';

let clusterMeta: Record<string, ClusterMeta> = {};
let worlds: Record<string, World> = {};
let CLUSTER_LISTS: Record<string, string[]> = {};
let GALAXY_MAPS: MapDef[] = [];

export const _worldColorCache: Record<string, any> = {};

// Galaxy layout — populated by loadFromStorage(), read by App on first render
export const galaxyBasePositions: Record<string, { x: number; y: number }> = {};
export const galaxyMapOffsets: Record<string, { x: number; y: number }> = {};

export { worlds, clusterMeta, GALAXY_MAPS, CLUSTER_LISTS }