import fs from "fs";
import path from "path";
import type { ArtifactGraph } from "./model";

export interface GraphStore {
  save(repoId: string, graph: ArtifactGraph): Promise<void>;
  load(repoId: string): Promise<ArtifactGraph | null>;
  exists(repoId: string): Promise<boolean>;
}

const GRAPHS_DIR = path.join(process.cwd(), "graphs");

function graphPath(repoId: string): string {
  return path.join(GRAPHS_DIR, `${repoId}.graph.json`);
}

function ensureDir(): void {
  if (!fs.existsSync(GRAPHS_DIR)) {
    fs.mkdirSync(GRAPHS_DIR, { recursive: true });
  }
}

export const fileStore: GraphStore = {
  async save(repoId, graph) {
    ensureDir();
    fs.writeFileSync(graphPath(repoId), JSON.stringify(graph, null, 2), "utf-8");
  },

  async load(repoId) {
    const p = graphPath(repoId);
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, "utf-8");
    return JSON.parse(raw) as ArtifactGraph;
  },

  async exists(repoId) {
    return fs.existsSync(graphPath(repoId));
  },
};

// Default store used by the app — swap this to a Postgres impl at deploy time.
export const store: GraphStore = fileStore;
