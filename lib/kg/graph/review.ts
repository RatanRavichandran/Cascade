import type { ArtifactGraph, ArtifactNode, ArtifactEdge } from "./model";

export interface ReviewSummary {
  danglingEdgesRemoved: number;
  duplicateNodesRemoved: number;
  duplicateEdgesRemoved: number;
  nodesAfter: number;
  edgesAfter: number;
}

export function reviewGraph(graph: ArtifactGraph): {
  graph: ArtifactGraph;
  summary: ReviewSummary;
} {
  const { nodes: rawNodes, edges: rawEdges } = graph;

  // 1. Deduplicate nodes by id (keep first occurrence)
  const nodeMap = new Map<string, ArtifactNode>();
  for (const node of rawNodes) {
    if (!nodeMap.has(node.id)) nodeMap.set(node.id, node);
  }
  const duplicateNodesRemoved = rawNodes.length - nodeMap.size;

  // 2. Drop dangling edges (endpoints not in node map)
  const validEdges = rawEdges.filter(
    (e) => nodeMap.has(e.from) && nodeMap.has(e.to)
  );
  const danglingEdgesRemoved = rawEdges.length - validEdges.length;

  // 3. Deduplicate edges by id
  const edgeMap = new Map<string, ArtifactEdge>();
  for (const edge of validEdges) {
    if (!edgeMap.has(edge.id)) edgeMap.set(edge.id, edge);
  }
  const duplicateEdgesRemoved = validEdges.length - edgeMap.size;

  const cleanedNodes = Array.from(nodeMap.values());
  const cleanedEdges = Array.from(edgeMap.values());

  return {
    graph: {
      ...graph,
      nodes: cleanedNodes,
      edges: cleanedEdges,
    },
    summary: {
      danglingEdgesRemoved,
      duplicateNodesRemoved,
      duplicateEdgesRemoved,
      nodesAfter: cleanedNodes.length,
      edgesAfter: cleanedEdges.length,
    },
  };
}
