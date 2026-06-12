import Parser from "web-tree-sitter";
import path from "path";
import fs from "fs";

const WASM_DIR = path.join(
  process.cwd(),
  "node_modules",
  "tree-sitter-wasms",
  "out"
);

// In web-tree-sitter 0.22, the runtime wasm is "tree-sitter.wasm".
// Must pass locateFile explicitly so Next.js (which bundles to .next/server/vendor-chunks/)
// doesn't lose the wasm file at runtime.
const PARSER_WASM = path.join(
  process.cwd(),
  "node_modules",
  "web-tree-sitter",
  "tree-sitter.wasm"
);

const LANG_WASM: Record<string, string> = {
  typescript: "tree-sitter-typescript.wasm",
  javascript: "tree-sitter-javascript.wasm",
  python: "tree-sitter-python.wasm",
  go: "tree-sitter-go.wasm",
  java: "tree-sitter-java.wasm",
  rust: "tree-sitter-rust.wasm",
};

let initialized = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const langCache = new Map<string, any>();

async function ensureInit(): Promise<void> {
  if (initialized) return;
  await Parser.init({ locateFile: () => PARSER_WASM });
  initialized = true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadLanguage(lang: string): Promise<any | null> {
  if (langCache.has(lang)) return langCache.get(lang)!;
  const wasmFile = LANG_WASM[lang];
  if (!wasmFile) return null;
  const wasmPath = path.join(WASM_DIR, wasmFile);
  if (!fs.existsSync(wasmPath)) return null;
  try {
    await ensureInit();
    const language = await Parser.Language.load(wasmPath);
    langCache.set(lang, language);
    return language;
  } catch {
    return null;
  }
}

export interface ParsedImport {
  source: string;
  raw: string;
}

export interface ParsedFunction {
  name: string;
  isExported: boolean;
}

export interface ParsedRoute {
  method: string;
  path: string;
  framework: string;
}

export interface ParseResult {
  imports: ParsedImport[];
  functions: ParsedFunction[];
  routes: ParsedRoute[];
  language: string;
}

// ---------------------------------------------------------------------------
// Tree-sitter queries (S-expressions)
// ---------------------------------------------------------------------------

const TS_IMPORT_QUERY = `
(import_statement source: (string (string_fragment) @source))
(call_expression
  function: (identifier) @fn (#eq? @fn "require")
  arguments: (arguments (string (string_fragment) @source)))
`;

const TS_FN_QUERY = `
(function_declaration name: (identifier) @name)
(export_statement declaration: (function_declaration name: (identifier) @name))
(export_statement declaration: (lexical_declaration (variable_declarator name: (identifier) @name)))
`;

const PY_IMPORT_QUERY = `
(import_statement name: (dotted_name) @source)
(import_from_statement module_name: (dotted_name) @source)
`;

const PY_FN_QUERY = `(function_definition name: (identifier) @name)`;

const GO_IMPORT_QUERY = `(import_spec path: (interpreted_string_literal) @source)`;
const GO_FN_QUERY = `(function_declaration name: (identifier) @name)`;

interface LangConfig { imports: string; functions: string }

const LANG_QUERIES: Record<string, LangConfig> = {
  typescript: { imports: TS_IMPORT_QUERY, functions: TS_FN_QUERY },
  javascript: { imports: TS_IMPORT_QUERY, functions: TS_FN_QUERY },
  python:     { imports: PY_IMPORT_QUERY, functions: PY_FN_QUERY },
  go:         { imports: GO_IMPORT_QUERY, functions: GO_FN_QUERY },
};

// ---------------------------------------------------------------------------
// Route extraction (regex — fast and framework-agnostic)
// ---------------------------------------------------------------------------

const ROUTE_RE: Array<[RegExp, string]> = [
  [/export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b/g, "next"],
  [/(?:app|router|server)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/g, "express"],
  [/@(Get|Post|Put|Delete|Patch)\s*\(\s*['"]?([^'")\s]*)/g, "nestjs"],
  [/@(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/g, "fastapi"],
];

function extractRoutes(content: string): ParsedRoute[] {
  const routes: ParsedRoute[] = [];
  for (const [re, framework] of ROUTE_RE) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      routes.push({ method: (m[1] ?? "UNKNOWN").toUpperCase(), path: m[2] ?? "", framework });
    }
  }
  return routes;
}

// ---------------------------------------------------------------------------
// Parse a single file — returns null if language unsupported or parse fails
// ---------------------------------------------------------------------------

export async function parseFile(content: string, language: string): Promise<ParseResult | null> {
  const lang = await loadLanguage(language);
  if (!lang) return null;

  const config = LANG_QUERIES[language];
  if (!config) return null;

  let rootNode;
  try {
    const parser = new Parser();
    parser.setLanguage(lang);
    const tree = parser.parse(content);
    if (!tree) return null;
    rootNode = tree.rootNode;
  } catch {
    return null;
  }

  const imports = runQuery(config.imports, lang, rootNode, "source").map((text) => ({
    source: text.replace(/^['"]|['"]$/g, ""),
    raw: "",
  }));

  const functions = runQuery(config.functions, lang, rootNode, "name").map((name) => ({
    name,
    isExported: false,
  }));

  const routes = extractRoutes(content);

  return { imports, functions, routes, language };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function runQuery(queryStr: string, language: any, node: any, captureName: string): string[] {
  try {
    const q = language.query(queryStr);
    const matches = q.matches(node);
    // web-tree-sitter 0.22 query results are untyped; capture shapes are stable.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    return matches
      .flatMap((m: any) => m.captures)
      .filter((c: any) => c.name === captureName)
      .map((c: any) => c.node.text);
    /* eslint-enable @typescript-eslint/no-explicit-any */
  } catch {
    return [];
  }
}
