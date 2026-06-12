const GITHUB_API = "https://api.github.com";

// File size cap — skip blobs larger than this to stay within serverless memory/time budgets.
const MAX_FILE_BYTES = 200_000; // 200 KB

// Maximum files to fetch blobs for. Prevents very large repos from timing out.
const MAX_FILES = 400;

// Per-request timeout — prevents a single slow GitHub API call from hanging the pipeline.
const FETCH_TIMEOUT_MS = 12_000;

// Extensions we care about for classification. Anything else is skipped at the tree stage.
const INCLUDED_EXTENSIONS = new Set([
  // source
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rb", ".go", ".java", ".kt", ".rs", ".cs", ".cpp", ".c", ".h",
  ".php", ".swift", ".scala", ".ex", ".exs",
  // UI components / templates / styles
  ".vue", ".svelte", ".astro", ".html", ".htm",
  ".css", ".scss", ".sass", ".less",
  // markup / docs
  ".md", ".mdx", ".txt", ".rst", ".adoc",
  ".feature",                       // Gherkin/BDD specs
  // config / infra
  ".json", ".yaml", ".yml", ".toml", ".ini", ".env", ".xml",
  ".gradle", ".tf", ".hcl",
  // api contracts
  ".proto", ".graphql", ".gql",
  // data / schema
  ".sql", ".prisma",
  // ci / deploy
  ".sh", ".bash", ".dockerfile",
]);

// Always-include filenames regardless of extension (no extension or special names).
const INCLUDED_FILENAMES = new Set([
  "dockerfile",
  "jenkinsfile",
  "makefile",
  "procfile",
  "gemfile",
  "rakefile",
  "vagrantfile",
  ".env",
  ".env.example",
  ".env.sample",
  ".nvmrc",
  ".node-version",
  ".ruby-version",
  ".python-version",
]);

export interface RepoFile {
  path: string;
  content: string;
  size: number; // bytes
  sha: string;
}

export interface RepoMeta {
  owner: string;
  repo: string;
  defaultBranch: string;
  repoUrl: string;
}

function parseRepoUrl(url: string): { owner: string; repo: string } {
  const match = url.match(
    /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/
  );
  if (!match) throw new Error(`Cannot parse GitHub repo URL: ${url}`);
  return { owner: match[1], repo: match[2] };
}

function githubHeaders(): HeadersInit {
  const token = process.env.GITHUB_TOKEN;
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function ghFetch(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: githubHeaders(), signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GitHub API ${res.status} for ${url}: ${body}`);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function getDefaultBranch(owner: string, repo: string): Promise<string> {
  const res = await ghFetch(`${GITHUB_API}/repos/${owner}/${repo}`);
  const data = (await res.json()) as { default_branch: string };
  return data.default_branch;
}

interface TreeItem {
  path: string;
  type: "blob" | "tree";
  size?: number;
  sha: string;
  url: string;
}

async function getTree(
  owner: string,
  repo: string,
  branch: string
): Promise<TreeItem[]> {
  const res = await ghFetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
  );
  const data = (await res.json()) as {
    tree: TreeItem[];
    truncated: boolean;
  };
  if (data.truncated) {
    console.warn(`[cascade] Tree truncated for ${owner}/${repo} — very large repo.`);
  }
  return data.tree;
}

function shouldInclude(item: TreeItem): boolean {
  if (item.type !== "blob") return false;
  if (item.size !== undefined && item.size > MAX_FILE_BYTES) return false;

  const name = item.path.split("/").pop()?.toLowerCase() ?? "";
  if (INCLUDED_FILENAMES.has(name)) return true;

  const ext = name.includes(".") ? "." + name.split(".").pop() : "";
  return INCLUDED_EXTENSIONS.has(ext);
}

async function fetchBlob(url: string): Promise<string | null> {
  const res = await ghFetch(url);
  const data = (await res.json()) as {
    content?: string;
    encoding?: string;
    size?: number;
  };

  if (data.size !== undefined && data.size > MAX_FILE_BYTES) return null;
  if (data.encoding !== "base64" || !data.content) return null;

  try {
    return Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8");
  } catch {
    return null;
  }
}

// Fetch blobs in parallel batches to stay within rate limits.
async function fetchBlobs(
  items: TreeItem[],
  batchSize = 10
): Promise<RepoFile[]> {
  const results: RepoFile[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const settled = await Promise.allSettled(
      batch.map(async (item) => {
        const content = await fetchBlob(item.url);
        if (content === null) return null;
        return {
          path: item.path,
          content,
          size: item.size ?? Buffer.byteLength(content),
          sha: item.sha,
        } satisfies RepoFile;
      })
    );

    for (const result of settled) {
      if (result.status === "fulfilled" && result.value !== null) {
        results.push(result.value);
      }
    }
  }

  return results;
}

export async function ingestRepo(repoUrl: string): Promise<{
  meta: RepoMeta;
  files: RepoFile[];
}> {
  const { owner, repo } = parseRepoUrl(repoUrl);
  const defaultBranch = await getDefaultBranch(owner, repo);
  const tree = await getTree(owner, repo, defaultBranch);

  const relevant = tree.filter(shouldInclude).slice(0, MAX_FILES);
  console.log(`[cascade] ingest: ${tree.length} tree items → ${relevant.length} relevant files (capped at ${MAX_FILES})`);
  const files = await fetchBlobs(relevant);
  console.log(`[cascade] ingest: fetched ${files.length} file blobs`);

  return {
    meta: { owner, repo, defaultBranch, repoUrl },
    files,
  };
}
