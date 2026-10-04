"""Authentication router.

POST /auth/login   – accepts either:
  • {key_id, data}             RSA-OAEP encrypted blob (always accepted)
  • {email, password}          plaintext (when LOGIN_ALLOW_PLAINTEXT=true, default)

GET  /auth/login-key           – returns the current RSA public key (public, rate-limited)
POST /auth/logout
GET  /auth/me
POST /users
PATCH /users/{user_id}
"""

import json
import time
from typing import Any

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from ..config import settings
from ..crypto_login import key_store
from ..db import get_session
from ..enums import Role
from ..schemas import (
    EncryptedLoginRequest,
    LoginKeyResponse,
    LoginRequest,
    LoginResponse,
    UserCreate,
    UserOut,
    UserSummary,
    UserUpdate,
)
from ..security import (
    SESSION_COOKIE_NAME,
    AppError,
    authenticate,
    clear_session_cookie,
    client_ip,
    close_session,
    create_staff_user,
    current_member_id,
    get_current_user,
    issue_access_token,
    limiter,
    open_session,
    require_roles,
    set_session_cookie,
    update_user,
)
from ..models import User

router = APIRouter(prefix="/api/v1", tags=["auth"])

# Maximum clock skew tolerated for the `ts` field inside encrypted blobs.
_MAX_SKEW_SECONDS = 120


def _summary(session: Session, user: User) -> UserSummary:
    summary = UserSummary.model_validate(user)
    if user.role == Role.MEMBER.value:
        summary.member_id = current_member_id(session, user)
    return summary


# --------------------------------------------------------------------------- key endpoint

# /auth/login-key is intentionally public: anyone may fetch the public key.
# It is listed alongside other public routes in test_security.py.
@router.get("/auth/login-key", response_model=LoginKeyResponse)
@limiter.limit("30/minute")
async def get_login_key(request: Request) -> LoginKeyResponse:
    """Return the current RSA public key (SPKI-DER-then-base64) for the browser.

    Rate-limited like all public routes.  The browser calls this once per login
    attempt, encrypts {email, password, ts} with RSA-OAEP/SHA-256, and sends the
    ciphertext as {key_id, data} to POST /auth/login.
    """
    info = key_store.current_key_info()
    return LoginKeyResponse(**info)


# --------------------------------------------------------------------------- login


@router.post("/auth/login", response_model=LoginResponse)
@limiter.limit("5/minute")
def login(
    request: Request,
    response: Response,
    body: dict[str, Any] = None,
    session: Session = Depends(get_session),
) -> LoginResponse:
    """Unified login endpoint.

    Detects the payload shape at runtime:
    • {key_id, data}    → decrypt with the named RSA key, parse inner JSON.
    • {email, password} → accepted only if LOGIN_ALLOW_PLAINTEXT=true (default).

    After extracting (email, password) the existing authenticate() path runs
    unchanged, preserving lockout/rate-limit semantics.
    """
    if not isinstance(body, dict):
        raise AppError("VALIDATION_ERROR", "Request body must be a JSON object.", 422)

    # ── Encrypted path ────────────────────────────────────────────────────────
    if "key_id" in body and "data" in body:
        try:
            enc = EncryptedLoginRequest.model_validate(body)
        except Exception:
            raise AppError("VALIDATION_ERROR", "The request body failed validation.", 422)

        try:
            plaintext_bytes = key_store.decrypt(enc.key_id, enc.data)
        except ValueError as exc:
            raise AppError("INVALID_KEY", str(exc), 422)

        try:
            inner: dict[str, Any] = json.loads(plaintext_bytes.decode("utf-8"))
        except Exception:
            raise AppError("INVALID_PAYLOAD", "Decrypted payload is not valid JSON.", 422)

        # Replay protection: ts must be within ±_MAX_SKEW_SECONDS of server time.
        ts = inner.get("ts")
        if ts is None:
            raise AppError(
                "STALE_TIMESTAMP",
                "Login payload is missing timestamp. Please try again.",
                422,
            )
        try:
            if abs(time.time() - float(ts)) > _MAX_SKEW_SECONDS:
                raise ValueError("stale")
        except ValueError:
            raise AppError(
                "STALE_TIMESTAMP",
                "Login payload timestamp is stale or missing. Please try again.",
                422,
            )

        email = inner.get("email", "")
        password = inner.get("password", "")
        if not email or not password:
            raise AppError("VALIDATION_ERROR", "email and password are required.", 422)

    # ── Plaintext path ────────────────────────────────────────────────────────
    elif "email" in body and "password" in body:
        if not settings.login_allow_plaintext:
            raise AppError(
                "ENCRYPTED_LOGIN_REQUIRED",
                "Plaintext login is disabled. Use the encrypted login flow.",
                422,
            )
        try:
            pt = LoginRequest.model_validate(body)
        except Exception:
            raise AppError("VALIDATION_ERROR", "The request body failed validation.", 422)
        email = pt.email
        password = pt.password

    else:
        raise AppError("VALIDATION_ERROR", "The request body failed validation.", 422)

    user = authenticate(session, email, password)
    raw_session_token = open_session(session, user)
    set_session_cookie(response, raw_session_token)
    return LoginResponse(
        user=_summary(session, user),
        access_token=issue_access_token(user),
    )


# --------------------------------------------------------------------------- other


@router.post("/auth/logout")
def logout(
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
) -> dict[str, str]:
    close_session(session, request.cookies.get(SESSION_COOKIE_NAME))
    clear_session_cookie(response)
    return {"status": "ok"}


@router.get("/auth/me", response_model=UserSummary)
def me(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> UserSummary:
    return _summary(session, user)


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    request: Request,
    payload: UserCreate,
    session: Session = Depends(get_session),
    actor: User = Depends(require_roles(Role.OWNER)),
) -> UserOut:
    user = create_staff_user(session, actor, payload, client_ip(request))
    return UserOut.model_validate(user)


@router.patch("/users/{user_id}", response_model=UserOut)
def patch_user(
    user_id: int,
    request: Request,
    payload: UserUpdate,
    session: Session = Depends(get_session),
    actor: User = Depends(require_roles(Role.OWNER)),
) -> UserOut:
    user = update_user(session, actor, user_id, payload, client_ip(request))
    return UserOut.model_validate(user)
