import type { ArtifactNode, ArchLayer } from "../graph/model";

export interface NodeForEnrichment {
  id: string;
  path: string;
  language?: string;
  topBucket?: string;
  existingSignals: string[];
  contentSnippet?: string;
}

export interface EnrichmentResult {
  nodeId: string;
  summary: string;
  layer?: ArchLayer;
}

export type EnrichProgress = (done: number, total: number) => void;

export interface Enricher {
  enrich(nodes: NodeForEnrichment[], onProgress?: EnrichProgress): Promise<EnrichmentResult[]>;
}

/** Additively merge enrichment results into nodes. Never overwrites an existing layer. */
export function applyEnrichmentResults(
  nodes: ArtifactNode[],
  results: EnrichmentResult[]
): void {
  const byId = new Map(results.map((r) => [r.nodeId, r]));
  for (const node of nodes) {
    const result = byId.get(node.id);
    if (!result) continue;
    node.summary = result.summary;
    node.enriched = true;
    if (result.layer && !node.layer) {
      node.layer = result.layer;
    }
  }
}
