FROM python:3.12-slim

WORKDIR /app

# Use the official uv binary — faster and more reliable than pip install uv.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

# Copy dependency manifests first so Docker layer cache stays hot on code-only changes.
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev

# Copy source.
COPY src/ src/

ENV PYTHONPATH=/app/src

# Health check against the built-in HTTP server (default port 10000; Render sets $PORT).
# Python stdlib only — no extra deps required in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c \
    "import os,urllib.request; urllib.request.urlopen('http://localhost:' + os.getenv('PORT','10000') + '/healthz', timeout=4)"

# --no-sync: deps were already installed in the build step above.
CMD ["uv", "run", "--no-sync", "python", "-m", "cascade_agents.main"]
