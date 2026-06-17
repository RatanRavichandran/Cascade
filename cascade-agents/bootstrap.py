#!/usr/bin/env python
"""
Cascade Phase 2 — bootstrap all 3 agents.

Fetches the Phase 1 knowledge graph, builds role-scoped digests, and starts all
3 agents concurrently on band.ai. Prefer using `main.py` in production; this
script is useful for quick local testing with an explicit repo ID.

Usage:
    uv run python bootstrap.py --repo-id <owner-repo>

Prerequisites:
    1. Copy agent_config.example.yaml → agent_config.yaml and fill in each
       agent's Band credentials (agent_id + api_key from the Band dashboard).
    2. Copy .env.example → .env and fill in OPENAI_API_KEY + CASCADE_API_BASE.

Once running, go to the Band chat room and @mention @Facilitator with a
requirements change or failing test to start the analysis.
"""

from __future__ import annotations

import asyncio
import argparse
import logging
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)-28s  %(levelname)s  %(message)s",
)
logger = logging.getLogger("cascade.bootstrap")

_DEFAULT_MODEL = os.getenv("CASCADE_AGENT_MODEL", "gpt-4o-mini")
FACILITATOR_MODEL = os.getenv("CASCADE_FACILITATOR_MODEL", _DEFAULT_MODEL)
SPECIALIST_MODEL = os.getenv("CASCADE_SPECIALIST_MODEL", _DEFAULT_MODEL)
CASCADE_API_BASE = os.getenv("CASCADE_API_BASE", "https://your-app.vercel.app").rstrip("/")
CONFIG_PATH = Path(__file__).parent / "agent_config.yaml"


async def main() -> None:
    parser = argparse.ArgumentParser(description="Start Cascade Phase 2 agents")
    parser.add_argument(
        "--repo-id",
        required=True,
        help="Repository ID to analyze, e.g. docker-getting-started-todo-app",
    )
    args = parser.parse_args()

    from cascade_agents.graph_digest import fetch_graph, build_scoped_digest
    from cascade_agents.comprehension import build_comprehension
    from cascade_agents.agents import make_facilitator, make_ripple_analyst, make_test_debugger

    logger.info("Fetching knowledge graph for '%s' from %s", args.repo_id, CASCADE_API_BASE)
    graph = await fetch_graph(args.repo_id, base_url=CASCADE_API_BASE)
    logger.info(
        "Graph ready: %d nodes | %d edges",
        len(graph.get("nodes", [])),
        len(graph.get("edges", [])),
    )

    facilitator_digest = await build_comprehension(
        graph, model=FACILITATOR_MODEL, repo_id=args.repo_id
    )
    ripple_digest = build_scoped_digest(
        graph,
        edge_types={"imports", "depends_on", "defines_route", "implements_route",
                    "references_external_spec", "affects"},
    )
    debugger_digest = build_scoped_digest(graph, edge_types={"tests", "imports"})

    logger.info(
        "Digests: facilitator=%d | ripple=%d | debugger=%d chars",
        len(facilitator_digest), len(ripple_digest), len(debugger_digest),
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

    logger.info(
        "\n"
        "  ┌─────────────────────────────────────────────────────────────┐\n"
        "  │  Cascade agents connecting to band.ai…                      │\n"
        "  │                                                              │\n"
        "  │  @mention @Facilitator with a requirements change (Entry A)  │\n"
        "  │  or a failing test (Entry B) to begin.                       │\n"
        "  │                                                              │\n"
        "  │  Press Ctrl+C to stop all agents.                            │\n"
        "  └─────────────────────────────────────────────────────────────┘"
    )

    await asyncio.gather(
        facilitator.run(),
        ripple_analyst.run(),
        test_debugger.run(),
    )


if __name__ == "__main__":
    asyncio.run(main())
