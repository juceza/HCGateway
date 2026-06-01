# ---------------------------------------------------------------------------
# Stage 1: build the Web UI SPA (api/web/) into a static dist/ with Bun.
#
# Confined to this stage so node_modules and the Bun toolchain never reach the
# runtime image — only the compiled dist/ is copied across.
# The CI build context stays ./api, so `web/` here resolves to api/web/.
# ---------------------------------------------------------------------------
FROM oven/bun:1 AS web

WORKDIR /web

# Install dependencies first (cached layer) from the committed lockfile.
COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile

# Then build the SPA. `bun run build` regenerates the gitignored routeTree.gen.ts
# (tsr generate) and emits dist/ (see api/web/package.json).
COPY web/ ./
RUN bun run build

# ---------------------------------------------------------------------------
# Stage 2: runtime — Python API served by gunicorn, plus the built SPA.
# ---------------------------------------------------------------------------
# Use a Python image with uv pre-installed
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

# Setup a non-root user
RUN groupadd --system --gid 999 nonroot \
 && useradd --system --gid 999 --uid 999 --create-home nonroot

# Install the project into `/app`
WORKDIR /app

# Enable bytecode compilation
ENV UV_COMPILE_BYTECODE=1

# Copy from the cache instead of linking since it's a mounted volume
ENV UV_LINK_MODE=copy

# Omit development dependencies
ENV UV_NO_DEV=1

# Install the project's dependencies using the lockfile and settings
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project

# Then, add the rest of the project source code
COPY . /app

# Drop the built SPA in and point the Flask blueprint at it. main.py registers
# the catch-all web blueprint only when WEB_DIST is a directory, so a build
# without a populated dist/ (or WEB_DIST overridden to empty) still starts as a
# pure API. See static_web.py.
COPY --from=web /web/dist /app/web/dist
ENV WEB_DIST=/app/web/dist

# Place executables in the environment at the front of the path
ENV PATH="/app/.venv/bin:$PATH"

# Reset the entrypoint, don't invoke `uv`
ENTRYPOINT []

# Use the non-root user to run our application
USER nonroot

# Run the Flask app under gunicorn (production WSGI server). It imports the
# module-level `app` from main.py; the dev `app.run(...)` block is not executed.
CMD ["gunicorn", "--bind", "0.0.0.0:6644", "--workers", "2", "--timeout", "180", "main:app"]
