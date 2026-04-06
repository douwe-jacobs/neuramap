import { worlds, clusterMeta, CLUSTER_LISTS, GALAXY_MAPS } from './worldData';
import type { Neuron } from './types';

export const PHI = 1.618033988749895;
export const CHILD_SIZE_FACTOR = 1 / PHI; // ≈ 0.618
export const CORE_SIZE = 300;
export const BASE_AXON_LENGTH = 800; // root → depth-1 distance
export const AXON_FALLOFF     = 0.7; // each deeper level multiplies by this

export function sizeForDepth(depth: number): number {
  // sqrt(phi) ≈ 1.272 per level — clear hierarchy without being too dramatic
  return Math.max(50, Math.round(CORE_SIZE / Math.pow(Math.sqrt(PHI), depth)));
}

export function sizeFromParent(parentSize: number): number {
  return Math.max(50, Math.round(parentSize / PHI));
}

export function axonLengthForDepth(parentDepth: number): number {
  return BASE_AXON_LENGTH * Math.pow(AXON_FALLOFF, parentDepth);
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

/** Deterministic hash: node id → float in [0, 1) */
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  }
  return (h >>> 0) / 4294967296;
}

export function reflowNeurons(neurons: Record<string, Neuron>, preservePositions = false): void {
  const coreNode = Object.values(neurons).find(n => n.isCore);
  if (!coreNode) return;

  // ── Step 1: BFS depth assignment ────────────────────────────────────────────
  const depths: Record<string, number> = { [coreNode.id]: 0 };
  {
    const q: string[] = [coreNode.id];
    while (q.length > 0) {
      const id = q.shift()!;
      for (const cid of neurons[id]?.children || []) {
        if (neurons[cid] && depths[cid] === undefined) {
          depths[cid] = depths[id] + 1;
          q.push(cid);
        }
      }
    }
  }

  // ── Step 2: Update sizes (sqrt(phi) ≈ 1.272 per depth level) ────────────────
  for (const n of Object.values(neurons)) {
    n.size = sizeForDepth(depths[n.id] ?? 1);
  }

  // ── Step 3: Lock already-placed nodes in preservePositions mode ─────────────
  const locked = new Set<string>();
  if (preservePositions) {
    for (const n of Object.values(neurons)) {
      if (!n.isCore && (Math.abs(n.x) > 10 || Math.abs(n.y) > 10)) locked.add(n.id);
    }
  }

  // ── Step 4: Place root at origin ────────────────────────────────────────────
  coreNode.x = 0;
  coreNode.y = 0;

  // ── Step 5: BFS placement ────────────────────────────────────────────────────
  //   Depth-1: evenly spread around 360°, starting straight up (−π/2).
  //   Deeper:  evenly spread across a 180° arc on the outward side of the parent
  //            (the arc is centred on the parent's outward direction from root).
  //   Jitter:  ±5° angle and ±10% axon length, both deterministic per node id.

  interface Task { parentId: string; depth: number; }
  const queue: Task[] = [{ parentId: coreNode.id, depth: 0 }];

  while (queue.length > 0) {
    const { parentId, depth } = queue.shift()!;
    const parent = neurons[parentId];
    if (!parent) continue;

    const children = (parent.children || []).filter(cid => neurons[cid]);
    if (children.length === 0) continue;

    const axonLen = axonLengthForDepth(depth); // 800 × 0.7^depth
    const C = children.length;

    // Base angle for each child
    const baseAngles: number[] = [];

    if (parent.isCore) {
      // Even spread across full 360°
      const step = (2 * Math.PI) / C;
      for (let i = 0; i < C; i++) baseAngles.push(-Math.PI / 2 + i * step);
    } else {
      // Outward direction: from root center through this parent
      const θ_out = Math.atan2(parent.y - coreNode.y, parent.x - coreNode.x);
      // Spread C children evenly across 180°, centred on θ_out
      if (C === 1) {
        baseAngles.push(θ_out);
      } else {
        const arc  = Math.PI; // 180°
        const step = arc / (C - 1);
        for (let i = 0; i < C; i++) baseAngles.push(θ_out - arc / 2 + i * step);
      }
    }

    for (let i = 0; i < C; i++) {
      const cid = children[i];
      if (locked.has(cid)) { queue.push({ parentId: cid, depth: depth + 1 }); continue; }

      const child = neurons[cid];

      // ±5° jitter
      const jitter = (hashId(cid + 'a') - 0.5) * ((10 * Math.PI) / 180);
      // ±10% length variation
      const lenVar = 1.0 + (hashId(cid + 'l') - 0.5) * 0.2;

      const angle = baseAngles[i] + jitter;
      child.x = Math.round(parent.x + Math.cos(angle) * axonLen * lenVar);
      child.y = Math.round(parent.y + Math.sin(angle) * axonLen * lenVar);
      queue.push({ parentId: cid, depth: depth + 1 });
    }
  }

  // ── Step 6: Collision avoidance — push overlapping nodes apart ───────────────
  //   70px minimum surface gap, up to 50 iterations, exits early when clean.
  const allNodes = Object.values(neurons);
  const MIN_GAP = 70;

  for (let iter = 0; iter < 50; iter++) {
    let moved = false;
    for (let i = 0; i < allNodes.length - 1; i++) {
      for (let j = i + 1; j < allNodes.length; j++) {
        const a = allNodes[i];
        const b = allNodes[j];
        const minDist = a.size / 2 + MIN_GAP + b.size / 2;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < minDist) {
          const push = (minDist - dist) / (2 * dist);
          if (!a.isCore) { a.x = Math.round(a.x - dx * push); a.y = Math.round(a.y - dy * push); }
          if (!b.isCore) { b.x = Math.round(b.x + dx * push); b.y = Math.round(b.y + dy * push); }
          moved = true;
        }
      }
    }
    if (!moved) break;
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
