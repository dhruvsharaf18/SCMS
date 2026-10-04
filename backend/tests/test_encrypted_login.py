"""Tests for the RSA-OAEP encrypted login flow.

Coverage:
  T-EL-01  GET /auth/login-key returns the expected shape
  T-EL-02  Full round-trip: encrypt -> POST /auth/login -> 200
  T-EL-03  Unknown key_id -> 422 INVALID_KEY
  T-EL-04  Stale timestamp (> 120 s) -> 422 STALE_TIMESTAMP
  T-EL-05  Missing timestamp -> 422 STALE_TIMESTAMP
  T-EL-06  Corrupted ciphertext -> 422 INVALID_KEY (decryption fails)
  T-EL-07  Plaintext still works while LOGIN_ALLOW_PLAINTEXT=true
  T-EL-08  Plaintext is refused when LOGIN_ALLOW_PLAINTEXT=false
  T-EL-09  Lockout counter still applies to encrypted logins
  T-EL-10  Rate limit still applies to encrypted logins
  T-EL-11  login-key endpoint itself is rate-limited (30/minute)
"""

import base64
import json
import time
import uuid

import pytest
from fastapi.testclient import TestClient

from app.crypto_login import key_store
from app.enums import Role
from app.security import limiter

from .conftest import API, GOOD_PASSWORD


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_key(client: TestClient) -> dict:
    res = client.get(f"{API}/auth/login-key")
    assert res.status_code == 200, res.text
    return res.json()


def _encrypt(key_info: dict, email: str, password: str, ts: float | None = None) -> dict:
    """Encrypt {email, password, ts} with the public key returned by the server."""
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    spki_der = base64.b64decode(key_info["public_key_spki_b64"])
    public_key = serialization.load_der_public_key(spki_der)

    if ts is None:
        ts = time.time()
    payload_bytes = json.dumps({"email": email, "password": password, "ts": ts}).encode("utf-8")

    ciphertext = public_key.encrypt(
        payload_bytes,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
    return {
        "key_id": key_info["key_id"],
        "data": base64.b64encode(ciphertext).decode(),
    }


def _encrypted_login(client: TestClient, email: str, password: str, ts: float | None = None):
    key_info = _get_key(client)
    body = _encrypt(key_info, email, password, ts=ts)
    return client.post(f"{API}/auth/login", json=body)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_el_01_login_key_shape(client: TestClient) -> None:
    """T-EL-01: GET /auth/login-key returns key_id, public_key_spki_b64, expires_at."""
    data = _get_key(client)
    assert "key_id" in data
    assert "public_key_spki_b64" in data
    assert "expires_at" in data
    # Verify the base64 decodes to something DER-shaped (starts with SEQUENCE 0x30)
    der = base64.b64decode(data["public_key_spki_b64"])
    assert der[0] == 0x30, "SPKI DER should start with SEQUENCE tag 0x30"


def test_el_02_full_round_trip(client: TestClient, make_user) -> None:
    """T-EL-02: Encrypted login succeeds and returns the same shape as plaintext."""
    user = make_user(Role.MANAGER)
    res = _encrypted_login(client, user.email, GOOD_PASSWORD)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["user"]["email"] == user.email
    assert body["user"]["role"] == "MANAGER"
    assert "access_token" in body


def test_el_03_unknown_key_id(client: TestClient, make_user) -> None:
    """T-EL-03: An unknown key_id is rejected with INVALID_KEY."""
    user = make_user()
    key_info = _get_key(client)
    body = _encrypt(key_info, user.email, GOOD_PASSWORD)
    body["key_id"] = "no-such-key-" + uuid.uuid4().hex
    res = client.post(f"{API}/auth/login", json=body)
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "INVALID_KEY"


def test_el_04_stale_timestamp(client: TestClient, make_user) -> None:
    """T-EL-04: A payload with a timestamp > 120 s old is rejected."""
    user = make_user()
    stale_ts = time.time() - 300  # 5 minutes ago
    res = _encrypted_login(client, user.email, GOOD_PASSWORD, ts=stale_ts)
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "STALE_TIMESTAMP"


def test_el_05_missing_timestamp(client: TestClient, make_user) -> None:
    """T-EL-05: A payload without a ts field is rejected."""
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    user = make_user()
    key_info = _get_key(client)
    spki_der = base64.b64decode(key_info["public_key_spki_b64"])
    public_key = serialization.load_der_public_key(spki_der)
    # No ts field
    payload_bytes = json.dumps({"email": user.email, "password": GOOD_PASSWORD}).encode()
    ciphertext = public_key.encrypt(
        payload_bytes,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
    body = {"key_id": key_info["key_id"], "data": base64.b64encode(ciphertext).decode()}
    res = client.post(f"{API}/auth/login", json=body)
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "STALE_TIMESTAMP"


def test_el_06_corrupted_ciphertext(client: TestClient, make_user) -> None:
    """T-EL-06: Garbage ciphertext → INVALID_KEY (decryption failure)."""
    key_info = _get_key(client)
    body = {
        "key_id": key_info["key_id"],
        "data": base64.b64encode(b"not-real-ciphertext-" * 20).decode(),
    }
    res = client.post(f"{API}/auth/login", json=body)
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "INVALID_KEY"


def test_el_07_plaintext_still_works_when_allowed(client: TestClient, make_user) -> None:
    """T-EL-07: Plaintext login still works while LOGIN_ALLOW_PLAINTEXT=true (default)."""
    user = make_user()
    res = client.post(f"{API}/auth/login", json={"email": user.email, "password": GOOD_PASSWORD})
    assert res.status_code == 200, res.text


def test_el_08_plaintext_refused_when_disabled(client: TestClient, make_user, monkeypatch) -> None:
    """T-EL-08: When LOGIN_ALLOW_PLAINTEXT=false, plaintext → ENCRYPTED_LOGIN_REQUIRED."""
    from app.config import settings as cfg
    monkeypatch.setattr(cfg, "login_allow_plaintext", False)
    user = make_user()
    res = client.post(f"{API}/auth/login", json={"email": user.email, "password": GOOD_PASSWORD})
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "ENCRYPTED_LOGIN_REQUIRED"


def test_el_09_lockout_still_works_for_encrypted_login(client: TestClient, make_user) -> None:
    """T-EL-09: 5 bad encrypted logins still trigger lockout (ACCOUNT_LOCKED)."""
    user = make_user()
    for _ in range(5):
        res = _encrypted_login(client, user.email, "Wr0ngPassword")
        assert res.status_code == 401

    locked = _encrypted_login(client, user.email, GOOD_PASSWORD)
    assert locked.status_code == 423
    assert locked.json()["error"]["code"] == "ACCOUNT_LOCKED"


def test_el_10_rate_limit_applies_to_encrypted_login(client: TestClient, make_user) -> None:
    """T-EL-10: 5/minute limit applies to the encrypted login path too."""
    user = make_user()
    # Reset in-memory hit counters so counts from previous tests do not bleed in.
    limiter._storage.reset()  # type: ignore[attr-defined]
    limiter.enabled = True
    try:
        statuses = [
            _encrypted_login(client, user.email, "Wr0ngPassword").status_code for _ in range(5)
        ]
        sixth = _encrypted_login(client, user.email, GOOD_PASSWORD)
    finally:
        limiter.enabled = False
        limiter._storage.reset()  # type: ignore[attr-defined]

    assert statuses == [401, 401, 401, 401, 401]
    assert sixth.status_code == 429
    assert sixth.json()["error"]["code"] == "RATE_LIMITED"


def test_el_11_login_key_rate_limited(client: TestClient) -> None:
    """T-EL-11: GET /auth/login-key is rate-limited (30/minute)."""
    limiter.enabled = True
    try:
        statuses = [client.get(f"{API}/auth/login-key").status_code for _ in range(31)]
    finally:
        limiter.enabled = False

    assert 429 in statuses, f"Expected a 429 among {statuses}"
