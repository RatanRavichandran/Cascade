import fs from "fs";
import path from "path";
import { Redis } from "@upstash/redis";
import { hasRedisEnv } from "./graph/store.redis";

export interface HistoryEntry {
  repoId: string;
  repoUrl: string;
  analyzedAt: string; // ISO timestamp
  nodeCount: number;
}

const MAX_HISTORY = 50;

// ── Redis (Vercel / production) ───────────────────────────────────────────────

function historyKey(ghId: string): string {
  return `cascade:user:${ghId}:history`;
}

let _client: Redis | null = null;
function redis(): Redis {
  if (!_client) _client = Redis.fromEnv();
  return _client;
}

// ── Local file fallback (dev without Upstash) ─────────────────────────────────
// Mirrors the fileStore pattern for graphs. Stores per-user history as a JSON
// array at histories/{safeGhId}.json, newest entry first, capped at MAX_HISTORY.

const HISTORIES_DIR = path.join(process.cwd(), "histories");

function localHistoryPath(ghId: string): string {
  const safe = ghId.replace(/[^a-zA-Z0-9-]/g, "_");
  return path.join(HISTORIES_DIR, `${safe}.json`);
}

function readLocalHistory(ghId: string): HistoryEntry[] {
  const file = localHistoryPath(ghId);
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as HistoryEntry[];
  } catch {
    return [];
  }
}

function writeLocalHistory(ghId: string, entries: HistoryEntry[]): void {
  fs.mkdirSync(HISTORIES_DIR, { recursive: true });
  fs.writeFileSync(localHistoryPath(ghId), JSON.stringify(entries, null, 2), "utf-8");
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Append an analysis to the user's history (sorted newest first, capped at MAX_HISTORY).
 * Uses Redis on Vercel; falls back to a local JSON file in dev.
 */
export async function recordAnalysis(ghId: string, entry: HistoryEntry): Promise<void> {
  if (!hasRedisEnv()) {
    const existing = readLocalHistory(ghId);
    // Deduplicate: if this repoId already has an entry, replace it.
    const deduped = existing.filter((e) => e.repoId !== entry.repoId);
    writeLocalHistory(ghId, [entry, ...deduped].slice(0, MAX_HISTORY));
    return;
  }
  const score = new Date(entry.analyzedAt).getTime();
  const key = historyKey(ghId);
  await redis().zadd(key, { score, member: JSON.stringify(entry) });
  // Cap to latest MAX_HISTORY entries (remove oldest: lowest scores).
  await redis().zremrangebyrank(key, 0, -(MAX_HISTORY + 1));
}

/**
 * Retrieve a user's analysis history, newest first.
 * Uses Redis on Vercel; falls back to the local JSON file in dev.
 */
export async function getHistory(ghId: string): Promise<HistoryEntry[]> {
  if (!hasRedisEnv()) return readLocalHistory(ghId);
  const raw = await redis().zrange(historyKey(ghId), 0, -1, { rev: true });
  return raw
    .map((item) => {
      try {
        return typeof item === "string" ? (JSON.parse(item) as HistoryEntry) : (item as HistoryEntry);
      } catch {
        return null;
      }
    })
    .filter((e): e is HistoryEntry => e !== null);
}
