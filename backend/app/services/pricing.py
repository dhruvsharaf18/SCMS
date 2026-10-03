"""SRS 4.1 — the only place a price or a discount percentage is decided.

A booking is always one hour, so the court price is the hourly price verbatim. Prices are
snapshotted onto the booking row, so a later plan or price change never repriced history.
"""

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..enums import Sport, Tier
from ..models import CourtPrice, Plan
from ..security import AppError
from .membership import membership_for

DEFAULT_MAX_BOOKINGS_PER_DAY = 2
DEFAULT_ADVANCE_BOOKING_DAYS = 14


def tier_for(session: Session, member_id: int | None, at: date | None = None) -> Tier:
    """No member, or no active membership covering `at`, means walk-in pricing."""
    if member_id is None:
        return Tier.WALKIN
    membership = membership_for(session, member_id, at)
    if membership is None:
        return Tier.WALKIN
    plan = session.get(Plan, membership.plan_id)
    return Tier(plan.code) if plan else Tier.WALKIN


def active_plan(session: Session, member_id: int | None, at: date | None = None) -> Plan | None:
    if member_id is None:
        return None
    membership = membership_for(session, member_id, at)
    return session.get(Plan, membership.plan_id) if membership else None


def discount_pct(session: Session, member_id: int | None, kind: str) -> int:
    """kind is SHOP or BAR."""
    plan = active_plan(session, member_id)
    if plan is None:
        return 0
    return plan.shop_discount_pct if kind == "SHOP" else plan.bar_discount_pct


def court_price(session: Session, sport: Sport | str, tier: Tier | str) -> int:
    """Hourly price in paise. A missing row is a seeding error, not a client error."""
    price = session.execute(
        select(CourtPrice.price_per_hour_paise).where(
            CourtPrice.sport == Sport(sport).value, CourtPrice.tier == Tier(tier).value
        )
    ).scalar_one_or_none()
    if price is None:
        raise AppError("PRICE_NOT_CONFIGURED", "No price configured for this sport and tier.", 409)
    return int(price)


def booking_limits(session: Session, member_id: int | None) -> tuple[int, int]:
    """(max_bookings_per_day, advance_booking_days) for a member; defaults at walk-in tier."""
    plan = active_plan(session, member_id)
    if plan is None:
        return DEFAULT_MAX_BOOKINGS_PER_DAY, DEFAULT_ADVANCE_BOOKING_DAYS
    return int(plan.max_bookings_per_day), int(plan.advance_booking_days)
