/**
 * API contract / schema tests.
 *
 * Verifies that the data produced by the classification pipeline matches the
 * documented JSON shape for /api/graph and /api/buckets without starting a
 * server. Tests run purely against the library layer; no HTTP requests made.
 */
import { describe, it, expect } from "vitest";
import { classifyFiles } from "@/lib/kg/classify/classifier";
import { buildStructuralEdges } from "@/lib/kg/graph/edges";
import { reviewGraph } from "@/lib/kg/graph/review";
import { BUCKETS, EDGE_TYPES } from "@/lib/kg/graph/model";
import type { ArtifactGraph, ArtifactNode, ArtifactEdge } from "@/lib/kg/graph/model";
import { nextjsAppFixture } from "@/fixtures/nextjs-app";

// Build a minimal graph from the Next.js fixture — same logic as the pipeline
// (stages 3 + 4c + 5; no tree-sitter, no LLM enrichment)
function buildFixtureGraph(): ArtifactGraph {
  const { nodes } = classifyFiles(nextjsAppFixture);
  const edges = buildStructuralEdges(nodes, {});
  const raw: ArtifactGraph = {
    repoId: "test-nextjs-app",
    repoUrl: "https://github.com/test/nextjs-app",
    createdAt: new Date().toISOString(),
    nodes,
    edges,
  };
  return reviewGraph(raw).graph;
}

const graph = buildFixtureGraph();

// ── /api/graph shape ──────────────────────────────────────────────────────────

describe("/api/graph response shape", () => {
  it("has required top-level fields", () => {
    expect(typeof graph.repoId).toBe("string");
    expect(typeof graph.repoUrl).toBe("string");
    expect(typeof graph.createdAt).toBe("string");
    expect(Array.isArray(graph.nodes)).toBe(true);
    expect(Array.isArray(graph.edges)).toBe(true);
  });

  it("createdAt is a valid ISO timestamp", () => {
    const date = new Date(graph.createdAt);
    expect(date.getTime()).not.toBeNaN();
  });

  it("each node has required fields with correct types", () => {
    for (const node of graph.nodes) {
      expect(typeof node.id).toBe("string");
      expect(["file", "symbol", "external_spec", "readme_section"]).toContain(node.type);
      expect(typeof node.path).toBe("string");
      expect(Array.isArray(node.buckets)).toBe(true);
    }
  });

  it("each node bucket score has bucket, confidence, signals", () => {
    for (const node of graph.nodes) {
      for (const score of node.buckets) {
        expect(BUCKETS).toContain(score.bucket);
        expect(typeof score.confidence).toBe("number");
        expect(score.confidence).toBeGreaterThan(0);
        expect(score.confidence).toBeLessThanOrEqual(1);
        expect(Array.isArray(score.signals)).toBe(true);
        expect(score.signals.length).toBeGreaterThan(0);
      }
    }
  });

  it("node ids are unique", () => {
    const ids = graph.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each edge has required fields", () => {
    for (const edge of graph.edges) {
      expect(typeof edge.id).toBe("string");
      expect(typeof edge.from).toBe("string");
      expect(typeof edge.to).toBe("string");
      expect(EDGE_TYPES).toContain(edge.type);
      expect(typeof edge.confidence).toBe("number");
      expect(Array.isArray(edge.signals)).toBe(true);
    }
  });

  it("edge ids are unique", () => {
    const ids = graph.edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("no dangling edges (reviewer guarantees this)", () => {
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    for (const edge of graph.edges) {
      expect(nodeIds.has(edge.from), `dangling from: ${edge.from}`).toBe(true);
      expect(nodeIds.has(edge.to), `dangling to: ${edge.to}`).toBe(true);
    }
  });
});

// ── /api/buckets shape ────────────────────────────────────────────────────────

function buildBucketsResponse(g: ArtifactGraph) {
  const bucketMap = Object.fromEntries(
    BUCKETS.map((b) => [b, [] as ArtifactNode[]])
  ) as Record<string, ArtifactNode[]>;

  for (const node of g.nodes) {
    const top = node.buckets[0];
    if (top) bucketMap[top.bucket].push(node);
  }

  return {
    repoId: g.repoId,
    repoUrl: g.repoUrl,
    createdAt: g.createdAt,
    buckets: Object.fromEntries(
      BUCKETS.map((b) => [
        b,
        {
          count: bucketMap[b].length,
          nodes: bucketMap[b].map((n) => ({
            id: n.id,
            path: n.path,
            language: n.language,
            topBucket: n.buckets[0],
            allBuckets: n.buckets,
            summary: n.summary,
          })),
        },
      ])
    ),
  };
}

const bucketsResponse = buildBucketsResponse(graph);

describe("/api/buckets response shape", () => {
  it("has repoId, repoUrl, createdAt, buckets", () => {
    expect(typeof bucketsResponse.repoId).toBe("string");
    expect(typeof bucketsResponse.repoUrl).toBe("string");
    expect(typeof bucketsResponse.createdAt).toBe("string");
    expect(typeof bucketsResponse.buckets).toBe("object");
  });

  it("has an entry for every defined bucket", () => {
    for (const bucket of BUCKETS) {
      expect(bucket in bucketsResponse.buckets).toBe(true);
    }
  });

  it("each bucket entry has count and nodes array", () => {
    for (const bucket of BUCKETS) {
      const entry = bucketsResponse.buckets[bucket];
      expect(typeof entry.count).toBe("number");
      expect(Array.isArray(entry.nodes)).toBe(true);
      expect(entry.count).toBe(entry.nodes.length);
    }
  });

  it("each bucket node has id, path, topBucket, allBuckets", () => {
    for (const bucket of BUCKETS) {
      for (const node of bucketsResponse.buckets[bucket].nodes) {
        expect(typeof node.id).toBe("string");
        expect(typeof node.path).toBe("string");
        expect(node.topBucket).toBeDefined();
        expect(BUCKETS).toContain(node.topBucket?.bucket);
        expect(Array.isArray(node.allBuckets)).toBe(true);
      }
    }
  });

  it("total node count matches graph node count (excl. external_spec placeholders)", () => {
    const totalInBuckets = BUCKETS.reduce(
      (sum, b) => sum + bucketsResponse.buckets[b].count,
      0
    );
    // Only file-type nodes get a top bucket; external_spec nodes may or may not
    const nonExternalNodes = graph.nodes.filter((n) => n.buckets.length > 0);
    expect(totalInBuckets).toBe(nonExternalNodes.length);
  });
});

// ── /api/node/[id] shape ──────────────────────────────────────────────────────

describe("/api/node/[id] response shape", () => {
  it("returns node + incident edges for a known node", () => {
    const testNode = graph.nodes.find((n) => n.type === "file")!;
    expect(testNode).toBeDefined();

    const incidentEdges = graph.edges.filter(
      (e) => e.from === testNode.id || e.to === testNode.id
    );

    // Shape check — mirrors what the API route returns
    const response = { node: testNode, edges: incidentEdges };
    expect(response.node.id).toBe(testNode.id);
    expect(Array.isArray(response.edges)).toBe(true);
    for (const edge of response.edges) {
      expect(edge.from === testNode.id || edge.to === testNode.id).toBe(true);
    }
  });
});
