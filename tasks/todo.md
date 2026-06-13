# Vercel Deploy — Task Checklist

> Status: ✅ **ALL DONE** (2026-06-13). See [plan.md](plan.md) for full detail.

## Phase 1 — Persistence (the database constraint) ✅
- [x] **Task 1** — Shared `GraphStore` via Upstash Redis + env-based selection
  - [x] `npm i @upstash/redis` (^1.38.0)
  - [x] New `lib/kg/graph/store.redis.ts` (`redisStore`, `hasRedisEnv`)
  - [x] `store.ts`: uses Redis when KV env present, else `fileStore` (logs active backend)
  - [x] Verified: cross-request reads work against Upstash in production

## Phase 2 — Serverless build correctness (tree-sitter wasm) ✅
- [x] **Task 2** — Serverless build fixes
  - [x] `next.config.ts`: `outputFileTracingIncludes` for wasm + `serverExternalPackages: ["graphology","web-tree-sitter"]`
  - [x] `next.config.ts`: `images.remotePatterns` for `avatars.githubusercontent.com`
  - [x] Ingest route: `runtime="nodejs"`, `maxDuration=300`
  - [x] Verified: graph has edges > 0 on production deploy

## Phase 3 — Vercel project config & launch ✅
- [x] **Task 3** — Vercel project setup
  - [x] Root Directory = `Cascade`
  - [x] Upstash integration → `KV_REST_API_URL` + `KV_REST_API_TOKEN`
  - [x] `GITHUB_TOKEN`, `OPENAI_API_KEY`, `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` set
  - [x] `.env.example` updated
- [x] **Task 4** — Production smoke test complete
  - [x] Hero → analyze → buckets → drill-down → graph view (with edges)
  - [x] SSE streaming progress shown during enrichment
  - [x] Auth: sign in → "My repos" → history entry → reopens instantly
  - [x] Second session confirms no per-instance state
  - [x] Vercel logs confirm: `[cascade] graph store: redis (shared)`

## Additional fixes applied during deploy
- [x] `suppressHydrationWarning` on `<body>` (browser extension attr injection)
- [x] `normalizeUrl()` in `RepoInput.tsx` (owner/repo shorthand support)
- [x] `maxDuration` raised from 60 → 300 (large-repo enrichment support)
- [x] 60-node enrichment cap removed (all nodes enriched with live progress)
- [x] Two GitHub OAuth Apps created (dev localhost + prod Vercel domain)
