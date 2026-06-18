"""Cascade Phase 3 — production entry point.

Starts all 3 band.ai agents concurrently (repo-agnostic; context injected per-room)
plus a tiny HTTP health server for Render keep-alive.

Usage:
    uv run python -m cascade_agents.main

Required env vars (set in .env or container env):
    CASCADE_API_BASE          - URL of the deployed Cascade Next.js app
    CASCADE_FACILITATOR_MODEL - model for Facilitator (default: gpt-5-mini)
    CASCADE_SPECIALIST_MODEL  - model for Ripple Analyst and Test Debugger (default: gpt-5-mini)
    CASCADE_AGENT_MODEL       - fallback if per-role vars are unset (default: gpt-5-mini)
    PORT                      - health server port (default: 10000, Render sets this)

Optional env vars:
    CASCADE_REPO_ID           - legacy single-repo shortcut: pre-warms the context cache at
                                startup so the first message to that repo skips the fetch +
                                comprehension cost. Not required — context is resolved lazily
                                per-room when a [repoId:...] seed tag arrives (T2 / AD1).
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
    from cascade_agents.agents import make_facilitator, make_ripple_analyst, make_test_debugger
    from cascade_agents.health import start_health_server
    from cascade_agents.repo_context import RepoContextResolver

    if not CASCADE_API_BASE:
        logger.error("CASCADE_API_BASE must be set in .env")
        return

    logger.info("Models: facilitator=%s | specialists=%s", FACILITATOR_MODEL, SPECIALIST_MODEL)

    # Repo context is resolved lazily per-room when the first [repoId:...] seed tag
    # arrives (T2 / AD1). A single resolver is shared across all three agents.
    resolver = RepoContextResolver(
        api_base=CASCADE_API_BASE,
        facilitator_model=FACILITATOR_MODEL,
    )

    # Legacy pre-warm: if CASCADE_REPO_ID is set, warm the cache at startup so the
    # first message to that repo pays no extra fetch + comprehension cost.
    if CASCADE_REPO_ID:
        logger.info("Pre-warming context cache for '%s' …", CASCADE_REPO_ID)
        try:
            await resolver.resolve(CASCADE_REPO_ID)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Pre-warm failed for '%s': %r — continuing without cache", CASCADE_REPO_ID, exc)

    facilitator = make_facilitator(
        resolver=resolver, model=FACILITATOR_MODEL, config_path=CONFIG_PATH
    )
    ripple_analyst = make_ripple_analyst(
        resolver=resolver, model=SPECIALIST_MODEL, config_path=CONFIG_PATH
    )
    test_debugger = make_test_debugger(
        resolver=resolver, model=SPECIALIST_MODEL, config_path=CONFIG_PATH
    )

    health_server = await start_health_server(PORT)

    logger.info(
        "\n"
        "  +----------------------------------------------------------+\n"
        "  |  Cascade Phase 3 agents live on band.ai (repo-agnostic)  |\n"
        "  |                                                           |\n"
        "  |  @Facilitator    - entry point, routes and synthesises   |\n"
        "  |  @Ripple Analyst - Entry A: requirements change impact   |\n"
        "  |  @Test Debugger  - Entry B: failing test root-cause      |\n"
        "  |                                                           |\n"
        "  |  Context resolved per-room from [repoId:...] seed tag    |\n"
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
