# Cascade — Change Impact Analysis

> Band of Agents Hackathon submission. [Cascade](../docs/PRD.md) maps the full ripple effect of a
> change request — requirements → code → tests → CI — *before* development starts.

**How it works:** paste a public GitHub repo URL → Cascade ingests it, classifies every artifact into
10 buckets using multi-signal inference, builds a structural knowledge graph, and optionally enriches
with an LLM. Then describe a change request: a dashboard trigger creates a Band room, adds 3 AI agents
(Facilitator, Ripple Analyst, Test Debugger), and seeds them with the request. The agents trace the
ripple effect through the graph and report back directly in Band.

The light-theme dashboard shows 10 bucket tiles with drill-down, a node detail panel, an interactive
Cytoscape graph view, and a Ripple Analysis launcher (for logged-in users).

## Quick start

```bash
npm install
cp .env.example .env.local     # see Environment section below
npm run dev                    # http://localhost:3000
```

Then type `owner/repo` (e.g. `docker/getting-started-todo-app`) or a full GitHub URL and click Analyze.

## Environment

| Var | Required | Purpose |
|-----|----------|---------|
| `GITHUB_TOKEN` | No | Raises GitHub API rate limit 60 → 5,000/hr during ingestion. |
| `OPENAI_API_KEY` | No | Enables the LLM enrichment stage. Without it, you still get a complete deterministic graph. |
| `AUTH_SECRET` | No (local) / **Yes** (prod) | Signs and encrypts session JWTs. Generate with `npx auth secret`. |
| `AUTH_GITHUB_ID` | No (local) / **Yes** (prod) | GitHub OAuth App client ID. |
| `AUTH_GITHUB_SECRET` | No (local) / **Yes** (prod) | GitHub OAuth App client secret. |
| `KV_REST_API_URL` | No (local) / **Yes** (Vercel) | Upstash Redis REST URL. Auto-set by Vercel integration. |
| `KV_REST_API_TOKEN` | No (local) / **Yes** (Vercel) | Upstash Redis REST token. Auto-set by Vercel integration. |
| `BAND_ORCHESTRATOR_KEY` | No (local) / **Yes** (Vercel) | Band Orchestrator agent key — required for Ripple Analysis. |
| `BAND_FACILITATOR_ID` | No (local) / **Yes** (Vercel) | Facilitator agent UUID. |
| `BAND_RIPPLE_ANALYST_ID` | No (local) / **Yes** (Vercel) | Ripple Analyst agent UUID. |
| `BAND_TEST_DEBUGGER_ID` | No (local) / **Yes** (Vercel) | Test Debugger agent UUID. |

**Local dev without Redis** → the app writes graph JSON to `graphs/` (gitignored). Auth features
require `AUTH_*` vars; without them the app runs in anonymous-only mode.

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the dev server (http://localhost:3000). |
| `npm run build` | Production build. |
| `npm start` | Serve the production build. |
| `npm test` | Run the Vitest suite (176 tests; no network, no API key). |
| `npm run typecheck` | `tsc --noEmit` (strict). |
| `npm run lint` | `next lint`. |

## How it works

The full pipeline lives in [`lib/kg/`](lib/kg) and is the only part of the codebase that builds the
graph. Entry point: `runPipeline(repoUrl, opts?)` (exported from `@/lib/kg`).

```
ingest (GitHub tree+blobs) → scan → classify (signals) → tree-sitter parse
→ layer inference → structural edges → integrity review → [LLM enrich] → persist
```

Large-repo enrichment streams progress to the browser via SSE so the UI shows live updates
("Enriching with AI… 40 / 400 nodes") instead of stalling silently.

The graph is the source of truth; the UI is only a view of it. Graphs are stored in Upstash Redis
on Vercel (keyed by `owner-repo`), and in local JSON files during development.

## Ripple Analysis (Part 2)

Sign in with GitHub, analyze a repo, then click the **Ripple Analysis** tab. Type a change request
and click Launch — the app creates a Band room, adds the 3 agents, and seeds them with your request.
Follow the link to watch the agents collaborate in Band.

The agents run as a separate Python service (`cascade-agents/`) deployed to Render. See
[`cascade-agents/README.md`](cascade-agents/README.md) for setup and deployment instructions.

**Agent capabilities and scope:**
- **Facilitator** — classifies your request (requirements change vs. failing test), routes to the right specialist, and synthesises the final answer back to you. Does not analyze code itself.
- **Ripple Analyst** — traces a requirements/spec change through the knowledge graph: seed artifacts → dependency edges → transitive impact → affected tests. Works entirely from KG node metadata and edges.
- **Test Debugger** — diagnoses a failing test using the KG as an index: locates test nodes, traces `tests`/`imports` edges to covered modules, classifies the probable root-cause category, and proposes a fix direction. **Does not have access to raw source code** — the diagnosis is KG-inferred and will name files and likely causes, but line-level evidence requires the developer to read the source directly.

## Authentication

Sign in with GitHub to unlock:
- **My repos** — your personal history of analyzed repos, reopened without re-running the pipeline.
- **Your GitHub token** — ingests run under your OAuth token (5,000 req/hr vs. 60 unauthenticated).

Anonymous analysis always works. Auth is additive, not a gate.

## Architecture, conventions & gotchas

**`web-tree-sitter` is pinned to `0.22.6`** — do not bump it. The grammars in
`tree-sitter-wasms@0.1.13` use the old WASM ABI; newer runtimes reject them and every parse
returns `null`, producing zero graph edges. Full story in [`../docs/fix.md`](../docs/fix.md).

**`/api/ingest` is SSE, not JSON.** It returns `text/event-stream` with `data: {...}` lines.
Do not `await res.json()` on it — use `response.body.getReader()`.

**Store is env-selected at startup.** If `KV_REST_API_URL` is set, graphs go to Upstash Redis.
Otherwise they go to `graphs/*.graph.json` (local only). The `GraphStore` interface makes
switching a one-file change with no caller impact.

**Render free-tier keep-alive requires a 90-second curl timeout.** The GitHub Actions cron
(`.github/workflows/keep-alive.yml`) pings `/healthz` every 10 minutes. Render cold starts
take up to 60 seconds — if the ping's curl timeout is shorter than the cold start, the request
times out, the workflow fails, and the service stays asleep (a death spiral). The timeout is
set to 90s to give Render enough headroom.
