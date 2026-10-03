"""S-14 audit trail.

`log` only adds the row to the caller's session; the caller commits, so the audit row
lands in the same transaction as the change it describes.
"""

from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any

from sqlalchemy.orm import Session

from .models import AuditLog


def _jsonable(value: Any) -> Any:
    """Audit meta is whatever the caller passed, so dates and enums are coerced here."""
    if isinstance(value, dict):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_jsonable(item) for item in value]
    if isinstance(value, Enum):
        return _jsonable(value.value)
    if isinstance(value, datetime):
        return value.isoformat().replace("+00:00", "Z")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return int(value)
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def log(
    session: Session,
    actor_id: int | None,
    action: str,
    entity: str | None = None,
    entity_id: int | None = None,
    meta: dict[str, Any] | None = None,
    ip: str | None = None,
) -> None:
    session.add(
        AuditLog(
            actor_id=actor_id,
            action=action,
            entity=entity,
            entity_id=entity_id,
            meta=_jsonable(meta),
            ip=ip,
        )
    )
