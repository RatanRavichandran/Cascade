"use client";

import type { ArtifactNode, ArtifactEdge } from "@/lib/kg/graph/model";

interface Props {
  node: ArtifactNode;
  edges: ArtifactEdge[];
  onClose: () => void;
}

const EDGE_TYPE_COLORS: Record<string, string> = {
  imports:                  "bg-slate-100 text-slate-700 border-slate-200",
  tests:                    "bg-pink-50 text-pink-700 border-pink-200",
  defines_route:            "bg-cyan-50 text-cyan-700 border-cyan-200",
  implements_route:         "bg-cyan-50 text-cyan-700 border-cyan-200",
  configures:               "bg-slate-100 text-slate-600 border-slate-200",
  documents:                "bg-teal-50 text-teal-700 border-teal-200",
  references_external_spec: "bg-violet-50 text-violet-700 border-violet-200",
  deploys:                  "bg-green-50 text-green-700 border-green-200",
};

export default function NodeDetail({ node, edges, onClose }: Props) {
  return (
    <div
      className="fixed inset-y-0 right-0 w-96 bg-surface border-l border-surface-border shadow-panel
                  flex flex-col overflow-hidden z-50"
      role="dialog"
      aria-label={`Artifact detail: ${node.path}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border bg-surface">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ink-muted mb-0.5 uppercase tracking-wide font-medium">Artifact</p>
          <h3 className="font-semibold text-sm text-ink truncate font-mono">{node.path}</h3>
        </div>
        <button
          onClick={onClose}
          aria-label="Close detail panel"
          className="ml-3 shrink-0 w-8 h-8 flex items-center justify-center rounded-lg
                     text-ink-muted hover:text-ink hover:bg-surface-muted
                     transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6 text-sm">

        {/* Meta */}
        <div className="flex flex-wrap gap-2">
          {node.language && (
            <span className="text-xs bg-surface-muted border border-surface-border text-ink-secondary px-2.5 py-1 rounded-pill">
              {node.language}
            </span>
          )}
          {node.layer && (
            <span className="text-xs bg-primary/10 border border-primary/20 text-primary px-2.5 py-1 rounded-pill font-medium">
              {node.layer}
            </span>
          )}
          {node.type && (
            <span className="text-xs bg-surface-muted border border-surface-border text-ink-muted px-2.5 py-1 rounded-pill">
              {node.type}
            </span>
          )}
        </div>

        {node.summary && (
          <p className="text-xs text-ink-secondary leading-relaxed bg-surface-subtle border border-surface-border rounded-xl px-4 py-3 italic">
            {node.summary}
          </p>
        )}

        {/* Buckets */}
        <div>
          <h4 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3">
            Classifications
          </h4>
          <div className="space-y-3">
            {node.buckets.map((b) => {
              const pct = Math.round(b.confidence * 100);
              return (
                <div key={b.bucket}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-ink">{b.bucket}</span>
                    <span className="text-xs font-mono text-ink-secondary">{pct}%</span>
                  </div>
                  {/* Confidence bar */}
                  <div className="h-1 rounded-full bg-surface-muted overflow-hidden mb-2">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {b.signals.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {b.signals.map((s) => (
                        <span
                          key={s}
                          className="text-xs bg-surface-muted border border-surface-border text-ink-muted px-1.5 py-0.5 rounded font-mono"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Edges */}
        {edges.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3">
              Relationships <span className="font-normal normal-case">({edges.length})</span>
            </h4>
            <div className="space-y-2">
              {edges.map((e) => {
                const isFrom = e.from === node.id;
                const other = isFrom ? e.to : e.from;
                const chipColor = EDGE_TYPE_COLORS[e.type] ?? "bg-surface-muted text-ink-muted border-surface-border";
                return (
                  <div key={e.id} className="flex items-start gap-2 text-xs">
                    <span className="text-ink-muted shrink-0 mt-0.5 w-3 text-center" aria-label={isFrom ? "outgoing" : "incoming"}>
                      {isFrom ? "→" : "←"}
                    </span>
                    <span className={`border rounded px-1.5 py-0.5 font-mono shrink-0 ${chipColor}`}>
                      {e.type}
                    </span>
                    <span className="text-ink-secondary truncate font-mono">{other}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
