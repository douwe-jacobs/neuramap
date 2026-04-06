import { worlds, clusterMeta, CLUSTER_LISTS, GALAXY_MAPS } from './worldData';
import type { Neuron } from './types';

export const PHI = 1.618033988749895;
export const CHILD_SIZE_FACTOR = 1 / PHI; // ≈ 0.618
export const CORE_SIZE = 300;
export const BASE_AXON_LENGTH = 1000; // root → depth-1 distance in world units

export function sizeForDepth(depth: number): number {
  // Rule 6: sqrt(phi) ≈ 1.272 ratio — clear hierarchy without being too dramatic
  return Math.max(50, Math.round(CORE_SIZE / Math.pow(Math.sqrt(PHI), depth)));
}

export function sizeFromParent(parentSize: number): number {
  return Math.max(50, Math.round(parentSize / PHI));
}

/** Axon length from a node at parentDepth to its children at parentDepth+1.
 *  Uses sqrt(PHI) ≈ 1.272 falloff so sub-branches stay spacious rather than
 *  collapsing rapidly (vs PHI ≈ 1.618 which halves length every ~2 levels). */
export function axonLengthForDepth(parentDepth: number): number {
  return BASE_AXON_LENGTH / Math.pow(Math.sqrt(PHI), parentDepth);
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

  // ── Step 2: Update sizes — depth N → CORE_SIZE / phi^N ──────────────────────
  for (const n of Object.values(neurons)) {
    n.size = sizeForDepth(depths[n.id] ?? 1);
  }

  // ── Step 3: Nodes to keep fixed (preservePositions mode) ────────────────────
  const locked = new Set<string>();
  if (preservePositions) {
    for (const n of Object.values(neurons)) {
      if (!n.isCore && (Math.abs(n.x) > 10 || Math.abs(n.y) > 10)) {
        locked.add(n.id);
      }
    }
  }

  // ── Step 4: Place root at origin ────────────────────────────────────────────
  coreNode.x = 0;
  coreNode.y = 0;

  // ── Step 5: BFS placement ────────────────────────────────────────────────────
  //
  // Layout rules applied here:
  //   Rule 1 — Adaptive sector size: weight angular allocation by descendant count.
  //   Rule 2 — Variable axon length: ±17.5% per-node variation via deterministic hash.
  //   Rule 3 — Outward bias: θ_outward comes from root→parent vector, not gp→parent.
  //   Rule 4 — Gentle asymmetry: ±10° deterministic jitter per child node.
  //   Rule 5 — Breathing room: minimum 25° sector for each depth-1 branch.

  // Pre-compute descendant counts for sector weighting (Rule 1)
  const descCounts: Record<string, number> = {};
  for (const id of Object.keys(neurons)) {
    descCounts[id] = countDescendants(neurons, id);
  }

  interface Task { parentId: string; depth: number; }
  const workQueue: Task[] = [{ parentId: coreNode.id, depth: 0 }];

  while (workQueue.length > 0) {
    const { parentId, depth } = workQueue.shift()!;
    const parent = neurons[parentId];
    if (!parent) continue;

    const children = (parent.children || []).filter(cid => neurons[cid]);
    if (children.length === 0) continue;

    const axonLen = axonLengthForDepth(depth);
    let childAngles: number[];

    if (parent.isCore) {
      // Root: distribute children around full circle.
      // Rule 1: weight sectors by (descendants + 1).
      // Rule 5: enforce minimum 25° sector so branches never crowd each other.
      const weights = children.map(cid => descCounts[cid] + 1);
      const totalWeight = weights.reduce((s, w) => s + w, 0);
      const MIN_SECTOR = (25 * Math.PI) / 180;
      const sectors = weights.map(w => Math.max(MIN_SECTOR, (w / totalWeight) * 2 * Math.PI));
      const totalSector = sectors.reduce((s, v) => s + v, 0);
      const norm = (2 * Math.PI) / totalSector;
      const normSectors = sectors.map(s => s * norm);

      let cum = -Math.PI / 2;
      childAngles = normSectors.map(sec => {
        const mid = cum + sec / 2;
        cum += sec;
        return mid;
      });
    } else {
      const gp = parent.parentId ? neurons[parent.parentId] : null;
      if (!gp) {
        // Defensive fallback
        const s = (2 * Math.PI) / children.length;
        childAngles = children.map((_, i) => -Math.PI / 2 + i * s);
      } else {
        // Rule 3: outward direction from root center → parent (not gp → parent).
        // For depth-1 this is identical to old behavior; for deeper nodes it
        // keeps sub-branches expanding away from the global center.
        const θ_outward = Math.atan2(parent.y - coreNode.y, parent.x - coreNode.x);

        // Rule 1: weight sectors, spread within 280° forward arc for wider fan.
        const FORWARD_ARC = (280 * Math.PI) / 180;
        const MIN_SECTOR = (20 * Math.PI) / 180;
        const weights = children.map(cid => descCounts[cid] + 1);
        const totalWeight = weights.reduce((s, w) => s + w, 0);
        const sectors = weights.map(w => Math.max(MIN_SECTOR, (w / totalWeight) * FORWARD_ARC));
        const totalSector = sectors.reduce((s, v) => s + v, 0);
        const norm = Math.min(1, FORWARD_ARC / totalSector);
        const normSectors = sectors.map(s => s * norm);

        const arcTotal = normSectors.reduce((s, v) => s + v, 0);
        let cum = θ_outward - arcTotal / 2;
        childAngles = normSectors.map(sec => {
          const mid = cum + sec / 2;
          cum += sec;
          return mid;
        });
      }
    }

    // Place each child with per-node length variation (Rule 2) and jitter (Rule 4)
    for (let i = 0; i < children.length; i++) {
      const cid = children[i];
      if (locked.has(cid)) {
        workQueue.push({ parentId: cid, depth: depth + 1 });
        continue;
      }
      const child = neurons[cid];

      // Rule 2: ±17.5% axon length variation
      const lenVar = 1.0 + (hashId(cid) - 0.5) * 0.35;
      const childAxonLen = axonLen * lenVar;

      // Rule 4: ±10° deterministic angular jitter
      const jitter = (hashId(cid + 'j') - 0.5) * ((20 * Math.PI) / 180);

      const angle = childAngles[i] + jitter;
      child.x = Math.round(parent.x + Math.cos(angle) * childAxonLen);
      child.y = Math.round(parent.y + Math.sin(angle) * childAxonLen);
      workQueue.push({ parentId: cid, depth: depth + 1 });
    }
  }

  // ── Step 6: Uncross axons ────────────────────────────────────────────────────
  // For each pair of crossing axons, rotate the deeper child's whole subtree
  // around its parent (15° steps, up to ±180°) until the crossing is gone
  // without introducing a new one. Runs up to 5 passes until no crossings remain.
  {
    const moveSubtreeLocal = (id: string, dx: number, dy: number): void => {
      const n = neurons[id];
      if (!n) return;
      n.x += dx; n.y += dy;
      for (const cid of n.children || []) moveSubtreeLocal(cid, dx, dy);
    };

    // Build list of all axon segments (parent→child pairs)
    const axonPairs: Array<[string, string]> = [];
    for (const n of Object.values(neurons)) {
      for (const cid of n.children || []) {
        if (neurons[cid]) axonPairs.push([n.id, cid]);
      }
    }

    for (let pass = 0; pass < 5; pass++) {
      let changed = false;

      for (let i = 0; i < axonPairs.length; i++) {
        for (let j = i + 1; j < axonPairs.length; j++) {
          const [ap, ac] = axonPairs[i];
          const [bp, bc] = axonPairs[j];
          // Skip axons that share an endpoint
          if (ap === bp || ap === bc || ac === bp || ac === bc) continue;

          const apn = neurons[ap], acn = neurons[ac];
          const bpn = neurons[bp], bcn = neurons[bc];
          if (!apn || !acn || !bpn || !bcn) continue;
          if (!segmentsIntersect(apn.x, apn.y, acn.x, acn.y, bpn.x, bpn.y, bcn.x, bcn.y)) continue;

          // Rotate the deeper node's subtree; prefer not touching depth-1 nodes
          const depthA = depths[ac] ?? 1;
          const depthB = depths[bc] ?? 1;
          const [rotId, pivotId] = depthA >= depthB ? [ac, ap] : [bc, bp];
          if (neurons[rotId]?.isCore) continue;

          const pivot = neurons[pivotId]!;
          const rot   = neurons[rotId]!;
          const origAngle = Math.atan2(rot.y - pivot.y, rot.x - pivot.x);
          const dist = Math.hypot(rot.x - pivot.x, rot.y - pivot.y) || 1;

          let resolved = false;
          for (let step = 1; step <= 12 && !resolved; step++) {
            for (const sign of [1, -1] as const) {
              const newAngle = origAngle + sign * step * (Math.PI / 12); // 15° steps
              const newX = Math.round(pivot.x + Math.cos(newAngle) * dist);
              const newY = Math.round(pivot.y + Math.sin(newAngle) * dist);
              const dx = newX - rot.x;
              const dy = newY - rot.y;

              moveSubtreeLocal(rotId, dx, dy);

              // Accept if the original crossing is gone AND no new crossing introduced
              const crossingGone = !segmentsIntersect(apn.x, apn.y, acn.x, acn.y, bpn.x, bpn.y, bcn.x, bcn.y);
              const noNewCrossings = crossingGone && axonPairs.every(([xp, xc], k) => {
                if (k === i || k === j) return true;
                const xpn = neurons[xp], xcn = neurons[xc];
                if (!xpn || !xcn) return true;
                return !segmentsIntersect(pivot.x, pivot.y, rot.x, rot.y, xpn.x, xpn.y, xcn.x, xcn.y);
              });

              if (noNewCrossings) {
                resolved = true;
                changed = true;
                break;
              }

              moveSubtreeLocal(rotId, -dx, -dy); // undo
            }
          }
        }
      }

      if (!changed) break;
    }
  }

  // ── Step 7: Collision avoidance — push overlapping nodes apart ───────────────
  // Runs until fully converged (no overlaps remain), capped at 150 iterations.
  // MIN_GAP increased to 80px so nodes are comfortably separated.
  {
    const allNodes = Object.values(neurons);
    const MIN_GAP = 80;

    for (let iter = 0; iter < 150; iter++) {
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
