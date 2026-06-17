"""One-time LLM comprehension pass over the knowledge graph (for the Facilitator).

The Facilitator benefits from genuinely understanding the whole repository, but we
do NOT want to re-ship the full node/edge digest on every turn. So:

- **analyze** : at startup, one LLM call reads the FULL graph digest and distills it
  into a dense natural-language briefing — the Facilitator's retained "mental model".
- **cache**   : the briefing is written to `.cache/comprehension_<repoId>_<hash>.md`,
  keyed by a fingerprint of the graph. Recomputed only when the graph changes.
- **retain**  : on restart with an unchanged graph, the cached briefing is reused
  (no LLM call, instant startup).
- **cheap per-turn** : the briefing is far smaller than the raw graph, and being a
  stable system-prompt prefix it benefits from the model provider's automatic prompt
  caching — so the Facilitator "understands" the graph without paying full freight
  on every message.

If the LLM pass fails (no client, API error, etc.), we fall back to the full raw
digest so the Facilitator still has graph access.
"""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path

from cascade_agents.graph_digest import build_digest

logger = logging.getLogger(__name__)

# .cache lives at the cascade-agents/ root (two levels above this file).
_CACHE_DIR = Path(__file__).resolve().parents[2] / ".cache"

_COMPREHENSION_PROMPT = """You are reading the complete knowledge graph of a software \
repository. Produce a dense, factual briefing for a FACILITATOR agent who will use it to:
  1. CLASSIFY incoming requests as either a requirements/spec change or a failing-test report.
  2. ROUTE work to the right specialist (a Ripple Analyst or a Test Debugger).
  3. SYNTHESIZE specialist findings into a conclusion for the user.

The Facilitator never edits code and never traces edges itself — so do NOT just dump the
node/edge list back. Instead, explain what this repository IS and how it is shaped, grounded
ONLY in the graph below (do not invent anything not present).

Write the briefing with these sections (use markdown headings):

## What this repository is
One short paragraph: the app's apparent purpose and tech stack, inferred from the nodes.

## Major areas & responsibilities
The main modules/directories and what each is responsible for. Group related nodes.

## API surface
Routes / endpoints and the files that define and implement them, if present.

## Data model
Key data entities/schemas and where they live, if present.

## Test layout & coverage hotspots
Where the tests are, what they cover, and which important areas appear to have NO tests
(coverage gaps) — this is critical for routing test-failure questions.

## Dependency hotspots
The most-connected files (high fan-in / fan-out) — changing these has the widest ripple.

## Routing hints
2-4 bullets: given the above, what kinds of requests should go to the Ripple Analyst vs the
Test Debugger, and which areas are likely to involve BOTH (spec change that breaks tests).

Keep it tight and information-dense. Prefer concrete file/module names from the graph over
generic prose. Target ~400-700 words.

----- KNOWLEDGE GRAPH DIGEST -----
{digest}
"""


def _fingerprint(graph: dict) -> str:
    """Stable short hash of the graph's structural content (nodes + edges)."""
    skeleton = {
        "nodes": sorted(n.get("id", "") for n in graph.get("nodes", [])),
        "edges": sorted(
            f"{e.get('from','')}->{e.get('to','')}:{e.get('type','')}"
            for e in graph.get("edges", [])
        ),
    }
    raw = json.dumps(skeleton, sort_keys=True).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:12]


def _cache_path(repo_id: str, fingerprint: str) -> Path:
    safe_repo = "".join(c if c.isalnum() or c in "-_" else "_" for c in repo_id) or "repo"
    return _CACHE_DIR / f"comprehension_{safe_repo}_{fingerprint}.md"


async def build_comprehension(graph: dict, model: str, repo_id: str) -> str:
    """Return the Facilitator's repository briefing (cached, or freshly analyzed).

    Args:
        graph: Raw graph dict from fetch_graph.
        model: LLM model string (e.g. "gpt-5-mini") used for the one-time pass.
        repo_id: Used in the cache filename.

    Returns:
        A dense markdown briefing. Falls back to the full raw digest on any failure.
    """
    fp = _fingerprint(graph)
    cache_file = _cache_path(repo_id, fp)

    # 1. Cache hit — reuse retained understanding, no LLM call.
    if cache_file.exists():
        logger.info("Comprehension cache HIT: %s", cache_file.name)
        return cache_file.read_text(encoding="utf-8")

    # 2. Cache miss — analyze the full graph once.
    full_digest = build_digest(graph, max_nodes=400)
    logger.info(
        "Comprehension cache MISS (%s) — analyzing full graph with %s (one-time) ...",
        fp,
        model,
    )
    try:
        from openai import AsyncOpenAI  # already in the env (crewai dep)

        client = AsyncOpenAI()  # picks up OPENAI_API_KEY from the environment
        resp = await client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": _COMPREHENSION_PROMPT.format(digest=full_digest),
                }
            ],
        )
        briefing = (resp.choices[0].message.content or "").strip()
        if not briefing:
            raise ValueError("empty briefing returned")
    except Exception as exc:  # noqa: BLE001 - any failure falls back to raw digest
        logger.warning(
            "Comprehension pass failed (%r) — falling back to full raw digest. "
            "Facilitator still has graph access, just un-distilled.",
            exc,
        )
        return full_digest

    # 3. Cache to disk for future restarts.
    try:
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(briefing, encoding="utf-8")
        logger.info("Comprehension briefing cached: %s (%d chars)", cache_file.name, len(briefing))
    except OSError as exc:
        logger.warning("Could not write comprehension cache (%r) — continuing in-memory.", exc)

    return briefing
