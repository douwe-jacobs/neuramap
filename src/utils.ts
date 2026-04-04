import { worlds, clusterMeta, CLUSTER_LISTS, GALAXY_MAPS } from './worldData';
import type { Neuron } from './types';

export const CHILD_SIZE_FACTOR = 0.74;
export const CORE_SIZE = 300;

export function sizeForDepth(depth: number): number {
  return Math.round(CORE_SIZE * Math.pow(CHILD_SIZE_FACTOR, depth));
}

export function sizeFromParent(parentSize: number): number {
  return Math.round(parentSize * CHILD_SIZE_FACTOR);
}

export function getCoreId(clusterId: string): string {
  const w = worlds[clusterId];
  if (!w) return clusterId;
  const found = Object.keys(w.neurons).find(id => w.neurons[id].isCore);
  return found || Object.keys(w.neurons)[0];
}

export function getMapForCluster(clusterId: string): string {
  for (const [mapId, list] of Object.entries(CLUSTER_LISTS)) {
    if (list.includes(clusterId)) return mapId;
  }
  return 'work';
}

export function spreadClusterY(neurons: Record<string, Neuron>): Record<string, { x: number; y: number }> {
  const LEAF_RADIUS = 50;
  const BRANCH_GAP = 40;
  const LABEL_H = 62 * 1.4 * 2 * 0.9;
  const MARGIN = 54;
  const pos: Record<string, { x: number; y: number }> = {};

  Object.values(neurons).forEach(n => { pos[n.id] = { x: n.x, y: n.y }; });

  const core = Object.values(neurons).find(n => n.isCore);
  const branches = Object.values(neurons).filter(n => !n.isCore && (n.children?.length ?? 0) > 0);
  const leaves = Object.values(neurons).filter(n => !n.isCore && (n.children?.length ?? 0) === 0);

  // Spread branch nodes (with labels) away from each other using Y repulsion
  for (let iter = 0; iter < 16; iter++) {
    const all = core ? [core, ...branches] : branches;
    const sorted = [...all].sort((a, b) => pos[a.id].y - pos[b.id].y);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i], b = sorted[i + 1];
      const minDist = a.size / 2 + LABEL_H + MARGIN + b.size / 2;
      const dy = pos[b.id].y - pos[a.id].y;
      if (dy < minDist) {
        const push = (minDist - dy) / 2;
        if (a.isCore)      { pos[b.id].y += push * 2; }
        else if (b.isCore) { pos[a.id].y -= push * 2; }
        else               { pos[a.id].y -= push; pos[b.id].y += push; }
      }
    }
    // Also apply 2D repulsion between branches
    for (let i = 0; i < branches.length - 1; i++) {
      for (let j = i + 1; j < branches.length; j++) {
        const a = branches[i], b = branches[j];
        const minDist = a.size / 2 + BRANCH_GAP + b.size / 2;
        const dx = pos[b.id].x - pos[a.id].x;
        const dy = pos[b.id].y - pos[a.id].y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < minDist) {
          const push = (minDist - dist) / (2 * dist);
          pos[a.id].x -= dx * push * 0.3;
          pos[b.id].x += dx * push * 0.3;
        }
      }
    }
  }

  // Re-anchor each leaf node relative to its branch parent's final cluster position
  leaves.forEach(leaf => {
    const parentNode = leaf.parentId ? neurons[leaf.parentId] : null;
    if (!parentNode) return;
    const parentFinalPos = pos[parentNode.id];
    const origParentPos = { x: parentNode.x, y: parentNode.y };
    const dx = parentFinalPos.x - origParentPos.x;
    const dy = parentFinalPos.y - origParentPos.y;
    pos[leaf.id] = {
      x: leaf.x + dx,
      y: leaf.y + dy,
    };
  });

  // Apply 2D repulsion for leaf nodes (smaller radius since no labels)
  for (let iter = 0; iter < 20; iter++) {
    const allNodes = Object.values(neurons);
    for (let i = 0; i < allNodes.length - 1; i++) {
      for (let j = i + 1; j < allNodes.length; j++) {
        const a = allNodes[i], b = allNodes[j];
        const aIsLeaf = !a.isCore && (a.children?.length ?? 0) === 0;
        const bIsLeaf = !b.isCore && (b.children?.length ?? 0) === 0;
        if (!aIsLeaf && !bIsLeaf) continue; // branch vs branch already handled
        const aRadius = aIsLeaf ? LEAF_RADIUS : a.size / 2 + BRANCH_GAP / 2;
        const bRadius = bIsLeaf ? LEAF_RADIUS : b.size / 2 + BRANCH_GAP / 2;
        const minDist = aRadius + bRadius + 20;
        const dx = pos[b.id].x - pos[a.id].x;
        const dy = pos[b.id].y - pos[a.id].y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < minDist) {
          const push = (minDist - dist) / (2 * dist);
          const aFixed = a.isCore || (!aIsLeaf);
          const bFixed = b.isCore || (!bIsLeaf);
          if (!aFixed) { pos[a.id].x -= dx * push; pos[a.id].y -= dy * push; }
          if (!bFixed) { pos[b.id].x += dx * push; pos[b.id].y += dy * push; }
        }
      }
    }
  }

  // Clamp X to screen bounds
  const SCREEN_HALF = 195 / 0.162;
  const PADDING = 40 / 0.162;
  Object.values(neurons).forEach(n => {
    if (n.isCore) return;
    pos[n.id].x = Math.max(-SCREEN_HALF + n.size / 2 + PADDING, Math.min(SCREEN_HALF - n.size / 2 - PADDING, pos[n.id].x));
  });
  return pos;
}

export function isNodeVisible(_node: Neuron, _currentNeuron: Neuron, _nodes: Record<string, Neuron>): boolean {
  return true;
}

export function findNeuronInDirection(angle: number, activeId: string, nodes: Record<string, Neuron>): string | null {
  const origin = nodes[activeId];
  if (!origin) return null;

  const candidateIds = new Set<string>();
  if (origin.parentId && nodes[origin.parentId]) {
    candidateIds.add(origin.parentId);
    const parent = nodes[origin.parentId];
    (parent.children || []).forEach(cid => { if (cid !== activeId && nodes[cid]) candidateIds.add(cid); });
  }
  (origin.children || []).forEach(cid => { if (nodes[cid]) candidateIds.add(cid); });

  const rootNode = Object.values(nodes).find(n => n.isCore);
  if (rootNode && rootNode.id !== activeId) candidateIds.add(rootNode.id);

  const candidates = candidateIds.size > 0
    ? Array.from(candidateIds).map(id => nodes[id])
    : Object.values(nodes).filter(n => n.id !== activeId);

  let best: string | null = null, minScore = Infinity;
  candidates.forEach(n => {
    if (n.id === activeId) return;
    const a = Math.atan2(n.y - origin.y, n.x - origin.x);
    let d = Math.abs(angle - a);
    if (d > Math.PI) d = 2 * Math.PI - d;
    if (d < Math.PI) {
      const score = d * 1000 + Math.hypot(n.x - origin.x, n.y - origin.y);
      if (score < minScore) { minScore = score; best = n.id; }
    }
  });
  return best;
}

export function getClusterCrumbs(currentCluster: string): string[] {
  const crumbs: string[] = [];
  let c: string | null | undefined = currentCluster;
  while (c) {
    crumbs.unshift(worlds[c]?.label?.toUpperCase() || '');
    c = clusterMeta[c]?.parentClusterId;
  }
  return crumbs;
}

export function getLineage(currentCluster: string, activeId: string): string[] {
  const nodes = worlds[currentCluster]?.neurons;
  if (!nodes) return [];
  const path: string[] = [];
  let node: Neuron | undefined = nodes[activeId];
  while (node) {
    path.unshift(node.label.toUpperCase());
    node = node.parentId ? nodes[node.parentId] : undefined;
  }
  return [...new Set([...(clusterMeta[currentCluster]?.ancestorCrumbs || []), ...path])];
}

export function generateNodeId(): string {
  return `n_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function findRelatedNodeId(clusterId: string, relatedLabel: string): string {
  const neurons = worlds[clusterId]?.neurons;
  if (!neurons) return getCoreId(clusterId);
  const lower = relatedLabel.toLowerCase();
  let best: string | null = null;
  let bestScore = 0;
  for (const [id, n] of Object.entries(neurons)) {
    const words = lower.split(/\s+/);
    const nLabel = n.label.toLowerCase();
    let score = 0;
    words.forEach(w => { if (nLabel.includes(w)) score++; });
    if (score > bestScore) { bestScore = score; best = id; }
  }
  return best || getCoreId(clusterId);
}

function segmentsIntersect(
  ax1: number, ay1: number, ax2: number, ay2: number,
  bx1: number, by1: number, bx2: number, by2: number,
): boolean {
  const dax = ax2 - ax1, day = ay2 - ay1;
  const dbx = bx2 - bx1, dby = by2 - by1;
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < 1e-10) return false;
  const t = ((bx1 - ax1) * dby - (by1 - ay1) * dbx) / denom;
  const u = ((bx1 - ax1) * day - (by1 - ay1) * dax) / denom;
  return t > 0.05 && t < 0.95 && u > 0.05 && u < 0.95;
}

function axonWouldCross(
  neurons: Record<string, import('./types').Neuron>,
  fromId: string,
  toX: number,
  toY: number,
): boolean {
  const from = neurons[fromId];
  if (!from) return false;
  for (const n of Object.values(neurons)) {
    for (const cid of n.children || []) {
      const child = neurons[cid];
      if (!child) continue;
      if (n.id === fromId || cid === fromId) continue;
      if (segmentsIntersect(from.x, from.y, toX, toY, n.x, n.y, child.x, child.y)) {
        return true;
      }
    }
  }
  return false;
}

function countDescendants(neurons: Record<string, Neuron>, id: string): number {
  const children = neurons[id]?.children || [];
  return children.reduce((sum, cid) => sum + 1 + countDescendants(neurons, cid), 0);
}

export function reflowNeurons(neurons: Record<string, Neuron>, preservePositions = false): void {
  const MIN_NODE_DIST = 280;

  const coreNode = Object.values(neurons).find(n => n.isCore);
  if (!coreNode) return;

  const placed = new Set<string>([coreNode.id]);
  const depths: Record<string, number> = { [coreNode.id]: 0 };
  const queue: string[] = [coreNode.id];

  if (preservePositions) {
    for (const n of Object.values(neurons)) {
      if (!n.isCore && (Math.abs(n.x) > 10 || Math.abs(n.y) > 10)) {
        placed.add(n.id);
      }
    }
  }

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const parent = neurons[parentId];
    if (!parent) continue;

    const allChildren = (parent.children || []).filter(cid => neurons[cid]);
    const unplaced = allChildren.filter(cid => !placed.has(cid));
    if (unplaced.length === 0) continue;

    const depth = depths[parentId] ?? 0;
    const isRoot = depth === 0;

    const grandparent = parent.parentId ? neurons[parent.parentId] : null;
    const incomingAngle: number = grandparent
      ? Math.atan2(parent.y - grandparent.y, parent.x - grandparent.x)
      : -Math.PI / 2;

    const withMeta = allChildren.map(cid => ({
      cid,
      hasChildren: (neurons[cid]?.children?.length ?? 0) > 0,
      desc: countDescendants(neurons, cid),
    }));

    const branchCount = withMeta.filter(m => m.hasChildren).length;
    const leafCount = withMeta.filter(m => !m.hasChildren).length;
    const total = allChildren.length;

    const angleSlot = (2 * Math.PI) / total;

    const assignedAngles: Array<{ cid: string; angle: number; minDist: number; maxDist: number }> = [];

    if (isRoot) {
      const goldenAngle = 2.39996;
      const baseOffset = Math.PI * 0.17;
      const branchItems = withMeta.filter(m => m.hasChildren);
      const leafItems = withMeta.filter(m => !m.hasChildren);

      for (let i = 0; i < branchItems.length; i++) {
        const { cid, desc } = branchItems[i];
        const angle = i * goldenAngle + baseOffset;
        const minDist = 680 + desc * 18 + i * 45;
        const maxDist = 920 + desc * 18 + i * 45;
        assignedAngles.push({ cid, angle, minDist, maxDist });
      }
      for (let i = 0; i < leafItems.length; i++) {
        const { cid } = leafItems[i];
        const angle = (branchItems.length + i) * goldenAngle + baseOffset + Math.PI * 0.4;
        assignedAngles.push({ cid, angle, minDist: 420, maxDist: 580 });
      }
    } else {
      const outwardAngle = incomingAngle;
      const sideSpread = Math.PI * 0.65;

      const branchAngles: number[] = [];
      const leafAngles: number[] = [];

      if (branchCount > 0) {
        for (let i = 0; i < branchCount; i++) {
          const t = branchCount === 1 ? 0 : (i / (branchCount - 1) - 0.5);
          let a = outwardAngle + t * sideSpread * 0.7;
          const normBack = ((a - (incomingAngle + Math.PI) + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          if (Math.abs(normBack) < 0.35) a += normBack < 0 ? -0.4 : 0.4;
          branchAngles.push(a);
        }
      }

      const forwardSpread = Math.PI * 0.75;
      const forwardCapacity = Math.max(1, Math.round(forwardSpread / (Math.PI / 4)));
      const needsBackFill = grandparent !== null && leafCount > forwardCapacity;

      if (needsBackFill) {
        const backAngle = incomingAngle + Math.PI;
        const blockedAngles = [backAngle, ...branchAngles];
        const blockRadius = 0.55;

        const norm = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const blocked = blockedAngles.map(norm).sort((a, b) => a - b);

        const gaps: Array<{ start: number; end: number; size: number }> = [];
        for (let i = 0; i < blocked.length; i++) {
          const start = blocked[i] + blockRadius;
          const end = blocked[(i + 1) % blocked.length] + (i + 1 < blocked.length ? 0 : Math.PI * 2) - blockRadius;
          if (end > start + 0.1) gaps.push({ start, end, size: end - start });
        }

        const totalGapSize = gaps.reduce((s, g) => s + g.size, 0);
        let remaining = leafCount;
        const gapLeafCounts = gaps.map(g => {
          const share = Math.round((g.size / totalGapSize) * leafCount);
          return Math.min(share, remaining);
        });
        let placed2 = gapLeafCounts.reduce((s, c) => s + c, 0);
        let gi = 0;
        while (placed2 < leafCount) { gapLeafCounts[gi++ % gaps.length]++; placed2++; }

        for (let gi2 = 0; gi2 < gaps.length; gi2++) {
          const gap = gaps[gi2];
          const count = gapLeafCounts[gi2];
          if (count === 0) continue;
          for (let k = 0; k < count; k++) {
            const t = count === 1 ? 0.5 : k / (count - 1);
            leafAngles.push(gap.start + t * (gap.end - gap.start));
          }
        }
      } else {
        for (let i = 0; i < leafCount; i++) {
          const t = leafCount === 1 ? 0 : (i / (leafCount - 1) - 0.5);
          leafAngles.push(outwardAngle + t * sideSpread);
        }
      }

      let bi = 0;
      let li = 0;
      for (const { cid, hasChildren, desc } of withMeta) {
        const angle = hasChildren ? branchAngles[bi++] : leafAngles[li++];
        const minDist = hasChildren ? 420 + desc * 20 : 280;
        const maxDist = hasChildren ? 600 + desc * 20 : 380;
        assignedAngles.push({ cid, angle: angle ?? outwardAngle, minDist, maxDist });
      }
    }

    const sortedAngles = [...assignedAngles].sort((a, b) => {
      const aHasChildren = (neurons[a.cid]?.children?.length ?? 0) > 0;
      const bHasChildren = (neurons[b.cid]?.children?.length ?? 0) > 0;
      if (aHasChildren && !bHasChildren) return -1;
      if (!aHasChildren && bHasChildren) return 1;
      return 0;
    });
    for (const { cid, angle, minDist, maxDist } of sortedAngles) {
      if (placed.has(cid)) continue;
      const child = neurons[cid];
      depths[cid] = depth + 1;
      let placed_pos: { x: number; y: number } | null = null;

      outer: for (let di = 0; di < 10; di++) {
        const dist = minDist + (di / 9) * (maxDist - minDist);

        for (let ai = 0; ai < (isRoot ? 1 : 7); ai++) {
          const side = ai % 2 === 0 ? 1 : -1;
          const aw = ai === 0 ? 0 : Math.ceil(ai / 2) * 0.1 * side;
          const a = angle + aw;
          const cx = Math.round(parent.x + Math.cos(a) * dist);
          const cy = Math.round(parent.y + Math.sin(a) * dist);

          const tooClose = Object.values(neurons).some(n => {
            if (!placed.has(n.id) && n.id !== cid) return false;
            return Math.hypot(n.x - cx, n.y - cy) < MIN_NODE_DIST;
          });
          if (tooClose) continue;

          let wouldCross = false;
          for (const n of Object.values(neurons)) {
            if (!placed.has(n.id)) continue;
            for (const existingCid of n.children || []) {
              const ec = neurons[existingCid];
              if (!ec || !placed.has(existingCid)) continue;
              if (n.id === parentId || existingCid === parentId) continue;
              if (segmentsIntersect(parent.x, parent.y, cx, cy, n.x, n.y, ec.x, ec.y)) {
                wouldCross = true;
                break;
              }
            }
            if (wouldCross) break;
          }
          if (wouldCross) continue;

          placed_pos = { x: cx, y: cy };
          break outer;
        }
      }

      if (!placed_pos) {
        placed_pos = {
          x: Math.round(parent.x + Math.cos(angle) * minDist),
          y: Math.round(parent.y + Math.sin(angle) * minDist),
        };
      }

      child.x = placed_pos.x;
      child.y = placed_pos.y;
      placed.add(cid);
      queue.push(cid);
    }
  }
}

export function repositionSubtreeUnderNewParent(
  neurons: Record<string, Neuron>,
  nodeId: string,
  newParentId: string,
): void {
  const parent = neurons[newParentId];
  const node = neurons[nodeId];
  if (!parent || !node) return;

  const siblings = (parent.children || []).filter(c => c !== nodeId && neurons[c]);
  const existingSiblingAvgAngle = siblings.length > 0
    ? Math.atan2(
        siblings.reduce((s, c) => s + (neurons[c].y - parent.y), 0) / siblings.length,
        siblings.reduce((s, c) => s + (neurons[c].x - parent.x), 0) / siblings.length,
      )
    : null;

  const grandparent = parent.parentId ? neurons[parent.parentId] : null;
  let baseAngle: number;
  if (grandparent) {
    baseAngle = Math.atan2(parent.y - grandparent.y, parent.x - grandparent.x);
  } else {
    baseAngle = existingSiblingAvgAngle !== null ? existingSiblingAvgAngle + Math.PI : -Math.PI / 2;
  }

  const hasSiblings = siblings.length > 0;
  const sideSpread = hasSiblings ? Math.PI * 0.8 : Math.PI * 1.5;
  const MIN_DIST = Math.round((parent.size / 2) + (node.size / 2) + 200);
  const MAX_DIST = MIN_DIST + 250;
  const MIN_NODE_DIST = 260;
  const MAX_ATTEMPTS = 48;

  const allPlaced = Object.values(neurons).filter(n => n.id !== nodeId);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const spreadFrac = (attempt + 1) / MAX_ATTEMPTS;
    const side = attempt % 2 === 0 ? 1 : -1;
    const angleOffset = side * spreadFrac * sideSpread;
    const angle = baseAngle + angleOffset;
    const dist = MIN_DIST + (attempt % 5) * ((MAX_DIST - MIN_DIST) / 4);
    const cx = Math.round(parent.x + Math.cos(angle) * dist);
    const cy = Math.round(parent.y + Math.sin(angle) * dist);

    const tooClose = allPlaced.some(n => Math.hypot(n.x - cx, n.y - cy) < MIN_NODE_DIST);
    if (tooClose) continue;

    const dx = cx - node.x;
    const dy = cy - node.y;

    function moveSubtree(id: string) {
      const n = neurons[id];
      if (!n) return;
      n.x = Math.round(n.x + dx);
      n.y = Math.round(n.y + dy);
      for (const cid of n.children || []) moveSubtree(cid);
    }
    moveSubtree(nodeId);
    return;
  }

  const fallbackAngle = baseAngle + (grandparent ? Math.PI * 0.5 : 0);
  const fallbackDist = MIN_DIST + 60;
  const cx = Math.round(parent.x + Math.cos(fallbackAngle) * fallbackDist);
  const cy = Math.round(parent.y + Math.sin(fallbackAngle) * fallbackDist);
  const dx = cx - node.x;
  const dy = cy - node.y;
  function moveSubtreeFallback(id: string) {
    const n = neurons[id];
    if (!n) return;
    n.x = Math.round(n.x + dx);
    n.y = Math.round(n.y + dy);
    for (const cid of n.children || []) moveSubtreeFallback(cid);
  }
  moveSubtreeFallback(nodeId);
}

export function positionNearNode(clusterId: string, anchorId: string): { x: number; y: number } {
  const neurons = worlds[clusterId]?.neurons;
  if (!neurons) return { x: 0, y: 0 };
  const anchor = neurons[anchorId];
  if (!anchor) return { x: 0, y: 0 };

  const parent = anchor.parentId ? neurons[anchor.parentId] : null;
  let baseAngle: number;
  if (parent) {
    baseAngle = Math.atan2(anchor.y - parent.y, anchor.x - parent.x);
  } else {
    const children = (anchor.children || []).map(c => neurons[c]).filter(Boolean);
    if (children.length > 0) {
      const avgAngle = Math.atan2(
        children.reduce((s, c) => s + (c!.y - anchor.y), 0),
        children.reduce((s, c) => s + (c!.x - anchor.x), 0),
      );
      baseAngle = avgAngle + Math.PI;
    } else {
      baseAngle = -Math.PI / 2;
    }
  }

  const MIN_DIST = 340;
  const MAX_DIST = 500;
  const MIN_NODE_DIST = 280;
  const MAX_ATTEMPTS = 36;

  const parentAngle = parent
    ? Math.atan2(parent.y - anchor.y, parent.x - anchor.x)
    : baseAngle + Math.PI;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const spreadFrac = (attempt + 1) / MAX_ATTEMPTS;
    const side = attempt % 2 === 0 ? 1 : -1;
    const angleOffset = side * spreadFrac * Math.PI * 0.85;
    const angle = baseAngle + angleOffset;

    const backToParent = Math.abs(((angle - parentAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.3;
    if (backToParent) continue;

    const dist = MIN_DIST + (attempt % 4) * ((MAX_DIST - MIN_DIST) / 3);
    const cx = Math.round(anchor.x + Math.cos(angle) * dist);
    const cy = Math.round(anchor.y + Math.sin(angle) * dist);

    const tooClose = Object.values(neurons).some(n => {
      const d = Math.hypot(n.x - cx, n.y - cy);
      return d < MIN_NODE_DIST;
    });
    if (tooClose) continue;

    if (axonWouldCross(neurons, anchorId, cx, cy)) continue;

    return { x: cx, y: cy };
  }

  const fallbackAngle = baseAngle + (Math.PI / 2);
  const fallbackDist = MIN_DIST + 80;
  return {
    x: Math.round(anchor.x + Math.cos(fallbackAngle) * fallbackDist),
    y: Math.round(anchor.y + Math.sin(fallbackAngle) * fallbackDist),
  };
}
