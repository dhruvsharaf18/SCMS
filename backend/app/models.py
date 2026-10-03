"""SQLAlchemy models — one class per table in the SRS 10 DDL.

Money columns are BIGINT paise (SRS 1.4). Every table carries created_at.
"""

from datetime import date, datetime, time
from typing import Any

from sqlalchemy import (
    CHAR,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from . import enums
from .db import Base


def _created_at() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


def _check(column: str, enum_cls: type) -> CheckConstraint:
    return CheckConstraint(f"{column} IN ({enums.values(enum_cls)})", name=f"ck_{column}")


# ----------------------------------------------------------------------------- identity


class User(Base):
    __tablename__ = "users"
    __table_args__ = (_check("role", enums.Role),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    failed_attempts: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created_at()


class LoginSession(Base):
    """A signed-in browser. Only the SHA-256 of the cookie value is stored."""

    __tablename__ = "login_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    token_hash: Mapped[str] = mapped_column(CHAR(64), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created_at()


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    entity: Mapped[str | None] = mapped_column(String(30))
    entity_id: Mapped[int | None] = mapped_column(Integer)
    meta: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    ip: Mapped[str | None] = mapped_column(String(45))
    created_at: Mapped[datetime] = _created_at()


# --------------------------------------------------------------------------- membership


class Plan(Base):
    __tablename__ = "plans"
    __table_args__ = (
        _check("code", enums.PlanCode),
        CheckConstraint(
            "shop_discount_pct BETWEEN 0 AND 100", name="ck_plans_shop_discount_pct"
        ),
        CheckConstraint("bar_discount_pct BETWEEN 0 AND 100", name="ck_plans_bar_discount_pct"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(10), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    fee_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    duration_days: Mapped[int] = mapped_column(
        Integer, nullable=False, default=30, server_default=text("30")
    )
    shop_discount_pct: Mapped[int] = mapped_column(Integer, nullable=False)
    bar_discount_pct: Mapped[int] = mapped_column(Integer, nullable=False)
    max_bookings_per_day: Mapped[int] = mapped_column(
        Integer, nullable=False, default=2, server_default=text("2")
    )
    advance_booking_days: Mapped[int] = mapped_column(
        Integer, nullable=False, default=14, server_default=text("14")
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    created_at: Mapped[datetime] = _created_at()


class Member(Base):
    __tablename__ = "members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_code: Mapped[str] = mapped_column(String(12), nullable=False, unique=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), unique=True)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str] = mapped_column(String(15), nullable=False, unique=True)
    email: Mapped[str | None] = mapped_column(String(255))
    dob: Mapped[date | None] = mapped_column(Date)
    emergency_contact: Mapped[str | None] = mapped_column(String(60))
    notes: Mapped[str | None] = mapped_column(Text)
    lead_id: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = _created_at()


Index("ix_members_name", func.lower(Member.full_name))


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (
        _check("status", enums.MembershipStatus),
        CheckConstraint("end_date >= start_date", name="ck_memberships_dates"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), nullable=False)
    plan_id: Mapped[int] = mapped_column(ForeignKey("plans.id"), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(
        String(10), nullable=False, default="ACTIVE", server_default=text("'ACTIVE'")
    )
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = _created_at()


Index("ix_memberships_member", Membership.member_id, Membership.end_date.desc())


# ------------------------------------------------------------------- courts & bookings


class Court(Base):
    __tablename__ = "courts"
    __table_args__ = (_check("sport", enums.Sport),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    sport: Mapped[str] = mapped_column(String(20), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    created_at: Mapped[datetime] = _created_at()


class CourtPrice(Base):
    __tablename__ = "court_prices"
    __table_args__ = (
        UniqueConstraint("sport", "tier", name="uq_court_prices_sport_tier"),
        _check("tier", enums.Tier),
        CheckConstraint("price_per_hour_paise >= 0", name="ck_court_prices_price"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sport: Mapped[str] = mapped_column(String(20), nullable=False)
    tier: Mapped[str] = mapped_column(String(10), nullable=False)
    price_per_hour_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_at: Mapped[datetime] = _created_at()


class Booking(Base):
    __tablename__ = "bookings"
    __table_args__ = (
        _check("status", enums.BookingStatus),
        _check("payment_status", enums.BookingPaymentStatus),
        _check("source", enums.BookingSource),
        CheckConstraint("price_paise >= 0", name="ck_bookings_price"),
        CheckConstraint(
            "member_id IS NOT NULL OR guest_name IS NOT NULL", name="ck_bookings_who"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    court_id: Mapped[int] = mapped_column(ForeignKey("courts.id"), nullable=False)
    member_id: Mapped[int | None] = mapped_column(ForeignKey("members.id"))
    guest_name: Mapped[str | None] = mapped_column(String(120))
    guest_phone: Mapped[str | None] = mapped_column(String(15))
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(
        String(12), nullable=False, default="CONFIRMED", server_default=text("'CONFIRMED'")
    )
    tier_applied: Mapped[str] = mapped_column(String(10), nullable=False)
    price_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    payment_status: Mapped[str] = mapped_column(String(10), nullable=False)
    source: Mapped[str] = mapped_column(String(12), nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_reason: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = _created_at()


Index("ix_bookings_member_day", Booking.member_id, Booking.start_at)
Index("ix_bookings_start", Booking.start_at)


class SocialSession(Base):
    __tablename__ = "social_sessions"
    __table_args__ = (CheckConstraint("capacity > 0", name="ck_social_sessions_capacity"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    court_id: Mapped[int] = mapped_column(ForeignKey("courts.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    fee_paise: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default=text("0")
    )
    status: Mapped[str] = mapped_column(
        String(10), nullable=False, default="OPEN", server_default=text("'OPEN'")
    )
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = _created_at()


class SocialParticipant(Base):
    __tablename__ = "social_participants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("social_sessions.id"), nullable=False)
    member_id: Mapped[int | None] = mapped_column(ForeignKey("members.id"))
    guest_name: Mapped[str | None] = mapped_column(String(120))
    fee_paise: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default=text("0")
    )
    status: Mapped[str] = mapped_column(
        String(10), nullable=False, default="JOINED", server_default=text("'JOINED'")
    )
    created_at: Mapped[datetime] = _created_at()


Index(
    "ux_social_member",
    SocialParticipant.session_id,
    SocialParticipant.member_id,
    unique=True,
    postgresql_where=text("member_id IS NOT NULL AND status='JOINED'"),
)


class CourtSlot(Base):
    """*** the double-booking guard *** (SRS 4.2). Never replace with app-only checks."""

    __tablename__ = "court_slots"
    __table_args__ = (
        UniqueConstraint("court_id", "slot_start", name="uq_court_slots_court_start"),
        CheckConstraint(
            "(booking_id IS NOT NULL)::int + (social_session_id IS NOT NULL)::int = 1",
            name="ck_court_slots_one_owner",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    court_id: Mapped[int] = mapped_column(ForeignKey("courts.id"), nullable=False)
    slot_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    booking_id: Mapped[int | None] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE")
    )
    social_session_id: Mapped[int | None] = mapped_column(
        ForeignKey("social_sessions.id", ondelete="CASCADE")
    )
    created_at: Mapped[datetime] = _created_at()


# -------------------------------------------------------------------------------- shop


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        _check("category", enums.ProductCategory),
        CheckConstraint("price_paise >= 0", name="ck_products_price"),
        CheckConstraint("stock_qty >= 0", name="ck_products_stock"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sku: Mapped[str] = mapped_column(String(30), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[str] = mapped_column(String(12), nullable=False)
    variant: Mapped[str | None] = mapped_column(String(40))
    description: Mapped[str | None] = mapped_column(Text)
    price_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    stock_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    reorder_level: Mapped[int] = mapped_column(
        Integer, nullable=False, default=3, server_default=text("3")
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    created_at: Mapped[datetime] = _created_at()


class ShopOrder(Base):
    __tablename__ = "shop_orders"
    __table_args__ = (
        _check("channel", enums.ShopChannel),
        _check("fulfilment", enums.Fulfilment),
        _check("status", enums.ShopOrderStatus),
        _check("payment_status", enums.OrderPaymentStatus),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int | None] = mapped_column(ForeignKey("members.id"))
    guest_name: Mapped[str | None] = mapped_column(String(120))
    channel: Mapped[str] = mapped_column(String(8), nullable=False)
    fulfilment: Mapped[str] = mapped_column(String(10), nullable=False)
    delivery_address: Mapped[str | None] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(18), nullable=False)
    subtotal_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    discount_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    total_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    tax_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    payment_status: Mapped[str] = mapped_column(String(10), nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = _created_at()


class ShopOrderItem(Base):
    __tablename__ = "shop_order_items"
    __table_args__ = (CheckConstraint("qty > 0", name="ck_shop_order_items_qty"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("shop_orders.id"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    qty: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    line_total_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_at: Mapped[datetime] = _created_at()


class StockMovement(Base):
    __tablename__ = "stock_movements"
    __table_args__ = (_check("reason", enums.StockReason),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    delta: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(10), nullable=False)
    ref_type: Mapped[str | None] = mapped_column(String(20))
    ref_id: Mapped[int | None] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(String(200))
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = _created_at()


# --------------------------------------------------------------------------------- bar


class MenuItem(Base):
    __tablename__ = "menu_items"
    __table_args__ = (_check("category", enums.MenuCategory),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    category: Mapped[str] = mapped_column(String(10), nullable=False)
    price_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    is_available: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    created_at: Mapped[datetime] = _created_at()


class BarTable(Base):
    __tablename__ = "bar_tables"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    label: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    seats: Mapped[int] = mapped_column(
        Integer, nullable=False, default=4, server_default=text("4")
    )
    created_at: Mapped[datetime] = _created_at()


class TableReservation(Base):
    """A member's advance booking of a bar & dining table for a fixed-length sitting."""

    __tablename__ = "table_reservations"
    __table_args__ = (
        _check("status", enums.ReservationStatus),
        CheckConstraint("party_size > 0", name="ck_table_reservations_party"),
        CheckConstraint("end_at > start_at", name="ck_table_reservations_times"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), nullable=False)
    table_id: Mapped[int] = mapped_column(ForeignKey("bar_tables.id"), nullable=False)
    party_size: Mapped[int] = mapped_column(Integer, nullable=False)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(
        String(10), nullable=False, default="CONFIRMED", server_default=text("'CONFIRMED'")
    )
    note: Mapped[str | None] = mapped_column(String(200))
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created_at()


Index("ix_table_reservations_table_start", TableReservation.table_id, TableReservation.start_at)
Index("ix_table_reservations_member_start", TableReservation.member_id, TableReservation.start_at)


class BarOrder(Base):
    __tablename__ = "bar_orders"
    __table_args__ = (
        _check("kitchen_status", enums.KitchenStatus),
        _check("payment_status", enums.BarPaymentStatus),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    table_id: Mapped[int | None] = mapped_column(ForeignKey("bar_tables.id"))
    member_id: Mapped[int | None] = mapped_column(ForeignKey("members.id"))
    guest_name: Mapped[str | None] = mapped_column(String(120))
    kitchen_status: Mapped[str] = mapped_column(
        String(10), nullable=False, default="NEW", server_default=text("'NEW'")
    )
    payment_status: Mapped[str] = mapped_column(
        String(10), nullable=False, default="UNPAID", server_default=text("'UNPAID'")
    )
    is_tab: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    subtotal_paise: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default=text("0")
    )
    discount_paise: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default=text("0")
    )
    total_paise: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default=text("0")
    )
    tax_paise: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default=text("0")
    )
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created_at()


Index("ix_bar_orders_open", BarOrder.payment_status, BarOrder.kitchen_status)


class BarOrderItem(Base):
    __tablename__ = "bar_order_items"
    __table_args__ = (CheckConstraint("qty > 0", name="ck_bar_order_items_qty"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("bar_orders.id"), nullable=False)
    menu_item_id: Mapped[int] = mapped_column(ForeignKey("menu_items.id"), nullable=False)
    qty: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    line_total_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    note: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = _created_at()


# ------------------------------------------------------------------------------ ledger


class Payment(Base):
    """Single source of revenue truth. Written ONLY by services/payments.record_payment."""

    __tablename__ = "payments"
    __table_args__ = (
        _check("source_type", enums.SourceType),
        _check("method", enums.PaymentMethod),
        _check("status", enums.PaymentStatus),
        CheckConstraint("amount_paise > 0", name="ck_payments_amount"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_type: Mapped[str] = mapped_column(String(12), nullable=False)
    source_id: Mapped[int] = mapped_column(Integer, nullable=False)
    member_id: Mapped[int | None] = mapped_column(ForeignKey("members.id"))
    amount_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    tax_paise: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default=text("0")
    )
    method: Mapped[str] = mapped_column(String(12), nullable=False)
    status: Mapped[str] = mapped_column(
        String(10), nullable=False, default="COMPLETED", server_default=text("'COMPLETED'")
    )
    reference: Mapped[str | None] = mapped_column(String(60))
    received_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = _created_at()


Index("ix_payments_created", Payment.created_at)
Index("ix_payments_source", Payment.source_type, Payment.source_id)


# ------------------------------------------------------------------------------- leads


class Lead(Base):
    __tablename__ = "leads"
    __table_args__ = (_check("interest", enums.LeadInterest), _check("status", enums.LeadStatus))

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(15))
    interest: Mapped[str] = mapped_column(String(12), nullable=False)
    preferred_plan_id: Mapped[int | None] = mapped_column(ForeignKey("plans.id"))
    message: Mapped[str | None] = mapped_column(String(1000))
    status: Mapped[str] = mapped_column(
        String(10), nullable=False, default="NEW", server_default=text("'NEW'")
    )
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = _created_at()


class LeadNote(Base):
    __tablename__ = "lead_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id"), nullable=False)
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(String(1000), nullable=False)
    created_at: Mapped[datetime] = _created_at()


class Quote(Base):
    __tablename__ = "quotes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id"), nullable=False)
    amount_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))
    valid_until: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(
        String(10), nullable=False, default="SENT", server_default=text("'SENT'")
    )
    created_at: Mapped[datetime] = _created_at()


# -------------------------------------------------------------------- billing / finance


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_name: Mapped[str] = mapped_column(String(150), nullable=False)
    contact_name: Mapped[str | None] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(15))
    gstin: Mapped[str | None] = mapped_column(String(20))
    created_at: Mapped[datetime] = _created_at()


class Invoice(Base):
    __tablename__ = "invoices"
    __table_args__ = (_check("kind", enums.InvoiceKind), _check("status", enums.InvoiceStatus))

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    number: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    kind: Mapped[str] = mapped_column(String(10), nullable=False)
    member_id: Mapped[int | None] = mapped_column(ForeignKey("members.id"))
    client_id: Mapped[int | None] = mapped_column(ForeignKey("clients.id"))
    status: Mapped[str] = mapped_column(
        String(8), nullable=False, default="DRAFT", server_default=text("'DRAFT'")
    )
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    subtotal_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    tax_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    total_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    notes: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = _created_at()


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), nullable=False)
    description: Mapped[str] = mapped_column(String(200), nullable=False)
    qty: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    line_total_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_at: Mapped[datetime] = _created_at()


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = (
        _check("status", enums.ExpenseStatus),
        CheckConstraint("amount_paise > 0", name="ck_expenses_amount"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    vendor: Mapped[str | None] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(String(200))
    amount_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[str] = mapped_column(
        String(8), nullable=False, default="UNPAID", server_default=text("'UNPAID'")
    )
    due_date: Mapped[date | None] = mapped_column(Date)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = _created_at()


# ---------------------------------------------------------------------------------- hr


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    title: Mapped[str | None] = mapped_column(String(60))
    monthly_salary_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    created_at: Mapped[datetime] = _created_at()


class Shift(Base):
    __tablename__ = "shifts"
    __table_args__ = (_check("area", enums.ShiftArea),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), nullable=False)
    shift_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    area: Mapped[str] = mapped_column(String(12), nullable=False)
    created_at: Mapped[datetime] = _created_at()


class LeaveRequest(Base):
    __tablename__ = "leave_requests"
    __table_args__ = (_check("status", enums.LeaveStatus),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), nullable=False)
    from_date: Mapped[date] = mapped_column(Date, nullable=False)
    to_date: Mapped[date] = mapped_column(Date, nullable=False)
    reason: Mapped[str | None] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(
        String(10), nullable=False, default="PENDING", server_default=text("'PENDING'")
    )
    decided_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = _created_at()


class Payroll(Base):
    __tablename__ = "payroll"
    __table_args__ = (
        UniqueConstraint("month", "employee_id", name="uq_payroll_month_employee"),
        _check("status", enums.PayrollStatus),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    month: Mapped[str] = mapped_column(CHAR(7), nullable=False)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), nullable=False)
    base_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    deductions_paise: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default=text("0")
    )
    net_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[str] = mapped_column(
        String(8), nullable=False, default="PENDING", server_default=text("'PENDING'")
    )
    created_at: Mapped[datetime] = _created_at()


# ----------------------------------------------------------------------- cross-cutting


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    target_role: Mapped[str | None] = mapped_column(String(20))
    target_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    type: Mapped[str] = mapped_column(String(24), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    body: Mapped[str | None] = mapped_column(String(300))
    link: Mapped[str | None] = mapped_column(String(120))
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    dedupe_key: Mapped[str | None] = mapped_column(String(80), unique=True)
    created_at: Mapped[datetime] = _created_at()
