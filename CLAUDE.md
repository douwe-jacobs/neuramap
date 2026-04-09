# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Vite dev server with HMR
npm run build        # Production build → /dist
npm run lint         # ESLint on all files
npm run typecheck    # TypeScript check (no emit)
npm run preview      # Preview production build locally
```

There are no tests in this project.

## Architecture

Neuramap is a spatial knowledge-mapping tool where ideas are "neurons" arranged in 2D space as interconnected graphs. The core metaphor: knowledge is spatial, not hierarchical lists.

### State Management

`App.tsx` owns all state via React's `useReducer`. There is no Redux or Zustand. The `AppState` (defined in `src/types.ts`) tracks:
- `viewMode: 'galaxy' | 'neuron' | 'cluster'` — current UI view
- `viewTransPhase` — drives CSS transition animations between views
- `currentCluster` — which cluster of neurons is active
- `activeId` — selected neuron ID

All user interactions dispatch `AppAction` events to the reducer, which produces a new `AppState`. Side effects (storage saves, layout reflows) run in `useEffect`.

### Core Data Model (`src/types.ts`)

- **`Neuron`** — a node in the graph with `id`, `label` (max 3 words, ALL CAPS), 2D `x/y` coords, optional `children[]`, `parentId`, `hasCluster` (can navigate into), and `content` (rich body text/images)
- **`World`** — a named cluster: `{ label, neurons: Record<string, Neuron> }`
- **`MapDef`** — top-level project: `{ id, label, rootCluster, clusterIds[] }`

Data is persisted to Supabase (`neura_storage` table, key-value with JSON values). Credentials are in `.env`.

### Layout Engine (`src/utils.ts`)

`reflowNeurons()` is the spatial layout algorithm. It places the core node at (0,0) and arranges children in circular patterns using the golden angle (2.39996 rad). Key behaviors:
- Node size decreases by `CHILD_SIZE_FACTOR = 0.74` per depth level
- `CORE_SIZE = 300`, `MIN_NODE_DIST = 280` px minimum spacing
- Repulsion physics to avoid overlap
- Segment intersection checking to avoid edge crossings

This function is called after every mutation to the neuron graph.

### View Modes

- **Galaxy** — map selection carousel, multiple `MapDef`s displayed as a grid
- **Neuron** — zoomed into a cluster, shows the neuron graph for that cluster
- **Cluster** — currently disabled via `DISABLE_CLUSTER_VIEW = true` feature flag

Navigation between clusters uses portal nodes (`hasCluster: true`). Transitions are phase-driven: `viewTransPhase` cycles through `'galaxy-exit' → 'neuron-enter' → 'idle'` etc., with CSS animations responding to each phase.

### Key Files

| File | Role |
|------|------|
| `src/App.tsx` | Root component — reducer, event handlers, view routing (~83KB) |
| `src/types.ts` | All TypeScript types: Neuron, World, MapDef, AppState, AppAction |
| `src/utils.ts` | `reflowNeurons()` layout engine, geometry helpers |
| `src/colors.ts` / `src/palette.ts` | HSL color system; neurons inherit parent colors |
| `src/undoHistory.ts` | Max-20 snapshot undo stack |
| `src/NeuronNode.tsx` | Renders individual neuron circles in SVG |
| `src/JiggleLayer.tsx` | Drag-and-drop repositioning of nodes (~35KB) |
| `src/InsightOverlay.tsx` | Node detail/editing modal (~43KB) |
| `supabase/` | Postgres migrations + edge functions |

### Supabase Integration

The app uses Supabase with anonymous auth only (no user accounts — prototype). RLS allows anon read/write. The `neura_storage` table is a simple key-value store: `{ key: string, value: jsonb, updated_at: timestamptz }`.

### Color System

Colors are HSL-based. Each map has a root palette color; child neurons inherit or override via `color?: HSL`. The `_worldColorCache` in `src/colors.ts` caches computed colors for performance.
