import type { World, ClusterMeta, MapDef } from './types';

export const APP_VERSION = '0.9.6';

export const SEED_MAPS: MapDef[] = [
  { id: 'work',     label: 'WORK',     rootCluster: 'root',    clusterIds: ['root'] },
  { id: 'neuramap', label: 'NEURAMAP', rootCluster: 'nm_root', clusterIds: ['nm_root'] },
];

export const SEED_WORLDS: Record<string, World> = {
  root: {
    label: 'WORK',
    neurons: {
      core:            { id: 'core',            label: 'WORK',                 size: 300, x: 0,      y: 0,     isCore: true, children: ['headfirst','humble','ilumi','nieuweconcepten'], parentId: null },
      headfirst:       { id: 'headfirst',       label: 'Headfirst',            size: 222, x: -700,   y: -500,  children: ['hf_pos','hf_prod','hf_mfg','hf_crowd','hf_cert','hf_inv'], parentId: 'core' },
      hf_pos:          { id: 'hf_pos',          label: 'Positionering',        size: 164, x: -1050,  y: -700,  parentId: 'headfirst' },
      hf_prod:         { id: 'hf_prod',         label: 'Product\nOntwikkeling',size: 164, x: -550,   y: -800,  children: ['safefit'], parentId: 'headfirst' },
      hf_mfg:          { id: 'hf_mfg',          label: 'Manufacturing',        size: 164, x: -1080,  y: -380,  parentId: 'headfirst' },
      hf_crowd:        { id: 'hf_crowd',        label: 'Crowdfunding',         size: 164, x: -380,   y: -960,  parentId: 'headfirst' },
      hf_cert:         { id: 'hf_cert',         label: 'Certificering',        size: 164, x: -880,   y: -900,  parentId: 'headfirst' },
      hf_inv:          { id: 'hf_inv',          label: 'Investor & Equity',    size: 164, x: -1200,  y: -580,  parentId: 'headfirst' },
      safefit:         { id: 'safefit',          label: 'SafeFit\u2122',       size: 121, x: -450,   y: -1120, parentId: 'hf_prod' },
      humble:          { id: 'humble',           label: 'Humble',              size: 222, x: 200,    y: -700,  children: ['hb_concept','hb_market','hb_brand'], parentId: 'core' },
      hb_concept:      { id: 'hb_concept',       label: 'Concept',             size: 164, x: 80,     y: -980,  parentId: 'humble' },
      hb_market:       { id: 'hb_market',        label: 'Marktonderzoek',      size: 164, x: 300,    y: -1100, parentId: 'humble' },
      hb_brand:        { id: 'hb_brand',         label: 'Brand Design',        size: 164, x: 500,    y: -900,  parentId: 'humble' },
      ilumi:           { id: 'ilumi',            label: 'ILUMI',               size: 222, x: 650,    y: -300,  children: ['il_product','il_sales','il_ops'], parentId: 'core' },
      il_product:      { id: 'il_product',       label: 'Product',             size: 164, x: 880,    y: -520,  parentId: 'ilumi' },
      il_sales:        { id: 'il_sales',         label: 'Sales',               size: 164, x: 1050,   y: -250,  parentId: 'ilumi' },
      il_ops:          { id: 'il_ops',           label: 'Operations',          size: 164, x: 900,    y: 50,    parentId: 'ilumi' },
      nieuweconcepten: { id: 'nieuweconcepten',  label: 'Nieuwe Concepten',    size: 222, x: -300,   y: 650,   children: ['nc_idea','nc_research'], parentId: 'core' },
      nc_idea:         { id: 'nc_idea',          label: 'Ideation',            size: 164, x: -550,   y: 880,   parentId: 'nieuweconcepten' },
      nc_research:     { id: 'nc_research',      label: 'Research',            size: 164, x: -150,   y: 1000,  parentId: 'nieuweconcepten' },
    },
  },

  nm_root: {
    label: 'NEURAMAP',
    neurons: {
      nm_core:     { id: 'nm_core',     label: 'NEURAMAP',         size: 300, x: 0,    y: 0,    isCore: true, children: ['nm_vision','nm_product','nm_business'], parentId: null },
      nm_vision:   { id: 'nm_vision',   label: 'Vision',           size: 222, x: 300,  y: -500, children: ['nv_why','nv_how'], parentId: 'nm_core' },
      nv_why:      { id: 'nv_why',      label: 'Why',              size: 164, x: 620,  y: -680, parentId: 'nm_vision', content: { body: 'Knowledge is spatial. The brain does not store information in lists — it maps it. NeuraMap brings this natural structure to digital thinking.' } },
      nv_how:      { id: 'nv_how',      label: 'How',              size: 164, x: 820,  y: -400, parentId: 'nm_vision', content: { body: 'By turning every idea into a living neuron, and every connection into an axon, NeuraMap lets you navigate thought like you navigate space.' } },
      nm_product:  { id: 'nm_product',  label: 'Product',          size: 222, x: -350, y: -400, children: ['np_maps','np_clusters','np_neurons','np_insights'], parentId: 'nm_core' },
      np_maps:     { id: 'np_maps',     label: 'Maps',             size: 164, x: -280, y: -750, parentId: 'nm_product',  content: { body: 'Swipe horizontally through your different Maps (Projects/Contexts). Each Map is a separate spatial world.' } },
      np_clusters: { id: 'np_clusters', label: 'Clusters',         size: 164, x: -620, y: -580, parentId: 'nm_product',  content: { body: 'Navigate related subjects. Use Portal Nodes as fast-travel bridges between different clusters within your Map.' } },
      np_neurons:  { id: 'np_neurons',  label: 'Neurons',          size: 164, x: -680, y: -320, parentId: 'nm_product',  content: { body: 'Zoom in on the individual building block of your thought. Each Neuron holds a single, focused idea at a fixed spatial address.' } },
      np_insights: { id: 'np_insights', label: 'Insights',         size: 164, x: -430, y: -220, parentId: 'nm_product',  content: { body: 'The razor-sharp AI nucleus. No fluff, just the core facts. Hold any Neuron to reveal its distilled insight.' } },
      nm_business: { id: 'nm_business', label: 'Business',         size: 222, x: -500, y: 350,  children: ['nb_free','nb_pro'], parentId: 'nm_core' },
      nb_free:     { id: 'nb_free',     label: 'Core Free',        size: 164, x: -980, y: 200,  parentId: 'nm_business', content: { body: 'The Knowledge Viewer.\n\n· 1 Source\n· 3 Maps in your World View\n\nFree forever — enough to experience the full spatial advantage.' } },
      nb_pro:      { id: 'nb_pro',      label: 'Pro',              size: 164, x: -980, y: 520,  parentId: 'nm_business', content: { body: 'The Power User. Subscription.\n\n· Manual rearrangement of Neurons\n· Edit connections & override AI mapping\n· Collaboration: shared Mind Castle with your team\n· Unlimited Maps and Sources (Gemini, Claude, PDFs)' } },
    },
  },
};

export const SEED_CLUSTER_META: Record<string, ClusterMeta> = {
  root:    { parentClusterId: null, siblings: [], returnTarget: null, ancestorCrumbs: [] },
  nm_root: { parentClusterId: null, siblings: [], returnTarget: null, ancestorCrumbs: [] },
};

let clusterMeta: Record<string, ClusterMeta> = { ...SEED_CLUSTER_META };
let worlds: Record<string, World> = JSON.parse(JSON.stringify(SEED_WORLDS));

let CLUSTER_LISTS: Record<string, string[]> = {
  work:     ['root'],
  neuramap: ['nm_root'],
};

let GALAXY_MAPS: Array<{ id: string; label: string; rootCluster: string }> = [
  { id: 'work',     label: 'WORK',     rootCluster: 'root' },
  { id: 'neuramap', label: 'NEURAMAP', rootCluster: 'nm_root' },
];

export const _worldColorCache: Record<string, any> = {};

export { worlds, clusterMeta, GALAXY_MAPS, CLUSTER_LISTS }