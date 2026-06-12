import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { fileStore } from "@/lib/kg/graph/store";
import type { ArtifactGraph } from "@/lib/kg/graph/model";

const TEST_REPO_ID = "test-store-roundtrip";
const GRAPHS_DIR = path.join(process.cwd(), "graphs");

afterEach(() => {
  const p = path.join(GRAPHS_DIR, `${TEST_REPO_ID}.graph.json`);
  if (fs.existsSync(p)) fs.unlinkSync(p);
});

const sampleGraph: ArtifactGraph = {
  repoId: TEST_REPO_ID,
  repoUrl: "https://github.com/test/repo",
  createdAt: "2026-01-01T00:00:00.000Z",
  nodes: [
    {
      id: "src/index.ts",
      type: "file",
      path: "src/index.ts",
      buckets: [
        {
          bucket: "Source code",
          confidence: 0.9,
          signals: ["ext:.ts"],
        },
      ],
      language: "typescript",
    },
    {
      id: "tests/index.test.ts",
      type: "file",
      path: "tests/index.test.ts",
      buckets: [
        {
          bucket: "Tests",
          confidence: 0.95,
          signals: ["filename_pattern:*.test.ts"],
        },
      ],
    },
  ],
  edges: [
    {
      id: "tests/index.test.ts->src/index.ts",
      from: "tests/index.test.ts",
      to: "src/index.ts",
      type: "tests",
      confidence: 0.8,
      signals: ["import:src/index"],
    },
  ],
};

describe("fileStore", () => {
  it("round-trips a graph to and from disk losslessly", async () => {
    await fileStore.save(TEST_REPO_ID, sampleGraph);
    const loaded = await fileStore.load(TEST_REPO_ID);

    expect(loaded).not.toBeNull();
    expect(loaded).toEqual(sampleGraph);
  });

  it("returns null when graph does not exist", async () => {
    const result = await fileStore.load("nonexistent-repo-id");
    expect(result).toBeNull();
  });

  it("exists() returns false before save, true after", async () => {
    expect(await fileStore.exists(TEST_REPO_ID)).toBe(false);
    await fileStore.save(TEST_REPO_ID, sampleGraph);
    expect(await fileStore.exists(TEST_REPO_ID)).toBe(true);
  });

  it("overwrites an existing graph on re-save", async () => {
    await fileStore.save(TEST_REPO_ID, sampleGraph);

    const updated: ArtifactGraph = { ...sampleGraph, nodes: [] };
    await fileStore.save(TEST_REPO_ID, updated);

    const loaded = await fileStore.load(TEST_REPO_ID);
    expect(loaded?.nodes).toHaveLength(0);
  });
});
