import React, { useRef } from 'react';
import type { Neuron, AppState } from './types';
import { getNodeColor, getNodePalette, hslToRgb } from './colors';
import { isNodeVisible } from './utils';
import { clusterMeta } from './worldData';

interface NeuronNodeProps {
  node: Neuron;
  spreadPos: { x: number; y: number } | null;
  currentNeuron: Neuron;
  nodes: Record<string, Neuron>;
  viewMode: string;
  isTransitioning: boolean;
  selectedTarget: string | null;
  clusterId: string;
  currentCluster: string;
  portalPhase: string | null;
  justLanded: boolean;
  swellScale: number;
  epoch: number;
  clusterEnterKey: number;
  nodeIndex: number;
  hoveredId: string | null;
  jiggleMode?: boolean;
  jiggleDragId?: string | null;
  jiggleDragOffsetX?: number;
  jiggleDragOffsetY?: number;
  jiggleDragDescendants?: string[] | null;
  newNodeId?: string | null;
  neuronZoom?: number;
  onHover: (id: string | null) => void;
  onOverlay: (id: string) => void;
  onJump: (clusterId: string, nodeId: string) => void;
  onEnterCluster: (nodeId: string) => void;
  onReturnToParent: () => void;
  dispatch: React.Dispatch<any>;
}

export function NeuronNode({
  node, spreadPos, currentNeuron, nodes, viewMode, isTransitioning,
  selectedTarget, clusterId, currentCluster, portalPhase, justLanded,
  swellScale, epoch, clusterEnterKey, nodeIndex, hoveredId,
  jiggleMode = false, jiggleDragId = null, jiggleDragOffsetX = 0, jiggleDragOffsetY = 0, jiggleDragDescendants = null,
  newNodeId = null, neuronZoom = 1,
  onHover, onOverlay, onJump, onEnterCluster, onReturnToParent, dispatch,
}: NeuronNodeProps) {
  const isActive = node.id === currentNeuron.id && clusterId === currentCluster;
  const isTarget = selectedTarget === node.id;
  const hasParent = clusterMeta[currentCluster]?.parentClusterId != null;
  const isHovered = hoveredId === node.id;
  const isVisible = clusterId !== currentCluster
    ? viewMode === 'cluster'
    : (viewMode === 'cluster' ? true : isNodeVisible(node, currentNeuron, nodes));

  const durationMs = node.isCore ? 12000 : 20000;
  const elapsed = Date.now() - epoch;
  const animDelay = `-${elapsed % durationMs}ms`;
  const isVisuallyActive = isHovered || (isActive && !hoveredId);
  const blobAnim = viewMode === 'cluster' ? 'none' : `blobMorph ${node.isCore ? '12s' : '20s'} ${animDelay} infinite ease-in-out`;

  const color = getNodeColor(node.id, clusterId);
  const basePal = getNodePalette(node.id, clusterId);
  const fillColor = hslToRgb(basePal.h, basePal.s, basePal.l);

  const isClusterLeaf = viewMode === 'cluster' && !node.isCore && (node.children?.length ?? 0) === 0;
  const isNeuronLeaf = viewMode === 'neuron' && !node.isCore && (node.children?.length ?? 0) === 0;

  const nodeDepth = (() => {
    let depth = 0;
    let current = node;
    while (current.parentId && nodes[current.parentId]) {
      depth++;
      current = nodes[current.parentId];
    }
    return depth;
  })();

  const ZOOM_MIN = 0.146;
  const ZOOM_MAX = 2.0;
  const labelFreezeThreshold = ZOOM_MIN + 0.05 * (ZOOM_MAX - ZOOM_MIN);
  const inLastTenPercent = viewMode === 'neuron' && neuronZoom < labelFreezeThreshold;
  const labelScale = inLastTenPercent ? labelFreezeThreshold / neuronZoom : 1;
  const deepLabelOpacity = 1;
  const hideLabelInLastTenPercent = viewMode === 'neuron' && nodeDepth >= 2 && inLastTenPercent;

  const contentHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapZoneRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  const opacity = justLanded ? 1 : (portalPhase && !isActive) ? 0 : isVisible ? 1 : 0;
  if (viewMode === 'neuron' && opacity === 0 && !portalPhase) return null;
  const scale = isClusterLeaf ? 0.7 : 1;

  const BLOB = '52% 48% 60% 40% / 48% 52% 48% 52%';

  const isClusterSubnode = viewMode === 'cluster' && !node.isCore;

  const outerShadow = viewMode === 'cluster'
    ? isClusterSubnode
      ? isVisuallyActive
        ? `0 0 40px 12px rgba(${color},0.35), 0 0 20px 6px rgba(${color},0.2)`
        : `0 0 20px 6px rgba(${color},0.15)`
      : isVisuallyActive
        ? `0 0 150px 50px rgba(${color},0.88), 0 0 75px 25px rgba(${color},0.5)`
        : `0 0 100px 30px rgba(${color},0.4)`
    : isVisuallyActive
      ? `0 0 80px 20px rgba(${color},0.55), 0 0 140px 40px rgba(${color},0.25)`
      : `0 0 40px 8px rgba(${color},0.2)`;

  const innerBorder = viewMode === 'cluster'
    ? isClusterSubnode
      ? isVisuallyActive ? `0 0 0 3px rgba(${color},0.5)` : `0 0 0 2px rgba(${color},0.25)`
      : isVisuallyActive ? `0 0 0 10px rgba(${color},1)` : `0 0 0 8px rgba(${color},0.8)`
    : isVisuallyActive ? `0 0 0 1.5px rgba(${color},0.9)` : `0 0 0 1.5px rgba(${color},0.3)`;

  const posX = (spreadPos ? spreadPos.x : node.x) - node.size / 2;
  const posY = (spreadPos ? spreadPos.y : node.y) - node.size / 2;

  const isBeingDragged = jiggleMode && jiggleDragDescendants !== null && jiggleDragDescendants.includes(node.id);

  const jiggleAnim = jiggleMode && !isBeingDragged
    ? `jiggleWobble 0.2s ease-in-out infinite alternate`
    : undefined;

  const sceneScale = viewMode === 'cluster' ? 0.146 : (neuronZoom ?? 1);
  const dragTranslateX = isBeingDragged ? jiggleDragOffsetX / sceneScale : 0;
  const dragTranslateY = isBeingDragged ? jiggleDragOffsetY / sceneScale : 0;

  return (
    <div
      onMouseEnter={() => { if (!jiggleMode) onHover(node.id); }}
      onMouseLeave={() => { if (!jiggleMode) onHover(null); }}
      onClick={() => {
        if (jiggleMode) return;
        if (viewMode === 'neuron') {
          if (!isActive) dispatch({ type: 'NAVIGATE_TO', cluster: clusterId, nodeId: node.id });
          return;
        }
        if (viewMode === 'cluster') {
          if (node.isCore && hasParent) onReturnToParent();
          else if (node.hasCluster) onEnterCluster(node.id);
          else onJump(clusterId, node.id);
        }
      }}
      className="absolute flex items-center justify-center"
      data-nodeid={node.id}
      style={{
        width: node.size, height: node.size,
        left: posX,
        top: posY,
        opacity,
        transform: isBeingDragged ? `translate(${dragTranslateX}px,${dragTranslateY}px) scale(${scale})` : `scale(${scale})`,
        zIndex: isClusterLeaf ? 1 : 2,
        transition: (portalPhase === 'crossing' || portalPhase === 'landing' || justLanded || jiggleMode)
          ? 'none'
          : 'transform 0.7s ease, opacity 0.35s ease',
        cursor: jiggleMode ? 'grab' : 'pointer',
        animation: newNodeId === node.id
          ? 'newNodeEnter 0.55s cubic-bezier(0.34,1.56,0.64,1) both'
          : (!jiggleAnim && viewMode === 'cluster' && clusterEnterKey > 0)
            ? `clusterNodeEnter 0.55s cubic-bezier(0.34,1.56,0.64,1) ${nodeIndex * 60}ms both`
            : undefined,
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center" style={{
        animation: jiggleAnim,
      }}>
      <div className="absolute inset-0 pointer-events-none z-0" style={{
        animation: viewMode === 'cluster' ? 'none' : isActive ? `${blobAnim}, pulseBreath 3s ease-in-out infinite` : blobAnim,
        borderRadius: viewMode === 'cluster' ? BLOB : undefined,
        boxShadow: outerShadow,
        transition: 'box-shadow 1s ease',
      }} />
      <div className="absolute inset-0 z-10" style={{
        overflow: 'hidden',
        animation: blobAnim,
        borderRadius: viewMode === 'cluster' ? BLOB : undefined,
        background: isClusterSubnode
          ? `radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.75) 70%, rgba(0,0,0,0.95) 100%), radial-gradient(ellipse at 40% 38%, rgba(${fillColor},0.2) 0%, rgba(${fillColor},0.1) 50%, rgba(${fillColor},0.02) 100%), rgb(4,4,8)`
          : `radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0.92) 100%), radial-gradient(ellipse at 40% 38%, rgba(${fillColor},0.55) 0%, rgba(${fillColor},0.3) 50%, rgba(${fillColor},0.08) 100%), rgb(4,4,8)`,
        boxShadow: innerBorder,
        transition: 'box-shadow 0.7s ease',
      }}>
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.95) 100%)',
          animation: (isVisuallyActive && viewMode !== 'cluster') ? 'vignetPulse 3s ease-in-out infinite' : 'none',
        }} />
      </div>
      <div className="absolute inset-0 flex items-center justify-center text-center z-20 pointer-events-none">
        <div ref={tapZoneRef} className="flex flex-col items-center leading-tight" style={{ transformOrigin: 'center', transform: `scale(${labelScale})`, transition: 'transform 200ms ease-out' }}>
          {node.emoji && viewMode !== 'cluster' && (
            <span style={{
              display: 'inline-block',
              fontSize: '32.7px',
              lineHeight: 1,
              marginBottom: '7px',
              filter: `sepia(1) saturate(2) hue-rotate(${basePal.h - 35}deg) drop-shadow(0 0 8px rgba(${fillColor},0.8))`,
              opacity: 0.92,
            }}>{node.emoji}</span>
          )}
          {(viewMode !== 'cluster' || node.isCore || (node.children?.length ?? 0) > 0 || nodes[node.parentId ?? '']?.isCore) && !hideLabelInLastTenPercent && node.label.split(/\n| & /).map((line, i, arr) => (
            <span key={i} className="block uppercase font-bold text-white whitespace-nowrap" style={{
              fontSize: viewMode === 'cluster' ? (node.isCore ? '68px' : isClusterLeaf ? '30.6px' : '42.5px') : `${(node.size * 0.1238).toFixed(1)}px`,
              letterSpacing: viewMode === 'cluster' ? (node.isCore ? '0.20em' : '0.18em') : (node.isCore ? '0.30em' : '0.255em'),
              textShadow: '0 2px 16px rgba(0,0,0,1)',
              lineHeight: '1.4',
              borderBottom: (node.content && i === arr.length - 1 && viewMode !== 'cluster') ? '1px solid rgba(255,255,255,0.35)' : 'none',
              paddingBottom: (node.content && viewMode !== 'cluster') ? '1px' : '0',
              opacity: nodeDepth >= 2 ? deepLabelOpacity : 1,
              transition: 'opacity 120ms linear',
            }}>
              {line}{!node.label.includes('\n') && node.label.includes('&') && i < arr.length - 1 ? ' &' : ''}
            </span>
          ))}
        </div>
      </div>
      {isActive && viewMode === 'neuron' && node.content && (
        <div className="absolute inset-0 z-30"
          onPointerDown={(e) => {
            e.stopPropagation();
            pointerStart.current = { x: e.clientX, y: e.clientY };
            if (tapZoneRef.current) { tapZoneRef.current.style.transition = 'transform 80ms ease-out'; tapZoneRef.current.style.transform = 'scale(1.04)'; }
            contentHoldTimer.current = setTimeout(() => {
              if (tapZoneRef.current) { tapZoneRef.current.style.transition = 'transform 500ms ease-out'; tapZoneRef.current.style.transform = 'scale(1.15)'; }
            }, 80);
          }}
          onPointerMove={(e) => {
            if (!pointerStart.current) return;
            if (Math.hypot(e.clientX - pointerStart.current.x, e.clientY - pointerStart.current.y) > 8) {
              clearTimeout(contentHoldTimer.current!);
              pointerStart.current = null;
              if (tapZoneRef.current) { tapZoneRef.current.style.transition = 'transform 200ms ease-out'; tapZoneRef.current.style.transform = 'scale(1)'; }
            }
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            clearTimeout(contentHoldTimer.current!);
            if (tapZoneRef.current) { tapZoneRef.current.style.transition = 'transform 200ms ease-out'; tapZoneRef.current.style.transform = 'scale(1)'; }
            if (!pointerStart.current) return;
            pointerStart.current = null;
            onOverlay(node.id);
          }}
          onPointerLeave={() => {
            clearTimeout(contentHoldTimer.current!);
            pointerStart.current = null;
            if (tapZoneRef.current) { tapZoneRef.current.style.transition = 'transform 200ms ease-out'; tapZoneRef.current.style.transform = 'scale(1)'; }
          }}
        />
      )}
      </div>
    </div>
  );
}
