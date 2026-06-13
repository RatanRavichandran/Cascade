import { NextRequest, NextResponse } from "next/server";
import { runPipeline } from "@/lib/kg/pipeline";
import { auth } from "@/auth";
import { recordAnalysis } from "@/lib/kg/history";

// Ingest needs fs + wasm + the openai SDK — it must run on Node, never Edge.
export const runtime = "nodejs";
// GitHub fetch + tree-sitter parse + optional LLM enrichment can take a while on a
// large repo; raise the function timeout above Vercel's short default.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let repoUrl: string;

  try {
    const body = await req.json();
    repoUrl = body?.repoUrl;
    if (!repoUrl || typeof repoUrl !== "string") {
      return NextResponse.json(
        { error: "repoUrl is required" },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Read session — if logged in, run ingest under the user's own GitHub token.
  // Anonymous callers fall back to the shared GITHUB_TOKEN env var.
  const session = await auth();
  const githubToken = (session as unknown as { githubAccessToken?: string } | null)
    ?.githubAccessToken;

  try {
    const graph = await runPipeline(repoUrl, { githubToken });

    // Record to per-user history when logged in.
    if (session?.user?.ghId) {
      await recordAnalysis(session.user.ghId, {
        repoId: graph.repoId,
        repoUrl,
        analyzedAt: graph.createdAt,
        nodeCount: graph.nodes.length,
      });
    }

    return NextResponse.json({
      repoId: graph.repoId,
      nodeCount: graph.nodes.length,
      createdAt: graph.createdAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
