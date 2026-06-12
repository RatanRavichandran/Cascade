import type { RepoFile } from "./github";

const EXT_TO_LANG: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".rb": "ruby",
  ".go": "go",
  ".java": "java",
  ".kt": "kotlin",
  ".rs": "rust",
  ".cs": "csharp",
  ".cpp": "cpp",
  ".c": "c",
  ".h": "c",
  ".php": "php",
  ".swift": "swift",
  ".scala": "scala",
  ".ex": "elixir",
  ".exs": "elixir",
  ".proto": "protobuf",
  ".graphql": "graphql",
  ".gql": "graphql",
};

export interface ScannedFile extends RepoFile {
  language: string | undefined;
  filename: string;
  ext: string;
}

export function scanFiles(files: RepoFile[]): ScannedFile[] {
  return files.map((f) => {
    const filename = f.path.split("/").pop() ?? f.path;
    const dotIdx = filename.lastIndexOf(".");
    const ext = dotIdx >= 0 ? filename.slice(dotIdx).toLowerCase() : "";
    const language = EXT_TO_LANG[ext];
    return { ...f, filename: filename.toLowerCase(), ext, language };
  });
}
