import { describe, it, expect, vi, beforeEach } from "vitest";

// We mock fetch so the tests run without any network calls.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Import after stubbing global
const { ingestRepo } = await import("@/lib/kg/ingest/github");

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const REPO_META_RESPONSE = { default_branch: "main" };

const TREE_RESPONSE = {
  truncated: false,
  tree: [
    { path: "src/index.ts", type: "blob", size: 100, sha: "aaa", url: "https://api.github.com/repos/test/repo/git/blobs/aaa" },
    { path: "src/app.ts",   type: "blob", size: 200, sha: "bbb", url: "https://api.github.com/repos/test/repo/git/blobs/bbb" },
    { path: "tests/index.test.ts", type: "blob", size: 80, sha: "ccc", url: "https://api.github.com/repos/test/repo/git/blobs/ccc" },
    { path: "Dockerfile",   type: "blob", size: 50,  sha: "ddd", url: "https://api.github.com/repos/test/repo/git/blobs/ddd" },
    // should be skipped: directory
    { path: "src",          type: "tree", sha: "eee", url: "" },
    // should be skipped: image binary
    { path: "logo.png",     type: "blob", size: 5000, sha: "fff", url: "" },
    // should be skipped: oversized
    { path: "big.ts",       type: "blob", size: 999_999, sha: "ggg", url: "" },
  ],
};

function blobResponse(content: string) {
  return {
    encoding: "base64",
    content: Buffer.from(content).toString("base64"),
    size: Buffer.byteLength(content),
  };
}

const BLOB_CONTENTS: Record<string, string> = {
  aaa: 'export const x = 1;',
  bbb: 'import { x } from "./index";',
  ccc: 'import { x } from "../src/index";\ntest("works", () => {});',
  ddd: 'FROM node:20-alpine\nCMD ["node", "index.js"]',
};

beforeEach(() => {
  mockFetch.mockReset();

  mockFetch.mockImplementation((url: string) => {
    if (url.includes("/repos/test/repo") && !url.includes("git/") ) {
      return Promise.resolve(jsonResponse(REPO_META_RESPONSE));
    }
    if (url.includes("/git/trees/")) {
      return Promise.resolve(jsonResponse(TREE_RESPONSE));
    }
    // blob by sha
    for (const [sha, content] of Object.entries(BLOB_CONTENTS)) {
      if (url.includes(`/blobs/${sha}`)) {
        return Promise.resolve(jsonResponse(blobResponse(content)));
      }
    }
    return Promise.resolve(jsonResponse({ message: "Not Found" }, 404));
  });
});

describe("ingestRepo", () => {
  it("returns correct repo metadata", async () => {
    const { meta } = await ingestRepo("https://github.com/test/repo");
    expect(meta.owner).toBe("test");
    expect(meta.repo).toBe("repo");
    expect(meta.defaultBranch).toBe("main");
    expect(meta.repoUrl).toBe("https://github.com/test/repo");
  });

  it("includes relevant files and excludes directories, images, and oversized files", async () => {
    const { files } = await ingestRepo("https://github.com/test/repo");
    const paths = files.map((f) => f.path);

    expect(paths).toContain("src/index.ts");
    expect(paths).toContain("src/app.ts");
    expect(paths).toContain("tests/index.test.ts");
    expect(paths).toContain("Dockerfile");

    expect(paths).not.toContain("src");         // directory
    expect(paths).not.toContain("logo.png");    // image
    expect(paths).not.toContain("big.ts");      // oversized
  });

  it("decodes blob content correctly", async () => {
    const { files } = await ingestRepo("https://github.com/test/repo");
    const index = files.find((f) => f.path === "src/index.ts");
    expect(index?.content).toBe("export const x = 1;");
  });

  it("parses SSH-style github URLs", async () => {
    const { meta } = await ingestRepo("git@github.com:test/repo.git");
    expect(meta.owner).toBe("test");
    expect(meta.repo).toBe("repo");
  });
});
