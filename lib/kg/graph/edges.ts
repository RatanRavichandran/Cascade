import type { ArtifactNode, ArtifactEdge, EdgeType } from "./model";
import type { ParseResult } from "@/lib/kg/parse/treesitter";

export interface ParsedFileMap {
  [nodeId: string]: ParseResult;
}

// Resolve a relative import to a node id by matching against known node paths
function resolveImport(
  importSource: string,
  fromPath: string,
  knownPaths: Set<string>
): string | null {
  // Absolute / package imports — match against node ids directly
  if (!importSource.startsWith(".")) {
    // Match a node whose path ends with or contains the module name
    for (const p of knownPaths) {
      const base = p.replace(/\.(ts|tsx|js|jsx|py|rb|go)$/, "");
      if (base.endsWith("/" + importSource) || base === importSource) return p;
    }
    return null;
  }

  // Relative imports: resolve from the importer's directory
  const fromDir = fromPath.split("/").slice(0, -1).join("/");
  const candidates = [
    importSource,
    importSource + ".ts",
    importSource + ".tsx",
    importSource + ".js",
    importSource + ".jsx",
    importSource + ".mjs",
    importSource + ".cjs",
    importSource + ".py",
    importSource + "/index.ts",
    importSource + "/index.js",
    importSource + "/index.tsx",
    importSource + "/index.jsx",
  ].map((c) => {
    if (c.startsWith("./") || c.startsWith("../")) {
      return normalizePath(fromDir + "/" + c.replace(/^\.\//, ""));
    }
    return normalizePath(fromDir + "/" + c);
  });

  for (const candidate of candidates) {
    if (knownPaths.has(candidate)) return candidate;
  }
  return null;
}

function normalizePath(p: string): string {
  const parts = p.split("/");
  const result: string[] = [];
  for (const part of parts) {
    if (part === "..") result.pop();
    else if (part !== ".") result.push(part);
  }
  return result.join("/");
}

// Determine if a file is a test file by its classification or path
function isTestNode(node: ArtifactNode): boolean {
  return (
    node.buckets.some((b) => b.bucket === "Tests" && b.confidence > 0.5) ||
    /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(node.path) ||
    /_test\.(go|py)$/.test(node.path) ||
    /^(tests?|spec|__tests__)\//.test(node.path)
  );
}

export function buildStructuralEdges(
  nodes: ArtifactNode[],
  parseResults: ParsedFileMap
): ArtifactEdge[] {
  const edges: ArtifactEdge[] = [];
  const knownPaths = new Set(nodes.map((n) => n.path));
  const edgeSeen = new Set<string>();

  function addEdge(
    from: string,
    to: string,
    type: EdgeType,
    confidence: number,
    signals: string[]
  ) {
    const id = `${from}->${to}:${type}`;
    if (edgeSeen.has(id)) return;
    edgeSeen.add(id);
    edges.push({ id, from, to, type, confidence, signals });
  }

  for (const node of nodes) {
    const parsed = parseResults[node.id];
    if (!parsed) continue;

    const isTest = isTestNode(node);

    // Import edges
    for (const imp of parsed.imports) {
      const resolved = resolveImport(imp.source, node.path, knownPaths);
      if (!resolved || resolved === node.id) continue;

      if (isTest) {
        // test → module it imports = "tests" edge
        addEdge(node.id, resolved, "tests", 0.85, [`import:${imp.source}`]);
      } else {
        addEdge(node.id, resolved, "imports", 0.8, [`import:${imp.source}`]);
      }
    }

    // Route edges: file that defines routes also implements them (self-referential
    // edge only useful if there's a separate contract file; skip if same file)
    for (const route of parsed.routes) {
      addEdge(
        node.id,
        node.id,
        "defines_route",
        0.75,
        [`route:${route.method}:${route.path || "(dynamic)"}:${route.framework}`]
      );
      // Self-edges are not useful — only add if the node is the handler for another file
    }
  }

  // Remove self-referential defines_route edges (they're just annotations; add as metadata instead)
  return edges.filter((e) => !(e.type === "defines_route" && e.from === e.to));
}

// ---------------------------------------------------------------------------
// Architectural layer inference
// ---------------------------------------------------------------------------

import type { ArchLayer } from "./model";

export function inferLayer(node: ArtifactNode, parsed?: ParseResult): ArchLayer | undefined {
  const p = node.path.toLowerCase();
  const buckets = node.buckets.map((b) => b.bucket);

  // Explicit signals take priority
  if (buckets.includes("Routes and components") || buckets.includes("API contracts")) {
    // Further distinguish UI vs API
    if (p.includes("component") || p.includes("view") || p.includes("page") ||
        p.endsWith(".tsx") || p.endsWith(".jsx")) {
      return "UI";
    }
    return "API";
  }
  if (buckets.includes("Tests")) return undefined; // tests don't get a layer
  if (buckets.includes("Config") || buckets.includes("CI/CD")) return undefined;

  // Import-based inference
  if (parsed) {
    const importSources = parsed.imports.map((i) => i.source);
    if (importSources.some((s) => s.includes("react") || s.includes("vue") || s.includes("angular"))) {
      return "UI";
    }
    if (importSources.some((s) => ["pg", "mysql", "mongoose", "prisma", "sequelize", "typeorm", "sqlalchemy", "psycopg"].some((d) => s.includes(d)))) {
      return "Data";
    }
    if (importSources.some((s) => ["express", "fastapi", "fastify", "koa", "@nestjs"].some((d) => s.includes(d)))) {
      return "API";
    }
  }

  // Path-based heuristics
  if (/\/(model|entity|repository|dao|db|database|schema|migration)s?\//i.test(p)) return "Data";
  if (/\/(service|use.?case|domain|business|core)s?\//i.test(p)) return "Service";
  if (/\/(controller|handler|route|endpoint|api)s?\//i.test(p)) return "API";
  if (/\/(component|page|view|screen|ui|frontend)s?\//i.test(p)) return "UI";
  if (/\/(util|helper|lib|shared|common|tool)s?\//i.test(p)) return "Utility";

  // Source code without other signals → Service by default
  if (buckets.includes("Source code")) return "Service";

  return undefined;
}
