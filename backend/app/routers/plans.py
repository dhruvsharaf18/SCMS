from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from ..db import get_session
from ..enums import Role
from ..models import User
from ..schemas import CourtPriceIn, CourtPriceOut, PlanOut, PlanUpdate
from ..security import client_ip, get_current_user, require_roles
from ..services import membership as svc

# Paths are written in full so they match SRS 3.2 exactly (see DECISIONS).
router = APIRouter(prefix="/api/v1", tags=["plans"])


@router.get("/plans", response_model=list[PlanOut])
def list_plans(session: Session = Depends(get_session)) -> list[PlanOut]:
    """(public) SRS 3.2.2."""
    return [PlanOut.model_validate(p) for p in svc.list_plans(session)]


@router.patch("/plans/{plan_id}", response_model=PlanOut)
def patch_plan(
    plan_id: int,
    payload: PlanUpdate,
    request: Request,
    session: Session = Depends(get_session),
    actor: User = Depends(require_roles(Role.OWNER, Role.MANAGER)),
) -> PlanOut:
    changes = payload.model_dump(exclude_unset=True)
    return PlanOut.model_validate(
        svc.update_plan(session, actor, plan_id, changes, client_ip(request))
    )


@router.get("/court-prices", response_model=list[CourtPriceOut])
def list_court_prices(session: Session = Depends(get_session)) -> list[CourtPriceOut]:
    """(public) SRS 3.2.2."""
    return [CourtPriceOut.model_validate(p) for p in svc.list_court_prices(session)]


@router.put("/court-prices", response_model=list[CourtPriceOut])
def put_court_prices(
    payload: list[CourtPriceIn],
    request: Request,
    session: Session = Depends(get_session),
    actor: User = Depends(require_roles(Role.OWNER, Role.MANAGER)),
) -> list[CourtPriceOut]:
    rows = [item.model_dump() for item in payload]
    return [
        CourtPriceOut.model_validate(p)
        for p in svc.upsert_court_prices(session, actor, rows, client_ip(request))
    ]
