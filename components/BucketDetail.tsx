"use client";

import type { Bucket } from "@/lib/kg/graph/model";

interface BucketNode {
  id: string;
  path: string;
  language?: string;
  topBucket?: { bucket: Bucket; confidence: number; signals: string[] };
  allBuckets: Array<{ bucket: Bucket; confidence: number; signals: string[] }>;
  summary?: string;
}

interface Props {
  bucket: Bucket;
  nodes: BucketNode[];
  onNodeClick: (nodeId: string) => void;
  onBack: () => void;
}

function ConfidencePill({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 80
      ? "bg-green-50 text-green-700 border-green-200"
      : pct >= 50
      ? "bg-yellow-50 text-yellow-700 border-yellow-200"
      : "bg-surface-muted text-ink-muted border-surface-border";
  return (
    <span className={`text-xs font-mono border rounded-pill px-2 py-0.5 ${color}`}>
      {pct}%
    </span>
  );
}

export default function BucketDetail({ bucket, nodes, onNodeClick, onBack }: Props) {
  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-primary
                     transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg px-1 py-0.5"
          aria-label="Back to overview"
        >
          <span aria-hidden="true">←</span> Overview
        </button>
        <span className="text-ink-faint" aria-hidden="true">/</span>
        <h2 className="text-sm font-semibold text-ink">{bucket}</h2>
        <span className="ml-auto text-xs text-ink-muted bg-surface-muted border border-surface-border px-2.5 py-1 rounded-pill">
          {nodes.length} {nodes.length === 1 ? "artifact" : "artifacts"}
        </span>
      </div>

      {/* Artifact list */}
      {nodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <span className="text-4xl" aria-hidden="true">🗂</span>
          <p className="text-sm font-medium text-ink-secondary">No artifacts in this bucket</p>
          <p className="text-xs text-ink-muted">This repo had nothing classified under &ldquo;{bucket}&rdquo;.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {nodes.map((node) => (
            <button
              key={node.id}
              onClick={() => onNodeClick(node.id)}
              className="group w-full text-left bg-surface border border-surface-border rounded-xl
                         shadow-card hover:shadow-card-hover hover:border-primary/30
                         transition-all duration-150 px-4 py-3.5
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-mono text-ink font-medium truncate">{node.path}</p>
                  {node.summary && (
                    <p className="text-xs text-ink-secondary mt-1 line-clamp-2">{node.summary}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 pt-0.5">
                  {node.language && (
                    <span className="text-xs text-ink-muted bg-surface-muted border border-surface-border px-2 py-0.5 rounded-pill">
                      {node.language}
                    </span>
                  )}
                  {node.topBucket && (
                    <ConfidencePill confidence={node.topBucket.confidence} />
                  )}
                  <span className="text-ink-faint group-hover:text-primary transition-colors text-xs" aria-hidden="true">
                    →
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
