# Vercel Deploy — Task List

See [plan.md](plan.md) for full detail, blockers, and verification steps.

## Phase 1 — Persistence (the database constraint) 🔴
- [x] **Task 1** — Shared `GraphStore` via Upstash Redis + env-based selection ✅ CODE DONE
  - [x] `npm i @upstash/redis` (^1.38.0)
  - [x] New `lib/kg/graph/store.redis.ts` (`redisStore`, `hasRedisEnv`)
  - [x] `store.ts`: uses Redis when KV env present, else `fileStore` (logs active backend)
  - [x] No changes to pipeline or API routes
  - [ ] Checkpoint A still needs a live Upstash to verify end-to-end (done in Task 3)

## Phase 2 — Serverless build correctness (tree-sitter wasm) 🔴
- [x] **Task 2** — serverless build fixes ✅ CODE DONE
  - [x] `next.config.ts`: `outputFileTracingIncludes` for wasm + `serverExternalPackages: ["graphology","web-tree-sitter"]`
  - [x] ingest route `runtime="nodejs"`, `maxDuration=60`
  - [x] typecheck + build + 125 tests all green locally
  - [ ] Checkpoint B (edges > 0 on preview) verified after first deploy

### ✅ Checkpoint B — preview deploy ingests a repo and produces a graph with edges > 0

## Phase 3 — Vercel project config & launch 🟡
- [ ] **Task 3** — Vercel project: Root Directory = `Cascade`; add Upstash integration; set `GITHUB_TOKEN`, `OPENAI_API_KEY`; update `.env.example`
- [ ] **Task 4** — Production deploy + smoke test (hero → analyze → buckets → drill-down → graph w/ edges; second session isolation; logs confirm Redis store)

### ✅ Checkpoint C — production URL runs full flow end-to-end; persistence is instance-independent

## Decision needed
- [ ] Confirm store backend: **Upstash Redis (default)** vs Vercel Blob vs Postgres
