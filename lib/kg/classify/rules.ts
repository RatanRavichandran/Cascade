import type { Bucket, BucketScore } from "@/lib/kg/graph/model";
import type { SignalHit } from "./signals";

// Combine signal hits for a single file into final bucket scores.
// Multiple hits for the same bucket are merged: confidence = 1 - Π(1 - wᵢ)
export function scoreFromHits(hits: SignalHit[]): BucketScore[] {
  const bucketHits = new Map<Bucket, SignalHit[]>();

  for (const hit of hits) {
    const existing = bucketHits.get(hit.bucket) ?? [];
    existing.push(hit);
    bucketHits.set(hit.bucket, existing);
  }

  const scores: BucketScore[] = [];
  for (const [bucket, bucketHitList] of bucketHits) {
    // Noisy-OR combination: confidence = 1 - ∏(1 - wᵢ)
    const confidence = 1 - bucketHitList.reduce((acc, h) => acc * (1 - h.weight), 1);
    scores.push({
      bucket,
      confidence: Math.round(confidence * 100) / 100,
      signals: bucketHitList.map((h) => h.signal),
    });
  }

  // Sort descending by confidence
  return scores.sort((a, b) => b.confidence - a.confidence);
}

// Only keep bucket scores above this threshold for display.
export const CONFIDENCE_THRESHOLD = 0.3;
