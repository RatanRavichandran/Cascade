"use client";

import { useState } from "react";

interface Props {
  onIngest: (repoId: string, repoUrl: string) => void;
  onStart?: (repoUrl: string) => void;
  onProgress?: (message: string) => void;
}

export default function RepoInput({ onIngest, onStart, onProgress }: Props) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function normalizeUrl(raw: string): string {
    const s = raw.trim();
    if (/^https?:\/\//i.test(s)) return s;
    if (/^github\.com\//i.test(s)) return `https://${s}`;
    if (/^[\w.-]+\/[\w.-]+$/.test(s)) return `https://github.com/${s}`;
    return s;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    const repoUrl = normalizeUrl(url);
    setLoading(true);
    setError(null);
    onStart?.(repoUrl);

    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl }),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            continue;
          }

          if (event.type === "progress" && typeof event.message === "string") {
            onProgress?.(event.message);
          } else if (event.type === "done") {
            onIngest(event.repoId as string, repoUrl);
          } else if (event.type === "error") {
            throw new Error((event.message as string) ?? "Ingestion failed");
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full">
      <div className="flex gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="owner/repo or https://github.com/owner/repo"
          className="flex-1 px-4 py-3 bg-surface border border-surface-border rounded-xl text-sm
                     text-ink placeholder-ink-muted shadow-card
                     focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary
                     transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="px-6 py-3 bg-primary hover:bg-primary-dark text-white text-sm font-semibold
                     rounded-xl shadow-card transition-all duration-150
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
                     disabled:opacity-40 disabled:cursor-not-allowed min-w-[100px]"
        >
          {loading ? (
            <span className="flex items-center gap-2 justify-center">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Analyzing
            </span>
          ) : (
            "Analyze"
          )}
        </button>
      </div>
      {error && (
        <p className="text-danger text-sm flex items-center gap-1.5">
          <span aria-hidden="true">⚠</span> {error}
        </p>
      )}
    </form>
  );
}
