import { NextRequest, NextResponse } from "next/server";
import { runPipeline } from "@/lib/kg/pipeline";
import { auth } from "@/auth";
import { recordAnalysis } from "@/lib/kg/history";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let repoUrl: string;

  try {
    const body = await req.json();
    repoUrl = body?.repoUrl;
    if (!repoUrl || typeof repoUrl !== "string") {
      return NextResponse.json({ error: "repoUrl is required" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const session = await auth();
  const githubToken = (session as unknown as { githubAccessToken?: string } | null)
    ?.githubAccessToken;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        const graph = await runPipeline(repoUrl, {
          githubToken,
          onProgress: (message) => send({ type: "progress", message }),
        });

        if (session?.user?.ghId) {
          await recordAnalysis(session.user.ghId, {
            repoId: graph.repoId,
            repoUrl,
            analyzedAt: graph.createdAt,
            nodeCount: graph.nodes.length,
          });
        }

        send({
          type: "done",
          repoId: graph.repoId,
          nodeCount: graph.nodes.length,
          createdAt: graph.createdAt,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
