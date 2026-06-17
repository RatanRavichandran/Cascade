import { describe, it, expect } from "vitest";
import { scanFiles } from "@/lib/kg/ingest/scan";
import type { RepoFile } from "@/lib/kg/ingest/github";

function file(path: string, content = ""): RepoFile {
  return { path, content, size: content.length, sha: "" };
}

describe("scanFiles", () => {
  it("maps known extensions to the correct language", () => {
    const cases: [string, string][] = [
      ["src/foo.ts", "typescript"],
      ["src/bar.tsx", "typescript"],
      ["src/util.js", "javascript"],
      ["src/util.jsx", "javascript"],
      ["src/main.py", "python"],
      ["src/handler.rb", "ruby"],
      ["cmd/main.go", "go"],
      ["Main.java", "java"],
      ["lib/parser.rs", "rust"],
      ["Service.cs", "csharp"],
      ["Api.proto", "protobuf"],
      ["schema.graphql", "graphql"],
      ["query.gql", "graphql"],
    ];

    for (const [path, expected] of cases) {
      const [result] = scanFiles([file(path)]);
      expect(result.language, path).toBe(expected);
    }
  });

  it("returns undefined language for unknown extensions", () => {
    const [result] = scanFiles([file("readme.md")]);
    expect(result.language).toBeUndefined();
  });

  it("extracts filename as the last path segment, lowercased", () => {
    const [result] = scanFiles([file("src/utils/StringHelper.TS")]);
    expect(result.filename).toBe("stringhelper.ts");
  });

  it("extracts ext lowercased", () => {
    const [result] = scanFiles([file("src/App.TSX")]);
    expect(result.ext).toBe(".tsx");
  });

  it("extracts ext correctly for dotfiles", () => {
    const [result] = scanFiles([file(".env")]);
    expect(result.ext).toBe(".env");
    expect(result.filename).toBe(".env");
  });

  it("returns empty ext for files with no extension", () => {
    const [result] = scanFiles([file("Makefile")]);
    expect(result.ext).toBe("");
    expect(result.filename).toBe("makefile");
  });

  it("preserves path, content, and size unchanged", () => {
    const f = file("src/api/handler.ts", 'export const x = 1;');
    const [result] = scanFiles([f]);
    expect(result.path).toBe("src/api/handler.ts");
    expect(result.content).toBe('export const x = 1;');
    expect(result.size).toBe(f.content.length);
  });

  it("handles multiple files independently", () => {
    const results = scanFiles([file("a.ts"), file("b.py"), file("c.md")]);
    expect(results).toHaveLength(3);
    expect(results[0].language).toBe("typescript");
    expect(results[1].language).toBe("python");
    expect(results[2].language).toBeUndefined();
  });

  it("returns empty array for empty input", () => {
    expect(scanFiles([])).toEqual([]);
  });
});
