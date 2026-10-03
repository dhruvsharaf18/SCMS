from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from ..db import get_session
from ..enums import LeadStatus, Role
from ..models import User
from ..schemas import (
    LeadConverted,
    LeadNoteCreate,
    LeadNoteOut,
    LeadOut,
    LeadUpdate,
    Page,
    PageOut,
    PageSize,
    QuoteCreate,
    QuoteOut,
)
from ..security import client_ip, require_roles
from ..services import leads as svc

# Paths are written in full so they match SRS 3.2 exactly (see DECISIONS).
router = APIRouter(prefix="/api/v1", tags=["leads"])

_STAFF = (Role.OWNER, Role.MANAGER, Role.FRONT_DESK)


@router.get("/leads", response_model=PageOut)
def list_leads(
    lead_status: LeadStatus | None = Query(default=None, alias="status"),
    assigned_to: int | None = None,
    page: Page = 1,
    page_size: PageSize = 50,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_STAFF)),
) -> PageOut:
    rows, total = svc.list_leads(session, lead_status, assigned_to, page, page_size)
    return PageOut(
        items=[LeadOut.model_validate(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/leads/{lead_id}", response_model=LeadOut)
def get_lead(
    lead_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_STAFF)),
) -> LeadOut:
    return LeadOut.model_validate(svc.get_lead(session, lead_id))


@router.patch("/leads/{lead_id}", response_model=LeadOut)
def update_lead(
    lead_id: int,
    payload: LeadUpdate,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_STAFF)),
) -> LeadOut:
    data = payload.model_dump(exclude_unset=True)
    return LeadOut.model_validate(svc.update_lead(session, user, lead_id, data, client_ip(request)))


@router.get("/leads/{lead_id}/notes", response_model=list[LeadNoteOut])
def list_notes(
    lead_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_STAFF)),
) -> list[LeadNoteOut]:
    return [LeadNoteOut.model_validate(note) for note in svc.list_notes(session, lead_id)]


@router.post("/leads/{lead_id}/notes", response_model=LeadNoteOut, status_code=status.HTTP_201_CREATED)
def add_note(
    lead_id: int,
    payload: LeadNoteCreate,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_STAFF)),
) -> LeadNoteOut:
    return LeadNoteOut.model_validate(svc.add_note(session, user, lead_id, payload.body))


@router.get("/leads/{lead_id}/quotes", response_model=list[QuoteOut])
def list_quotes(
    lead_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_STAFF)),
) -> list[QuoteOut]:
    return [QuoteOut.model_validate(quote) for quote in svc.list_quotes(session, lead_id)]


@router.post("/leads/{lead_id}/quotes", response_model=QuoteOut, status_code=status.HTTP_201_CREATED)
def add_quote(
    lead_id: int,
    payload: QuoteCreate,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_STAFF)),
) -> QuoteOut:
    quote = svc.add_quote(session, user, lead_id, payload.model_dump(), client_ip(request))
    return QuoteOut.model_validate(quote)


@router.post("/leads/{lead_id}/convert", response_model=LeadConverted)
def convert(
    lead_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_STAFF)),
) -> LeadConverted:
    """Returns a prefill; the lead only becomes WON once POST /members carries its id."""
    return LeadConverted.model_validate(svc.convert(session, user, lead_id))
