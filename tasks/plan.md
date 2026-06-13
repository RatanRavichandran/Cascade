# Implementation Plan: Deploy Cascade to Vercel

## Overview
Cascade runs perfectly locally but has **two hard blockers** and several soft ones that will break it on
Vercel's serverless platform. This plan sorts out the persistence ("database") constraint, makes the
tree-sitter parser survive the serverless bundle, and configures the Vercel project for a working deploy.

The codebase was designed for this: `GraphStore` (`lib/kg/graph/store.ts`) is an interface with a comment
"swap this to a Postgres impl at deploy time." We exploit that seam — no pipeline or UI changes needed.

---

## The blockers (what actually breaks on Vercel)

### 🔴 Blocker 1 — CRITICAL: cross-request state via local filesystem (the "database constraint")
The app's request flow spans **multiple HTTP requests against shared state**:

```
POST /api/ingest        → runPipeline() → store.save(repoId, graph)   writes graphs/{id}.graph.json
GET  /api/buckets?id    → store.load(repoId)                          reads  it back
GET  /api/graph?id      → store.load(repoId)                          (separate request)
GET  /api/node/[id]?id  → store.load(repoId)                          (separate request)
GET  /api/query?id      → store.load(repoId)                          (separate request)
```

On Vercel this fails two ways:
1. The serverless filesystem is **read-only** except `/tmp`, so `fs.writeFileSync` into `graphs/` throws.
2. Even writing to `/tmp`, **each invocation may run on a different lambda instance** — the file written
   during `ingest` won't exist when `buckets`/`graph`/`node` run. State does not survive across requests.

This is THE database constraint. Fix: implement a `GraphStore` backed by a **shared external store** and
swap the exported `store`. Recommended: **Upstash Redis (Vercel KV)** — the value is a single JSON document
keyed by `repoId`, with no querying inside it, which is exactly key→blob semantics. (Postgres would work
but is overkill for one JSON blob; Vercel Blob is the swap-in alternative if a graph exceeds KV value size.)

### 🔴 Blocker 2 — CRITICAL: tree-sitter `.wasm` files dropped from the serverless bundle
`lib/kg/parse/treesitter.ts` loads wasm by **runtime-computed absolute paths**:
- `node_modules/web-tree-sitter/tree-sitter.wasm` (the runtime)
- `node_modules/tree-sitter-wasms/out/*.wasm` (per-language grammars)

Next.js output file tracing (nft) **cannot statically see** these dynamic paths, so the `.wasm` files are
not copied into the function bundle. At runtime `fs.existsSync(wasmPath)` returns false →
`loadLanguage()` returns null → `parseFile()` returns null → **zero structural edges**. This is the exact
silent-failure mode documented in `docs/fix.md`, just triggered by bundling instead of a version mismatch.
Nodes still classify, but imports/tests/route edges vanish — the graph's headline feature.

Fix: force-include the wasm in the function via `outputFileTracingIncludes`, and mark `web-tree-sitter`
as a server-external package so webpack doesn't mangle its fs/wasm loading.

### 🟠 Blocker 3 — MEDIUM: function timeout & runtime for `/api/ingest`
Ingest does GitHub tree+blob fetch (up to `MAX_FILES=400`), tree-sitter parsing, and optional OpenAI
enrichment in one request. That can exceed Vercel's default function duration, and it **must** run on the
Node.js runtime (needs `fs`, wasm, `openai`) — never Edge. Fix: pin `runtime = "nodejs"` and raise
`maxDuration` on the ingest route.

### 🟡 Blocker 4 — LOW: environment variables
`GITHUB_TOKEN` (raises GitHub rate limit 60→5000/hr — important once judges hammer the demo) and
`OPENAI_API_KEY` (enables enrichment) are read at runtime. Plus the new store credentials. All must be set
in the Vercel project. None are committed (good).

### 🟡 Blocker 5 — LOW: Vercel project root directory
The Next.js app lives in the **`Cascade/` subdirectory** (it has its own git repo per the README), not at
the outer repo root. Vercel's "Root Directory" must point at `Cascade/` or the build won't find the app.

### ✅ Non-issues (verified)
- API routes already render dynamically (`ƒ` in build output) — no static-cache staleness.
- `graphs/` is gitignored — no stale local data ships.
- `serverExternalPackages: ["graphology"]` already set — extend it, don't replace it.

---

## Architecture Decisions
- **Swap the store, don't touch callers.** Add `lib/kg/graph/store.redis.ts` implementing `GraphStore`
  via `@upstash/redis`; select it in `store.ts` when its env vars exist, else fall back to `fileStore`
  for local dev. Pipeline, API routes, and UI are untouched.
- **Recommended backend: Upstash Redis (Vercel KV).** Pure key→JSON match; HTTP SDK is serverless-safe
  (no connection pooling). Alternative kept open: Vercel Blob (only if a graph JSON exceeds KV limits).
- **Keep `fileStore` as the local-dev default** so `npm run dev` needs no cloud account.
- **Fix bundling in `next.config.ts`** with `outputFileTracingIncludes` + extended `serverExternalPackages`
  — no change to `treesitter.ts` logic (its `process.cwd()` paths resolve correctly once files are traced).

---

## Task List

### Phase 1: Persistence — sort the database constraint (the critical path)

**Task 1 — Implement a shared `GraphStore` (Upstash Redis) + env-based selection**
- **Description:** Add a Redis-backed store implementing `save`/`load`/`exists` over `@upstash/redis`,
  and make `store.ts` choose it when `KV_REST_API_URL`/`KV_REST_API_TOKEN` (or `UPSTASH_REDIS_*`) are
  present, otherwise keep `fileStore`. JSON-serialize the `ArtifactGraph` as the value, key `cascade:graph:{repoId}`.
- **Acceptance criteria:**
  - [ ] `npm i @upstash/redis` added to dependencies.
  - [ ] `lib/kg/graph/store.redis.ts` exports a `GraphStore` (`redisStore`).
  - [ ] `store.ts` exports `store = redisStore` when env present, else `fileStore` (logged once at startup).
  - [ ] No changes to `pipeline.ts` or any `app/api/*` route.
- **Verification:**
  - [ ] `npm run typecheck` clean.
  - [ ] With Upstash env vars in `.env.local`, `npm run dev`, analyze a repo, then confirm
        `/api/buckets`, `/api/graph`, `/api/node/[id]` all return data (proves cross-request reads work
        against the shared store).
  - [ ] Without the env vars, local dev still uses `fileStore` (125 tests still green, no cloud needed).
- **Dependencies:** None
- **Files:** `lib/kg/graph/store.redis.ts` (new), `lib/kg/graph/store.ts`, `package.json`
- **Scope:** S

### Checkpoint A: persistence works across separate requests locally against Upstash; tests green; typecheck clean

### Phase 2: Make the serverless build correct (tree-sitter survives bundling)

**Task 2 — Force-include tree-sitter wasm + pin ingest runtime/timeout**
- **Description:** Update `next.config.ts` to trace the wasm files into the function bundle and keep
  `web-tree-sitter` external; pin the ingest route to Node runtime with a raised `maxDuration`.
- **Acceptance criteria:**
  - [ ] `next.config.ts`: `outputFileTracingIncludes` maps `/api/ingest` →
        `["./node_modules/tree-sitter-wasms/out/*.wasm", "./node_modules/web-tree-sitter/tree-sitter.wasm"]`.
  - [ ] `serverExternalPackages` includes `"web-tree-sitter"` (alongside existing `"graphology"`).
  - [ ] `app/api/ingest/route.ts` exports `runtime = "nodejs"` and `maxDuration = 60`.
- **Verification:**
  - [ ] `npm run build` clean.
  - [ ] On a Vercel **preview** deploy, ingest a TypeScript repo and confirm the resulting graph has
        **edges > 0** (proves the parser loaded its wasm — the headline regression guard from `fix.md`).
- **Dependencies:** Task 1 (need a deployable persistence layer to test end-to-end)
- **Files:** `next.config.ts`, `app/api/ingest/route.ts`
- **Scope:** S

### Checkpoint B: preview deploy ingests a repo and produces a non-empty graph with edges

### Phase 3: Vercel project configuration & launch

**Task 3 — Configure the Vercel project (root dir + env vars)**
- **Description:** Create/link the Vercel project pointing at the `Cascade/` subdirectory and set all
  runtime env vars (store creds + optional GitHub/OpenAI). Provision Upstash via the Vercel Marketplace
  integration so `KV_REST_API_*` are injected automatically.
- **Acceptance criteria:**
  - [ ] Vercel project **Root Directory = `Cascade`**.
  - [ ] Upstash Redis (Vercel KV) integration added → `KV_REST_API_URL` + `KV_REST_API_TOKEN` present in
        Production & Preview.
  - [ ] `GITHUB_TOKEN` set (Production & Preview) to avoid rate-limit failures under demo load.
  - [ ] `OPENAI_API_KEY` set if enrichment is wanted (otherwise pipeline skips it gracefully).
  - [ ] `.env.example` updated to document the new store vars.
- **Verification:**
  - [ ] Vercel build succeeds from a clean checkout.
- **Dependencies:** Tasks 1, 2
- **Files:** Vercel dashboard settings; `.env.example`
- **Scope:** S

**Task 4 — Production deploy + smoke test**
- **Description:** Promote to production and verify the full user flow against the live URL.
- **Acceptance criteria:**
  - [ ] Hero loads; analyzing a public repo transitions to the dashboard.
  - [ ] Bucket tiles show non-zero counts; drilling into a bucket lists artifacts; node detail opens.
  - [ ] Graph view renders with nodes **and edges**.
  - [ ] A second browser/incognito session can analyze a different repo (confirms no per-instance state).
- **Verification:**
  - [ ] Manual smoke test of the four flows above on the production URL.
  - [ ] Check Vercel function logs for the startup line confirming the Redis store is active (not fileStore).
- **Dependencies:** Task 3
- **Files:** none (deploy/ops)
- **Scope:** S

### Checkpoint C (Complete): production URL runs the full flow end-to-end with edges; persistence is instance-independent

---

## Risks and Mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Large graph JSON exceeds Upstash value/request size on free tier | Med | We cap `MAX_FILES=400`; typical JSON < 1MB. If exceeded, swap `redisStore`→ Vercel Blob (`@vercel/blob`) behind the same `GraphStore` interface — no caller changes. |
| wasm still missing after tracing (glob not picked up) | Med | Verify on a preview deploy (Checkpoint B) before production; if it fails, add an explicit per-file list or copy wasm to `public/` and load from there. |
| Ingest exceeds `maxDuration` on a huge repo + LLM enrichment | Med | `maxDuration=60`; enrichment already degrades gracefully — can disable it for the demo by leaving `OPENAI_API_KEY` unset. |
| GitHub rate limit (60/hr unauthenticated) trips under judge traffic | Med | Set `GITHUB_TOKEN` in Vercel env (Task 3). |
| Wrong Vercel root directory → build can't find app | Low | Explicit Root Directory = `Cascade` (Task 3). |

## Open Question (one decision for you)
- **Store backend:** plan assumes **Upstash Redis (Vercel KV)**. Confirm, or choose **Vercel Blob**
  (better for very large graphs) or **Vercel/Neon Postgres** (if you want a real DB for future Cascade
  parts). The `GraphStore` interface makes all three a one-file change — only Task 1's implementation differs.
