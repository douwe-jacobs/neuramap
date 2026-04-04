import { PALETTE, ROOT_PALETTE, hslToRgb } from './palette';
import { worlds, _worldColorCache, GALAXY_MAPS } from './worldData';

export { hslToRgb };

export function getWorldColors(worldId: string): Record<string, { h: number; s: number; l: number }> {
  if (_worldColorCache[worldId]) return _worldColorCache[worldId];
  const world = worlds[worldId];
  if (!world) return {};
  const coreNode = Object.values(world.neurons).find(n => n.isCore);
  if (!coreNode) return {};

  const mapIndex = GALAXY_MAPS.findIndex(m => m.rootCluster === worldId);
  const rootColor = ROOT_PALETTE[(mapIndex >= 0 ? mapIndex : 0) % ROOT_PALETTE.length];

  const colorMap: Record<string, { h: number; s: number; l: number }> = {};

  if (world.color) {
    Object.keys(world.neurons).forEach(nid => { colorMap[nid] = world.color!; });
  } else {
    const branches = coreNode.children || [];
    branches.forEach((branchId, i) => {
      const branchNode = world.neurons[branchId];
      const basePal = branchNode?.color ?? PALETTE[i % PALETTE.length];
      const queue: Array<{ id: string; inheritedColor: { h: number; s: number; l: number } }> = [{ id: branchId, inheritedColor: basePal }];
      while (queue.length) {
        const { id: nid, inheritedColor } = queue.shift()!;
        if (colorMap[nid]) continue;
        const n = world.neurons[nid];
        const nodeColor = (nid !== branchId && n?.color) ? n.color : inheritedColor;
        colorMap[nid] = nodeColor;
        if (n?.children) {
          n.children.forEach(cid => {
            if (!colorMap[cid]) queue.push({ id: cid, inheritedColor: nodeColor });
          });
        }
      }
    });
    colorMap[coreNode.id] = coreNode.color ?? rootColor;
  }

  _worldColorCache[worldId] = colorMap;
  return colorMap;
}

export function getNodeColor(nodeId: string, clusterId: string): string {
  const colors = getWorldColors(clusterId);
  const entry = colors[nodeId] || PALETTE[0];
  return hslToRgb(entry.h, entry.s, entry.l);
}

export function getNodePalette(nodeId: string, clusterId: string): { h: number; s: number; l: number } {
  const colors = getWorldColors(clusterId);
  return colors[nodeId] || PALETTE[0];
}
