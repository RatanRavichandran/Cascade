FROM python:3.12-slim

WORKDIR /app

# Install uv (fast Python package manager)
RUN pip install --no-cache-dir uv

# Copy dependency manifests first so Docker layer cache stays hot on code-only changes
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Copy source
COPY src/ src/

ENV PYTHONPATH=/app/src

# agent_config.yaml is gitignored — mount it at runtime:
#   docker run -v $(pwd)/agent_config.yaml:/app/agent_config.yaml ...
# Or use docker-compose.yml which handles this automatically.

CMD ["uv", "run", "python", "-m", "cascade_agents.main"]
