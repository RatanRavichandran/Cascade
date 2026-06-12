import type { SignalHit } from "./signals";

// Test-framework markers in package.json scripts/devDeps
const TEST_FRAMEWORK_PATTERNS = [
  "jest", "vitest", "mocha", "jasmine", "ava", "tap", "cypress", "playwright",
  "pytest", "unittest", "rspec", "minitest", "go test",
];

const CI_SCRIPT_PATTERNS = ["ci", "lint", "build", "deploy", "release", "publish"];

export function parsePackageJson(content: string): SignalHit[] {
  const hits: SignalHit[] = [];
  let pkg: Record<string, unknown>;

  try {
    pkg = JSON.parse(content);
  } catch {
    return hits;
  }

  // scripts → CI/CD, Tests, Release signals
  const scripts = pkg.scripts as Record<string, string> | undefined;
  if (scripts) {
    const scriptNames = Object.keys(scripts).map((k) => k.toLowerCase());
    const scriptValues = Object.values(scripts).map((v) => v.toLowerCase());
    const scriptText = [...scriptNames, ...scriptValues];

    if (scriptText.some((s) => TEST_FRAMEWORK_PATTERNS.some((t) => s.includes(t)))) {
      hits.push({ signal: "manifest:test_script", bucket: "Tests", weight: 0.7 });
    }
    if (scriptNames.some((s) => CI_SCRIPT_PATTERNS.some((c) => s === c || s.startsWith(c + ":"))) ) {
      hits.push({ signal: "manifest:ci_script", bucket: "CI/CD", weight: 0.5 });
    }
    if (scriptNames.some((s) => ["deploy", "release", "publish", "start", "serve"].includes(s))) {
      hits.push({ signal: "manifest:deploy_script", bucket: "Release / deployment hints", weight: 0.6 });
    }
  }

  // devDependencies → test framework markers
  const devDeps = {
    ...(pkg.devDependencies as Record<string, string> | undefined),
    ...(pkg.dependencies as Record<string, string> | undefined),
  };
  const depNames = Object.keys(devDeps).map((k) => k.toLowerCase());

  if (depNames.some((d) => TEST_FRAMEWORK_PATTERNS.some((t) => d.includes(t)))) {
    hits.push({ signal: "manifest:test_framework_dep", bucket: "Tests", weight: 0.65 });
  }

  // Framework-specific route signals
  if (
    depNames.some((d) => ["express", "fastify", "koa", "hapi", "next", "nuxt", "remix"].includes(d))
  ) {
    hits.push({ signal: "manifest:web_framework", bucket: "Routes and components", weight: 0.4 });
  }

  // Always a Config artifact
  hits.push({ signal: "manifest:package_json", bucket: "Config", weight: 0.85 });

  return hits;
}

export function parsePyprojectToml(content: string): SignalHit[] {
  const hits: SignalHit[] = [];
  hits.push({ signal: "manifest:pyproject_toml", bucket: "Config", weight: 0.85 });

  if (content.includes("[tool.pytest") || content.includes("pytest")) {
    hits.push({ signal: "manifest:pytest", bucket: "Tests", weight: 0.7 });
  }
  if (content.includes("[tool.ruff") || content.includes("[tool.mypy")) {
    hits.push({ signal: "manifest:python_lint", bucket: "CI/CD", weight: 0.4 });
  }
  if (content.includes("[project.scripts]") || content.includes("[tool.poetry.scripts]")) {
    hits.push({ signal: "manifest:python_scripts", bucket: "Release / deployment hints", weight: 0.5 });
  }
  return hits;
}

export function parseGoMod(content: string): SignalHit[] {
  const hits: SignalHit[] = [];
  hits.push({ signal: "manifest:go_mod", bucket: "Config", weight: 0.85 });

  if (content.includes("testing") || content.includes("testify")) {
    hits.push({ signal: "manifest:go_test", bucket: "Tests", weight: 0.5 });
  }
  return hits;
}

export function parsePomXml(content: string): SignalHit[] {
  const hits: SignalHit[] = [];
  hits.push({ signal: "manifest:pom_xml", bucket: "Config", weight: 0.85 });

  if (content.includes("junit") || content.includes("testng") || content.includes("mockito")) {
    hits.push({ signal: "manifest:java_test_dep", bucket: "Tests", weight: 0.7 });
  }
  if (content.includes("<plugin>") && content.includes("maven")) {
    hits.push({ signal: "manifest:maven_plugin", bucket: "CI/CD", weight: 0.4 });
  }
  return hits;
}

export function detectManifestSignals(
  filename: string,
  content: string
): SignalHit[] {
  const name = filename.toLowerCase();
  if (name === "package.json") return parsePackageJson(content);
  if (name === "pyproject.toml") return parsePyprojectToml(content);
  if (name === "go.mod") return parseGoMod(content);
  if (name === "pom.xml") return parsePomXml(content);
  return [];
}
