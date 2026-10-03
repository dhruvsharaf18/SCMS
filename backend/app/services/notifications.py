"""SRS 4.9 notifications. Idempotent on dedupe_key."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..enums import NotificationType, Role
from ..models import Notification


def notify(
    session: Session,
    role_or_user: Role | str | int,
    type: NotificationType,
    title: str,
    body: str | None = None,
    link: str | None = None,
    dedupe_key: str | None = None,
) -> Notification | None:
    """Create one notification. Returns None when dedupe_key already exists."""
    if dedupe_key is not None:
        existing = session.execute(
            select(Notification.id).where(Notification.dedupe_key == dedupe_key)
        ).first()
        if existing is not None:
            return None

    target_user_id = role_or_user if isinstance(role_or_user, int) else None
    target_role = None if isinstance(role_or_user, int) else Role(role_or_user).value

    notification = Notification(
        target_role=target_role,
        target_user_id=target_user_id,
        type=NotificationType(type).value,
        title=title,
        body=body,
        link=link,
        dedupe_key=dedupe_key,
    )
    session.add(notification)
    session.flush()
    return notification
