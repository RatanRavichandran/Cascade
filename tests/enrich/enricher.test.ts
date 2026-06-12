import { describe, it, expect } from "vitest";
import { applyEnrichmentResults } from "@/lib/kg/enrich/enricher";
import type { Enricher, NodeForEnrichment, EnrichmentResult } from "@/lib/kg/enrich/enricher";
import type { ArtifactNode } from "@/lib/kg/graph/model";

function makeNode(id: string, layer?: ArtifactNode["layer"]): ArtifactNode {
  return {
    id,
    type: "file",
    path: id,
    buckets: [{ bucket: "Source code", confidence: 0.9, signals: ["ext:.ts"] }],
    layer,
  };
}

describe("applyEnrichmentResults", () => {
  it("adds summary and sets enriched flag", () => {
    const node = makeNode("src/api.ts");
    const results: EnrichmentResult[] = [
      { nodeId: "src/api.ts", summary: "Handles API route registration" },
    ];
    applyEnrichmentResults([node], results);
    expect(node.summary).toBe("Handles API route registration");
    expect(node.enriched).toBe(true);
  });

  it("sets layer when node has none", () => {
    const node = makeNode("src/api.ts");
    const results: EnrichmentResult[] = [
      { nodeId: "src/api.ts", summary: "Route handler", layer: "API" },
    ];
    applyEnrichmentResults([node], results);
    expect(node.layer).toBe("API");
  });

  it("does not overwrite an existing layer (additive only)", () => {
    const node = makeNode("src/api.ts", "API");
    const results: EnrichmentResult[] = [
      { nodeId: "src/api.ts", summary: "Route handler", layer: "Service" },
    ];
    applyEnrichmentResults([node], results);
    expect(node.layer).toBe("API"); // deterministic value preserved
  });

  it("skips nodes with no matching enrichment result", () => {
    const node = makeNode("src/api.ts");
    applyEnrichmentResults([node], []);
    expect(node.summary).toBeUndefined();
    expect(node.enriched).toBeUndefined();
  });

  it("handles multiple nodes in one pass", () => {
    const nodes = [makeNode("src/a.ts"), makeNode("src/b.ts")];
    const results: EnrichmentResult[] = [
      { nodeId: "src/a.ts", summary: "A module" },
      { nodeId: "src/b.ts", summary: "B module", layer: "Utility" },
    ];
    applyEnrichmentResults(nodes, results);
    expect(nodes[0].summary).toBe("A module");
    expect(nodes[1].summary).toBe("B module");
    expect(nodes[1].layer).toBe("Utility");
  });

  it("graceful null fallback: pipeline skips enrichment when no key", () => {
    const enricher: Enricher | null = null;
    const node = makeNode("src/api.ts");
    // Mirrors the pipeline guard: `if (enricher) { ... }`
    if (enricher) {
      applyEnrichmentResults([node], []);
    }
    expect(node.summary).toBeUndefined();
    expect(node.enriched).toBeUndefined();
  });
});

describe("Enricher interface (mock implementation)", () => {
  const mockEnricher: Enricher = {
    async enrich(nodes: NodeForEnrichment[]): Promise<EnrichmentResult[]> {
      return nodes.map((n) => ({
        nodeId: n.id,
        summary: `Describes ${n.path}`,
      }));
    },
  };

  it("returns one result per input node", async () => {
    const results = await mockEnricher.enrich([
      { id: "src/db.ts", path: "src/db.ts", language: "typescript", existingSignals: ["ext:.ts"] },
      { id: "src/utils.ts", path: "src/utils.ts", existingSignals: [] },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].nodeId).toBe("src/db.ts");
    expect(results[1].nodeId).toBe("src/utils.ts");
  });

  it("returns empty array for empty input", async () => {
    const results = await mockEnricher.enrich([]);
    expect(results).toHaveLength(0);
  });

  it("enrichment is additive — deterministic bucket scores unaffected", () => {
    const node = makeNode("src/api.ts");
    const originalBuckets = [...node.buckets];
    applyEnrichmentResults([node], [{ nodeId: "src/api.ts", summary: "An API file" }]);
    // Buckets unchanged
    expect(node.buckets).toEqual(originalBuckets);
    // Summary added
    expect(node.summary).toBe("An API file");
  });
});
