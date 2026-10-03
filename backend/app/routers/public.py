from datetime import date

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from ..db import get_session
from ..enums import ProductCategory, Sport
from ..schemas import EnquiryAccepted, EnquiryCreate, PublicAvailabilityOut, PublicProductOut
from ..security import client_ip, limiter
from ..services import booking as svc
from ..services import leads as leads_svc
from ..services import shop as shop_svc

# Paths are written in full so they match SRS 3.2 exactly (see DECISIONS).
router = APIRouter(prefix="/api/v1", tags=["public"])


@router.get("/public/availability", response_model=PublicAvailabilityOut)
@limiter.limit("30/minute")
def public_availability(
    request: Request,
    from_: date = Query(alias="from"),
    days: int = Query(default=7, ge=1, le=7),
    sport: Sport | None = None,
    session: Session = Depends(get_session),
) -> PublicAvailabilityOut:
    """Anonymous grid. FREE / BUSY only — never a name, a phone or a price (S-13)."""
    return PublicAvailabilityOut.model_validate(
        svc.public_availability(session, from_, days, sport)
    )


@router.get("/public/products", response_model=list[PublicProductOut])
@limiter.limit("30/minute")
def public_products(
    request: Request,
    category: ProductCategory | None = None,
    session: Session = Depends(get_session),
) -> list[PublicProductOut]:
    """`in_stock` is a boolean on purpose: the exact quantity is never public (SRS 3.2.7)."""
    return [
        PublicProductOut.model_validate(product)
        for product in shop_svc.public_products(session, category)
    ]


@router.post("/public/enquiries", response_model=EnquiryAccepted, status_code=201)
@limiter.limit("30/minute")
def create_enquiry(
    request: Request,
    payload: EnquiryCreate,
    session: Session = Depends(get_session),
) -> EnquiryAccepted:
    """Honeypot first: a filled `website` gets the same 201 and is never stored (S-17)."""
    return EnquiryAccepted.model_validate(
        leads_svc.record_enquiry(session, payload.model_dump(), client_ip(request))
    )
