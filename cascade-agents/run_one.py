#!/usr/bin/env python
"""Single-agent runner — Facilitator with live knowledge-graph digest.

Useful for quickly smoke-testing the Facilitator in isolation. @mention it in a
Band room with a requirements change or failing test to verify it routes correctly.

Usage:
    cd cascade-agents
    uv run python run_one.py

Reads CASCADE_API_BASE + CASCADE_REPO_ID from .env to fetch and inject the
knowledge graph digest. Press Ctrl+C to stop.
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
logger = logging.getLogger("cascade.run_one")

CONFIG_PATH = Path(__file__).parent / "agent_config.yaml"
MODEL = os.getenv("CASCADE_FACILITATOR_MODEL", os.getenv("CASCADE_AGENT_MODEL", "gpt-4o-mini"))
CASCADE_API_BASE = os.getenv("CASCADE_API_BASE", "").rstrip("/")
CASCADE_REPO_ID = os.getenv("CASCADE_REPO_ID", "")


async def main() -> None:
    from cascade_agents.agents import make_facilitator
    from cascade_agents.graph_digest import fetch_graph, build_digest

    digest = ""
    if CASCADE_API_BASE and CASCADE_REPO_ID:
        logger.info("Fetching KG digest for '%s' from %s ...", CASCADE_REPO_ID, CASCADE_API_BASE)
        graph = await fetch_graph(CASCADE_REPO_ID, base_url=CASCADE_API_BASE)
        digest = build_digest(graph)
        logger.info(
            "Digest ready: %d chars | %d nodes | %d edges",
            len(digest),
            len(graph.get("nodes", [])),
            len(graph.get("edges", [])),
        )
    else:
        logger.warning("CASCADE_API_BASE or CASCADE_REPO_ID not set — starting without digest")

    logger.info("Starting Facilitator (model=%s) ...", MODEL)
    agent = make_facilitator(kg_digest=digest, model=MODEL, config_path=CONFIG_PATH)

    logger.info(
        "\n"
        "  +---------------------------------------------------------+\n"
        "  |  Facilitator connecting to band.ai...                   |\n"
        "  |                                                         |\n"
        "  |  @mention the Facilitator with a requirements change    |\n"
        "  |  (Entry A) or a failing test (Entry B).                 |\n"
        "  |                                                         |\n"
        "  |  Press Ctrl+C to stop.                                  |\n"
        "  +---------------------------------------------------------+"
    )

    await agent.run()


if __name__ == "__main__":
    asyncio.run(main())
