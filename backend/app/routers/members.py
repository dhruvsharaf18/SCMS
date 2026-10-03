from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from ..config import local_date
from ..db import get_session
from ..enums import MemberStatus, PlanCode, Role
from ..models import User
from ..schemas import (
    HistoryEvent,
    MemberBrief,
    MemberCreate,
    MemberCreated,
    MemberOut,
    MemberRenew,
    MembershipOut,
    MemberUpdate,
    PageOut,
)
from ..security import assert_member_access, client_ip, current_member_id, require_roles, utcnow
from ..services import membership as svc

router = APIRouter(prefix="/api/v1", tags=["members"])

_STAFF = (Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
_ALL = (Role.OWNER, Role.MANAGER, Role.FRONT_DESK, Role.BAR_STAFF, Role.MEMBER)


def _membership_out(session: Session, member_id: int) -> MembershipOut | None:
    row = svc.latest_membership(session, member_id)
    if row is None:
        return None
    plan = svc.session_plan(session, row.plan_id)
    return MembershipOut(
        id=row.id,
        plan_code=PlanCode(plan.code),
        start_date=row.start_date,
        end_date=row.end_date,
        status=row.status,
    )


def _member_out(session: Session, member) -> MemberOut:
    ms = _membership_out(session, member.id)
    return MemberOut(
        id=member.id,
        member_code=member.member_code,
        full_name=member.full_name,
        phone=member.phone,
        email=member.email,
        dob=member.dob,
        emergency_contact=member.emergency_contact,
        notes=member.notes,
        status=svc.member_status(ms.end_date if ms else None, local_date(utcnow())),
        membership=ms,
    )


def _brief(session: Session, member) -> MemberBrief:
    ms = _membership_out(session, member.id)
    return MemberBrief(
        id=member.id,
        member_code=member.member_code,
        full_name=member.full_name,
        plan_code=ms.plan_code if ms else None,
    )


def _view(session: Session, actor: User, member):
    """BAR_STAFF sees name/plan/code only (SRS 3.1)."""
    if actor.role == Role.BAR_STAFF.value:
        return _brief(session, member)
    return _member_out(session, member)


@router.post("/members", response_model=MemberCreated, status_code=status.HTTP_201_CREATED)
def create_member(
    payload: MemberCreate,
    request: Request,
    session: Session = Depends(get_session),
    actor: User = Depends(require_roles(*_STAFF)),
) -> MemberCreated:
    result = svc.create_member(session, actor, payload.model_dump(), client_ip(request))
    member, ms, plan = result["member"], result["membership"], result["plan"]
    return MemberCreated(
        id=member.id,
        member_code=member.member_code,
        full_name=member.full_name,
        membership=(
            MembershipOut(
                id=ms.id,
                plan_code=PlanCode(plan.code),
                start_date=ms.start_date,
                end_date=ms.end_date,
                status=ms.status,
            )
            if ms
            else None
        ),
        payment_id=result["payment_id"],
    )


@router.get("/members", response_model=PageOut)
def list_members(
    q: str | None = None,
    status_filter: MemberStatus | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    session: Session = Depends(get_session),
    actor: User = Depends(require_roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK, Role.BAR_STAFF)),
) -> PageOut:
    rows, total = svc.search_members(session, q, status_filter, page, page_size)
    return PageOut(
        items=[_view(session, actor, m) for m in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/members/expiring")
def expiring(
    days: int = Query(default=7, ge=1, le=90),
    session: Session = Depends(get_session),
    actor: User = Depends(require_roles(*_STAFF)),
) -> dict:
    svc.notify_expiring(session, days)
    rows = svc.expiring_members(session, days)
    return {
        "items": [
            {
                "id": m.id,
                "member_code": m.member_code,
                "full_name": m.full_name,
                "phone": m.phone,
                "end_date": end.isoformat(),
            }
            for m, end in rows
        ],
        "total": len(rows),
    }


@router.get("/members/by-code/{code}")
def by_code(
    code: str,
    session: Session = Depends(get_session),
    actor: User = Depends(require_roles(*_ALL)),
):
    member = svc.get_member_by_code(session, code)
    assert_member_access(session, actor, member.id)
    return _view(session, actor, member)


@router.get("/members/{member_id}")
def get_member(
    member_id: int,
    session: Session = Depends(get_session),
    actor: User = Depends(require_roles(*_ALL)),
):
    assert_member_access(session, actor, member_id)
    return _view(session, actor, svc.get_member(session, member_id))


@router.patch("/members/{member_id}", response_model=MemberOut)
def patch_member(
    member_id: int,
    payload: MemberUpdate,
    request: Request,
    session: Session = Depends(get_session),
    actor: User = Depends(require_roles(*_STAFF)),
) -> MemberOut:
    changes = payload.model_dump(exclude_unset=True)
    member = svc.update_member(session, actor, member_id, changes, client_ip(request))
    return _member_out(session, member)


@router.post("/members/{member_id}/renew", response_model=MemberCreated)
def renew(
    member_id: int,
    payload: MemberRenew,
    request: Request,
    session: Session = Depends(get_session),
    actor: User = Depends(require_roles(*_STAFF)),
) -> MemberCreated:
    result = svc.renew_member(
        session, actor, member_id, payload.plan_id, payload.payment_method, client_ip(request)
    )
    member, ms, plan = result["member"], result["membership"], result["plan"]
    return MemberCreated(
        id=member.id,
        member_code=member.member_code,
        full_name=member.full_name,
        membership=MembershipOut(
            id=ms.id,
            plan_code=PlanCode(plan.code),
            start_date=ms.start_date,
            end_date=ms.end_date,
            status=ms.status,
        ),
        payment_id=result["payment_id"],
    )


@router.get("/members/{member_id}/history", response_model=PageOut)
def history(
    member_id: int,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    session: Session = Depends(get_session),
    actor: User = Depends(require_roles(*_ALL)),
) -> PageOut:
    assert_member_access(session, actor, member_id)
    svc.get_member(session, member_id)
    events, total = svc.member_history(session, member_id, page, page_size)
    return PageOut(
        items=[HistoryEvent(**e) for e in events],
        total=total,
        page=page,
        page_size=page_size,
    )
