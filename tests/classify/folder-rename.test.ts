/**
 * Folder-rename invariant test.
 *
 * The classifier must never make a classification decision based on folder
 * names alone (PRD §Core Design Principles §1). This test strips src/, tests/,
 * and docs/ prefixes from fixture file paths and verifies that the top bucket
 * of each file does not change.
 */
import { describe, it, expect } from "vitest";
import { classifyFiles } from "@/lib/kg/classify/classifier";
import type { ScannedFile } from "@/lib/kg/ingest/scan";

// Files chosen because they span all buckets and rely on per-file content
// signals (extension, filename pattern, content), NOT folder-prefix signals.
function f(
  path: string,
  ext: string,
  language: string | undefined,
  content: string
): ScannedFile {
  const filename = path.split("/").pop()!.toLowerCase();
  return { path, filename, ext, language, content, size: content.length, sha: "fixture" };
}

const files: ScannedFile[] = [
  // Tests — primary signal: .test.ts extension (not the tests/ folder)
  f("tests/api.test.ts", ".ts", "typescript",
    "import { describe, it, expect } from 'vitest';\ndescribe('api', () => { it('works', () => expect(1).toBe(1)); });"),
  // Tests — primary signal: .spec.ts extension
  f("src/auth.spec.ts", ".ts", "typescript",
    "import { describe, it, expect } from 'vitest';\ndescribe('auth', () => { it('signs in', () => expect(true).toBe(true)); });"),
  // Source code — primary signal: .ts extension; no test/route content
  f("src/lib/utils.ts", ".ts", "typescript",
    "export function clamp(n: number, min: number, max: number) { return Math.min(Math.max(n, min), max); }"),
  // Source code — primary signal: .py extension; no route content
  f("src/utils/helpers.py", ".py", "python",
    "def slugify(text: str) -> str:\n    return text.lower().replace(' ', '-')"),
  // Documentation — primary signal: ext:.md (docs/ also contributes, but .md alone suffices)
  f("docs/architecture.md", ".md", undefined,
    "# Architecture\n\nThis document describes the system design.\n"),
  // Config — primary signal: filename:config_manifest (tsconfig.json)
  f("src/tsconfig.json", ".json", undefined,
    JSON.stringify({ compilerOptions: { strict: true } })),
  // CI/CD — primary signal: filename:ci_config (full path matches .github/workflows/)
  f(".github/workflows/build.yml", ".yml", undefined,
    "name: Build\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm run build"),
  // Release / deployment hints — primary signal: filename:dockerfile
  f("Dockerfile", "", undefined,
    "FROM node:20-alpine\nCMD [\"node\", \"index.js\"]"),
  // API contracts — primary signal: filename:openapi
  f("docs/openapi.yaml", ".yaml", undefined,
    "openapi: 3.0.0\ninfo:\n  title: API\n  version: 1.0.0"),
  // Feature behavior — primary signal: .feature extension
  f("features/login.feature", ".feature", undefined,
    "Feature: Login\n  Scenario: valid credentials\n    Given I have an account\n    When I log in\n    Then I see the dashboard"),
];

/** Strip src/, tests/, docs/ prefixes (one level deep) from a path. */
function stripFolderPrefix(path: string): string {
  return path.replace(/^(?:src|tests?|docs?|spec)\//i, "");
}

describe("folder-rename invariant", () => {
  // Compute top buckets for both original and stripped paths
  const original = classifyFiles(files);
  const stripped = classifyFiles(
    files.map((f) => ({
      ...f,
      path: stripFolderPrefix(f.path),
    }))
  );

  const originalTopMap = new Map(
    original.nodes.map((n) => [n.id, n.buckets[0]?.bucket])
  );
  const strippedTopMap = new Map(
    stripped.nodes.map((n) => [n.id, n.buckets[0]?.bucket])
  );

  for (const file of files) {
    const originalId = file.path;
    const strippedId = stripFolderPrefix(file.path);

    it(`${file.path}: top bucket unchanged after stripping folder prefix`, () => {
      const originalBucket = originalTopMap.get(originalId);
      const strippedBucket = strippedTopMap.get(strippedId);

      expect(originalBucket).toBeDefined();
      expect(strippedBucket).toBeDefined();
      expect(
        strippedBucket,
        `"${file.path}" changed from "${originalBucket}" to "${strippedBucket}" after folder strip`
      ).toBe(originalBucket);
    });
  }

  it("all files still get at least one bucket score after stripping", () => {
    for (const node of stripped.nodes) {
      expect(
        node.buckets.length,
        `${node.id} has no bucket scores after path strip`
      ).toBeGreaterThan(0);
    }
  });
});
