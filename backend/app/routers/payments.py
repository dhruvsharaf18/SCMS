from datetime import date

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_session
from ..enums import PaymentMethod, Role, SourceType
from ..models import AuditLog, User
from ..schemas import (
    AuditLogOut,
    Page,
    PageOut,
    PageSize,
    PaymentOut,
    PaymentTotals,
    RefundRequest,
    TaxSummary,
)
from ..security import client_ip, require_roles
from ..services import reports as svc

# Paths are written in full so they match SRS 3.2 exactly (see DECISIONS).
router = APIRouter(prefix="/api/v1", tags=["payments"])

_FINANCE = (Role.OWNER, Role.MANAGER)


@router.get("/payments", response_model=PageOut)
def list_payments(
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = None,
    source_type: SourceType | None = None,
    method: PaymentMethod | None = None,
    page: Page = 1,
    page_size: PageSize = 50,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_FINANCE)),
) -> PageOut:
    rows, total = svc.list_payments(
        session, from_, to, source_type, method, page=page, page_size=page_size
    )
    return PageOut(
        items=[PaymentOut.model_validate(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/payments/summary", response_model=PaymentTotals)
def payment_summary(
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = None,
    source_type: SourceType | None = None,
    method: PaymentMethod | None = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_FINANCE)),
) -> PaymentTotals:
    return PaymentTotals.model_validate(svc.payment_totals(session, from_, to, source_type, method))


@router.get("/payments/mine", response_model=PageOut)
def my_payments(
    page: Page = 1,
    page_size: PageSize = 50,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(Role.MEMBER)),
) -> PageOut:
    member_id = svc.own_member_id(session, user)
    rows, total = svc.list_payments(
        session, member_id=member_id, page=page, page_size=page_size
    )
    return PageOut(
        items=[PaymentOut.model_validate(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/payments/{payment_id}/refund", response_model=PaymentOut)
def refund(
    payment_id: int,
    payload: RefundRequest,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_FINANCE)),
) -> PaymentOut:
    payment = svc.refund(session, user, payment_id, payload.reason, client_ip(request))
    return PaymentOut.model_validate(payment)


@router.get("/reports/payments.csv")
def payments_csv(
    request: Request,
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_FINANCE)),
) -> Response:
    body = svc.payments_csv(session, user, from_, to, client_ip(request))
    return Response(
        content=body,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="payments.csv"'},
    )


@router.get("/reports/tax-summary", response_model=TaxSummary)
def tax_summary(
    month: str,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_FINANCE)),
) -> TaxSummary:
    return TaxSummary.model_validate(svc.tax_summary(session, month))


@router.get("/audit-logs", response_model=PageOut)
def list_audit_logs(
    action: str | None = None,
    entity: str | None = None,
    actor_id: int | None = None,
    page: Page = 1,
    page_size: PageSize = 50,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(Role.OWNER)),
) -> PageOut:
    """SRS 3.1 gives the audit trail to the OWNER alone, read-only. It is never written here."""
    filters = []
    if action is not None:
        filters.append(AuditLog.action == action)
    if entity is not None:
        filters.append(AuditLog.entity == entity)
    if actor_id is not None:
        filters.append(AuditLog.actor_id == actor_id)

    total = session.execute(select(func.count(AuditLog.id)).where(*filters)).scalar_one()
    rows = (
        session.execute(
            select(AuditLog)
            .where(*filters)
            .order_by(AuditLog.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .scalars()
        .all()
    )
    return PageOut(
        items=[AuditLogOut.model_validate(row) for row in rows],
        total=int(total),
        page=page,
        page_size=page_size,
    )
