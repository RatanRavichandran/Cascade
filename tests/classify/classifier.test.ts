import { describe, it, expect } from "vitest";
import { classifyFiles } from "@/lib/kg/classify/classifier";
import { CONFIDENCE_THRESHOLD } from "@/lib/kg/classify/rules";
import type { ScannedFile } from "@/lib/kg/ingest/scan";

function scanned(
  path: string,
  content = "",
  overrides: Partial<ScannedFile> = {},
): ScannedFile {
  const filename = path.split("/").pop()!.toLowerCase();
  const dotIdx = filename.lastIndexOf(".");
  const ext = dotIdx >= 0 ? filename.slice(dotIdx) : "";
  return { path, content, size: content.length, filename, ext, language: undefined, ...overrides };
}

describe("classifyFiles", () => {
  it("returns empty nodes and refs for empty input", () => {
    const result = classifyFiles([]);
    expect(result.nodes).toEqual([]);
    expect(result.externalRefs).toEqual([]);
  });

  it("each node has id equal to its path", () => {
    const { nodes } = classifyFiles([scanned("src/api.ts")]);
    const fileNode = nodes.find((n) => n.type === "file");
    expect(fileNode?.id).toBe("src/api.ts");
    expect(fileNode?.path).toBe("src/api.ts");
  });

  it("each node is typed 'file'", () => {
    const { nodes } = classifyFiles([scanned("src/utils.ts"), scanned("tests/foo.test.ts")]);
    const fileNodes = nodes.filter((n) => n.type === "file");
    expect(fileNodes).toHaveLength(2);
  });

  it("filters out bucket scores below CONFIDENCE_THRESHOLD", () => {
    // .yml files get Config at 0.5 — above threshold; nothing else should appear below 0.3
    const { nodes } = classifyFiles([scanned("config.yml", "", { ext: ".yml" })]);
    const fileNode = nodes.find((n) => n.type === "file")!;
    for (const score of fileNode.buckets) {
      expect(score.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
    }
  });

  it("every file node has at least one bucket score above the threshold", () => {
    const files = [
      scanned("src/index.ts", "", { ext: ".ts", language: "typescript" }),
      scanned("tests/api.test.ts", "", { ext: ".test.ts" }),
      scanned("Dockerfile", "", { ext: "" }),
    ];
    const { nodes } = classifyFiles(files);
    for (const n of nodes.filter((n) => n.type === "file")) {
      expect(n.buckets.length, `${n.path} has no bucket scores`).toBeGreaterThan(0);
    }
  });

  it("bucket scores on each node are sorted descending by confidence", () => {
    const { nodes } = classifyFiles([
      scanned("tests/api.test.ts", "", { ext: ".test.ts" }),
    ]);
    const n = nodes.find((n) => n.type === "file")!;
    for (let i = 1; i < n.buckets.length; i++) {
      expect(n.buckets[i - 1].confidence).toBeGreaterThanOrEqual(n.buckets[i].confidence);
    }
  });

  it("creates external_spec nodes for Jira refs found in markdown", () => {
    const content = "See PROJ-123 for requirements.";
    const { nodes, externalRefs } = classifyFiles([
      scanned("docs/spec.md", content, { ext: ".md" }),
    ]);
    const externalNode = nodes.find((n) => n.type === "external_spec");
    expect(externalNode).toBeDefined();
    expect(externalNode?.path).toBe("PROJ-123");
    expect(externalNode?.id).toBe("external:PROJ-123");
    expect(externalRefs).toHaveLength(1);
    expect(externalRefs[0].ref).toBe("PROJ-123");
    expect(externalRefs[0].sourceNodeId).toBe("docs/spec.md");
  });

  it("deduplicates external_spec nodes when the same ref appears in multiple files", () => {
    const ref = "PROJ-42";
    const { nodes } = classifyFiles([
      scanned("docs/a.md", `See ${ref}`, { ext: ".md" }),
      scanned("docs/b.md", `Also ${ref}`, { ext: ".md" }),
    ]);
    const externalNodes = nodes.filter((n) => n.type === "external_spec");
    const ids = externalNodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(externalNodes).toHaveLength(1);
  });

  it("does NOT create external_spec nodes for refs in non-markdown files", () => {
    // External refs are only extracted from markdown + .txt
    const { nodes } = classifyFiles([
      scanned("src/handler.ts", "// See PROJ-99 for context", { ext: ".ts" }),
    ]);
    const externalNodes = nodes.filter((n) => n.type === "external_spec");
    expect(externalNodes).toHaveLength(0);
  });

  it("externalRefs carry the correct sourceNodeId", () => {
    const { externalRefs } = classifyFiles([
      scanned("docs/design.md", "Based on PROJ-7", { ext: ".md" }),
    ]);
    expect(externalRefs[0].sourceNodeId).toBe("docs/design.md");
  });

  it("external_spec nodes are classified as Requirements / specs", () => {
    const { nodes } = classifyFiles([
      scanned("readme.md", "Implements JIRA-100", { ext: ".md" }),
    ]);
    const ext = nodes.find((n) => n.type === "external_spec");
    expect(ext?.buckets[0].bucket).toBe("Requirements / specs");
  });
});
