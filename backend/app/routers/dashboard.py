from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_session
from ..enums import Role
from ..models import User
from ..schemas import DashboardSummary, RevenueSeries
from ..security import require_roles
from ..services import membership as membership_svc
from ..services import reports as svc

# Paths are written in full so they match SRS 3.2 exactly (see DECISIONS).
router = APIRouter(prefix="/api/v1", tags=["dashboard"])

_FINANCE = (Role.OWNER, Role.MANAGER)


@router.get("/dashboard/summary", response_model=DashboardSummary, response_model_by_alias=True)
def summary(
    period: str = "today",
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_FINANCE)),
) -> DashboardSummary:
    """Loading the dashboard is what generates expiry notifications (SRS 4.9)."""
    body = svc.summary(session, period)
    membership_svc.notify_expiring(session)
    return DashboardSummary(**{**body, "from_": body["from"]})


@router.get("/dashboard/revenue-series", response_model=RevenueSeries)
def revenue_series(
    period: str = "week",
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_FINANCE)),
) -> RevenueSeries:
    return RevenueSeries.model_validate(svc.revenue_series(session, period))
