// Feature flag: set to true to disable cluster view and use zoom-based navigation instead
const DISABLE_CLUSTER_VIEW = true;

const GALAXY_COLOR_PRESETS: { h: number; s: number; l: number }[] = [
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

import React, { useMemo, useReducer, useRef, useEffect, useCallback, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { NeuronNode } from './NeuronNode';
import { IntroScreen } from './IntroScreen';
import { BottomBar } from './BottomBar';
import { JiggleLayer } from './JiggleLayer';
import type { JiggleDragState } from './JiggleLayer';
import { AddNodeModal } from './AddNodeModal';
import { AddMapModal } from './AddMapModal';
import { InsightOverlay } from './InsightOverlay';
import { StarField } from './StarField';
import { AuthBanner } from './AuthBanner';
import { getNodeColor, getNodePalette, hslToRgb } from './colors';
import { worlds, clusterMeta, GALAXY_MAPS, CLUSTER_LISTS, _worldColorCache } from './worldData';
import { loadFromStorage, saveWorldToStorage, deleteMapFromStorage, saveMapToStorage, saveGalaxyIndexToStorage } from './storage';
import { supabase } from './supabase';
import { pushUndo, performUndo, canUndo, setOnUndoAvailable } from './undoHistory';
import {
  getCoreId, getMapForCluster, spreadClusterY, findNeuronInDirection,
  getClusterCrumbs, getLineage, generateNodeId, findRelatedNodeId, positionNearNode,
  reflowNeurons, sizeForDepth,
} from './utils';
import type { AppState, AppAction, NeuronContent, MapDef } from './types';

const initialState: AppState = {
  viewMode: 'galaxy',
  currentCluster: 'root',
  activeId: 'core',
  isRecording: false,
  isTransitioning: false,
  clusterEnterKey: 0,
  showOverlay: null,
  selectedTarget: null,
  portalPhase: null,
  frozenOffset: null,
  frozenSwellScale: null,
  justLanded: false,
  viewTransPhase: 'idle',
  pendingNavCluster: null,
  pendingNavNodeId: null,
};

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.payload as any, portalPhase: null, frozenOffset: null, frozenSwellScale: null };
    case 'CLUSTER_SELECT':
      return { ...state, currentCluster: action.cluster, activeId: action.nodeId };
    case 'NAVIGATE_TO':
      if (state.viewMode === 'galaxy') {
        return { ...state, pendingNavCluster: action.cluster, pendingNavNodeId: action.nodeId, viewTransPhase: 'galaxy-exit' };
      }
      return { ...state, currentCluster: action.cluster, activeId: action.nodeId, viewMode: 'neuron', isTransitioning: false, selectedTarget: null };
    case 'COMMIT_PENDING_NAV':
      return { ...state, currentCluster: state.pendingNavCluster ?? state.currentCluster, activeId: state.pendingNavNodeId ?? state.activeId, viewMode: 'neuron', isTransitioning: false, selectedTarget: null, viewTransPhase: 'neuron-enter', pendingNavCluster: null, pendingNavNodeId: null };
    case 'NAVIGATE_PORTAL':
      return { ...state, currentCluster: action.cluster, activeId: action.nodeId, viewMode: 'neuron', isTransitioning: false, selectedTarget: null, frozenOffset: { x: action.newX, y: action.newY }, frozenSwellScale: 1.15 };
    case 'PORTAL_DONE':
      return { ...state, portalPhase: null, frozenOffset: null, frozenSwellScale: null, justLanded: true };
    case 'CLEAR_LANDED':
      return { ...state, justLanded: false };
    case 'NAVIGATE_CLUSTER':
      return { ...state, currentCluster: action.cluster, activeId: getCoreId(action.cluster), viewMode: 'cluster', isTransitioning: false, clusterEnterKey: state.clusterEnterKey + 1 };
    case 'NAVIGATE_GALAXY':
      if (state.viewMode === 'neuron' || state.viewMode === 'cluster') {
        return { ...state, viewTransPhase: 'neuron-exit', showOverlay: null };
      }
      return { ...state, viewMode: 'galaxy', isTransitioning: false, portalPhase: null, frozenOffset: null, frozenSwellScale: null, showOverlay: null };
    case 'COMMIT_PENDING_GALAXY':
      return { ...state, viewMode: 'galaxy', isTransitioning: false, portalPhase: null, frozenOffset: null, frozenSwellScale: null, viewTransPhase: 'galaxy-enter' };
    case 'SET_VIEW_TRANS_PHASE':
      return { ...state, viewTransPhase: action.payload };
    case 'SET_SELECTED_TARGET':
      return { ...state, selectedTarget: action.payload };
    case 'TOGGLE_RECORDING':
      return { ...state, isRecording: !state.isRecording };
    case 'SET_OVERLAY':
      return { ...state, showOverlay: action.payload };
    case 'SET_PORTAL_PHASE':
      return { ...state, portalPhase: action.payload };
    case 'FREEZE_OFFSET':
      return { ...state, frozenOffset: action.payload, frozenSwellScale: action.swellScale, portalPhase: action.phase };
    default:
      return state;
  }
}

function NeuraLogo({ onClick }: { onClick: () => void }) {
  return (
    <div onClick={onClick} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      className="relative w-10 h-14 cursor-pointer opacity-85 hover:opacity-100 transition-all duration-300 hover:scale-110 flex flex-col items-center justify-center">
      <div className="absolute top-1 w-8 h-8 border border-white/30 rounded-full animate-[blobMorph_8s_linear_infinite] mix-blend-screen" />
      <div className="absolute bottom-1 w-8 h-8 border border-white/30 rounded-full animate-[blobMorph_10s_linear_infinite_reverse] mix-blend-screen" />
      <div className="absolute w-1.5 h-1.5 bg-white/70 rounded-full blur-[0.5px] animate-pulse z-10" />
    </div>
  );
}

function AppLoader() {
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      // Reuse existing session on refresh; create a new anonymous one on first load.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data } = await supabase.auth.signInAnonymously();
        if (!cancelled) setUser(data.user);
      } else {
        if (!cancelled) setUser(session.user);
      }
      if (!cancelled) {
        await loadFromStorage();
        setHydrated(true);
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const newUser = session?.user ?? null;
      setUser(newUser);
      // If signed out (e.g. after sign-out button), create a fresh anonymous session
      if (event === 'SIGNED_OUT') {
        const { data } = await supabase.auth.signInAnonymously();
        setUser(data.user);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  if (!hydrated) return (
    <div style={{ position: 'fixed', inset: 0, height: '100dvh', background: 'rgb(2,4,8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'rgba(255,255,255,0.15)', fontSize: 11, letterSpacing: '0.3em', textTransform: 'uppercase', fontFamily: 'monospace' }}>loading</div>
    </div>
  );
  return <App user={user} />;
}

export default AppLoader;

function App({ user }: { user: User | null }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { viewMode, currentCluster, activeId, isTransitioning, selectedTarget, portalPhase, frozenOffset, frozenSwellScale, justLanded, showOverlay, viewTransPhase } = state;

  const [activeGalaxyMap, setActiveGalaxyMap] = useState('work');
  const activeGalaxyMapRef = useRef('work');
  activeGalaxyMapRef.current = activeGalaxyMap;

  const viewModeRef        = useRef(viewMode);
  const currentClusterRef  = useRef(currentCluster);
  const activeIdRef        = useRef(activeId);
  const showOverlayRef     = useRef(showOverlay);
  viewModeRef.current      = viewMode;
  currentClusterRef.current = currentCluster;
  activeIdRef.current      = activeId;
  showOverlayRef.current   = showOverlay;

  const mainContainerRef = useRef<HTMLDivElement | null>(null);
  const touchStart       = useRef<{ x: number; y: number } | null>(null);
  const initialDist      = useRef<number | null>(null);
  const twoFingerMidRef  = useRef<{ x: number; y: number } | null>(null);
  const epochRef      = useRef(Date.now());
  const pendingTarget = useRef<string | null>(null);
  const [highlightedTarget, setHighlightedTarget] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredAxon, setHoveredAxon] = useState<string | null>(null);

  const [jiggleMode, setJiggleMode] = useState(false);
  const jiggleModeRef = useRef(false);
  jiggleModeRef.current = jiggleMode;
  const [jiggleDrag, setJiggleDrag] = useState<JiggleDragState | null>(null);
  const neuronLayerRef = useRef<HTMLDivElement>(null);
  const jiggleDragRef = useRef<JiggleDragState | null>(null);
  const [newNodeId, setNewNodeId] = useState<string | null>(null);
  const [addNodeParentId, setAddNodeParentId] = useState<string | null>(null);
  const [jigglePan, setJigglePan] = useState<{ x: number; y: number } | null>(null);
  const jigglePanRef = useRef<{ x: number; y: number } | null>(null);
  jigglePanRef.current = jigglePan;
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStart = useRef<{ x: number; y: number } | null>(null);

  const JIGGLE_ENABLED_VIEWS: Array<typeof viewMode> = DISABLE_CLUSTER_VIEW ? ['neuron'] : ['cluster', 'neuron'];

  const currentMap   = getMapForCluster(currentCluster);
  const clusterList  = CLUSTER_LISTS[currentMap] || [currentCluster];
  const clusterIndex = clusterList.indexOf(currentCluster);

  const currentNeuron = worlds[currentCluster]?.neurons?.[activeId]
    || worlds[currentCluster]?.neurons?.['core']
    || Object.values(worlds[currentCluster]?.neurons || {})[0]
    || { x: 0, y: 0, id: 'core', label: '', size: 300, children: [] as string[] };

  const prevNeuronPos = useRef({ x: currentNeuron.x, y: currentNeuron.y });
  const [snapDuration, setSnapDuration] = useState(0.7);
  useEffect(() => {
    if (viewMode !== 'neuron') return;
    const dx = currentNeuron.x - prevNeuronPos.current.x;
    const dy = currentNeuron.y - prevNeuronPos.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const dur = Math.min(1.1, Math.max(0.4, 0.4 + (dist / 800) * 0.7));
    setSnapDuration(dur);
    prevNeuronPos.current = { x: currentNeuron.x, y: currentNeuron.y };
  }, [activeId, currentCluster]);

  const clusterPos = useMemo(() => {
    if (viewMode !== 'cluster') return null;
    const neurons = worlds[currentCluster]?.neurons;
    return neurons ? spreadClusterY(neurons) : null;
  }, [viewMode, currentCluster]);

  useEffect(() => {
    if (!justLanded) return;
    const id = setTimeout(() => dispatch({ type: 'CLEAR_LANDED' }), 100);
    return () => clearTimeout(id);
  }, [justLanded]);

  useEffect(() => {
    if (viewTransPhase === 'galaxy-exit') {
      const t = setTimeout(() => dispatch({ type: 'COMMIT_PENDING_NAV' }), 420);
      return () => clearTimeout(t);
    }
    if (viewTransPhase === 'neuron-enter') {
      const t = setTimeout(() => dispatch({ type: 'SET_VIEW_TRANS_PHASE', payload: 'idle' }), 600);
      return () => clearTimeout(t);
    }
    if (viewTransPhase === 'neuron-exit') {
      const t = setTimeout(() => dispatch({ type: 'COMMIT_PENDING_GALAXY' }), 380);
      return () => clearTimeout(t);
    }
    if (viewTransPhase === 'galaxy-enter') {
      const t = setTimeout(() => dispatch({ type: 'SET_VIEW_TRANS_PHASE', payload: 'idle' }), 600);
      return () => clearTimeout(t);
    }
  }, [viewTransPhase]);

  useEffect(() => {
    setHighlightedTarget(null);
    setHoveredId(null);
    pendingTarget.current = null;
    if (viewMode === 'galaxy') setJiggleMode(false);
  }, [viewMode, currentCluster]);

  const [galaxyEntered, setGalaxyEntered] = useState(false);

  const [introPhase, setIntroPhase] = useState<'visible' | 'exit' | 'done'>('visible');
  const introTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (introPhase === 'exit') {
      const t = setTimeout(() => setIntroPhase('done'), 1200);
      return () => clearTimeout(t);
    }
    if (introPhase === 'done') {
      const saved = localStorage.getItem('neura_last_location');
      if (saved) {
        try {
          const { viewMode: vm, currentCluster: cc, activeId: ai, galaxyMap: gm } = JSON.parse(saved);
          if (gm) { setActiveGalaxyMap(gm); activeGalaxyMapRef.current = gm; }
          if (vm === 'cluster' && cc) dispatch({ type: 'NAVIGATE_CLUSTER', cluster: cc });
          else if (vm === 'neuron' && cc && ai) dispatch({ type: 'NAVIGATE_TO', cluster: cc, nodeId: ai });
        } catch {}
      }
      setTimeout(() => setGalaxyEntered(true), 100);
    }
  }, [introPhase]);

  const handleIntroTap = useCallback(() => {
    if (introPhase === 'visible') {
      if (introTimer.current) clearTimeout(introTimer.current);
      setIntroPhase('exit');
    }
  }, [introPhase]);

  const [overlayVisible, setOverlayVisible] = useState(false);
  const overlayCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showInputOverlay, setShowInputOverlay] = useState(false);
  const [inputOverlayVisible, setInputOverlayVisible] = useState(false);
  const [inputText, setInputText] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [inputFile, setInputFile] = useState<{ type: string; file?: File; name?: string } | null>(null);
  const [inputDragOver, setInputDragOver] = useState(false);

  const openInputOverlay = useCallback((mode: string) => {
    setInputText(''); setInputUrl(''); setInputFile(null);
    setShowInputOverlay(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setInputOverlayVisible(true)));
  }, []);

  const closeInputOverlay = useCallback(() => {
    setInputOverlayVisible(false);
    setTimeout(() => setShowInputOverlay(false), 320);
  }, []);

  useEffect(() => {
    if (introPhase !== 'done') return;
    localStorage.setItem('neura_last_location', JSON.stringify({
      viewMode, currentCluster, activeId, galaxyMap: activeGalaxyMap,
    }));
  }, [viewMode, currentCluster, activeId, activeGalaxyMap, introPhase]);

  useEffect(() => {
    if (overlayCloseTimer.current) clearTimeout(overlayCloseTimer.current);
    if (showOverlay) {
      requestAnimationFrame(() => requestAnimationFrame(() => setOverlayVisible(true)));
    } else {
      setOverlayVisible(false);
    }
  }, [showOverlay]);

  const closeOverlay = useCallback(() => {
    setOverlayVisible(false);
    overlayCloseTimer.current = setTimeout(() => dispatch({ type: 'SET_OVERLAY', payload: null }), 320);
  }, []);

  const handleSaveInsight = useCallback(async (nodeId: string, label: string, content: NeuronContent) => {
    const neuron = worlds[currentCluster]?.neurons?.[nodeId];
    if (!neuron) return;
    if (label && label.trim()) neuron.label = label.trim();
    const hasContent = !!(content.body || content.image || (content.attachments && content.attachments.length > 0));
    neuron.content = hasContent ? content : undefined;
    await saveWorldToStorage(currentCluster);
    setWorldVersion(v => v + 1);
  }, [currentCluster]);

  useEffect(() => { setHoveredAxon(null); }, [currentCluster, viewMode]);

  useEffect(() => {
    if (introPhase !== 'done') return;
    if (viewMode !== 'galaxy') return;
    setGalaxyEntered(false);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setGalaxyEntered(true)));
    return () => cancelAnimationFrame(id);
  }, [viewMode, introPhase]);

  const clusterCrumbs = useMemo(() => getClusterCrumbs(currentCluster), [currentCluster]);
  const lineage = useMemo(() => getLineage(currentCluster, activeId), [currentCluster, activeId]);

  const swellScale = useMemo(() => {
    const node = worlds[currentCluster]?.neurons?.[activeId];
    if (!node) return 1.15;
    if (node.hasCluster) {
      const coreId = getCoreId(node.id);
      const coreSize = worlds[node.id]?.neurons?.[coreId]?.size || 300;
      return (coreSize * 1.15) / node.size;
    }
    if (node.isCore && clusterMeta[currentCluster]?.parentClusterId != null) {
      const target = clusterMeta[currentCluster]?.returnTarget;
      if (target) {
        const targetNode = worlds[target.cluster]?.neurons?.[target.nodeId];
        return targetNode ? (targetNode.size * 1.15) / node.size : 1.15;
      }
    }
    return 1.15;
  }, [currentCluster, activeId]);

  const handleJump = useCallback((clusterId: string, nodeId: string) => {
    dispatch({ type: 'NAVIGATE_TO', cluster: clusterId, nodeId });
  }, []);

  const [panOffset, setPanOffset] = useState<{ x: number; y: number } | null>(null);
  const panOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const panIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [panSnapId, setPanSnapId] = useState<string | null>(null);

  const NEURON_SCALE = 0.9;

  // Cluster view equivalent scale: 0.146, 20% further in = 0.146 * (1/0.8) ≈ 0.182
  const ZOOM_MIN = DISABLE_CLUSTER_VIEW ? 0.182 : 0.146;
  const ZOOM_MAX = 2.0;
  const ZOOM_DEFAULT = NEURON_SCALE * 0.8; // standard zoom: 20% further out than normal neuron view

  const loadZoomForCluster = (clusterId: string): number => {
    try {
      const saved = JSON.parse(localStorage.getItem('neura_cluster_zoom') || '{}');
      return typeof saved[clusterId] === 'number' ? saved[clusterId] : ZOOM_DEFAULT;
    } catch { return ZOOM_DEFAULT; }
  };

  const saveZoomForCluster = (clusterId: string, zoom: number) => {
    try {
      const saved = JSON.parse(localStorage.getItem('neura_cluster_zoom') || '{}');
      saved[clusterId] = zoom;
      localStorage.setItem('neura_cluster_zoom', JSON.stringify(saved));
    } catch {}
  };

  const [neuronZoom, setNeuronZoom] = useState<number>(ZOOM_DEFAULT);
  const neuronZoomRef = useRef<number>(ZOOM_DEFAULT);
  const pinchAccumRef = useRef(0);
  const pinchRafRef = useRef<number | null>(null);

  useEffect(() => {
    if (viewMode !== 'neuron' || !DISABLE_CLUSTER_VIEW) return;
    const zoom = loadZoomForCluster(currentCluster);
    neuronZoomRef.current = zoom;
    setNeuronZoom(zoom);
  }, [currentCluster, viewMode]);

  const findNeuronNearestCenter = useCallback((offset: { x: number; y: number }, cc: string, ai: string, scale?: number) => {
    const neurons = worlds[cc]?.neurons;
    if (!neurons) return ai;
    const vw = window.innerWidth / 2;
    const vh = window.innerHeight / 2;
    const s = scale ?? neuronZoomRef.current;
    let best = ai;
    let bestDist = Infinity;
    for (const n of Object.values(neurons)) {
      const screenX = (n.x - offset.x) * s + vw;
      const screenY = (n.y - offset.y) * s + vh;
      const dx = screenX - vw;
      const dy = screenY - vh;
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) { bestDist = dist; best = n.id; }
    }
    return best;
  }, []);

  const snapZoomToDefault = useCallback(() => {
    if (!DISABLE_CLUSTER_VIEW) return;
    if (neuronZoomRef.current < ZOOM_DEFAULT) {
      neuronZoomRef.current = ZOOM_DEFAULT;
      setNeuronZoom(ZOOM_DEFAULT);
      saveZoomForCluster(currentClusterRef.current, ZOOM_DEFAULT);
    }
  }, []);

  const commitPanSnap = useCallback(() => {
    const offset = panOffsetRef.current;
    if (!offset) return;
    const cc = currentClusterRef.current;
    const ai = activeIdRef.current;
    const target = findNeuronNearestCenter(offset, cc, ai);
    panOffsetRef.current = null;
    setPanOffset(null);
    setPanSnapId(null);
    if (target !== ai) {
      // Panning/scrolling through neurons keeps current zoom — only direct tap/click resets it
      dispatch({ type: 'NAVIGATE_TO', cluster: cc, nodeId: target });
    }
  }, [findNeuronNearestCenter]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (showOverlay) return;
    const vm = viewModeRef.current;
    const cc = currentClusterRef.current;

    if (DISABLE_CLUSTER_VIEW) {
      if (vm !== 'neuron') return;
      if (e.ctrlKey) {
        // Pinch-zoom: accumulate deltas and apply once per animation frame to avoid
        // jank from per-event React re-renders and expensive operations.
        pinchAccumRef.current += e.deltaY;
        if (!pinchRafRef.current) {
          pinchRafRef.current = requestAnimationFrame(() => {
            pinchRafRef.current = null;
            const delta = pinchAccumRef.current;
            pinchAccumRef.current = 0;
            const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, neuronZoomRef.current * (1 - delta * 0.003)));
            neuronZoomRef.current = newZoom;
            setNeuronZoom(newZoom);
            // Defer expensive work (storage write, snap calculation) until gesture settles
            if (panIdleTimer.current) clearTimeout(panIdleTimer.current);
            panIdleTimer.current = setTimeout(() => {
              saveZoomForCluster(currentClusterRef.current, neuronZoomRef.current);
              commitPanSnap();
            }, 400);
          });
        }
        return;
      }
      if (e.deltaX === 0) {
        const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, neuronZoomRef.current * (1 - e.deltaY * 0.002)));
        neuronZoomRef.current = newZoom;
        setNeuronZoom(newZoom);
        saveZoomForCluster(cc, newZoom);
        const ai = activeIdRef.current;
        const currentOffset = panOffsetRef.current ?? { x: worlds[cc]?.neurons?.[ai]?.x ?? 0, y: worlds[cc]?.neurons?.[ai]?.y ?? 0 };
        const snapId = findNeuronNearestCenter(currentOffset, cc, ai, newZoom);
        setPanSnapId(snapId !== ai ? snapId : null);
        if (panIdleTimer.current) clearTimeout(panIdleTimer.current);
        panIdleTimer.current = setTimeout(commitPanSnap, 400);
        return;
      }
      const ai = activeIdRef.current;
      const activeNode = worlds[cc]?.neurons?.[ai];
      if (!activeNode) return;
      const zoom = neuronZoomRef.current;
      const base = panOffsetRef.current ?? { x: activeNode.x, y: activeNode.y };
      const newOffset = { x: base.x + e.deltaX / zoom, y: base.y + e.deltaY / zoom };
      panOffsetRef.current = newOffset;
      setPanOffset({ ...newOffset });
      const snapId = findNeuronNearestCenter(newOffset, cc, ai, zoom);
      setPanSnapId(snapId !== ai ? snapId : null);
      if (panIdleTimer.current) clearTimeout(panIdleTimer.current);
      panIdleTimer.current = setTimeout(commitPanSnap, 180);
      return;
    }

    if (e.ctrlKey && e.deltaY > 30) {
      if (vm === 'neuron') { dispatch({ type: 'SET_VIEW_MODE', payload: 'cluster' }); return; }
      if (vm === 'cluster') {
        const parentCluster = clusterMeta[cc]?.parentClusterId;
        if (parentCluster) dispatch({ type: 'NAVIGATE_CLUSTER', cluster: parentCluster });
        else dispatch({ type: 'NAVIGATE_GALAXY' });
        return;
      }
      return;
    }

    if (vm !== 'neuron') return;
    const ai = activeIdRef.current;
    const activeNode = worlds[cc]?.neurons?.[ai];
    if (!activeNode) return;

    const base = panOffsetRef.current ?? { x: activeNode.x, y: activeNode.y };
    const newOffset = { x: base.x + e.deltaX / NEURON_SCALE, y: base.y + e.deltaY / NEURON_SCALE };
    panOffsetRef.current = newOffset;
    setPanOffset({ ...newOffset });

    const snapId = findNeuronNearestCenter(newOffset, cc, ai);
    setPanSnapId(snapId !== ai ? snapId : null);

    if (panIdleTimer.current) clearTimeout(panIdleTimer.current);
    panIdleTimer.current = setTimeout(commitPanSnap, 180);
  }, [showOverlay, findNeuronNearestCenter, commitPanSnap]);

  const mouseStart = useRef<{ x: number; y: number } | null>(null);
  const mouseLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const middleMousePanning = useRef(false);
  const middleMouseStart = useRef<{ x: number; y: number; baseOffset: { x: number; y: number } } | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (showOverlay) return;
    if (e.button === 1 && viewModeRef.current === 'neuron') {
      e.preventDefault();
      const cc = currentClusterRef.current;
      const ai = activeIdRef.current;
      const activeNode = worlds[cc]?.neurons?.[ai];
      if (!activeNode) return;
      middleMousePanning.current = true;
      const base = panOffsetRef.current ?? { x: activeNode.x, y: activeNode.y };
      middleMouseStart.current = { x: e.clientX, y: e.clientY, baseOffset: base };
      return;
    }
    mouseStart.current = { x: e.clientX, y: e.clientY };
    if (!jiggleModeRef.current && JIGGLE_ENABLED_VIEWS.includes(viewModeRef.current as any)) {
      mouseLongPressTimer.current = setTimeout(() => {
        setJiggleMode(true);
      }, 1000);
    }
  }, [showOverlay]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!middleMousePanning.current || !middleMouseStart.current) return;
    const { x: sx, y: sy, baseOffset } = middleMouseStart.current;
    const zoom = DISABLE_CLUSTER_VIEW ? neuronZoomRef.current : NEURON_SCALE;
    const newOffset = {
      x: baseOffset.x - (e.clientX - sx) / zoom,
      y: baseOffset.y - (e.clientY - sy) / zoom,
    };
    panOffsetRef.current = newOffset;
    setPanOffset({ ...newOffset });
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (mouseLongPressTimer.current) { clearTimeout(mouseLongPressTimer.current); mouseLongPressTimer.current = null; }
    if (e.button === 1 && middleMousePanning.current) {
      middleMousePanning.current = false;
      middleMouseStart.current = null;
      commitPanSnap();
      return;
    }
    if (!mouseStart.current || showOverlay) return;
    if (jiggleModeRef.current) { mouseStart.current = null; return; }
    const dx = e.clientX - mouseStart.current.x;
    const dy = e.clientY - mouseStart.current.y;
    mouseStart.current = null;
    const vm = viewModeRef.current;
    const cc = currentClusterRef.current;
    if (vm === 'galaxy') return;
    if (vm === 'neuron' && Math.hypot(dx, dy) < 8) {
      const target = (e.target as HTMLElement).closest('[data-nodeid]') as HTMLElement | null;
      if (target) {
        const nodeId = target.dataset.nodeid;
        if (nodeId && nodeId !== activeIdRef.current) {
          snapZoomToDefault();
          dispatch({ type: 'NAVIGATE_TO', cluster: cc, nodeId });
        }
      }
    }
  }, [showOverlay, commitPanSnap, snapZoomToDefault]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      const vm = viewModeRef.current;
      const cc = currentClusterRef.current;
      if (showOverlayRef.current && e.key !== 'Enter') return;
      if (e.key === 'Enter') {
        if (showOverlayRef.current) { closeOverlay(); return; }
        if (vm === 'galaxy') {
          const mapCfg = GALAXY_MAPS.find(m => m.id === activeGalaxyMapRef.current) || GALAXY_MAPS[0];
          if (DISABLE_CLUSTER_VIEW) {
            const coreId = getCoreId(mapCfg.rootCluster);
            dispatch({ type: 'NAVIGATE_TO', cluster: mapCfg.rootCluster, nodeId: coreId });
          } else {
            dispatch({ type: 'NAVIGATE_CLUSTER', cluster: mapCfg.rootCluster });
          }
        } else if (vm === 'cluster') {
          const neurons = worlds[cc]?.neurons;
          const ai = activeIdRef.current;
          const activeNode = neurons?.[ai];
          if (activeNode?.hasCluster && worlds[activeNode.id]) dispatch({ type: 'NAVIGATE_CLUSTER', cluster: activeNode.id });
          else dispatch({ type: 'SET_VIEW_MODE', payload: 'neuron' });
        } else if (vm === 'neuron') {
          const ai = activeIdRef.current;
          const activeNode = worlds[cc]?.neurons?.[ai];
          if (activeNode?.content) dispatch({ type: 'SET_OVERLAY', payload: ai });
        }
        return;
      }
      if (e.key === 'Backspace') {
        if (DISABLE_CLUSTER_VIEW) {
          if (vm === 'neuron') dispatch({ type: 'NAVIGATE_GALAXY' });
        } else {
          if (vm === 'neuron') dispatch({ type: 'SET_VIEW_MODE', payload: 'cluster' });
          else if (vm === 'cluster') {
            const parentCluster = clusterMeta[cc]?.parentClusterId;
            if (parentCluster) dispatch({ type: 'NAVIGATE_CLUSTER', cluster: parentCluster });
            else dispatch({ type: 'NAVIGATE_GALAXY' });
          }
        }
        return;
      }
      if (e.key === 'Escape') { dispatch({ type: 'NAVIGATE_GALAXY' }); return; }
      if (vm === 'galaxy') {
        const idx = GALAXY_MAPS.findIndex(m => m.id === activeGalaxyMapRef.current);
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setActiveGalaxyMap(GALAXY_MAPS[(idx + 1) % GALAXY_MAPS.length].id);
        if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   setActiveGalaxyMap(GALAXY_MAPS[(idx - 1 + GALAXY_MAPS.length) % GALAXY_MAPS.length].id);
        return;
      }
      if (vm === 'cluster') {
        const neurons = worlds[cc]?.neurons;
        const ai = activeIdRef.current;
        if (e.key === 'ArrowRight') { const t = findNeuronInDirection(0, ai, neurons); if (t) dispatch({ type: 'CLUSTER_SELECT', cluster: cc, nodeId: t }); }
        if (e.key === 'ArrowLeft')  { const t = findNeuronInDirection(Math.PI, ai, neurons); if (t) dispatch({ type: 'CLUSTER_SELECT', cluster: cc, nodeId: t }); }
        if (e.key === 'ArrowUp')    { const t = findNeuronInDirection(-Math.PI / 2, ai, neurons); if (t) dispatch({ type: 'CLUSTER_SELECT', cluster: cc, nodeId: t }); }
        if (e.key === 'ArrowDown')  { const t = findNeuronInDirection(Math.PI / 2, ai, neurons); if (t) dispatch({ type: 'CLUSTER_SELECT', cluster: cc, nodeId: t }); }
        return;
      }
      if (vm === 'neuron') {
        const neurons = worlds[cc]?.neurons;
        const ai = activeIdRef.current;
        const angles: Record<string, number> = { ArrowRight: 0, ArrowDown: Math.PI / 2, ArrowLeft: Math.PI, ArrowUp: -Math.PI / 2 };
        if (angles[e.key] !== undefined) {
          const target = findNeuronInDirection(angles[e.key], ai, neurons);
          if (target) {
            // Arrow key navigation keeps current zoom — only Enter/click resets it
            dispatch({ type: 'NAVIGATE_TO', cluster: cc, nodeId: target });
          }
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (showOverlay) return;
    if (e.touches.length === 2) {
      initialDist.current = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
      twoFingerMidRef.current = {
        x: (e.touches[0].pageX + e.touches[1].pageX) / 2,
        y: (e.touches[0].pageY + e.touches[1].pageY) / 2,
      };
      touchStart.current = null;
      if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    } else {
      initialDist.current = null;
      touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      pendingTarget.current = null;
      longPressStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      if (!jiggleModeRef.current && JIGGLE_ENABLED_VIEWS.includes(viewModeRef.current as any)) {
        longPressTimer.current = setTimeout(() => {
          setJiggleMode(true);
          longPressStart.current = null;
        }, 1000);
      }
    }
  }, [showOverlay]);

  const handleTouchMoveLogic = useCallback((e: TouchEvent | React.TouchEvent) => {
    if (showOverlayRef.current) return;
    if (longPressStart.current && e.touches.length === 1) {
      const dx = e.touches[0].clientX - longPressStart.current.x;
      const dy = e.touches[0].clientY - longPressStart.current.y;
      if (Math.hypot(dx, dy) > 8 && longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }
    if (jiggleModeRef.current) return;
    const vm = viewModeRef.current;
    if (e.touches.length === 2 && initialDist.current) {
      if (DISABLE_CLUSTER_VIEW && vm === 'neuron') e.preventDefault();
      const currentDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
      const ratio = currentDist / initialDist.current;
      if (DISABLE_CLUSTER_VIEW) {
        if (vm === 'neuron') {
          const cc = currentClusterRef.current;
          const ai = activeIdRef.current;
          // Two-finger pan: move canvas by midpoint delta each frame
          const newMidX = (e.touches[0].pageX + e.touches[1].pageX) / 2;
          const newMidY = (e.touches[0].pageY + e.touches[1].pageY) / 2;
          if (twoFingerMidRef.current) {
            const panDx = newMidX - twoFingerMidRef.current.x;
            const panDy = newMidY - twoFingerMidRef.current.y;
            const zoom = neuronZoomRef.current;
            const base = panOffsetRef.current ?? { x: worlds[cc]?.neurons?.[ai]?.x ?? 0, y: worlds[cc]?.neurons?.[ai]?.y ?? 0 };
            const newOffset = { x: base.x - panDx / zoom, y: base.y - panDy / zoom };
            panOffsetRef.current = newOffset;
            setPanOffset({ ...newOffset });
          }
          twoFingerMidRef.current = { x: newMidX, y: newMidY };
          // Pinch zoom
          const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, neuronZoomRef.current * ratio));
          neuronZoomRef.current = newZoom;
          setNeuronZoom(newZoom);
          saveZoomForCluster(cc, newZoom);
          initialDist.current = currentDist;
          const currentOffset = panOffsetRef.current ?? { x: worlds[cc]?.neurons?.[ai]?.x ?? 0, y: worlds[cc]?.neurons?.[ai]?.y ?? 0 };
          const snapId = findNeuronNearestCenter(currentOffset, cc, ai, newZoom);
          setPanSnapId(snapId !== ai ? snapId : null);
          if (panIdleTimer.current) clearTimeout(panIdleTimer.current);
          panIdleTimer.current = setTimeout(commitPanSnap, 400);
        } else if (vm === 'galaxy') {
          e.preventDefault();
          // Two-finger pan + pinch zoom for galaxy
          const newMidX = (e.touches[0].pageX + e.touches[1].pageX) / 2;
          const newMidY = (e.touches[0].pageY + e.touches[1].pageY) / 2;
          if (twoFingerMidRef.current) {
            const panDx = newMidX - twoFingerMidRef.current.x;
            const panDy = newMidY - twoFingerMidRef.current.y;
            const pan = galaxyPanRef.current;
            const newPan = { x: pan.x + panDx, y: pan.y + panDy };
            galaxyPanRef.current = newPan;
            setGalaxyPan({ ...newPan });
          }
          twoFingerMidRef.current = { x: newMidX, y: newMidY };
          const oldZoom = galaxyZoomRef.current;
          const newZoom = Math.min(4, Math.max(0.2, oldZoom * ratio));
          galaxyZoomRef.current = newZoom;
          setGalaxyZoom(newZoom);
          initialDist.current = currentDist;
        }
      } else {
        if      (ratio < 0.7 && vm === 'neuron')  { dispatch({ type: 'SET_VIEW_MODE', payload: 'cluster' }); initialDist.current = null; }
        else if (ratio > 1.3 && vm === 'cluster') { dispatch({ type: 'SET_VIEW_MODE', payload: 'neuron' });  initialDist.current = null; }
        else if (ratio < 0.7 && vm === 'cluster') { const parentC = clusterMeta[currentClusterRef.current]?.parentClusterId; if (parentC) dispatch({ type: 'NAVIGATE_CLUSTER', cluster: parentC }); else dispatch({ type: 'NAVIGATE_GALAXY' }); initialDist.current = null; }
        else if (ratio > 1.3 && vm === 'galaxy')  { const mapCfg = GALAXY_MAPS.find(m => m.id === activeGalaxyMapRef.current) || GALAXY_MAPS[0]; dispatch({ type: 'NAVIGATE_CLUSTER', cluster: mapCfg.rootCluster }); initialDist.current = null; }
      }
      return;
    }
    const cc = currentClusterRef.current;
    const ai = activeIdRef.current;
    if (!touchStart.current) return;
    const dx = e.touches[0].clientX - touchStart.current.x;
    const dy = e.touches[0].clientY - touchStart.current.y;
    if (vm === 'galaxy') {
      // Single-finger drag → pan in galaxy view
      const pan = galaxyPanRef.current;
      const newPan = { x: pan.x + dx, y: pan.y + dy };
      galaxyPanRef.current = newPan;
      setGalaxyPan({ ...newPan });
      touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return;
    }
    if (vm !== 'neuron') return;
    const neurons = worlds[cc]?.neurons;
    if (!neurons) return;
    const swipeAngle = Math.atan2(-dy, -dx);
    const target = findNeuronInDirection(swipeAngle, ai, neurons);
    pendingTarget.current = target;
    setHighlightedTarget(target);
    dispatch({ type: 'SET_SELECTED_TARGET', payload: target });
  }, [showOverlay, findNeuronNearestCenter, commitPanSnap]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    handleTouchMoveLogic(e);
  }, [handleTouchMoveLogic]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const wasTwoFinger = twoFingerMidRef.current !== null;
    initialDist.current = null;
    twoFingerMidRef.current = null;
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    longPressStart.current = null;
    if (jiggleModeRef.current) return;
    if (showOverlay) return;
    const vm = viewModeRef.current;
    const cc = currentClusterRef.current;

    // Two-finger gesture ended — snap canvas to nearest neuron, keep zoom
    if (wasTwoFinger) {
      if (panIdleTimer.current) clearTimeout(panIdleTimer.current);
      commitPanSnap();
      return;
    }

    if (vm === 'galaxy') { touchStart.current = null; return; }
    const dest = pendingTarget.current;
    pendingTarget.current = null;
    setHighlightedTarget(null);
    dispatch({ type: 'SET_SELECTED_TARGET', payload: null });
    if (vm === 'cluster') { touchStart.current = null; return; }
    if (vm !== 'neuron' || !touchStart.current) { touchStart.current = null; return; }

    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    touchStart.current = null;

    if (Math.hypot(dx, dy) < 20) {
      // Tap — check if finger landed directly on a neuron node
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const nodeEl = el?.closest?.('[data-nodeid]') as HTMLElement | null;
      const nodeId = nodeEl?.dataset?.nodeid;
      if (nodeId && nodeId !== activeIdRef.current) {
        snapZoomToDefault(); // Direct tap on a neuron resets zoom
        dispatch({ type: 'NAVIGATE_TO', cluster: cc, nodeId });
      }
      return;
    }

    // Swipe through axon — navigate without resetting zoom
    if (!dest) return;
    dispatch({ type: 'NAVIGATE_TO', cluster: cc, nodeId: dest });
  }, [showOverlay, commitPanSnap, snapZoomToDefault]);

  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2) e.preventDefault();
    };
    const els = [mainContainerRef.current, galaxyContainerRef.current].filter(Boolean) as HTMLElement[];
    els.forEach(el => el.addEventListener('touchmove', onTouchMove, { passive: false }));
    return () => els.forEach(el => el.removeEventListener('touchmove', onTouchMove));
  }, []);

  const [worldVersion, setWorldVersion] = useState(0);

  const [undoVisible, setUndoVisible] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setOnUndoAvailable((available) => {
      if (available) {
        setUndoVisible(true);
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        undoTimerRef.current = setTimeout(() => setUndoVisible(false), 10000);
      } else {
        setUndoVisible(false);
      }
    });
  }, []);

  const handleUndo = useCallback(async () => {
    if (!canUndo()) return;
    setUndoVisible(false);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    await performUndo(() => setWorldVersion(v => v + 1));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleUndo]);

  useEffect(() => {
    const preventGesture = (e: Event) => e.preventDefault();
    const preventPinchZoom = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      const target = e.target as Element | null;
      if (target && mainContainerRef.current?.contains(target)) {
        e.preventDefault();
      }
    };
    document.addEventListener('gesturestart', preventGesture, { passive: false });
    document.addEventListener('gesturechange', preventGesture, { passive: false });
    document.addEventListener('gestureend', preventGesture, { passive: false });
    document.addEventListener('wheel', preventPinchZoom, { passive: false });
    return () => {
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('gesturechange', preventGesture);
      document.removeEventListener('gestureend', preventGesture);
      document.removeEventListener('wheel', preventPinchZoom);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pinchRafRef.current !== null) cancelAnimationFrame(pinchRafRef.current);
    };
  }, []);

  const handleAddNeuron = useCallback(async (text: string) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

    const targetCluster = currentClusterRef.current !== 'galaxy' ? currentClusterRef.current : 'root';
    const neurons = worlds[targetCluster]?.neurons;
    if (!neurons) throw new Error('No map to add to');

    const activeNodeLabel = neurons[activeIdRef.current]?.label || '';
    const existingLabels = Object.values(neurons).map(n => n.label);
    const mapLabel = worlds[targetCluster]?.label || 'My Map';

    const callEdge = async (body: object) => {
      const res = await fetch(`${supabaseUrl}/functions/v1/neura-process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`AI error: ${res.status}`);
      return res.json();
    };

    const intentData = await callEdge({
      action: 'detect-intent',
      userText: text,
      existingLabels,
      mapLabel,
      activeNodeLabel,
    });

    if (intentData.intent === 'delete' && intentData.targetLabel) {
      const targetLabel = (intentData.targetLabel as string).toUpperCase();
      const nodeToDelete = Object.values(neurons).find(
        n => n.label.toUpperCase() === targetLabel || n.label.toUpperCase().includes(targetLabel)
      );
      if (!nodeToDelete || nodeToDelete.isCore) return;

      const deleteId = nodeToDelete.id;
      const collectDescendants = (id: string, acc: string[] = []): string[] => {
        acc.push(id);
        const node = neurons[id];
        (node?.children || []).forEach(c => collectDescendants(c, acc));
        return acc;
      };
      const idsToDelete = new Set(collectDescendants(deleteId));

      pushUndo(targetCluster);
      if (nodeToDelete.parentId) {
        const parent = neurons[nodeToDelete.parentId];
        if (parent?.children) {
          parent.children = parent.children.filter(c => !idsToDelete.has(c));
        }
      }

      idsToDelete.forEach(id => delete neurons[id]);
      Object.keys(_worldColorCache).forEach(k => delete _worldColorCache[k]);
      await saveWorldToStorage(targetCluster);
      setWorldVersion(v => v + 1);

      const fallbackId = nodeToDelete.parentId && neurons[nodeToDelete.parentId]
        ? nodeToDelete.parentId
        : getCoreId(targetCluster);
      dispatch({ type: 'NAVIGATE_TO', cluster: targetCluster, nodeId: fallbackId });
      return;
    }

    if (intentData.intent === 'explore') {
      const coreId = getCoreId(targetCluster);
      const coreLabel = worlds[targetCluster]?.neurons[coreId]?.label || mapLabel;

      const data = await callEdge({
        action: 'explore-topic',
        userText: text,
        mapLabel,
        coreLabel,
      });

      type ExploreDef = { label: string; parentLabel: string; insight: string; body: string };
      const neuronDefs: ExploreDef[] = data.neurons || [];
      if (neuronDefs.length === 0) return;

      pushUndo(targetCluster);
      const labelToId: Record<string, string> = {};
      let lastAddedId = '';

      for (const def of neuronDefs) {
        const bodyText = def.insight ? `${def.insight}\n\n${def.body}` : def.body;
        const newId = generateNodeId();
        labelToId[def.label.toUpperCase()] = newId;

        let parentId: string;
        if (def.parentLabel && labelToId[def.parentLabel.toUpperCase()]) {
          parentId = labelToId[def.parentLabel.toUpperCase()];
        } else {
          parentId = coreId;
        }

        const parent = worlds[targetCluster].neurons[parentId];
        // Size and position are computed by reflowNeurons after the full
        // structure is built — set placeholder values here.
        worlds[targetCluster].neurons[newId] = {
          id: newId,
          label: def.label.toUpperCase(),
          size: sizeForDepth(1),
          x: 0,
          y: 0,
          parentId,
          content: { body: bodyText },
        };

        if (parent) {
          if (!parent.children) parent.children = [];
          parent.children.push(newId);
        }

        lastAddedId = newId;
      }

      // Apply golden-ratio layout to the whole cluster in one pass
      reflowNeurons(worlds[targetCluster].neurons);

      Object.keys(_worldColorCache).forEach(k => delete _worldColorCache[k]);
      await saveWorldToStorage(targetCluster);
      setWorldVersion(v => v + 1);
      dispatch({ type: 'NAVIGATE_TO', cluster: targetCluster, nodeId: coreId });
      return;
    }

    const data = await callEdge({
      action: 'generate-neuron',
      userText: text,
      existingLabels,
      mapLabel,
      activeNodeLabel,
    });

    type NeuronDef = { label: string; relatedTo: string; parentLabel: string; insight: string; body: string };
    const neuronDefs: NeuronDef[] = data.neurons || [{ label: data.label || 'NEW THOUGHT', relatedTo: data.relatedTo || '', parentLabel: '', insight: data.insight || '', body: data.body || text }];

    pushUndo(targetCluster);
    const labelToId: Record<string, string> = {};
    let lastAddedId = '';

    for (const def of neuronDefs) {
      const bodyText = def.insight ? `${def.insight}\n\n${def.body}` : def.body;
      const newId = generateNodeId();
      labelToId[def.label] = newId;

      let parentId: string;
      if (def.parentLabel && labelToId[def.parentLabel]) {
        parentId = labelToId[def.parentLabel];
      } else if (def.relatedTo) {
        parentId = findRelatedNodeId(targetCluster, def.relatedTo);
      } else {
        parentId = activeIdRef.current && neurons[activeIdRef.current] ? activeIdRef.current : findRelatedNodeId(targetCluster, '');
      }

      const parent = worlds[targetCluster].neurons[parentId];
      const pos = positionNearNode(targetCluster, parentId);
      worlds[targetCluster].neurons[newId] = {
        id: newId,
        label: def.label.toUpperCase(),
        size: 50, // placeholder — reflowNeurons sets correct depth-based size below
        x: pos.x,
        y: pos.y,
        parentId,
        content: { body: bodyText },
      };

      if (parent) {
        if (!parent.children) parent.children = [];
        parent.children.push(newId);
      }

      lastAddedId = newId;
    }
    reflowNeurons(worlds[targetCluster].neurons, true); // normalize sizes, preserve positions
    Object.keys(_worldColorCache).forEach(k => delete _worldColorCache[k]);
    await saveWorldToStorage(targetCluster);
    setWorldVersion(v => v + 1);

    dispatch({ type: 'NAVIGATE_TO', cluster: targetCluster, nodeId: lastAddedId });
  }, []);

  const handleAddNode = useCallback(async (parentId: string, label: string, insight: string) => {
    const neurons = worlds[currentCluster]?.neurons;
    if (!neurons || !neurons[parentId]) return;
    pushUndo(currentCluster);
    const newId = generateNodeId();
    const parent = neurons[parentId];
    const pos = positionNearNode(currentCluster, parentId);
    neurons[newId] = {
      id: newId,
      label: label.toUpperCase(),
      size: 50, // placeholder — reflowNeurons sets correct depth-based size below
      x: pos.x,
      y: pos.y,
      parentId,
      content: insight ? { body: insight } : undefined,
    };
    if (!parent.children) parent.children = [];
    parent.children.push(newId);
    reflowNeurons(neurons, true); // normalize all sizes to depth formula, preserve positions
    Object.keys(_worldColorCache).forEach(k => delete _worldColorCache[k]);
    await saveWorldToStorage(currentCluster);
    setWorldVersion(v => v + 1);
    setNewNodeId(newId);
    setTimeout(() => setNewNodeId(null), 700);
    dispatch({ type: 'NAVIGATE_TO', cluster: currentCluster, nodeId: newId });
  }, [currentCluster, dispatch]);

  const introScreen = introPhase !== 'done'
    ? <IntroScreen phase={introPhase} onTap={handleIntroTap} />
    : null;

  const accentRgb = useMemo(() => {
    if (viewMode === 'galaxy') return '80,220,200';
    return getNodeColor(activeId, currentCluster);
  }, [viewMode, activeId, currentCluster]);

  const accentHsl = useMemo(() => {
    return { h: 210, s: 80, l: 52 };
  }, []);

  const [galaxyJiggle, setGalaxyJiggle] = useState(false);
  const galaxyJiggleRef = useRef(false);
  galaxyJiggleRef.current = galaxyJiggle;
  const jiggleMapHitRef = useRef(false);
  const [galaxyColorPickerMapId, setGalaxyColorPickerMapId] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (!galaxyJiggleRef.current) return;
      const target = e.target as Element | null;
      if (target && target.closest('[data-galaxy-map]')) return;
      setGalaxyJiggle(false);
      setGalaxyColorPickerMapId(null);
    };
    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, []);

  const handleSetRootColor = useCallback(async (clusterId: string, color: { h: number; s: number; l: number } | null) => {
    const coreId = getCoreId(clusterId);
    const neuron = worlds[clusterId]?.neurons?.[coreId];
    if (!neuron) return;
    if (color === null) {
      delete neuron.color;
    } else {
      neuron.color = color;
    }
    delete _worldColorCache[clusterId];
    await saveWorldToStorage(clusterId);
    setWorldVersion(v => v + 1);
    setGalaxyColorPickerMapId(null);
  }, []);

  const [galaxyPan, setGalaxyPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const galaxyPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [galaxyZoom, setGalaxyZoom] = useState(1);
  const galaxyZoomRef = useRef(1);
  galaxyZoomRef.current = galaxyZoom;
  const galaxyDragStart = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const galaxyDragMoved = useRef(false);
  const galaxyDragIsEmpty = useRef(false);
  const itemPositionsRef = useRef<Record<string, { x: number; y: number }>>({});

  const [mapOffsets, setMapOffsets] = useState<Record<string, { x: number; y: number }>>(() => {
    try { return JSON.parse(localStorage.getItem('neura_map_offsets') || '{}'); } catch { return {}; }
  });
  const mapOffsetsRef = useRef<Record<string, { x: number; y: number }>>(mapOffsets);
  const mapDragState = useRef<{ mapId: string; px: number; py: number; ox: number; oy: number } | null>(null);

  const [deleteConfirmMapId, setDeleteConfirmMapId] = useState<string | null>(null);

  const [showAddMapModal, setShowAddMapModal] = useState(false);
  const [showAddChoice, setShowAddChoice] = useState(false);
  const [showAddClusterModal, setShowAddClusterModal] = useState(false);
  const [clusterNameInput, setClusterNameInput] = useState('');

  const galaxyContainerRef = useRef<HTMLDivElement>(null);
  const galaxyLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const galaxyLongPressStart = useRef<{ x: number; y: number } | null>(null);

  const galaxyPinchAccumRef = useRef(0);
  const galaxyPinchRafRef = useRef<number | null>(null);

  useEffect(() => {
    if (viewMode !== 'galaxy') return;
    const el = galaxyContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) {
        // Pinch-to-zoom: accumulate and apply via RAF (same as neuron view)
        galaxyPinchAccumRef.current += e.deltaY;
        if (!galaxyPinchRafRef.current) {
          galaxyPinchRafRef.current = requestAnimationFrame(() => {
            galaxyPinchRafRef.current = null;
            const delta = galaxyPinchAccumRef.current;
            galaxyPinchAccumRef.current = 0;
            const oldZoom = galaxyZoomRef.current;
            const newZoom = Math.min(4, Math.max(0.2, oldZoom * (1 - delta * 0.003)));
            const ratio = newZoom / oldZoom;
            const W = window.innerWidth;
            const H = window.innerHeight;
            const pan = galaxyPanRef.current;
            const cursorX = (el as any)._lastWheelX ?? W / 2;
            const cursorY = (el as any)._lastWheelY ?? H / 2;
            const newPan = {
              x: pan.x + (cursorX - W / 2 - pan.x) * (1 - ratio),
              y: pan.y + (cursorY - H / 2 - pan.y) * (1 - ratio),
            };
            galaxyZoomRef.current = newZoom;
            setGalaxyZoom(newZoom);
            galaxyPanRef.current = newPan;
            setGalaxyPan({ ...newPan });
          });
        }
        (el as any)._lastWheelX = e.clientX;
        (el as any)._lastWheelY = e.clientY;
        return;
      }
      // Trackpad swipe → pan (same sensitivity as neuron view)
      const zoom = galaxyZoomRef.current;
      const pan = galaxyPanRef.current;
      const newPan = { x: pan.x - e.deltaX / zoom, y: pan.y - e.deltaY / zoom };
      galaxyPanRef.current = newPan;
      setGalaxyPan({ ...newPan });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [viewMode]);

  const startGalaxyLongPress = useCallback((clientX: number, clientY: number) => {
    galaxyDragStart.current = { px: clientX, py: clientY, ox: galaxyPanRef.current.x, oy: galaxyPanRef.current.y };
    galaxyDragMoved.current = false;
    galaxyLongPressStart.current = { x: clientX, y: clientY };
    if (!galaxyJiggleRef.current) {
      if (galaxyLongPressTimer.current) clearTimeout(galaxyLongPressTimer.current);
      galaxyLongPressTimer.current = setTimeout(() => {
        setGalaxyJiggle(true);
        galaxyLongPressTimer.current = null;
      }, 700);
    }
  }, []);

  const galaxyMiddlePanning = useRef(false);
  const galaxyMiddleStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const handleGalaxyPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      galaxyMiddlePanning.current = true;
      galaxyMiddleStart.current = { x: e.clientX, y: e.clientY, ox: galaxyPanRef.current.x, oy: galaxyPanRef.current.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0 && e.button !== undefined) return;
    if (e.target !== e.currentTarget) return;
    if (galaxyJiggleRef.current) return;
    galaxyDragIsEmpty.current = true;
    setShowAddChoice(false);
    startGalaxyLongPress(e.clientX, e.clientY);
  }, [startGalaxyLongPress]);

  const handleGalaxyPointerMove = useCallback((e: React.PointerEvent) => {
    if (galaxyMiddlePanning.current && galaxyMiddleStart.current) {
      const { x: sx, y: sy, ox, oy } = galaxyMiddleStart.current;
      const newPan = { x: ox + (e.clientX - sx), y: oy + (e.clientY - sy) };
      galaxyPanRef.current = newPan;
      setGalaxyPan({ ...newPan });
      return;
    }
    if (mapDragState.current) {
      const ms = mapDragState.current;
      const dx = e.clientX - ms.px;
      const dy = e.clientY - ms.py;
      if (Math.hypot(dx, dy) > 4) galaxyDragMoved.current = true;
      const newOff = { x: ms.ox + dx, y: ms.oy + dy };
      mapOffsetsRef.current = { ...mapOffsetsRef.current, [ms.mapId]: newOff };
      setMapOffsets({ ...mapOffsetsRef.current });
      localStorage.setItem('neura_map_offsets', JSON.stringify(mapOffsetsRef.current));
      return;
    }
    if (!galaxyDragStart.current) return;
    const dx = e.clientX - galaxyDragStart.current.px;
    const dy = e.clientY - galaxyDragStart.current.py;
    if (Math.hypot(dx, dy) > 8) {
      galaxyDragMoved.current = true;
      if (galaxyLongPressTimer.current) { clearTimeout(galaxyLongPressTimer.current); galaxyLongPressTimer.current = null; }
    }
    if (!galaxyJiggleRef.current && !galaxyDragIsEmpty.current) return;
    const newPan = { x: galaxyDragStart.current.ox + dx, y: galaxyDragStart.current.oy + dy };
    galaxyPanRef.current = newPan;
    setGalaxyPan({ ...newPan });
  }, []);

  const handleGalaxyPointerUp = useCallback(async () => {
    if (galaxyMiddlePanning.current) {
      galaxyMiddlePanning.current = false;
      galaxyMiddleStart.current = null;
      return;
    }
    if (galaxyLongPressTimer.current) { clearTimeout(galaxyLongPressTimer.current); galaxyLongPressTimer.current = null; }
    galaxyDragIsEmpty.current = false;

    // Detect cluster drop in jiggle mode
    const ms = mapDragState.current;
    if (ms && galaxyJiggleRef.current && galaxyDragMoved.current) {
      const zoom = galaxyZoomRef.current;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const getPos = (mapId: string) => {
        const off = itemPositionsRef.current[mapId] || { x: 0, y: 0 };
        const mapOff = mapOffsetsRef.current[mapId] || { x: 0, y: 0 };
        return { x: W / 2 + off.x * W / 100 + mapOff.x, y: H / 2 + off.y * H / 100 + mapOff.y };
      };
      const draggedPos = getPos(ms.mapId);
      let dropCluster: string | null = null;
      for (const m of GALAXY_MAPS) {
        if (m.id === ms.mapId || m.type !== 'cluster') continue;
        const clusterPos = getPos(m.id);
        const coreNode = Object.values(worlds[m.rootCluster]?.neurons || {}).find(n => n.isCore);
        const hitRadius = (coreNode?.size ?? 300) * 1.11 * GALAXY_SCALE * zoom / 2;
        const screenDist = Math.hypot((draggedPos.x - clusterPos.x) * zoom, (draggedPos.y - clusterPos.y) * zoom);
        if (screenDist < hitRadius + 30) { dropCluster = m.id; break; }
      }
      if (dropCluster) {
        const cluster = GALAXY_MAPS.find(m => m.id === dropCluster)!;
        if (!cluster.children) cluster.children = [];
        if (!cluster.children.includes(ms.mapId)) cluster.children.push(ms.mapId);
        // Remove from other clusters
        for (const m of GALAXY_MAPS) {
          if (m.id !== dropCluster && m.type === 'cluster') {
            m.children = (m.children || []).filter(id => id !== ms.mapId);
          }
        }
        await saveGalaxyIndexToStorage();
        setWorldVersion(v => v + 1);
      }
    }

    mapDragState.current = null;
    galaxyDragStart.current = null;
    galaxyLongPressStart.current = null;
  }, []);

  const handleDeleteMap = useCallback(async (mapId: string) => {
    await deleteMapFromStorage(mapId);
    if (activeGalaxyMap === mapId) {
      const remaining = GALAXY_MAPS[0];
      if (remaining) setActiveGalaxyMap(remaining.id);
    }
    setWorldVersion(v => v + 1);
  }, [activeGalaxyMap]);

  const handleCreateMap = useCallback(async (label: string, insight: string) => {
    const newId = `map_${Date.now()}`;
    const rootId = `${newId}_root`;
    const coreId = `${newId}_core`;
    const newWorld = {
      label: label.toUpperCase(),
      neurons: {
        [coreId]: {
          id: coreId,
          label: label.toUpperCase(),
          size: 300,
          x: 0, y: 0,
          isCore: true,
          children: [] as string[],
          parentId: null,
          content: insight ? { body: insight } : undefined,
        }
      }
    };
    const newMeta = { parentClusterId: null, siblings: [], returnTarget: null, ancestorCrumbs: [] };
    const mapDef = { id: newId, label: label.toUpperCase(), rootCluster: rootId, clusterIds: [rootId] };
    worlds[rootId] = newWorld;
    clusterMeta[rootId] = newMeta;
    await saveMapToStorage(mapDef, { [rootId]: newWorld }, { [rootId]: newMeta });
    setShowAddMapModal(false);
    setWorldVersion(v => v + 1);
    dispatch({ type: 'NAVIGATE_TO', cluster: rootId, nodeId: coreId });
  }, []);

  const handleCreateCluster = useCallback(async (label: string) => {
    const newId = `cluster_${Date.now()}`;
    const rootId = `${newId}_root`;
    const coreId = `${newId}_core`;
    const newWorld = {
      label: label.toUpperCase(),
      neurons: {
        [coreId]: {
          id: coreId, label: label.toUpperCase(),
          size: 300, x: 0, y: 0,
          isCore: true, children: [] as string[], parentId: null,
        }
      }
    };
    const newMeta = { parentClusterId: null, siblings: [], returnTarget: null, ancestorCrumbs: [] };
    const mapDef: MapDef = { id: newId, label: label.toUpperCase(), rootCluster: rootId, clusterIds: [rootId], type: 'cluster', children: [] };
    worlds[rootId] = newWorld;
    clusterMeta[rootId] = newMeta;
    await saveMapToStorage(mapDef, { [rootId]: newWorld }, { [rootId]: newMeta });
    setShowAddClusterModal(false);
    setClusterNameInput('');
    setWorldVersion(v => v + 1);
  }, []);

  const isInGalaxy = viewMode === 'galaxy';
  const showGalaxyLayer = isInGalaxy || viewTransPhase === 'neuron-exit' || viewTransPhase === 'galaxy-enter' || viewTransPhase === 'neuron-enter';
  const showNeuronLayer = !isInGalaxy || viewTransPhase === 'galaxy-exit' || viewTransPhase === 'neuron-enter';

  const galaxyLayerOpacity = (() => {
    if (viewTransPhase === 'galaxy-exit') return 0;
    if (viewTransPhase === 'neuron-exit') return 0;
    if (viewTransPhase === 'galaxy-enter') return 1;
    if (viewTransPhase === 'neuron-enter') return 0;
    return isInGalaxy ? 1 : 0;
  })();

  const galaxyLayerScale = (() => {
    if (viewTransPhase === 'galaxy-exit') return 1.18;
    if (viewTransPhase === 'neuron-exit') return 0.88;
    if (viewTransPhase === 'galaxy-enter') return 1;
    if (viewTransPhase === 'neuron-enter') return 1.18;
    return isInGalaxy ? 1 : 0.88;
  })();

  const neuronLayerOpacity = (() => {
    if (viewTransPhase === 'galaxy-exit') return 0;
    if (viewTransPhase === 'neuron-enter') return 1;
    if (viewTransPhase === 'neuron-exit') return 0;
    if (viewTransPhase === 'galaxy-enter') return 0;
    return isInGalaxy ? 0 : 1;
  })();

  const neuronLayerScale = (() => {
    if (viewTransPhase === 'galaxy-exit') return 0.9;
    if (viewTransPhase === 'neuron-enter') return 1;
    if (viewTransPhase === 'neuron-exit') return 0.9;
    if (viewTransPhase === 'galaxy-enter') return 0.9;
    return isInGalaxy ? 0.9 : 1;
  })();

  const galaxyTransDuration = (viewTransPhase === 'galaxy-exit' || viewTransPhase === 'neuron-exit') ? 380 : 520;
  const neuronTransDuration = (viewTransPhase === 'neuron-enter') ? 520 : 360;

  const BLOB = '52% 48% 60% 40% / 48% 52% 48% 52%';
  const GALAXY_SCALE = 0.164;
  const gN = GALAXY_MAPS.length;
  const xLeft  = -24;
  const xRight =  24;
  const ySpread = 18;
  const jitter = [
    { dx:  1.5, dy: -1 }, { dx: -1.5, dy:  1.5 }, { dx:  2,   dy:  1 },
    { dx: -1,   dy: -1.5 }, { dx:  1,  dy:  2   }, { dx: -2,   dy: -1 },
  ];
  const itemPositions: Record<string, { x: number; y: number }> = {};
  GALAXY_MAPS.forEach((m, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const totalRows = Math.ceil(gN / 2);
    const yFrac = totalRows <= 1 ? 0.5 : row / (totalRows - 1);
    const yBase = totalRows <= 1 ? 0 : -ySpread + yFrac * (ySpread * 2);
    const x = col === 0 ? xLeft : xRight;
    const j = jitter[i % jitter.length];
    itemPositions[m.id] = { x: x + j.dx, y: yBase + j.dy };
  });
  itemPositionsRef.current = itemPositions;

  return (
    <>
      <StarField
        scrollX={isInGalaxy ? 0 : (panOffset ? panOffset.x : currentNeuron.x)}
        scrollY={isInGalaxy ? 0 : (panOffset ? panOffset.y : currentNeuron.y)}
        accentH={accentHsl.h} accentS={accentHsl.s} accentL={accentHsl.l}
      />
      {(() => {
        if (!showGalaxyLayer) return null;
        return (
        <>
        <div ref={galaxyContainerRef} className="fixed inset-0 text-white font-sans overflow-hidden touch-none select-none"
          style={{
            height: '100dvh',
            background: 'transparent',
            opacity: galaxyLayerOpacity,
            transform: `scale(${galaxyLayerScale})`,
            transition: `opacity ${galaxyTransDuration}ms cubic-bezier(0.4,0,0.2,1), transform ${galaxyTransDuration}ms cubic-bezier(0.4,0,0.2,1)`,
            pointerEvents: (isInGalaxy && viewTransPhase === 'idle') ? 'auto' : 'none',
            zIndex: isInGalaxy ? 10 : 5,
          }}
          onPointerDown={handleGalaxyPointerDown}
          onPointerMove={handleGalaxyPointerMove}
          onPointerUp={handleGalaxyPointerUp}
          onPointerCancel={handleGalaxyPointerUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}>
          <style>{`
            @keyframes galaxyFloat { 0%{transform:translate(0,0)} 25%{transform:translate(18px,-40px)} 50%{transform:translate(-12px,-80px)} 75%{transform:translate(-20px,-35px)} 100%{transform:translate(0,0)} }
            @keyframes galaxyWiggle { 0%{transform:translate(-50%,-50%) rotate(-2.5deg) scale(1.02)} 100%{transform:translate(-50%,-50%) rotate(2.5deg) scale(0.98)} }
          `}</style>

          <div style={{
            position: 'absolute',
            inset: 0,
            transform: `translate(${galaxyPan.x}px,${galaxyPan.y}px) scale(${galaxyZoom})`,
            transformOrigin: '50% 50%',
            transition: (galaxyDragStart.current || mapDragState.current) ? 'none' : 'transform 0.4s cubic-bezier(0.16,1,0.3,1)',
          }}>
            {GALAXY_MAPS.length === 0 && (
              <div style={{
                position: 'fixed',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}>
                <span style={{
                  color: 'rgba(255,255,255,0.18)',
                  fontSize: 11,
                  letterSpacing: '0.25em',
                  textTransform: 'uppercase',
                  fontFamily: 'monospace',
                }}>
                  Tap + to create your first map
                </span>
              </div>
            )}

            {/* Axon lines: cluster → children */}
            {(() => {
              const W = window.innerWidth;
              const H = window.innerHeight;
              const getPos = (mapId: string) => {
                const off = itemPositions[mapId] || { x: 0, y: 0 };
                const mapOff = mapOffsets[mapId] || { x: 0, y: 0 };
                return { x: W / 2 + off.x * W / 100 + mapOff.x, y: H / 2 + off.y * H / 100 + mapOff.y };
              };
              const lines: React.ReactNode[] = [];
              for (const m of GALAXY_MAPS) {
                if (m.type !== 'cluster' || !m.children?.length) continue;
                const cp = getPos(m.id);
                for (const childId of m.children) {
                  const chp = getPos(childId);
                  const col = (() => { const coreNode = Object.values(worlds[m.rootCluster]?.neurons || {}).find(n => n.isCore); return coreNode ? getNodeColor(coreNode.id, m.rootCluster) : '80,220,200'; })();
                  lines.push(
                    <line key={`${m.id}-${childId}`}
                      x1={cp.x} y1={cp.y} x2={chp.x} y2={chp.y}
                      stroke={`rgba(${col},0.35)`} strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                }
              }
              return lines.length > 0 ? (
                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none', zIndex: 1 }}>
                  {lines}
                </svg>
              ) : null;
            })()}

            {GALAXY_MAPS.map((mapCfg) => {
              const rootNeurons = Object.values(worlds[mapCfg.rootCluster]?.neurons || {});
              const isActive = activeGalaxyMap === mapCfg.id;
              const offset = itemPositions[mapCfg.id] || { x: 0, y: 0 };
              const mapOff = mapOffsets[mapCfg.id] || { x: 0, y: 0 };
              const mapIdx = GALAXY_MAPS.indexOf(mapCfg);
              return (
                <div key={mapCfg.id}
                  data-galaxy-map
                  onPointerDown={e => {
                    e.stopPropagation();
                    if (galaxyJiggleRef.current) {
                      const cur = mapOffsetsRef.current[mapCfg.id] || { x: 0, y: 0 };
                      mapDragState.current = { mapId: mapCfg.id, px: e.clientX, py: e.clientY, ox: cur.x, oy: cur.y };
                      galaxyDragMoved.current = false;
                    } else {
                      galaxyDragIsEmpty.current = false;
                      startGalaxyLongPress(e.clientX, e.clientY);
                    }
                  }}
                  onPointerMove={handleGalaxyPointerMove}
                  onPointerUp={(e) => {
                    const wasDrag = galaxyDragMoved.current;
                    handleGalaxyPointerUp();
                    if (!wasDrag && !galaxyJiggleRef.current) {
                      if (activeGalaxyMap === mapCfg.id) {
                        // Clusters don't navigate into neuron view
                        if (mapCfg.type !== 'cluster') {
                          if (DISABLE_CLUSTER_VIEW) {
                            const coreId = getCoreId(mapCfg.rootCluster);
                            dispatch({ type: 'NAVIGATE_TO', cluster: mapCfg.rootCluster, nodeId: coreId });
                          } else {
                            dispatch({ type: 'NAVIGATE_CLUSTER', cluster: mapCfg.rootCluster });
                          }
                        }
                      } else setActiveGalaxyMap(mapCfg.id);
                    }
                    e.stopPropagation();
                  }}
                  onPointerCancel={handleGalaxyPointerUp}
                  style={{
                    position: 'absolute',
                    left: `calc(50% + ${offset.x}vw + ${mapOff.x}px)`,
                    top:  `calc(50% + ${offset.y}vh + ${mapOff.y}px)`,
                    transform: 'translate(-50%, -50%)',
                    cursor: galaxyJiggle ? 'grab' : 'pointer',
                    transition: 'filter 0.4s ease, opacity 0.4s ease',
                    filter: (!isActive && activeGalaxyMap !== '') ? 'brightness(0.5)' : 'brightness(1)',
                    animation: galaxyJiggle ? `galaxyWiggle 0.3s ${(mapIdx % 3) * 0.05}s ease-in-out infinite alternate` : 'none',
                  }}>
                  {galaxyJiggle && (() => {
                    const coreNode = rootNeurons.find(n => n.isCore);
                    const coreRadius = coreNode ? (coreNode.size * 1.11 * GALAXY_SCALE) / 2 : 25;
                    const coreCol = coreNode ? getNodeColor(coreNode.id, mapCfg.rootCluster) : '80,220,200';
                    const isPickerOpen = galaxyColorPickerMapId === mapCfg.id;
                    return (
                      <>
                        {/* Delete button — top left */}
                        <button
                          onPointerDown={e => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmMapId(mapCfg.id);
                          }}
                          style={{
                            position: 'absolute',
                            top: -coreRadius - 6,
                            left: -coreRadius - 6,
                            width: 26, height: 26,
                            borderRadius: '50%',
                            background: 'rgba(90,100,110,0.88)',
                            border: '1.5px solid rgba(180,190,200,0.5)',
                            color: 'rgba(210,215,220,0.95)',
                            fontSize: 18,
                            fontWeight: 300,
                            cursor: 'pointer',
                            zIndex: 10,
                            boxShadow: '0 2px 10px rgba(0,0,0,0.6)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <span style={{ fontSize: 20, lineHeight: 1, marginTop: -1 }}>−</span>
                        </button>

                        {/* Color ball — top right */}
                        <div style={{ position: 'absolute', top: -coreRadius - 6, left: coreRadius - 20, zIndex: 20 }}>
                          <button
                            onPointerDown={e => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              setGalaxyColorPickerMapId(prev => prev === mapCfg.id ? null : mapCfg.id);
                            }}
                            style={{
                              width: 26, height: 26,
                              borderRadius: '50%',
                              background: `rgba(${coreCol},0.88)`,
                              border: isPickerOpen ? '2px solid rgba(255,255,255,0.9)' : '1.5px solid rgba(255,255,255,0.45)',
                              cursor: 'pointer',
                              boxShadow: `0 2px 10px rgba(0,0,0,0.6), 0 0 12px rgba(${coreCol},0.5)`,
                              display: 'block',
                              padding: 0,
                            }}
                          />

                          {isPickerOpen && (
                            <div
                              onPointerDown={e => e.stopPropagation()}
                              style={{
                                position: 'absolute',
                                bottom: 'calc(100% + 8px)',
                                right: 0,
                                background: 'rgba(14,14,20,0.97)',
                                backdropFilter: 'blur(16px)',
                                WebkitBackdropFilter: 'blur(16px)',
                                borderRadius: 14,
                                padding: 10,
                                zIndex: 500,
                                boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                width: 'max-content',
                              }}
                            >
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginBottom: coreNode?.color ? 8 : 0 }}>
                                {GALAXY_COLOR_PRESETS.map((preset, idx) => {
                                  const rgb = hslToRgb(preset.h, preset.s, preset.l);
                                  const isSelected = coreNode?.color &&
                                    coreNode.color.h === preset.h &&
                                    coreNode.color.s === preset.s &&
                                    coreNode.color.l === preset.l;
                                  return (
                                    <div
                                      key={idx}
                                      onPointerDown={e => e.stopPropagation()}
                                      onClick={(e) => { e.stopPropagation(); handleSetRootColor(mapCfg.rootCluster, preset); }}
                                      style={{
                                        width: 24, height: 24,
                                        borderRadius: '50%',
                                        background: `rgb(${rgb})`,
                                        cursor: 'pointer',
                                        border: isSelected ? '2px solid rgba(255,255,255,0.95)' : '1.5px solid rgba(255,255,255,0.15)',
                                        boxShadow: isSelected ? `0 0 8px rgba(${rgb},0.8)` : 'none',
                                        transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                                        transition: 'transform 0.12s ease',
                                      }}
                                    />
                                  );
                                })}
                              </div>
                              {coreNode?.color && (
                                <div
                                  onPointerDown={e => e.stopPropagation()}
                                  onClick={(e) => { e.stopPropagation(); handleSetRootColor(mapCfg.rootCluster, null); }}
                                  style={{
                                    textAlign: 'center',
                                    fontSize: 9,
                                    letterSpacing: '0.15em',
                                    textTransform: 'uppercase',
                                    color: 'rgba(255,255,255,0.45)',
                                    cursor: 'pointer',
                                    paddingTop: 2,
                                  }}
                                >
                                  Reset
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                  <div style={{
                    transform: `scale(${GALAXY_SCALE})`,
                    transformOrigin: 'center',
                    position: 'relative', width: 0, height: 0,
                  }}>
                    {rootNeurons.map((node, nodeIndex) => {
                      const col  = getNodeColor(node.id, mapCfg.rootCluster);
                      const pal  = getNodePalette(node.id, mapCfg.rootCluster);
                      const fill = hslToRgb(pal.h, pal.s, pal.l);
                      const delay = node.isCore ? 0 : 80 + nodeIndex * 60;
                      const sz = node.isCore ? node.size * 1.11 : node.size;
                      const SWARM = 0.4;
                      const gx = node.isCore ? node.x : node.x * SWARM;
                      const gy = node.isCore ? node.y : node.y * SWARM;
                      return (
                        <div key={node.id} style={{
                          position: 'absolute', width: sz, height: sz,
                          left: gx - sz / 2, top: gy - sz / 2,
                          zIndex: node.isCore ? 2 : 1,
                          opacity: galaxyEntered ? (node.isCore ? 1 : 0.35) : 0,
                          transform: `translate(${galaxyEntered ? 0 : -gx}px,${galaxyEntered ? 0 : -gy}px) scale(${galaxyEntered ? 1 : 0.1})`,
                          transition: `transform 0.7s cubic-bezier(0.34,1.56,0.64,1) ${delay}ms, opacity 0.4s ease ${delay}ms`,
                          animation: (!node.isCore && galaxyEntered && !galaxyJiggle) ? `galaxyFloat ${6 + (nodeIndex % 4) * 0.9}s ${nodeIndex * 0.6 + 0.7}s ease-in-out infinite` : 'none',
                        }}>
                          <div style={{ position: 'absolute', inset: 0, borderRadius: BLOB, boxShadow: node.isCore ? `0 0 100px 30px rgba(${col},0.4)${isActive ? `, 0 0 160px 60px rgba(${col},0.5)` : ''}` : `0 0 20px 6px rgba(${col},0.12)` }} />
                          <div style={{ position: 'absolute', inset: 0, borderRadius: BLOB, overflow: 'hidden', background: node.isCore ? `radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0.92) 100%), radial-gradient(ellipse at 40% 38%, rgba(${fill},0.55) 0%, rgba(${fill},0.3) 50%, rgba(${fill},0.08) 100%), rgb(4,4,8)` : `radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.72) 70%, rgba(0,0,0,0.92) 100%), radial-gradient(ellipse at 40% 38%, rgba(${fill},0.40) 0%, rgba(${fill},0.20) 50%, rgba(${fill},0.05) 100%), rgb(4,4,8)`, boxShadow: node.isCore ? `0 0 0 ${isActive ? '12px' : '8px'} rgba(${col},${isActive ? '1' : '0.8'})` : `0 0 0 2px rgba(${col},0.2)` }}>
                            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.95) 100%)' }} />
                          </div>
                          {node.isCore && (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                              <span style={{ fontSize: 80, fontWeight: 900, color: 'white', textTransform: 'uppercase', letterSpacing: '0.20em', textShadow: '0 2px 16px rgba(0,0,0,1)', whiteSpace: 'pre-line', textAlign: 'center', lineHeight: 1.3 }}>
                                {node.label}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {showGalaxyLayer && (<>
            {showAddChoice && (
              <div
                onPointerDown={e => e.stopPropagation()}
                style={{
                  position: 'fixed',
                  bottom: 'calc(max(48px, env(safe-area-inset-bottom, 48px)) + 64px)',
                  right: 28,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  zIndex: 901,
                  alignItems: 'flex-end',
                }}
              >
                {([
                  { label: 'New Map', action: () => { setShowAddChoice(false); setShowAddMapModal(true); } },
                  { label: 'New Cluster', action: () => { setShowAddChoice(false); setShowAddClusterModal(true); } },
                ] as { label: string; action: () => void }[]).map(({ label, action }) => (
                  <button key={label} onClick={action} style={{
                    padding: '10px 20px',
                    borderRadius: 24,
                    background: 'rgba(8,10,18,0.92)',
                    border: '1px solid rgba(80,220,200,0.45)',
                    color: 'rgba(80,220,200,0.95)',
                    fontSize: 11,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.7)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    whiteSpace: 'nowrap',
                  }}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={() => { setShowAddChoice(prev => !prev); }}
              style={{
                position: 'fixed',
                bottom: 'max(48px, env(safe-area-inset-bottom, 48px))',
                right: 28,
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: showAddChoice ? 'rgba(80,220,200,0.3)' : 'rgba(80,220,200,0.18)',
                border: '1.5px solid rgba(80,220,200,0.6)',
                color: 'rgba(80,220,200,1)',
                fontSize: 28,
                fontWeight: 300,
                cursor: 'pointer',
                zIndex: 902,
                boxShadow: '0 4px 24px rgba(0,0,0,0.6), 0 0 24px rgba(80,220,200,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(8px)',
                transition: 'transform 0.2s ease, background 0.15s ease',
                transform: showAddChoice ? 'rotate(45deg)' : 'none',
              }}
            >
              <span style={{ fontSize: 30, lineHeight: 1, marginTop: -2 }}>+</span>
            </button>
          </>)}

          {galaxyJiggle && (
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={() => { setGalaxyJiggle(false); setGalaxyColorPickerMapId(null); }}
              style={{
                position: 'fixed',
                bottom: 'max(48px, env(safe-area-inset-bottom, 48px))',
                left: 28,
                padding: '10px 20px',
                borderRadius: 24,
                background: 'rgba(10,10,16,0.75)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: 'rgba(255,255,255,0.65)',
                fontSize: 10,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                fontWeight: 600,
                cursor: 'pointer',
                zIndex: 900,
                backdropFilter: 'blur(12px)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
              }}
            >
              Done
            </button>
          )}

          <header className="fixed left-5 z-[2000]" style={{ top: 'max(24px, env(safe-area-inset-top))' }}>
            <NeuraLogo onClick={() => dispatch({ type: 'NAVIGATE_GALAXY' })} />
          </header>
        </div>

        {deleteConfirmMapId && (
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 9000,
              background: 'rgba(0,0,0,0.72)',
              backdropFilter: 'blur(10px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onPointerDown={e => e.stopPropagation()}
          >
            <div style={{
              background: 'rgba(14,18,26,0.97)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 20,
              padding: '36px 32px 28px',
              maxWidth: 340,
              width: '90vw',
              boxShadow: '0 20px 80px rgba(0,0,0,0.8)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
            }}>
              <div style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(180,185,195,0.7)', marginBottom: 18, fontWeight: 600 }}>
                Delete map
              </div>
              <div style={{ fontSize: 16, color: 'rgba(230,232,238,0.92)', textAlign: 'center', lineHeight: 1.55, marginBottom: 28 }}>
                Are you sure you want to delete this map? This cannot be undone.
              </div>
              <div style={{ display: 'flex', gap: 12, width: '100%' }}>
                <button
                  onClick={() => setDeleteConfirmMapId(null)}
                  style={{
                    flex: 1, padding: '12px 0', borderRadius: 12,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.14)',
                    color: 'rgba(200,205,215,0.85)',
                    fontSize: 13, fontWeight: 600, letterSpacing: '0.1em',
                    textTransform: 'uppercase', cursor: 'pointer',
                  }}
                >
                  No
                </button>
                <button
                  onClick={async () => {
                    await handleDeleteMap(deleteConfirmMapId);
                    setDeleteConfirmMapId(null);
                  }}
                  style={{
                    flex: 1, padding: '12px 0', borderRadius: 12,
                    background: 'rgba(80,90,100,0.75)',
                    border: '1px solid rgba(180,190,200,0.3)',
                    color: 'rgba(220,225,230,0.95)',
                    fontSize: 13, fontWeight: 600, letterSpacing: '0.1em',
                    textTransform: 'uppercase', cursor: 'pointer',
                  }}
                >
                  Yes
                </button>
              </div>
            </div>
          </div>
        )}

        {showAddMapModal && (
          <AddMapModal
            onConfirm={handleCreateMap}
            onCancel={() => setShowAddMapModal(false)}
          />
        )}

        {showAddClusterModal && (() => {
          const TEAL = '80,220,200';
          return (
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
              onPointerDown={(e) => { if (e.target === e.currentTarget) { setShowAddClusterModal(false); setClusterNameInput(''); } }}
            >
              <div
                style={{ background: 'rgba(8,10,18,0.98)', border: `1px solid rgba(${TEAL},0.22)`, borderRadius: 20, padding: '28px 24px 22px', width: 'min(340px, 90vw)', boxShadow: `0 20px 60px rgba(0,0,0,0.85)`, animation: 'modalEnter 0.22s cubic-bezier(0.34,1.56,0.64,1) both' }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <p style={{ fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', fontWeight: 900, color: `rgba(${TEAL},0.9)`, marginBottom: 22 }}>
                  New cluster
                </p>
                <input
                  autoFocus
                  value={clusterNameInput}
                  onChange={e => setClusterNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && clusterNameInput.trim()) handleCreateCluster(clusterNameInput); if (e.key === 'Escape') { setShowAddClusterModal(false); setClusterNameInput(''); } }}
                  placeholder="Cluster name..."
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: `1px solid rgba(${TEAL},0.18)`, borderRadius: 10, padding: '10px 14px', fontSize: 15, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.9)', outline: 'none', boxSizing: 'border-box', caretColor: `rgba(${TEAL},1)`, fontFamily: 'inherit', marginBottom: 20 }}
                  onFocus={e => { e.target.style.borderColor = `rgba(${TEAL},0.55)`; }}
                  onBlur={e => { e.target.style.borderColor = `rgba(${TEAL},0.18)`; }}
                />
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setShowAddClusterModal(false); setClusterNameInput(''); }} style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button
                    disabled={!clusterNameInput.trim()}
                    onClick={() => clusterNameInput.trim() && handleCreateCluster(clusterNameInput)}
                    style={{ flex: 2, padding: '11px 0', borderRadius: 10, border: 'none', background: clusterNameInput.trim() ? `rgba(${TEAL},0.9)` : 'rgba(255,255,255,0.08)', color: clusterNameInput.trim() ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.2)', fontSize: 11, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', cursor: clusterNameInput.trim() ? 'pointer' : 'default' }}
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {introScreen}
        </>
        );
      })()}

    <div ref={mainContainerRef}
      className="fixed inset-0 text-white font-sans overflow-hidden touch-none select-none flex items-center justify-center"
      style={{
        height: '100dvh',
        background: 'transparent',
        opacity: neuronLayerOpacity,
        transform: `scale(${neuronLayerScale})`,
        transition: `opacity ${neuronTransDuration}ms cubic-bezier(0.4,0,0.2,1), transform ${neuronTransDuration}ms cubic-bezier(0.4,0,0.2,1)`,
        pointerEvents: (!isInGalaxy && viewTransPhase === 'idle') ? 'auto' : 'none',
        zIndex: isInGalaxy ? 5 : 10,
      }}
      onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
      onAuxClick={e => e.preventDefault()}
      onWheel={handleWheel}>
      <div className="absolute inset-0 flex items-center justify-center" style={(() => {
        const effectiveZoom = DISABLE_CLUSTER_VIEW ? neuronZoom : (viewMode === 'cluster' ? 0.146 : NEURON_SCALE);
        const fixedZoom = DISABLE_CLUSTER_VIEW ? neuronZoom : NEURON_SCALE;
        const transform = (!DISABLE_CLUSTER_VIEW && viewMode === 'cluster')
          ? 'scale(0.146)'
          : frozenOffset
            ? `scale(${fixedZoom}) translate(${-frozenOffset.x}px,${-frozenOffset.y}px)`
            : panOffset
              ? `scale(${effectiveZoom}) translate(${-panOffset.x}px,${-panOffset.y}px)`
            : jigglePan
              ? `scale(${effectiveZoom}) translate(${-currentNeuron.x + jigglePan.x / effectiveZoom}px,${-currentNeuron.y + jigglePan.y / effectiveZoom}px)`
              : `scale(${effectiveZoom}) translate(${-currentNeuron.x}px,${-currentNeuron.y}px)`;
        return {
          zIndex: 0,
          transform,
          opacity: (isTransitioning && !portalPhase) ? 0 : 1,
          transition: (frozenOffset || justLanded || jigglePan || panOffset) ? 'none' : `transform ${snapDuration}s cubic-bezier(0.16,1,0.3,1), opacity 0.7s ease`,
        };
      })()}>
        <div className="relative w-0 h-0">
          {clusterList.map((clusterId, idx) => {
            if (!worlds[clusterId]) return null;
            const isActive = clusterId === currentCluster;
            if (viewMode === 'cluster' && !isActive) return null;
            const offset = (idx - clusterIndex) * 5500;
            return (
              <div key={clusterId} ref={isActive ? neuronLayerRef : undefined} className="absolute" style={{
                transform: viewMode === 'cluster' ? 'none' : `translateX(${offset}px)`,
                opacity: isActive ? 1 : 0,
                transition: justLanded ? 'none' : 'opacity 0.7s ease',
              }}>
                {Object.values(worlds[clusterId].neurons).map((node, nodeIndex) => (
                  <NeuronNode key={node.id} node={node}
                    spreadPos={clusterPos?.[node.id] ?? null}
                    currentNeuron={currentNeuron}
                    nodes={worlds[clusterId].neurons}
                    viewMode={viewMode}
                    isTransitioning={isTransitioning}
                    selectedTarget={panSnapId ?? selectedTarget}
                    portalPhase={portalPhase}
                    justLanded={justLanded}
                    clusterId={clusterId}
                    currentCluster={currentCluster}
                    clusterEnterKey={state.clusterEnterKey}
                    nodeIndex={nodeIndex}
                    hoveredId={hoveredId}
                    jiggleMode={jiggleMode && clusterId === currentCluster}
                    jiggleDragId={jiggleDrag?.nodeId ?? null}
                    jiggleDragOffsetX={jiggleDrag?.screenDx ?? 0}
                    jiggleDragOffsetY={jiggleDrag?.screenDy ?? 0}
                    jiggleDragDescendants={jiggleDrag?.descendants ?? null}
                    newNodeId={newNodeId}
                    neuronZoom={neuronZoom}
                    onHover={setHoveredId}
                    onOverlay={(id) => dispatch({ type: 'SET_OVERLAY', payload: id })}
                    onJump={handleJump}
                    onEnterCluster={(id) => dispatch({ type: 'NAVIGATE_CLUSTER', cluster: id })}
                    onReturnToParent={() => { const p = clusterMeta[currentCluster]?.parentClusterId; if (p) dispatch({ type: 'NAVIGATE_CLUSTER', cluster: p }); }}
                    epoch={epochRef.current}
                    swellScale={swellScale}
                    dispatch={dispatch}
                  />
                ))}
                <svg className="absolute inset-0 overflow-visible pointer-events-none" style={{ zIndex: 0 }}>
                  {(() => {
                    const dragScale = viewMode === 'cluster' ? 0.146 : neuronZoom;
                    const dragSceneDx = jiggleDrag ? jiggleDrag.screenDx / dragScale : 0;
                    const dragSceneDy = jiggleDrag ? jiggleDrag.screenDy / dragScale : 0;
                    const dragSet = jiggleDrag ? new Set(jiggleDrag.descendants) : null;
                    return Object.values(worlds[clusterId].neurons).map(n =>
                      (n.children || []).map(cid => {
                        const child = worlds[clusterId].neurons[cid];
                        if (!child) return null;
                        const sig = highlightedTarget && isActive && viewMode === 'neuron' &&
                          ((n.id === activeId && cid === highlightedTarget) || (cid === activeId && n.id === highlightedTarget));
                        const strokeW = viewMode === 'cluster' ? 28 : (sig ? 18 : 6.75);
                        const strokeO = viewMode === 'cluster' ? 0.42 : (sig ? 0.96 : 0.09);
                        const nBase = clusterPos?.[n.id] ?? n;
                        const cBase = clusterPos?.[cid] ?? child;
                        const nDragged = dragSet?.has(n.id);
                        const cDragged = dragSet?.has(cid);
                        const nx  = nBase.x + (nDragged ? dragSceneDx : 0);
                        const ny  = nBase.y + (nDragged ? dragSceneDy : 0);
                        const cx2 = cBase.x + (cDragged ? dragSceneDx : 0);
                        const cy2 = cBase.y + (cDragged ? dragSceneDy : 0);
                        return (
                          <g key={`${n.id}-${cid}`}>
                            <line x1={nx} y1={ny} x2={cx2} y2={cy2} stroke={`rgba(255,255,255,${strokeO})`} strokeWidth={strokeW} style={{ transition: (nDragged || cDragged) ? 'none' : 'all 0.4s ease' }} />
                            {sig && (
                              <circle r="4" fill="white">
                                <animateMotion dur="0.7s" repeatCount="indefinite"
                                  path={`M ${highlightedTarget === cid ? n.x : child.x} ${highlightedTarget === cid ? n.y : child.y} L ${highlightedTarget === cid ? child.x : n.x} ${highlightedTarget === cid ? child.y : n.y}`} />
                              </circle>
                            )}
                          </g>
                        );
                      })
                    );
                  })()}
                </svg>
                <svg className="absolute inset-0 overflow-visible" style={{ zIndex: 0, pointerEvents: 'none' }}>
                  {Object.values(worlds[clusterId].neurons).map(n => {
                    if (!n.hasCluster) return null;
                    const axonKey = `fwd-${n.id}`;
                    const isHov = hoveredAxon === axonKey;
                    const color = getNodeColor(n.id, clusterId);
                    const parentN = n.parentId ? worlds[clusterId].neurons[n.parentId] : null;
                    const nx = clusterPos?.[n.id]?.x ?? n.x;
                    const ny = clusterPos?.[n.id]?.y ?? n.y;
                    const px = clusterPos?.[parentN?.id ?? '']?.x ?? parentN?.x ?? 0;
                    const py = clusterPos?.[parentN?.id ?? '']?.y ?? parentN?.y ?? 0;
                    const dx = nx - px, dy = ny - py;
                    const len = Math.hypot(dx, dy) || 1;
                    const ext = viewMode === 'cluster' ? 500 : 380;
                    const r = viewMode === 'cluster' ? (n.size / 2) * 0.85 : 0;
                    const sx = nx + (dx / len) * r, sy = ny + (dy / len) * r;
                    const ex = nx + (dx / len) * (r + ext), ey = ny + (dy / len) * (r + ext);
                    const fadeId = `fg-${clusterId}-${n.id}`;
                    const sw = viewMode === 'cluster' ? 28 : 6.75;
                    const op0 = isHov ? 1 : 0.45;
                    const hitW = Math.max(sw, 28);
                    return (
                      <g key={`portal-fwd-${n.id}`} style={{ pointerEvents: 'all', cursor: 'pointer' }}
                        onMouseEnter={() => setHoveredAxon(axonKey)}
                        onMouseLeave={() => setHoveredAxon(null)}
                        onClick={() => { if (worlds[n.id]) dispatch({ type: 'NAVIGATE_CLUSTER', cluster: n.id }); }}>
                        <defs>
                          <linearGradient id={fadeId} x1={sx} y1={sy} x2={ex} y2={ey} gradientUnits="userSpaceOnUse">
                            <stop offset="0%" stopColor={`rgba(255,255,255,${op0})`} />
                            <stop offset="100%" stopColor={`rgba(255,255,255,0)`} />
                          </linearGradient>
                        </defs>
                        <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="transparent" strokeWidth={hitW} />
                        <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={`url(#${fadeId})`} strokeWidth={isHov ? sw * 1.8 : sw} style={{ transition: 'stroke-width 0.2s ease' }} />
                      </g>
                    );
                  })}
                  {(() => {
                    const hasParent = clusterMeta[clusterId]?.parentClusterId != null;
                    if (!hasParent) return null;
                    const coreN = Object.values(worlds[clusterId].neurons).find(n => n.isCore);
                    if (!coreN) return null;
                    const cx = clusterPos?.[coreN.id]?.x ?? coreN.x;
                    const cy = clusterPos?.[coreN.id]?.y ?? coreN.y;
                    const rt = clusterMeta[clusterId]?.returnTarget;
                    const parentClusterId2 = clusterMeta[clusterId]?.parentClusterId;
                    const portalNode = rt ? worlds[parentClusterId2!]?.neurons?.[rt.nodeId] : null;
                    const portalParent = portalNode?.parentId ? worlds[parentClusterId2!]?.neurons?.[portalNode.parentId] : null;
                    let rdx = 0, rdy = 0;
                    if (portalNode && portalParent) {
                      const spreadPos2 = spreadClusterY(worlds[parentClusterId2!].neurons);
                      const pnPos = spreadPos2[portalNode.id] ?? portalNode;
                      const ppPos = spreadPos2[portalParent.id] ?? portalParent;
                      rdx = ppPos.x - pnPos.x; rdy = ppPos.y - pnPos.y;
                    } else {
                      const others = Object.values(worlds[clusterId].neurons).filter(n => !n.isCore);
                      const avgX = others.reduce((s, n) => s + n.x, 0) / (others.length || 1);
                      const avgY = others.reduce((s, n) => s + n.y, 0) / (others.length || 1);
                      rdx = cx - avgX; rdy = cy - avgY;
                    }
                    const rlen = Math.hypot(rdx, rdy) || 1;
                    const rext = viewMode === 'cluster' ? 1000 : 840;
                    const rr = viewMode === 'cluster' ? (coreN.size / 2) * 0.85 : 0;
                    const scx = cx + (rdx / rlen) * rr, scy = cy + (rdy / rlen) * rr;
                    const rex = cx + (rdx / rlen) * (rr + rext), rey = cy + (rdy / rlen) * (rr + rext);
                    const color = getNodeColor(coreN.id, clusterId);
                    const sw = viewMode === 'cluster' ? 28 : 6.75;
                    const isHov = hoveredAxon === 'back';
                    const op0 = isHov ? 1 : 0.54;
                    const hitW = Math.max(sw, 28);
                    return (
                      <g key="portal-back" style={{ pointerEvents: 'all', cursor: 'pointer' }}
                        onMouseEnter={() => setHoveredAxon('back')}
                        onMouseLeave={() => setHoveredAxon(null)}
                        onClick={() => { if (parentClusterId2) dispatch({ type: 'NAVIGATE_CLUSTER', cluster: parentClusterId2 }); }}>
                        <defs>
                          <linearGradient id={`bg-return-${clusterId}`} x1={scx} y1={scy} x2={rex} y2={rey} gradientUnits="userSpaceOnUse">
                            <stop offset="0%" stopColor={`rgba(255,255,255,${op0})`} />
                            <stop offset="100%" stopColor={`rgba(255,255,255,0)`} />
                          </linearGradient>
                        </defs>
                        <line x1={scx} y1={scy} x2={rex} y2={rey} stroke="transparent" strokeWidth={hitW} />
                        <line x1={scx} y1={scy} x2={rex} y2={rey} stroke={`url(#bg-return-${clusterId})`} strokeWidth={isHov ? sw * 1.8 : sw} style={{ transition: 'stroke-width 0.2s ease' }} />
                      </g>
                    );
                  })()}
                </svg>
              </div>
            );
          })}
        </div>
      </div>

      <nav className="fixed z-[2000] flex flex-col items-end pointer-events-none" style={{ gap: 0, right: 22, top: 'max(24px, env(safe-area-inset-top))', transform: 'scale(1.1)', transformOrigin: 'top right' }}>
        {(viewMode === 'cluster' ? clusterCrumbs : lineage).map((crumb, i, arr) => (
          <div key={`${crumb}-${i}`} className={`uppercase transition-all duration-500 text-right ${i === arr.length - 1 ? 'text-[9px] font-black opacity-100' : 'text-[7px] opacity-40 font-bold'}`}
            style={{ letterSpacing: '0.35em', lineHeight: '14px' }}>
            {crumb}
          </div>
        ))}
      </nav>

      <header className="fixed top-6 left-5 z-[2000]">
        <NeuraLogo onClick={() => {
          if (DISABLE_CLUSTER_VIEW) {
            dispatch({ type: 'NAVIGATE_GALAXY' });
          } else if (viewMode === 'neuron') {
            const coreId = getCoreId(currentCluster);
            if (activeId !== coreId) dispatch({ type: 'NAVIGATE_TO', cluster: currentCluster, nodeId: coreId });
          } else {
            dispatch({ type: 'NAVIGATE_GALAXY' });
          }
        }} />
      </header>

      {showOverlay && (() => {
        const overlayNode = worlds[currentCluster]?.neurons?.[showOverlay];
        if (!overlayNode) return null;
        const nodeColor = getNodeColor(overlayNode.id, currentCluster);
        return (
          <InsightOverlay
            key={showOverlay}
            node={overlayNode}
            clusterId={currentCluster}
            nodeColor={nodeColor}
            visible={overlayVisible}
            onClose={closeOverlay}
            onSave={(label, content) => handleSaveInsight(showOverlay, label, content)}
          />
        );
      })()}

      {introScreen}

      <JiggleLayer
        currentCluster={currentCluster}
        activeId={activeId}
        viewMode={viewMode}
        jiggleMode={jiggleMode}
        neuronZoom={neuronZoom}
        panOffset={panOffset}
        onExitJiggle={() => { setJiggleMode(false); setJiggleDrag(null); setJigglePan(null); }}
        onWorldChanged={() => setWorldVersion(v => v + 1)}
        worldVersion={worldVersion}
        onDragChange={(drag) => {
          const prevDrag = jiggleDragRef.current;
          jiggleDragRef.current = drag;
          setJiggleDrag(drag);
          const layer = neuronLayerRef.current;
          if (!layer) return;
          if (!drag) {
            layer.querySelectorAll<HTMLElement>('[data-nodeid]').forEach(el => {
              el.style.transform = '';
            });
            // Freeze viewport so the camera doesn't re-center after the drop.
            // The camera position before drop: (viewCenterX, viewCenterY) minus any jigglePan offset.
            if (!panOffsetRef.current && prevDrag) {
              const ai = activeIdRef.current;
              const cc = currentClusterRef.current;
              // If the active node was dragged, use its pre-drag position; otherwise read current (unmoved) position.
              const wasActiveDragged = prevDrag.nodeId === ai;
              const viewCenterX = wasActiveDragged ? prevDrag.startNodeX : (worlds[cc]?.neurons?.[ai]?.x ?? 0);
              const viewCenterY = wasActiveDragged ? prevDrag.startNodeY : (worlds[cc]?.neurons?.[ai]?.y ?? 0);
              // Account for any pan accumulated during the drag gesture.
              const jp = jigglePanRef.current;
              const zoom = neuronZoomRef.current;
              const lockedX = viewCenterX - (jp?.x ?? 0) / zoom;
              const lockedY = viewCenterY - (jp?.y ?? 0) / zoom;
              panOffsetRef.current = { x: lockedX, y: lockedY };
              setPanOffset({ x: lockedX, y: lockedY });
            }
          } else {
            const sc = viewMode === 'cluster' ? 0.146 : neuronZoomRef.current;
            const dx = drag.screenDx / sc;
            const dy = drag.screenDy / sc;
            for (const nid of drag.descendants) {
              const el = layer.querySelector<HTMLElement>(`[data-nodeid="${nid}"]`);
              if (el) el.style.transform = `translate(${dx}px,${dy}px)`;
            }
          }
        }}
        onPanChange={setJigglePan}
        onRequestAddNode={(parentId) => setAddNodeParentId(parentId)}
        onInsight={(nodeId) => dispatch({ type: 'SET_OVERLAY', payload: nodeId })}
        dispatch={dispatch}
      />

      {addNodeParentId && (
        <AddNodeModal
          onConfirm={(label, insight) => {
            const pid = addNodeParentId;
            setAddNodeParentId(null);
            handleAddNode(pid, label, insight);
          }}
          onCancel={() => setAddNodeParentId(null)}
        />
      )}

      <AuthBanner user={user} />

      <BottomBar onSubmit={handleAddNeuron} accentRgb={accentRgb} />

      {undoVisible && (
        <div
          style={{
            position: 'fixed',
            bottom: 90,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 600,
            pointerEvents: 'all',
            animation: 'undoFadeIn 0.25s ease',
          }}
        >
          <button
            onClick={handleUndo}
            style={{
              padding: '9px 22px',
              borderRadius: 20,
              border: '1px solid rgba(255,255,255,0.25)',
              background: 'rgba(10,10,15,0.75)',
              color: 'rgba(255,255,255,0.85)',
              fontSize: 11,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              backdropFilter: 'blur(16px)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 14, opacity: 0.7 }}>↩</span>
            Ongedaan maken
          </button>
        </div>
      )}

      <div className="fixed inset-0 z-[500] pointer-events-none bg-black" style={{
        opacity: portalPhase === 'crossing' ? 0.85 : 0,
        transition: portalPhase === 'crossing' ? 'opacity 0.15s ease-in' : 'opacity 0.5s ease-out',
      }} />

      <style>{`
        @keyframes blobMorph {
          0%,100% { border-radius: 42% 58% 70% 30% / 45% 45% 55% 55%; }
          33%      { border-radius: 60% 40% 65% 35% / 35% 65% 35% 65%; }
          66%      { border-radius: 45% 55% 35% 65% / 65% 35% 65% 35%; }
        }
        @keyframes vignetPulse { 0%,100%{opacity:0.6} 50%{opacity:1} }
        @keyframes pulseBreath { 0%,100%{transform:scale(1);filter:brightness(1)} 50%{transform:scale(1.02);filter:brightness(1.1)} }
        @keyframes clusterNodeEnter {
          0%  { opacity:0; transform:scale(0.3) translateY(12px); }
          60% { opacity:1; transform:scale(1.08) translateY(-3px); }
          100%{ opacity:1; transform:scale(1) translateY(0); }
        }
        @keyframes jiggleWobble {
          0%   { transform: rotate(-2.5deg) scale(1.02); }
          100% { transform: rotate(2.5deg)  scale(0.98); }
        }
        @keyframes dropTargetPulse {
          0%   { opacity: 0.5; transform: scale(1); }
          100% { opacity: 1;   transform: scale(1.06); }
        }
        @keyframes modalEnter {
          0%   { opacity: 0; transform: scale(0.82) translateY(12px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes newNodeEnter {
          0%   { opacity: 0; transform: scale(0.3) translateY(16px); }
          65%  { opacity: 1; transform: scale(1.1) translateY(-4px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes undoFadeIn {
          0%   { opacity: 0; transform: translateX(-50%) translateY(8px); }
          100% { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
    </>
  );
}
