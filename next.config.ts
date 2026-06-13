import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },

  // web-tree-sitter loads its wasm via fs/require at runtime — keep it external so
  // webpack doesn't bundle/mangle it. graphology must stay external too.
  serverExternalPackages: ["graphology", "web-tree-sitter"],

  // The tree-sitter wasm files are loaded by runtime-computed absolute paths, so Next's
  // output file tracing can't detect them statically and would drop them from the
  // serverless bundle — causing every parse to return null (zero edges) on Vercel.
  // Force them into the /api/ingest function (the only route that parses).
  outputFileTracingIncludes: {
    "/api/ingest": [
      "./node_modules/tree-sitter-wasms/out/*.wasm",
      "./node_modules/web-tree-sitter/tree-sitter.wasm",
    ],
  },
};

export default nextConfig;
