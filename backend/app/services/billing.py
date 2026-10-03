"""SRS 3.2.11 — clients, invoices and expenses (P1).

Invoices never move money by themselves: `mark-paid` is the only path, and it goes through
`payments.record_payment` like every other revenue source. Expenses are the mirror image and
feed the dashboard's payables.
"""

import html
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import audit
from ..config import local_date
from ..enums import (
    ExpenseStatus,
    InvoiceKind,
    InvoiceStatus,
    PaymentMethod,
    SourceType,
)
from ..models import Client, Expense, Invoice, InvoiceLine, Member, User
from ..security import AppError, utcnow
from . import payments as payments_svc

INVOICE_DUE_DAYS = 15


# ----------------------------------------------------------------------------- clients


def list_clients(session: Session) -> list[Client]:
    return list(session.execute(select(Client).order_by(Client.id)).scalars().all())


def get_client(session: Session, client_id: int) -> Client:
    client = session.get(Client, client_id)
    if client is None:
        raise AppError("NOT_FOUND", "Client not found.", 404)
    return client


def create_client(session: Session, actor: User, data: dict, ip: str | None = None) -> Client:
    client = Client(**data)
    session.add(client)
    session.flush()
    audit.log(session, actor.id, "CLIENT_CREATED", "client", client.id, data, ip)
    session.commit()
    session.refresh(client)
    return client


def update_client(
    session: Session, actor: User, client_id: int, data: dict, ip: str | None = None
) -> Client:
    client = get_client(session, client_id)
    for field, value in data.items():
        setattr(client, field, value)
    audit.log(session, actor.id, "CLIENT_UPDATED", "client", client.id, data, ip)
    session.commit()
    session.refresh(client)
    return client


# ---------------------------------------------------------------------------- invoices


def next_invoice_number(session: Session, year: int) -> str:
    """INV-YYYY-NNNN, restarting each calendar year. UNIQUE(number) is the real guard."""
    prefix = f"INV-{year}-"
    last = session.execute(
        select(func.max(Invoice.number)).where(Invoice.number.like(f"{prefix}%"))
    ).scalar_one_or_none()
    sequence = int(last.rsplit("-", 1)[1]) + 1 if last else 1
    return f"{prefix}{sequence:04d}"


def create_invoice(session: Session, actor: User, data: dict, ip: str | None = None) -> Invoice:
    kind = InvoiceKind(data["kind"])
    member_id, client_id = data.get("member_id"), data.get("client_id")
    if (member_id is None) == (client_id is None):
        raise AppError("VALIDATION_ERROR", "An invoice bills either a member or a client.", 422)
    if member_id is not None and session.get(Member, member_id) is None:
        raise AppError("MEMBER_NOT_FOUND", "Member not found.", 404)
    if client_id is not None:
        get_client(session, client_id)

    lines = data.get("lines") or []
    if not lines:
        raise AppError("VALIDATION_ERROR", "An invoice needs at least one line.", 422)

    subtotal = sum(line["qty"] * line["unit_price_paise"] for line in lines)
    tax = payments_svc.tax_inclusive(subtotal, payments_svc.tax_rate_for(SourceType.INVOICE))
    issue_date = data.get("issue_date") or local_date(utcnow())

    invoice = Invoice(
        number=next_invoice_number(session, issue_date.year),
        kind=kind.value,
        member_id=member_id,
        client_id=client_id,
        status=InvoiceStatus.DRAFT.value,
        issue_date=issue_date,
        due_date=data.get("due_date") or issue_date + timedelta(days=INVOICE_DUE_DAYS),
        subtotal_paise=subtotal,
        tax_paise=tax,
        total_paise=subtotal,  # tax is inclusive (SRS 4.6), so the total is the subtotal
        notes=data.get("notes"),
    )
    session.add(invoice)
    session.flush()

    session.add_all(
        InvoiceLine(
            invoice_id=invoice.id,
            description=line["description"],
            qty=line["qty"],
            unit_price_paise=line["unit_price_paise"],
            line_total_paise=line["qty"] * line["unit_price_paise"],
        )
        for line in lines
    )
    audit.log(session, actor.id, "INVOICE_CREATED", "invoice", invoice.id, {"number": invoice.number}, ip)
    session.commit()
    session.refresh(invoice)
    return invoice


def get_invoice(session: Session, invoice_id: int) -> Invoice:
    invoice = session.get(Invoice, invoice_id)
    if invoice is None:
        raise AppError("NOT_FOUND", "Invoice not found.", 404)
    return invoice


def invoice_lines(session: Session, invoice_id: int) -> list[InvoiceLine]:
    return list(
        session.execute(
            select(InvoiceLine).where(InvoiceLine.invoice_id == invoice_id).order_by(InvoiceLine.id)
        )
        .scalars()
        .all()
    )


def list_invoices(
    session: Session,
    status: InvoiceStatus | str | None = None,
    member_id: int | None = None,
    client_id: int | None = None,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[Invoice], int]:
    filters = []
    if status is not None:
        filters.append(Invoice.status == InvoiceStatus(status).value)
    if member_id is not None:
        filters.append(Invoice.member_id == member_id)
    if client_id is not None:
        filters.append(Invoice.client_id == client_id)

    total = session.execute(select(func.count(Invoice.id)).where(*filters)).scalar_one()
    rows = (
        session.execute(
            select(Invoice)
            .where(*filters)
            .order_by(Invoice.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .scalars()
        .all()
    )
    return list(rows), int(total)


def set_invoice_status(
    session: Session, actor: User, invoice_id: int, status: InvoiceStatus, ip: str | None = None
) -> Invoice:
    invoice = get_invoice(session, invoice_id)
    status = InvoiceStatus(status)
    current = InvoiceStatus(invoice.status)

    if status is InvoiceStatus.PAID:
        raise AppError("VALIDATION_ERROR", "Use mark-paid so a payment row is written.", 422)
    if current is InvoiceStatus.PAID:
        raise AppError("INVALID_TRANSITION", "A paid invoice cannot change status.", 409)
    if current is InvoiceStatus.VOID:
        raise AppError("INVALID_TRANSITION", "A void invoice cannot change status.", 409)

    invoice.status = status.value
    audit.log(session, actor.id, "INVOICE_STATUS_CHANGED", "invoice", invoice.id,
              {"status": status.value}, ip)
    session.commit()
    session.refresh(invoice)
    return invoice


def mark_invoice_paid(
    session: Session, actor: User, invoice_id: int, method: PaymentMethod, ip: str | None = None
) -> Invoice:
    """Row-locked so two clerks produce exactly one payment row."""
    get_invoice(session, invoice_id)
    invoice = session.execute(
        select(Invoice).where(Invoice.id == invoice_id).with_for_update()
    ).scalar_one()

    if invoice.status == InvoiceStatus.PAID.value:
        raise AppError("ALREADY_PAID", "This invoice is already paid.", 409)
    if invoice.status == InvoiceStatus.VOID.value:
        raise AppError("INVALID_TRANSITION", "A void invoice cannot be paid.", 409)

    payments_svc.record_payment(
        session,
        SourceType.INVOICE,
        invoice.id,
        int(invoice.total_paise),
        PaymentMethod(method),
        member_id=invoice.member_id,
        user_id=actor.id,
    )
    invoice.status = InvoiceStatus.PAID.value
    audit.log(session, actor.id, "INVOICE_PAID", "invoice", invoice.id,
              {"amount_paise": int(invoice.total_paise)}, ip)
    session.commit()
    session.refresh(invoice)
    return invoice


def invoice_html(session: Session, invoice_id: int) -> str:
    """Server-rendered and fully escaped; no user text ever reaches the page unescaped (S-16)."""
    invoice = get_invoice(session, invoice_id)
    lines = invoice_lines(session, invoice.id)

    if invoice.member_id is not None:
        member = session.get(Member, invoice.member_id)
        bill_to = member.full_name if member else ""
    else:
        client = session.get(Client, invoice.client_id)
        bill_to = client.company_name if client else ""

    rows = "".join(
        "<tr><td>{description}</td><td>{qty}</td><td>{unit}</td><td>{total}</td></tr>".format(
            description=html.escape(line.description),
            qty=line.qty,
            unit=_rupees(line.unit_price_paise),
            total=_rupees(line.line_total_paise),
        )
        for line in lines
    )
    return (
        "<!doctype html><html><head><meta charset='utf-8'>"
        f"<title>{html.escape(invoice.number)}</title></head><body>"
        f"<h1>Invoice {html.escape(invoice.number)}</h1>"
        f"<p>Billed to: {html.escape(bill_to)}</p>"
        f"<p>Issued {invoice.issue_date.isoformat()}, due {invoice.due_date.isoformat()}</p>"
        f"<p>Status: {html.escape(invoice.status)}</p>"
        "<table border='1'><thead><tr><th>Description</th><th>Qty</th>"
        "<th>Unit</th><th>Total</th></tr></thead>"
        f"<tbody>{rows}</tbody></table>"
        f"<p>Total {_rupees(invoice.total_paise)} (incl. tax {_rupees(invoice.tax_paise)})</p>"
        f"<p>{html.escape(invoice.notes or '')}</p>"
        "</body></html>"
    )


def _rupees(paise: int) -> str:
    return f"\u20b9{int(paise) // 100}.{int(paise) % 100:02d}"


# ---------------------------------------------------------------------------- expenses


def list_expenses(
    session: Session,
    status: ExpenseStatus | str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[Expense], int]:
    filters = []
    if status is not None:
        filters.append(Expense.status == ExpenseStatus(status).value)

    total = session.execute(select(func.count(Expense.id)).where(*filters)).scalar_one()
    rows = (
        session.execute(
            select(Expense)
            .where(*filters)
            .order_by(Expense.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .scalars()
        .all()
    )
    return list(rows), int(total)


def create_expense(session: Session, actor: User, data: dict, ip: str | None = None) -> Expense:
    expense = Expense(**data, created_by=actor.id, status=ExpenseStatus.UNPAID.value)
    session.add(expense)
    session.flush()
    audit.log(session, actor.id, "EXPENSE_CREATED", "expense", expense.id, data, ip)
    session.commit()
    session.refresh(expense)
    return expense


def get_expense(session: Session, expense_id: int) -> Expense:
    expense = session.get(Expense, expense_id)
    if expense is None:
        raise AppError("NOT_FOUND", "Expense not found.", 404)
    return expense


def mark_expense_paid(
    session: Session, actor: User, expense_id: int, ip: str | None = None
) -> Expense:
    """Expenses are money out, so no `payments` row is written — that table is revenue only."""
    expense = get_expense(session, expense_id)
    if expense.status == ExpenseStatus.PAID.value:
        raise AppError("ALREADY_PAID", "This expense is already paid.", 409)
    expense.status = ExpenseStatus.PAID.value
    expense.paid_at = utcnow()
    audit.log(session, actor.id, "EXPENSE_PAID", "expense", expense.id,
              {"amount_paise": int(expense.amount_paise)}, ip)
    session.commit()
    session.refresh(expense)
    return expense
