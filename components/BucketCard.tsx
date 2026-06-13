"use client";

import type { Bucket } from "@/lib/kg/graph/model";

interface Props {
  bucket: Bucket;
  count: number;
  onClick: () => void;
}

const BUCKET_META: Record<Bucket, { icon: string; accent: string; bg: string; border: string }> = {
  "Requirements / specs":      { icon: "📋", accent: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-100" },
  "Feature behavior":          { icon: "✨", accent: "text-violet-700", bg: "bg-violet-50", border: "border-violet-100" },
  "Source code":               { icon: "💻", accent: "text-cyan-700",   bg: "bg-cyan-50",   border: "border-cyan-100" },
  "Routes and components":     { icon: "🔀", accent: "text-green-700",  bg: "bg-green-50",  border: "border-green-100" },
  "API contracts":             { icon: "🔌", accent: "text-orange-700", bg: "bg-orange-50", border: "border-orange-100" },
  "Tests":                     { icon: "🧪", accent: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-100" },
  "Config":                    { icon: "⚙️", accent: "text-slate-700",  bg: "bg-slate-50",  border: "border-slate-200" },
  "CI/CD":                     { icon: "🔄", accent: "text-pink-700",   bg: "bg-pink-50",   border: "border-pink-100" },
  "Documentation":             { icon: "📚", accent: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-100" },
  "Release / deployment hints":{ icon: "🚀", accent: "text-red-700",    bg: "bg-red-50",    border: "border-red-100" },
};

export default function BucketCard({ bucket, count, onClick }: Props) {
  const meta = BUCKET_META[bucket];

  return (
    <button
      onClick={onClick}
      className={`
        group relative w-full text-left rounded-card border ${meta.border} bg-surface
        shadow-card hover:shadow-card-hover transition-all duration-200
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
        p-5 flex flex-col gap-3
      `}
    >
      {/* Icon + count */}
      <div className="flex items-start justify-between">
        <span
          className={`inline-flex items-center justify-center w-10 h-10 rounded-xl text-xl ${meta.bg} border ${meta.border}`}
          aria-hidden="true"
        >
          {meta.icon}
        </span>
        <span className={`text-2xl font-bold tabular-nums ${meta.accent}`}>
          {count}
        </span>
      </div>

      {/* Label */}
      <div>
        <p className="text-sm font-semibold text-ink leading-snug">{bucket}</p>
        <p className="text-xs text-ink-muted mt-0.5">
          {count === 1 ? "artifact" : "artifacts"}
        </p>
      </div>

      {/* Hover caret */}
      <span
        className="absolute bottom-4 right-4 text-ink-faint group-hover:text-primary transition-colors text-xs"
        aria-hidden="true"
      >
        →
      </span>
    </button>
  );
}
