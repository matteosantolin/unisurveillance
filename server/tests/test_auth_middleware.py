"""
Unit test del decoratore `require_auth`.

Per evitare di importare l'app Flask (e con essa dipendenze pesanti come
ultralytics) si carica `app/middleware/auth.py` via path-load, riscrivendo
gli import relativi su moduli stub iniettati in `sys.modules`.
"""

import importlib.util
import pathlib
import sys
import types
from unittest.mock import patch

import pytest
from firebase_admin import auth as fb_auth
from flask import Flask, g, jsonify

_BASE = pathlib.Path(__file__).resolve().parent.parent / "app" / "middleware"
_spec = importlib.util.spec_from_file_location("auth_under_test", _BASE / "auth.py")
auth_mod = importlib.util.module_from_spec(_spec)
sys.modules["auth_under_test"] = auth_mod
_spec.loader.exec_module(auth_mod)
require_auth = auth_mod.require_auth


def _make_app() -> Flask:
    app = Flask(__name__)

    @app.route("/protected", methods=["POST"])
    @require_auth
    def protected():
        return jsonify({"uid": g.uid, "email": g.email}), 200

    return app


@pytest.fixture()
def client():
    return _make_app().test_client()


def test_missing_header_returns_401(client):
    res = client.post("/protected")
    assert res.status_code == 401
    assert "Authorization" in res.get_json()["error"]


def test_wrong_prefix_returns_401(client):
    res = client.post("/protected", headers={"Authorization": "Token abc"})
    assert res.status_code == 401


def test_empty_token_returns_401(client):
    res = client.post("/protected", headers={"Authorization": "Bearer "})
    assert res.status_code == 401


def test_valid_token_populates_context(client):
    with patch.object(
        fb_auth,
        "verify_id_token",
        return_value={"uid": "user-123", "email": "u@example.com"},
    ):
        res = client.post(
            "/protected", headers={"Authorization": "Bearer goodtoken"}
        )
    assert res.status_code == 200
    assert res.get_json() == {"uid": "user-123", "email": "u@example.com"}


def test_expired_token_returns_401(client):
    with patch.object(
        fb_auth,
        "verify_id_token",
        side_effect=fb_auth.ExpiredIdTokenError("expired", cause=None),
    ):
        res = client.post(
            "/protected", headers={"Authorization": "Bearer expired"}
        )
    assert res.status_code == 401
    assert res.get_json()["error"] == "Token expired"


def test_invalid_token_returns_401(client):
    with patch.object(
        fb_auth,
        "verify_id_token",
        side_effect=fb_auth.InvalidIdTokenError("bad"),
    ):
        res = client.post(
            "/protected", headers={"Authorization": "Bearer bad"}
        )
    assert res.status_code == 401
    assert res.get_json()["error"] == "Invalid token"
