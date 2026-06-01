"""Unit tests for the SPA-serving catch-all blueprint (``static_web``)."""

import pytest
from flask import Flask

from static_web import create_web_blueprint

INDEX_HTML = "<!doctype html><html><body><div id='root'></div></body></html>"
ASSET_JS = "console.log('hashed asset');"


@pytest.fixture
def dist_dir(tmp_path):
    """A minimal built dist/ with an index.html and one hashed asset."""
    (tmp_path / "index.html").write_text(INDEX_HTML)
    assets = tmp_path / "assets"
    assets.mkdir()
    (assets / "index-abc123.js").write_text(ASSET_JS)
    return tmp_path


@pytest.fixture
def client(dist_dir):
    app = Flask(__name__)
    app.register_blueprint(create_web_blueprint(str(dist_dir)))
    return app.test_client()


def test_root_returns_index_html(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert b"<div id='root'></div>" in resp.data


def test_unknown_client_route_falls_back_to_index(client):
    # A client-side route with no matching file on disk → SPA fallback.
    resp = client.get("/records/Steps")
    assert resp.status_code == 200
    assert b"<div id='root'></div>" in resp.data


def test_existing_hashed_asset_is_served(client):
    resp = client.get("/assets/index-abc123.js")
    assert resp.status_code == 200
    assert resp.data.decode() == ASSET_JS


def test_api_path_aborts_404(client):
    # Must never serve index.html for /api/* — that surface belongs to the API.
    resp = client.get("/api/anything")
    assert resp.status_code == 404
    assert b"<div id='root'></div>" not in resp.data


def test_nested_api_path_aborts_404(client):
    resp = client.get("/api/v2/counts")
    assert resp.status_code == 404
    assert b"<div id='root'></div>" not in resp.data
