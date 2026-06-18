"use client";

import { useEffect, useRef, useState } from "react";
import type { HistoryEntry } from "@/lib/kg/history";

interface Props {
  /** Pre-select a repo if the user already has one loaded in the dashboard. */
  initialRepoId?: string | null;
}

type Phase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "done"; roomUrl: string }
  | { kind: "error"; message: string };

export default function RippleLauncher({ initialRepoId }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [selectedRepoId, setSelectedRepoId] = useState<string>(initialRepoId ?? "");
  const [request, setRequest] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Keep selectedRepoId in sync if the parent switches to a different repo mid-session.
  useEffect(() => {
    if (initialRepoId) setSelectedRepoId(initialRepoId);
  }, [initialRepoId]);

  useEffect(() => {
    fetch("/api/history")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setEntries(data.entries ?? []);
        // Auto-select first entry if nothing pre-selected.
        if (!initialRepoId && data.entries?.length > 0) {
          setSelectedRepoId(data.entries[0].repoId);
        }
      })
      .catch((e: Error) => setHistoryError(e.message))
      .finally(() => setLoadingHistory(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRepoId || !request.trim()) return;
    setPhase({ kind: "submitting" });
    try {
      const res = await fetch("/api/ripple", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoId: selectedRepoId, request: request.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPhase({ kind: "error", message: data.error ?? `Error ${res.status}` });
        return;
      }
      setPhase({ kind: "done", roomUrl: data.roomUrl });
    } catch {
      setPhase({ kind: "error", message: "Network error — could not reach the server." });
    }
  }

  function reset() {
    setRequest("");
    setPhase({ kind: "idle" });
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  // ── History loading states ──────────────────────────────────────────────
  if (loadingHistory) {
    return (
      <div className="flex flex-col gap-3 max-w-2xl">
        <div className="h-10 rounded-xl bg-surface border border-surface-border animate-pulse" />
        <div className="h-32 rounded-xl bg-surface border border-surface-border animate-pulse" />
      </div>
    );
  }

  if (historyError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <p className="text-sm font-medium text-ink-secondary">Could not load repo history</p>
        <p className="text-xs text-ink-muted">{historyError}</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <span className="text-4xl" aria-hidden="true">🗂</span>
        <p className="text-sm font-medium text-ink-secondary">No analyzed repos yet</p>
        <p className="text-xs text-ink-muted">
          Analyze a public repo from the home page first — it will appear here.
        </p>
      </div>
    );
  }

  // ── Success state ───────────────────────────────────────────────────────
  if (phase.kind === "done") {
    return (
      <div className="max-w-2xl">
        <div className="rounded-card border border-primary/25 bg-primary/5 p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="text-primary font-semibold text-sm">Analysis session started</span>
          </div>
          <p className="text-sm text-ink-secondary">
            The Cascade agents have received your request and are working in Band.
            Open the room to watch the analysis live.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={phase.roomUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-primary text-white
                         text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-primary/90
                         transition-colors focus-visible:outline-none focus-visible:ring-2
                         focus-visible:ring-primary focus-visible:ring-offset-1"
            >
              Open session in Band
              <span aria-hidden="true">↗</span>
            </a>
            <button
              onClick={reset}
              className="inline-flex items-center justify-center text-sm font-medium
                         text-ink-secondary hover:text-ink px-5 py-2.5 rounded-lg
                         border border-surface-border hover:bg-surface-muted transition-colors
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
            >
              Start another analysis
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main form ───────────────────────────────────────────────────────────
  const isSubmitting = phase.kind === "submitting";
  const canSubmit = !!selectedRepoId && request.trim().length > 0 && !isSubmitting;

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-ink tracking-tight">Ripple Analysis</h2>
        <p className="text-sm text-ink-secondary mt-1">
          Select an analyzed repo, describe your change, and Cascade will map the full impact
          in a live Band session.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Repo selector */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="repo-select" className="text-xs font-medium text-ink-secondary uppercase tracking-wide">
            Repository
          </label>
          <select
            id="repo-select"
            value={selectedRepoId}
            onChange={(e) => setSelectedRepoId(e.target.value)}
            disabled={isSubmitting}
            className="w-full bg-surface border border-surface-border rounded-xl px-4 py-2.5
                       text-sm text-ink font-mono appearance-none
                       focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {entries.map((entry) => (
              <option key={entry.repoId} value={entry.repoId}>
                {entry.repoUrl} · {entry.nodeCount} artifacts
              </option>
            ))}
          </select>
        </div>

        {/* Change request textarea */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="change-request" className="text-xs font-medium text-ink-secondary uppercase tracking-wide">
            Change request
          </label>
          <textarea
            id="change-request"
            ref={textareaRef}
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            disabled={isSubmitting}
            rows={4}
            placeholder={
              'e.g. "Update the getItems API to support pagination" or\n"The getItems.spec.js test is failing after last merge — diagnose it"'
            }
            className="w-full bg-surface border border-surface-border rounded-xl px-4 py-3
                       text-sm text-ink resize-none
                       placeholder:text-ink-muted
                       focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary
                       disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <p className="text-xs text-ink-muted">
            Entry A: describe a requirements/spec change. Entry B: describe a failing test.
          </p>
        </div>

        {/* Inline error */}
        {phase.kind === "error" && (
          <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            {phase.message}
          </div>
        )}

        {/* Submit */}
        <div>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 bg-primary text-white
                       text-sm font-medium px-6 py-2.5 rounded-lg
                       hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors focus-visible:outline-none focus-visible:ring-2
                       focus-visible:ring-primary focus-visible:ring-offset-1"
          >
            {isSubmitting ? (
              <>
                <span
                  className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
                  aria-hidden="true"
                />
                Creating session…
              </>
            ) : (
              "Launch analysis"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
