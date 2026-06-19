"""Create a Band room, add the Cascade agents, and post a seeded analysis request.

This is the CLI counterpart to the POST /api/ripple Next.js route (T4). It exercises
the full T2 agent flow without needing the dashboard UI. Use it to:
  • Test that agents pick up and ground themselves in a specific repo (T2 acceptance check).
  • Run local end-to-end sessions against any analyzed repo.

Usage:
    uv run python -m cascade_agents.seed_room <repoId> "<change request>"

    # Entry A — requirements change
    uv run python -m cascade_agents.seed_room docker-getting-started-todo-app \\
        "Update the getItems API to support pagination"

    # Entry B — failing test
    uv run python -m cascade_agents.seed_room docker-getting-started-todo-app \\
        "The getItems.spec.js test is failing after the recent merge — diagnose it"

Prerequisites:
    • uv run python -m cascade_agents.main  running in another terminal (agents must be live)
    • agent_config.yaml populated with all 10 entries (facilitator, ripple_analyst,
      test_debugger, orchestrator, change_intake, requirement_spec, engineering_impact,
      test_impact, stakeholder_approval, change_plan) — copy from agent_config.example.yaml
    • CASCADE_API_BASE set in .env (the repo's graph must have been analyzed first)

How it works:
    1. Authenticates as the Orchestrator agent (Agent API, not plan-gated on Pro).
    2. Resolves the owner user UUID at runtime via GET /agent/me.
    3. Creates a fresh Band room (POST /agent/chats).
    4. Adds the 3 reasoning agents + the owner user as participants.
    5. Posts a seed message @mentioning the Facilitator, carrying the repoId in a
       [repoId:<id>] content tag — the only transport the Agent API accepts (metadata
       is rejected with 422, see docs/t1-findings.md).
    6. Prints the room URL. Open it in Band UI to watch the agents respond.

Mirrors the logic proven in spike_t1.py; see that file and docs/t1-findings.md for
the rationale behind every design decision locked in T1.
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

# CRITICAL: the thenvoi_rest SDK defaults to https://platform.dev.thenvoi.com (DEV host).
# AsyncRestClient re-exports it and inherits the same wrong default. Always pass
# base_url explicitly — both here and in the /api/ripple Next.js route (T4).
BAND_REST_BASE = "https://app.band.ai"

# agent_config.yaml lives at cascade-agents/agent_config.yaml, two levels above this file.
_CONFIG_PATH = Path(__file__).resolve().parents[2] / "agent_config.yaml"


def _load_config() -> dict:
    if not _CONFIG_PATH.exists():
        print(
            f"\nERROR: {_CONFIG_PATH} not found.\n"
            "  cp agent_config.example.yaml agent_config.yaml  then fill in credentials.\n",
            file=sys.stderr,
        )
        sys.exit(1)
    with open(_CONFIG_PATH) as f:
        return yaml.safe_load(f)


def _require_key(cfg: dict, section: str, field: str) -> str:
    val = cfg.get(section, {}).get(field, "")
    if not val or val.startswith("REPLACE_WITH"):
        print(
            f"\nERROR: agent_config.yaml [{section}][{field}] is not set.\n"
            f"  Register the {section!r} agent in Band (Agents → New Agent → External),\n"
            f"  copy the agent_id and api_key, then update agent_config.yaml.\n",
            file=sys.stderr,
        )
        sys.exit(1)
    return val


async def seed_room(repo_id: str, change_request: str) -> None:
    """Create a Band room seeded for the given repo + change request.

    Prints the room URL so the caller can open it in the Band UI.
    The running agents (started via `python -m cascade_agents.main`) will pick up
    the seed and the Facilitator will route it to the appropriate specialist.
    """
    load_dotenv()
    cfg = _load_config()

    orchestrator_key      = _require_key(cfg, "orchestrator",          "api_key")
    facilitator_id        = _require_key(cfg, "facilitator",           "agent_id")
    ripple_id             = _require_key(cfg, "ripple_analyst",        "agent_id")
    debugger_id           = _require_key(cfg, "test_debugger",         "agent_id")
    change_intake_id      = _require_key(cfg, "change_intake",         "agent_id")
    requirement_spec_id   = _require_key(cfg, "requirement_spec",      "agent_id")
    engineering_impact_id = _require_key(cfg, "engineering_impact",    "agent_id")
    test_impact_id        = _require_key(cfg, "test_impact",           "agent_id")
    stakeholder_id        = _require_key(cfg, "stakeholder_approval",  "agent_id")
    change_plan_id        = _require_key(cfg, "change_plan",           "agent_id")

    client = AsyncRestClient(base_url=BAND_REST_BASE, api_key=orchestrator_key)

    # 1. Validate key + resolve owner UUID (no hardcoded user ID — AD7).
    me = await client.agent_api_identity.get_agent_me(request_options=DEFAULT_REQUEST_OPTIONS)
    owner_uuid: str = me.data.owner_uuid

    # 2. Create a fresh room (Orchestrator agent becomes room owner).
    room_resp = await client.agent_api_chats.create_agent_chat(
        chat=ChatRoomRequest(),
        request_options=DEFAULT_REQUEST_OPTIONS,
    )
    room_id: str = room_resp.data.id

    # 3. Add all 8 reasoning agents + the owner user so they can watch in the Band UI.
    #    The Facilitator can only @mention agents that are already in the room, so all
    #    committee agents must be added here. Orchestrator is already the room creator.
    for participant_id in (
        facilitator_id,
        ripple_id,
        debugger_id,
        change_intake_id,
        requirement_spec_id,
        engineering_impact_id,
        test_impact_id,
        stakeholder_id,
        change_plan_id,
        owner_uuid,
    ):
        await client.agent_api_participants.add_agent_chat_participant(
            room_id,
            participant=ParticipantRequest(participant_id=participant_id),
            request_options=DEFAULT_REQUEST_OPTIONS,
        )

    # 4. Post the seed message.
    #    • @mentions the Facilitator so it is activated.
    #    • [repoId:...] content tag carries the repo identity to RepoInjectionPreprocessor.
    #      (The Agent API rejects a `metadata` field with 422 — content tag is the only
    #       transport. See docs/t1-findings.md AC #1.)
    seed_content = (
        f"@Facilitator A user has requested the following change analysis:\n\n"
        f'"{change_request}"\n\n'
        f"[repoId:{repo_id}]"
    )
    await client.agent_api_messages.create_agent_chat_message(
        room_id,
        message=ChatMessageRequest(
            content=seed_content,
            mentions=[ChatMessageRequestMentionsItem(id=facilitator_id, name="Facilitator")],
        ),
        request_options=DEFAULT_REQUEST_OPTIONS,
    )

    room_url = f"https://app.band.ai/rooms/{room_id}"
    print(f"\nRoom created: {room_url}")
    print(f"Room ID     : {room_id}")
    print(f"Repo        : {repo_id}")
    print("\nOpen the room URL in Band UI to watch the agents respond.")


# ── CLI entry point ──────────────────────────────────────────────────────────

def _main() -> None:
    if len(sys.argv) < 2:
        print(
            "Usage: uv run python -m cascade_agents.seed_room <repoId> [\"<change request>\"]\n"
            "\n"
            "  repoId format: owner-repo  (e.g. docker-getting-started-todo-app)\n"
            "\n"
            "Examples:\n"
            "  uv run python -m cascade_agents.seed_room docker-getting-started-todo-app \\\n"
            '      "Update getItems API to support pagination"\n'
            "\n"
            "  uv run python -m cascade_agents.seed_room docker-getting-started-todo-app \\\n"
            '      "The getItems.spec.js test is failing — diagnose it"',
            file=sys.stderr,
        )
        sys.exit(1)

    repo_id = sys.argv[1]
    request = (
        sys.argv[2]
        if len(sys.argv) > 2
        else "What is the ripple effect of adding pagination support to the getItems API?"
    )
    asyncio.run(seed_room(repo_id, request))


if __name__ == "__main__":
    _main()
