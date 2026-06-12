/**
 * End-to-end classification integration tests.
 *
 * Runs the full deterministic pipeline (ingest → classify → edges) on two
 * fixture repos and asserts every bucket is populated. LLM enrichment is
 * never called here — OPENAI_API_KEY is not set in the test environment.
 */
import { describe, it, expect } from "vitest";
import { classifyFiles } from "@/lib/kg/classify/classifier";
import { BUCKETS, type Bucket } from "@/lib/kg/graph/model";
import { nextjsAppFixture } from "@/fixtures/nextjs-app";
import { pythonServiceFixture } from "@/fixtures/python-service";

// Helper: build a map of top-bucket → nodes for a fixture
function topBucketMap(fixture: typeof nextjsAppFixture) {
  const { nodes } = classifyFiles(fixture);
  const map = new Map<Bucket, string[]>();
  for (const bucket of BUCKETS) map.set(bucket, []);
  for (const node of nodes) {
    const top = node.buckets[0]?.bucket;
    if (top) map.get(top)?.push(node.id);
  }
  return map;
}

// Helper: collect ALL buckets a node belongs to (not just top)
function allBucketMap(fixture: typeof nextjsAppFixture) {
  const { nodes } = classifyFiles(fixture);
  const map = new Map<Bucket, string[]>();
  for (const bucket of BUCKETS) map.set(bucket, []);
  for (const node of nodes) {
    for (const b of node.buckets) {
      map.get(b.bucket)?.push(node.id);
    }
  }
  return map;
}

describe("Next.js app fixture — classification", () => {
  const topMap = topBucketMap(nextjsAppFixture);
  const allMap = allBucketMap(nextjsAppFixture);

  it("every bucket has at least one node (top or secondary)", () => {
    const empty = BUCKETS.filter((b) => (allMap.get(b)?.length ?? 0) === 0);
    expect(empty, `Buckets with zero nodes: ${empty.join(", ")}`).toEqual([]);
  });

  it("Source code bucket has nodes with top-bucket = Source code", () => {
    expect(topMap.get("Source code")?.length).toBeGreaterThan(0);
  });

  it("Tests bucket has nodes with top-bucket = Tests", () => {
    expect(topMap.get("Tests")?.length).toBeGreaterThan(0);
  });

  it("Config bucket has nodes with top-bucket = Config", () => {
    expect(topMap.get("Config")?.length).toBeGreaterThan(0);
  });

  it("CI/CD bucket has nodes with top-bucket = CI/CD", () => {
    expect(topMap.get("CI/CD")?.length).toBeGreaterThan(0);
  });

  it("Documentation bucket has nodes with top-bucket = Documentation", () => {
    expect(topMap.get("Documentation")?.length).toBeGreaterThan(0);
  });

  it("Release / deployment hints has nodes with top-bucket = Release / deployment hints", () => {
    expect(topMap.get("Release / deployment hints")?.length).toBeGreaterThan(0);
  });

  it("API contracts has nodes with top-bucket = API contracts", () => {
    expect(topMap.get("API contracts")?.length).toBeGreaterThan(0);
  });

  it("Routes and components has nodes with top-bucket = Routes and components", () => {
    expect(topMap.get("Routes and components")?.length).toBeGreaterThan(0);
  });

  it("Feature behavior has nodes with top-bucket = Feature behavior", () => {
    expect(topMap.get("Feature behavior")?.length).toBeGreaterThan(0);
  });

  it("Requirements / specs has nodes with top-bucket = Requirements / specs", () => {
    expect(topMap.get("Requirements / specs")?.length).toBeGreaterThan(0);
  });

  it("every node carries signals + confidence on each bucket score", () => {
    const { nodes } = classifyFiles(nextjsAppFixture);
    for (const node of nodes) {
      for (const score of node.buckets) {
        expect(score.signals.length, `${node.id} has empty signals for ${score.bucket}`).toBeGreaterThan(0);
        expect(score.confidence).toBeGreaterThan(0);
        expect(score.confidence).toBeLessThanOrEqual(1);
      }
    }
  });

  it("bucket scores are sorted descending by confidence", () => {
    const { nodes } = classifyFiles(nextjsAppFixture);
    for (const node of nodes) {
      for (let i = 1; i < node.buckets.length; i++) {
        expect(node.buckets[i].confidence).toBeLessThanOrEqual(node.buckets[i - 1].confidence);
      }
    }
  });
});

describe("Python FastAPI service fixture — classification", () => {
  const topMap = topBucketMap(pythonServiceFixture);
  const allMap = allBucketMap(pythonServiceFixture);

  it("every bucket has at least one node (top or secondary)", () => {
    const empty = BUCKETS.filter((b) => (allMap.get(b)?.length ?? 0) === 0);
    expect(empty, `Buckets with zero nodes: ${empty.join(", ")}`).toEqual([]);
  });

  it("Source code bucket has nodes with top-bucket = Source code", () => {
    expect(topMap.get("Source code")?.length).toBeGreaterThan(0);
  });

  it("Tests bucket has nodes with top-bucket = Tests", () => {
    expect(topMap.get("Tests")?.length).toBeGreaterThan(0);
  });

  it("Config bucket has nodes with top-bucket = Config", () => {
    expect(topMap.get("Config")?.length).toBeGreaterThan(0);
  });

  it("CI/CD bucket has nodes with top-bucket = CI/CD", () => {
    expect(topMap.get("CI/CD")?.length).toBeGreaterThan(0);
  });

  it("Documentation bucket has nodes with top-bucket = Documentation", () => {
    expect(topMap.get("Documentation")?.length).toBeGreaterThan(0);
  });

  it("Release / deployment hints has nodes with top-bucket = Release / deployment hints", () => {
    expect(topMap.get("Release / deployment hints")?.length).toBeGreaterThan(0);
  });

  it("API contracts has nodes with top-bucket = API contracts", () => {
    expect(topMap.get("API contracts")?.length).toBeGreaterThan(0);
  });

  it("Routes and components has nodes with top-bucket = Routes and components", () => {
    expect(topMap.get("Routes and components")?.length).toBeGreaterThan(0);
  });

  it("Feature behavior has nodes with top-bucket = Feature behavior", () => {
    expect(topMap.get("Feature behavior")?.length).toBeGreaterThan(0);
  });

  it("Requirements / specs has nodes with top-bucket = Requirements / specs", () => {
    expect(topMap.get("Requirements / specs")?.length).toBeGreaterThan(0);
  });

  it("uses Python-specific signals (ext:.py, imports:pytest)", () => {
    const { nodes } = classifyFiles(pythonServiceFixture);
    const signals = nodes.flatMap((n) => n.buckets.flatMap((b) => b.signals));
    expect(signals.some((s) => s === "ext:.py")).toBe(true);
    expect(signals.some((s) => s === "imports:pytest")).toBe(true);
  });
});
