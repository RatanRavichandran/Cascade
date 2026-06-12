import { describe, it, expect } from "vitest";
import { detectImportSignals, detectRouteDefinitions, detectDeploySignals } from "@/lib/kg/classify/content";

describe("detectImportSignals", () => {
  it("detects vitest import as Tests", () => {
    const code = `import { describe, it } from 'vitest';`;
    const hits = detectImportSignals(code);
    expect(hits.some((h) => h.bucket === "Tests")).toBe(true);
  });

  it("detects jest globals as Tests", () => {
    const code = `describe('suite', () => { it('test', () => { expect(1).toBe(1); }); });`;
    const hits = detectImportSignals(code);
    expect(hits.some((h) => h.bucket === "Tests")).toBe(true);
  });

  it("detects express import as Routes", () => {
    const code = `import express from 'express';`;
    const hits = detectImportSignals(code);
    expect(hits.some((h) => h.bucket === "Routes and components")).toBe(true);
  });

  it("detects NestJS imports as Routes", () => {
    const code = `import { Controller, Get } from '@nestjs/common';`;
    const hits = detectImportSignals(code);
    expect(hits.some((h) => h.bucket === "Routes and components")).toBe(true);
  });

  it("does NOT flag plain source files without framework imports as Tests", () => {
    const code = `export function add(a: number, b: number) { return a + b; }`;
    const hits = detectImportSignals(code);
    expect(hits.some((h) => h.bucket === "Tests")).toBe(false);
  });
});

describe("detectRouteDefinitions", () => {
  it("detects Next.js App Router GET handler", () => {
    const code = `export async function GET(req: Request) { return Response.json({}); }`;
    const hits = detectRouteDefinitions(code);
    expect(hits.some((h) => h.signal === "route_def:next-route-handler")).toBe(true);
  });

  it("detects Express router.get", () => {
    const code = `router.get('/users', async (req, res) => { res.json(users); });`;
    const hits = detectRouteDefinitions(code);
    expect(hits.some((h) => h.signal === "route_def:express-style")).toBe(true);
  });

  it("detects NestJS @Get decorator", () => {
    const code = `@Get('/users') findAll() { return this.service.findAll(); }`;
    const hits = detectRouteDefinitions(code);
    expect(hits.some((h) => h.signal === "route_def:nestjs-decorator")).toBe(true);
  });

  it("detects FastAPI decorator", () => {
    const code = `@app.get("/users")\ndef get_users(): return []`;
    const hits = detectRouteDefinitions(code);
    expect(hits.some((h) => h.signal === "route_def:python-decorator")).toBe(true);
  });

  it("does NOT flag a plain utility file as having routes", () => {
    const code = `export function formatDate(d: Date) { return d.toISOString(); }`;
    const hits = detectRouteDefinitions(code);
    expect(hits).toHaveLength(0);
  });
});

describe("detectDeploySignals", () => {
  it("detects Dockerfile FROM instruction", () => {
    const content = "FROM node:20-alpine\nRUN npm install";
    const hits = detectDeploySignals(content, "Dockerfile");
    expect(hits.some((h) => h.bucket === "Release / deployment hints")).toBe(true);
  });

  it("detects Kubernetes Deployment manifest", () => {
    const content = "apiVersion: apps/v1\nkind: Deployment\nmetadata:";
    const hits = detectDeploySignals(content, "deployment.yaml");
    expect(hits.some((h) => h.bucket === "Release / deployment hints")).toBe(true);
  });

  it("detects GitHub Actions workflow content", () => {
    const content = "on: push\njobs:\n  build:\n    runs-on: ubuntu-latest";
    const hits = detectDeploySignals(content, "ci.yml");
    expect(hits.some((h) => h.bucket === "CI/CD")).toBe(true);
  });

  it("does NOT flag regular YAML as deploy", () => {
    const content = "name: my-config\nvalue: 42";
    const hits = detectDeploySignals(content, "config.yaml");
    expect(hits).toHaveLength(0);
  });
});
