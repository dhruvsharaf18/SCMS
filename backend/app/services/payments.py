"""The ONLY writer to the payments table (SRS 4.7).

Also holds the two integer money formulas from SRS 1.4 / 4.6 so every module rounds
identically. Money is integer paise everywhere; never float.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..security import AppError
from ..enums import PaymentMethod, PaymentStatus, SourceType
from ..models import Payment

# Tax-inclusive rates per revenue source (SRS 4.6).
_TAX_BY_SOURCE = {
    SourceType.BOOKING: "tax_court",
    SourceType.SOCIAL: "tax_court",
    SourceType.SHOP_ORDER: "tax_shop",
    SourceType.BAR_ORDER: "tax_bar",
    SourceType.MEMBERSHIP: "tax_membership",
    SourceType.INVOICE: "tax_membership",
}


def apply_discount(subtotal_paise: int, pct: int) -> int:
    """SRS 1.4: discount = (subtotal * pct + 50) // 100."""
    if pct <= 0 or subtotal_paise <= 0:
        return 0
    return (subtotal_paise * pct + 50) // 100


def tax_inclusive(total_paise: int, rate_pct: int) -> int:
    """SRS 1.4: tax = (total * rate + (100 + rate) // 2) // (100 + rate)."""
    if rate_pct <= 0 or total_paise <= 0:
        return 0
    return (total_paise * rate_pct + (100 + rate_pct) // 2) // (100 + rate_pct)


def tax_rate_for(source_type: SourceType) -> int:
    return int(getattr(settings, _TAX_BY_SOURCE[SourceType(source_type)]))


def record_payment(
    session: Session,
    source_type: SourceType,
    source_id: int,
    amount_paise: int,
    method: PaymentMethod,
    member_id: int | None = None,
    user_id: int | None = None,
    reference: str | None = None,
) -> Payment:
    """Insert the single ledger row for a completed payment. Caller commits."""
    source_type = SourceType(source_type)
    payment = Payment(
        source_type=source_type.value,
        source_id=source_id,
        member_id=member_id,
        amount_paise=amount_paise,
        tax_paise=tax_inclusive(amount_paise, tax_rate_for(source_type)),
        method=PaymentMethod(method).value,
        status=PaymentStatus.COMPLETED.value,
        reference=reference,
        received_by=user_id,
    )
    session.add(payment)
    session.flush()
    return payment


def payment_for(session: Session, source_type: SourceType, source_id: int) -> Payment | None:
    """The completed ledger row behind a booking / order, if one was taken."""
    return session.execute(
        select(Payment).where(
            Payment.source_type == SourceType(source_type).value,
            Payment.source_id == source_id,
            Payment.status == PaymentStatus.COMPLETED.value,
        )
    ).scalar_one_or_none()


def refund_payment(session: Session, payment: Payment) -> Payment:
    """Flip a row to REFUNDED. Financial rows are never deleted (SRS 4.7); reports skip these."""
    if payment.status == PaymentStatus.REFUNDED.value:
        raise AppError("ALREADY_REFUNDED", "This payment is already refunded.", 409)
    payment.status = PaymentStatus.REFUNDED.value
    session.flush()
    return payment
