import { describe, it, expect } from "vitest";
import { detectByExtension, detectByFilename } from "@/lib/kg/classify/signals";

describe("detectByExtension", () => {
  it("classifies .test.ts as Tests with high confidence", () => {
    const hits = detectByExtension(".ts", "index.test.ts");
    const testHit = hits.find((h) => h.bucket === "Tests");
    expect(testHit).toBeDefined();
    expect(testHit!.weight).toBeGreaterThan(0.8);
  });

  it("classifies plain .ts as Source code", () => {
    const hits = detectByExtension(".ts", "index.ts");
    const sourceHit = hits.find((h) => h.bucket === "Source code");
    expect(sourceHit).toBeDefined();
  });

  it("does NOT classify plain .ts as Tests", () => {
    const hits = detectByExtension(".ts", "index.ts");
    expect(hits.find((h) => h.bucket === "Tests")).toBeUndefined();
  });

  it("classifies .proto as API contracts", () => {
    const hits = detectByExtension(".proto", "service.proto");
    expect(hits.find((h) => h.bucket === "API contracts")).toBeDefined();
  });

  it("classifies .graphql as API contracts", () => {
    const hits = detectByExtension(".graphql", "schema.graphql");
    expect(hits.find((h) => h.bucket === "API contracts")).toBeDefined();
  });

  it("classifies .md as Documentation", () => {
    const hits = detectByExtension(".md", "readme.md");
    expect(hits.find((h) => h.bucket === "Documentation")).toBeDefined();
  });

  it("classifies .yml as Config", () => {
    const hits = detectByExtension(".yml", "config.yml");
    expect(hits.find((h) => h.bucket === "Config")).toBeDefined();
  });
});

describe("detectByFilename", () => {
  it("classifies Dockerfile as Release / deployment hints", () => {
    const hits = detectByFilename("Dockerfile", "Dockerfile");
    expect(hits.find((h) => h.bucket === "Release / deployment hints")).toBeDefined();
  });

  it("classifies .github/workflows/ci.yml as CI/CD", () => {
    const hits = detectByFilename("ci.yml", ".github/workflows/ci.yml");
    expect(hits.find((h) => h.bucket === "CI/CD")).toBeDefined();
  });

  it("classifies .gitlab-ci.yml as CI/CD", () => {
    const hits = detectByFilename(".gitlab-ci.yml", ".gitlab-ci.yml");
    expect(hits.find((h) => h.bucket === "CI/CD")).toBeDefined();
  });

  it("classifies package.json as Config", () => {
    const hits = detectByFilename("package.json", "package.json");
    expect(hits.find((h) => h.bucket === "Config")).toBeDefined();
  });

  it("classifies file in tests/ dir as Tests", () => {
    const hits = detectByFilename("utils.ts", "tests/utils.ts");
    expect(hits.find((h) => h.bucket === "Tests")).toBeDefined();
  });

  it("does NOT classify src/index.ts as CI/CD", () => {
    const hits = detectByFilename("index.ts", "src/index.ts");
    expect(hits.find((h) => h.bucket === "CI/CD")).toBeUndefined();
  });

  it("classifies openapi.yaml as API contracts", () => {
    const hits = detectByFilename("openapi.yaml", "openapi.yaml");
    expect(hits.find((h) => h.bucket === "API contracts")).toBeDefined();
  });

  it("classifies CHANGELOG.md as Release / deployment hints", () => {
    const hits = detectByFilename("CHANGELOG.md", "CHANGELOG.md");
    expect(hits.find((h) => h.bucket === "Release / deployment hints")).toBeDefined();
  });
});
