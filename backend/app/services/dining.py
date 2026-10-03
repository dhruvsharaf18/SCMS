"""Bar & dining for members: the tier-priced menu and advance table reservations.

A reservation holds one table for a fixed sitting. The table is chosen here, never by guesswork
in the browser: the smallest free table that seats the party. Candidate tables are row-locked
in one fixed order before the overlap check, so two members racing for the last table get one
reservation and one NO_TABLE_AVAILABLE, the same way court slots are protected.
"""

from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import CLUB_TZ, day_bounds_utc, local_date
from ..enums import ReservationStatus, Role
from ..models import BarTable, Member, TableReservation, User
from ..security import AppError, utcnow
from . import bar as bar_svc
from . import payments as payments_svc
from . import pricing

SLOT_MINUTES = 30
SITTING_MINUTES = 120
OPEN_TIME = time(8, 0)
LAST_START_TIME = time(21, 0)
ADVANCE_DAYS = 14
MAX_RESERVATIONS_PER_DAY = 1

_ACTIVE = (ReservationStatus.CONFIRMED.value, ReservationStatus.SEATED.value)
_STAFF_OUTCOMES = (ReservationStatus.SEATED, ReservationStatus.NO_SHOW)


def _own_member_id(session: Session, user: User) -> int:
    member_id = session.execute(
        select(Member.id).where(Member.user_id == user.id)
    ).scalar_one_or_none()
    if member_id is None:
        raise AppError("MEMBER_NOT_FOUND", "This account is not linked to a member.", 404)
    return member_id


def _is_member(user: User) -> bool:
    return user.role == Role.MEMBER.value


# ----------------------------------------------------------------------------------- menu


def menu(session: Session, actor: User) -> dict:
    """Staff see walk-in prices; a member sees their own tier's bar discount applied."""
    member_id = _own_member_id(session, actor) if _is_member(actor) else None
    tier = pricing.tier_for(session, member_id, local_date(utcnow()))
    pct = pricing.discount_pct(session, member_id, "BAR")
    items = [
        {
            "id": item.id,
            "name": item.name,
            "category": item.category,
            "price_paise": int(item.price_paise),
            "member_price_paise": int(item.price_paise)
            - payments_svc.apply_discount(int(item.price_paise), pct),
        }
        for item in bar_svc.list_menu_items(session)
    ]
    return {"tier": tier, "discount_pct": pct, "items": items}


# ---------------------------------------------------------------------------- availability


def _grid(on: date) -> list[datetime]:
    start = datetime.combine(on, OPEN_TIME, tzinfo=CLUB_TZ)
    last = datetime.combine(on, LAST_START_TIME, tzinfo=CLUB_TZ)
    slots = []
    while start <= last:
        slots.append(start.astimezone(timezone.utc))
        start += timedelta(minutes=SLOT_MINUTES)
    return slots


def _max_party_size(session: Session) -> int:
    return int(session.execute(select(func.coalesce(func.max(BarTable.seats), 0))).scalar_one())


def _validate_start(start_at: datetime, now: datetime | None = None) -> datetime:
    now = now or utcnow()
    if start_at.tzinfo is None:
        raise AppError("INVALID_SLOT", "start_at must include a timezone.", 422)
    start_at = start_at.astimezone(timezone.utc)
    if start_at.second or start_at.microsecond or start_at.minute not in (0, 30):
        raise AppError("INVALID_SLOT", "Reservations start on the hour or half hour.", 422)
    if start_at <= now:
        raise AppError("INVALID_SLOT", "That time is in the past.", 422)
    local_start = start_at.astimezone(CLUB_TZ).time()
    if local_start < OPEN_TIME or local_start > LAST_START_TIME:
        raise AppError("INVALID_SLOT", "Tables can be reserved from 08:00 to 21:00.", 422)
    if local_date(start_at) > local_date(now) + timedelta(days=ADVANCE_DAYS):
        raise AppError("INVALID_SLOT", f"Tables open {ADVANCE_DAYS} days ahead.", 422)
    return start_at


def _busy_table_ids(
    session: Session, table_ids: list[int], start_at: datetime, end_at: datetime
) -> set[int]:
    if not table_ids:
        return set()
    return set(
        session.execute(
            select(TableReservation.table_id).where(
                TableReservation.table_id.in_(table_ids),
                TableReservation.status.in_(_ACTIVE),
                TableReservation.start_at < end_at,
                TableReservation.end_at > start_at,
            )
        ).scalars()
    )


def availability(session: Session, on: date, party_size: int) -> dict:
    now = utcnow()
    tables = session.execute(
        select(BarTable.id).where(BarTable.seats >= party_size)
    ).scalars().all()
    day_from, day_to = day_bounds_utc(on)
    taken = session.execute(
        select(TableReservation.table_id, TableReservation.start_at, TableReservation.end_at)
        .where(
            TableReservation.table_id.in_(tables or [0]),
            TableReservation.status.in_(_ACTIVE),
            TableReservation.start_at < day_to + timedelta(minutes=SITTING_MINUTES),
            TableReservation.end_at > day_from,
        )
    ).all()
    horizon = local_date(now) + timedelta(days=ADVANCE_DAYS)

    slots = []
    for start in _grid(on):
        end = start + timedelta(minutes=SITTING_MINUTES)
        bookable = start > now and on <= horizon
        busy = {row.table_id for row in taken if row.start_at < end and row.end_at > start}
        slots.append({"start_at": start, "available": bookable and any(t not in busy for t in tables)})
    return {
        "date": on,
        "party_size": party_size,
        "max_party_size": _max_party_size(session),
        "sitting_minutes": SITTING_MINUTES,
        "slots": slots,
    }


# ----------------------------------------------------------------------------- reservations


def _assert_daily_limit(session: Session, member_id: int, start_at: datetime) -> None:
    """Locks the member row first so two requests from one member cannot both pass."""
    session.execute(select(Member.id).where(Member.id == member_id).with_for_update()).scalar_one()
    day_from, day_to = day_bounds_utc(local_date(start_at))
    used = session.execute(
        select(func.count(TableReservation.id)).where(
            TableReservation.member_id == member_id,
            TableReservation.status.in_(_ACTIVE),
            TableReservation.start_at >= day_from,
            TableReservation.start_at < day_to,
        )
    ).scalar_one()
    if used >= MAX_RESERVATIONS_PER_DAY:
        raise AppError(
            "DAILY_LIMIT_REACHED", "You already have a table reserved on that day.", 409
        )


def create_reservation(session: Session, actor: User, data: dict) -> TableReservation:
    if _is_member(actor):
        member_id = _own_member_id(session, actor)
    else:
        member_id = data.get("member_id")
        if member_id is None:
            raise AppError("MEMBER_REQUIRED", "Choose the member the table is for.", 422)
        if session.get(Member, member_id) is None:
            raise AppError("MEMBER_NOT_FOUND", "Member not found.", 404)

    start_at = _validate_start(data["start_at"])
    end_at = start_at + timedelta(minutes=SITTING_MINUTES)
    party_size = data["party_size"]

    _assert_daily_limit(session, member_id, start_at)

    # One lock order everywhere (seats, id) so concurrent requests cannot deadlock.
    candidates = select(BarTable).where(BarTable.seats >= party_size)
    if data.get("table_id") is not None:
        table = session.get(BarTable, data["table_id"])
        if table is None:
            raise AppError("NOT_FOUND", "Table not found.", 404)
        if table.seats < party_size:
            raise AppError("TABLE_TOO_SMALL", f"{table.label} seats {table.seats}.", 422)
        candidates = candidates.where(BarTable.id == table.id)
    tables = session.execute(
        candidates.order_by(BarTable.seats, BarTable.id).with_for_update()
    ).scalars().all()

    busy = _busy_table_ids(session, [t.id for t in tables], start_at, end_at)
    free = [t for t in tables if t.id not in busy]
    if not free:
        session.rollback()
        raise AppError(
            "NO_TABLE_AVAILABLE",
            f"No table for {party_size} is free at that time. Try another time.",
            409,
            {"max_party_size": _max_party_size(session)},
        )

    reservation = TableReservation(
        member_id=member_id,
        table_id=free[0].id,
        party_size=party_size,
        start_at=start_at,
        end_at=end_at,
        status=ReservationStatus.CONFIRMED.value,
        note=data.get("note"),
        created_by=actor.id,
    )
    session.add(reservation)
    session.commit()
    session.refresh(reservation)
    return reservation


def get_reservation(session: Session, reservation_id: int, actor: User) -> TableReservation:
    row = session.get(TableReservation, reservation_id)
    if row is None or (_is_member(actor) and row.member_id != _own_member_id(session, actor)):
        raise AppError("NOT_FOUND", "Reservation not found.", 404)
    return row


def list_reservations(
    session: Session,
    actor: User,
    on: date | None = None,
    status: ReservationStatus | None = None,
    upcoming: bool = False,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[TableReservation], int]:
    filters = []
    if _is_member(actor):
        filters.append(TableReservation.member_id == _own_member_id(session, actor))
    if on is not None:
        day_from, day_to = day_bounds_utc(on)
        filters += [TableReservation.start_at >= day_from, TableReservation.start_at < day_to]
    if status is not None:
        filters.append(TableReservation.status == ReservationStatus(status).value)
    if upcoming:
        filters.append(TableReservation.end_at > utcnow())

    total = session.execute(
        select(func.count(TableReservation.id)).where(*filters)
    ).scalar_one()
    rows = session.execute(
        select(TableReservation)
        .where(*filters)
        .order_by(TableReservation.start_at, TableReservation.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).scalars().all()
    return list(rows), int(total)


def cancel_reservation(session: Session, actor: User, reservation_id: int) -> TableReservation:
    row = get_reservation(session, reservation_id, actor)
    if row.status != ReservationStatus.CONFIRMED.value:
        raise AppError("INVALID_TRANSITION", f"This reservation is {row.status}.", 409)
    if _is_member(actor) and row.start_at <= utcnow():
        raise AppError("TOO_LATE_TO_CANCEL", "This sitting has already started.", 409)
    row.status = ReservationStatus.CANCELLED.value
    row.cancelled_at = utcnow()
    session.commit()
    session.refresh(row)
    return row


def set_status(
    session: Session, actor: User, reservation_id: int, status: ReservationStatus
) -> TableReservation:
    row = get_reservation(session, reservation_id, actor)
    status = ReservationStatus(status)
    if status not in _STAFF_OUTCOMES:
        raise AppError("INVALID_TRANSITION", "Staff may only set SEATED or NO_SHOW.", 422)
    if row.status != ReservationStatus.CONFIRMED.value:
        raise AppError("INVALID_TRANSITION", f"This reservation is {row.status}.", 409)
    row.status = status.value
    session.commit()
    session.refresh(row)
    return row


def serialize(session: Session, actor: User, rows: list[TableReservation]) -> list[dict]:
    """Staff also get the member's name and code; a member only ever sees their own rows."""
    table_labels = dict(
        session.execute(
            select(BarTable.id, BarTable.label).where(
                BarTable.id.in_({row.table_id for row in rows} or {0})
            )
        ).all()
    )
    members: dict[int, tuple[str, str]] = {}
    if not _is_member(actor):
        members = {
            m.id: (m.full_name, m.member_code)
            for m in session.execute(
                select(Member.id, Member.full_name, Member.member_code).where(
                    Member.id.in_({row.member_id for row in rows} or {0})
                )
            ).all()
        }
    out = []
    for row in rows:
        name, code = members.get(row.member_id, (None, None))
        out.append(
            {
                "id": row.id,
                "member_id": row.member_id,
                "member_name": name,
                "member_code": code,
                "table_id": row.table_id,
                "table_label": table_labels.get(row.table_id, ""),
                "party_size": row.party_size,
                "start_at": row.start_at,
                "end_at": row.end_at,
                "status": row.status,
                "note": row.note,
                "created_at": row.created_at,
            }
        )
    return out
