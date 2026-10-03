from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_session
from ..enums import Role
from ..models import User
from ..schemas import NotificationOut, Page, PageOut, PageSize, UnreadCount
from ..security import require_roles
from ..services import leads as svc

# Paths are written in full so they match SRS 3.2 exactly (see DECISIONS).
router = APIRouter(prefix="/api/v1", tags=["notifications"])

_ALL = (Role.OWNER, Role.MANAGER, Role.FRONT_DESK, Role.BAR_STAFF, Role.MEMBER)


@router.get("/notifications", response_model=PageOut)
def list_notifications(
    unread_only: bool = False,
    page: Page = 1,
    page_size: PageSize = 50,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ALL)),
) -> PageOut:
    """Own notifications only: those addressed to this user or to this user's role."""
    rows, total = svc.list_notifications(session, user, unread_only, page, page_size)
    return PageOut(
        items=[NotificationOut.model_validate(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/notifications/unread-count", response_model=UnreadCount)
def unread_count(
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ALL)),
) -> UnreadCount:
    return UnreadCount(unread=svc.unread_count(session, user))


@router.post("/notifications/{notification_id}/read", response_model=NotificationOut)
def mark_read(
    notification_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ALL)),
) -> NotificationOut:
    return NotificationOut.model_validate(svc.mark_read(session, user, notification_id))
