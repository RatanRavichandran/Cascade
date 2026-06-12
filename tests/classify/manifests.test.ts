import { describe, it, expect } from "vitest";
import { parsePackageJson, parsePyprojectToml, parseGoMod } from "@/lib/kg/classify/manifests";

describe("parsePackageJson", () => {
  it("always emits Config signal", () => {
    const hits = parsePackageJson(JSON.stringify({ name: "app" }));
    expect(hits.some((h) => h.bucket === "Config")).toBe(true);
  });

  it("detects jest as test framework dep", () => {
    const pkg = { devDependencies: { jest: "^29" } };
    const hits = parsePackageJson(JSON.stringify(pkg));
    expect(hits.some((h) => h.bucket === "Tests")).toBe(true);
  });

  it("detects vitest in scripts", () => {
    const pkg = { scripts: { test: "vitest run" } };
    const hits = parsePackageJson(JSON.stringify(pkg));
    expect(hits.some((h) => h.bucket === "Tests")).toBe(true);
  });

  it("detects deploy script", () => {
    const pkg = { scripts: { deploy: "vercel deploy" } };
    const hits = parsePackageJson(JSON.stringify(pkg));
    expect(hits.some((h) => h.bucket === "Release / deployment hints")).toBe(true);
  });

  it("detects express web framework → Routes signal", () => {
    const pkg = { dependencies: { express: "^4" } };
    const hits = parsePackageJson(JSON.stringify(pkg));
    expect(hits.some((h) => h.bucket === "Routes and components")).toBe(true);
  });

  it("returns empty for malformed JSON", () => {
    const hits = parsePackageJson("not json {{");
    expect(hits).toHaveLength(0);
  });
});

describe("parsePyprojectToml", () => {
  it("emits Config signal", () => {
    const hits = parsePyprojectToml("[project]\nname = 'app'");
    expect(hits.some((h) => h.bucket === "Config")).toBe(true);
  });

  it("detects pytest", () => {
    const hits = parsePyprojectToml("[tool.pytest.ini_options]\ntestpaths = ['tests']");
    expect(hits.some((h) => h.bucket === "Tests")).toBe(true);
  });
});

describe("parseGoMod", () => {
  it("emits Config signal", () => {
    const hits = parseGoMod("module github.com/user/repo\ngo 1.21");
    expect(hits.some((h) => h.bucket === "Config")).toBe(true);
  });
});
