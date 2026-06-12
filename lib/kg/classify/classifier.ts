import type { ScannedFile } from "@/lib/kg/ingest/scan";
import type { ArtifactNode } from "@/lib/kg/graph/model";
import { detectByExtension, detectByFilename } from "./signals";
import { detectManifestSignals } from "./manifests";
import { detectReadmeSections, extractExternalRefs } from "./readme";
import { detectImportSignals, detectRouteDefinitions, detectDeploySignals } from "./content";
import { scoreFromHits, CONFIDENCE_THRESHOLD } from "./rules";

export interface ExternalRefResult {
  ref: string;
  type: string;
  sourceNodeId: string;
}

export interface ClassifyResult {
  nodes: ArtifactNode[];
  externalRefs: ExternalRefResult[];
}

export function classifyFiles(files: ScannedFile[]): ClassifyResult {
  const nodes: ArtifactNode[] = [];
  const externalRefs: ExternalRefResult[] = [];

  for (const file of files) {
    const isMarkdown = [".md", ".mdx", ".rst", ".adoc"].includes(file.ext);

    const hits = [
      ...detectByExtension(file.ext, file.filename),
      ...detectByFilename(file.filename, file.path),
      ...detectManifestSignals(file.filename, file.content),
      ...(isMarkdown ? detectReadmeSections(file.content) : []),
      ...detectImportSignals(file.content),
      ...detectRouteDefinitions(file.content),
      ...detectDeploySignals(file.content, file.filename),
    ];

    const buckets = scoreFromHits(hits).filter(
      (s) => s.confidence >= CONFIDENCE_THRESHOLD
    );

    nodes.push({
      id: file.path,
      type: "file",
      path: file.path,
      buckets,
      language: file.language,
    });

    // Extract external spec references from all text files (not just markdown)
    if (isMarkdown || file.ext === ".txt") {
      for (const ref of extractExternalRefs(file.content)) {
        externalRefs.push({ ...ref, sourceNodeId: file.path });
      }
    }
  }

  // Build placeholder nodes for unique external refs
  const seenRefs = new Set<string>();
  for (const ref of externalRefs) {
    if (!seenRefs.has(ref.ref)) {
      seenRefs.add(ref.ref);
      nodes.push({
        id: `external:${ref.ref}`,
        type: "external_spec",
        path: ref.ref,
        buckets: [
          {
            bucket: "Requirements / specs",
            confidence: 0.6,
            signals: [`external_ref:${ref.type}`],
          },
        ],
      });
    }
  }

  return { nodes, externalRefs };
}
