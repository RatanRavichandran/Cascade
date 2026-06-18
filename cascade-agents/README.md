# cascade-agents — Cascade Phase 2 (ripple analysis)

band.ai multi-agent analysis system for [Cascade](../../docs/phase-2-plan.md). Three **CrewAI remote
agents** connect to a Band chat room and, grounded in the Phase 1 knowledge graph, collaboratively
diagnose the impact of requirements changes and test failures.

This service lives inside the Cascade Next.js app folder (`../`) and runs as a **separate Python
process** — it does not deploy to Vercel (Band agents are long-running WebSocket processes). See
[../../docs/phase-2-plan.md](../../docs/phase-2-plan.md) for the design.

## Agents

| Agent | Role | Entry point |
|---|---|---|
| **@Facilitator** | Sole user-facing entry point. Classifies the request and does **one action per activation**: route to the one owning specialist, or conclude to the user and stop. Surfaces follow-ups as a question for the human — never escalates on its own. Reads a cached KG comprehension briefing; never analyzes itself. | Always — @mention to start |
| **@Ripple Analyst** | Entry A. Traces ripple effects of a requirements or spec change through the KG. Reports once to whoever tasked it; never summons other agents. Replies to Facilitator (or user if directly @mentioned). | Facilitator routes, or direct @mention |
| **@Test Debugger** | Entry B. Diagnoses failing tests by reading actual source code, using the KG as a navigation index. Reports once to whoever tasked it; never summons other agents. Replies to Facilitator (or user if directly @mentioned). | Facilitator routes, or direct @mention |

## Prerequisites

- **Python 3.12** (system 3.14 is too new for CrewAI; `uv` will fetch 3.12 from `.python-version`).
- [`uv`](https://docs.astral.sh/uv/).
- A Band account with **3 registered External Agents** (Agents → New Agent → External).
  Rename each in the Band UI to: `Facilitator`, `Ripple Analyst`, `Test Debugger`.
- An `OPENAI_API_KEY`.

## Setup

```bash
uv sync                              # creates the venv (Python 3.12) and installs deps
uv run python verify_setup.py        # smoke test: confirm imports resolve

cp .env.example .env                 # fill in OPENAI_API_KEY, CASCADE_FACILITATOR_MODEL, CASCADE_API_BASE, CASCADE_REPO_ID
cp agent_config.example.yaml agent_config.yaml   # fill in each agent's id + api_key
```

> **Install note:** the PyPI package is **`band-sdk`** (`uv add "band-sdk[crewai]"`), and the import
> name is **`band`** (`from band import Agent`). ⚠️ The published band.ai docs still show the old
> `thenvoi` name and a `CrewAIAdapter` class — both are out of date for band-sdk 1.0.0. Verified API:
> `Agent.create(adapter, agent_id, api_key, ws_url=..., rest_url=...)`; `ws_url`/`rest_url` default to
> `app.band.ai`. The CrewAI integration lives under `band.integrations.crewai`.

## Running

```bash
uv run python -m cascade_agents.main
```

To test the KG digest in isolation:

```bash
uv run python -m cascade_agents.graph_digest <repoId>
```

## Layout

```
cascade-agents/
├── pyproject.toml                   # deps: band-sdk[crewai], httpx, pyyaml, python-dotenv
├── .python-version                  # 3.12
├── .env.example                     # model vars, OPENAI_API_KEY, Cascade app URL, repo ID
├── agent_config.example.yaml        # per-agent Band credentials (copy → agent_config.yaml, gitignored)
├── verify_setup.py                  # import smoke test
├── run_one.py                       # single-turn test: run Facilitator against one prompt
├── bootstrap.py                     # pre-builds comprehension + digest caches without starting agents
└── src/cascade_agents/
    ├── __init__.py
    ├── agents.py                    # Facilitator, Ripple Analyst, Test Debugger definitions
    ├── comprehension.py             # one-time LLM comprehension pass → cached KG briefing
    ├── graph_digest.py              # KG fetching + digest builders (full + role-scoped)
    ├── loop_guard.py                # pre-LLM ack filter + agent-turn cap
    ├── health.py                    # HTTP /healthz for Render keep-alive
    └── main.py                      # entry point — wires everything together
```

## How a session works

```
User: @Facilitator "The /items endpoint spec changed — GET now returns paginated results"

@Facilitator classifies → Entry A (requirements change)
             routes    → @Ripple Analyst   (one action: route, then wait)

@Ripple Analyst traces KG → impacted modules + affected tests (coverage info)
               reports    → @Facilitator   (once; never summons other agents)

@Facilitator concludes → replies to USER only: findings + recommended actions,
                         plus any follow-up as a QUESTION ("want me to check the
                         affected tests?") → then STOPS and waits for the human.

User: "yes, check the tests"   ← a NEW request; the human decides scope
@Facilitator → routes to @Test Debugger …
```

Human-in-the-loop by design: the system answers exactly what was asked, then stops.
It never expands scope or escalates on its own — follow-ups are always the human's call.
Specialists can also be @mentioned directly by the user, bypassing the Facilitator —
in that case they reply directly to the user.
