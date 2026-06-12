import type { SignalHit } from "./signals";

// ---------------------------------------------------------------------------
// Import / require signals
// ---------------------------------------------------------------------------

const IMPORT_RULES: Array<{
  pattern: RegExp;
  bucket: SignalHit["bucket"];
  weight: number;
  signal: string;
}> = [
  // Test frameworks
  { pattern: /\b(describe|it|test|expect|beforeEach|afterEach|beforeAll|afterAll)\s*\(/, bucket: "Tests", weight: 0.7, signal: "imports:test_globals" },
  { pattern: /import\s+.*\bfrom\s+['"](?:vitest|jest|mocha|chai|sinon|jasmine|ava)['"]/, bucket: "Tests", weight: 0.85, signal: "imports:test_framework" },
  { pattern: /(?:import|from)\s+['"]pytest['"]|import\s+pytest/, bucket: "Tests", weight: 0.85, signal: "imports:pytest" },
  { pattern: /require\s*\(['"](?:jest|mocha|chai|sinon)['"]\)/, bucket: "Tests", weight: 0.8, signal: "imports:test_framework_cjs" },

  // Route frameworks
  { pattern: /import\s+.*\bfrom\s+['"](?:express|fastify|koa|hapi)['"]/, bucket: "Routes and components", weight: 0.75, signal: "imports:express_family" },
  { pattern: /from\s+['"]@nestjs\/(?:common|core)['"]/, bucket: "Routes and components", weight: 0.8, signal: "imports:nestjs" },
  { pattern: /from\s+['"](?:next\/server|next\/navigation|next\/headers)['"]/, bucket: "Routes and components", weight: 0.7, signal: "imports:nextjs_server" },
  { pattern: /from\s+['"](?:react-router|@remix-run\/router|vue-router)['"]/, bucket: "Routes and components", weight: 0.75, signal: "imports:router_lib" },

  // API contracts
  { pattern: /from\s+['"](?:openapi-types|@openapi-contrib|swagger-jsdoc)['"]/, bucket: "API contracts", weight: 0.8, signal: "imports:openapi_lib" },
  { pattern: /from\s+['"]@grpc\/grpc-js['"]/, bucket: "API contracts", weight: 0.85, signal: "imports:grpc" },

  // Config
  { pattern: /from\s+['"](?:dotenv|config|convict|zod)['"].*env/i, bucket: "Config", weight: 0.5, signal: "imports:config_lib" },

  // React components
  { pattern: /from\s+['"]react['"]/, bucket: "Routes and components", weight: 0.5, signal: "imports:react" },
];

export function detectImportSignals(content: string): SignalHit[] {
  const hits: SignalHit[] = [];
  for (const rule of IMPORT_RULES) {
    if (rule.pattern.test(content)) {
      hits.push({ signal: rule.signal, bucket: rule.bucket, weight: rule.weight });
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Route definition signals (regex-level; tree-sitter goes deeper in Task 8)
// ---------------------------------------------------------------------------

const ROUTE_PATTERNS: Array<[RegExp, string]> = [
  // Next.js App Router handlers
  [/export\s+(?:async\s+)?function\s+(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s*\(/, "next-route-handler"],
  // Express / Fastify
  [/(?:app|router|server)\s*\.\s*(?:get|post|put|delete|patch|use)\s*\(/, "express-style"],
  // NestJS decorators
  [/@(?:Get|Post|Put|Delete|Patch|Controller)\s*\(/, "nestjs-decorator"],
  // FastAPI / Flask
  [/@(?:app|router)\.(?:get|post|put|delete|patch)\s*\(/, "python-decorator"],
  // Django urls.py
  [/path\s*\(\s*['"]/, "django-path"],
  // React Router JSX
  [/<Route\s+path=/, "react-router-jsx"],
];

export function detectRouteDefinitions(content: string): SignalHit[] {
  const hits: SignalHit[] = [];
  for (const [pattern, framework] of ROUTE_PATTERNS) {
    if (pattern.test(content)) {
      hits.push({
        signal: `route_def:${framework}`,
        bucket: "Routes and components",
        weight: 0.75,
      });
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Deploy / release content signals
// ---------------------------------------------------------------------------

export function detectDeploySignals(content: string, filename: string): SignalHit[] {
  const hits: SignalHit[] = [];
  const lower = content.toLowerCase();

  if (lower.includes("from node:") || lower.includes("from python:") || lower.includes("from alpine")) {
    hits.push({ signal: "content:dockerfile_from", bucket: "Release / deployment hints", weight: 0.9 });
  }
  if (lower.includes("apiversion:") && (lower.includes("kind: deployment") || lower.includes("kind: service"))) {
    hits.push({ signal: "content:k8s_manifest", bucket: "Release / deployment hints", weight: 0.9 });
  }
  if (lower.includes("on: push") || lower.includes("on: pull_request") || lower.includes("runs-on:")) {
    hits.push({ signal: "content:gh_actions", bucket: "CI/CD", weight: 0.9 });
  }
  if (filename.endsWith(".sh") && (lower.includes("deploy") || lower.includes("release") || lower.includes("publish"))) {
    hits.push({ signal: "content:deploy_script", bucket: "Release / deployment hints", weight: 0.7 });
  }

  return hits;
}
