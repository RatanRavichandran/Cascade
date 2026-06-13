import { describe, it, expect } from "vitest";
import { scoreFromHits, CONFIDENCE_THRESHOLD } from "@/lib/kg/classify/rules";
import type { SignalHit } from "@/lib/kg/classify/signals";

function hit(bucket: SignalHit["bucket"], weight: number, signal = "test"): SignalHit {
  return { bucket, weight, signal };
}

describe("scoreFromHits", () => {
  it("returns empty array for no hits", () => {
    expect(scoreFromHits([])).toEqual([]);
  });

  it("single hit: confidence equals the hit weight", () => {
    const scores = scoreFromHits([hit("Source code", 0.5)]);
    expect(scores).toHaveLength(1);
    expect(scores[0].confidence).toBe(0.5);
    expect(scores[0].bucket).toBe("Source code");
  });

  it("two hits for the same bucket combine via noisy-OR: 1 - (1-w1)(1-w2)", () => {
    // 1 - (1-0.5)(1-0.5) = 0.75
    const scores = scoreFromHits([
      hit("Source code", 0.5, "signal-a"),
      hit("Source code", 0.5, "signal-b"),
    ]);
    expect(scores).toHaveLength(1);
    expect(scores[0].confidence).toBe(0.75);
  });

  it("noisy-OR approaches 1 with many strong signals", () => {
    const scores = scoreFromHits([
      hit("Tests", 0.9, "ext:.test.ts"),
      hit("Tests", 0.7, "filename:tests/"),
    ]);
    // 1 - (1-0.9)(1-0.7) = 1 - 0.1*0.3 = 1 - 0.03 = 0.97
    expect(scores[0].confidence).toBe(0.97);
  });

  it("hits for different buckets produce separate score entries", () => {
    const scores = scoreFromHits([
      hit("Source code", 0.5),
      hit("Tests", 0.9),
    ]);
    expect(scores).toHaveLength(2);
    const buckets = scores.map((s) => s.bucket);
    expect(buckets).toContain("Source code");
    expect(buckets).toContain("Tests");
  });

  it("scores are sorted descending by confidence", () => {
    const scores = scoreFromHits([
      hit("Source code", 0.4),
      hit("Tests", 0.9),
      hit("Config", 0.6),
    ]);
    expect(scores[0].confidence).toBeGreaterThanOrEqual(scores[1].confidence);
    expect(scores[1].confidence).toBeGreaterThanOrEqual(scores[2].confidence);
  });

  it("confidence is rounded to 2 decimal places", () => {
    // 1 - (1-0.9)(1-0.8) = 1 - 0.1*0.2 = 1 - 0.02 = 0.98 — exact, but test a case that rounds
    // 1 - (1-0.7)(1-0.6) = 1 - 0.3*0.4 = 1 - 0.12 = 0.88
    const scores = scoreFromHits([
      hit("Documentation", 0.7, "a"),
      hit("Documentation", 0.6, "b"),
    ]);
    const decimals = scores[0].confidence.toString().split(".")[1]?.length ?? 0;
    expect(decimals).toBeLessThanOrEqual(2);
  });

  it("collects all signal strings for a merged bucket", () => {
    const scores = scoreFromHits([
      hit("Config", 0.5, "ext:.yml"),
      hit("Config", 0.6, "filename:docker-compose"),
    ]);
    expect(scores[0].signals).toContain("ext:.yml");
    expect(scores[0].signals).toContain("filename:docker-compose");
  });

  it("CONFIDENCE_THRESHOLD is 0.3", () => {
    expect(CONFIDENCE_THRESHOLD).toBe(0.3);
  });
});
