"use client";

import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import type { ArtifactGraph } from "@/lib/kg/graph/model";

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

interface Props {
  graph: ArtifactGraph;
  onNodeClick: (nodeId: string) => void;
}

export default function GraphView({ graph, onNodeClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
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
            ? (BUCKET_COLORS[n.buckets[0].bucket] ?? "#64748b")
            : "#64748b",
        },
      })),
      ...graph.edges.map((e) => ({
        data: {
          id: e.id,
          source: e.from,
          target: e.to,
          edgeColor: EDGE_COLORS[e.type] ?? "#94a3b8",
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
            "font-family": "var(--font-ibm-plex-mono), ui-monospace, monospace",
            color: "#0F172A",
            "text-valign": "bottom",
            "text-halign": "center",
            "text-margin-y": 5,
            "min-zoomed-font-size": 6,
            width: 18,
            height: 18,
            "border-width": 2,
            "border-color": "#ffffff",
            "border-opacity": 1,
          },
        },
        {
          selector: "edge",
          style: {
            "line-color": "data(edgeColor)",
            "target-arrow-color": "data(edgeColor)",
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.7,
            width: 1.5,
            "curve-style": "bezier",
            opacity: 0.45,
          },
        },
        {
          selector: "node:selected",
          style: {
            "border-width": 3,
            "border-color": "#0C5CAB",
            "border-opacity": 1,
          },
        },
        {
          selector: "node:active",
          style: {
            "overlay-opacity": 0,
          },
        },
        {
          selector: "node:hover",
          style: {
            "border-width": 2,
            "border-color": "#0C5CAB",
            "border-opacity": 0.6,
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
  }, [graph]);

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="bg-surface border border-surface-border rounded-card shadow-card p-4">
        <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3">Bucket legend</p>
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
        ref={containerRef}
        className="w-full rounded-card border border-surface-border bg-surface shadow-card"
        style={{ height: 560 }}
        role="img"
        aria-label="Interactive knowledge graph — click a node to inspect it"
      />

      <p className="text-xs text-ink-muted text-center">
        Click a node to inspect it · Scroll to zoom · Drag to pan
      </p>
    </div>
  );
}
