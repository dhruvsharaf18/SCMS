"""SRS 4.7 / 4.8 — the payments ledger view, refunds and the dashboard.

Every revenue number in the club comes from one place: `payments` rows with status COMPLETED.
Refunded rows stay in the table and are excluded here, so revenue and the audit trail never
disagree. Periods are decided in IST and then converted to UTC bounds for the query.
"""

import csv
import io
from datetime import date, datetime, time, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import audit
from ..config import CLUB_TZ, day_bounds_utc, local_date
from ..enums import (
    BarPaymentStatus,
    BookingStatus,
    ExpenseStatus,
    InvoiceStatus,
    KitchenStatus,
    LeadStatus,
    PaymentMethod,
    PaymentStatus,
    PayrollStatus,
    Role,
    SourceType,
)
from ..models import (
    BarOrder,
    Booking,
    Court,
    Expense,
    Invoice,
    Lead,
    Member,
    Membership,
    Payment,
    Payroll,
    Product,
    User,
)
from ..security import AppError, utcnow
from .booking import SLOT_MINUTES
from .membership import EXPIRING_WINDOW_DAYS

PERIODS = ("today", "week", "month")
# The bookable day is 06:00 .. 22:00 IST, so 32 half-hour slots per court per day.
SLOTS_PER_COURT_PER_DAY = 32


# ------------------------------------------------------------------------------ periods


def period_bounds(period: str, today: date | None = None) -> tuple[datetime, datetime]:
    """IST-anchored: week starts Monday 00:00, month starts the 1st 00:00."""
    if period not in PERIODS:
        raise AppError("VALIDATION_ERROR", f"period must be one of {', '.join(PERIODS)}.", 422)
    today = today or local_date(utcnow())

    if period == "today":
        start_day = today
    elif period == "week":
        start_day = today - timedelta(days=today.weekday())
    else:
        start_day = today.replace(day=1)

    start = datetime.combine(start_day, time.min, tzinfo=CLUB_TZ)
    end = datetime.combine(today + timedelta(days=1), time.min, tzinfo=CLUB_TZ)
    return start.astimezone(utcnow().tzinfo), end.astimezone(utcnow().tzinfo)


def period_days(period: str, today: date | None = None) -> list[date]:
    today = today or local_date(utcnow())
    start = local_date(period_bounds(period, today)[0])
    return [start + timedelta(days=offset) for offset in range((today - start).days + 1)]


# ----------------------------------------------------------------------------- payments


def list_payments(
    session: Session,
    from_: date | None = None,
    to: date | None = None,
    source_type: SourceType | str | None = None,
    method: PaymentMethod | str | None = None,
    include_refunded: bool = True,
    member_id: int | None = None,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[Payment], int]:
    filters = _payment_filters(from_, to, source_type, method, include_refunded, member_id)
    total = session.execute(select(func.count(Payment.id)).where(*filters)).scalar_one()
    rows = (
        session.execute(
            select(Payment)
            .where(*filters)
            .order_by(Payment.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .scalars()
        .all()
    )
    return list(rows), int(total)


def payment_totals(
    session: Session,
    from_: date | None = None,
    to: date | None = None,
    source_type: SourceType | str | None = None,
    method: PaymentMethod | str | None = None,
) -> dict:
    """Totals over the whole filtered range, so the ledger's figures never depend on paging."""
    filters = _payment_filters(from_, to, source_type, method, True, None)
    rows = session.execute(
        select(Payment.status, func.count(Payment.id), func.coalesce(func.sum(Payment.amount_paise), 0))
        .where(*filters)
        .group_by(Payment.status)
    ).all()
    by_status = {status: (int(count), int(amount)) for status, count, amount in rows}
    completed = by_status.get(PaymentStatus.COMPLETED.value, (0, 0))
    refunded = by_status.get(PaymentStatus.REFUNDED.value, (0, 0))
    return {
        "count": completed[0] + refunded[0],
        "collected_paise": completed[1],
        "refunded_count": refunded[0],
        "refunded_paise": refunded[1],
    }


def _payment_filters(
    from_: date | None,
    to: date | None,
    source_type: SourceType | str | None,
    method: PaymentMethod | str | None,
    include_refunded: bool,
    member_id: int | None,
) -> list:
    filters = []
    if from_ is not None:
        filters.append(Payment.created_at >= day_bounds_utc(from_)[0])
    if to is not None:
        filters.append(Payment.created_at < day_bounds_utc(to)[1])
    if source_type is not None:
        filters.append(Payment.source_type == SourceType(source_type).value)
    if method is not None:
        filters.append(Payment.method == PaymentMethod(method).value)
    if not include_refunded:
        filters.append(Payment.status == PaymentStatus.COMPLETED.value)
    if member_id is not None:
        filters.append(Payment.member_id == member_id)
    return filters


def refund(
    session: Session, actor: User, payment_id: int, reason: str | None, ip: str | None = None
) -> Payment:
    """Row-locked, audited, and idempotent only in the sense that a second attempt is a 409."""
    payment = session.execute(
        select(Payment).where(Payment.id == payment_id).with_for_update()
    ).scalar_one_or_none()
    if payment is None:
        raise AppError("NOT_FOUND", "Payment not found.", 404)

    from . import payments as payments_svc

    payments_svc.refund_payment(session, payment)
    _mark_source_refunded(session, payment)
    audit.log(
        session,
        actor.id,
        "PAYMENT_REFUNDED",
        "payment",
        payment.id,
        {
            "amount_paise": int(payment.amount_paise),
            "source_type": payment.source_type,
            "source_id": int(payment.source_id),
            "reason": reason,
        },
        ip,
    )
    session.commit()
    session.refresh(payment)
    return payment


def _mark_source_refunded(session: Session, payment: Payment) -> None:
    """Keep the owning document in step with the ledger."""
    source = SourceType(payment.source_type)
    if source is SourceType.BOOKING:
        booking = session.get(Booking, payment.source_id)
        if booking is not None:
            booking.payment_status = "REFUNDED"
    elif source is SourceType.SHOP_ORDER:
        from ..models import ShopOrder

        order = session.get(ShopOrder, payment.source_id)
        if order is not None:
            order.payment_status = "REFUNDED"
    # BAR_ORDER has no REFUNDED state in SRS 10, so its row is left alone (see DECISIONS).


# ---------------------------------------------------------------------------- dashboard


def _revenue(session: Session, start: datetime, end: datetime) -> dict:
    rows = session.execute(
        select(Payment.source_type, Payment.method, func.sum(Payment.amount_paise))
        .where(
            Payment.status == PaymentStatus.COMPLETED.value,
            Payment.created_at >= start,
            Payment.created_at < end,
        )
        .group_by(Payment.source_type, Payment.method)
    ).all()

    by_source = {source.value: 0 for source in SourceType}
    by_method = {method.value: 0 for method in PaymentMethod}
    total = 0
    for source_type, method, amount in rows:
        by_source[source_type] += int(amount)
        by_method[method] += int(amount)
        total += int(amount)
    return {"total_paise": total, "by_source": by_source, "by_method": by_method}


def _receivables(session: Session) -> dict:
    tabs = session.execute(
        select(func.coalesce(func.sum(BarOrder.total_paise), 0)).where(
            BarOrder.is_tab.is_(True),
            BarOrder.payment_status == BarPaymentStatus.UNPAID.value,
            BarOrder.kitchen_status != KitchenStatus.CANCELLED.value,
        )
    ).scalar_one()
    invoices = session.execute(
        select(func.coalesce(func.sum(Invoice.total_paise), 0)).where(
            Invoice.status == InvoiceStatus.SENT.value
        )
    ).scalar_one()
    return {"unpaid_tabs_paise": int(tabs), "unpaid_invoices_paise": int(invoices)}


def _payables(session: Session) -> dict:
    expenses = session.execute(
        select(func.coalesce(func.sum(Expense.amount_paise), 0)).where(
            Expense.status == ExpenseStatus.UNPAID.value
        )
    ).scalar_one()
    payroll = session.execute(
        select(func.coalesce(func.sum(Payroll.net_paise), 0)).where(
            Payroll.status == PayrollStatus.PENDING.value
        )
    ).scalar_one()
    return {"unpaid_expenses_paise": int(expenses), "pending_payroll_paise": int(payroll)}


def _bookings(session: Session, start: datetime, end: datetime, days: int) -> dict:
    count = session.execute(
        select(func.count(Booking.id)).where(
            Booking.status.in_((BookingStatus.CONFIRMED.value, BookingStatus.COMPLETED.value)),
            Booking.start_at >= start,
            Booking.start_at < end,
        )
    ).scalar_one()
    courts = session.execute(
        select(func.count(Court.id)).where(Court.is_active.is_(True))
    ).scalar_one()

    capacity = int(courts) * SLOTS_PER_COURT_PER_DAY * max(days, 1)
    booked_slots = int(count) * (60 // SLOT_MINUTES)
    pct = round(booked_slots * 100 / capacity, 1) if capacity else 0.0
    return {"count": int(count), "utilization_pct": pct}


def _members(session: Session, start: datetime, end: datetime, today: date) -> dict:
    new = session.execute(
        select(func.count(Member.id)).where(
            Member.created_at >= start, Member.created_at < end
        )
    ).scalar_one()
    expiring = session.execute(
        select(func.count(func.distinct(Membership.member_id))).where(
            Membership.status == "ACTIVE",
            Membership.end_date >= today,
            Membership.end_date <= today + timedelta(days=EXPIRING_WINDOW_DAYS),
        )
    ).scalar_one()
    return {"new": int(new), "expiring_7d": int(expiring)}


def summary(session: Session, period: str, today: date | None = None) -> dict:
    today = today or local_date(utcnow())
    start, end = period_bounds(period, today)
    days = len(period_days(period, today))

    leads = session.execute(
        select(func.count(Lead.id)).where(
            Lead.status == LeadStatus.NEW.value, Lead.created_at >= start, Lead.created_at < end
        )
    ).scalar_one()

    low_stock = session.execute(
        select(Product)
        .where(Product.is_active.is_(True), Product.stock_qty <= Product.reorder_level)
        .order_by(Product.stock_qty, Product.id)
    ).scalars()

    return {
        "period": period,
        "from": start,
        "to": end,
        "revenue": _revenue(session, start, end),
        "receivables": _receivables(session),
        "payables": _payables(session),
        "bookings": _bookings(session, start, end, days),
        "members": _members(session, start, end, today),
        "leads": {"new": int(leads)},
        "low_stock": [
            {
                "product_id": product.id,
                "name": product.name,
                "stock_qty": product.stock_qty,
                "reorder_level": product.reorder_level,
            }
            for product in low_stock
        ],
    }


def revenue_series(session: Session, period: str, today: date | None = None) -> dict:
    """One row per IST day in the period, totals split by source."""
    today = today or local_date(utcnow())
    days = period_days(period, today)
    start, end = period_bounds(period, today)

    rows = session.execute(
        select(Payment.created_at, Payment.source_type, Payment.amount_paise).where(
            Payment.status == PaymentStatus.COMPLETED.value,
            Payment.created_at >= start,
            Payment.created_at < end,
        )
    ).all()

    buckets = {
        day: {"date": day, "total_paise": 0, "by_source": {s.value: 0 for s in SourceType}}
        for day in days
    }
    for created_at, source_type, amount in rows:
        bucket = buckets.get(local_date(created_at))
        if bucket is None:
            continue
        bucket["total_paise"] += int(amount)
        bucket["by_source"][source_type] += int(amount)

    return {"period": period, "days": [buckets[day] for day in days]}


# --------------------------------------------------------------------------------- CSV


CSV_COLUMNS = (
    "id",
    "created_at",
    "source_type",
    "source_id",
    "member_id",
    "amount_paise",
    "tax_paise",
    "method",
    "status",
    "reference",
    "received_by",
)


def payments_csv(
    session: Session, actor: User, from_: date | None, to: date | None, ip: str | None = None
) -> str:
    """An export is a sensitive action, so it is audited before the bytes leave (SRS 7)."""
    rows, _ = list_payments(session, from_, to, page=1, page_size=100000)
    audit.log(
        session,
        actor.id,
        "PAYMENTS_EXPORTED",
        "payment",
        None,
        {"from": from_.isoformat() if from_ else None, "to": to.isoformat() if to else None,
         "rows": len(rows)},
        ip,
    )
    session.commit()

    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(CSV_COLUMNS)
    for payment in rows:
        writer.writerow(
            [
                payment.id,
                payment.created_at.isoformat().replace("+00:00", "Z"),
                payment.source_type,
                payment.source_id,
                payment.member_id or "",
                payment.amount_paise,
                payment.tax_paise,
                payment.method,
                payment.status,
                # Prefixed so a spreadsheet cannot execute a crafted reference (S-17).
                _csv_safe(payment.reference),
                payment.received_by or "",
            ]
        )
    return buffer.getvalue()


def _csv_safe(value: str | None) -> str:
    text = value or ""
    return f"'{text}" if text[:1] in ("=", "+", "-", "@") else text


def tax_summary(session: Session, month: str) -> dict:
    """P2: tax collected per source for one IST calendar month (YYYY-MM)."""
    try:
        year, month_number = (int(part) for part in month.split("-"))
        first = date(year, month_number, 1)
    except (ValueError, TypeError):
        raise AppError("VALIDATION_ERROR", "month must look like YYYY-MM.", 422) from None

    next_month = date(year + (month_number == 12), (month_number % 12) + 1, 1)
    start = day_bounds_utc(first)[0]
    end = day_bounds_utc(next_month)[0]

    rows = session.execute(
        select(
            Payment.source_type,
            func.sum(Payment.amount_paise),
            func.sum(Payment.tax_paise),
        )
        .where(
            Payment.status == PaymentStatus.COMPLETED.value,
            Payment.created_at >= start,
            Payment.created_at < end,
        )
        .group_by(Payment.source_type)
    ).all()

    by_source = {
        source_type: {"revenue_paise": int(revenue), "tax_paise": int(tax)}
        for source_type, revenue, tax in rows
    }
    return {
        "month": month,
        "revenue_paise": sum(entry["revenue_paise"] for entry in by_source.values()),
        "tax_paise": sum(entry["tax_paise"] for entry in by_source.values()),
        "by_source": by_source,
    }


def own_member_id(session: Session, user: User) -> int:
    if user.role != Role.MEMBER.value:
        raise AppError("FORBIDDEN", "This view is for members.", 403)
    member_id = session.execute(
        select(Member.id).where(Member.user_id == user.id)
    ).scalar_one_or_none()
    if member_id is None:
        raise AppError("MEMBER_NOT_FOUND", "This account is not linked to a member.", 404)
    return member_id
