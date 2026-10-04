"""Part B: JWT access-token tests.

These tests verify:
- login response contains access_token and token_type.
- a Bearer JWT authorizes protected endpoints (no cookie needed).
- a tampered / expired JWT is rejected with 401 NOT_AUTHENTICATED.
- a deactivated user's JWT is also rejected.
- token_type is 'bearer'.
"""
import time
from datetime import timedelta

import jwt as _jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import settings
from app.enums import Role
from app.models import User
from app.security import issue_access_token, utcnow

from .conftest import API, GOOD_PASSWORD, login_token


# ── helpers ──────────────────────────────────────────────────────────────────

def _login_response(client: TestClient, email: str) -> dict:
    res = client.post(f"{API}/auth/login", json={"email": email, "password": GOOD_PASSWORD})
    assert res.status_code == 200, res.text
    return res.json()


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ── tests ─────────────────────────────────────────────────────────────────────


def test_login_response_contains_access_token(client: TestClient, make_user) -> None:
    """Login must return access_token and token_type alongside the user object."""
    user = make_user(Role.MANAGER)
    body = _login_response(client, user.email)

    assert "access_token" in body, "access_token missing from login response"
    assert body["token_type"] == "bearer"
    assert len(body["access_token"]) > 20, "access_token looks too short"


def test_bearer_jwt_authorizes_me_endpoint(client: TestClient, make_user) -> None:
    """A valid Bearer JWT (no cookie) must be accepted by /auth/me."""
    user = make_user(Role.FRONT_DESK)
    body = _login_response(client, user.email)
    token = body["access_token"]

    # Clear cookies, send only the Bearer header.
    client.cookies.clear()
    me = client.get(f"{API}/auth/me", headers=_bearer(token))
    assert me.status_code == 200, me.text
    assert me.json()["id"] == user.id
    assert me.json()["role"] == "FRONT_DESK"


def test_bearer_jwt_authorizes_protected_resource(client: TestClient, make_user) -> None:
    """Bearer JWT must also be accepted on non-/me endpoints."""
    user = make_user(Role.OWNER)
    body = _login_response(client, user.email)
    token = body["access_token"]
    client.cookies.clear()

    # /users is OWNER-only; a valid token should get through RBAC.
    import uuid
    payload = {
        "email": f"jwttest-{uuid.uuid4().hex[:8]}@test.local",
        "full_name": "JWT Test User",
        "password": GOOD_PASSWORD,
        "role": "FRONT_DESK",
    }
    res = client.post(f"{API}/users", json=payload, headers=_bearer(token))
    assert res.status_code == 201, res.text


def test_tampered_jwt_is_rejected(client: TestClient, make_user) -> None:
    """A JWT signed with a different secret must be rejected with 401."""
    user = make_user()
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "iat": utcnow(),
        "exp": utcnow() + timedelta(minutes=60),
    }
    bad_token = _jwt.encode(payload, "wrong-secret-totally-different", algorithm="HS256")
    client.cookies.clear()

    res = client.get(f"{API}/auth/me", headers=_bearer(bad_token))
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "NOT_AUTHENTICATED"


def test_expired_jwt_is_rejected(client: TestClient, make_user) -> None:
    """A JWT with exp in the past must be rejected with 401."""
    user = make_user()
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "iat": utcnow() - timedelta(hours=2),
        "exp": utcnow() - timedelta(hours=1),   # already expired
    }
    expired_token = _jwt.encode(payload, settings.jwt_secret, algorithm="HS256")
    client.cookies.clear()

    res = client.get(f"{API}/auth/me", headers=_bearer(expired_token))
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "NOT_AUTHENTICATED"


def test_jwt_of_deactivated_user_is_rejected(
    client: TestClient, make_user, session: Session
) -> None:
    """Even a valid JWT must be refused if the user account is deactivated."""
    user = make_user(Role.FRONT_DESK)
    token = issue_access_token(user)

    # Deactivate the user directly in the database.
    session.query(User).filter(User.id == user.id).update({"is_active": False})
    session.commit()

    client.cookies.clear()
    res = client.get(f"{API}/auth/me", headers=_bearer(token))
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "NOT_AUTHENTICATED"


def test_cookie_still_works_alongside_jwt(client: TestClient, make_user) -> None:
    """Session cookie auth must keep working (backward compat for tests and browser)."""
    from .conftest import as_user
    user = make_user(Role.MANAGER)
    cookie_token = login_token(client, user.email)

    res = client.get(f"{API}/auth/me", headers=as_user(cookie_token))
    assert res.status_code == 200
    assert res.json()["id"] == user.id


def test_missing_auth_is_401(client: TestClient) -> None:
    """No token and no cookie must return 401."""
    client.cookies.clear()
    res = client.get(f"{API}/auth/me")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "NOT_AUTHENTICATED"
