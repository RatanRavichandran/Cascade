import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/kg/graph/store";
import type { Bucket, EdgeType } from "@/lib/kg/graph/model";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const repoId = searchParams.get("repoId");
  const bucket = searchParams.get("bucket") as Bucket | null;
  const edgeType = searchParams.get("edge") as EdgeType | null;

  if (!repoId) {
    return NextResponse.json({ error: "repoId is required" }, { status: 400 });
  }

  const graph = await store.load(repoId);
  if (!graph) {
    return NextResponse.json({ error: "Graph not found" }, { status: 404 });
  }

  const nodes = bucket
    ? graph.nodes.filter((n) => n.buckets.some((s) => s.bucket === bucket))
    : graph.nodes;

  const edges = edgeType
    ? graph.edges.filter((e) => e.type === edgeType)
    : graph.edges;

  return NextResponse.json({ nodes, edges });
}
