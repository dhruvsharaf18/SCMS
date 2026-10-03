"""Stage 1: schema, constraints, seed idempotency and the SRS 1.4 money formulas."""

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import Base, SessionLocal
from app.enums import BookingPaymentStatus, BookingSource, BookingStatus, Sport, Tier
from app.models import Booking, Court, CourtPrice, CourtSlot, MenuItem, Member, Plan, Product
from app.services.payments import apply_discount, tax_inclusive

from .conftest import (
    TEST_COURT_PREFIX,
    TEST_MENU_PREFIX,
    TEST_PHONE_PREFIX,
    TEST_SKU_PREFIX,
)

EXPECTED_TABLE_COUNT = 33


def test_every_srs_table_exists(session: Session) -> None:
    present = set(
        session.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema='public' AND table_type='BASE TABLE'"
            )
        ).scalars()
    )
    declared = set(Base.metadata.tables)
    assert declared <= present, f"missing in DB: {sorted(declared - present)}"
    assert len(declared) == EXPECTED_TABLE_COUNT, sorted(declared)


def test_every_table_has_created_at() -> None:
    missing = [name for name, table in Base.metadata.tables.items() if "created_at" not in table.c]
    assert missing == []


def test_duplicate_court_slot_raises_integrity_error(session: Session) -> None:
    court = session.execute(select(Court).limit(1)).scalar_one()
    start = text("now() + interval '400 days'")
    slot_start = session.execute(select(start)).scalar_one()

    booking = Booking(
        court_id=court.id,
        guest_name="Slot Guard",
        guest_phone="9000000000",
        start_at=slot_start,
        end_at=slot_start,
        status=BookingStatus.CONFIRMED.value,
        tier_applied=Tier.WALKIN.value,
        price_paise=0,
        payment_status=BookingPaymentStatus.WAIVED.value,
        source=BookingSource.FRONT_DESK.value,
    )
    session.add(booking)
    session.flush()
    session.add(CourtSlot(court_id=court.id, slot_start=slot_start, booking_id=booking.id))
    session.flush()

    session.add(CourtSlot(court_id=court.id, slot_start=slot_start, booking_id=booking.id))
    with pytest.raises(IntegrityError):
        session.flush()
    session.rollback()


def test_court_slot_requires_exactly_one_owner(session: Session) -> None:
    court = session.execute(select(Court).limit(1)).scalar_one()
    slot_start = session.execute(select(text("now() + interval '500 days'"))).scalar_one()
    session.add(CourtSlot(court_id=court.id, slot_start=slot_start))
    with pytest.raises(IntegrityError):
        session.flush()
    session.rollback()


def test_seed_is_idempotent() -> None:
    from seed import run_seed

    def counts(db: Session) -> dict[str, int]:
        return {
            model.__name__: db.execute(select(func.count()).select_from(model)).scalar_one()
            for model in (Plan, Court, CourtPrice, Product, MenuItem, Member)
        }

    with SessionLocal() as db:
        before = counts(db)
        run_seed(db)
        after = counts(db)
    assert before == after


def test_seed_shapes() -> None:
    with SessionLocal() as db:
        assert db.execute(select(func.count()).select_from(Plan)).scalar_one() == 3
        # Other test modules add their own courts and members, so count the seeded ones.
        assert db.execute(
            select(func.count())
            .select_from(Court)
            .where(Court.name.not_like(f"{TEST_COURT_PREFIX}%"))
        ).scalar_one() == 6
        assert db.execute(select(func.count()).select_from(CourtPrice)).scalar_one() == 16
        assert db.execute(
            select(func.count())
            .select_from(Product)
            .where(Product.sku.not_like(f"{TEST_SKU_PREFIX}%"))
        ).scalar_one() == 14
        assert db.execute(
            select(func.count())
            .select_from(MenuItem)
            .where(MenuItem.name.not_like(f"{TEST_MENU_PREFIX}%"))
        ).scalar_one() == 15
        assert db.execute(
            select(func.count())
            .select_from(Member)
            .where(Member.phone.not_like(f"{TEST_PHONE_PREFIX}%"))
        ).scalar_one() == 30

        below = db.execute(
            select(func.count())
            .select_from(Product)
            .where(
                Product.stock_qty <= Product.reorder_level,
                Product.sku.not_like(f"{TEST_SKU_PREFIX}%"),
            )
        ).scalar_one()
        # SRS 10.1 asks for three low-stock products; the seeded sales history draws a few more
        # down, so the demo guarantee is "at least three", never fewer.
        assert below >= 3

        tennis_walkin = db.execute(
            select(CourtPrice.price_per_hour_paise).where(
                CourtPrice.sport == Sport.TENNIS.value, CourtPrice.tier == Tier.WALKIN.value
            )
        ).scalar_one()
        assert tennis_walkin == 60000


@pytest.mark.parametrize(
    ("subtotal", "pct", "expected"),
    [
        (0, 15, 0),
        (650000, 5, 32500),
        (100, 5, 5),
        (10, 5, 1),  # 0.5 paise rounds up (SRS 8 Shop)
        (999, 10, 100),
        (450000, 15, 67500),
    ],
)
def test_discount_rounding(subtotal: int, pct: int, expected: int) -> None:
    assert apply_discount(subtotal, pct) == expected


@pytest.mark.parametrize(
    ("total", "rate", "expected"),
    [
        (0, 18, 0),
        (617500, 18, 94195),  # SRS 3.2.7 worked example
        (118, 18, 18),
        (105, 5, 5),
        (40000, 18, 6102),
    ],
)
def test_tax_inclusive_rounding(total: int, rate: int, expected: int) -> None:
    assert tax_inclusive(total, rate) == expected
