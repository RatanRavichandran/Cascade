import { describe, it, expect } from "vitest";
import { inferLayer } from "@/lib/kg/graph/edges";
import type { ArtifactNode } from "@/lib/kg/graph/model";
import type { ParseResult } from "@/lib/kg/parse/treesitter";

function node(path: string, buckets: ArtifactNode["buckets"] = []): ArtifactNode {
  return { id: path, type: "file", path, buckets };
}

function parsed(imports: string[]): ParseResult {
  return {
    imports: imports.map((s) => ({ source: s, raw: `import '${s}'` })),
    functions: [],
    routes: [],
    language: "typescript",
  };
}

describe("inferLayer", () => {
  // ── Bucket-based rules ────────────────────────────────────────────────────

  it("Routes + .tsx path → UI", () => {
    const n = node("app/components/Button.tsx", [
      { bucket: "Routes and components", confidence: 0.8, signals: [] },
    ]);
    expect(inferLayer(n)).toBe("UI");
  });

  it("Routes + .jsx path → UI", () => {
    const n = node("src/views/Dashboard.jsx", [
      { bucket: "Routes and components", confidence: 0.8, signals: [] },
    ]);
    expect(inferLayer(n)).toBe("UI");
  });

  it("Routes + path contains 'page' → UI", () => {
    const n = node("src/pages/Home.ts", [
      { bucket: "Routes and components", confidence: 0.8, signals: [] },
    ]);
    expect(inferLayer(n)).toBe("UI");
  });

  it("API contracts bucket (non-UI path) → API", () => {
    const n = node("src/openapi.yaml", [
      { bucket: "API contracts", confidence: 0.9, signals: [] },
    ]);
    expect(inferLayer(n)).toBe("API");
  });

  it("Routes bucket + non-UI path → API", () => {
    const n = node("src/routes/users.ts", [
      { bucket: "Routes and components", confidence: 0.8, signals: [] },
    ]);
    expect(inferLayer(n)).toBe("API");
  });

  it("Tests bucket → undefined (tests have no layer)", () => {
    const n = node("tests/api.test.ts", [
      { bucket: "Tests", confidence: 0.95, signals: [] },
    ]);
    expect(inferLayer(n)).toBeUndefined();
  });

  it("Config bucket → undefined", () => {
    const n = node("tsconfig.json", [
      { bucket: "Config", confidence: 0.8, signals: [] },
    ]);
    expect(inferLayer(n)).toBeUndefined();
  });

  it("CI/CD bucket → undefined", () => {
    const n = node(".github/workflows/ci.yml", [
      { bucket: "CI/CD", confidence: 0.9, signals: [] },
    ]);
    expect(inferLayer(n)).toBeUndefined();
  });

  // ── Import-based rules (require ParseResult) ─────────────────────────────

  it("import of 'react' → UI", () => {
    const n = node("src/App.ts", [{ bucket: "Source code", confidence: 0.5, signals: [] }]);
    expect(inferLayer(n, parsed(["react"]))).toBe("UI");
  });

  it("import of 'vue' → UI", () => {
    const n = node("src/main.js", [{ bucket: "Source code", confidence: 0.5, signals: [] }]);
    expect(inferLayer(n, parsed(["vue"]))).toBe("UI");
  });

  it("import of 'pg' (postgres) → Data", () => {
    const n = node("src/db.ts", [{ bucket: "Source code", confidence: 0.5, signals: [] }]);
    expect(inferLayer(n, parsed(["pg"]))).toBe("Data");
  });

  it("import of 'prisma' → Data", () => {
    const n = node("src/prisma.ts", [{ bucket: "Source code", confidence: 0.5, signals: [] }]);
    expect(inferLayer(n, parsed(["@prisma/client"]))).toBe("Data");
  });

  it("import of 'express' → API", () => {
    const n = node("src/server.ts", [{ bucket: "Source code", confidence: 0.5, signals: [] }]);
    expect(inferLayer(n, parsed(["express"]))).toBe("API");
  });

  it("import of '@nestjs/core' → API", () => {
    const n = node("src/app.module.ts", [{ bucket: "Source code", confidence: 0.5, signals: [] }]);
    expect(inferLayer(n, parsed(["@nestjs/core"]))).toBe("API");
  });

  // ── Path-based heuristics ─────────────────────────────────────────────────

  it("path with /models/ → Data", () => {
    const n = node("src/models/User.ts", [{ bucket: "Source code", confidence: 0.5, signals: [] }]);
    expect(inferLayer(n)).toBe("Data");
  });

  it("path with /repository/ → Data", () => {
    const n = node("src/repository/UserRepo.ts", [{ bucket: "Source code", confidence: 0.5, signals: [] }]);
    expect(inferLayer(n)).toBe("Data");
  });

  it("path with /services/ → Service", () => {
    const n = node("src/services/AuthService.ts", [{ bucket: "Source code", confidence: 0.5, signals: [] }]);
    expect(inferLayer(n)).toBe("Service");
  });

  it("path with /controllers/ → API", () => {
    const n = node("src/controllers/UserController.ts", [{ bucket: "Source code", confidence: 0.5, signals: [] }]);
    expect(inferLayer(n)).toBe("API");
  });

  it("path with /components/ → UI", () => {
    const n = node("src/components/Button.ts", [{ bucket: "Source code", confidence: 0.5, signals: [] }]);
    expect(inferLayer(n)).toBe("UI");
  });

  it("path with /utils/ → Utility", () => {
    const n = node("src/utils/format.ts", [{ bucket: "Source code", confidence: 0.5, signals: [] }]);
    expect(inferLayer(n)).toBe("Utility");
  });

  it("Source code bucket with no other signals → Service (default)", () => {
    const n = node("src/index.ts", [{ bucket: "Source code", confidence: 0.5, signals: [] }]);
    expect(inferLayer(n)).toBe("Service");
  });

  it("no buckets and no path signals → undefined", () => {
    expect(inferLayer(node("random/file.txt"))).toBeUndefined();
  });
});
