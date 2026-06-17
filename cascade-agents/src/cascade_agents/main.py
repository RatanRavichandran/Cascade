"""Cascade Phase 2 — production entry point.

Starts all 3 band.ai agents concurrently (each grounded in a role-scoped KG digest)
plus a tiny HTTP health server for Render keep-alive.

Usage:
    uv run python -m cascade_agents.main

Required env vars (set in .env or container env):
    CASCADE_API_BASE          - URL of the deployed Cascade Next.js app
    CASCADE_REPO_ID           - repo to analyze, e.g. docker-getting-started-todo-app
    CASCADE_FACILITATOR_MODEL - model for Facilitator (default: gpt-4o)
    CASCADE_SPECIALIST_MODEL  - model for Ripple Analyst and Test Debugger (default: gpt-4o-mini)
    CASCADE_AGENT_MODEL       - fallback if per-role vars are unset (default: gpt-4o-mini)
    PORT                      - health server port (default: 10000, Render sets this)
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)-28s  %(levelname)s  %(message)s",
)
# Quiet httpx's per-poll request logging — the agent SDK long-polls
# GET .../messages/next constantly, and an idle room returns 204 No Content.
# That is normal ("no new message"), not an error. Only surface real HTTP problems.
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger("cascade.main")

# agent_config.yaml lives two levels above this file: cascade-agents/agent_config.yaml
CONFIG_PATH = Path(__file__).resolve().parents[2] / "agent_config.yaml"

# Per-role models: Facilitator benefits from stronger reasoning to classify and synthesize well.
_DEFAULT_MODEL = os.getenv("CASCADE_AGENT_MODEL", "gpt-5-mini")
FACILITATOR_MODEL = os.getenv(
    "CASCADE_FACILITATOR_MODEL", os.getenv("CASCADE_AGENT_MODEL", "gpt-5-mini")
)
SPECIALIST_MODEL = os.getenv("CASCADE_SPECIALIST_MODEL", _DEFAULT_MODEL)

CASCADE_API_BASE = os.getenv("CASCADE_API_BASE", "").rstrip("/")
CASCADE_REPO_ID = os.getenv("CASCADE_REPO_ID", "")
PORT = int(os.getenv("PORT", "10000"))


async def main() -> None:
    from cascade_agents.graph_digest import fetch_graph, build_scoped_digest
    from cascade_agents.comprehension import build_comprehension
    from cascade_agents.agents import make_facilitator, make_ripple_analyst, make_test_debugger
    from cascade_agents.health import start_health_server

    if not CASCADE_API_BASE or not CASCADE_REPO_ID:
        logger.error("CASCADE_API_BASE and CASCADE_REPO_ID must both be set in .env")
        return

    # Fetch KG once; build role-scoped digests to trim per-turn token usage.
    logger.info("Fetching KG digest for '%s' from %s ...", CASCADE_REPO_ID, CASCADE_API_BASE)
    graph = await fetch_graph(CASCADE_REPO_ID, base_url=CASCADE_API_BASE)

    # Facilitator: analyze the FULL graph once into a dense briefing, cache to disk,
    # and inject that retained understanding instead of the raw node/edge dump.
    # First boot on a new graph runs one LLM pass; subsequent boots are instant.
    facilitator_digest = await build_comprehension(
        graph, model=FACILITATOR_MODEL, repo_id=CASCADE_REPO_ID
    )

    # Ripple Analyst needs dependency and API-contract edges for ripple tracing.
    ripple_digest = build_scoped_digest(
        graph,
        edge_types={
            "imports",
            "depends_on",
            "defines_route",
            "implements_route",
            "references_external_spec",
            "affects",
        },
    )

    # Test Debugger uses the KG as a navigation index only — keeps token cost low.
    # It reads actual source files for the real content.
    debugger_digest = build_scoped_digest(
        graph,
        edge_types={"tests", "imports"},
    )

    logger.info(
        "Digests ready: facilitator=%d chars | ripple=%d chars | debugger=%d chars"
        " | %d nodes | %d edges",
        len(facilitator_digest),
        len(ripple_digest),
        len(debugger_digest),
        len(graph.get("nodes", [])),
        len(graph.get("edges", [])),
    )
    logger.info("Models: facilitator=%s | specialists=%s", FACILITATOR_MODEL, SPECIALIST_MODEL)

    facilitator = make_facilitator(
        kg_digest=facilitator_digest, model=FACILITATOR_MODEL, config_path=CONFIG_PATH
    )
    ripple_analyst = make_ripple_analyst(
        kg_digest=ripple_digest, model=SPECIALIST_MODEL, config_path=CONFIG_PATH
    )
    test_debugger = make_test_debugger(
        kg_digest=debugger_digest, model=SPECIALIST_MODEL, config_path=CONFIG_PATH
    )

    health_server = await start_health_server(PORT)

    logger.info(
        "\n"
        "  +----------------------------------------------------------+\n"
        "  |  Cascade Phase 2 agents live on band.ai                  |\n"
        "  |                                                           |\n"
        "  |  @Facilitator    - entry point, routes and synthesizes   |\n"
        "  |  @Ripple Analyst - Entry A: requirements change impact   |\n"
        "  |  @Test Debugger  - Entry B: failing test root-cause      |\n"
        "  |                                                           |\n"
        "  |  Health: GET http://localhost:%s/healthz              |\n"
        "  |  Press Ctrl+C to stop.                                   |\n"
        "  +----------------------------------------------------------+",
        PORT,
    )

    async with health_server:
        await asyncio.gather(
            facilitator.run(),
            ripple_analyst.run(),
            test_debugger.run(),
        )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Stopped.")
