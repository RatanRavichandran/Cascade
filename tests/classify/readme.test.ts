import { describe, it, expect } from "vitest";
import { detectReadmeSections, extractExternalRefs } from "@/lib/kg/classify/readme";

describe("detectReadmeSections", () => {
  it("detects API section heading", () => {
    const md = "# My App\n\n## API\n\nEndpoints go here.";
    const hits = detectReadmeSections(md);
    expect(hits.some((h) => h.bucket === "API contracts")).toBe(true);
  });

  it("detects Deployment section", () => {
    const md = "# App\n\n## Deployment\n\nDeploy to Vercel.";
    const hits = detectReadmeSections(md);
    expect(hits.some((h) => h.bucket === "Release / deployment hints")).toBe(true);
  });

  it("detects Testing section", () => {
    const md = "# App\n\n## Testing\n\nRun npm test.";
    const hits = detectReadmeSections(md);
    expect(hits.some((h) => h.bucket === "Tests")).toBe(true);
  });

  it("returns no hits for a README with no recognizable sections", () => {
    const md = "# App\n\n## About\n\nJust a description.";
    const hits = detectReadmeSections(md);
    expect(hits).toHaveLength(0);
  });

  it("detects Requirements section", () => {
    const md = "# App\n\n## Requirements\n\n- Node 18+";
    const hits = detectReadmeSections(md);
    expect(hits.some((h) => h.bucket === "Requirements / specs")).toBe(true);
  });
});

describe("extractExternalRefs", () => {
  it("extracts Jira ticket IDs", () => {
    const text = "See PROJ-123 and PROJ-456 for requirements.";
    const refs = extractExternalRefs(text);
    const jiraRefs = refs.filter((r) => r.type === "jira");
    expect(jiraRefs.map((r) => r.ref)).toContain("PROJ-123");
    expect(jiraRefs.map((r) => r.ref)).toContain("PROJ-456");
  });

  it("extracts Confluence URLs", () => {
    const text = "See https://myco.atlassian.net/confluence/pages/viewpage.action?pageId=123";
    const refs = extractExternalRefs(text);
    expect(refs.some((r) => r.type === "confluence")).toBe(true);
  });

  it("extracts Notion URLs", () => {
    const text = "Spec: https://www.notion.so/myworkspace/spec-abc123";
    const refs = extractExternalRefs(text);
    expect(refs.some((r) => r.type === "notion")).toBe(true);
  });

  it("returns empty for text with no external refs", () => {
    const text = "Just some regular markdown content with no links.";
    const refs = extractExternalRefs(text);
    expect(refs).toHaveLength(0);
  });

  it("deduplicates the same ref appearing multiple times", () => {
    const text = "See PROJ-123. Also check PROJ-123 again.";
    const refs = extractExternalRefs(text);
    const jiraRefs = refs.filter((r) => r.type === "jira" && r.ref === "PROJ-123");
    expect(jiraRefs).toHaveLength(1);
  });
});
