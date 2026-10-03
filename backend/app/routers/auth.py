from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from ..db import get_session
from ..enums import Role
from ..schemas import LoginRequest, LoginResponse, UserCreate, UserOut, UserSummary, UserUpdate
from ..security import (
    SESSION_COOKIE_NAME,
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


def _summary(session: Session, user: User) -> UserSummary:
    summary = UserSummary.model_validate(user)
    if user.role == Role.MEMBER.value:
        summary.member_id = current_member_id(session, user)
    return summary


@router.post("/auth/login", response_model=LoginResponse)
@limiter.limit("5/minute")
def login(
    request: Request,
    response: Response,
    payload: LoginRequest,
    session: Session = Depends(get_session),
) -> LoginResponse:
    user = authenticate(session, payload.email, payload.password)
    set_session_cookie(response, open_session(session, user))
    return LoginResponse(
        user=_summary(session, user),
        access_token=issue_access_token(user),
    )


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
