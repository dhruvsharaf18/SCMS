"""Hashing, JWT, RBAC dependencies, rate limiter and the identity business logic.

SRS 2.1 puts hash/JWT/RBAC/rate-limit here. The login, lockout, refresh-rotation and
user-management logic lives here too rather than in `services/`, because SRS 2.2 does not
list an auth service module. Routers stay thin.
"""

import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import Argon2Error
from fastapi import Depends, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .audit import log
from .config import settings
from .db import get_session
from .enums import Role
from .models import RefreshToken, User
from .schemas import UserCreate, UserUpdate

JWT_ALGORITHM = "HS256"
LOCKOUT_THRESHOLD = 5
LOCKOUT_MINUTES = 15
REFRESH_TOKEN_DAYS = 7
REFRESH_COOKIE_NAME = "refresh_token"
REFRESH_COOKIE_PATH = "/api/v1/auth"

# S-05 / S-06: keyed on the real client IP. uvicorn runs with --proxy-headers and nginx
# overwrites X-Forwarded-For, so request.client.host is the browser, not the proxy.
limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

_hasher = PasswordHasher()
_bearer = HTTPBearer(auto_error=False)


class AppError(Exception):
    """Raised anywhere; rendered as the SRS 6 envelope by the handlers in main.py."""

    def __init__(
        self,
        code: str,
        message: str,
        status: int,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.details = details or {}


def utcnow() -> datetime:
    return datetime.now(tz=timezone.utc)


# --------------------------------------------------------------------------- passwords


_PASSWORD_CLASSES = (
    (r"[A-Z]", "an uppercase letter"),
    (r"[a-z]", "a lowercase letter"),
    (r"\d", "a digit"),
)


def validate_password_policy(password: str) -> None:
    """S-01: min 10 chars, upper, lower and digit."""
    missing = [label for pattern, label in _PASSWORD_CLASSES if not re.search(pattern, password)]
    if len(password) < 10:
        missing.insert(0, "at least 10 characters")
    if missing:
        raise AppError(
            "VALIDATION_ERROR",
            "Password must contain " + ", ".join(missing) + ".",
            422,
            {"field": "password"},
        )


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except Argon2Error:
        return False


# ------------------------------------------------------------------------- access JWT


def create_access_token(user: User) -> tuple[str, int]:
    expires_in = settings.access_token_minutes * 60
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "exp": utcnow() + timedelta(seconds=expires_in),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALGORITHM), expires_in


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise AppError("TOKEN_EXPIRED", "Your session has expired. Please sign in again.", 401)
    except jwt.InvalidTokenError:
        raise AppError("INVALID_TOKEN", "Invalid authentication token.", 401)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: Session = Depends(get_session),
) -> User:
    if credentials is None:
        raise AppError("INVALID_TOKEN", "Authentication required.", 401)
    payload = decode_access_token(credentials.credentials)
    try:
        user_id = int(payload.get("sub", ""))
    except (TypeError, ValueError):
        raise AppError("INVALID_TOKEN", "Invalid authentication token.", 401)
    user = session.get(User, user_id)
    if user is None or not user.is_active:
        raise AppError("INVALID_TOKEN", "Invalid authentication token.", 401)
    return user


def current_member_id(session: Session, user: User) -> int | None:
    """The members row linked to this user, if any (SRS 10: members.user_id UNIQUE)."""
    from .models import Member

    return session.execute(
        select(Member.id).where(Member.user_id == user.id)
    ).scalar_one_or_none()


def assert_member_access(session: Session, user: User, member_id: int | None) -> None:
    """S-04 IDOR guard. A MEMBER reaching another member's row gets 404, not 403."""
    if user.role != Role.MEMBER.value:
        return
    if member_id is None or current_member_id(session, user) != member_id:
        raise AppError("NOT_FOUND", "Not found.", 404)


def require_roles(*roles: Role):
    """S-03: RBAC dependency used on every non-public endpoint."""
    allowed = {role.value for role in roles}

    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise AppError("FORBIDDEN", "You do not have access to this resource.", 403)
        return user

    return dependency


# ----------------------------------------------------------------------------- login


def authenticate(session: Session, email: str, password: str) -> User:
    """S-05 lockout. The lock is checked before the password is ever verified."""
    user = session.execute(select(User).where(User.email == email)).scalar_one_or_none()
    invalid = AppError("INVALID_CREDENTIALS", "Email or password is incorrect.", 401)

    # Unknown or disabled accounts are indistinguishable and never counted.
    if user is None or not user.is_active:
        raise invalid

    now = utcnow()
    if user.locked_until is not None:
        if user.locked_until > now:
            raise AppError(
                "ACCOUNT_LOCKED",
                "Too many failed attempts. Try again later.",
                423,
                {"locked_until": user.locked_until.isoformat().replace("+00:00", "Z")},
            )
        # Lock has expired: the counter starts again from zero.
        user.failed_attempts = 0
        user.locked_until = None

    if not verify_password(user.password_hash, password):
        user.failed_attempts += 1
        if user.failed_attempts >= LOCKOUT_THRESHOLD:
            user.locked_until = now + timedelta(minutes=LOCKOUT_MINUTES)
        session.commit()
        raise invalid

    user.failed_attempts = 0
    user.locked_until = None
    session.commit()
    return user


# --------------------------------------------------------------------- refresh tokens


def _hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def issue_refresh_token(session: Session, user: User) -> str:
    """S-02: only the SHA-256 hex of the token is stored."""
    raw = secrets.token_urlsafe(32)
    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=_hash_refresh_token(raw),
            expires_at=utcnow() + timedelta(days=REFRESH_TOKEN_DAYS),
        )
    )
    session.commit()
    return raw


def rotate_refresh_token(session: Session, raw: str | None) -> tuple[User, str]:
    invalid = AppError("INVALID_TOKEN", "Invalid or expired session. Please sign in again.", 401)
    if not raw:
        raise invalid

    now = utcnow()
    row = session.execute(
        select(RefreshToken).where(RefreshToken.token_hash == _hash_refresh_token(raw))
    ).scalar_one_or_none()
    if row is None or row.revoked_at is not None or row.expires_at <= now:
        raise invalid

    user = session.get(User, row.user_id)
    if user is None or not user.is_active:
        raise invalid

    row.revoked_at = now
    new_raw = secrets.token_urlsafe(32)
    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=_hash_refresh_token(new_raw),
            expires_at=now + timedelta(days=REFRESH_TOKEN_DAYS),
        )
    )
    session.commit()
    return user, new_raw


def revoke_refresh_token(session: Session, raw: str | None) -> None:
    """Idempotent: an unknown or already-revoked token is not an error."""
    if not raw:
        return
    row = session.execute(
        select(RefreshToken).where(RefreshToken.token_hash == _hash_refresh_token(raw))
    ).scalar_one_or_none()
    if row is not None and row.revoked_at is None:
        row.revoked_at = utcnow()
        session.commit()


def revoke_user_refresh_tokens(session: Session, user_id: int) -> None:
    session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )


def set_refresh_cookie(response: Response, raw: str) -> None:
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        raw,
        max_age=REFRESH_TOKEN_DAYS * 24 * 60 * 60,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        samesite="strict",
        secure=settings.cookie_secure,
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        REFRESH_COOKIE_NAME,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        samesite="strict",
        secure=settings.cookie_secure,
    )


# ------------------------------------------------------------------- user management


def client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def create_staff_user(
    session: Session, actor: User, data: UserCreate, ip: str | None
) -> User:
    validate_password_policy(data.password)
    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        role=data.role.value,
    )
    session.add(user)
    try:
        session.flush()
    except IntegrityError:
        session.rollback()
        raise AppError("EMAIL_EXISTS", "A user with that email already exists.", 409)

    log(
        session,
        actor_id=actor.id,
        action="USER_CREATED",
        entity="user",
        entity_id=user.id,
        meta={"after": {"email": user.email, "role": user.role, "is_active": user.is_active}},
        ip=ip,
    )
    session.commit()
    session.refresh(user)
    return user


def update_user(
    session: Session, actor: User, user_id: int, data: UserUpdate, ip: str | None
) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise AppError("NOT_FOUND", "User not found.", 404)

    before = {"role": user.role, "is_active": user.is_active}
    if data.role is not None:
        user.role = data.role.value
    if data.is_active is not None:
        user.is_active = data.is_active
        if not data.is_active:
            revoke_user_refresh_tokens(session, user.id)
    after = {"role": user.role, "is_active": user.is_active}

    log(
        session,
        actor_id=actor.id,
        action="USER_UPDATED",
        entity="user",
        entity_id=user.id,
        meta={"before": before, "after": after},
        ip=ip,
    )
    session.commit()
    session.refresh(user)
    return user
