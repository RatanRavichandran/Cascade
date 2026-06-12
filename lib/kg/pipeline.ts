import { ingestRepo } from "./ingest/github";
import { scanFiles } from "./ingest/scan";
import { classifyFiles, type ExternalRefResult } from "./classify/classifier";
import { parseFile } from "./parse/treesitter";
import { buildStructuralEdges, inferLayer, type ParsedFileMap } from "./graph/edges";
import { reviewGraph } from "./graph/review";
import { store } from "./graph/store";
import { getEnricher } from "./enrich/openai";
import { applyEnrichmentResults } from "./enrich/enricher";
import type { ArtifactGraph, ArtifactEdge } from "./graph/model";
import type { NodeForEnrichment } from "./enrich/enricher";

export function repoIdFromUrl(url: string): string {
  const match = url.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (!match) throw new Error(`Cannot derive repoId from URL: ${url}`);
  return `${match[1]}-${match[2]}`.toLowerCase();
}

function buildExternalRefEdges(refs: ExternalRefResult[]): ArtifactEdge[] {
  return refs.map((r) => ({
    id: `${r.sourceNodeId}->external:${r.ref}`,
    from: r.sourceNodeId,
    to: `external:${r.ref}`,
    type: "references_external_spec" as const,
    confidence: 0.9,
    signals: [`external_ref:${r.type}`],
  }));
}

// Parse files in parallel batches using tree-sitter (best-effort; failures are skipped)
async function parseFiles(
  files: Array<{ path: string; content: string; language?: string }>,
  batchSize = 8
): Promise<ParsedFileMap> {
  const results: ParsedFileMap = {};
  const parseable = files.filter((f) => f.language);

  for (let i = 0; i < parseable.length; i += batchSize) {
    const batch = parseable.slice(i, i + batchSize);
    const settled = await Promise.allSettled(
      batch.map(async (f) => {
        const result = await parseFile(f.content, f.language!);
        return { id: f.path, result };
      })
    );
    for (const outcome of settled) {
      if (outcome.status === "fulfilled" && outcome.value.result) {
        results[outcome.value.id] = outcome.value.result;
      }
    }
  }

  return results;
}

export async function runPipeline(repoUrl: string): Promise<ArtifactGraph> {
  const repoId = repoIdFromUrl(repoUrl);

  // Stage 1: ingest via GitHub API
  console.log(`[cascade] stage 1: ingesting ${repoUrl}`);
  const { files } = await ingestRepo(repoUrl);

  // Stage 2: scan (language + metadata)
  console.log(`[cascade] stage 2: scanning ${files.length} files`);
  const scanned = scanFiles(files);

  // Stage 3: classify → nodes + external ref placeholders
  console.log(`[cascade] stage 3: classifying`);
  const { nodes, externalRefs } = classifyFiles(scanned);
  console.log(`[cascade] stage 3: ${nodes.length} nodes, ${externalRefs.length} external refs`);

  // Stage 4a: tree-sitter parse (best-effort; degrades gracefully if language unsupported)
  console.log(`[cascade] stage 4a: tree-sitter parse`);
  const parseResults = await parseFiles(scanned);
  console.log(`[cascade] stage 4a: parsed ${Object.keys(parseResults).length} files`);

  // Stage 4b: assign architectural layers
  console.log(`[cascade] stage 4b: inferring layers`);
  for (const node of nodes) {
    node.layer = inferLayer(node, parseResults[node.id]);
  }

  // Stage 4c: build structural edges
  console.log(`[cascade] stage 4c: building edges`);
  const structuralEdges = buildStructuralEdges(nodes, parseResults);
  const externalRefEdges = buildExternalRefEdges(externalRefs);
  const allEdges = [...structuralEdges, ...externalRefEdges];
  console.log(`[cascade] stage 4c: ${allEdges.length} edges`);

  const rawGraph: ArtifactGraph = {
    repoId,
    repoUrl,
    createdAt: new Date().toISOString(),
    nodes,
    edges: allEdges,
  };

  // Stage 5: graph reviewer — drop dangling edges, dedupe
  console.log(`[cascade] stage 5: reviewing graph`);
  const { graph } = reviewGraph(rawGraph);
  console.log(`[cascade] stage 5: ${graph.nodes.length} nodes, ${graph.edges.length} edges after review`);

  // Stage 5.5: LLM enrichment (additive; skipped if OPENAI_API_KEY absent or call fails)
  const enricher = getEnricher();
  if (enricher) {
    const contentMap = new Map(scanned.map((s) => [s.path, s.content]));
    const nodesForEnrichment: NodeForEnrichment[] = graph.nodes
      .filter((n) => n.type === "file")
      .map((n) => ({
        id: n.id,
        path: n.path,
        language: n.language,
        topBucket: n.buckets[0]?.bucket,
        existingSignals: n.buckets.flatMap((b) => b.signals),
        contentSnippet: contentMap.get(n.id)?.slice(0, 600),
      }));

    try {
      console.log(`[cascade] stage 5.5: LLM enrichment (${nodesForEnrichment.length} nodes)`);
      const enrichments = await enricher.enrich(nodesForEnrichment);
      applyEnrichmentResults(graph.nodes, enrichments);
      console.log(`[cascade] stage 5.5: enriched ${enrichments.length} nodes`);
    } catch {
      // enrichment failure must never break the pipeline
    }
  } else {
    console.log(`[cascade] stage 5.5: skipped (no OPENAI_API_KEY)`);
  }

  // Stage 6: persist
  console.log(`[cascade] stage 6: persisting graph`);
  await store.save(repoId, graph);
  console.log(`[cascade] done: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);

  return graph;
}
