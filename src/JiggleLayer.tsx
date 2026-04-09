import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import type { Neuron } from './types';
import { worlds, clusterMeta, GALAXY_MAPS, CLUSTER_LISTS, _worldColorCache } from './worldData';
import { getNodeColor, getNodePalette, hslToRgb } from './colors';
import { reflowNeurons, generateNodeId, repositionSubtreeUnderNewParent } from './utils';
import { saveWorldToStorage, saveMapToStorage } from './storage';
import { spreadClusterY } from './utils';
import { pushUndo } from './undoHistory';

const COLOR_PRESETS: { h: number; s: number; l: number }[] = [
  { h: 4,   s: 84, l: 60 },
  { h: 24,  s: 90, l: 58 },
  { h: 42,  s: 95, l: 55 },
  { h: 72,  s: 78, l: 48 },
  { h: 142, s: 70, l: 45 },
  { h: 168, s: 75, l: 46 },
  { h: 195, s: 82, l: 50 },
  { h: 214, s: 85, l: 58 },
  { h: 240, s: 72, l: 62 },
  { h: 280, s: 68, l: 62 },
  { h: 322, s: 74, l: 58 },
  { h: 350, s: 80, l: 62 },
];

interface DragState {
  nodeId: string;
  startPointerX: number;
  startPointerY: number;
  startNodeX: number;
  startNodeY: number;
  currentPointerX: number;
  currentPointerY: number;
  overTargetId: string | null;
  overDropZone: boolean;
}

interface SnapAnim {
  nodeId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startTime: number;
}

export interface JiggleDragState {
  nodeId: string;
  screenDx: number;
  screenDy: number;
  descendants: string[];
}

interface JiggleLayerProps {
  currentCluster: string;
  activeId: string;
  viewMode: string;
  jiggleMode: boolean;
  neuronZoom: number;
  panOffset: { x: number; y: number } | null;
  onExitJiggle: () => void;
  onWorldChanged: () => void;
  worldVersion?: number;
  onDragChange?: (drag: JiggleDragState | null) => void;
  onPanChange?: (pan: { x: number; y: number } | null) => void;
  onRequestAddNode?: (parentId: string) => void;
  onInsight?: (nodeId: string) => void;
  dispatch: React.Dispatch<any>;
}

const DRAG_THRESHOLD = 8;
const SNAP_DURATION = 420;
const DRAG_SNAP_EASE = 0.18;

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function collectDescendants(neurons: Record<string, Neuron>, id: string): string[] {
  const result: string[] = [id];
  const node = neurons[id];
  for (const cid of node?.children || []) {
    result.push(...collectDescendants(neurons, cid));
  }
  return result;
}

export function JiggleLayer({ currentCluster, activeId, viewMode, jiggleMode, neuronZoom, panOffset, onExitJiggle, onWorldChanged, worldVersion: _worldVersion, onDragChange, onPanChange, onRequestAddNode, onInsight, dispatch }: JiggleLayerProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [snapAnim, setSnapAnim] = useState<SnapAnim | null>(null);
  const [snapPos, setSnapPos] = useState<{ x: number; y: number } | null>(null);
  const [colorPickerNodeId, setColorPickerNodeId] = useState<string | null>(null);
  const dragSnapOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragSnapTargetRef = useRef<{ x: number; y: number } | null>(null);
  const dragSnapAnimRef = useRef<number | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const draggingNodeIdRef = useRef<string | null>(null);
  const dragLockedSizeRef = useRef<number | null>(null);
  const nodeButtonsElemsRef = useRef<Map<string, HTMLElement>>(new Map());
  const animFrameRef = useRef<number | null>(null);
  const panAnimRef = useRef<number | null>(null);
  const panAccum = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const justActivatedRef = useRef(false);
  const nodeElemsRef = useRef<Map<string, HTMLElement>>(new Map());
  const liveDragRef = useRef<{ dx: number; dy: number; descendants: string[] } | null>(null);

  dragRef.current = drag;

  const startDragSnapLoop = useCallback(() => {
    if (dragSnapAnimRef.current) return;
    const tick = () => {
      const target = dragSnapTargetRef.current;
      const cur = dragSnapOffsetRef.current;
      if (target) {
        const nx = cur.x + (target.x - cur.x) * DRAG_SNAP_EASE;
        const ny = cur.y + (target.y - cur.y) * DRAG_SNAP_EASE;
        dragSnapOffsetRef.current = { x: nx, y: ny };
      } else {
        const nx = cur.x + (0 - cur.x) * DRAG_SNAP_EASE;
        const ny = cur.y + (0 - cur.y) * DRAG_SNAP_EASE;
        dragSnapOffsetRef.current = { x: nx, y: ny };
      }
      dragSnapAnimRef.current = requestAnimationFrame(tick);
    };
    dragSnapAnimRef.current = requestAnimationFrame(tick);
  }, []);

  const stopDragSnapLoop = useCallback(() => {
    if (dragSnapAnimRef.current) {
      cancelAnimationFrame(dragSnapAnimRef.current);
      dragSnapAnimRef.current = null;
    }
    dragSnapTargetRef.current = null;
    dragSnapOffsetRef.current = { x: 0, y: 0 };
  }, []);

  useEffect(() => {
    if (!snapAnim) return;
    let running = true;
    const tick = () => {
      if (!running) return;
      const elapsed = Date.now() - snapAnim.startTime;
      const t = Math.min(1, elapsed / SNAP_DURATION);
      const ease = easeOutBack(t);
      setSnapPos({
        x: snapAnim.fromX + (snapAnim.toX - snapAnim.fromX) * ease,
        y: snapAnim.fromY + (snapAnim.toY - snapAnim.fromY) * ease,
      });
      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        setSnapAnim(null);
        setSnapPos(null);
      }
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [snapAnim]);

  const getSceneScale = useCallback(() => {
    return viewMode === 'cluster' ? 0.146 : neuronZoom;
  }, [viewMode, neuronZoom]);

  const screenToScene = useCallback((screenX: number, screenY: number, nodeX: number, nodeY: number) => {
    const scale = getSceneScale();
    const vw = window.innerWidth / 2;
    const vh = window.innerHeight / 2;
    if (viewMode === 'cluster') {
      return {
        x: (screenX - vw) / scale,
        y: (screenY - vh) / scale,
      };
    }
    return {
      x: (screenX - vw) / scale + nodeX,
      y: (screenY - vh) / scale + nodeY,
    };
  }, [viewMode]);

  const handlePointerDown = useCallback((e: React.PointerEvent, nodeId: string) => {
    if (!jiggleMode) return;
    const neurons = worlds[currentCluster]?.neurons;
    if (!neurons?.[nodeId] || neurons[nodeId].isCore) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const node = neurons[nodeId];
    dragSnapTargetRef.current = null;
    dragSnapOffsetRef.current = { x: 0, y: 0 };
    draggingNodeIdRef.current = nodeId;
    dragLockedSizeRef.current = node.size * getSceneScale();
    const btnEl = nodeButtonsElemsRef.current.get(nodeId);
    if (btnEl) btnEl.style.visibility = 'hidden';
    const descendants = collectDescendants(neurons, nodeId);
    liveDragRef.current = { dx: 0, dy: 0, descendants };
    startDragSnapLoop();
    setDrag({
      nodeId,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startNodeX: node.x,
      startNodeY: node.y,
      currentPointerX: e.clientX,
      currentPointerY: e.clientY,
      overTargetId: null,
      overDropZone: false,
    });
  }, [jiggleMode, currentCluster, startDragSnapLoop]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag) return;
    e.stopPropagation();
    const neurons = worlds[currentCluster]?.neurons;
    if (!neurons) return;
    const scale = getSceneScale();
    const screenDx = e.clientX - drag.startPointerX;
    const screenDy = e.clientY - drag.startPointerY;
    if (Math.hypot(screenDx, screenDy) > DRAG_THRESHOLD) {
      const descendants = liveDragRef.current?.descendants ?? [drag.nodeId];
      onDragChange?.({ nodeId: drag.nodeId, screenDx, screenDy, descendants });
    }

    if (viewMode === 'neuron') {
      const EDGE = 80;
      const SPEED = 18;
      const W = window.innerWidth;
      const H = window.innerHeight;
      let panX = 0, panY = 0;
      if (e.clientX < EDGE) panX = ((EDGE - e.clientX) / EDGE) * SPEED;
      else if (e.clientX > W - EDGE) panX = -((e.clientX - (W - EDGE)) / EDGE) * SPEED;
      if (e.clientY < EDGE) panY = ((EDGE - e.clientY) / EDGE) * SPEED;
      else if (e.clientY > H - EDGE) panY = -((e.clientY - (H - EDGE)) / EDGE) * SPEED;

      if (panX !== 0 || panY !== 0) {
        if (!panAnimRef.current) {
          const panTick = () => {
            if (!dragRef.current) { panAnimRef.current = null; return; }
            panAccum.current.x += panX;
            panAccum.current.y += panY;
            onPanChange?.({ x: panAccum.current.x, y: panAccum.current.y });
            const cur = dragRef.current;
            if (cur) {
              const newScreenDx = cur.currentPointerX - cur.startPointerX;
              const newScreenDy = cur.currentPointerY - cur.startPointerY;
              const descendants = liveDragRef.current?.descendants ?? [cur.nodeId];
              onDragChange?.({ nodeId: cur.nodeId, screenDx: newScreenDx, screenDy: newScreenDy, descendants });
            }
            panAnimRef.current = requestAnimationFrame(panTick);
          };
          panAnimRef.current = requestAnimationFrame(panTick);
        }
      } else {
        if (panAnimRef.current) { cancelAnimationFrame(panAnimRef.current); panAnimRef.current = null; }
      }
    }
    const ddx = (e.clientX - drag.startPointerX) / scale;
    const ddy = (e.clientY - drag.startPointerY) / scale;
    const newNodeX = drag.startNodeX + ddx;
    const newNodeY = drag.startNodeY + ddy;

    const vw = window.innerWidth / 2;
    const vh = window.innerHeight / 2;

    let overTargetId: string | null = null;
    const descendants = new Set(collectDescendants(neurons, drag.nodeId));
    const activeNeuron = neurons[activeId] ?? Object.values(neurons).find(n => n.isCore);
    const offsetX = panOffset ? panOffset.x : (activeNeuron?.x ?? 0);
    const offsetY = panOffset ? panOffset.y : (activeNeuron?.y ?? 0);

    for (const [nid, node] of Object.entries(neurons)) {
      if (nid === drag.nodeId || descendants.has(nid)) continue;
      const nodeScreenX = vw + (node.x - offsetX) * scale;
      const nodeScreenY = vh + (node.y - offsetY) * scale;
      const dist = Math.hypot(e.clientX - nodeScreenX, e.clientY - nodeScreenY);
      const hitRadius = (node.size / 2) * scale * 0.85;
      if (dist < hitRadius + 20) {
        overTargetId = nid;
        break;
      }
    }

    const dx = e.clientX - drag.startPointerX;
    const dy = e.clientY - drag.startPointerY;
    const moved = Math.hypot(dx, dy) > DRAG_THRESHOLD;
    if (liveDragRef.current && moved) {
      liveDragRef.current.dx = dx;
      liveDragRef.current.dy = dy;
      for (const nid of liveDragRef.current.descendants) {
        const el = nodeElemsRef.current.get(nid);
        if (el) {
          el.style.transform = `translate(${dx}px,${dy}px)`;
        }
      }
    }

    const cur = dragRef.current;
    if (!cur) return;
    setDrag({
      ...cur,
      currentPointerX: e.clientX,
      currentPointerY: e.clientY,
      overTargetId,
      overDropZone: false,
    });
  }, [drag, currentCluster, viewMode, activeId, getSceneScale, onDragChange, onPanChange]);

  const clearLiveDrag = useCallback(() => {
    if (liveDragRef.current) {
      for (const nid of liveDragRef.current.descendants) {
        const el = nodeElemsRef.current.get(nid);
        if (el) el.style.transform = '';
      }
      liveDragRef.current = null;
    }
  }, []);

  const handlePointerUp = useCallback(async (e: React.PointerEvent) => {
    if (!drag) return;
    e.stopPropagation();
    draggingNodeIdRef.current = null;
    dragLockedSizeRef.current = null;
    clearLiveDrag();
    const draggedNodeId = drag.nodeId;
    const restoreButtons = () => {
      requestAnimationFrame(() => {
        const btnEl = nodeButtonsElemsRef.current.get(draggedNodeId);
        if (btnEl) btnEl.style.visibility = '';
      });
    };
    const neurons = worlds[currentCluster]?.neurons;
    if (!neurons) { restoreButtons(); setDrag(null); return; }

    const rawDdx = (e.clientX - drag.startPointerX);
    const rawDdy = (e.clientY - drag.startPointerY);
    const ddx = rawDdx + panAccum.current.x;
    const ddy = rawDdy + panAccum.current.y;
    const moved = Math.hypot(rawDdx, rawDdy) > DRAG_THRESHOLD;

    if (panAnimRef.current) { cancelAnimationFrame(panAnimRef.current); panAnimRef.current = null; }
    stopDragSnapLoop();
    if (!moved) {
      restoreButtons();
      setDrag(null);
      onDragChange?.(null);
      onPanChange?.(null);
      panAccum.current = { x: 0, y: 0 };
      return;
    }

    const scale = getSceneScale();
    const sceneDdx = ddx / scale;
    const sceneDdy = ddy / scale;

    if (drag.overTargetId) {
      const targetId = drag.overTargetId;
      const draggedNode = neurons[drag.nodeId];
      const oldParentId = draggedNode.parentId;
      const descendants = new Set(collectDescendants(neurons, drag.nodeId));

      if (!descendants.has(targetId) && targetId !== drag.nodeId) {
        pushUndo(currentCluster);
        if (oldParentId && neurons[oldParentId]) {
          neurons[oldParentId].children = (neurons[oldParentId].children || []).filter(c => c !== drag.nodeId);
        }
        draggedNode.parentId = targetId;
        const targetNode = neurons[targetId];
        if (!targetNode.children) targetNode.children = [];
        if (!targetNode.children.includes(drag.nodeId)) targetNode.children.push(drag.nodeId);

        reflowNeurons(neurons, true);

        const fromX = drag.startNodeX + sceneDdx;
        const fromY = drag.startNodeY + sceneDdy;
        draggedNode.x = Math.round(fromX);
        draggedNode.y = Math.round(fromY);

        repositionSubtreeUnderNewParent(neurons, drag.nodeId, targetId);

        setSnapAnim({
          nodeId: drag.nodeId,
          fromX,
          fromY,
          toX: draggedNode.x,
          toY: draggedNode.y,
          startTime: Date.now(),
        });
        setDrag(null);
        onDragChange?.(null);
        onPanChange?.(null);
        panAccum.current = { x: 0, y: 0 };

        Object.keys(_worldColorCache).forEach(k => delete _worldColorCache[k]);
        await saveWorldToStorage(currentCluster);
        onWorldChanged();
        restoreButtons();
        return;
      }
    }

    const newX = drag.startNodeX + sceneDdx;
    const newY = drag.startNodeY + sceneDdy;
    const offsetX = newX - drag.startNodeX;
    const offsetY = newY - drag.startNodeY;
    pushUndo(currentCluster);
    moveNodeAndChildren(neurons, drag.nodeId, offsetX, offsetY);

    Object.keys(_worldColorCache).forEach(k => delete _worldColorCache[k]);
    await saveWorldToStorage(currentCluster);
    onWorldChanged();
    restoreButtons();
    setDrag(null);
    onDragChange?.(null);
    onPanChange?.(null);
    panAccum.current = { x: 0, y: 0 };
  }, [drag, currentCluster, viewMode, getSceneScale, onWorldChanged, onExitJiggle, onDragChange, onPanChange, dispatch, stopDragSnapLoop]);

  const handleDelete = useCallback(async (nodeId: string) => {
    const neurons = worlds[currentCluster]?.neurons;
    if (!neurons?.[nodeId] || neurons[nodeId].isCore) return;
    const node = neurons[nodeId];
    pushUndo(currentCluster);
    const idsToDelete = new Set(collectDescendants(neurons, nodeId));
    if (node.parentId && neurons[node.parentId]) {
      neurons[node.parentId].children = (neurons[node.parentId].children || []).filter(c => !idsToDelete.has(c));
    }
    idsToDelete.forEach(id => delete neurons[id]);
    Object.keys(_worldColorCache).forEach(k => delete _worldColorCache[k]);
    await saveWorldToStorage(currentCluster);
    onWorldChanged();
    dispatch({ type: 'NAVIGATE_TO', cluster: currentCluster, nodeId: node.parentId && neurons[node.parentId] ? node.parentId : 'core' });
  }, [currentCluster, onWorldChanged, dispatch]);

  const handleSetNodeColor = useCallback(async (nodeId: string, color: { h: number; s: number; l: number } | null) => {
    const neurons = worlds[currentCluster]?.neurons;
    if (!neurons?.[nodeId]) return;
    pushUndo(currentCluster);
    if (color === null) {
      delete neurons[nodeId].color;
    } else {
      neurons[nodeId].color = color;
    }
    Object.keys(_worldColorCache).forEach(k => delete _worldColorCache[k]);
    await saveWorldToStorage(currentCluster);
    onWorldChanged();
    setColorPickerNodeId(null);
  }, [currentCluster, onWorldChanged]);

  useEffect(() => {
    if (jiggleMode) {
      justActivatedRef.current = true;
      const t = setTimeout(() => { justActivatedRef.current = false; }, 600);
      return () => clearTimeout(t);
    }
  }, [jiggleMode]);

  if (!jiggleMode || viewMode === 'cluster') return null;

  const neurons = worlds[currentCluster]?.neurons;
  if (!neurons) return null;

  const scale = getSceneScale();
  const vw = window.innerWidth / 2;
  const vh = window.innerHeight / 2;

  let spreadPos: Record<string, { x: number; y: number }> = {};
  if (viewMode === 'cluster') {
    spreadPos = spreadClusterY(neurons);
  }

  const activeNode = neurons[activeId] ?? Object.values(neurons).find(n => n.isCore);
  const activeOffsetX = panOffset ? panOffset.x : (activeNode?.x ?? 0);
  const activeOffsetY = panOffset ? panOffset.y : (activeNode?.y ?? 0);

  const coreNode = Object.values(neurons).find(n => n.isCore);
  const branchNodeIds = new Set(coreNode?.children ?? []);

  const dragDescendants = drag ? new Set(collectDescendants(neurons, drag.nodeId)) : new Set<string>();
  const ddx = drag ? (drag.currentPointerX - drag.startPointerX) / scale : 0;
  const ddy = drag ? (drag.currentPointerY - drag.startPointerY) / scale : 0;
  const dragMoved = drag ? Math.hypot(drag.currentPointerX - drag.startPointerX, drag.currentPointerY - drag.startPointerY) > DRAG_THRESHOLD : false;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ zIndex: 100, pointerEvents: 'none' }}
    >
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'all',
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => {
          e.stopPropagation();
          if (colorPickerNodeId) { setColorPickerNodeId(null); return; }
          if (!justActivatedRef.current) onExitJiggle();
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      />
      {Object.values(neurons).map((node) => {
        let baseX: number, baseY: number;
        if (viewMode === 'cluster') {
          const pos = spreadPos[node.id] ?? node;
          baseX = vw + pos.x * scale;
          baseY = vh + pos.y * scale;
        } else {
          baseX = vw + (node.x - activeOffsetX) * scale;
          baseY = vh + (node.y - activeOffsetY) * scale;
        }

        let renderX = baseX;
        let renderY = baseY;

        const isBeingDraggedNode = !node.isCore && drag && dragMoved && dragDescendants.has(node.id);

        if (!node.isCore) {
          if (snapAnim && snapAnim.nodeId === node.id && snapPos) {
            if (viewMode === 'cluster') {
              renderX = vw + snapPos.x * scale;
              renderY = vh + snapPos.y * scale;
            } else {
              renderX = vw + (snapPos.x - activeOffsetX) * scale;
              renderY = vh + (snapPos.y - activeOffsetY) * scale;
            }
          }
        }

        const isDragging = !node.isCore && drag?.nodeId === node.id && dragMoved;
        const isOverTarget = !node.isCore && drag?.nodeId === node.id && drag.overTargetId != null && dragMoved;
        const isDropTarget = !node.isCore && drag?.overTargetId === node.id && dragMoved;

        const nodeSize = (node.id === draggingNodeIdRef.current && dragLockedSizeRef.current !== null)
          ? dragLockedSizeRef.current
          : node.size * scale;
        const color = getNodeColor(node.id, currentCluster);

        const btnSize = Math.min(36, Math.max(18, nodeSize * 0.26));

        return (
          <div
            key={node.id}
            ref={(el) => {
              if (el) nodeElemsRef.current.set(node.id, el);
              else nodeElemsRef.current.delete(node.id);
            }}
            style={{
              position: 'absolute',
              left: renderX - nodeSize / 2,
              top: renderY - nodeSize / 2,
              width: nodeSize,
              height: nodeSize,
              pointerEvents: node.isCore ? 'none' : 'all',
              zIndex: isDragging ? 200 : 10,
              animation: (!isDragging && !node.isCore && !isBeingDraggedNode) ? `jiggleWobble 0.2s ease-in-out infinite alternate` : 'none',
              transform: isDropTarget ? 'scale(1.2)' : 'scale(1)',
              transition: isBeingDraggedNode ? 'none' : (isDragging ? 'transform 0.15s ease' : 'transform 0.2s ease'),
              filter: isDragging ? 'brightness(1.3)' : isDropTarget ? 'brightness(1.4)' : 'brightness(1)',
              willChange: isBeingDraggedNode ? 'transform' : undefined,
            }}
            onPointerDown={(e) => !node.isCore && handlePointerDown(e, node.id)}
            onPointerMove={!node.isCore ? handlePointerMove : undefined}
            onPointerUp={!node.isCore ? handlePointerUp : undefined}
            onPointerCancel={!node.isCore ? () => {
              clearLiveDrag(); stopDragSnapLoop(); setDrag(null); onDragChange?.(null); onPanChange?.(null); panAccum.current = { x: 0, y: 0 };
              requestAnimationFrame(() => { const el = nodeButtonsElemsRef.current.get(node.id); if (el) el.style.visibility = ''; });
            } : undefined}
          >
            {isDropTarget && (
              <div style={{
                position: 'absolute',
                inset: -4,
                borderRadius: '50%',
                border: `2px solid rgba(${color},0.9)`,
                boxShadow: `0 0 20px 6px rgba(${color},0.5)`,
                animation: 'dropTargetPulse 0.6s ease-in-out infinite alternate',
                pointerEvents: 'none',
              }} />
            )}

            <div
              ref={(el) => { if (el) nodeButtonsElemsRef.current.set(node.id, el); else nodeButtonsElemsRef.current.delete(node.id); }}
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
            >
            {!node.isCore && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: btnSize,
                  height: btnSize,
                  borderRadius: '50%',
                  background: 'rgba(80,80,80,0.92)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  zIndex: 300,
                  transform: 'translate(-25%, -25%)',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
                  pointerEvents: 'all',
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  handleDelete(node.id);
                }}
              >
                <div style={{
                  width: Math.round(btnSize * 0.45),
                  height: 1.5,
                  borderRadius: 1,
                  background: 'rgba(255,255,255,0.95)',
                  pointerEvents: 'none',
                }} />
              </div>
            )}

            <div
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: btnSize,
                height: btnSize,
                zIndex: 300,
                transform: 'translate(25%, -25%)',
                animation: node.isCore ? `jiggleWobble 0.2s ease-in-out infinite alternate` : 'none',
                pointerEvents: 'all',
              }}
            >
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                background: 'rgba(80,80,80,0.92)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onRequestAddNode?.(node.id);
              }}
            >
              <div style={{
                width: Math.round(btnSize * 0.45),
                height: 1.5,
                borderRadius: 1,
                background: 'rgba(255,255,255,0.95)',
                pointerEvents: 'none',
              }} />
              <div style={{
                position: 'absolute',
                width: 1.5,
                height: Math.round(btnSize * 0.45),
                borderRadius: 1,
                background: 'rgba(255,255,255,0.95)',
                pointerEvents: 'none',
              }} />
            </div>
            </div>

            <div
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: btnSize,
                height: btnSize,
                zIndex: 300,
                transform: 'translate(25%, 25%)',
                pointerEvents: 'all',
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  background: node.content ? `rgba(${color},0.75)` : 'rgba(80,80,80,0.92)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: node.content ? `0 1px 6px rgba(${color},0.4)` : '0 1px 4px rgba(0,0,0,0.5)',
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onInsight?.(node.id);
                }}
              >
                <svg width={Math.round(btnSize * 0.48)} height={Math.round(btnSize * 0.48)} viewBox="0 0 16 16" fill="none" style={{ pointerEvents: 'none' }}>
                  <path d="M8 1.5a4.5 4.5 0 0 0-1.5 8.74V11.5a.5.5 0 0 0 .5.5h2a.5.5 0 0 0 .5-.5v-1.26A4.5 4.5 0 0 0 8 1.5Z" stroke="rgba(255,255,255,0.95)" strokeWidth="1.2" fill="none"/>
                  <line x1="6.5" y1="13" x2="9.5" y2="13" stroke="rgba(255,255,255,0.95)" strokeWidth="1.2" strokeLinecap="round"/>
                  <line x1="7" y1="14.5" x2="9" y2="14.5" stroke="rgba(255,255,255,0.95)" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
              </div>
            </div>

            {true && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  width: btnSize,
                  height: btnSize,
                  zIndex: 300,
                  transform: 'translate(-25%, 25%)',
                  pointerEvents: 'all',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                    background: node.color ? `rgba(${hslToRgb(node.color.h, node.color.s, node.color.l)},0.9)` : `rgba(${color},0.75)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: `0 1px 6px rgba(${color},0.4)`,
                    border: node.color ? '2px solid rgba(255,255,255,0.6)' : '2px solid rgba(255,255,255,0.2)',
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setColorPickerNodeId(prev => prev === node.id ? null : node.id);
                  }}
                >
                  <svg width={Math.round(btnSize * 0.52)} height={Math.round(btnSize * 0.52)} viewBox="0 0 16 16" fill="none" style={{ pointerEvents: 'none' }}>
                    <circle cx="8" cy="8" r="3" fill="rgba(255,255,255,0.9)"/>
                    <circle cx="8" cy="2" r="1.5" fill="rgba(255,255,255,0.7)"/>
                    <circle cx="8" cy="14" r="1.5" fill="rgba(255,255,255,0.7)"/>
                    <circle cx="2" cy="8" r="1.5" fill="rgba(255,255,255,0.7)"/>
                    <circle cx="14" cy="8" r="1.5" fill="rgba(255,255,255,0.7)"/>
                    <circle cx="3.76" cy="3.76" r="1.5" fill="rgba(255,255,255,0.7)"/>
                    <circle cx="12.24" cy="12.24" r="1.5" fill="rgba(255,255,255,0.7)"/>
                    <circle cx="12.24" cy="3.76" r="1.5" fill="rgba(255,255,255,0.7)"/>
                    <circle cx="3.76" cy="12.24" r="1.5" fill="rgba(255,255,255,0.7)"/>
                  </svg>
                </div>

                {colorPickerNodeId === node.id && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '100%',
                      left: '50%',
                      transform: 'translateX(-50%) translateY(-8px)',
                      background: 'rgba(18,18,22,0.96)',
                      backdropFilter: 'blur(16px)',
                      borderRadius: 16,
                      padding: '10px',
                      zIndex: 500,
                      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      pointerEvents: 'all',
                      width: 'max-content',
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(6, 1fr)',
                      gap: 6,
                      marginBottom: node.color ? 8 : 0,
                    }}>
                      {COLOR_PRESETS.map((preset, idx) => {
                        const rgb = hslToRgb(preset.h, preset.s, preset.l);
                        const isSelected = node.color && node.color.h === preset.h && node.color.s === preset.s && node.color.l === preset.l;
                        return (
                          <div
                            key={idx}
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: '50%',
                              background: `rgb(${rgb})`,
                              cursor: 'pointer',
                              border: isSelected ? '2.5px solid rgba(255,255,255,0.95)' : '2px solid rgba(255,255,255,0.15)',
                              boxShadow: isSelected ? `0 0 8px rgba(${rgb},0.8)` : 'none',
                              transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                              transition: 'transform 0.12s ease, box-shadow 0.12s ease',
                            }}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              handleSetNodeColor(node.id, preset);
                            }}
                          />
                        );
                      })}
                    </div>
                    {node.color && (
                      <div
                        style={{
                          textAlign: 'center',
                          fontSize: 9,
                          letterSpacing: '0.15em',
                          textTransform: 'uppercase',
                          color: 'rgba(255,255,255,0.45)',
                          cursor: 'pointer',
                          padding: '2px 0 0',
                        }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          handleSetNodeColor(node.id, null);
                        }}
                      >
                        Reset
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
        );
      })}

      <div style={{
        position: 'fixed',
        top: 'max(16px, env(safe-area-inset-top))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 600,
        pointerEvents: 'all',
      }}>
        <button
          onClick={onExitJiggle}
          style={{
            padding: '8px 20px',
            borderRadius: 20,
            border: '1px solid rgba(255,255,255,0.3)',
            background: 'rgba(0,0,0,0.6)',
            color: 'rgba(255,255,255,0.9)',
            fontSize: 10,
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            backdropFilter: 'blur(10px)',
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

function moveNodeAndChildren(neurons: Record<string, Neuron>, nodeId: string, dx: number, dy: number) {
  const node = neurons[nodeId];
  if (!node) return;
  node.x = Math.round(node.x + dx);
  node.y = Math.round(node.y + dy);
  for (const cid of node.children || []) {
    moveNodeAndChildren(neurons, cid, dx, dy);
  }
}

function applyChildSizeChange(neurons: Record<string, Neuron>, children: string[], delta: number) {
  for (const cid of children) {
    const n = neurons[cid];
    if (!n) continue;
    n.size = Math.max(80, Math.round(n.size + delta * 0.74));
    applyChildSizeChange(neurons, n.children || [], delta);
  }
}

async function splitOffAsNewMap(
  nodeId: string,
  sourceClusterId: string,
  onWorldChanged: () => void,
  dispatch: React.Dispatch<any>,
) {
  const sourceNeurons = worlds[sourceClusterId]?.neurons;
  if (!sourceNeurons?.[nodeId]) return;

  const sourceNode = sourceNeurons[nodeId];
  const newClusterId = generateNodeId();
  const newMapId = generateNodeId();
  const newLabel = sourceNode.label.toUpperCase();

  const descendantIds = collectDescendants(sourceNeurons, nodeId);
  const newNeurons: Record<string, Neuron> = {};

  const coreId = 'core';
  newNeurons[coreId] = {
    ...JSON.parse(JSON.stringify(sourceNode)),
    id: coreId,
    isCore: true,
    parentId: null,
    x: 0,
    y: 0,
  };

  const idMap: Record<string, string> = { [nodeId]: coreId };
  for (const did of descendantIds) {
    if (did === nodeId) continue;
    const newId = generateNodeId();
    idMap[did] = newId;
  }

  const descendantSet2 = new Set(descendantIds);
  for (const did of descendantIds) {
    if (did === nodeId) continue;
    const orig = sourceNeurons[did];
    const newId = idMap[did];
    newNeurons[newId] = {
      ...JSON.parse(JSON.stringify(orig)),
      id: newId,
      parentId: idMap[orig.parentId ?? nodeId] ?? coreId,
      children: (orig.children || []).filter(c => descendantSet2.has(c)).map(c => idMap[c]).filter(Boolean),
    };
  }

  newNeurons[coreId].children = (sourceNode.children || []).filter(c => descendantSet2.has(c)).map(c => idMap[c]).filter(Boolean);

  const newWorld = {
    label: newLabel,
    neurons: newNeurons,
  };

  reflowNeurons(newNeurons);

  const existingMap = GALAXY_MAPS.find(m => m.rootCluster === sourceClusterId);
  const existingMapId = existingMap?.id ?? 'work';
  const existingClusterIds: string[] = CLUSTER_LISTS[existingMapId] ?? [sourceClusterId];

  const newMapDef = {
    id: newMapId,
    label: newLabel,
    rootCluster: newClusterId,
    clusterIds: [newClusterId],
  };

  const newClusterMeta = {
    parentClusterId: null,
    siblings: [],
    returnTarget: null,
    ancestorCrumbs: [],
  };

  if (sourceNode.parentId && sourceNeurons[sourceNode.parentId]) {
    sourceNeurons[sourceNode.parentId].children = (sourceNeurons[sourceNode.parentId].children || []).filter(c => c !== nodeId);
  }
  const descendantSet = new Set(descendantIds);
  descendantSet.forEach(id => delete sourceNeurons[id]);

  Object.keys(_worldColorCache).forEach(k => delete _worldColorCache[k]);
  await saveWorldToStorage(sourceClusterId);
  await saveMapToStorage(
    newMapDef,
    { [newClusterId]: newWorld },
    { [newClusterId]: newClusterMeta },
  );

  onWorldChanged();
  dispatch({ type: 'NAVIGATE_GALAXY' });
}
