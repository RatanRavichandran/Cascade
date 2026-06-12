"use client";

import { useState } from "react";
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
}

const BUCKET_ICONS: Record<Bucket, string> = {
  "Requirements / specs": "📋",
  "Feature behavior": "✨",
  "Source code": "💻",
  "Routes and components": "🔀",
  "API contracts": "🔌",
  "Tests": "🧪",
  "Config": "⚙️",
  "CI/CD": "🔄",
  "Documentation": "📚",
  "Release / deployment hints": "🚀",
};

const BUCKET_COLORS: Record<Bucket, string> = {
  "Requirements / specs": "border-blue-500/30 bg-blue-500/5",
  "Feature behavior": "border-purple-500/30 bg-purple-500/5",
  "Source code": "border-cyan-500/30 bg-cyan-500/5",
  "Routes and components": "border-green-500/30 bg-green-500/5",
  "API contracts": "border-orange-500/30 bg-orange-500/5",
  "Tests": "border-yellow-500/30 bg-yellow-500/5",
  "Config": "border-gray-500/30 bg-gray-500/5",
  "CI/CD": "border-pink-500/30 bg-pink-500/5",
  "Documentation": "border-indigo-500/30 bg-indigo-500/5",
  "Release / deployment hints": "border-red-500/30 bg-red-500/5",
};

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 80 ? "text-green-400" : pct >= 50 ? "text-yellow-400" : "text-gray-400";
  return <span className={`text-xs font-mono ${color}`}>{pct}%</span>;
}

export default function BucketSection({ bucket, nodes, onNodeClick }: Props) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className={`rounded-xl border ${BUCKET_COLORS[bucket]} overflow-hidden`}>
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span>{BUCKET_ICONS[bucket]}</span>
          <span className="font-semibold text-sm">{bucket}</span>
          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
            {nodes.length}
          </span>
        </div>
        <span className="text-gray-500 text-xs">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && nodes.length > 0 && (
        <div className="divide-y divide-white/5">
          {nodes.map((node) => (
            <button
              key={node.id}
              onClick={() => onNodeClick(node.id)}
              className="w-full text-left px-4 py-2.5 hover:bg-white/5 transition-colors
                         flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-xs font-mono text-gray-300 truncate">{node.path}</p>
                {node.summary && (
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{node.summary}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {node.language && (
                  <span className="text-xs text-gray-500">{node.language}</span>
                )}
                {node.topBucket && (
                  <ConfidenceBadge confidence={node.topBucket.confidence} />
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {expanded && nodes.length === 0 && (
        <p className="px-4 py-3 text-xs text-gray-600 italic">No artifacts found</p>
      )}
    </div>
  );
}
