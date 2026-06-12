import type { SignalHit } from "./signals";

// Map heading keywords to buckets
const HEADING_RULES: Array<{
  keywords: string[];
  bucket: SignalHit["bucket"];
  weight: number;
  signal: string;
}> = [
  {
    keywords: ["requirement", "spec", "specification", "acceptance criteria", "user stor"],
    bucket: "Requirements / specs",
    weight: 0.75,
    signal: "readme:requirements_section",
  },
  {
    keywords: ["feature", "functionality", "how it works", "what it does", "behavior"],
    bucket: "Feature behavior",
    weight: 0.65,
    signal: "readme:feature_section",
  },
  {
    keywords: ["api", "endpoint", "route", "rest", "graphql", "swagger", "openapi"],
    bucket: "API contracts",
    weight: 0.7,
    signal: "readme:api_section",
  },
  {
    keywords: ["deploy", "deployment", "release", "publish", "docker", "kubernetes", "k8s", "heroku", "vercel", "aws", "gcp", "azure"],
    bucket: "Release / deployment hints",
    weight: 0.7,
    signal: "readme:deploy_section",
  },
  {
    keywords: ["ci", "cd", "pipeline", "github action", "travis", "circle", "jenkins", "build"],
    bucket: "CI/CD",
    weight: 0.65,
    signal: "readme:cicd_section",
  },
  {
    keywords: ["test", "testing", "coverage", "unit test", "integration test", "e2e"],
    bucket: "Tests",
    weight: 0.6,
    signal: "readme:testing_section",
  },
  {
    keywords: ["config", "configuration", "environment", "env var", "settings"],
    bucket: "Config",
    weight: 0.55,
    signal: "readme:config_section",
  },
];

export function detectReadmeSections(content: string): SignalHit[] {
  const hits: SignalHit[] = [];
  const headings = extractHeadings(content);

  for (const heading of headings) {
    const lower = heading.toLowerCase();
    for (const rule of HEADING_RULES) {
      if (rule.keywords.some((k) => lower.includes(k))) {
        // Don't duplicate the same bucket signal
        if (!hits.some((h) => h.signal === rule.signal)) {
          hits.push({ signal: rule.signal, bucket: rule.bucket, weight: rule.weight });
        }
      }
    }
  }

  return hits;
}

function extractHeadings(markdown: string): string[] {
  const headings: string[] = [];
  for (const line of markdown.split("\n")) {
    const match = line.match(/^#{1,6}\s+(.+)/);
    if (match) headings.push(match[1].trim());
  }
  return headings;
}

// External spec references: Jira ticket IDs, Confluence/Notion/Linear links
const EXTERNAL_SPEC_PATTERNS = [
  /\b[A-Z][A-Z0-9]+-\d+\b/g,                          // Jira-style: PROJ-123
  /https?:\/\/[^\s]*confluence[^\s]*/gi,               // Confluence URLs
  /https?:\/\/[^\s]*notion\.so[^\s]*/gi,               // Notion URLs
  /https?:\/\/[^\s]*linear\.app[^\s]*/gi,              // Linear URLs
  /https?:\/\/[^\s]*docs\.google\.com\/[^\s]*/gi,      // Google Docs
];

export interface ExternalRef {
  ref: string;
  type: "jira" | "confluence" | "notion" | "linear" | "gdoc" | "unknown";
}

export function extractExternalRefs(content: string): ExternalRef[] {
  const refs: ExternalRef[] = [];
  const seen = new Set<string>();

  const addRef = (ref: string, type: ExternalRef["type"]) => {
    if (!seen.has(ref)) {
      seen.add(ref);
      refs.push({ ref, type });
    }
  };

  for (const match of content.matchAll(EXTERNAL_SPEC_PATTERNS[0])) {
    addRef(match[0], "jira");
  }
  for (const match of content.matchAll(EXTERNAL_SPEC_PATTERNS[1])) {
    addRef(match[0], "confluence");
  }
  for (const match of content.matchAll(EXTERNAL_SPEC_PATTERNS[2])) {
    addRef(match[0], "notion");
  }
  for (const match of content.matchAll(EXTERNAL_SPEC_PATTERNS[3])) {
    addRef(match[0], "linear");
  }
  for (const match of content.matchAll(EXTERNAL_SPEC_PATTERNS[4])) {
    addRef(match[0], "gdoc");
  }

  return refs;
}
