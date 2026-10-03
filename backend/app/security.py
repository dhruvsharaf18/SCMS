"""Hashing, login sessions, RBAC dependencies, rate limiter and the identity business logic.

Sign-in compares the email and password with the users table. A match opens a server-side
session: a random id goes to the browser in an HttpOnly cookie and only its SHA-256 is stored,
so every later request is tied back to a users row and its role. There are no JWTs.
"""

import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from argon2 import PasswordHasher
from argon2.exceptions import Argon2Error
from fastapi import Depends, Request, Response
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .audit import log
from .config import settings
from .db import get_session
from .enums import Role
from .models import LoginSession, User
from .schemas import UserCreate, UserUpdate

LOCKOUT_THRESHOLD = 5
LOCKOUT_MINUTES = 15
SESSION_COOKIE_NAME = "ccms_session"

# S-05 / S-06: keyed on the real client IP. uvicorn runs with --proxy-headers and nginx
# overwrites X-Forwarded-For, so request.client.host is the browser, not the proxy.
limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

_hasher = PasswordHasher()


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


# ----------------------------------------------------------------------- login sessions


def _hash_session_id(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def open_session(session: Session, user: User) -> str:
    """Returns the raw id for the cookie; the database only ever sees its hash."""
    raw = secrets.token_urlsafe(32)
    session.add(
        LoginSession(
            user_id=user.id,
            token_hash=_hash_session_id(raw),
            expires_at=utcnow() + timedelta(hours=settings.session_hours),
        )
    )
    session.commit()
    return raw


def close_session(session: Session, raw: str | None) -> None:
    """Idempotent: an unknown or already-closed session is not an error."""
    if not raw:
        return
    row = session.execute(
        select(LoginSession).where(LoginSession.token_hash == _hash_session_id(raw))
    ).scalar_one_or_none()
    if row is not None and row.revoked_at is None:
        row.revoked_at = utcnow()
        session.commit()


def close_user_sessions(session: Session, user_id: int) -> None:
    session.execute(
        update(LoginSession)
        .where(LoginSession.user_id == user_id, LoginSession.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )


def set_session_cookie(response: Response, raw: str) -> None:
    # Path "/" so the browser sends it on every API call. SameSite=Lax keeps it off
    # cross-site POSTs, which is what stops another site from acting as the user.
    response.set_cookie(
        SESSION_COOKIE_NAME,
        raw,
        max_age=settings.session_hours * 60 * 60,
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        SESSION_COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
    )


def get_current_user(request: Request, session: Session = Depends(get_session)) -> User:
    raw = request.cookies.get(SESSION_COOKIE_NAME)
    if not raw:
        raise AppError("NOT_AUTHENTICATED", "Please sign in.", 401)

    row = session.execute(
        select(LoginSession).where(LoginSession.token_hash == _hash_session_id(raw))
    ).scalar_one_or_none()
    if row is None or row.revoked_at is not None:
        raise AppError("NOT_AUTHENTICATED", "Please sign in.", 401)
    if row.expires_at <= utcnow():
        raise AppError("SESSION_EXPIRED", "Your session has expired. Please sign in again.", 401)

    user = session.get(User, row.user_id)
    if user is None or not user.is_active:
        raise AppError("NOT_AUTHENTICATED", "Please sign in.", 401)
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
            close_user_sessions(session, user.id)
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
