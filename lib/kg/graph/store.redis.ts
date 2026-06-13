import { Redis } from "@upstash/redis";
import type { ArtifactGraph } from "./model";
import type { GraphStore } from "./store";

// Key namespace so Cascade graphs don't collide with anything else in the DB.
function graphKey(repoId: string): string {
  return `cascade:graph:${repoId}`;
}

/**
 * Shared, instance-independent GraphStore backed by Upstash Redis (Vercel KV).
 *
 * Why this exists: on Vercel the local-filesystem store (`fileStore`) breaks — the
 * serverless FS is read-only and each request may hit a different lambda, so a graph
 * written during `/api/ingest` is invisible to the later `/api/buckets`, `/api/graph`,
 * `/api/node/[id]`, and `/api/query` reads. Redis is shared across all invocations.
 *
 * The value is a single JSON document keyed by repoId — pure key→blob semantics, which
 * is exactly what the app needs (it loads the whole graph and filters in JS).
 */

// `Redis.fromEnv()` reads KV_REST_API_URL / KV_REST_API_TOKEN (Vercel KV) or
// UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. Created lazily so importing this
// module never throws when the env is absent (local dev falls back to fileStore).
let client: Redis | null = null;
function redis(): Redis {
  if (!client) client = Redis.fromEnv();
  return client;
}

export const redisStore: GraphStore = {
  async save(repoId, graph) {
    // The Upstash SDK JSON-serializes objects automatically.
    await redis().set(graphKey(repoId), graph);
  },

  async load(repoId) {
    const graph = await redis().get<ArtifactGraph>(graphKey(repoId));
    return graph ?? null;
  },

  async exists(repoId) {
    return (await redis().exists(graphKey(repoId))) === 1;
  },
};

/**
 * True when the runtime has Upstash/Vercel-KV credentials configured.
 * Used by store.ts to decide between redisStore (deploy) and fileStore (local dev).
 */
export function hasRedisEnv(): boolean {
  return Boolean(
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
      (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  );
}
