import type { Bucket } from "@/lib/kg/graph/model";

export interface SignalHit {
  signal: string;   // e.g. "ext:.ts", "filename_pattern:*.test.ts"
  bucket: Bucket;
  weight: number;   // 0..1 contribution to final confidence
}

// ---------------------------------------------------------------------------
// Extension signals
// ---------------------------------------------------------------------------

const EXT_BUCKET_MAP: Array<[string[], Bucket, number]> = [
  [[".test.ts", ".test.tsx", ".test.js", ".spec.ts", ".spec.tsx", ".spec.js", ".spec.rb", "_test.go", "_spec.rb"], "Tests", 0.9],
  [[".feature", ".story"], "Feature behavior", 0.9],
  [[".proto"], "API contracts", 0.9],
  [[".graphql", ".gql"], "API contracts", 0.85],
  [[".md", ".mdx", ".rst", ".adoc"], "Documentation", 0.7],
  [[".yml", ".yaml"], "Config", 0.5],
  [[".json"], "Config", 0.4],
  [[".toml", ".ini"], "Config", 0.6],
  [[".env", ".env.example", ".env.sample"], "Config", 0.85],
  [[".sh", ".bash"], "CI/CD", 0.4],
  [[".ts", ".tsx", ".js", ".jsx", ".mjs"], "Source code", 0.5],
  [[".py", ".rb", ".go", ".java", ".kt", ".rs", ".cs", ".cpp", ".c"], "Source code", 0.5],
  [[".php", ".swift", ".scala", ".ex", ".exs"], "Source code", 0.5],
];

export function detectByExtension(ext: string, filename: string): SignalHit[] {
  const hits: SignalHit[] = [];

  // Multi-part extension check first (e.g. .test.ts)
  for (const [exts, bucket, weight] of EXT_BUCKET_MAP) {
    for (const e of exts) {
      if (filename.endsWith(e)) {
        hits.push({ signal: `ext:${e}`, bucket, weight });
      }
    }
  }

  // Simple single extension (only if no multi-part hit for that bucket already)
  const hasBucket = (b: Bucket) => hits.some((h) => h.bucket === b);

  for (const [exts, bucket, weight] of EXT_BUCKET_MAP) {
    if (exts.some((e) => e === ext)) {
      if (!hasBucket(bucket)) {
        hits.push({ signal: `ext:${ext}`, bucket, weight });
      }
    }
  }

  return hits;
}

// ---------------------------------------------------------------------------
// Filename signals
// ---------------------------------------------------------------------------

interface FilenameRule {
  match: (name: string, path: string) => boolean;
  bucket: Bucket;
  weight: number;
  signal: string;
}

const FILENAME_RULES: FilenameRule[] = [
  // CI/CD
  {
    match: (_, p) =>
      /\.(github|gitlab)\/workflows?\//i.test(p) ||
      p.includes(".circleci/") ||
      p.includes(".travis.yml") ||
      p.includes("jenkinsfile") ||
      p.includes(".gitlab-ci.yml") ||
      p.includes("azure-pipelines.yml") ||
      p.includes(".buildkite/"),
    bucket: "CI/CD",
    weight: 0.95,
    signal: "filename:ci_config",
  },
  // Release / deployment hints
  {
    match: (n) => n === "dockerfile" || n.startsWith("dockerfile."),
    bucket: "Release / deployment hints",
    weight: 0.9,
    signal: "filename:dockerfile",
  },
  {
    match: (_, p) =>
      /^(k8s|kubernetes|helm|deploy|infra|ops|charts?)\//i.test(p) ||
      p.includes("docker-compose"),
    bucket: "Release / deployment hints",
    weight: 0.85,
    signal: "filename:deploy_infra",
  },
  {
    match: (n) => n === "changelog.md" || n === "changelog" || n === "releases.md",
    bucket: "Release / deployment hints",
    weight: 0.8,
    signal: "filename:changelog",
  },
  // API contracts
  {
    match: (n) =>
      n.includes("openapi") ||
      n.includes("swagger") ||
      n.endsWith("api.yaml") ||
      n.endsWith("api.yml") ||
      n.endsWith("api.json"),
    bucket: "API contracts",
    weight: 0.9,
    signal: "filename:openapi",
  },
  // Config
  {
    match: (n) =>
      n.endsWith(".config.ts") ||
      n.endsWith(".config.js") ||
      n.endsWith(".config.mjs") ||
      n === "tsconfig.json" ||
      n === "package.json" ||
      n === "pyproject.toml" ||
      n === "go.mod" ||
      n === "pom.xml" ||
      n === "gemfile" ||
      n === "cargo.toml" ||
      n.endsWith("settings.py") ||
      n.endsWith("settings.ts"),
    bucket: "Config",
    weight: 0.85,
    signal: "filename:config_manifest",
  },
  // Documentation
  {
    match: (n, p) =>
      n === "readme.md" ||
      n === "readme" ||
      n === "contributing.md" ||
      n === "license" ||
      n === "license.md" ||
      /^(docs?|documentation|wiki)\//i.test(p),
    bucket: "Documentation",
    weight: 0.85,
    signal: "filename:docs",
  },
  // Tests
  {
    match: (_, p) =>
      /^(tests?|spec|__tests__|e2e|integration|unit)\//i.test(p),
    bucket: "Tests",
    weight: 0.8,
    signal: "filename:test_dir",
  },
];

export function detectByFilename(
  filename: string,
  path: string
): SignalHit[] {
  const nameLower = filename.toLowerCase();
  const hits: SignalHit[] = [];
  for (const rule of FILENAME_RULES) {
    if (rule.match(nameLower, path)) {
      hits.push({ signal: rule.signal, bucket: rule.bucket, weight: rule.weight });
    }
  }
  return hits;
}
