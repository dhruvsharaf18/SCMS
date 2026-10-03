"""SRS 3.2.10 / 4.9 — the public enquiry form, the lead pipeline and notifications.

The public form is the only unauthenticated write in the system, so it is treated as hostile
input: a honeypot, a per-IP rate limit, hard length caps, control characters stripped, and a
response that echoes nothing but an id (S-15, S-17).
"""

import unicodedata

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import audit
from ..enums import LeadInterest, LeadStatus, NotificationType, QuoteStatus, Role
from ..models import Lead, LeadNote, Notification, Plan, Quote, User
from ..security import AppError
from . import notifications as notifications_svc

# NEW → CONTACTED → QUOTED → WON | LOST. WON and LOST are terminal.
_NEXT_STATUS = {
    LeadStatus.NEW: {LeadStatus.CONTACTED, LeadStatus.QUOTED, LeadStatus.LOST},
    LeadStatus.CONTACTED: {LeadStatus.QUOTED, LeadStatus.WON, LeadStatus.LOST},
    LeadStatus.QUOTED: {LeadStatus.WON, LeadStatus.LOST},
    LeadStatus.WON: set(),
    LeadStatus.LOST: set(),
}


def sanitise(value: str | None, max_length: int) -> str | None:
    """Drop control characters (except newlines in messages) and clip to the column width."""
    if value is None:
        return None
    cleaned = "".join(
        char
        for char in value
        if char in ("\n", "\t") or unicodedata.category(char)[0] != "C"
    )
    return cleaned.strip()[:max_length] or None


# ------------------------------------------------------------------------ public form


def record_enquiry(session: Session, data: dict, ip: str | None = None) -> dict:
    """A filled honeypot returns the same 201 shape but stores nothing (S-17)."""
    if data.get("website"):
        return {"id": 0, "status": "received"}

    plan_id = data.get("preferred_plan_id")
    if plan_id is not None and session.get(Plan, plan_id) is None:
        plan_id = None  # never 404 back at an anonymous caller; it leaks what exists

    lead = Lead(
        name=sanitise(data["name"], 120) or "Unknown",
        email=sanitise(data.get("email"), 255),
        phone=sanitise(data.get("phone"), 15),
        interest=LeadInterest(data.get("interest") or LeadInterest.OTHER).value,
        preferred_plan_id=plan_id,
        message=sanitise(data.get("message"), 1000),
        status=LeadStatus.NEW.value,
    )
    session.add(lead)
    session.flush()

    for role in (Role.MANAGER, Role.FRONT_DESK):
        notifications_svc.notify(
            session,
            role,
            NotificationType.NEW_LEAD,
            "New enquiry",
            f"{lead.name} is interested in {lead.interest.title()}.",
            f"/leads/{lead.id}",
            dedupe_key=f"NEW_LEAD:{lead.id}:{role.value}",
        )
    session.commit()
    return {"id": lead.id, "status": "received"}


# ------------------------------------------------------------------------------- leads


def get_lead(session: Session, lead_id: int) -> Lead:
    lead = session.get(Lead, lead_id)
    if lead is None:
        raise AppError("NOT_FOUND", "Lead not found.", 404)
    return lead


def list_leads(
    session: Session,
    status: LeadStatus | str | None = None,
    assigned_to: int | None = None,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[Lead], int]:
    filters = []
    if status is not None:
        filters.append(Lead.status == LeadStatus(status).value)
    if assigned_to is not None:
        filters.append(Lead.assigned_to == assigned_to)

    total = session.execute(select(func.count(Lead.id)).where(*filters)).scalar_one()
    rows = (
        session.execute(
            select(Lead)
            .where(*filters)
            .order_by(Lead.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .scalars()
        .all()
    )
    return list(rows), int(total)


def update_lead(
    session: Session, actor: User, lead_id: int, data: dict, ip: str | None = None
) -> Lead:
    lead = get_lead(session, lead_id)

    new_status = data.get("status")
    if new_status is not None:
        new_status = LeadStatus(new_status)
        if new_status not in _NEXT_STATUS[LeadStatus(lead.status)]:
            raise AppError(
                "INVALID_TRANSITION",
                f"A lead cannot move from {lead.status} to {new_status.value}.",
                409,
            )
        lead.status = new_status.value

    if "assigned_to" in data:
        assignee_id = data["assigned_to"]
        if assignee_id is not None:
            assignee = session.get(User, assignee_id)
            if assignee is None or assignee.role == Role.MEMBER.value:
                raise AppError("NOT_FOUND", "Assignee not found.", 404)
        lead.assigned_to = assignee_id

    audit.log(session, actor.id, "LEAD_UPDATED", "lead", lead.id, data, ip)
    session.commit()
    session.refresh(lead)
    return lead


def add_note(session: Session, actor: User, lead_id: int, body: str) -> LeadNote:
    get_lead(session, lead_id)
    note = LeadNote(lead_id=lead_id, author_id=actor.id, body=sanitise(body, 1000) or "")
    session.add(note)
    session.commit()
    session.refresh(note)
    return note


def list_notes(session: Session, lead_id: int) -> list[LeadNote]:
    get_lead(session, lead_id)
    return list(
        session.execute(
            select(LeadNote).where(LeadNote.lead_id == lead_id).order_by(LeadNote.id)
        )
        .scalars()
        .all()
    )


def add_quote(session: Session, actor: User, lead_id: int, data: dict, ip: str | None) -> Quote:
    lead = get_lead(session, lead_id)
    quote = Quote(
        lead_id=lead.id,
        amount_paise=data["amount_paise"],
        description=sanitise(data.get("description"), 500),
        valid_until=data.get("valid_until"),
        status=QuoteStatus.SENT.value,
    )
    session.add(quote)
    session.flush()

    if LeadStatus(lead.status) in (LeadStatus.NEW, LeadStatus.CONTACTED):
        lead.status = LeadStatus.QUOTED.value  # quoting a lead is what makes it QUOTED

    audit.log(session, actor.id, "LEAD_QUOTED", "lead", lead.id, data, ip)
    session.commit()
    session.refresh(quote)
    return quote


def list_quotes(session: Session, lead_id: int) -> list[Quote]:
    get_lead(session, lead_id)
    return list(
        session.execute(select(Quote).where(Quote.lead_id == lead_id).order_by(Quote.id))
        .scalars()
        .all()
    )


def convert(session: Session, actor: User, lead_id: int) -> dict:
    """Returns the prefill only. The lead becomes WON when POST /members carries its id."""
    lead = get_lead(session, lead_id)
    if LeadStatus(lead.status) is LeadStatus.WON:
        raise AppError("ALREADY_CONVERTED", "This lead is already a member.", 409)
    if LeadStatus(lead.status) is LeadStatus.LOST:
        raise AppError("INVALID_TRANSITION", "This lead was marked lost.", 409)

    return {
        "lead_id": lead.id,
        "member_prefill": {
            "full_name": lead.name,
            "email": lead.email,
            "phone": lead.phone,
            "plan_id": lead.preferred_plan_id,
            "lead_id": lead.id,
        },
    }


def mark_won(session: Session, lead_id: int) -> None:
    """Called by the members service once the member row exists. Caller commits."""
    lead = session.get(Lead, lead_id)
    if lead is None:
        raise AppError("NOT_FOUND", "Lead not found.", 404)
    if LeadStatus(lead.status) is LeadStatus.LOST:
        raise AppError("INVALID_TRANSITION", "This lead was marked lost.", 409)
    lead.status = LeadStatus.WON.value


# ----------------------------------------------------------------------- notifications


def _visible_to(user: User):
    return (
        (Notification.target_user_id == user.id)
        | (Notification.target_role == user.role)
    )


def list_notifications(
    session: Session, user: User, unread_only: bool = False, page: int = 1, page_size: int = 50
) -> tuple[list[Notification], int]:
    filters = [_visible_to(user)]
    if unread_only:
        filters.append(Notification.read_at.is_(None))

    total = session.execute(select(func.count(Notification.id)).where(*filters)).scalar_one()
    rows = (
        session.execute(
            select(Notification)
            .where(*filters)
            .order_by(Notification.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .scalars()
        .all()
    )
    return list(rows), int(total)


def unread_count(session: Session, user: User) -> int:
    return int(
        session.execute(
            select(func.count(Notification.id)).where(
                _visible_to(user), Notification.read_at.is_(None)
            )
        ).scalar_one()
    )


def mark_read(session: Session, user: User, notification_id: int) -> Notification:
    """A role-targeted notification is marked read by whoever acts on it first."""
    from ..security import utcnow

    notification = session.execute(
        select(Notification).where(Notification.id == notification_id, _visible_to(user))
    ).scalar_one_or_none()
    if notification is None:
        raise AppError("NOT_FOUND", "Notification not found.", 404)
    if notification.read_at is None:
        notification.read_at = utcnow()
        session.commit()
        session.refresh(notification)
    return notification
