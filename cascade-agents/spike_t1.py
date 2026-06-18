#!/usr/bin/env python3
"""T1 Spike — Verify Band AGENT API + per-room grounding mechanism.

⚠️ Why the Agent API (not the Human API):
  The Band Human API (`/api/v1/me/*`) is ENTERPRISE-ONLY — on our Pro plan it returns
  403 `plan_required`. The Agent API (`/api/v1/agent/*`) is NOT plan-gated and does
  everything we need. We authenticate as a dedicated "Orchestrator" agent (AD7).
  See docs/t1-findings.md.

Confirms:
  1. Production Band REST host (app.band.ai, NOT platform.dev.thenvoi.com)
  2. The Orchestrator agent key authorizes room creation on Pro (no Enterprise)
  3. owner_uuid is resolvable at runtime via GET /agent/me (no hardcoded user ID)
  4. repoId travels via message metadata AND a content tag — verify which actually
     reaches the running agent's preprocessor (check logs after running)
  5. An agent added to a room at runtime receives messages there

Acceptance criteria for T1 (phase-3-plan.md):
  [x] Documented: production host + credential type (see docs/t1-findings.md)
  [x] Documented: Human-API/Enterprise blocker + Agent-API workaround
  [ ] Documented: how repoId reaches the agent (metadata vs content tag)  ← this run
  [ ] Running agent reacts to a message in a freshly created room          ← this run

Prerequisite:
  Register a 4th "Cascade Orchestrator" agent in Band (Agents → New Agent → External)
  and add it to agent_config.yaml under an `orchestrator:` key.

Usage:
  # Terminal 1 — start the reasoning agents (must be running to receive the message)
  uv run python -m cascade_agents.main

  # Terminal 2 — run this spike
  uv run python spike_t1.py <repoId> "<change request>"

  Example:
  uv run python spike_t1.py docker-getting-started-todo-app \\
      "Update getItems API to support pagination"

After running:
  1. Open the printed room URL in Band UI — confirm the Facilitator responds.
  2. Check the agent process logs for:
       metadata={'repoId': '<id>'}   ← if present: metadata IS forwarded via WS
       [repoId:<id>]                 ← always present in content (safe fallback)
  3. Update docs/t1-findings.md AC #1 (metadata vs content tag) with the result.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import yaml
from dotenv import load_dotenv

from band.client.rest import AsyncRestClient, DEFAULT_REQUEST_OPTIONS
from thenvoi_rest import (
    ChatMessageRequest,
    ChatMessageRequestMentionsItem,
    ChatRoomRequest,
    ParticipantRequest,
)

# ─── Pin to production host ────────────────────────────────────────────────────
# CRITICAL: thenvoi_rest defaults to https://platform.dev.thenvoi.com (DEV).
# band.client.rest.AsyncRestClient re-exports thenvoi_rest.AsyncRestClient and
# inherits the same wrong default. Always pass base_url explicitly for ANY REST call
# — here, in seed_room.py (T3), and in the POST /api/ripple Next.js route (T4).
BAND_REST_BASE = "https://app.band.ai"

CONFIG_PATH = Path(__file__).resolve().parent / "agent_config.yaml"


def _load_config() -> dict:
    if not CONFIG_PATH.exists():
        print(
            f"\nERROR: {CONFIG_PATH} not found\n"
            "  cp agent_config.example.yaml agent_config.yaml  and fill in agent IDs\n",
            file=sys.stderr,
        )
        sys.exit(1)
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


async def spike(repo_id: str, change_request: str) -> None:
    load_dotenv()
    cfg = _load_config()

    if "orchestrator" not in cfg:
        print(
            "\nERROR: no `orchestrator` entry in agent_config.yaml\n"
            "  Register a 4th 'Cascade Orchestrator' agent in Band (Agents → New Agent →\n"
            "  External), then add it to agent_config.yaml:\n\n"
            "    orchestrator:\n"
            "      agent_id: \"<uuid>\"\n"
            "      api_key:  \"<key>\"\n",
            file=sys.stderr,
        )
        sys.exit(1)

    orchestrator_key: str = cfg["orchestrator"]["api_key"]
    facilitator_id: str = cfg["facilitator"]["agent_id"]
    ripple_id: str = cfg["ripple_analyst"]["agent_id"]
    debugger_id: str = cfg["test_debugger"]["agent_id"]

    print(
        f"\n{'='*60}\n"
        f"T1 Spike — Band AGENT API + per-room grounding\n"
        f"  REST host  : {BAND_REST_BASE}  ← production\n"
        f"  auth as    : Orchestrator agent (Agent API, not plan-gated)\n"
        f"  repoId     : {repo_id}\n"
        f"  request    : {change_request[:60]}{'…' if len(change_request) > 60 else ''}\n"
        f"{'='*60}"
    )

    # AsyncRestClient must receive base_url explicitly — see module-level comment.
    client = AsyncRestClient(base_url=BAND_REST_BASE, api_key=orchestrator_key)

    # ── Step 0: Validate key + resolve owner user UUID ─────────────────────────
    print("\n0. GET /agent/me (validate key + resolve owner) …")
    me = await client.agent_api_identity.get_agent_me(request_options=DEFAULT_REQUEST_OPTIONS)
    owner_uuid: str = me.data.owner_uuid
    print(f"   ✓ orchestrator = {me.data.handle}  (owner_uuid = {owner_uuid[:8]}…)")

    # ── Step 1: Create a fresh room (agent becomes owner) ──────────────────────
    print("\n1. Creating room (POST /agent/chats) …")
    room_resp = await client.agent_api_chats.create_agent_chat(
        chat=ChatRoomRequest(),
        request_options=DEFAULT_REQUEST_OPTIONS,
    )
    room_id: str = room_resp.data.id
    room_url = f"https://app.band.ai/rooms/{room_id}"
    print(f"   ✓ room_id = {room_id}")

    # ── Step 2: Add the 3 reasoning agents + the owner (you, to watch) ─────────
    print("\n2. Adding participants …")
    for participant_id, name in [
        (facilitator_id, "Facilitator"),
        (ripple_id, "Ripple Analyst"),
        (debugger_id, "Test Debugger"),
        (owner_uuid, "You (owner)"),
    ]:
        await client.agent_api_participants.add_agent_chat_participant(
            room_id,
            participant=ParticipantRequest(participant_id=participant_id),
            request_options=DEFAULT_REQUEST_OPTIONS,
        )
        print(f"   ✓ {name} ({participant_id[:8]}…)")

    # ── Step 3: Post seed message @Facilitator ─────────────────────────────────
    # repoId travels in a [repoId:<id>] CONTENT TAG.
    # NOTE (T1 finding, 2026-06-18): the Agent API strictly validates the message body
    # and REJECTS an extra `metadata` field (422 "Unexpected field: metadata"). So the
    # content tag is the ONLY transport for repoId — the RepoInjectionPreprocessor (T2)
    # parses it out of inp.msg.content. The seed states the human origin so the
    # Facilitator concludes back to the owner (a participant), not the Orchestrator (AD7).
    print("\n3. Posting seed message (POST /agent/chats/{id}/messages) …")
    seed_content = (
        f"@Facilitator A user has requested the following change analysis:\n\n"
        f"\"{change_request}\"\n\n"
        f"[repoId:{repo_id}]"
    )
    await client.agent_api_messages.create_agent_chat_message(
        room_id,
        message=ChatMessageRequest(
            content=seed_content,
            mentions=[
                ChatMessageRequestMentionsItem(id=facilitator_id, name="Facilitator")
            ],
        ),
        request_options=DEFAULT_REQUEST_OPTIONS,
    )
    print(f"   ✓ seed posted")
    print(f"     repoId transport : [repoId:{repo_id}] content tag (metadata field is rejected)")

    # ── Summary ────────────────────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"Room URL  : {room_url}")
    print(f"Room ID   : {room_id}")
    print(f"\nNext steps:")
    print(f"  1. Open the room URL in Band UI — confirm the Facilitator responds.")
    print(f"  2. Confirm in the agent logs that the Facilitator was activated for this room.")
    print(f"  3. repoId transport is the [repoId:...] content tag (metadata is rejected) —")
    print(f"     the T2 RepoInjectionPreprocessor parses it from inp.msg.content.")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(
            "Usage: uv run python spike_t1.py <repoId> [\"<change request>\"]\n"
            "  repoId format: owner-repo  (e.g. docker-getting-started-todo-app)",
            file=sys.stderr,
        )
        sys.exit(1)

    _repo_id = sys.argv[1]
    _request = (
        sys.argv[2]
        if len(sys.argv) > 2
        else "What is the ripple effect of adding pagination support to the getItems API?"
    )
    asyncio.run(spike(_repo_id, _request))
