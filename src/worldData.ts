import type { World, ClusterMeta, MapDef } from './types';

export const APP_VERSION = '0.9.6';

let clusterMeta: Record<string, ClusterMeta> = {};
let worlds: Record<string, World> = {};
let CLUSTER_LISTS: Record<string, string[]> = {};
let GALAXY_MAPS: MapDef[] = [];

export const _worldColorCache: Record<string, any> = {};

export { worlds, clusterMeta, GALAXY_MAPS, CLUSTER_LISTS }