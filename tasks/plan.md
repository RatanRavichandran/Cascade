# Deploy Plan: Cascade → Vercel

> Status: ✅ **COMPLETE** (2026-06-13). All tasks done; production deployed and verified.
> See full task history and Phase 7 work in [`../../docs/plan.md`](../../docs/plan.md).

## Overview
Cascade runs locally but had two hard blockers on Vercel's serverless platform:
1. `ENOENT /var/task/graphs` — fileStore tried to write to a read-only serverless filesystem.
2. tree-sitter wasm files dropped from the serverless bundle → zero structural edges.

Both were fixed by implementing a Redis-backed `GraphStore` and configuring `next.config.ts` to
force-include the wasm files in the function bundle.

---

## What actually breaks on Vercel (resolved)

### 🔴 Blocker 1 — Cross-request state via local filesystem ✅ FIXED
The serverless filesystem is read-only (except `/tmp`), and even `/tmp` is per-instance — a write
in `/api/ingest` won't be readable in `/api/buckets` on a different lambda. **Fix:** Upstash Redis
`GraphStore` (`lib/kg/graph/store.redis.ts`) keyed by `cascade:graph:{repoId}`.

### 🔴 Blocker 2 — tree-sitter wasm dropped from bundle ✅ FIXED
Runtime-computed wasm paths can't be statically traced by Next.js nft, so the `.wasm` files weren't
copied to the function bundle. **Fix:** `outputFileTracingIncludes` in `next.config.ts` forces both
the runtime wasm and all grammar wasms into the `/api/ingest` function.

### 🟠 Blocker 3 — Function timeout ✅ FIXED
Set `runtime = "nodejs"` and `maxDuration = 300` on the ingest route. SSE streaming keeps the
connection alive throughout even on large repos (400+ nodes, 20+ enrichment batches).

---

## Task List

### Phase 1 — Persistence ✅
- [x] **Task 1** — `lib/kg/graph/store.redis.ts` (`redisStore`, `hasRedisEnv`)
  - Key: `cascade:graph:{repoId}`
  - Env: `KV_REST_API_URL`/`KV_REST_API_TOKEN` (Vercel KV) or `UPSTASH_REDIS_REST_*`
  - `store.ts` selects Redis when env present, fileStore otherwise (logged once at startup)
  - No changes to pipeline or API routes

### Phase 2 — Serverless build ✅
- [x] **Task 2** — `next.config.ts`
  - `outputFileTracingIncludes`: `/api/ingest` → `tree-sitter-wasms/out/*.wasm` + `tree-sitter.wasm`
  - `serverExternalPackages`: `["graphology", "web-tree-sitter"]`
  - `images.remotePatterns`: `avatars.githubusercontent.com` (needed for auth avatars)
  - `app/api/ingest/route.ts`: `runtime = "nodejs"`, `maxDuration = 300`

### Phase 3 — Vercel project config & launch ✅
- [x] **Task 3** — Vercel project setup
  - Root Directory = `Cascade`
  - Upstash Redis integration → `KV_REST_API_URL` + `KV_REST_API_TOKEN` (auto-injected)
  - `GITHUB_TOKEN` set (Production + Preview)
  - `OPENAI_API_KEY` set (Production + Preview)
  - `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` set (auth phase)
  - `.env.example` updated with all vars

- [x] **Task 4** — Production deploy + smoke test
  - Hero loads, repo input works with shorthand (`owner/repo`)
  - Bucket tiles show non-zero counts; drill-down works; node detail opens
  - Graph view renders with nodes AND edges
  - Second browser session confirms no per-instance state
  - Vercel logs show: `[cascade] graph store: redis (shared)`
  - Live SSE progress shown during enrichment

---

## Architecture Decisions

- **Swap the store, don't touch callers.** `GraphStore` interface seam used exactly as designed.
- **Upstash Redis** — HTTP SDK is serverless-safe; key→JSON is a perfect fit for one graph blob.
- **fileStore stays as local-dev default** — `npm run dev` needs no cloud account.
- **SSE on ingest** — `ReadableStream` + `text/event-stream` keeps large-repo requests alive
  and shows progress; eliminates the need for a separate background worker.
