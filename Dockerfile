FROM python:3.12-slim

# Install uv (used for dependency management, same as local dev)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /app

# Install dependencies first for better layer caching
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Copy application code
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./

RUN uv sync --frozen --no-dev

EXPOSE 8000

# Apply migrations then start the API. media/ is created on startup by
# create_app() if missing; mount a volume at /app/media to persist uploads.
CMD ["sh", "-c", "uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000"]
