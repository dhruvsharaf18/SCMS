from datetime import date

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from ..db import get_session
from ..enums import LeaveStatus, Role
from ..models import User
from ..schemas import (
    EmployeeCreate,
    EmployeeOut,
    EmployeeUpdate,
    LeaveDecision,
    LeaveRequestCreate,
    LeaveRequestOut,
    PayrollOut,
    PayrollRun,
    ShiftCreate,
    ShiftOut,
)
from ..security import client_ip, require_roles
from ..services import hr as svc

# Paths are written in full so they match SRS 3.2 exactly (see DECISIONS).
router = APIRouter(prefix="/api/v1", tags=["hr"])

_ADMIN = (Role.OWNER, Role.MANAGER)
_STAFF = (Role.OWNER, Role.MANAGER, Role.FRONT_DESK, Role.BAR_STAFF)


# ---------------------------------------------------------------------------- employees


def _employee_out(session: Session, employee) -> EmployeeOut:
    out = EmployeeOut.model_validate(employee)
    if employee.user_id is not None:
        linked = session.get(User, employee.user_id)
        if linked is not None:
            out.login_email = linked.email
            out.login_role = Role(linked.role)
            out.login_active = linked.is_active
    return out


@router.get("/employees", response_model=list[EmployeeOut])
def list_employees(
    include_inactive: bool = False,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ADMIN)),
) -> list[EmployeeOut]:
    rows = svc.list_employees(session, active_only=not include_inactive)
    return [_employee_out(session, row) for row in rows]


@router.post("/employees", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
def create_employee(
    payload: EmployeeCreate,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ADMIN)),
) -> EmployeeOut:
    employee = svc.create_employee(session, user, payload.model_dump(), client_ip(request))
    return _employee_out(session, employee)


@router.patch("/employees/{employee_id}", response_model=EmployeeOut)
def update_employee(
    employee_id: int,
    payload: EmployeeUpdate,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ADMIN)),
) -> EmployeeOut:
    changes = payload.model_dump(exclude_unset=True)
    employee = svc.update_employee(session, user, employee_id, changes, client_ip(request))
    return _employee_out(session, employee)


# ------------------------------------------------------------------------------- shifts


@router.get("/shifts", response_model=list[ShiftOut])
def list_shifts(
    week: date | None = None,
    employee_id: int | None = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_STAFF)),
) -> list[ShiftOut]:
    """Any date inside the week works; the roster runs Monday to Sunday."""
    return [ShiftOut.model_validate(row) for row in svc.list_shifts(session, week, employee_id)]


@router.post("/shifts", response_model=ShiftOut, status_code=status.HTTP_201_CREATED)
def create_shift(
    payload: ShiftCreate,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ADMIN)),
) -> ShiftOut:
    shift = svc.create_shift(session, user, payload.model_dump(), client_ip(request))
    return ShiftOut.model_validate(shift)


# ----------------------------------------------------------------------- leave requests


@router.get("/leave-requests", response_model=list[LeaveRequestOut])
def list_leave_requests(
    leave_status: LeaveStatus | None = Query(default=None, alias="status"),
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_STAFF)),
) -> list[LeaveRequestOut]:
    """Staff see their own requests; managers see everyone's."""
    employee_id = None
    if user.role not in (Role.OWNER.value, Role.MANAGER.value):
        employee_id = svc.own_employee_id(session, user)
        if employee_id is None:
            return []
    rows = svc.list_leave_requests(session, leave_status, employee_id)
    return [LeaveRequestOut.model_validate(row) for row in rows]


@router.post("/leave-requests", response_model=LeaveRequestOut, status_code=status.HTTP_201_CREATED)
def create_leave_request(
    payload: LeaveRequestCreate,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_STAFF)),
) -> LeaveRequestOut:
    row = svc.create_leave_request(session, user, payload.model_dump(), client_ip(request))
    return LeaveRequestOut.model_validate(row)


@router.post("/leave-requests/{request_id}/decide", response_model=LeaveRequestOut)
def decide_leave(
    request_id: int,
    payload: LeaveDecision,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ADMIN)),
) -> LeaveRequestOut:
    row = svc.decide_leave(session, user, request_id, payload.decision, client_ip(request))
    return LeaveRequestOut.model_validate(row)


# ------------------------------------------------------------------------------ payroll


@router.get("/payroll", response_model=list[PayrollOut])
def list_payroll(
    month: str | None = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ADMIN)),
) -> list[PayrollOut]:
    return [PayrollOut.model_validate(row) for row in svc.list_payroll(session, month)]


@router.post("/payroll/run", response_model=list[PayrollOut], status_code=status.HTTP_201_CREATED)
def run_payroll(
    payload: PayrollRun,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ADMIN)),
) -> list[PayrollOut]:
    """Idempotent: rerunning a month only adds employees that have no row yet."""
    rows = svc.run_payroll(session, user, payload.month, client_ip(request))
    return [PayrollOut.model_validate(row) for row in rows]


@router.post("/payroll/{payroll_id}/mark-paid", response_model=PayrollOut)
def mark_payroll_paid(
    payroll_id: int,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(Role.OWNER)),
) -> PayrollOut:
    row = svc.mark_payroll_paid(session, user, payroll_id, client_ip(request))
    return PayrollOut.model_validate(row)
