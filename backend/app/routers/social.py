from datetime import date

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from ..db import get_session
from ..enums import Role
from ..models import User
from ..schemas import (
    SocialJoin,
    SocialLeave,
    SocialParticipantOut,
    SocialSessionCreate,
    SocialSessionOut,
)
from ..security import client_ip, require_roles
from ..services import social as svc

# Paths are written in full so they match SRS 3.2 exactly (see DECISIONS).
router = APIRouter(prefix="/api/v1", tags=["social"])

_ADMIN = (Role.OWNER, Role.MANAGER)
_STAFF = (Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
_ALL = (Role.OWNER, Role.MANAGER, Role.FRONT_DESK, Role.BAR_STAFF, Role.MEMBER)


def _out(social, joined: int) -> SocialSessionOut:
    return SocialSessionOut(
        id=social.id,
        court_id=social.court_id,
        title=social.title,
        start_at=social.start_at,
        end_at=social.end_at,
        capacity=social.capacity,
        joined_count=joined,
        fee_paise=int(social.fee_paise),
        status=social.status,
    )


@router.get("/social-sessions", response_model=list[SocialSessionOut])
def list_sessions(
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ALL)),
) -> list[SocialSessionOut]:
    return [_out(social, joined) for social, joined in svc.list_sessions(session, from_, to)]


@router.post("/social-sessions", response_model=SocialSessionOut, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: SocialSessionCreate,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ADMIN)),
) -> SocialSessionOut:
    social = svc.create_session(session, user, payload.model_dump(), client_ip(request))
    return _out(social, 0)


@router.get("/social-sessions/{session_id}", response_model=SocialSessionOut)
def get_session_row(
    session_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ALL)),
) -> SocialSessionOut:
    social = svc.get_session_row(session, session_id)
    return _out(social, svc.joined_count(session, social.id))


@router.get("/social-sessions/{session_id}/participants", response_model=list[SocialParticipantOut])
def participants(
    session_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_STAFF)),
) -> list[SocialParticipantOut]:
    """Staff only: the roster names other members (SRS 3.2.6, S-15)."""
    return [SocialParticipantOut.model_validate(row) for row in svc.participants(session, session_id)]


@router.post("/social-sessions/{session_id}/join", response_model=SocialParticipantOut, status_code=status.HTTP_201_CREATED)
def join(
    session_id: int,
    payload: SocialJoin,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_STAFF, Role.MEMBER)),
) -> SocialParticipantOut:
    participant = svc.join(
        session, user, session_id, payload.member_id, payload.guest_name, client_ip(request)
    )
    return SocialParticipantOut.model_validate(participant)


@router.post("/social-sessions/{session_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
def leave(
    session_id: int,
    payload: SocialLeave,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_STAFF, Role.MEMBER)),
) -> None:
    svc.leave(session, user, session_id, payload.member_id)


@router.delete("/social-sessions/{session_id}", response_model=SocialSessionOut)
def cancel_session(
    session_id: int,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ADMIN)),
) -> SocialSessionOut:
    social = svc.cancel_session(session, user, session_id, client_ip(request))
    return _out(social, 0)
