"""Per-room repo context resolution and injection for the Cascade band.ai agents.

T2 — Makes agents repo-agnostic:

• RepoContextResolver  — given a repoId, fetches the graph from CASCADE_API_BASE and
  returns role-scoped digests + Facilitator comprehension briefing. Results are cached
  in memory per process (keyed by repoId) and on disk via comprehension.py (keyed by
  repoId + graph fingerprint).

• RepoInjectionPreprocessor — inherits from LoopGuardPreprocessor so both preprocessors
  run in a single chain (LoopGuard first via super().process(); injection only happens if
  the message survives LoopGuard). On each surviving activation:
    1. Parses room_id → repoId from the [repoId:...] content tag on the seed message;
       caches per room so follow-up messages reuse the same repoId without re-parsing.
    2. Resolves the role-scoped digest for this repoId via RepoContextResolver (cached
       in memory; comprehension.py handles disk caching for the Facilitator pass).
    3. Prepends the role-appropriate preamble + digest to the activating message content
       using dataclasses.replace (PlatformMessage is a frozen dataclass).

Preprocessor composition order (documented per AD3 in phase-3-plan.md):
  RepoInjectionPreprocessor.process()
    └─ super().process()  ←  LoopGuardPreprocessor (ack filter + turn cap; may return None)
       └─ super().process()  ←  DefaultPreprocessor (mention-gate, sender normalisation)
  If LoopGuard returns None → skip injection, propagate None.
  Otherwise → inject digest into the surviving AgentInput and return it.
"""

from __future__ import annotations

import dataclasses
import logging
import re
from dataclasses import dataclass

from band.core.types import AgentInput
from band.platform.event import PlatformEvent
from band.runtime.execution import ExecutionContext

from cascade_agents.loop_guard import LoopGuardPreprocessor

logger = logging.getLogger(__name__)

# ── Role-scoped preambles ────────────────────────────────────────────────────
# These mirror the context_preamble strings that were formerly passed as a static
# custom_section to CrewAIAdapter. They are now injected per-message so the system
# prompt stays stable (and cache-friendly) across repos.

_FACILITATOR_PREAMBLE = (
    "\n\n## Repository understanding (pre-analyzed from the knowledge graph)\n\n"
    "You have already read and analyzed this repository's full knowledge graph. "
    "The following is your retained understanding of the codebase — its purpose, "
    "structure, API surface, data model, test layout, and dependency hotspots. "
    "Use it to classify requests, route to the right specialist, and synthesize "
    "conclusions. You do NOT have the raw node/edge list in front of you and do NOT "
    "need it — for exact node IDs or edge-level tracing, that is the specialists' job.\n\n"
)

_SPECIALIST_PREAMBLE = (
    "\n\n## Knowledge Graph (read-only snapshot)\n\n"
    "Compact digest of the repository knowledge graph. "
    "Use it to look up artifact IDs, paths, buckets, layers, and structural "
    "relationships when answering analysis questions.\n\n"
)

# ── Edge-type scopes per role ────────────────────────────────────────────────
_RIPPLE_EDGE_TYPES: frozenset[str] = frozenset({
    "imports",
    "depends_on",
    "defines_route",
    "implements_route",
    "references_external_spec",
    "affects",
})
_DEBUGGER_EDGE_TYPES: frozenset[str] = frozenset({"tests", "imports"})

# Parses [repoId:<id>] from the seed message content.
_REPO_ID_RE = re.compile(r"\[repoId:([^\]]+)\]")


# ── RepoDigests ──────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class RepoDigests:
    """Immutable container for the three role-scoped digests of a single repoId."""

    facilitator: str  # comprehension briefing (distilled via LLM; disk-cached)
    ripple: str       # scoped digest: dependency + route edges
    debugger: str     # scoped digest: test + import edges

    def for_role(self, role: str) -> str:
        """Return the digest appropriate for the given agent role key."""
        if role == "facilitator":
            return self.facilitator
        if role == "ripple_analyst":
            return self.ripple
        if role == "test_debugger":
            return self.debugger
        raise ValueError(f"Unknown role: {role!r}")

    def preamble_for_role(self, role: str) -> str:
        """Return the preamble header that introduces the digest for this role."""
        if role == "facilitator":
            return _FACILITATOR_PREAMBLE
        return _SPECIALIST_PREAMBLE


# ── RepoContextResolver ──────────────────────────────────────────────────────

class RepoContextResolver:
    """Fetch and cache role-scoped digests for any repoId.

    Two-level cache:
    - In-memory dict keyed by repoId (per process; no eviction — demo scale).
    - Disk cache inside comprehension.py, keyed by repoId + graph fingerprint
      (the comprehension LLM pass is skipped on subsequent cold-starts for the
      same graph).

    Thread/concurrency note: the Band SDK runs one asyncio event loop per process
    and agents share a single thread. No locking is needed at demo scale.
    """

    def __init__(self, api_base: str, facilitator_model: str) -> None:
        self._api_base = api_base.rstrip("/")
        self._facilitator_model = facilitator_model
        self._cache: dict[str, RepoDigests] = {}
        # Shared across all preprocessors: room_id → repoId.
        # Populated by whichever agent sees the [repoId:...] seed tag first
        # (always the Facilitator), then reused by specialists in the same room.
        self._room_repo_id: dict[str, str] = {}

    def associate_room(self, room_id: str, repo_id: str) -> None:
        """Record that room_id is analysing repo_id (called by the preprocessor on seed)."""
        self._room_repo_id[room_id] = repo_id

    def repo_for_room(self, room_id: str) -> str | None:
        """Return the repoId associated with room_id, or None if not yet seen."""
        return self._room_repo_id.get(room_id)

    async def resolve(self, repo_id: str) -> RepoDigests:
        """Return cached digests for repo_id, fetching from the graph API on a miss."""
        if repo_id in self._cache:
            logger.debug("RepoContextResolver cache HIT for '%s'", repo_id)
            return self._cache[repo_id]

        logger.info(
            "RepoContextResolver: fetching graph for '%s' from %s …",
            repo_id,
            self._api_base,
        )
        # Imported here to keep the module importable without these deps at definition time.
        from cascade_agents.graph_digest import fetch_graph, build_scoped_digest
        from cascade_agents.comprehension import build_comprehension

        graph = await fetch_graph(repo_id, base_url=self._api_base)

        # Facilitator: one-time LLM comprehension pass (disk-cached by comprehension.py).
        facilitator_digest = await build_comprehension(
            graph, model=self._facilitator_model, repo_id=repo_id
        )
        # Specialists: deterministic edge-scoped digests (no LLM).
        ripple_digest = build_scoped_digest(graph, edge_types=_RIPPLE_EDGE_TYPES)
        debugger_digest = build_scoped_digest(graph, edge_types=_DEBUGGER_EDGE_TYPES)

        digests = RepoDigests(
            facilitator=facilitator_digest,
            ripple=ripple_digest,
            debugger=debugger_digest,
        )
        self._cache[repo_id] = digests
        logger.info(
            "RepoContextResolver cached '%s': fac=%d chars | ripple=%d chars | debug=%d chars",
            repo_id,
            len(facilitator_digest),
            len(ripple_digest),
            len(debugger_digest),
        )
        return digests


# ── RepoInjectionPreprocessor ────────────────────────────────────────────────

class RepoInjectionPreprocessor(LoopGuardPreprocessor):
    """Inject the per-room repo digest into each surviving activating message.

    Inherits LoopGuardPreprocessor so the full preprocessing chain is:
      RepoInjectionPreprocessor → LoopGuardPreprocessor → DefaultPreprocessor

    Caching within this instance:
    - _room_repo_id: room_id → repoId (populated on first message with the tag;
      reused for all subsequent activations in the same room).
    - RepoDigests caching is delegated to RepoContextResolver (in-memory + disk).
    """

    def __init__(self, resolver: RepoContextResolver, role: str) -> None:
        super().__init__()
        self._resolver = resolver
        self._role = role

    async def process(
        self,
        ctx: ExecutionContext,
        event: PlatformEvent,
        agent_id: str,
    ) -> AgentInput | None:
        # LoopGuard runs first — dropped messages (None) skip injection entirely.
        inp = await super().process(ctx, event, agent_id)
        if inp is None:
            return None

        room_id = inp.room_id

        # --- Step 1: extract repoId from seed content tag (once per room) ---
        # The resolver's _room_repo_id is shared across all preprocessors, so whichever
        # agent sees the [repoId:...] seed tag first (always the Facilitator) populates
        # the mapping for every specialist that activates later in the same room.
        if not self._resolver.repo_for_room(room_id):
            m = _REPO_ID_RE.search(inp.msg.content)
            if m:
                repo_id_found = m.group(1).strip()
                self._resolver.associate_room(room_id, repo_id_found)
                logger.info(
                    "RepoInjection[%s] room %s → repoId '%s' (shared)",
                    self._role,
                    room_id,
                    repo_id_found,
                )

        repo_id = self._resolver.repo_for_room(room_id)
        if not repo_id:
            # No repoId seen for this room yet — pass the message through unchanged.
            # This can happen if the preprocessor activates on a message that arrives
            # before the seed (e.g. a spurious ping); the digest will be injected once
            # the seed arrives and caches the repoId.
            logger.warning(
                "RepoInjection[%s] room %s: no repoId cached yet — passing through uninjected",
                self._role,
                room_id,
            )
            return inp

        # --- Step 2: resolve digests (cached after first call per repoId) ---
        try:
            digests = await self._resolver.resolve(repo_id)
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "RepoInjection[%s] could not resolve digests for '%s': %r — passing through",
                self._role,
                repo_id,
                exc,
            )
            return inp

        # --- Step 3: prepend preamble + digest to the message content ---
        # PlatformMessage is frozen=True; use dataclasses.replace per T1 findings.
        preamble = digests.preamble_for_role(self._role)
        digest_block = preamble + digests.for_role(self._role)
        new_msg = dataclasses.replace(
            inp.msg,
            content=digest_block + "\n\n" + inp.msg.content,
        )
        return dataclasses.replace(inp, msg=new_msg)
