"use client";

import type { ArtifactNode, ArtifactEdge } from "@/lib/kg/graph/model";

interface Props {
  node: ArtifactNode;
  edges: ArtifactEdge[];
  onClose: () => void;
}

export default function NodeDetail({ node, edges, onClose }: Props) {
  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-gray-900 border-l border-gray-800 shadow-2xl
                    flex flex-col overflow-hidden z-50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h3 className="font-semibold text-sm truncate">{node.path}</h3>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 text-sm">
        {/* Meta */}
        <div className="space-y-1">
          {node.language && (
            <p className="text-gray-400">
              <span className="text-gray-600">Language:</span> {node.language}
            </p>
          )}
          {node.summary && (
            <p className="text-gray-300 italic text-xs">{node.summary}</p>
          )}
          {node.layer && (
            <p className="text-gray-400">
              <span className="text-gray-600">Layer:</span> {node.layer}
            </p>
          )}
        </div>

        {/* Buckets */}
        <div>
          <h4 className="text-xs uppercase tracking-wider text-gray-600 mb-2">Buckets</h4>
          <div className="space-y-2">
            {node.buckets.map((b) => (
              <div key={b.bucket} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300">{b.bucket}</span>
                  <span className="text-xs font-mono text-gray-500">
                    {Math.round(b.confidence * 100)}%
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {b.signals.map((s) => (
                    <span
                      key={s}
                      className="text-xs bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded font-mono"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Edges */}
        {edges.length > 0 && (
          <div>
            <h4 className="text-xs uppercase tracking-wider text-gray-600 mb-2">
              Relationships ({edges.length})
            </h4>
            <div className="space-y-1.5">
              {edges.map((e) => {
                const isFrom = e.from === node.id;
                const other = isFrom ? e.to : e.from;
                return (
                  <div key={e.id} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-600 shrink-0">
                      {isFrom ? "→" : "←"}
                    </span>
                    <span className="bg-gray-800 text-violet-400 px-1.5 py-0.5 rounded font-mono shrink-0">
                      {e.type}
                    </span>
                    <span className="text-gray-400 truncate font-mono">{other}</span>
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
