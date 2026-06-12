export const BUCKETS = [
  "Requirements / specs",
  "Feature behavior",
  "Source code",
  "Routes and components",
  "API contracts",
  "Tests",
  "Config",
  "CI/CD",
  "Documentation",
  "Release / deployment hints",
] as const;

export type Bucket = (typeof BUCKETS)[number];

export const EDGE_TYPES = [
  "imports",
  "tests",
  "defines_route",
  "implements_route",
  "configures",
  "documents",
  "references_external_spec",
  "deploys",
] as const;

export type EdgeType = (typeof EDGE_TYPES)[number];

export type ArchLayer = "API" | "Service" | "Data" | "UI" | "Utility";

export interface BucketScore {
  bucket: Bucket;
  confidence: number; // 0..1
  signals: string[]; // e.g. ["ext:.ts", "route_def:next"]
}

export interface ArtifactNode {
  id: string;
  type: "file" | "symbol" | "external_spec" | "readme_section";
  path: string;
  buckets: BucketScore[];
  layer?: ArchLayer;
  summary?: string; // set by LLM enrichment
  language?: string;
  enriched?: boolean; // true when LLM pass has run
}

export interface ArtifactEdge {
  id: string;
  from: string; // node id
  to: string; // node id
  type: EdgeType;
  confidence: number;
  signals: string[];
}

export interface ArtifactGraph {
  repoId: string;
  repoUrl: string;
  createdAt: string; // ISO timestamp
  nodes: ArtifactNode[];
  edges: ArtifactEdge[];
}
