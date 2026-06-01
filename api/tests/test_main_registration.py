"""Tests for conditional SPA blueprint registration in ``main.py``.

These import the real Flask ``app`` from ``main`` under different ``WEB_DIST``
values (reloading the module so the import-time registration re-runs) and assert
that the pure-API behaviour is preserved when no dist/ is present, and that the
SPA + API coexist in one process when it is.

The API is reachable without a live MongoDB because ``before_request`` rejects
an unauthenticated request with 401 before touching the database.
"""

import importlib
import os

import main as main_module

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILT_DIST = os.path.join(API_ROOT, "web", "dist")


def _reload_app(monkeypatch, web_dist):
    if web_dist is None:
        monkeypatch.delenv("WEB_DIST", raising=False)
    else:
        monkeypatch.setenv("WEB_DIST", web_dist)
    module = importlib.reload(main_module)
    return module.app


def test_pure_api_when_web_dist_unset(monkeypatch):
    app = _reload_app(monkeypatch, None)
    assert "web" not in app.blueprints

    client = app.test_client()
    # No catch-all: the SPA root is not served.
    assert client.get("/").status_code == 404
    # The API still routes and rejects an unauthenticated request with 401.
    assert client.get("/api/v2/counts").status_code == 401


def test_pure_api_when_web_dist_missing_dir(monkeypatch, tmp_path):
    missing = str(tmp_path / "does-not-exist")
    app = _reload_app(monkeypatch, missing)
    assert "web" not in app.blueprints
    assert app.test_client().get("/").status_code == 404


def test_spa_and_api_coexist_when_web_dist_set(monkeypatch):
    assert os.path.isdir(BUILT_DIST), (
        f"built dist/ not found at {BUILT_DIST}; run `bun run build` in api/web"
    )
    app = _reload_app(monkeypatch, BUILT_DIST)
    assert "web" in app.blueprints

    client = app.test_client()

    # / is served as the SPA shell (index.html) from the same process...
    root = client.get("/")
    assert root.status_code == 200
    assert b'<div id="root"></div>' in root.data

    # ...while /api/v2/counts (authed) still routes to the API, not the SPA.
    counts = client.get("/api/v2/counts")
    assert counts.status_code == 401
    assert b'<div id="root"></div>' not in counts.data


def teardown_module(module):
    # Restore the app to its default (no WEB_DIST) state for any later imports.
    os.environ.pop("WEB_DIST", None)
    importlib.reload(main_module)
