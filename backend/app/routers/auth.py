from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from ..db import get_session
from ..enums import Role
from ..schemas import LoginRequest, TokenResponse, UserCreate, UserOut, UserSummary, UserUpdate
from ..security import (
    REFRESH_COOKIE_NAME,
    authenticate,
    clear_refresh_cookie,
    client_ip,
    create_access_token,
    current_member_id,
    create_staff_user,
    get_current_user,
    issue_refresh_token,
    limiter,
    require_roles,
    revoke_refresh_token,
    rotate_refresh_token,
    set_refresh_cookie,
    update_user,
)
from ..models import User

router = APIRouter(prefix="/api/v1", tags=["auth"])


def _summary(session: Session, user: User) -> UserSummary:
    summary = UserSummary.model_validate(user)
    if user.role == Role.MEMBER.value:
        summary.member_id = current_member_id(session, user)
    return summary


def _token_response(session: Session, user: User) -> TokenResponse:
    access_token, expires_in = create_access_token(user)
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=expires_in,
        user=_summary(session, user),
    )


@router.post("/auth/login", response_model=TokenResponse)
@limiter.limit("5/minute")
def login(
    request: Request,
    response: Response,
    payload: LoginRequest,
    session: Session = Depends(get_session),
) -> TokenResponse:
    user = authenticate(session, payload.email, payload.password)
    set_refresh_cookie(response, issue_refresh_token(session, user))
    return _token_response(session, user)


@router.post("/auth/refresh", response_model=TokenResponse)
def refresh(
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
) -> TokenResponse:
    user, new_raw = rotate_refresh_token(session, request.cookies.get(REFRESH_COOKIE_NAME))
    set_refresh_cookie(response, new_raw)
    return _token_response(session, user)


@router.post("/auth/logout")
def logout(
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
) -> dict[str, str]:
    revoke_refresh_token(session, request.cookies.get(REFRESH_COOKIE_NAME))
    clear_refresh_cookie(response)
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
