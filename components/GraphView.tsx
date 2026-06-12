"use client";

import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import type { ArtifactGraph } from "@/lib/kg/graph/model";

const BUCKET_COLORS: Record<string, string> = {
  "Requirements / specs": "#7c3aed",
  "Feature behavior": "#2563eb",
  "Source code": "#16a34a",
  "Routes and components": "#0891b2",
  "API contracts": "#d97706",
  "Tests": "#db2777",
  "Config": "#6b7280",
  "CI/CD": "#ea580c",
  "Documentation": "#0d9488",
  "Release / deployment hints": "#65a30d",
};

const EDGE_COLORS: Record<string, string> = {
  imports: "#4b5563",
  tests: "#db2777",
  defines_route: "#0891b2",
  implements_route: "#0891b2",
  configures: "#6b7280",
  documents: "#0d9488",
  references_external_spec: "#7c3aed",
  deploys: "#65a30d",
};

interface Props {
  graph: ArtifactGraph;
  onNodeClick: (nodeId: string) => void;
}

export default function GraphView({ graph, onNodeClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Keep the callback in a ref so Cytoscape tap handler always uses the latest version
  // without needing to rebuild the graph on every parent re-render
  const onNodeClickRef = useRef(onNodeClick);
  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  });

  useEffect(() => {
    if (!containerRef.current) return;

    const elements: cytoscape.ElementDefinition[] = [
      ...graph.nodes.map((n) => ({
        data: {
          id: n.id,
          label: n.path.split("/").pop() ?? n.id,
          color: n.buckets[0]?.bucket
            ? (BUCKET_COLORS[n.buckets[0].bucket] ?? "#374151")
            : "#374151",
        },
      })),
      ...graph.edges.map((e) => ({
        data: {
          id: e.id,
          source: e.from,
          target: e.to,
          edgeColor: EDGE_COLORS[e.type] ?? "#4b5563",
        },
      })),
    ];

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            "background-color": "data(color)",
            label: "data(label)",
            "font-size": 9,
            color: "#f3f4f6",
            "text-valign": "bottom",
            "text-halign": "center",
            "text-margin-y": 4,
            "min-zoomed-font-size": 6,
            width: 18,
            height: 18,
          },
        },
        {
          selector: "edge",
          style: {
            "line-color": "data(edgeColor)",
            "target-arrow-color": "data(edgeColor)",
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.7,
            width: 1,
            "curve-style": "bezier",
            opacity: 0.55,
          },
        },
        {
          selector: "node:selected",
          style: {
            "border-width": 2,
            "border-color": "#f3f4f6",
            "border-opacity": 1,
          },
        },
        {
          selector: "node:active",
          style: {
            "overlay-opacity": 0,
          },
        },
      ],
      layout: {
        name: "cose",
        animate: false,
        randomize: false,
        nodeRepulsion: 4500,
        idealEdgeLength: 80,
        nodeOverlap: 10,
        gravity: 1,
        numIter: 1000,
        initialTemp: 200,
        coolingFactor: 0.95,
        minTemp: 1,
      } as cytoscape.LayoutOptions,
      minZoom: 0.1,
      maxZoom: 5,
    });

    cy.on("tap", "node", (e) => {
      const nodeId = e.target.id() as string;
      onNodeClickRef.current(nodeId);
    });

    return () => {
      cy.destroy();
    };
  }, [graph]); // rebuild only when graph data changes

  return (
    <div className="space-y-2">
      {/* Legend */}
      <div className="flex flex-wrap gap-3 px-1">
        {Object.entries(BUCKET_COLORS).map(([bucket, color]) => (
          <span key={bucket} className="flex items-center gap-1.5 text-xs text-gray-400">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
            {bucket}
          </span>
        ))}
      </div>

      <div
        ref={containerRef}
        className="w-full rounded-lg border border-gray-800 bg-gray-950"
        style={{ height: 560 }}
      />

      <p className="text-xs text-gray-600 text-center">
        Click a node to inspect it · Scroll to zoom · Drag to pan
      </p>
    </div>
  );
}
