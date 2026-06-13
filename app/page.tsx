"use client";

import { useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import RepoInput from "@/components/RepoInput";
import BucketCard from "@/components/BucketCard";
import BucketDetail from "@/components/BucketDetail";
import NodeDetail from "@/components/NodeDetail";
import UserMenu from "@/components/UserMenu";
import HistoryPanel from "@/components/HistoryPanel";
import { BUCKETS, type Bucket } from "@/lib/kg/graph/model";
import type { ArtifactNode, ArtifactEdge, ArtifactGraph } from "@/lib/kg/graph/model";

const GraphView = dynamic(() => import("@/components/GraphView"), { ssr: false });

interface BucketNode {
  id: string;
  path: string;
  language?: string;
  topBucket?: { bucket: Bucket; confidence: number; signals: string[] };
  allBuckets: Array<{ bucket: Bucket; confidence: number; signals: string[] }>;
  summary?: string;
}

interface BucketsResponse {
  repoId: string;
  repoUrl: string;
  createdAt: string;
  buckets: Record<Bucket, { count: number; nodes: BucketNode[] }>;
}

interface NodeDetailData {
  node: ArtifactNode;
  edges: ArtifactEdge[];
}

type DashView = "overview" | "graph" | "bucket" | "history";

// ── Skeleton tile shown during loading ─────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="rounded-card border border-surface-border bg-surface shadow-card p-5 flex flex-col gap-3 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-xl bg-surface-muted" />
        <div className="w-8 h-7 rounded bg-surface-muted" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3 rounded bg-surface-muted w-3/4" />
        <div className="h-2.5 rounded bg-surface-muted w-1/3" />
      </div>
    </div>
  );
}

// ── Top bar ────────────────────────────────────────────────────────────────
function TopBar({ hasResults }: { hasResults: boolean }) {
  return (
    <header className="sticky top-0 z-40 bg-surface/80 backdrop-blur-sm border-b border-surface-border">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="2.5" fill="white" />
              <path d="M7 1.5v2M7 10.5v2M1.5 7h2M10.5 7h2M3.4 3.4l1.4 1.4M9.2 9.2l1.4 1.4M10.6 3.4L9.2 4.8M4.8 9.2L3.4 10.6" stroke="white" strokeWidth="1.25" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="font-semibold text-ink text-base tracking-tight">Cascade</span>
        </div>
        {hasResults && (
          <span className="text-xs text-ink-muted bg-surface-muted border border-surface-border px-2.5 py-1 rounded-pill ml-1">
            Knowledge Graph Builder
          </span>
        )}
        <div className="ml-auto">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

// ── View switcher tab ──────────────────────────────────────────────────────
function ViewTab({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        px-4 py-2 text-sm font-medium rounded-lg transition-all duration-150
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1
        ${active
          ? "bg-primary text-white shadow-sm"
          : "text-ink-secondary hover:text-ink hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed"
        }
      `}
    >
      {label}
    </button>
  );
}

export default function Home() {
  const { data: session } = useSession();
  const isLoggedIn = !!session?.user?.ghId;
  const [repoId, setRepoId] = useState<string | null>(null);
  const [repoUrl, setRepoUrl] = useState<string | null>(null);
  const [bucketsData, setBucketsData] = useState<BucketsResponse | null>(null);
  const [graphData, setGraphData] = useState<ArtifactGraph | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeDetailData | null>(null);
  const [loadingBuckets, setLoadingBuckets] = useState(false);
  const [dashView, setDashView] = useState<DashView>("overview");
  const [selectedBucket, setSelectedBucket] = useState<Bucket | null>(null);

  async function handleIngest(id: string, url: string) {
    setRepoId(id);
    setRepoUrl(url);
    setSelectedNode(null);
    setSelectedBucket(null);
    setLoadingBuckets(true);
    setDashView("overview");

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
    const res = await fetch(`/api/node/${encodeURIComponent(nodeId)}?repoId=${repoId}`);
    const data = await res.json();
    setSelectedNode(data);
  }, [repoId]);

  function handleBucketClick(bucket: Bucket) {
    setSelectedBucket(bucket);
    setDashView("bucket");
  }

  function handleBackToOverview() {
    setSelectedBucket(null);
    setDashView("overview");
  }

  async function handleHistorySelect(id: string, url: string) {
    setRepoId(id);
    setRepoUrl(url);
    setSelectedNode(null);
    setSelectedBucket(null);
    setLoadingBuckets(true);
    setDashView("overview");

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

  const totalNodes = bucketsData
    ? Object.values(bucketsData.buckets).reduce((s, b) => s + b.count, 0)
    : 0;

  const hasResults = bucketsData && !loadingBuckets;

  // ── Hero / empty state ──────────────────────────────────────────────────
  if (!repoId && !loadingBuckets) {
    return (
      <div className="min-h-screen flex flex-col">
        <TopBar hasResults={false} />
        <main className="flex-1 flex flex-col items-center justify-center px-6 py-20">
          {/* Hero text */}
          <div className="text-center max-w-2xl mb-12">
            <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary text-xs font-medium px-3 py-1.5 rounded-pill mb-6">
              <span aria-hidden="true">✦</span> Change-impact analysis · Band of Agents Hackathon
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-ink tracking-tight leading-tight mb-4">
              See the ripple<br />
              <span className="text-primary">before you ship.</span>
            </h1>
            <p className="text-base text-ink-secondary leading-relaxed max-w-xl mx-auto">
              Paste a public GitHub repository. Cascade classifies every artifact into a knowledge
              graph — requirements, tests, routes, CI/CD and more — so you can understand impact
              before writing a single line.
            </p>
          </div>

          {/* Repo input */}
          <div className="w-full max-w-xl">
            <RepoInput onIngest={handleIngest} />
          </div>

          {/* Example repos */}
          <div className="mt-8 flex flex-col items-center gap-2">
            <p className="text-xs text-ink-muted">Try a public repo:</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {[
                "docker/getting-started-todo-app",
                "vercel/next.js",
                "facebook/react",
              ].map((repo) => (
                <span
                  key={repo}
                  className="text-xs font-mono bg-surface border border-surface-border text-ink-secondary px-3 py-1.5 rounded-lg shadow-card"
                >
                  {repo}
                </span>
              ))}
            </div>
          </div>

          {/* Feature pills */}
          <div className="mt-16 flex flex-wrap gap-3 justify-center max-w-2xl">
            {[
              { icon: "🔍", label: "10 artifact buckets" },
              { icon: "🕸", label: "Interactive knowledge graph" },
              { icon: "⚡", label: "Multi-signal inference" },
              { icon: "🤖", label: "Optional LLM enrichment" },
            ].map(({ icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 bg-surface border border-surface-border rounded-xl px-4 py-2.5 shadow-card text-sm text-ink-secondary"
              >
                <span aria-hidden="true">{icon}</span> {label}
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  // ── Dashboard shell (loading or results) ────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar hasResults={!!hasResults} />

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8 space-y-6">

        {/* Repo bar + view switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div className="min-w-0">
            {repoUrl && (
              <p className="text-sm font-mono text-primary font-medium truncate">{repoUrl}</p>
            )}
            {hasResults && (
              <p className="text-xs text-ink-muted mt-0.5">
                {totalNodes} artifacts classified ·{" "}
                {new Date(bucketsData.createdAt).toLocaleTimeString()}
              </p>
            )}
            {loadingBuckets && (
              <p className="text-xs text-ink-muted mt-0.5 animate-pulse">
                Ingesting and classifying repository…
              </p>
            )}
          </div>

          {hasResults && (
            <div className="flex items-center gap-1 bg-surface-muted border border-surface-border rounded-xl p-1 shrink-0">
              <ViewTab
                label="Overview"
                active={dashView === "overview" || dashView === "bucket"}
                onClick={() => { setDashView("overview"); setSelectedBucket(null); }}
              />
              <ViewTab
                label="Graph"
                active={dashView === "graph"}
                disabled={!graphData}
                onClick={() => { setDashView("graph"); setSelectedBucket(null); }}
              />
              {isLoggedIn && (
                <ViewTab
                  label="My repos"
                  active={dashView === "history"}
                  onClick={() => { setDashView("history"); setSelectedBucket(null); }}
                />
              )}
            </div>
          )}
        </div>

        {/* Loading skeletons */}
        {loadingBuckets && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* Overview: bucket tiles grid */}
        {hasResults && dashView === "overview" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {BUCKETS.map((bucket) => (
              <BucketCard
                key={bucket}
                bucket={bucket}
                count={bucketsData.buckets[bucket]?.count ?? 0}
                onClick={() => handleBucketClick(bucket)}
              />
            ))}
          </div>
        )}

        {/* Bucket detail drill-down */}
        {hasResults && dashView === "bucket" && selectedBucket && (
          <BucketDetail
            bucket={selectedBucket}
            nodes={bucketsData.buckets[selectedBucket]?.nodes ?? []}
            onNodeClick={handleNodeClick}
            onBack={handleBackToOverview}
          />
        )}

        {/* Graph view */}
        {hasResults && dashView === "graph" && graphData && (
          <GraphView graph={graphData} onNodeClick={handleNodeClick} />
        )}

        {/* My repos history */}
        {hasResults && dashView === "history" && isLoggedIn && (
          <HistoryPanel onSelect={handleHistorySelect} />
        )}
      </main>

      {/* Node detail slide-over */}
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
