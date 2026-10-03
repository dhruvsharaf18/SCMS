"""Plans, court prices, members and memberships (SRS 3.2.2, 3.2.3, 4.1, 4.9)."""

from datetime import date, timedelta

from sqlalchemy import Select, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..audit import log
from ..config import local_date
from ..enums import (
    MemberStatus,
    MembershipStatus,
    NotificationType,
    PaymentMethod,
    PlanCode,
    Role,
    SourceType,
    Tier,
)
from ..models import (
    BarOrder,
    Booking,
    CourtPrice,
    Member,
    Membership,
    Payment,
    Plan,
    ShopOrder,
    User,
)
from ..security import AppError, utcnow
from .notifications import notify
from .payments import record_payment

JUNIOR_MAX_AGE = 18
EXPIRING_WINDOW_DAYS = 7


# ------------------------------------------------------------------------------- plans


def list_plans(session: Session, active_only: bool = True) -> list[Plan]:
    stmt = select(Plan).order_by(Plan.fee_paise.desc())
    if active_only:
        stmt = stmt.where(Plan.is_active.is_(True))
    return list(session.execute(stmt).scalars())


def update_plan(
    session: Session, actor: User, plan_id: int, changes: dict, ip: str | None
) -> Plan:
    plan = session.get(Plan, plan_id)
    if plan is None:
        raise AppError("NOT_FOUND", "Plan not found.", 404)

    before = {field: getattr(plan, field) for field in changes}
    for field, value in changes.items():
        setattr(plan, field, value)
    after = {field: getattr(plan, field) for field in changes}

    log(
        session,
        actor_id=actor.id,
        action="PLAN_UPDATED",
        entity="plan",
        entity_id=plan.id,
        meta={"before": before, "after": after},
        ip=ip,
    )
    session.commit()
    session.refresh(plan)
    return plan


# ------------------------------------------------------------------------ court prices


def list_court_prices(session: Session) -> list[CourtPrice]:
    return list(
        session.execute(select(CourtPrice).order_by(CourtPrice.sport, CourtPrice.tier)).scalars()
    )


def upsert_court_prices(
    session: Session, actor: User, rows: list[dict], ip: str | None
) -> list[CourtPrice]:
    existing = {(p.sport, p.tier): p for p in list_court_prices(session)}
    before = {f"{k[0]}/{k[1]}": v.price_per_hour_paise for k, v in existing.items()}

    for row in rows:
        key = (row["sport"].value, row["tier"].value)
        if key in existing:
            existing[key].price_per_hour_paise = row["price_per_hour_paise"]
        else:
            session.add(
                CourtPrice(
                    sport=key[0],
                    tier=key[1],
                    price_per_hour_paise=row["price_per_hour_paise"],
                )
            )
    session.flush()
    after = {
        f"{p.sport}/{p.tier}": p.price_per_hour_paise for p in list_court_prices(session)
    }

    log(
        session,
        actor_id=actor.id,
        action="COURT_PRICES_UPDATED",
        entity="court_price",
        meta={"before": before, "after": after},
        ip=ip,
    )
    session.commit()
    return list_court_prices(session)


# ----------------------------------------------------------------------- member status


def membership_for(session: Session, member_id: int, on: date | None = None) -> Membership | None:
    """The ACTIVE membership covering `on` (SRS 4.1)."""
    on = on or local_date(utcnow())
    return session.execute(
        select(Membership)
        .where(
            Membership.member_id == member_id,
            Membership.status == MembershipStatus.ACTIVE.value,
            Membership.start_date <= on,
            Membership.end_date >= on,
        )
        .order_by(Membership.end_date.desc())
        .limit(1)
    ).scalar_one_or_none()


def latest_membership(session: Session, member_id: int) -> Membership | None:
    return session.execute(
        select(Membership)
        .where(
            Membership.member_id == member_id,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
        .order_by(Membership.end_date.desc())
        .limit(1)
    ).scalar_one_or_none()


def session_plan(session: Session, plan_id: int) -> Plan | None:
    return session.get(Plan, plan_id)


def member_status(end_date: date | None, today: date) -> MemberStatus:
    """SRS 3.2.3: ACTIVE >= today+8, EXPIRING today..today+7, EXPIRED < today."""
    if end_date is None:
        return MemberStatus.NONE
    if end_date < today:
        return MemberStatus.EXPIRED
    if end_date <= today + timedelta(days=EXPIRING_WINDOW_DAYS):
        return MemberStatus.EXPIRING
    return MemberStatus.ACTIVE


# `tier_for` and `discount_pct` live in services/pricing.py, which SRS 4.1 names as their owner.


# ----------------------------------------------------------------------------- members


def next_member_code(session: Session) -> str:
    """The UNIQUE index on member_code is the real race guard; the router retries once."""
    last = session.execute(
        select(Member.member_code).order_by(Member.id.desc()).limit(1)
    ).scalar_one_or_none()
    nxt = (int(last.split("-")[1]) + 1) if last else 1
    return f"CC-{nxt:06d}"


def _check_junior_age(plan: Plan, dob: date | None, today: date) -> None:
    if plan.code != PlanCode.JUNIOR.value:
        return
    if dob is None:
        raise AppError(
            "JUNIOR_AGE_INVALID", "Date of birth is required for the Junior plan.", 422
        )
    age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    if age >= JUNIOR_MAX_AGE:
        raise AppError("JUNIOR_AGE_INVALID", "Junior plan requires an age under 18.", 422)


def create_member(session: Session, actor: User, data: dict, ip: str | None) -> dict:
    today = local_date(utcnow())
    plan = session.get(Plan, data["plan_id"]) if data.get("plan_id") else None
    if data.get("plan_id") and plan is None:
        raise AppError("NOT_FOUND", "Plan not found.", 404)
    if plan is not None:
        _check_junior_age(plan, data.get("dob"), today)

    if session.execute(
        select(Member.id).where(Member.phone == data["phone"])
    ).scalar_one_or_none():
        raise AppError("PHONE_EXISTS", "A member with that phone already exists.", 409)

    member = Member(
        member_code=next_member_code(session),
        full_name=data["full_name"],
        phone=data["phone"],
        email=data.get("email"),
        dob=data.get("dob"),
        emergency_contact=data.get("emergency_contact"),
        notes=data.get("notes"),
        lead_id=data.get("lead_id"),
    )
    session.add(member)
    try:
        session.flush()
    except IntegrityError:
        session.rollback()
        raise AppError("PHONE_EXISTS", "A member with that phone already exists.", 409)

    membership = None
    payment = None
    if plan is not None:
        membership = Membership(
            member_id=member.id,
            plan_id=plan.id,
            start_date=today,
            end_date=today + timedelta(days=plan.duration_days),
            status=MembershipStatus.ACTIVE.value,
            created_by=actor.id,
        )
        session.add(membership)
        session.flush()
        if data.get("payment_method") and plan.fee_paise > 0:
            payment = record_payment(
                session,
                SourceType.MEMBERSHIP,
                membership.id,
                plan.fee_paise,
                PaymentMethod(data["payment_method"]),
                member_id=member.id,
                user_id=actor.id,
            )

    if data.get("lead_id"):
        from ..models import Lead

        lead = session.get(Lead, data["lead_id"])
        if lead is not None:
            lead.status = "WON"

    log(
        session,
        actor_id=actor.id,
        action="MEMBER_CREATED",
        entity="member",
        entity_id=member.id,
        meta={"member_code": member.member_code, "plan_id": plan.id if plan else None},
        ip=ip,
    )
    session.commit()
    session.refresh(member)
    if membership is not None:
        session.refresh(membership)
    return {
        "member": member,
        "membership": membership,
        "plan": plan,
        "payment_id": payment.id if payment else None,
    }


def renew_member(
    session: Session, actor: User, member_id: int, plan_id: int, payment_method, ip: str | None
) -> dict:
    member = session.get(Member, member_id)
    if member is None:
        raise AppError("NOT_FOUND", "Member not found.", 404)
    plan = session.get(Plan, plan_id)
    if plan is None:
        raise AppError("NOT_FOUND", "Plan not found.", 404)

    today = local_date(utcnow())
    _check_junior_age(plan, member.dob, today)

    current = latest_membership(session, member_id)
    start = max(today, current.end_date + timedelta(days=1)) if current else today
    membership = Membership(
        member_id=member.id,
        plan_id=plan.id,
        start_date=start,
        end_date=start + timedelta(days=plan.duration_days),
        status=MembershipStatus.ACTIVE.value,
        created_by=actor.id,
    )
    session.add(membership)
    session.flush()

    payment = None
    if payment_method and plan.fee_paise > 0:
        payment = record_payment(
            session,
            SourceType.MEMBERSHIP,
            membership.id,
            plan.fee_paise,
            PaymentMethod(payment_method),
            member_id=member.id,
            user_id=actor.id,
        )

    log(
        session,
        actor_id=actor.id,
        action="MEMBERSHIP_RENEWED",
        entity="member",
        entity_id=member.id,
        meta={"plan_id": plan.id, "membership_id": membership.id},
        ip=ip,
    )
    session.commit()
    session.refresh(membership)
    return {"member": member, "membership": membership, "plan": plan,
            "payment_id": payment.id if payment else None}


def update_member(
    session: Session, actor: User, member_id: int, changes: dict, ip: str | None
) -> Member:
    member = session.get(Member, member_id)
    if member is None:
        raise AppError("NOT_FOUND", "Member not found.", 404)

    if "phone" in changes and changes["phone"] != member.phone:
        clash = session.execute(
            select(Member.id).where(Member.phone == changes["phone"], Member.id != member_id)
        ).scalar_one_or_none()
        if clash:
            raise AppError("PHONE_EXISTS", "A member with that phone already exists.", 409)

    for field, value in changes.items():
        setattr(member, field, value)
    session.commit()
    session.refresh(member)
    return member


def get_member(session: Session, member_id: int) -> Member:
    member = session.get(Member, member_id)
    if member is None:
        raise AppError("NOT_FOUND", "Member not found.", 404)
    return member


def get_member_by_code(session: Session, code: str) -> Member:
    member = session.execute(
        select(Member).where(Member.member_code == code)
    ).scalar_one_or_none()
    if member is None:
        raise AppError("NOT_FOUND", "Member not found.", 404)
    return member


def search_members(
    session: Session, q: str | None, status: MemberStatus | None, page: int, page_size: int
) -> tuple[list[Member], int]:
    stmt: Select = select(Member)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(
                Member.full_name.ilike(like),
                Member.phone.ilike(like),
                Member.member_code.ilike(like),
            )
        )

    rows = list(session.execute(stmt.order_by(Member.id)).scalars())
    if status is not None:
        today = local_date(utcnow())
        rows = [
            m
            for m in rows
            if member_status(_end_date(session, m.id), today) == status
        ]

    total = len(rows)
    start = (page - 1) * page_size
    return rows[start : start + page_size], total


def _end_date(session: Session, member_id: int) -> date | None:
    membership = latest_membership(session, member_id)
    return membership.end_date if membership else None


def expiring_members(session: Session, days: int) -> list[tuple[Member, date]]:
    today = local_date(utcnow())
    horizon = today + timedelta(days=days)
    rows = session.execute(
        select(Member, func.max(Membership.end_date).label("end_date"))
        .join(Membership, Membership.member_id == Member.id)
        .where(Membership.status == MembershipStatus.ACTIVE.value)
        .group_by(Member.id)
        .having(func.max(Membership.end_date).between(today, horizon))
        .order_by(func.max(Membership.end_date))
    ).all()
    return [(row[0], row[1]) for row in rows]


def notify_expiring(session: Session, days: int = EXPIRING_WINDOW_DAYS) -> int:
    """SRS 4.9: generated lazily, idempotent per member per expiry date."""
    created = 0
    for member, end_date in expiring_members(session, days):
        made = notify(
            session,
            Role.FRONT_DESK,
            NotificationType.MEMBERSHIP_EXPIRING,
            f"{member.full_name} expires on {end_date.isoformat()}",
            body=f"Membership {member.member_code} ends {end_date.isoformat()}.",
            link=f"/staff/members/{member.id}",
            dedupe_key=f"EXPIRING:{member.id}:{end_date.isoformat()}",
        )
        if made is not None:
            created += 1
    session.commit()
    return created


# --------------------------------------------------------------------------- timeline


def member_history(
    session: Session, member_id: int, page: int, page_size: int
) -> tuple[list[dict], int]:
    """Combined timeline: bookings, shop orders, bar orders, payments (SRS 3.2.3)."""
    events: list[dict] = []

    for booking in session.execute(
        select(Booking).where(Booking.member_id == member_id)
    ).scalars():
        events.append(
            {
                "kind": "BOOKING",
                "id": booking.id,
                "at": booking.start_at,
                "amount_paise": booking.price_paise,
                "detail": booking.status,
            }
        )
    for order in session.execute(
        select(ShopOrder).where(ShopOrder.member_id == member_id)
    ).scalars():
        events.append(
            {
                "kind": "SHOP_ORDER",
                "id": order.id,
                "at": order.created_at,
                "amount_paise": order.total_paise,
                "detail": order.status,
            }
        )
    for order in session.execute(
        select(BarOrder).where(BarOrder.member_id == member_id)
    ).scalars():
        events.append(
            {
                "kind": "BAR_ORDER",
                "id": order.id,
                "at": order.created_at,
                "amount_paise": order.total_paise,
                "detail": order.kitchen_status,
            }
        )
    for payment in session.execute(
        select(Payment).where(Payment.member_id == member_id)
    ).scalars():
        events.append(
            {
                "kind": "PAYMENT",
                "id": payment.id,
                "at": payment.created_at,
                "amount_paise": payment.amount_paise,
                "detail": f"{payment.source_type}/{payment.method}/{payment.status}",
            }
        )

    events.sort(key=lambda e: e["at"], reverse=True)
    total = len(events)
    start = (page - 1) * page_size
    return events[start : start + page_size], total
