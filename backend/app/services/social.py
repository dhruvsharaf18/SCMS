"""SRS 3.2.6 / 4.4 — social play sessions.

A session holds the court the same way a booking does: one `court_slots` row per 30 minutes,
carrying `social_session_id` instead of `booking_id`. The same UNIQUE(court_id, slot_start)
therefore stops a social session and a booking from overlapping, in either direction.
"""

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import audit
from ..config import day_bounds_utc
from ..enums import (
    PaymentMethod,
    Role,
    SocialParticipantStatus,
    SocialSessionStatus,
    SourceType,
    Tier,
)
from ..models import Court, CourtSlot, Member, SocialParticipant, SocialSession, User
from ..security import AppError, utcnow
from . import payments as payments_svc
from . import pricing
from .booking import SLOT_MINUTES, validate_start


def _slot_starts(start_at: datetime, end_at: datetime) -> list[datetime]:
    if end_at <= start_at:
        raise AppError("INVALID_SLOT", "The session must end after it starts.", 422)
    starts, current = [], start_at
    while current < end_at:
        starts.append(current)
        current += timedelta(minutes=SLOT_MINUTES)
    return starts


def create_session(
    session: Session, actor: User, data: dict, ip: str | None = None
) -> SocialSession:
    start_at = data["start_at"].astimezone(timezone.utc)
    end_at = data["end_at"].astimezone(timezone.utc)

    court = session.get(Court, data["court_id"])
    if court is None or not court.is_active:
        raise AppError("COURT_NOT_FOUND", "Court not found.", 404)
    validate_start(start_at, advance_days=365)

    slot_starts = _slot_starts(start_at, end_at)
    taken = (
        session.execute(
            select(CourtSlot.slot_start).where(
                CourtSlot.court_id == court.id, CourtSlot.slot_start.in_(slot_starts)
            )
        )
        .scalars()
        .all()
    )
    if taken:
        raise AppError(
            "SLOTS_NOT_FREE",
            "Some of those slots are already taken.",
            409,
            {"conflicts": [slot.isoformat().replace("+00:00", "Z") for slot in sorted(taken)]},
        )

    social = SocialSession(
        court_id=court.id,
        title=data["title"],
        start_at=start_at,
        end_at=end_at,
        capacity=data["capacity"],
        fee_paise=data.get("fee_paise") or 0,
        status=SocialSessionStatus.OPEN.value,
        created_by=actor.id,
    )
    session.add(social)
    session.flush()

    session.add_all(
        CourtSlot(court_id=court.id, slot_start=slot_start, social_session_id=social.id)
        for slot_start in slot_starts
    )
    try:
        session.flush()
    except IntegrityError:
        session.rollback()
        raise AppError("SLOTS_NOT_FREE", "Some of those slots were just taken.", 409) from None

    audit.log(session, actor.id, "SOCIAL_SESSION_CREATED", "social_session", social.id, data, ip)
    session.commit()
    session.refresh(social)
    return social


def get_session_row(session: Session, session_id: int) -> SocialSession:
    social = session.get(SocialSession, session_id)
    if social is None:
        raise AppError("NOT_FOUND", "Session not found.", 404)
    return social


def joined_count(session: Session, session_id: int) -> int:
    return int(
        session.execute(
            select(func.count(SocialParticipant.id)).where(
                SocialParticipant.session_id == session_id,
                SocialParticipant.status == SocialParticipantStatus.JOINED.value,
            )
        ).scalar_one()
    )


def list_sessions(
    session: Session, from_: date | None = None, to: date | None = None
) -> list[tuple[SocialSession, int]]:
    filters = []
    if from_ is not None:
        filters.append(SocialSession.start_at >= day_bounds_utc(from_)[0])
    if to is not None:
        filters.append(SocialSession.start_at < day_bounds_utc(to)[1])

    rows = (
        session.execute(select(SocialSession).where(*filters).order_by(SocialSession.start_at))
        .scalars()
        .all()
    )
    return [(row, joined_count(session, row.id)) for row in rows]


def join(
    session: Session,
    actor: User,
    session_id: int,
    member_id: int | None = None,
    guest_name: str | None = None,
    ip: str | None = None,
) -> SocialParticipant:
    """Locks the session row so the capacity check and the insert cannot interleave (SRS 4.4)."""
    if actor.role == Role.MEMBER.value:
        member_id = session.execute(
            select(Member.id).where(Member.user_id == actor.id)
        ).scalar_one_or_none()
        if member_id is None:
            raise AppError("MEMBER_NOT_FOUND", "This account is not linked to a member.", 404)
        guest_name = None
    elif member_id is None and not guest_name:
        raise AppError("GUEST_REQUIRED", "Name the member or the guest.", 422)

    social = session.execute(
        select(SocialSession).where(SocialSession.id == session_id).with_for_update()
    ).scalar_one_or_none()
    if social is None:
        raise AppError("NOT_FOUND", "Session not found.", 404)
    if social.status == SocialSessionStatus.CANCELLED.value:
        raise AppError("SESSION_CANCELLED", "This session was cancelled.", 409)
    if social.start_at <= utcnow():
        raise AppError("SESSION_STARTED", "This session has already started.", 409)

    if member_id is not None:
        already = session.execute(
            select(SocialParticipant.id).where(
                SocialParticipant.session_id == social.id,
                SocialParticipant.member_id == member_id,
                SocialParticipant.status == SocialParticipantStatus.JOINED.value,
            )
        ).scalar_one_or_none()
        if already is not None:
            raise AppError("ALREADY_JOINED", "This member has already joined.", 409)

    if joined_count(session, social.id) >= social.capacity:
        raise AppError("SESSION_FULL", "This session is full.", 409)

    # Gold plays social for free; everyone else pays the session fee (SRS 4.4).
    tier = pricing.tier_for(session, member_id)
    fee = 0 if tier is Tier.GOLD else int(social.fee_paise)

    participant = SocialParticipant(
        session_id=social.id,
        member_id=member_id,
        guest_name=guest_name if member_id is None else None,
        fee_paise=fee,
        status=SocialParticipantStatus.JOINED.value,
    )
    session.add(participant)
    try:
        session.flush()
    except IntegrityError:
        session.rollback()
        raise AppError("ALREADY_JOINED", "This member has already joined.", 409) from None

    if fee > 0:
        payments_svc.record_payment(
            session,
            SourceType.SOCIAL,
            social.id,
            fee,
            PaymentMethod.CASH,
            member_id=member_id,
            user_id=actor.id,
        )

    session.commit()
    session.refresh(participant)
    return participant


def leave(session: Session, actor: User, session_id: int, member_id: int | None = None) -> None:
    if actor.role == Role.MEMBER.value:
        member_id = session.execute(
            select(Member.id).where(Member.user_id == actor.id)
        ).scalar_one_or_none()

    participant = session.execute(
        select(SocialParticipant).where(
            SocialParticipant.session_id == session_id,
            SocialParticipant.member_id == member_id,
            SocialParticipant.status == SocialParticipantStatus.JOINED.value,
        )
    ).scalar_one_or_none()
    if participant is None:
        raise AppError("NOT_FOUND", "This member is not in that session.", 404)

    participant.status = SocialParticipantStatus.LEFT.value
    _refund_participant(session, session_id, participant)
    session.commit()


def participants(session: Session, session_id: int) -> list[SocialParticipant]:
    get_session_row(session, session_id)
    return list(
        session.execute(
            select(SocialParticipant)
            .where(SocialParticipant.session_id == session_id)
            .order_by(SocialParticipant.id)
        )
        .scalars()
        .all()
    )


def _refund_participant(
    session: Session, session_id: int, participant: SocialParticipant
) -> None:
    """Social payments share one source_id, so the right row is found by member and amount."""
    if participant.fee_paise <= 0:
        return
    from ..models import Payment

    payment = session.execute(
        select(Payment)
        .where(
            Payment.source_type == SourceType.SOCIAL.value,
            Payment.source_id == session_id,
            Payment.member_id == participant.member_id,
            Payment.amount_paise == participant.fee_paise,
            Payment.status == "COMPLETED",
        )
        .limit(1)
    ).scalar_one_or_none()
    if payment is not None:
        payments_svc.refund_payment(session, payment)


def cancel_session(
    session: Session, actor: User, session_id: int, ip: str | None = None
) -> SocialSession:
    """Frees every slot and refunds everyone who paid. The session row itself is kept."""
    social = get_session_row(session, session_id)
    if social.status == SocialSessionStatus.CANCELLED.value:
        raise AppError("ALREADY_CANCELLED", "This session is already cancelled.", 409)

    for participant in session.execute(
        select(SocialParticipant).where(
            SocialParticipant.session_id == social.id,
            SocialParticipant.status == SocialParticipantStatus.JOINED.value,
        )
    ).scalars():
        _refund_participant(session, social.id, participant)
        participant.status = SocialParticipantStatus.LEFT.value

    for slot in session.execute(
        select(CourtSlot).where(CourtSlot.social_session_id == social.id)
    ).scalars():
        session.delete(slot)

    social.status = SocialSessionStatus.CANCELLED.value
    audit.log(session, actor.id, "SOCIAL_SESSION_CANCELLED", "social_session", social.id, None, ip)
    session.commit()
    session.refresh(social)
    return social
