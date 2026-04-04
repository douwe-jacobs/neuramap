export interface NeuronAttachment {
  type: 'image' | 'pdf';
  url: string;
  name?: string;
}

export interface NeuronContent {
  body?: string;
  image?: string;
  attachments?: NeuronAttachment[];
}

export interface Neuron {
  id: string;
  label: string;
  size: number;
  x: number;
  y: number;
  isCore?: boolean;
  hasCluster?: boolean;
  children?: string[];
  parentId?: string | null;
  content?: NeuronContent;
  emoji?: string;
  color?: { h: number; s: number; l: number };
}

export interface World {
  label: string;
  color?: { h: number; s: number; l: number };
  neurons: Record<string, Neuron>;
}

export interface ClusterMeta {
  parentClusterId: string | null;
  siblings: string[];
  returnTarget: { cluster: string; nodeId: string } | null;
  ancestorCrumbs: string[];
}

export interface MapDef {
  id: string;
  label: string;
  rootCluster: string;
  clusterIds?: string[];
}

export interface AppState {
  viewMode: 'galaxy' | 'neuron' | 'cluster';
  currentCluster: string;
  activeId: string;
  isRecording: boolean;
  isTransitioning: boolean;
  clusterEnterKey: number;
  showOverlay: string | null;
  selectedTarget: string | null;
  portalPhase: string | null;
  frozenOffset: { x: number; y: number } | null;
  frozenSwellScale: number | null;
  justLanded: boolean;
  viewTransPhase: 'idle' | 'galaxy-exit' | 'neuron-enter' | 'neuron-exit' | 'galaxy-enter';
  pendingNavCluster: string | null;
  pendingNavNodeId: string | null;
}

export type AppAction =
  | { type: 'SET_VIEW_MODE'; payload: string }
  | { type: 'CLUSTER_SELECT'; cluster: string; nodeId: string }
  | { type: 'NAVIGATE_TO'; cluster: string; nodeId: string }
  | { type: 'NAVIGATE_PORTAL'; cluster: string; nodeId: string; newX: number; newY: number }
  | { type: 'PORTAL_DONE' }
  | { type: 'CLEAR_LANDED' }
  | { type: 'NAVIGATE_CLUSTER'; cluster: string }
  | { type: 'NAVIGATE_GALAXY' }
  | { type: 'SET_SELECTED_TARGET'; payload: string | null }
  | { type: 'TOGGLE_RECORDING' }
  | { type: 'SET_OVERLAY'; payload: string | null }
  | { type: 'SET_PORTAL_PHASE'; payload: string | null }
  | { type: 'FREEZE_OFFSET'; payload: { x: number; y: number }; swellScale: number; phase: string }
  | { type: 'SET_VIEW_TRANS_PHASE'; payload: AppState['viewTransPhase'] }
  | { type: 'COMMIT_PENDING_NAV' }
  | { type: 'COMMIT_PENDING_GALAXY' };
