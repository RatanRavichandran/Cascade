"""Fetch the Phase 1 knowledge graph and build a compact text digest for agent context.

CLI smoke-test:
    uv run python -m cascade_agents.graph_digest <repoId>
"""

from __future__ import annotations

import asyncio
import os
import sys

import httpx
from dotenv import load_dotenv


async def fetch_graph(repo_id: str, base_url: str) -> dict:
    """Fetch the artifact graph from the deployed Cascade Next.js app."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(f"{base_url}/api/graph", params={"repoId": repo_id})
        r.raise_for_status()
        return r.json()


def build_digest(graph: dict, max_nodes: int = 200) -> str:
    """
    Build a compact text digest of an ArtifactGraph for injection into agent context.

    Includes:
    - Repo metadata
    - Bucket-level node counts
    - Up to max_nodes nodes (id | path | primary bucket | arch layer | summary)
    - All edges (from → to : type)

    Nodes that participate in at least one edge are shown first, then sorted by
    confidence descending, so the most structurally significant artifacts appear
    within the context budget.
    """
    repo_id = graph.get("repoId", "unknown")
    repo_url = graph.get("repoUrl", "unknown")
    nodes: list[dict] = graph.get("nodes", [])
    edges: list[dict] = graph.get("edges", [])

    bucket_counts: dict[str, int] = {}
    for node in nodes:
        if node.get("buckets"):
            top_bucket = node["buckets"][0]["bucket"]
            bucket_counts[top_bucket] = bucket_counts.get(top_bucket, 0) + 1

    lines = [
        f"# Knowledge Graph — {repo_id}",
        f"Repository: {repo_url}",
        f"Nodes: {len(nodes)}  Edges: {len(edges)}",
        "",
        "## Bucket counts",
    ]
    for bucket, count in sorted(bucket_counts.items(), key=lambda x: -x[1]):
        lines.append(f"  {bucket}: {count}")

    linked_ids: set[str] = set()
    for edge in edges:
        linked_ids.add(edge.get("from", ""))
        linked_ids.add(edge.get("to", ""))

    def _node_key(n: dict) -> tuple:
        conf = n["buckets"][0]["confidence"] if n.get("buckets") else 0.0
        return (n["id"] not in linked_ids, -conf)

    shown = sorted(nodes, key=_node_key)[:max_nodes]

    lines.append("")
    lines.append("## Nodes  (id | path | primary-bucket | arch-layer | summary)")
    for node in shown:
        pb = node["buckets"][0]["bucket"] if node.get("buckets") else "?"
        layer = node.get("layer", "")
        summary = node.get("summary", "")
        summary_part = f" | {summary[:100]}" if summary else ""
        lines.append(
            f"  {node['id']} | {node.get('path', '?')} | {pb} | {layer}{summary_part}"
        )

    if len(nodes) > max_nodes:
        lines.append(f"  ... ({len(nodes) - max_nodes} nodes omitted — increase max_nodes if needed)")

    lines.append("")
    lines.append("## Edges  (from -> to : type)")
    for edge in edges:
        lines.append(
            f"  {edge.get('from', '')} -> {edge.get('to', '')} : {edge.get('type', '')}"
        )

    return "\n".join(lines)


def build_scoped_digest(graph: dict, edge_types: set[str], max_nodes: int = 200) -> str:
    """Build a digest that includes only the specified edge types.

    Useful for role-scoped injection: Ripple Analyst only needs dependency/route edges;
    Test Debugger only needs test/import edges. The full node list is retained (needed
    for path resolution), but unneeded edges are stripped to reduce per-turn token usage.

    Args:
        graph: Raw graph dict from fetch_graph.
        edge_types: Set of edge type strings to keep (e.g. {"imports", "tests"}).
        max_nodes: Cap on nodes shown (same behaviour as build_digest).
    """
    filtered_graph = {
        **graph,
        "edges": [e for e in graph.get("edges", []) if e.get("type") in edge_types],
    }
    digest = build_digest(filtered_graph, max_nodes=max_nodes)
    # Annotate so the agent knows edges were filtered.
    scope_note = f"(edge scope: {', '.join(sorted(edge_types))})"
    return digest.replace("## Edges  (from -> to : type)", f"## Edges  (from -> to : type)  {scope_note}", 1)


# ---------------------------------------------------------------------------
# CLI  (uv run python -m cascade_agents.graph_digest <repoId>)
# ---------------------------------------------------------------------------

async def _cli(repo_id: str) -> None:
    load_dotenv()
    base_url = os.getenv("CASCADE_API_BASE", "").rstrip("/")
    if not base_url:
        print("ERROR: CASCADE_API_BASE is not set in .env", file=sys.stderr)
        sys.exit(1)
    print(f"Fetching graph for '{repo_id}' from {base_url} …", file=sys.stderr)
    graph = await fetch_graph(repo_id, base_url=base_url)
    digest = build_digest(graph)
    node_count = len(graph.get("nodes", []))
    edge_count = len(graph.get("edges", []))
    print(f"Digest: {len(digest)} chars | {node_count} nodes | {edge_count} edges", file=sys.stderr)
    print(digest)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: uv run python -m cascade_agents.graph_digest <repoId>", file=sys.stderr)
        sys.exit(1)
    asyncio.run(_cli(sys.argv[1]))
