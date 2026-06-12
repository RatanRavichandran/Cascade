"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import RepoInput from "@/components/RepoInput";
import BucketSection from "@/components/BucketSection";
import NodeDetail from "@/components/NodeDetail";
import { BUCKETS, type Bucket } from "@/lib/kg/graph/model";
import type { ArtifactNode, ArtifactEdge, ArtifactGraph } from "@/lib/kg/graph/model";

const GraphView = dynamic(() => import("@/components/GraphView"), { ssr: false });

interface BucketData {
  count: number;
  nodes: Array<{
    id: string;
    path: string;
    language?: string;
    topBucket?: { bucket: Bucket; confidence: number; signals: string[] };
    allBuckets: Array<{ bucket: Bucket; confidence: number; signals: string[] }>;
    summary?: string;
  }>;
}

interface BucketsResponse {
  repoId: string;
  repoUrl: string;
  createdAt: string;
  buckets: Record<Bucket, BucketData>;
}

interface NodeDetailData {
  node: ArtifactNode;
  edges: ArtifactEdge[];
}

type View = "buckets" | "graph";

export default function Home() {
  const [repoId, setRepoId] = useState<string | null>(null);
  const [repoUrl, setRepoUrl] = useState<string | null>(null);
  const [bucketsData, setBucketsData] = useState<BucketsResponse | null>(null);
  const [graphData, setGraphData] = useState<ArtifactGraph | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeDetailData | null>(null);
  const [loadingBuckets, setLoadingBuckets] = useState(false);
  const [view, setView] = useState<View>("buckets");

  async function handleIngest(id: string, url: string) {
    setRepoId(id);
    setRepoUrl(url);
    setSelectedNode(null);
    setLoadingBuckets(true);
    setView("buckets");

    try {
      const [bucketsRes, graphRes] = await Promise.all([
        fetch(`/api/buckets?repoId=${id}`),
        fetch(`/api/graph?repoId=${id}`),
      ]);
      const [buckets, graph] = await Promise.all([bucketsRes.json(), graphRes.json()]);
      setBucketsData(buckets);
      setGraphData(graph);
    } finally {
      setLoadingBuckets(false);
    }
  }

  const handleNodeClick = useCallback(async (nodeId: string) => {
    if (!repoId) return;
    const res = await fetch(
      `/api/node/${encodeURIComponent(nodeId)}?repoId=${repoId}`
    );
    const data = await res.json();
    setSelectedNode(data);
  }, [repoId]);

  const totalNodes = bucketsData
    ? Object.values(bucketsData.buckets).reduce((s, b) => s + b.count, 0)
    : 0;

  const hasResults = bucketsData && !loadingBuckets;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Cascade</h1>
            <p className="text-xs text-gray-500">Repo artifact mapper · change-impact analysis</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Input */}
        <section>
          <p className="text-sm text-gray-400 mb-3">
            Paste a public GitHub repository URL to classify its artifacts into a knowledge graph.
          </p>
          <RepoInput onIngest={handleIngest} />
        </section>

        {/* Loading */}
        {loadingBuckets && (
          <div className="text-center py-16 text-gray-500">
            <p className="text-sm animate-pulse">Ingesting and classifying repository…</p>
          </div>
        )}

        {/* Results */}
        {hasResults && (
          <>
            {/* Repo summary + view toggle */}
            <div className="flex items-center justify-between border-b border-gray-800 pb-4">
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <span className="font-mono text-violet-400">{repoUrl}</span>
                <span className="text-gray-600">·</span>
                <span>{totalNodes} artifacts classified</span>
                <span className="text-gray-600">·</span>
                <span className="text-gray-600 text-xs">
                  {new Date(bucketsData.createdAt).toLocaleTimeString()}
                </span>
              </div>

              {/* View toggle */}
              <div className="flex rounded-md border border-gray-700 overflow-hidden text-xs">
                <button
                  onClick={() => setView("buckets")}
                  className={`px-3 py-1.5 transition-colors ${
                    view === "buckets"
                      ? "bg-gray-700 text-gray-100"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  Buckets
                </button>
                <button
                  onClick={() => setView("graph")}
                  disabled={!graphData}
                  className={`px-3 py-1.5 transition-colors border-l border-gray-700 ${
                    view === "graph"
                      ? "bg-gray-700 text-gray-100"
                      : "text-gray-500 hover:text-gray-300 disabled:opacity-40"
                  }`}
                >
                  Graph
                </button>
              </div>
            </div>

            {/* Bucket sections view */}
            {view === "buckets" && (
              <div className="grid gap-3">
                {BUCKETS.map((bucket) => (
                  <BucketSection
                    key={bucket}
                    bucket={bucket}
                    nodes={bucketsData.buckets[bucket]?.nodes ?? []}
                    onNodeClick={handleNodeClick}
                  />
                ))}
              </div>
            )}

            {/* Graph view */}
            {view === "graph" && graphData && (
              <GraphView graph={graphData} onNodeClick={handleNodeClick} />
            )}
          </>
        )}
      </main>

      {/* Node detail side panel */}
      {selectedNode && (
        <NodeDetail
          node={selectedNode.node}
          edges={selectedNode.edges}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}
