"""Pre-LLM loop guard for the Cascade band.ai agents.

Subclasses DefaultPreprocessor to drop agent-to-agent messages that would
cause or extend a loop — before any LLM call is made. Two guards:

1. Ack-pattern filter: drop short agent messages that match known filler phrases
   ("please hold on", "proceeding", "I have received", etc.).
2. Per-room agent-turn cap: once an agent has processed N agent-sourced messages
   since the last user message, further agent messages are dropped. Resets when
   the next user message arrives.

Both guards log at INFO level so drops are visible in the CLI logs.
User messages are never dropped.
"""

from __future__ import annotations

import logging
import re

from band.core.types import AgentInput
from band.platform.event import PlatformEvent
from band.preprocessing.default import DefaultPreprocessor
from band.runtime.execution import ExecutionContext

logger = logging.getLogger(__name__)

# Matches filler/ack phrases common in the looping transcripts.
# Only applied to short messages (< 400 chars) to avoid false positives.
_ACK_RE = re.compile(
    r"\b("
    r"please hold on|hold on while|stand by|"
    r"i have received|i('ve| have) (received|noted|acknowledged)|"
    r"proceeding with|i am (analyzing|processing|compiling|working on|tracing)|"
    r"i will (analyze|compile|check|identify|gather|look|investigate|update|now)|"
    r"let me (check|look|trace|analyze|identify|compile|gather)|"
    r"working on (it|the|this)|one moment|"
    r"delegated the|sent out requests for"
    r")\b",
    re.IGNORECASE,
)

# Max agent-sourced messages an agent will process per user-message cycle.
# The intended flow per user request is short and one-directional:
#   Facilitator routes -> specialist reports -> Facilitator concludes (stops).
# There is no autonomous cross-talk or escalation, so 4 is ample headroom while
# acting as a hard backstop: if anything starts ping-ponging, it is capped fast.
_MAX_AGENT_TURNS_PER_CYCLE = 4


class LoopGuardPreprocessor(DefaultPreprocessor):
    """Drop agent acks and enforce a per-room agent-turn cap before the LLM runs."""

    def __init__(self) -> None:
        super().__init__()
        # Tracks how many agent-sourced messages this agent has processed in the
        # current "cycle" (since the last user message) for each room.
        self._agent_turns: dict[str, int] = {}

    async def process(
        self,
        ctx: ExecutionContext,
        event: PlatformEvent,
        agent_id: str,
    ) -> AgentInput | None:
        inp = await super().process(ctx, event, agent_id)
        if inp is None:
            return None

        msg = inp.msg

        # User messages always pass through and reset the cycle counter.
        if msg.sender_type != "Agent":
            self._agent_turns[inp.room_id] = 0
            return inp

        # --- Agent-sourced message guards ---

        # Guard 1: turn cap
        turns = self._agent_turns.get(inp.room_id, 0)
        if turns >= _MAX_AGENT_TURNS_PER_CYCLE:
            logger.info(
                "LoopGuard[%s] drop — turn cap (%d) reached in room %s (from %s)",
                ctx.agent_name if hasattr(ctx, "agent_name") else agent_id[:8],
                _MAX_AGENT_TURNS_PER_CYCLE,
                inp.room_id,
                msg.sender_name or msg.sender_id[:8],
            )
            return None

        # Guard 2: ack-pattern filter (only for short messages)
        content = msg.content.strip()
        if len(content) < 400 and _ACK_RE.search(content):
            logger.info(
                "LoopGuard[%s] drop — ack pattern matched in room %s (from %s): %.80r",
                ctx.agent_name if hasattr(ctx, "agent_name") else agent_id[:8],
                inp.room_id,
                msg.sender_name or msg.sender_id[:8],
                content,
            )
            return None

        self._agent_turns[inp.room_id] = turns + 1
        return inp
