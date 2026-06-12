import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/kg/graph/store";

export async function GET(req: NextRequest) {
  const repoId = req.nextUrl.searchParams.get("repoId");
  if (!repoId) {
    return NextResponse.json({ error: "repoId is required" }, { status: 400 });
  }

  const graph = await store.load(repoId);
  if (!graph) {
    return NextResponse.json({ error: "Graph not found" }, { status: 404 });
  }

  return NextResponse.json(graph);
}
