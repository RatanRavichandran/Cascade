"use client";

import { useMemo, useState, useCallback, memo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  BackgroundVariant,
  type Node,
  type Edge,
  type NodeProps,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ArtifactGraph, Bucket, ArchLayer } from "@/lib/kg/graph/model";

const BUCKET_COLORS: Record<string, string> = {
  "Requirements / specs":       "#2563eb",
  "Feature behavior":           "#7c3aed",
  "Source code":                "#0891b2",
  "Routes and components":      "#059669",
  "API contracts":              "#d97706",
  "Tests":                      "#db2777",
  "Config":                     "#64748b",
  "CI/CD":                      "#ea580c",
  "Documentation":              "#0d9488",
  "Release / deployment hints": "#65a30d",
};

const EDGE_COLORS: Record<string, string> = {
  imports:                  "#94a3b8",
  tests:                    "#db2777",
  defines_route:            "#0891b2",
  implements_route:         "#0891b2",
  configures:               "#64748b",
  documents:                "#0d9488",
  references_external_spec: "#7c3aed",
  deploys:                  "#65a30d",
};

// ── Lanes: left→right flow, code layers first then satellite buckets ─────────
type LaneKey =
  | "UI" | "API" | "Service" | "Data" | "Utility"
  | "Tests" | "Config" | "Docs";

const LANE_ORDER: LaneKey[] = [
  "UI", "API", "Service", "Data", "Utility", "Tests", "Config", "Docs",
];

const LANE_LABELS: Record<LaneKey, string> = {
  UI: "UI",
  API: "API",
  Service: "Service",
  Data: "Data",
  Utility: "Utility",
  Tests: "Tests",
  Config: "Config",
  Docs: "Docs & specs",
};

const LANE_ACCENT: Record<LaneKey, string> = {
  UI: "#059669",
  API: "#d97706",
  Service: "#0891b2",
  Data: "#2563eb",
  Utility: "#64748b",
  Tests: "#db2777",
  Config: "#64748b",
  Docs: "#0d9488",
};

function bucketToLane(bucket?: Bucket): LaneKey {
  switch (bucket) {
    case "Tests":
      return "Tests";
    case "Config":
    case "CI/CD":
      return "Config";
    case "Documentation":
    case "Requirements / specs":
    case "Release / deployment hints":
    case "Feature behavior":
    case "API contracts":
      return "Docs";
    default:
      return "Utility";
  }
}

function laneFor(layer: ArchLayer | undefined, bucket?: Bucket): LaneKey {
  if (layer) return layer;
  return bucketToLane(bucket);
}

// ── Layout geometry ──────────────────────────────────────────────────────────
const NODE_W = 150;
const NODE_H = 44;
const ROW_H = 60;
const SUBCOL_W = 174;
const LANE_PAD = 18;
const LANE_GAP = 40;
const HEADER_H = 52;
const MAX_ROWS = 16;

interface NodeData extends Record<string, unknown> {
  label: string;
  sublabel: string;
  color: string;
  dimmed: boolean;
}

interface LaneBandData extends Record<string, unknown> {
  label: string;
  accent: string;
  count: number;
}

// ── Custom artifact node ─────────────────────────────────────────────────────
const ArtifactFlowNode = memo(function ArtifactFlowNode({
  data,
  selected,
}: NodeProps<Node<NodeData>>) {
  return (
    <div
      className="rounded-lg border bg-white px-2.5 py-1.5 flex items-center gap-2 transition-all"
      style={{
        width: NODE_W,
        height: NODE_H,
        borderColor: selected ? "#0C5CAB" : "#E2E8F0",
        borderWidth: selected ? 2 : 1,
        boxShadow: selected
          ? "0 4px 12px 0 rgb(12 92 171 / 0.18)"
          : "0 1px 2px 0 rgb(0 0 0 / 0.06)",
        opacity: data.dimmed ? 0.18 : 1,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <span
        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
        style={{ backgroundColor: data.color }}
      />
      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-[11px] leading-tight text-ink"
          style={{ fontFamily: "var(--font-ibm-plex-mono), ui-monospace, monospace" }}
          title={data.label}
        >
          {data.label}
        </span>
        <span className="block truncate text-[9px] leading-tight text-ink-muted">
          {data.sublabel}
        </span>
      </span>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
});

// ── Lane background band (non-interactive) ───────────────────────────────────
const LaneBandNode = memo(function LaneBandNode({
  data,
}: NodeProps<Node<LaneBandData>>) {
  return (
    <div
      className="w-full h-full rounded-xl border border-dashed"
      style={{
        borderColor: `${data.accent}33`,
        background: `${data.accent}08`,
      }}
    >
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: data.accent }}
        />
        <span
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: data.accent }}
        >
          {data.label}
        </span>
        <span className="text-[10px] text-ink-muted">{data.count}</span>
      </div>
    </div>
  );
});

const nodeTypes = {
  artifact: ArtifactFlowNode,
  laneBand: LaneBandNode,
};

interface Props {
  graph: ArtifactGraph;
  onNodeClick: (nodeId: string) => void;
}

interface Built {
  nodes: Node[];
  edges: Edge[];
  laneBands: Node[];
}

function buildLayout(graph: ArtifactGraph): Built {
  // Group nodes into lanes.
  const byLane = new Map<LaneKey, typeof graph.nodes>();
  for (const n of graph.nodes) {
    const lane = laneFor(n.layer, n.buckets[0]?.bucket);
    const arr = byLane.get(lane) ?? [];
    arr.push(n);
    byLane.set(lane, arr);
  }

  const activeLanes = LANE_ORDER.filter((l) => (byLane.get(l)?.length ?? 0) > 0);

  // Global content height to size the lane bands consistently.
  let maxRows = 1;
  for (const lane of activeLanes) {
    const count = byLane.get(lane)!.length;
    const cols = Math.max(1, Math.ceil(count / MAX_ROWS));
    maxRows = Math.max(maxRows, Math.ceil(count / cols));
  }
  const bandHeight = HEADER_H + maxRows * ROW_H + LANE_PAD;

  const flowNodes: Node[] = [];
  const laneBands: Node[] = [];
  const pos = new Map<string, { x: number; y: number }>();

  let laneX = 0;
  for (const lane of activeLanes) {
    const members = byLane.get(lane)!.slice().sort((a, b) => {
      const ba = a.buckets[0]?.bucket ?? "";
      const bb = b.buckets[0]?.bucket ?? "";
      return ba === bb ? a.path.localeCompare(b.path) : ba.localeCompare(bb);
    });
    const count = members.length;
    const cols = Math.max(1, Math.ceil(count / MAX_ROWS));
    const rows = Math.ceil(count / cols);
    const laneWidth = cols * SUBCOL_W;

    laneBands.push({
      id: `lane:${lane}`,
      type: "laneBand",
      position: { x: laneX - LANE_PAD, y: -LANE_PAD },
      data: { label: LANE_LABELS[lane], accent: LANE_ACCENT[lane], count } as LaneBandData,
      style: { width: laneWidth + LANE_PAD * 2, height: bandHeight },
      draggable: false,
      selectable: false,
      zIndex: 0,
    });

    members.forEach((n, i) => {
      const col = Math.floor(i / rows);
      const row = i % rows;
      const x = laneX + col * SUBCOL_W;
      const y = HEADER_H + row * ROW_H;
      pos.set(n.id, { x, y });

      const bucket = n.buckets[0]?.bucket;
      flowNodes.push({
        id: n.id,
        type: "artifact",
        position: { x, y },
        width: NODE_W,
        height: NODE_H,
        data: {
          label: n.path.split("/").pop() ?? n.id,
          sublabel: n.layer ?? bucket ?? "",
          color: bucket ? (BUCKET_COLORS[bucket] ?? "#64748b") : "#64748b",
          dimmed: false,
        } as NodeData,
        zIndex: 1,
      });
    });

    laneX += laneWidth + LANE_GAP;
  }

  const flowEdges: Edge[] = graph.edges
    .filter((e) => pos.has(e.from) && pos.has(e.to))
    .map((e) => {
      const color = EDGE_COLORS[e.type] ?? "#94a3b8";
      return {
        id: e.id,
        source: e.from,
        target: e.to,
        type: "default",
        animated: true,
        style: { stroke: color, strokeWidth: 1.5, opacity: 0.4 },
        data: { type: e.type },
      };
    });

  return { nodes: flowNodes, edges: flowEdges, laneBands };
}

export default function GraphView({ graph, onNodeClick }: Props) {
  const { nodes, edges, laneBands } = useMemo(() => buildLayout(graph), [graph]);
  const [hovered, setHovered] = useState<string | null>(null);

  // Adjacency for hover highlighting.
  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of edges) {
      (m.get(e.source) ?? m.set(e.source, new Set()).get(e.source)!).add(e.target);
      (m.get(e.target) ?? m.set(e.target, new Set()).get(e.target)!).add(e.source);
    }
    return m;
  }, [edges]);

  const displayNodes = useMemo(() => {
    const active = hovered
      ? new Set<string>([hovered, ...(neighbors.get(hovered) ?? [])])
      : null;
    const artifacts = nodes.map((n) => ({
      ...n,
      data: { ...n.data, dimmed: active ? !active.has(n.id) : false },
    }));
    return [...laneBands, ...artifacts];
  }, [nodes, laneBands, hovered, neighbors]);

  const displayEdges = useMemo(() => {
    if (!hovered) return edges;
    return edges.map((e) => {
      const on = e.source === hovered || e.target === hovered;
      return {
        ...e,
        animated: on,
        style: {
          ...e.style,
          opacity: on ? 0.95 : 0.06,
          strokeWidth: on ? 2.25 : 1.5,
        },
      };
    });
  }, [edges, hovered]);

  const handleClick = useCallback<NodeMouseHandler>(
    (_e, node) => {
      if (node.type === "artifact") onNodeClick(node.id);
    },
    [onNodeClick],
  );

  const handleEnter = useCallback<NodeMouseHandler>((_e, node) => {
    if (node.type === "artifact") setHovered(node.id);
  }, []);
  const handleLeave = useCallback(() => setHovered(null), []);

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="bg-surface border border-surface-border rounded-card shadow-card p-4">
        <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3">
          Bucket legend
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {Object.entries(BUCKET_COLORS).map(([bucket, color]) => (
            <span key={bucket} className="flex items-center gap-1.5 text-xs text-ink-secondary">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full shrink-0 border border-white shadow-sm"
                style={{ backgroundColor: color }}
                aria-hidden="true"
              />
              {bucket}
            </span>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div
        className="w-full rounded-card border border-surface-border bg-surface shadow-card overflow-hidden"
        style={{ height: 600 }}
        role="img"
        aria-label="Layered knowledge graph — nodes grouped by architecture layer; click a node to inspect it"
      >
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          onNodeClick={handleClick}
          onNodeMouseEnter={handleEnter}
          onNodeMouseLeave={handleLeave}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          minZoom={0.05}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
          nodesConnectable={false}
          elevateNodesOnSelect
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#E2E8F0" />
          <MiniMap
            pannable
            zoomable
            nodeStrokeWidth={0}
            nodeColor={(n) =>
              n.type === "laneBand" ? "transparent" : ((n.data as NodeData)?.color ?? "#94a3b8")
            }
            maskColor="rgb(248 250 252 / 0.7)"
            style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8 }}
          />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <p className="text-xs text-ink-muted text-center">
        Grouped by architecture layer · Hover a node to trace its connections · Click to inspect ·
        Scroll to zoom · Drag to pan
      </p>
    </div>
  );
}
