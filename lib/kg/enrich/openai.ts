import OpenAI from "openai";
import type { Enricher, EnrichProgress, NodeForEnrichment, EnrichmentResult } from "./enricher";
import type { ArchLayer } from "../graph/model";

const BATCH_SIZE = 20;
const TIMEOUT_MS = 30_000;
const ARCH_LAYERS: ArchLayer[] = ["API", "Service", "Data", "UI", "Utility"];

export class OpenAIEnricher implements Enricher {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = "gpt-4o-mini") {
    this.client = new OpenAI({ apiKey, timeout: TIMEOUT_MS });
    this.model = model;
  }

  async enrich(nodes: NodeForEnrichment[], onProgress?: EnrichProgress): Promise<EnrichmentResult[]> {
    const results: EnrichmentResult[] = [];
    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      const batch = nodes.slice(i, i + BATCH_SIZE);
      try {
        const batchResults = await this.enrichBatch(batch);
        results.push(...batchResults);
      } catch {
        // graceful degradation: skip failed batch, continue with next
      }
      onProgress?.(Math.min(i + BATCH_SIZE, nodes.length), nodes.length);
    }
    return results;
  }

  private async enrichBatch(nodes: NodeForEnrichment[]): Promise<EnrichmentResult[]> {
    const payload = nodes.map((n) => ({
      id: n.id,
      path: n.path,
      language: n.language,
      topBucket: n.topBucket,
      signals: n.existingSignals.slice(0, 8),
      snippet: n.contentSnippet?.slice(0, 500),
    }));

    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You analyze code repository files. Return a JSON object with a "results" array.
Each entry must have:
- "nodeId": exact id from the input (do not modify)
- "summary": one sentence (≤120 chars) describing what this file does — specific and factual
- "layer": (optional) one of [${ARCH_LAYERS.join(", ")}] if the architectural layer is clear

Only include entries for nodes present in the input. Return ONLY valid JSON.`,
        },
        {
          role: "user",
          content: JSON.stringify(payload),
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    let parsed: { results?: unknown[] };
    try {
      parsed = JSON.parse(raw) as { results?: unknown[] };
    } catch {
      return [];
    }

    const items = Array.isArray(parsed.results) ? parsed.results : [];
    return items.flatMap((r): EnrichmentResult[] => {
      if (
        typeof r !== "object" ||
        r === null ||
        typeof (r as Record<string, unknown>).nodeId !== "string" ||
        typeof (r as Record<string, unknown>).summary !== "string"
      ) {
        return [];
      }
      const item = r as Record<string, unknown>;
      const result: EnrichmentResult = {
        nodeId: item.nodeId as string,
        summary: (item.summary as string).slice(0, 120),
      };
      if (typeof item.layer === "string" && ARCH_LAYERS.includes(item.layer as ArchLayer)) {
        result.layer = item.layer as ArchLayer;
      }
      return [result];
    });
  }
}

/** Returns an OpenAIEnricher if OPENAI_API_KEY is set in the environment, else null. */
export function getEnricher(): Enricher | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAIEnricher(key);
}
