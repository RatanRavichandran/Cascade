/**
 * POST /api/ripple
 *
 * Accepts { repoId, request } and uses the Band Agent API to:
 *   1. Validate the repo has an analyzed graph (guard: 400 if missing).
 *   2. Resolve the owner user UUID via GET /agent/me.
 *   3. Create a fresh Band room (POST /agent/chats).
 *   4. Add the 3 reasoning agents + the owner user as participants.
 *   5. Post a seed message @mentioning the Facilitator with a [repoId:...] content tag.
 *   6. Return { roomId, roomUrl }.
 *
 * Mirrors the logic proven in cascade-agents/src/cascade_agents/seed_room.py (T3).
 * Authenticates as the Orchestrator agent (Agent API is not plan-gated on Pro;
 * the Human API is Enterprise-only — see docs/t1-findings.md).
 *
 * Environment (server-only — never shipped to the browser):
 *   BAND_ORCHESTRATOR_KEY          Orchestrator agent api_key
 *   BAND_FACILITATOR_ID            Facilitator agent UUID
 *   BAND_RIPPLE_ANALYST_ID         Ripple Analyst agent UUID
 *   BAND_TEST_DEBUGGER_ID          Test Debugger agent UUID
 *   BAND_CHANGE_INTAKE_ID          Change Intake agent UUID
 *   BAND_REQUIREMENT_SPEC_ID       Requirement & Spec agent UUID
 *   BAND_ENGINEERING_IMPACT_ID     Engineering Impact agent UUID
 *   BAND_TEST_IMPACT_ID            Test Impact agent UUID
 *   BAND_STAKEHOLDER_APPROVAL_ID   Stakeholder & Approval agent UUID
 *   BAND_CHANGE_PLAN_ID            Change Plan agent UUID
 *   BAND_REST_BASE                 Band REST host (default: https://app.band.ai)
 */

import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/kg/graph/store";

export const runtime = "nodejs";

// Production Band REST host. The Band SDK / thenvoi_rest default to
// platform.dev.thenvoi.com (DEV) — always pin explicitly (T1 finding).
const BAND_REST_BASE =
  process.env.BAND_REST_BASE?.replace(/\/$/, "") ?? "https://app.band.ai";

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required server env var: ${name}`);
  return val;
}

interface BandError {
  detail?: string | { msg?: string }[];
}

async function bandPost(
  path: string,
  apiKey: string,
  body: unknown
): Promise<unknown> {
  const res = await fetch(`${BAND_REST_BASE}/api/v1${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err: BandError = await res.json().catch(() => ({}));
    const detail =
      typeof err.detail === "string"
        ? err.detail
        : Array.isArray(err.detail)
          ? err.detail.map((d) => d.msg ?? JSON.stringify(d)).join("; ")
          : res.statusText;
    throw new Error(`Band API ${path} → ${res.status}: ${detail}`);
  }
  return res.json();
}

async function bandGet(path: string, apiKey: string): Promise<unknown> {
  const res = await fetch(`${BAND_REST_BASE}/api/v1${path}`, {
    headers: { "X-API-Key": apiKey },
  });
  if (!res.ok) {
    const err: BandError = await res.json().catch(() => ({}));
    throw new Error(`Band API GET ${path} → ${res.status}: ${err.detail ?? res.statusText}`);
  }
  return res.json();
}

export async function POST(req: NextRequest) {
  // --- Parse + validate request body ---
  let repoId: string;
  let changeRequest: string;
  try {
    const body = await req.json();
    repoId = body?.repoId;
    changeRequest = body?.request;
    if (!repoId || typeof repoId !== "string") {
      return NextResponse.json({ error: "repoId is required" }, { status: 400 });
    }
    if (!changeRequest || typeof changeRequest !== "string") {
      return NextResponse.json({ error: "request is required" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // --- Guard: repo must have an analyzed graph ---
  const graph = await store.load(repoId);
  if (!graph) {
    return NextResponse.json(
      { error: `No analyzed graph found for repo '${repoId}'. Analyze it first.` },
      { status: 400 }
    );
  }

  // --- Read server-only secrets ---
  let orchestratorKey: string;
  let facilitatorId: string;
  let rippleAnalystId: string;
  let testDebuggerId: string;
  let changeIntakeId: string;
  let requirementSpecId: string;
  let engineeringImpactId: string;
  let testImpactId: string;
  let stakeholderApprovalId: string;
  let changePlanId: string;
  try {
    orchestratorKey      = requireEnv("BAND_ORCHESTRATOR_KEY");
    facilitatorId        = requireEnv("BAND_FACILITATOR_ID");
    rippleAnalystId      = requireEnv("BAND_RIPPLE_ANALYST_ID");
    testDebuggerId       = requireEnv("BAND_TEST_DEBUGGER_ID");
    changeIntakeId       = requireEnv("BAND_CHANGE_INTAKE_ID");
    requirementSpecId    = requireEnv("BAND_REQUIREMENT_SPEC_ID");
    engineeringImpactId  = requireEnv("BAND_ENGINEERING_IMPACT_ID");
    testImpactId         = requireEnv("BAND_TEST_IMPACT_ID");
    stakeholderApprovalId = requireEnv("BAND_STAKEHOLDER_APPROVAL_ID");
    changePlanId         = requireEnv("BAND_CHANGE_PLAN_ID");
  } catch (err) {
    console.error("[/api/ripple] missing Band env var:", err);
    return NextResponse.json(
      { error: "Agent service is not configured. Contact the administrator." },
      { status: 500 }
    );
  }

  try {
    // 1. Resolve owner UUID (no hardcoded user ID — AD7).
    const meResp = await bandGet("/agent/me", orchestratorKey) as { data: { owner_uuid: string } };
    const ownerUuid = meResp.data.owner_uuid;

    // 2. Create a fresh room.
    // The Band Agent API wraps each body in its model key: {"chat": {...}}.
    const roomResp = await bandPost("/agent/chats", orchestratorKey, { chat: {} }) as { data: { id: string } };
    const roomId = roomResp.data.id;

    // 3. Add all participants — body must be {"participant": {"participant_id": "..."}}.
    //    All 8 reasoning agents must be in the room so the Facilitator can @mention them.
    //    Orchestrator is already the room creator/owner — do NOT add it as a participant.
    for (const participantId of [
      facilitatorId,
      rippleAnalystId,
      testDebuggerId,
      changeIntakeId,
      requirementSpecId,
      engineeringImpactId,
      testImpactId,
      stakeholderApprovalId,
      changePlanId,
      ownerUuid,
    ]) {
      await bandPost(`/agent/chats/${roomId}/participants`, orchestratorKey, {
        participant: { participant_id: participantId },
      });
    }

    // 4. Post seed message — body must be {"message": {"content": "...", "mentions": [...]}}.
    //    repoId travels as a [repoId:...] content tag — the Agent API rejects a
    //    `metadata` field with 422 (T1 finding; see docs/t1-findings.md AC #1).
    const seedContent =
      `@Facilitator A user has requested the following change analysis:\n\n` +
      `"${changeRequest}"\n\n` +
      `[repoId:${repoId}]`;

    await bandPost(`/agent/chats/${roomId}/messages`, orchestratorKey, {
      message: {
        content: seedContent,
        mentions: [{ id: facilitatorId, name: "Facilitator" }],
      },
    });

    const roomUrl = `https://app.band.ai/chat/${roomId}`;
    return NextResponse.json({ roomId, roomUrl });
  } catch (err) {
    console.error("[/api/ripple] Band API error:", err);
    return NextResponse.json(
      { error: "Failed to create analysis session. Check server logs." },
      { status: 502 }
    );
  }
}
