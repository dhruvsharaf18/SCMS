"""SRS 4.2 / 4.3 — court bookings.

Overlap is prevented by one database rule and nothing else: UNIQUE(court_id, slot_start) on
`court_slots`. A one-hour booking inserts TWO 30-minute rows in the same transaction, so a
12:30 booking and a 13:00 booking collide on the 13:00 row. Never replace this with an
application-level overlap check.
"""

from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import audit
from ..config import CLUB_TZ, day_bounds_utc, local_date
from ..enums import (
    BookingPaymentStatus,
    BookingSource,
    BookingStatus,
    PaymentMethod,
    Role,
    SlotState,
    SourceType,
    Sport,
    Tier,
)
from ..models import Booking, Court, CourtSlot, Member, SocialSession, User
from ..security import AppError, utcnow
from . import payments as payments_svc
from . import pricing

SLOT_MINUTES = 30
BOOKING_MINUTES = 60
OPEN_TIME = time(6, 0)
LAST_START_TIME = time(21, 0)
REFUND_WINDOW = timedelta(hours=2)

_COUNTED_STATUSES = (BookingStatus.CONFIRMED.value, BookingStatus.COMPLETED.value)


# ----------------------------------------------------------------------------- validation


def validate_start(start_at: datetime, advance_days: int, now: datetime | None = None) -> None:
    """Off-grid, outside club hours, in the past, or too far ahead are all INVALID_SLOT."""
    now = now or utcnow()
    if start_at.tzinfo is None:
        raise AppError("INVALID_SLOT", "start_at must include a timezone.", 422)
    if start_at.second or start_at.microsecond or start_at.minute not in (0, 30):
        raise AppError("INVALID_SLOT", "Bookings start on the hour or half hour.", 422)
    if start_at <= now:
        raise AppError("INVALID_SLOT", "That slot is in the past.", 422)

    local_start = start_at.astimezone(CLUB_TZ).time()
    if local_start < OPEN_TIME or local_start > LAST_START_TIME:
        raise AppError("INVALID_SLOT", "The club takes bookings from 06:00 to 21:00.", 422)

    horizon = local_date(now) + timedelta(days=advance_days)
    if local_date(start_at) > horizon:
        raise AppError("INVALID_SLOT", f"Bookings open {advance_days} days ahead.", 422)


def _court(session: Session, court_id: int) -> Court:
    court = session.get(Court, court_id)
    if court is None or not court.is_active:
        raise AppError("COURT_NOT_FOUND", "Court not found.", 404)
    return court


def _slot_starts(start_at: datetime) -> list[datetime]:
    return [start_at + timedelta(minutes=offset) for offset in (0, SLOT_MINUTES)]


# ----------------------------------------------------------------------------- create


def _assert_daily_limit(session: Session, member_id: int, start_at: datetime) -> None:
    """Locks the member row first so two concurrent requests cannot both see count = 1."""
    session.execute(select(Member.id).where(Member.id == member_id).with_for_update()).scalar_one()
    day_from, day_to = day_bounds_utc(local_date(start_at))
    used = session.execute(
        select(func.count(Booking.id)).where(
            Booking.member_id == member_id,
            Booking.status.in_(_COUNTED_STATUSES),
            Booking.start_at >= day_from,
            Booking.start_at < day_to,
        )
    ).scalar_one()
    limit, _ = pricing.booking_limits(session, member_id)
    if used >= limit:
        raise AppError(
            "DAILY_LIMIT_REACHED",
            f"This member already has {limit} bookings on that day.",
            409,
        )


def create_booking(
    session: Session,
    actor: User | None,
    data: dict,
    ip: str | None = None,
) -> Booking:
    """One transaction: limit check, booking row, two slot rows, optional payment."""
    member_id = data.get("member_id")
    source = data.get("source") or BookingSource.FRONT_DESK
    if actor is not None and actor.role == Role.MEMBER.value:
        member_id = _own_member_id(session, actor)
        source = BookingSource.WEB

    if member_id is None and not (data.get("guest_name") and data.get("guest_phone")):
        raise AppError("GUEST_REQUIRED", "Walk-ins need a guest name and phone.", 422)

    start_at = data["start_at"].astimezone(timezone.utc)
    court = _court(session, data["court_id"])
    _, advance_days = pricing.booking_limits(session, member_id)
    validate_start(start_at, advance_days)

    if member_id is not None:
        if session.get(Member, member_id) is None:
            raise AppError("MEMBER_NOT_FOUND", "Member not found.", 404)
        _assert_daily_limit(session, member_id, start_at)

    tier = pricing.tier_for(session, member_id, local_date(start_at))
    price_paise = pricing.court_price(session, court.sport, tier)
    method = data.get("payment_method")

    if price_paise == 0:
        payment_status = BookingPaymentStatus.WAIVED
    elif method:
        payment_status = BookingPaymentStatus.PAID
    else:
        payment_status = BookingPaymentStatus.UNPAID

    booking = Booking(
        court_id=court.id,
        member_id=member_id,
        guest_name=data.get("guest_name") if member_id is None else None,
        guest_phone=data.get("guest_phone") if member_id is None else None,
        start_at=start_at,
        end_at=start_at + timedelta(minutes=BOOKING_MINUTES),
        status=BookingStatus.CONFIRMED.value,
        tier_applied=Tier(tier).value,
        price_paise=price_paise,
        payment_status=BookingPaymentStatus(payment_status).value,
        source=BookingSource(source).value,
        created_by=actor.id if actor else None,
    )
    session.add(booking)
    session.flush()

    session.add_all(
        CourtSlot(court_id=court.id, slot_start=slot_start, booking_id=booking.id)
        for slot_start in _slot_starts(start_at)
    )
    try:
        session.flush()
    except IntegrityError:
        session.rollback()
        raise AppError("SLOT_TAKEN", "That slot has just been taken.", 409) from None

    if payment_status == BookingPaymentStatus.PAID:
        payments_svc.record_payment(
            session,
            SourceType.BOOKING,
            booking.id,
            price_paise,
            PaymentMethod(method),
            member_id=member_id,
            user_id=actor.id if actor else None,
        )

    session.commit()
    session.refresh(booking)
    return booking


def _own_member_id(session: Session, user: User) -> int:
    member_id = session.execute(
        select(Member.id).where(Member.user_id == user.id)
    ).scalar_one_or_none()
    if member_id is None:
        raise AppError("MEMBER_NOT_FOUND", "This account is not linked to a member.", 404)
    return member_id


# ----------------------------------------------------------------------------- read


def get_booking(session: Session, booking_id: int, actor: User) -> Booking:
    booking = session.get(Booking, booking_id)
    if booking is None:
        raise AppError("NOT_FOUND", "Booking not found.", 404)
    if actor.role == Role.MEMBER.value and booking.member_id != _own_member_id(session, actor):
        raise AppError("NOT_FOUND", "Booking not found.", 404)
    return booking


def list_bookings(
    session: Session,
    actor: User,
    on: date | None = None,
    court_id: int | None = None,
    member_id: int | None = None,
    status: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[Booking], int]:
    if actor.role == Role.MEMBER.value:
        member_id = _own_member_id(session, actor)

    filters = []
    if on is not None:
        day_from, day_to = day_bounds_utc(on)
        filters += [Booking.start_at >= day_from, Booking.start_at < day_to]
    if court_id is not None:
        filters.append(Booking.court_id == court_id)
    if member_id is not None:
        filters.append(Booking.member_id == member_id)
    if status is not None:
        filters.append(Booking.status == BookingStatus(status).value)

    total = session.execute(select(func.count(Booking.id)).where(*filters)).scalar_one()
    rows = (
        session.execute(
            select(Booking)
            .where(*filters)
            .order_by(Booking.start_at, Booking.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .scalars()
        .all()
    )
    return list(rows), int(total)


# ----------------------------------------------------------------------------- mutate


def cancel_booking(
    session: Session,
    actor: User,
    booking_id: int,
    reason: str | None = None,
    override_refund: bool = False,
    ip: str | None = None,
) -> tuple[Booking, bool, int]:
    """Returns (booking, refunded, refund_paise). Slots are freed either way (SRS 4.3)."""
    booking = get_booking(session, booking_id, actor)
    now = utcnow()

    if booking.status == BookingStatus.CANCELLED.value:
        raise AppError("ALREADY_CANCELLED", "This booking is already cancelled.", 409)
    if booking.status != BookingStatus.CONFIRMED.value:
        raise AppError("ALREADY_CANCELLED", "Only confirmed bookings can be cancelled.", 409)
    if now >= booking.start_at:
        raise AppError("BOOKING_STARTED", "This booking has already started.", 409)

    in_refund_window = (booking.start_at - now) >= REFUND_WINDOW
    may_override = override_refund and actor.role in (Role.OWNER.value, Role.MANAGER.value)

    refunded, refund_paise = False, 0
    if booking.payment_status == BookingPaymentStatus.PAID.value and (
        in_refund_window or may_override
    ):
        payment = payments_svc.payment_for(session, SourceType.BOOKING, booking.id)
        if payment is not None:
            payments_svc.refund_payment(session, payment)
            booking.payment_status = BookingPaymentStatus.REFUNDED.value
            refunded, refund_paise = True, int(payment.amount_paise)
            audit.log(
                session,
                actor.id,
                "BOOKING_REFUNDED",
                "booking",
                booking.id,
                {"refund_paise": refund_paise, "late_override": not in_refund_window},
                ip,
            )

    for slot in session.execute(
        select(CourtSlot).where(CourtSlot.booking_id == booking.id)
    ).scalars():
        session.delete(slot)

    booking.status = BookingStatus.CANCELLED.value
    booking.cancelled_at = now
    booking.cancel_reason = reason
    session.commit()
    session.refresh(booking)
    return booking, refunded, refund_paise


def set_status(
    session: Session, actor: User, booking_id: int, status: BookingStatus
) -> Booking:
    booking = get_booking(session, booking_id, actor)
    status = BookingStatus(status)
    if status not in (BookingStatus.COMPLETED, BookingStatus.NO_SHOW):
        raise AppError("INVALID_TRANSITION", "Staff may only set COMPLETED or NO_SHOW.", 422)
    if booking.status != BookingStatus.CONFIRMED.value:
        raise AppError("INVALID_TRANSITION", f"Booking is {booking.status}.", 409)
    booking.status = status.value
    session.commit()
    session.refresh(booking)
    return booking


def pay_booking(
    session: Session, actor: User, booking_id: int, method: PaymentMethod
) -> Booking:
    booking = get_booking(session, booking_id, actor)
    if booking.payment_status != BookingPaymentStatus.UNPAID.value:
        raise AppError("ALREADY_PAID", f"Booking is {booking.payment_status}.", 409)
    payments_svc.record_payment(
        session,
        SourceType.BOOKING,
        booking.id,
        int(booking.price_paise),
        PaymentMethod(method),
        member_id=booking.member_id,
        user_id=actor.id,
    )
    booking.payment_status = BookingPaymentStatus.PAID.value
    session.commit()
    session.refresh(booking)
    return booking


# ----------------------------------------------------------------------------- availability


def _grid(day: date) -> list[datetime]:
    """Bookable start times for one IST day, 06:00 to 21:00 inclusive."""
    first = datetime.combine(day, OPEN_TIME, tzinfo=CLUB_TZ)
    last = datetime.combine(day, LAST_START_TIME, tzinfo=CLUB_TZ)
    starts, current = [], first
    while current <= last:
        starts.append(current)
        current += timedelta(minutes=SLOT_MINUTES)
    return starts


def _occupancy(
    session: Session, court_ids: list[int], day: date
) -> dict[tuple[int, datetime], SlotState]:
    """One query for the whole grid: which slots are held, and by a booking or a session."""
    if not court_ids:
        return {}
    day_from, day_to = day_bounds_utc(day)
    rows = session.execute(
        select(CourtSlot.court_id, CourtSlot.slot_start, CourtSlot.social_session_id).where(
            CourtSlot.court_id.in_(court_ids),
            CourtSlot.slot_start >= day_from,
            CourtSlot.slot_start < day_to + timedelta(minutes=SLOT_MINUTES),
        )
    ).all()
    return {
        (court_id, slot_start): SlotState.SOCIAL if social_id else SlotState.BOOKED
        for court_id, slot_start, social_id in rows
    }


def _courts(session: Session, sport: Sport | str | None) -> list[Court]:
    filters = [Court.is_active.is_(True)]
    if sport is not None:
        filters.append(Court.sport == Sport(sport).value)
    return list(
        session.execute(select(Court).where(*filters).order_by(Court.id)).scalars().all()
    )


def availability(
    session: Session,
    day: date,
    sport: Sport | str | None = None,
    member_id: int | None = None,
) -> dict:
    """Full detail for logged-in users. Prices are for the requester's tier (SRS 3.2.4)."""
    courts = _courts(session, sport)
    held = _occupancy(session, [court.id for court in courts], day)
    tier = pricing.tier_for(session, member_id, day)
    now = utcnow()
    grid = _grid(day)

    out_courts = []
    for court in courts:
        price = pricing.court_price(session, court.sport, tier)
        slots = []
        for start in grid:
            start_utc = start.astimezone(timezone.utc)
            state = held.get((court.id, start_utc), SlotState.FREE)
            if state is SlotState.FREE and start_utc <= now:
                state = SlotState.PAST
            next_free = (
                court.id,
                start_utc + timedelta(minutes=SLOT_MINUTES),
            ) not in held
            bookable = state is SlotState.FREE and next_free
            slots.append(
                {
                    "start_at": start_utc,
                    "state": state.value,
                    "bookable_1h": bookable,
                    "price_paise": price if bookable else None,
                }
            )
        out_courts.append(
            {
                "court_id": court.id,
                "name": court.name,
                "sport": court.sport,
                "slots": slots,
            }
        )
    return {"date": day, "slot_minutes": SLOT_MINUTES, "courts": out_courts}


def public_availability(
    session: Session, start_day: date, days: int, sport: Sport | str | None = None
) -> dict:
    """FREE / BUSY only. No member names, no phones, no prices (SRS 3.2.4, S-13)."""
    if days < 1 or days > 7:
        raise AppError("INVALID_RANGE", "days must be between 1 and 7.", 422)
    courts = _courts(session, sport)
    court_ids = [court.id for court in courts]
    now = utcnow()

    out_days = []
    for offset in range(days):
        day = start_day + timedelta(days=offset)
        held = _occupancy(session, court_ids, day)
        day_courts = []
        for court in courts:
            slots = []
            for start in _grid(day):
                start_utc = start.astimezone(timezone.utc)
                busy = (court.id, start_utc) in held or start_utc <= now
                slots.append({"start_at": start_utc, "state": "BUSY" if busy else "FREE"})
            day_courts.append(
                {
                    "court_id": court.id,
                    "name": court.name,
                    "sport": court.sport,
                    "slots": slots,
                }
            )
        out_days.append({"date": day, "courts": day_courts})
    return {"slot_minutes": SLOT_MINUTES, "days": out_days}


# ----------------------------------------------------------------------------- courts CRUD


def list_courts(session: Session, sport: Sport | str | None = None, active_only: bool = True):
    filters = []
    if active_only:
        filters.append(Court.is_active.is_(True))
    if sport is not None:
        filters.append(Court.sport == Sport(sport).value)
    return list(
        session.execute(select(Court).where(*filters).order_by(Court.id)).scalars().all()
    )


def create_court(session: Session, actor: User, data: dict, ip: str | None = None) -> Court:
    clash = session.execute(
        select(Court.id).where(func.lower(Court.name) == data["name"].lower())
    ).scalar_one_or_none()
    if clash is not None:
        raise AppError("COURT_EXISTS", "A court with that name already exists.", 409)
    court = Court(name=data["name"], sport=Sport(data["sport"]).value)
    session.add(court)
    session.flush()
    audit.log(session, actor.id, "COURT_CREATED", "court", court.id, data, ip)
    session.commit()
    session.refresh(court)
    return court


def update_court(
    session: Session, actor: User, court_id: int, data: dict, ip: str | None = None
) -> Court:
    court = session.get(Court, court_id)
    if court is None:
        raise AppError("COURT_NOT_FOUND", "Court not found.", 404)

    if data.get("is_active") is False and court.is_active:
        future = (
            session.execute(
                select(Booking.id).where(
                    Booking.court_id == court.id,
                    Booking.status == BookingStatus.CONFIRMED.value,
                    Booking.start_at > utcnow(),
                )
            )
            .scalars()
            .all()
        )
        if future:
            raise AppError(
                "COURT_HAS_BOOKINGS",
                "Cancel the future bookings on this court first.",
                409,
                {"booking_ids": [int(i) for i in future]},
            )

    for field, value in data.items():
        if value is not None:
            setattr(court, field, Sport(value).value if field == "sport" else value)
    audit.log(session, actor.id, "COURT_UPDATED", "court", court.id, data, ip)
    session.commit()
    session.refresh(court)
    return court


def social_window(session: Session, court_id: int, start_at: datetime) -> SocialSession | None:
    """Used by the availability grid's SOCIAL state; social CRUD itself is Stage 8."""
    return session.execute(
        select(SocialSession).where(
            SocialSession.court_id == court_id,
            SocialSession.start_at <= start_at,
            SocialSession.end_at > start_at,
        )
    ).scalar_one_or_none()
