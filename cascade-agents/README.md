# cascade-agents — Cascade Part 2 (ripple analysis)

band.ai multi-agent analysis service for [Cascade](../README.md). Four **CrewAI remote agents**
connect to Band chat rooms and, grounded in the Part 1 knowledge graph, collaboratively trace the
ripple effect of a requirements change or diagnose a failing test.

The service is **repo-agnostic**: context (the scoped KG digest) is resolved per-room when the
seed message arrives, so one running process serves many rooms simultaneously.

## Agents

| Agent | Role | Entry point |
|---|---|---|
| **@Orchestrator** | Creates rooms and posts the seed message on behalf of the Next.js app. Never reasons; never @mentioned back. Exists because Band's Human API is Enterprise-only. | Called by `POST /api/ripple` and `seed_room.py` |
| **@Facilitator** | Sole user-facing entry point. Classifies the request, routes to one specialist, and synthesises one conclusion for the user. One action per activation; surfaces follow-ups as questions, never acts on them unilaterally. | @mention to start |
| **@Ripple Analyst** | Entry A. Traces the ripple effect of a requirements or spec change through the KG. Reports once to whoever tasked it; never summons other agents. | Facilitator routes, or direct @mention |
| **@Test Debugger** | Entry B. Diagnoses failing tests by reading actual source code, using the KG as a navigation index. Reports once to whoever tasked it; never summons other agents. | Facilitator routes, or direct @mention |

## Prerequisites

- **Python 3.12** (`uv` will fetch it via `.python-version` if needed).
- [`uv`](https://docs.astral.sh/uv/) — `pip install uv` or the official install script.
- A Band account with **4 registered External Agents** (Agents → New Agent → External).
  Rename them in the Band UI to: `Orchestrator`, `Facilitator`, `Ripple Analyst`, `Test Debugger`.
- An `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY` for Anthropic models).
- The Cascade Next.js app deployed (or running locally at `http://localhost:3000`).

## Setup

```bash
uv sync                                        # creates .venv (Python 3.12) and installs deps
uv run python verify_setup.py                  # smoke test: confirm imports resolve

cp .env.example .env                           # fill in OPENAI_API_KEY + CASCADE_API_BASE
cp agent_config.example.yaml agent_config.yaml # fill in each agent's id + api_key
```

## Running locally

```bash
uv run python -m cascade_agents.main
```

To seed a room from the CLI (bypassing the Next.js UI):

```bash
uv run python -m cascade_agents.seed_room <repoId> "<change request>"
# e.g.:
uv run python -m cascade_agents.seed_room docker-getting-started-todo-app "add pagination to getItems"
```

To inspect the KG digest in isolation:

```bash
uv run python -m cascade_agents.graph_digest <repoId>
```

## Running with Docker

```bash
cp .env.example .env               # fill in OPENAI_API_KEY + CASCADE_API_BASE + models
# agent_config.yaml is mounted as a volume — no bake into image
docker compose up --build
```

Health endpoint: `http://localhost:10000/healthz` → `{"status":"ok"}`

## Deploying to Render

1. **New Web Service** → connect `RatanRavichandran/Cascade` repo
2. Set **Root Directory** to `cascade-agents`
3. Set **Language** to `Docker`, **Dockerfile Path** to `Dockerfile`
4. **Instance Type**: Free (kept awake by `.github/workflows/keep-alive.yml`)
5. **Environment variables**: `OPENAI_API_KEY`, `CASCADE_API_BASE`, `CASCADE_FACILITATOR_MODEL`, `CASCADE_SPECIALIST_MODEL`
6. **Secret File**: filename `agent_config.yaml`, paste contents → stored at `/etc/secrets/agent_config.yaml`
7. **Health Check Path**: `/healthz`

The service auto-detects `/etc/secrets/agent_config.yaml` on Render and falls back to
`/app/agent_config.yaml` for local/Docker runs.

## Architecture

```
POST /api/ripple (Next.js)
  └─ Orchestrator agent (Band Agent API)
       └─ creates room + adds participants + posts seed:
          "@Facilitator <request> [repoId:<id>]"

@Facilitator activation:
  RepoInjectionPreprocessor
    ├─ parses [repoId:...] → associates room_id → repoId in shared RepoContextResolver
    ├─ fetches/builds Facilitator comprehension briefing (LLM, disk-cached)
    └─ prepends briefing to activating message
  CrewAI agent runs → classifies request → routes to specialist

@Ripple Analyst / @Test Debugger activation:
  RepoInjectionPreprocessor
    ├─ looks up room_id → repoId from shared RepoContextResolver (populated by Facilitator)
    ├─ builds role-scoped KG digest (deterministic, edge-type filtered)
    └─ prepends digest to activating message
  CrewAI agent runs → analyses → calls band_send_message → reports to Facilitator
```

**Key design decisions:**
- `RepoContextResolver._room_repo_id` is shared across all preprocessors — the Facilitator
  populates it on the seed message; specialists read it on their first activation.
- `band_send_message` is the **only** output channel. Plain CrewAI "Final Answer:" text is
  swallowed by the SDK and never delivered. Agents must call the tool explicitly.
- `max_iter=20` in `CrewAIAdapter` — complex analysis tasks (find seeds → trace edges → write
  report) need headroom before `force_final_answer` is triggered.

## Layout

```
cascade-agents/
├── Dockerfile                   # python:3.12-slim + uv; HEALTHCHECK on /healthz
├── docker-compose.yml           # local dev: env passthrough + agent_config.yaml volume
├── .dockerignore                # excludes .venv, secrets, dev scripts
├── pyproject.toml               # deps: band-sdk[crewai], httpx, pyyaml, python-dotenv
├── .python-version              # 3.12
├── .env.example                 # template: models, OPENAI_API_KEY, CASCADE_API_BASE
├── agent_config.example.yaml    # template for Band credentials (copy → agent_config.yaml)
├── verify_setup.py              # import smoke test
├── run_one.py                   # single-turn test: run Facilitator against one prompt
├── bootstrap.py                 # pre-builds comprehension + digest caches without starting agents
└── src/cascade_agents/
    ├── __init__.py
    ├── main.py                  # entry point: shared resolver + 3 agents + health server
    ├── agents.py                # agent factory functions + _PLATFORM_RULES
    ├── repo_context.py          # RepoContextResolver (shared room→repo cache + digest cache)
    │                            # RepoInjectionPreprocessor (per-agent, reads shared resolver)
    ├── comprehension.py         # LLM comprehension pass → disk-cached KG briefing (Facilitator)
    ├── graph_digest.py          # fetch_graph() + build_scoped_digest() (role-scoped digests)
    ├── loop_guard.py            # LoopGuardPreprocessor: ack filter + per-room turn cap
    ├── health.py                # asyncio HTTP /healthz server (Render keep-alive)
    └── seed_room.py             # CLI: create room + add agents + post seed message
```

## How a session works

```
User (in Cascade dashboard):
  → selects analyzed repo + types change request → clicks Launch
  → POST /api/ripple → Orchestrator creates Band room + seeds @Facilitator

@Facilitator (Entry A — requirements change):
  → classifies → routes to @Ripple Analyst
  → "Report your findings to me (@Facilitator) when done"

@Ripple Analyst:
  → receives KG digest (injected by preprocessor)
  → traces seed artifacts → dependency/route edges → affected tests
  → calls band_send_message to @Facilitator with structured report

@Facilitator:
  → synthesises findings → calls band_send_message to user
  → "Analysis Complete: [findings] [recommended actions] [optional follow-up question]"
  → stops and waits for human

User: "yes, check the tests" ← NEW request; human decides scope
→ @Facilitator routes to @Test Debugger …
```

Human-in-the-loop by design: the system answers exactly what was asked, then stops.
Specialists can also be @mentioned directly, bypassing the Facilitator.
