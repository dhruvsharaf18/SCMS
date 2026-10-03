from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy.orm import Session

from ..db import get_session
from ..enums import InvoiceStatus, Role
from ..models import User
from ..schemas import (
    ClientCreate,
    ClientOut,
    ClientUpdate,
    InvoiceCreate,
    InvoiceLineOut,
    InvoiceOut,
    InvoiceStatusUpdate,
    MarkPaid,
    Page,
    PageOut,
    PageSize,
)
from ..security import client_ip, require_roles
from ..services import billing as svc

# Paths are written in full so they match SRS 3.2 exactly (see DECISIONS).
router = APIRouter(prefix="/api/v1", tags=["invoices"])

_FINANCE = (Role.OWNER, Role.MANAGER)
# SRS 3.1 gives the front desk read-only sight of invoices and clients.
_READERS = (Role.OWNER, Role.MANAGER, Role.FRONT_DESK)


def _out(session: Session, invoice) -> InvoiceOut:
    body = InvoiceOut.model_validate(invoice)
    body.lines = [
        InvoiceLineOut.model_validate(line) for line in svc.invoice_lines(session, invoice.id)
    ]
    return body


# ----------------------------------------------------------------------------- clients


@router.get("/clients", response_model=list[ClientOut])
def list_clients(
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_READERS)),
) -> list[ClientOut]:
    return [ClientOut.model_validate(client) for client in svc.list_clients(session)]


@router.post("/clients", response_model=ClientOut, status_code=status.HTTP_201_CREATED)
def create_client(
    payload: ClientCreate,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_FINANCE)),
) -> ClientOut:
    client = svc.create_client(session, user, payload.model_dump(), client_ip(request))
    return ClientOut.model_validate(client)


@router.patch("/clients/{client_id}", response_model=ClientOut)
def update_client(
    client_id: int,
    payload: ClientUpdate,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_FINANCE)),
) -> ClientOut:
    data = payload.model_dump(exclude_unset=True)
    return ClientOut.model_validate(
        svc.update_client(session, user, client_id, data, client_ip(request))
    )


# ---------------------------------------------------------------------------- invoices


@router.get("/invoices", response_model=PageOut)
def list_invoices(
    invoice_status: InvoiceStatus | None = Query(default=None, alias="status"),
    member_id: int | None = None,
    client_id: int | None = None,
    page: Page = 1,
    page_size: PageSize = 50,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_READERS)),
) -> PageOut:
    rows, total = svc.list_invoices(session, invoice_status, member_id, client_id, page, page_size)
    return PageOut(
        items=[_out(session, row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/invoices", response_model=InvoiceOut, status_code=status.HTTP_201_CREATED)
def create_invoice(
    payload: InvoiceCreate,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_FINANCE)),
) -> InvoiceOut:
    data = payload.model_dump()
    data["lines"] = [dict(line) for line in data["lines"]]
    return _out(session, svc.create_invoice(session, user, data, client_ip(request)))


@router.get("/invoices/{invoice_id}", response_model=InvoiceOut)
def get_invoice(
    invoice_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_READERS)),
) -> InvoiceOut:
    return _out(session, svc.get_invoice(session, invoice_id))


@router.get("/invoices/{invoice_id}/print")
def print_invoice(
    invoice_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_FINANCE)),
) -> Response:
    """Server-rendered HTML with every field escaped (S-16)."""
    return Response(content=svc.invoice_html(session, invoice_id), media_type="text/html")


@router.post("/invoices/{invoice_id}/status", response_model=InvoiceOut)
def set_status(
    invoice_id: int,
    payload: InvoiceStatusUpdate,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_FINANCE)),
) -> InvoiceOut:
    invoice = svc.set_invoice_status(session, user, invoice_id, payload.status, client_ip(request))
    return _out(session, invoice)


@router.post("/invoices/{invoice_id}/mark-paid", response_model=InvoiceOut)
def mark_paid(
    invoice_id: int,
    payload: MarkPaid,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_FINANCE)),
) -> InvoiceOut:
    invoice = svc.mark_invoice_paid(session, user, invoice_id, payload.method, client_ip(request))
    return _out(session, invoice)
