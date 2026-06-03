"""Tests for the ALLOW_REGISTRATION feature flag on /api/v2/login.

When the flag is off, logging in with an unknown username must NOT auto-create
an account; when on, the existing auto-creation behaviour is preserved. The
Mongo collection is replaced with a fake so no live database is required.
"""

import importlib

from apiVersions.v2 import routes as routes_module


class _FakeUsers:
    """Minimal stand-in for the `users` collection."""

    def __init__(self, existing=None):
        self._existing = existing
        self.inserted = []

    def find_one(self, query):
        return self._existing

    def insert_one(self, doc):
        self.inserted.append(doc)


class _FakeDb:
    def __init__(self, users):
        self._users = users

    def __getitem__(self, name):
        return self._users


class _FakeMongo:
    def __init__(self, users):
        self._db = _FakeDb(users)

    def __getitem__(self, name):
        return self._db


def _client(monkeypatch, *, allow, users):
    monkeypatch.setattr(routes_module, "ALLOW_REGISTRATION", allow)
    monkeypatch.setattr(routes_module, "mongo", _FakeMongo(users))
    main_module = importlib.import_module("main")
    return main_module.app.test_client()


def test_unknown_user_blocked_when_registration_disabled(monkeypatch):
    users = _FakeUsers(existing=None)
    client = _client(monkeypatch, allow=False, users=users)

    resp = client.post("/api/v2/login", json={"username": "newcomer", "password": "pw"})

    assert resp.status_code == 403
    assert resp.get_json()["error"] == "registration is disabled"
    assert users.inserted == []  # no account created


def test_unknown_user_creates_account_when_registration_enabled(monkeypatch):
    users = _FakeUsers(existing=None)
    client = _client(monkeypatch, allow=True, users=users)

    resp = client.post("/api/v2/login", json={"username": "newcomer", "password": "pw"})

    assert resp.status_code == 201
    assert len(users.inserted) == 1
    assert users.inserted[0]["username"] == "newcomer"
    body = resp.get_json()
    assert "token" in body and "refresh" in body
