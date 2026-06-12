/**
 * Fixture: a minimal Next.js (App Router) TypeScript application.
 * Covers all 10 artifact buckets deterministically — no network, no LLM.
 */
import type { ScannedFile } from "@/lib/kg/ingest/scan";

function f(
  path: string,
  ext: string,
  language: string | undefined,
  content: string
): ScannedFile {
  const filename = path.split("/").pop()!.toLowerCase();
  return { path, filename, ext, language, content, size: content.length, sha: "fixture" };
}

export const nextjsAppFixture: ScannedFile[] = [
  // ── Documentation (filename:docs + ext:.md)
  f("README.md", ".md", undefined, [
    "# My App",
    "",
    "## Features",
    "Core features of the application.",
    "",
    "## Requirements",
    "See PROJ-42 for full acceptance criteria.",
    "",
    "## API",
    "REST endpoints are documented in openapi.yaml.",
    "",
    "## Testing",
    "Run the test suite with `npm test`.",
    "",
    "## Deployment",
    "Deploy with Docker or Vercel.",
    "",
    "## Configuration",
    "Copy .env.example to .env and fill in values.",
  ].join("\n")),

  // ── Requirements / specs (readme:requirements_section 0.75 > ext:.md 0.7)
  f("REQUIREMENTS.md", ".md", undefined, [
    "# Requirements",
    "",
    "## Acceptance Criteria",
    "- PROJ-42: Users can log in with email and password.",
    "- PROJ-43: Session tokens expire after 24 hours.",
    "",
    "## User Stories",
    "As a user I want to see my profile after login.",
  ].join("\n")),

  // ── Feature behavior (ext:.feature → 0.9)
  f("features/user-login.feature", ".feature", undefined, [
    "Feature: User login",
    "  Scenario: successful login",
    "    Given I am on the login page",
    "    When I enter valid credentials",
    "    Then I am redirected to the dashboard",
  ].join("\n")),

  // ── Config (filename:config_manifest + manifest:package_json)
  f("package.json", ".json", undefined, JSON.stringify({
    name: "my-app",
    scripts: { dev: "next dev", build: "next build", test: "vitest run", lint: "next lint", deploy: "vercel deploy" },
    dependencies: { next: "^15.0.0", react: "^19.0.0" },
    devDependencies: { vitest: "^2.1.0", typescript: "^5.6.0" },
  }, null, 2)),

  // ── Config (filename:config_manifest)
  f("tsconfig.json", ".json", undefined, JSON.stringify(
    { compilerOptions: { strict: true, target: "ES2022", module: "esnext" } }, null, 2
  )),

  // ── Config (ext:.env.example)
  f(".env.example", ".env.example", undefined,
    "DATABASE_URL=postgresql://localhost:5432/mydb\nOPENAI_API_KEY=\nNEXT_PUBLIC_API_URL="),

  // ── CI/CD (filename:ci_config + content:gh_actions)
  f(".github/workflows/ci.yml", ".yml", undefined, [
    "name: CI",
    "on: [push, pull_request]",
    "jobs:",
    "  test:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "      - run: npm ci",
    "      - run: npm test",
  ].join("\n")),

  // ── Release / deployment hints (filename:dockerfile + content:dockerfile_from)
  f("Dockerfile", "", undefined, [
    "FROM node:20-alpine AS base",
    "WORKDIR /app",
    "COPY package*.json ./",
    "RUN npm ci --only=production",
    "COPY . .",
    "RUN npm run build",
    'CMD ["npm", "start"]',
  ].join("\n")),

  // ── API contracts (filename:openapi)
  f("openapi.yaml", ".yaml", undefined, [
    "openapi: 3.0.0",
    "info:",
    "  title: My App API",
    "  version: 1.0.0",
    "paths:",
    "  /api/users:",
    "    get:",
    "      summary: List users",
    '      responses: { "200": { description: OK } }',
  ].join("\n")),

  // ── Routes and components (imports:nextjs_server + route_def:next-route-handler)
  f("app/api/users/route.ts", ".ts", "typescript", [
    "import { NextRequest, NextResponse } from 'next/server';",
    "",
    "export async function GET(_req: NextRequest) {",
    "  return NextResponse.json({ users: [] });",
    "}",
    "",
    "export async function POST(req: NextRequest) {",
    "  const body = await req.json();",
    "  return NextResponse.json({ created: body }, { status: 201 });",
    "}",
  ].join("\n")),

  // ── Routes and components (imports:react)
  f("app/page.tsx", ".tsx", "typescript", [
    "import React from 'react';",
    "",
    "export default function HomePage() {",
    "  return <main><h1>Welcome</h1></main>;",
    "}",
  ].join("\n")),

  // ── Source code (ext:.ts, no route/test signals)
  f("lib/db.ts", ".ts", "typescript", [
    "import { Pool } from 'pg';",
    "export const pool = new Pool({ connectionString: process.env.DATABASE_URL });",
    "export async function query(sql: string, params?: unknown[]) {",
    "  return pool.query(sql, params);",
    "}",
  ].join("\n")),

  // ── Tests (ext:.test.ts + filename:test_dir + imports:test_globals)
  f("tests/api.test.ts", ".ts", "typescript", [
    "import { describe, it, expect } from 'vitest';",
    "describe('GET /api/users', () => {",
    "  it('returns empty array', () => { expect([]).toEqual([]); });",
    "});",
  ].join("\n")),

  // ── Tests (ext:.test.tsx)
  f("tests/components.test.tsx", ".tsx", "typescript", [
    "import { describe, it, expect } from 'vitest';",
    "describe('Button', () => {",
    "  it('renders', () => { expect(true).toBe(true); });",
    "});",
  ].join("\n")),
];
