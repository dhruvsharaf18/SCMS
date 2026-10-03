import uuid

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.enums import Role
from app.models import AuditLog, User
from app.security import limiter

from .conftest import API, GOOD_PASSWORD

WRONG_PASSWORD = "Wr0ngPassword"


def _login(client: TestClient, email: str, password: str = GOOD_PASSWORD):
    return client.post(f"{API}/auth/login", json={"email": email, "password": password})


def _token(client: TestClient, user: User) -> str:
    response = _login(client, user.email)
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _new_user_payload(role: str = "FRONT_DESK", password: str = GOOD_PASSWORD) -> dict:
    return {
        "email": f"test-{uuid.uuid4().hex[:12]}@test.local",
        "full_name": "Created User",
        "password": password,
        "role": role,
    }


def test_login_returns_srs_shape_and_me_agrees(client: TestClient, make_user) -> None:
    user = make_user(Role.MANAGER)
    response = _login(client, user.email)
    assert response.status_code == 200, response.text

    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 900
    assert body["user"] == {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": "MANAGER",
        "member_id": None,
    }

    me = client.get(f"{API}/auth/me", headers=_auth(body["access_token"]))
    assert me.status_code == 200
    assert me.json() == body["user"]


def test_lockout_after_five_failed_logins(client: TestClient, make_user) -> None:
    """T-09: 5 bad logins -> 6th is 423, and 423 again even with the right password."""
    user = make_user()

    for attempt in range(5):
        response = _login(client, user.email, WRONG_PASSWORD)
        assert response.status_code == 401, f"attempt {attempt + 1}: {response.text}"
        assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"

    locked = _login(client, user.email, WRONG_PASSWORD)
    assert locked.status_code == 423
    assert locked.json()["error"]["code"] == "ACCOUNT_LOCKED"

    still_locked = _login(client, user.email, GOOD_PASSWORD)
    assert still_locked.status_code == 423
    assert still_locked.json()["error"]["code"] == "ACCOUNT_LOCKED"


def test_unknown_email_counts_nothing(client: TestClient) -> None:
    for _ in range(6):
        response = _login(client, f"test-{uuid.uuid4().hex[:12]}@test.local", WRONG_PASSWORD)
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_refresh_rotates_and_old_token_is_rejected(client: TestClient, make_user) -> None:
    user = make_user()
    assert _login(client, user.email).status_code == 200

    old_cookie = client.cookies.get("refresh_token")
    assert old_cookie

    rotated = client.post(f"{API}/auth/refresh")
    assert rotated.status_code == 200, rotated.text
    new_cookie = client.cookies.get("refresh_token")
    assert new_cookie and new_cookie != old_cookie
    assert rotated.json()["user"]["id"] == user.id

    client.cookies.clear()
    client.cookies.set("refresh_token", old_cookie)
    reused = client.post(f"{API}/auth/refresh")
    assert reused.status_code == 401
    assert reused.json()["error"]["code"] == "INVALID_TOKEN"


def test_logout_revokes_the_refresh_token(client: TestClient, make_user) -> None:
    user = make_user()
    token = _token(client, user)

    assert client.post(f"{API}/auth/logout", headers=_auth(token)).status_code == 200
    assert client.post(f"{API}/auth/refresh").status_code == 401


def test_front_desk_cannot_create_users(client: TestClient, make_user) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    response = client.post(f"{API}/users", json=_new_user_payload(), headers=_auth(token))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


def test_create_user_without_a_token_is_401(client: TestClient) -> None:
    response = client.post(f"{API}/users", json=_new_user_payload())
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_TOKEN"


def test_weak_password_is_rejected(client: TestClient, make_user) -> None:
    token = _token(client, make_user(Role.OWNER))
    response = client.post(
        f"{API}/users", json=_new_user_payload(password="short1a"), headers=_auth(token)
    )
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert set(body["error"]) == {"code", "message", "details"}


def test_member_role_is_rejected_on_user_create(client: TestClient, make_user) -> None:
    token = _token(client, make_user(Role.OWNER))
    response = client.post(
        f"{API}/users", json=_new_user_payload(role="MEMBER"), headers=_auth(token)
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_duplicate_email_is_409(client: TestClient, make_user) -> None:
    token = _token(client, make_user(Role.OWNER))
    payload = _new_user_payload()
    assert client.post(f"{API}/users", json=payload, headers=_auth(token)).status_code == 201

    duplicate = client.post(f"{API}/users", json=payload, headers=_auth(token))
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "EMAIL_EXISTS"


def test_user_changes_are_audited(client: TestClient, make_user, session: Session) -> None:
    owner = make_user(Role.OWNER)
    token = _token(client, owner)

    created = client.post(f"{API}/users", json=_new_user_payload(), headers=_auth(token))
    assert created.status_code == 201, created.text
    new_id = created.json()["id"]

    patched = client.patch(
        f"{API}/users/{new_id}", json={"is_active": False}, headers=_auth(token)
    )
    assert patched.status_code == 200
    assert patched.json()["is_active"] is False

    actions = session.execute(
        select(AuditLog.action, AuditLog.meta)
        .where(AuditLog.entity == "user", AuditLog.entity_id == new_id)
        .order_by(AuditLog.id)
    ).all()
    assert [row.action for row in actions] == ["USER_CREATED", "USER_UPDATED"]
    assert actions[1].meta["before"]["is_active"] is True
    assert actions[1].meta["after"]["is_active"] is False


def test_sixth_login_in_a_minute_is_rate_limited(client: TestClient, make_user) -> None:
    user = make_user()
    limiter.enabled = True
    try:
        statuses = [
            _login(client, user.email, WRONG_PASSWORD).status_code for _ in range(5)
        ]
        sixth = _login(client, user.email, WRONG_PASSWORD)
    finally:
        limiter.enabled = False

    assert statuses == [401, 401, 401, 401, 401]
    assert sixth.status_code == 429
    assert sixth.json()["error"]["code"] == "RATE_LIMITED"
