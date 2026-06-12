import { describe, it, expect } from "vitest";
import { reviewGraph } from "@/lib/kg/graph/review";
import type { ArtifactGraph } from "@/lib/kg/graph/model";

const baseGraph: ArtifactGraph = {
  repoId: "test-repo",
  repoUrl: "https://github.com/test/repo",
  createdAt: "2026-01-01T00:00:00.000Z",
  nodes: [
    { id: "a.ts", type: "file", path: "a.ts", buckets: [] },
    { id: "b.ts", type: "file", path: "b.ts", buckets: [] },
  ],
  edges: [
    { id: "a->b:imports", from: "a.ts", to: "b.ts", type: "imports", confidence: 0.8, signals: [] },
  ],
};

describe("reviewGraph", () => {
  it("passes through a clean graph unchanged", () => {
    const { graph, summary } = reviewGraph(baseGraph);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
    expect(summary.danglingEdgesRemoved).toBe(0);
    expect(summary.duplicateNodesRemoved).toBe(0);
    expect(summary.duplicateEdgesRemoved).toBe(0);
  });

  it("removes edges with dangling 'from' reference", () => {
    const dirty: ArtifactGraph = {
      ...baseGraph,
      edges: [
        ...baseGraph.edges,
        { id: "ghost->b:imports", from: "ghost.ts", to: "b.ts", type: "imports", confidence: 0.8, signals: [] },
      ],
    };
    const { graph, summary } = reviewGraph(dirty);
    expect(graph.edges).toHaveLength(1);
    expect(summary.danglingEdgesRemoved).toBe(1);
  });

  it("removes edges with dangling 'to' reference", () => {
    const dirty: ArtifactGraph = {
      ...baseGraph,
      edges: [
        ...baseGraph.edges,
        { id: "a->ghost:imports", from: "a.ts", to: "ghost.ts", type: "imports", confidence: 0.8, signals: [] },
      ],
    };
    const { graph, summary } = reviewGraph(dirty);
    expect(graph.edges).toHaveLength(1);
    expect(summary.danglingEdgesRemoved).toBe(1);
  });

  it("deduplicates nodes with the same id", () => {
    const dirty: ArtifactGraph = {
      ...baseGraph,
      nodes: [
        ...baseGraph.nodes,
        { id: "a.ts", type: "file", path: "a.ts", buckets: [] }, // duplicate
      ],
    };
    const { graph, summary } = reviewGraph(dirty);
    expect(graph.nodes).toHaveLength(2);
    expect(summary.duplicateNodesRemoved).toBe(1);
  });

  it("deduplicates edges with the same id", () => {
    const dirty: ArtifactGraph = {
      ...baseGraph,
      edges: [
        ...baseGraph.edges,
        { id: "a->b:imports", from: "a.ts", to: "b.ts", type: "imports", confidence: 0.8, signals: [] },
      ],
    };
    const { graph, summary } = reviewGraph(dirty);
    expect(graph.edges).toHaveLength(1);
    expect(summary.duplicateEdgesRemoved).toBe(1);
  });
});
