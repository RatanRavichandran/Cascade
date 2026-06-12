import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/kg/graph/store";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const repoId = req.nextUrl.searchParams.get("repoId");
  if (!repoId) {
    return NextResponse.json({ error: "repoId is required" }, { status: 400 });
  }

  const graph = await store.load(repoId);
  if (!graph) {
    return NextResponse.json({ error: "Graph not found" }, { status: 404 });
  }

  const decodedId = decodeURIComponent(id);
  const node = graph.nodes.find((n) => n.id === decodedId);
  if (!node) {
    return NextResponse.json({ error: "Node not found" }, { status: 404 });
  }

  const incidentEdges = graph.edges.filter(
    (e) => e.from === decodedId || e.to === decodedId
  );

  return NextResponse.json({ node, edges: incidentEdges });
}
