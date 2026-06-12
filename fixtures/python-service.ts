/**
 * Fixture: a minimal Python FastAPI microservice.
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

export const pythonServiceFixture: ScannedFile[] = [
  // ── Documentation (filename:docs + ext:.md)
  f("README.md", ".md", undefined, [
    "# User Service",
    "",
    "## Features",
    "A FastAPI microservice for user management.",
    "",
    "## Requirements",
    "See SVC-10 for business requirements.",
    "",
    "## API",
    "Interactive docs at /docs (Swagger UI).",
    "",
    "## Testing",
    "Run `pytest` to execute the test suite.",
    "",
    "## Deployment",
    "Containerised with Docker; deploy to Kubernetes.",
    "",
    "## Configuration",
    "Environment variables listed in .env.example.",
  ].join("\n")),

  // ── Requirements / specs (readme:requirements_section 0.75 > ext:.md 0.7)
  f("REQUIREMENTS.md", ".md", undefined, [
    "# Requirements",
    "",
    "## Functional Requirements",
    "- SVC-10: Create, read, update, and delete user records.",
    "- SVC-11: Enforce unique email constraint.",
    "",
    "## Acceptance Criteria",
    "All endpoints return JSON. Validation errors return 422.",
  ].join("\n")),

  // ── Feature behavior (ext:.feature → 0.9)
  f("features/user-registration.feature", ".feature", undefined, [
    "Feature: User registration",
    "  Scenario: register with valid email",
    "    Given the service is running",
    "    When I POST /users with a valid email",
    "    Then the response status is 201",
    "    And the user appears in GET /users",
  ].join("\n")),

  // ── Config (manifest:pyproject_toml + manifest:pytest + filename:config_manifest)
  f("pyproject.toml", ".toml", undefined, [
    "[project]",
    'name = "user-service"',
    'version = "0.1.0"',
    "",
    "[tool.pytest.ini_options]",
    'testpaths = ["tests"]',
    "",
    "[tool.ruff]",
    "line-length = 88",
    "",
    "[project.scripts]",
    'start = "user_service.main:app"',
  ].join("\n")),

  // ── Config (ext:.env.example)
  f(".env.example", ".env.example", undefined,
    "DATABASE_URL=postgresql://localhost:5432/users\nSECRET_KEY=change-me\nDEBUG=false"),

  // ── CI/CD (filename:ci_config + content:gh_actions)
  f(".github/workflows/test.yml", ".yml", undefined, [
    "name: Test",
    "on: [push, pull_request]",
    "jobs:",
    "  test:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "      - uses: actions/setup-python@v5",
    "        with: { python-version: '3.12' }",
    "      - run: pip install -e '.[dev]'",
    "      - run: pytest --tb=short",
  ].join("\n")),

  // ── Release / deployment hints (filename:dockerfile + content:dockerfile_from)
  f("Dockerfile", "", undefined, [
    "FROM python:3.12-slim AS base",
    "WORKDIR /app",
    "COPY pyproject.toml ./",
    "RUN pip install --no-cache-dir -e .",
    "COPY . .",
    'CMD ["uvicorn", "user_service.main:app", "--host", "0.0.0.0"]',
  ].join("\n")),

  // ── API contracts (filename:openapi)
  f("openapi.json", ".json", undefined, JSON.stringify({
    openapi: "3.0.0",
    info: { title: "User Service API", version: "1.0.0" },
    paths: {
      "/users": {
        get: { summary: "List users", responses: { "200": { description: "OK" } } },
        post: { summary: "Create user", responses: { "201": { description: "Created" } } },
      },
    },
  }, null, 2)),

  // ── Routes and components (route_def:python-decorator → Routes 0.75 > Source 0.5)
  f("src/api/users.py", ".py", "python", [
    "from fastapi import APIRouter",
    "from src.models.user import User",
    "",
    "router = APIRouter(prefix='/users', tags=['users'])",
    "",
    "@router.get('/')",
    "async def list_users(): return []",
    "",
    "@router.post('/', status_code=201)",
    "async def create_user(user: User): return user",
  ].join("\n")),

  // ── Source code (ext:.py, no route signals)
  f("src/models/user.py", ".py", "python", [
    "from pydantic import BaseModel, EmailStr",
    "",
    "class User(BaseModel):",
    "    id: int | None = None",
    "    email: EmailStr",
    "    name: str",
  ].join("\n")),

  // ── Tests (filename:test_dir + imports:pytest)
  f("tests/test_users.py", ".py", "python", [
    "import pytest",
    "from fastapi.testclient import TestClient",
    "from src.main import app",
    "",
    "client = TestClient(app)",
    "",
    "def test_list_users_returns_200():",
    "    response = client.get('/users')",
    "    assert response.status_code == 200",
  ].join("\n")),

  // ── Tests (second test file)
  f("tests/test_models.py", ".py", "python", [
    "import pytest",
    "from src.models.user import User",
    "",
    "def test_user_model_valid():",
    "    u = User(email='x@y.com', name='Test')",
    "    assert u.email == 'x@y.com'",
  ].join("\n")),
];
