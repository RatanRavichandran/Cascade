"use client";

import { useEffect, useState } from "react";
import type { HistoryEntry } from "@/lib/kg/history";

interface Props {
  onSelect: (repoId: string, repoUrl: string) => void;
}

export default function HistoryPanel({ onSelect }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/history")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setEntries(data.entries ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-surface border border-surface-border animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <span className="text-4xl" aria-hidden="true">⚠</span>
        <p className="text-sm font-medium text-ink-secondary">Could not load history</p>
        <p className="text-xs text-ink-muted">{error}</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <span className="text-4xl" aria-hidden="true">🗂</span>
        <p className="text-sm font-medium text-ink-secondary">No repos yet</p>
        <p className="text-xs text-ink-muted">
          Analyze a repo from the hero page — it will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry) => (
        <button
          key={`${entry.repoId}-${entry.analyzedAt}`}
          onClick={() => onSelect(entry.repoId, entry.repoUrl)}
          className="group w-full text-left bg-surface border border-surface-border rounded-xl
                     shadow-card hover:shadow-card-hover hover:border-primary/30
                     transition-all duration-150 px-4 py-3.5
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-mono text-primary font-medium truncate">{entry.repoUrl}</p>
              <p className="text-xs text-ink-muted mt-1">
                {entry.nodeCount} artifacts ·{" "}
                {new Date(entry.analyzedAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <span
              className="text-ink-faint group-hover:text-primary transition-colors text-xs shrink-0 mt-0.5"
              aria-hidden="true"
            >
              →
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
