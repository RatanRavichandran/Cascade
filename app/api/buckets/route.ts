import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/kg/graph/store";
import { BUCKETS, type Bucket } from "@/lib/kg/graph/model";

export async function GET(req: NextRequest) {
  const repoId = req.nextUrl.searchParams.get("repoId");
  if (!repoId) {
    return NextResponse.json({ error: "repoId is required" }, { status: 400 });
  }

  const graph = await store.load(repoId);
  if (!graph) {
    return NextResponse.json({ error: "Graph not found" }, { status: 404 });
  }

  // Group nodes by their highest-confidence bucket
  const bucketMap = Object.fromEntries(
    BUCKETS.map((b) => [b, [] as typeof graph.nodes])
  ) as unknown as Record<Bucket, typeof graph.nodes>;

  for (const node of graph.nodes) {
    const top = node.buckets[0]; // already sorted descending by confidence
    if (top) bucketMap[top.bucket].push(node);
  }

  return NextResponse.json({
    repoId: graph.repoId,
    repoUrl: graph.repoUrl,
    createdAt: graph.createdAt,
    buckets: Object.fromEntries(
      BUCKETS.map((b) => [
        b,
        {
          count: bucketMap[b].length,
          nodes: bucketMap[b].map((n) => ({
            id: n.id,
            path: n.path,
            language: n.language,
            topBucket: n.buckets[0],
            allBuckets: n.buckets,
            summary: n.summary,
          })),
        },
      ])
    ),
  });
}
