import { Redis } from "@upstash/redis";
import { hasRedisEnv } from "./graph/store.redis";

export interface HistoryEntry {
  repoId: string;
  repoUrl: string;
  analyzedAt: string; // ISO timestamp
  nodeCount: number;
}

const MAX_HISTORY = 50;

function historyKey(ghId: string): string {
  return `cascade:user:${ghId}:history`;
}

let _client: Redis | null = null;
function redis(): Redis {
  if (!_client) _client = Redis.fromEnv();
  return _client;
}

/**
 * Append an analysis to the user's history (sorted by analyzedAt epoch, newest first).
 * Silently no-ops if Redis credentials are absent (local dev without KV).
 */
export async function recordAnalysis(ghId: string, entry: HistoryEntry): Promise<void> {
  if (!hasRedisEnv()) return;
  const score = new Date(entry.analyzedAt).getTime();
  const key = historyKey(ghId);
  await redis().zadd(key, { score, member: JSON.stringify(entry) });
  // Cap to latest MAX_HISTORY entries (remove oldest: lowest scores).
  await redis().zremrangebyrank(key, 0, -(MAX_HISTORY + 1));
}

/**
 * Retrieve a user's analysis history, newest first.
 * Returns an empty array if Redis credentials are absent.
 */
export async function getHistory(ghId: string): Promise<HistoryEntry[]> {
  if (!hasRedisEnv()) return [];
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
