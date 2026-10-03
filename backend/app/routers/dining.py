from datetime import date

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from ..db import get_session
from ..enums import ReservationStatus, Role
from ..models import User
from ..schemas import (
    DiningAvailabilityOut,
    DiningMenuOut,
    Page,
    PageOut,
    PageSize,
    ReservationCreate,
    ReservationOut,
    ReservationStatusUpdate,
)
from ..security import require_roles
from ..services import dining as svc

router = APIRouter(prefix="/api/v1", tags=["dining"])

_STAFF = (Role.OWNER, Role.MANAGER, Role.FRONT_DESK, Role.BAR_STAFF)
_ALL = (*_STAFF, Role.MEMBER)


def _one(session: Session, user: User, row) -> ReservationOut:
    return ReservationOut(**svc.serialize(session, user, [row])[0])


@router.get("/dining/menu", response_model=DiningMenuOut)
def menu(
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ALL)),
) -> DiningMenuOut:
    return DiningMenuOut.model_validate(svc.menu(session, user))


@router.get("/dining/availability", response_model=DiningAvailabilityOut)
def availability(
    date_: date = Query(alias="date"),
    party_size: int = Query(default=2, ge=1, le=50),
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ALL)),
) -> DiningAvailabilityOut:
    return DiningAvailabilityOut.model_validate(svc.availability(session, date_, party_size))


@router.post(
    "/dining/reservations", response_model=ReservationOut, status_code=status.HTTP_201_CREATED
)
def create_reservation(
    payload: ReservationCreate,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ALL)),
) -> ReservationOut:
    return _one(session, user, svc.create_reservation(session, user, payload.model_dump()))


@router.get("/dining/reservations", response_model=PageOut)
def list_reservations(
    date_: date | None = Query(default=None, alias="date"),
    reservation_status: ReservationStatus | None = Query(default=None, alias="status"),
    upcoming: bool = False,
    page: Page = 1,
    page_size: PageSize = 50,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ALL)),
) -> PageOut:
    rows, total = svc.list_reservations(
        session, user, date_, reservation_status, upcoming, page, page_size
    )
    items = [ReservationOut(**row) for row in svc.serialize(session, user, rows)]
    return PageOut(items=items, total=total, page=page, page_size=page_size)


@router.get("/dining/reservations/{reservation_id}", response_model=ReservationOut)
def get_reservation(
    reservation_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ALL)),
) -> ReservationOut:
    return _one(session, user, svc.get_reservation(session, reservation_id, user))


@router.post("/dining/reservations/{reservation_id}/cancel", response_model=ReservationOut)
def cancel_reservation(
    reservation_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ALL)),
) -> ReservationOut:
    return _one(session, user, svc.cancel_reservation(session, user, reservation_id))


@router.post("/dining/reservations/{reservation_id}/status", response_model=ReservationOut)
def set_status(
    reservation_id: int,
    payload: ReservationStatusUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_STAFF)),
) -> ReservationOut:
    return _one(session, user, svc.set_status(session, user, reservation_id, payload.status))
