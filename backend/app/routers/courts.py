from datetime import date

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from ..db import get_session
from ..enums import Role, Sport
from ..models import User
from ..schemas import AvailabilityOut, CourtCreate, CourtOut, CourtUpdate
from ..security import client_ip, current_member_id, require_roles
from ..services import booking as svc

# Paths are written in full so they match SRS 3.2 exactly (see DECISIONS).
router = APIRouter(prefix="/api/v1", tags=["courts"])

_ALL = (Role.OWNER, Role.MANAGER, Role.FRONT_DESK, Role.BAR_STAFF, Role.MEMBER)
_ADMIN = (Role.OWNER, Role.MANAGER)


@router.get("/courts", response_model=list[CourtOut])
def list_courts(
    sport: Sport | None = None,
    include_inactive: bool = False,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ALL)),
) -> list[CourtOut]:
    courts = svc.list_courts(session, sport, active_only=not include_inactive)
    return [CourtOut.model_validate(court) for court in courts]


@router.post("/courts", response_model=CourtOut, status_code=status.HTTP_201_CREATED)
def create_court(
    payload: CourtCreate,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ADMIN)),
) -> CourtOut:
    court = svc.create_court(session, user, payload.model_dump(), client_ip(request))
    return CourtOut.model_validate(court)


@router.patch("/courts/{court_id}", response_model=CourtOut)
def update_court(
    court_id: int,
    payload: CourtUpdate,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ADMIN)),
) -> CourtOut:
    data = payload.model_dump(exclude_unset=True)
    court = svc.update_court(session, user, court_id, data, client_ip(request))
    return CourtOut.model_validate(court)


@router.get("/courts/availability", response_model=AvailabilityOut)
def availability(
    date_: date = Query(alias="date"),
    sport: Sport | None = None,
    member_id: int | None = Query(default=None),
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ALL)),
) -> AvailabilityOut:
    """Staff see walk-in prices unless they name a member; members always see their own."""
    if user.role == Role.MEMBER.value:
        member_id = current_member_id(session, user)
    return AvailabilityOut.model_validate(svc.availability(session, date_, sport, member_id))
