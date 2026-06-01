"""Static assertions on the single-image multi-stage packaging (task_11).

These guard the contract that the Docker build wires the SPA into the API image
without bloating the runtime or breaking the CI build context, and that the web
build artifacts stay out of git and the Docker build context. They are file
content checks (no Docker daemon required); the end-to-end build is exercised by
the `docker compose up --build` smoke test documented in the task.
"""

import os
import subprocess

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(API_ROOT)
DOCKERFILE = os.path.join(API_ROOT, "Dockerfile")
DOCKERIGNORE = os.path.join(API_ROOT, ".dockerignore")
CI_WORKFLOW = os.path.join(REPO_ROOT, ".github", "workflows", "ghcr-ci.yaml")


def _read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


# --- Dockerfile: Bun build stage (11.1) -----------------------------------


def test_dockerfile_has_bun_build_stage():
    text = _read(DOCKERFILE)
    assert "FROM oven/bun:1 AS web" in text
    assert "bun install" in text
    assert "bun run build" in text


def test_dockerfile_copies_dist_and_sets_web_dist():
    text = _read(DOCKERFILE)
    # dist/ is pulled from the build stage, not the host context.
    assert "COPY --from=web /web/dist /app/web/dist" in text
    assert "ENV WEB_DIST=/app/web/dist" in text


# --- Dockerfile: runtime stage unchanged (11.3) ---------------------------


def test_dockerfile_keeps_uv_base_nonroot_and_gunicorn():
    text = _read(DOCKERFILE)
    assert "FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim" in text
    assert "USER nonroot" in text
    assert "0.0.0.0:6644" in text
    assert 'CMD ["gunicorn"' in text


def test_dockerfile_confines_build_deps_to_build_stage():
    # The Bun toolchain / node_modules must never be installed in the runtime
    # stage — only the compiled dist/ crosses the stage boundary.
    runtime_stage = _read(DOCKERFILE).split(
        "FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim", 1
    )[1]
    assert "bun install" not in runtime_stage
    assert "bun run build" not in runtime_stage


# --- .dockerignore (11.4) -------------------------------------------------


def test_dockerignore_excludes_web_build_artifacts():
    lines = {line.strip() for line in _read(DOCKERIGNORE).splitlines()}
    assert "web/node_modules" in lines
    assert "web/dist" in lines


# --- .gitignore (11.5): use git itself as the source of truth -------------


def _git_ignored(rel_path):
    result = subprocess.run(
        ["git", "check-ignore", rel_path],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    return result.returncode == 0


def test_gitignore_ignores_web_artifacts_and_route_tree():
    assert _git_ignored("api/web/node_modules/x")
    assert _git_ignored("api/web/dist/x")
    assert _git_ignored("api/web/src/routeTree.gen.ts")


# --- CI build context preserved --------------------------


def test_ci_workflow_keeps_api_build_context():
    if not os.path.isfile(CI_WORKFLOW):
        return  # workflow optional in some checkouts; smoke test covers the rest
    text = _read(CI_WORKFLOW)
    assert "./api" in text
