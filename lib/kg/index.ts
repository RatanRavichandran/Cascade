// =============================================================================
// Cascade — Part 1: Knowledge Graph Builder
// =============================================================================
// This module turns a public GitHub repository into a parsable, queryable
// knowledge graph (typed nodes + structural edges). It is the foundation that
// downstream Cascade parts (e.g. change-impact / ripple analysis) build on.
//
// Public entry point. Import from "@/lib/kg" — do NOT reach into submodules
// from outside this folder; everything a consumer needs is re-exported here.
//
//   import { runPipeline, store, type ArtifactGraph } from "@/lib/kg";
//
// Pipeline stages (see ./pipeline.ts):
//   1. ingest   — fetch repo tree + blobs via the GitHub API   (./ingest)
//   2. scan     — language + file metadata                     (./ingest/scan)
//   3. classify — multi-signal artifact bucketing             (./classify)
//   4. parse    — tree-sitter structural extraction           (./parse)
//   5. graph    — structural edges, layers, integrity review  (./graph)
//   6. enrich   — optional, graceful LLM enrichment           (./enrich)
// =============================================================================

// --- Orchestration -----------------------------------------------------------
export { runPipeline, repoIdFromUrl } from "./pipeline";

// --- Graph model + persistence -----------------------------------------------
export { store } from "./graph/store";
export type { GraphStore } from "./graph/store";
export {
  BUCKETS,
  EDGE_TYPES,
} from "./graph/model";
export type {
  Bucket,
  EdgeType,
  ArchLayer,
  BucketScore,
  ArtifactNode,
  ArtifactEdge,
  ArtifactGraph,
} from "./graph/model";

// --- Graph construction primitives (for advanced/Part-2 consumers) -----------
export { buildStructuralEdges, inferLayer } from "./graph/edges";
export type { ParsedFileMap } from "./graph/edges";
export { reviewGraph } from "./graph/review";
export type { ReviewSummary } from "./graph/review";

// --- Ingestion + classification ----------------------------------------------
export { ingestRepo } from "./ingest/github";
export type { RepoFile, RepoMeta } from "./ingest/github";
export { scanFiles } from "./ingest/scan";
export type { ScannedFile } from "./ingest/scan";
export { classifyFiles } from "./classify/classifier";
export type { ClassifyResult, ExternalRefResult } from "./classify/classifier";

// --- Structural parsing ------------------------------------------------------
export { parseFile } from "./parse/treesitter";
export type { ParseResult } from "./parse/treesitter";
