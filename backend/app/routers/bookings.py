from datetime import date

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_session
from ..enums import BookingStatus, Role
from ..models import Member, User
from ..schemas import (
    BookingCancel,
    BookingCancelled,
    BookingCreate,
    BookingOut,
    BookingPay,
    BookingStatusUpdate,
    Page,
    PageOut,
    PageSize,
)
from ..security import client_ip, require_roles
from ..services import booking as svc

# Paths are written in full so they match SRS 3.2 exactly (see DECISIONS).
router = APIRouter(prefix="/api/v1", tags=["bookings"])

_BOOKERS = (Role.OWNER, Role.MANAGER, Role.FRONT_DESK, Role.MEMBER)
_STAFF = (Role.OWNER, Role.MANAGER, Role.FRONT_DESK)


def _enrich_booking_out(session: Session, user: User, booking: svc.Booking) -> BookingOut:
    out = BookingOut.model_validate(booking)
    if user.role in (Role.OWNER.value, Role.MANAGER.value, Role.FRONT_DESK.value):
        if booking.member_id:
            member = session.get(Member, booking.member_id)
            if member:
                out.member_name = member.full_name
                out.member_code = member.member_code
    return out


@router.post("/bookings", response_model=BookingOut, status_code=status.HTTP_201_CREATED)
def create_booking(
    payload: BookingCreate,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_BOOKERS)),
) -> BookingOut:
    booking = svc.create_booking(session, user, payload.model_dump(), client_ip(request))
    return _enrich_booking_out(session, user, booking)


@router.get("/bookings", response_model=PageOut)
def list_bookings(
    date_: date | None = Query(default=None, alias="date"),
    court_id: int | None = None,
    member_id: int | None = None,
    booking_status: BookingStatus | None = Query(default=None, alias="status"),
    page: Page = 1,
    page_size: PageSize = 50,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_BOOKERS)),
) -> PageOut:
    rows, total = svc.list_bookings(
        session, user, date_, court_id, member_id, booking_status, page, page_size
    )
    is_staff = user.role in (Role.OWNER.value, Role.MANAGER.value, Role.FRONT_DESK.value)
    members_map: dict[int, tuple[str, str]] = {}
    if is_staff:
        member_ids = {row.member_id for row in rows if row.member_id is not None}
        if member_ids:
            members = session.execute(
                select(Member.id, Member.full_name, Member.member_code).where(Member.id.in_(member_ids))
            ).all()
            members_map = {m.id: (m.full_name, m.member_code) for m in members}

    items = []
    for row in rows:
        out = BookingOut.model_validate(row)
        if is_staff and row.member_id and row.member_id in members_map:
            out.member_name, out.member_code = members_map[row.member_id]
        items.append(out)

    return PageOut(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/bookings/{booking_id}", response_model=BookingOut)
def get_booking(
    booking_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_BOOKERS)),
) -> BookingOut:
    return _enrich_booking_out(session, user, svc.get_booking(session, booking_id, user))


@router.post("/bookings/{booking_id}/cancel", response_model=BookingCancelled)
def cancel_booking(
    booking_id: int,
    payload: BookingCancel,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_BOOKERS)),
) -> BookingCancelled:
    booking, refunded, refund_paise = svc.cancel_booking(
        session, user, booking_id, payload.reason, payload.refund, client_ip(request)
    )
    return BookingCancelled(
        id=booking.id,
        status=BookingStatus(booking.status),
        refunded=refunded,
        refund_paise=refund_paise,
    )


@router.post("/bookings/{booking_id}/status", response_model=BookingOut)
def set_status(
    booking_id: int,
    payload: BookingStatusUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_STAFF)),
) -> BookingOut:
    return _enrich_booking_out(session, user, svc.set_status(session, user, booking_id, payload.status))


@router.post("/bookings/{booking_id}/pay", response_model=BookingOut)
def pay_booking(
    booking_id: int,
    payload: BookingPay,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_STAFF)),
) -> BookingOut:
    booking = svc.pay_booking(session, user, booking_id, payload.payment_method)
    return _enrich_booking_out(session, user, booking)
