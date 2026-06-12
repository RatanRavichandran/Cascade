import { describe, it, expect } from "vitest";
import { buildStructuralEdges } from "@/lib/kg/graph/edges";
import type { ArtifactNode } from "@/lib/kg/graph/model";
import type { ParsedFileMap } from "@/lib/kg/graph/edges";

const sourceNode: ArtifactNode = {
  id: "src/utils.ts",
  type: "file",
  path: "src/utils.ts",
  buckets: [{ bucket: "Source code", confidence: 0.9, signals: ["ext:.ts"] }],
};

const testNode: ArtifactNode = {
  id: "tests/utils.test.ts",
  type: "file",
  path: "tests/utils.test.ts",
  buckets: [{ bucket: "Tests", confidence: 0.95, signals: ["ext:.test.ts"] }],
};

const routeNode: ArtifactNode = {
  id: "app/api/users/route.ts",
  type: "file",
  path: "app/api/users/route.ts",
  buckets: [{ bucket: "Routes and components", confidence: 0.8, signals: ["route_def:next-route-handler"] }],
};

describe("buildStructuralEdges", () => {
  it("builds an 'imports' edge when a source file imports another", () => {
    const parseMap: ParsedFileMap = {
      "src/utils.ts": {
        imports: [],
        functions: [{ name: "formatDate", isExported: true }],
        routes: [],
        language: "typescript",
      },
      "app/api/users/route.ts": {
        imports: [{ source: "../../../src/utils", raw: "import { formatDate } from '../../../src/utils';" }],
        functions: [{ name: "GET", isExported: true }],
        routes: [{ method: "GET", path: "/api/users", framework: "next" }],
        language: "typescript",
      },
    };

    const edges = buildStructuralEdges([sourceNode, routeNode], parseMap);
    const importEdge = edges.find((e) => e.type === "imports");
    expect(importEdge).toBeDefined();
    expect(importEdge?.from).toBe("app/api/users/route.ts");
    expect(importEdge?.to).toBe("src/utils.ts");
  });

  it("builds a 'tests' edge when a test file imports the module under test", () => {
    const parseMap: ParsedFileMap = {
      "src/utils.ts": {
        imports: [],
        functions: [{ name: "formatDate", isExported: true }],
        routes: [],
        language: "typescript",
      },
      "tests/utils.test.ts": {
        imports: [{ source: "../src/utils", raw: "import { formatDate } from '../src/utils';" }],
        functions: [],
        routes: [],
        language: "typescript",
      },
    };

    const edges = buildStructuralEdges([sourceNode, testNode], parseMap);
    const testsEdge = edges.find((e) => e.type === "tests");
    expect(testsEdge).toBeDefined();
    expect(testsEdge?.from).toBe("tests/utils.test.ts");
    expect(testsEdge?.to).toBe("src/utils.ts");
  });

  it("does not create edges to unresolvable external packages", () => {
    const parseMap: ParsedFileMap = {
      "src/utils.ts": {
        imports: [{ source: "react", raw: "import React from 'react';" }],
        functions: [],
        routes: [],
        language: "typescript",
      },
    };

    const edges = buildStructuralEdges([sourceNode], parseMap);
    // "react" is not a known node path — should produce no edge
    expect(edges.every((e) => e.to !== "react")).toBe(true);
  });

  it("deduplicates edges with the same id", () => {
    const parseMap: ParsedFileMap = {
      "src/utils.ts": {
        imports: [
          { source: "../src/utils", raw: "" },
          { source: "../src/utils", raw: "" },
        ],
        functions: [],
        routes: [],
        language: "typescript",
      },
    };
    // Both imports point to the same target — should only create one edge
    const edges = buildStructuralEdges([sourceNode, testNode], parseMap);
    const importEdges = edges.filter((e) => e.from === "src/utils.ts" && e.type === "imports");
    const uniqueTargets = new Set(importEdges.map((e) => e.to));
    expect(importEdges.length).toBe(uniqueTargets.size);
  });
});
