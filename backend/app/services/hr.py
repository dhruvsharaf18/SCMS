"""SRS 3.2.11 HR (P2) — employees, shifts, leave requests and monthly payroll.

Deliberately minimal: list, create, and the one action each entity needs. Payroll is the only
part with arithmetic, and `net = base - deductions` is the whole of it. Paying a payroll row
raises an expense so the money shows up in the dashboard's payables, not in the revenue ledger.
"""

from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import audit
from ..config import local_date
from ..enums import ExpenseStatus, LeaveStatus, PayrollStatus, Role
from ..models import Employee, Expense, LeaveRequest, Payroll, Shift, User
from ..security import (
    AppError,
    close_user_sessions,
    hash_password,
    utcnow,
    validate_password_policy,
)


# ---------------------------------------------------------------------------- employees


def list_employees(session: Session, active_only: bool = True) -> list[Employee]:
    filters = [Employee.is_active.is_(True)] if active_only else []
    return list(
        session.execute(select(Employee).where(*filters).order_by(Employee.id)).scalars().all()
    )


def get_employee(session: Session, employee_id: int) -> Employee:
    employee = session.get(Employee, employee_id)
    if employee is None:
        raise AppError("NOT_FOUND", "Employee not found.", 404)
    return employee


def _require_owner(actor: User, what: str) -> None:
    """Staff logins are OWNER business (SRS 3.1), even when reached through an employee."""
    if actor.role != Role.OWNER.value:
        raise AppError("FORBIDDEN", f"Only the owner can {what}.", 403)


def create_employee(session: Session, actor: User, data: dict, ip: str | None = None) -> Employee:
    """Optionally creates the staff login in the same transaction, so neither exists alone."""
    data = dict(data)
    login = data.pop("login", None)
    if login is not None and data.get("user_id") is not None:
        raise AppError("VALIDATION_ERROR", "Give either user_id or login, not both.", 422)

    if login is not None:
        _require_owner(actor, "create staff logins")
        validate_password_policy(login["password"])
        user = User(
            email=login["email"],
            password_hash=hash_password(login["password"]),
            full_name=data["full_name"],
            role=Role(login["role"]).value,
        )
        session.add(user)
        try:
            session.flush()
        except IntegrityError:
            session.rollback()
            raise AppError("EMAIL_EXISTS", "A user with that email already exists.", 409) from None
        audit.log(session, actor.id, "USER_CREATED", "user", user.id,
                  {"after": {"email": user.email, "role": user.role, "is_active": True}}, ip)
        data["user_id"] = user.id
    elif data.get("user_id") is not None:
        linked = session.get(User, data["user_id"])
        if linked is None or linked.role == Role.MEMBER.value:
            raise AppError("NOT_FOUND", "Staff user not found.", 404)

    employee = Employee(**data)
    session.add(employee)
    session.flush()
    audit.log(session, actor.id, "EMPLOYEE_CREATED", "employee", employee.id,
              {**data, "login": bool(login)}, ip)
    session.commit()
    session.refresh(employee)
    return employee


def update_employee(
    session: Session, actor: User, employee_id: int, changes: dict, ip: str | None = None
) -> Employee:
    """Deactivating is how an employee is removed: payroll and shift history must survive.

    A linked login follows the employee's active flag, which is why only the OWNER may change
    that flag on an employee who has a login, and nobody may switch off their own.
    """
    employee = session.execute(
        select(Employee).where(Employee.id == employee_id).with_for_update()
    ).scalar_one_or_none()
    if employee is None:
        raise AppError("NOT_FOUND", "Employee not found.", 404)

    linked = session.get(User, employee.user_id) if employee.user_id is not None else None
    activity = changes.get("is_active")
    if activity is not None and activity != employee.is_active and linked is not None:
        _require_owner(actor, "deactivate or reactivate an employee who has a login")
        if linked.id == actor.id:
            raise AppError("CANNOT_DEACTIVATE_SELF", "You cannot deactivate your own account.", 409)

    before = {key: getattr(employee, key) for key in changes}
    for key, value in changes.items():
        setattr(employee, key, value)
    if activity is not None and linked is not None and linked.is_active != activity:
        linked.is_active = activity
        if not activity:
            close_user_sessions(session, linked.id)
        audit.log(session, actor.id, "USER_UPDATED", "user", linked.id,
                  {"before": {"is_active": not activity}, "after": {"is_active": activity}}, ip)

    audit.log(session, actor.id, "EMPLOYEE_UPDATED", "employee", employee.id,
              {"before": before, "after": changes}, ip)
    session.commit()
    session.refresh(employee)
    return employee


def own_employee_id(session: Session, user: User) -> int | None:
    return session.execute(
        select(Employee.id).where(Employee.user_id == user.id)
    ).scalar_one_or_none()


# ------------------------------------------------------------------------------- shifts


def list_shifts(
    session: Session, week: date | None = None, employee_id: int | None = None
) -> list[Shift]:
    """`week` is any date inside the week; the roster runs Monday to Sunday."""
    filters = []
    if week is not None:
        monday = week - timedelta(days=week.weekday())
        filters += [Shift.shift_date >= monday, Shift.shift_date < monday + timedelta(days=7)]
    if employee_id is not None:
        filters.append(Shift.employee_id == employee_id)
    return list(
        session.execute(
            select(Shift).where(*filters).order_by(Shift.shift_date, Shift.start_time, Shift.id)
        )
        .scalars()
        .all()
    )


def create_shift(session: Session, actor: User, data: dict, ip: str | None = None) -> Shift:
    get_employee(session, data["employee_id"])
    if data["end_time"] <= data["start_time"]:
        raise AppError("VALIDATION_ERROR", "A shift must end after it starts.", 422)

    shift = Shift(**data)
    session.add(shift)
    session.flush()
    audit.log(session, actor.id, "SHIFT_CREATED", "shift", shift.id, data, ip)
    session.commit()
    session.refresh(shift)
    return shift


# ----------------------------------------------------------------------- leave requests


def list_leave_requests(
    session: Session, status: LeaveStatus | str | None = None, employee_id: int | None = None
) -> list[LeaveRequest]:
    filters = []
    if status is not None:
        filters.append(LeaveRequest.status == LeaveStatus(status).value)
    if employee_id is not None:
        filters.append(LeaveRequest.employee_id == employee_id)
    return list(
        session.execute(
            select(LeaveRequest).where(*filters).order_by(LeaveRequest.id.desc())
        )
        .scalars()
        .all()
    )


def create_leave_request(
    session: Session, actor: User, data: dict, ip: str | None = None
) -> LeaveRequest:
    """Staff raise their own; a manager may raise one on someone's behalf."""
    employee_id = data.get("employee_id")
    own = own_employee_id(session, actor)
    if actor.role not in (Role.OWNER.value, Role.MANAGER.value):
        if own is None:
            raise AppError("NOT_FOUND", "This account is not linked to an employee.", 404)
        employee_id = own
    elif employee_id is None:
        employee_id = own
    if employee_id is None:
        raise AppError("VALIDATION_ERROR", "Name the employee.", 422)

    get_employee(session, employee_id)
    if data["to_date"] < data["from_date"]:
        raise AppError("VALIDATION_ERROR", "to_date cannot precede from_date.", 422)

    request = LeaveRequest(
        employee_id=employee_id,
        from_date=data["from_date"],
        to_date=data["to_date"],
        reason=data.get("reason"),
        status=LeaveStatus.PENDING.value,
    )
    session.add(request)
    session.flush()

    from ..enums import NotificationType
    from . import notifications

    notifications.notify(
        session,
        Role.MANAGER,
        NotificationType.LEAVE_REQUEST,
        "Leave request",
        f"{request.from_date} to {request.to_date}.",
        f"/leave-requests/{request.id}",
        dedupe_key=f"LEAVE_REQUEST:{request.id}",
    )
    session.commit()
    session.refresh(request)
    return request


def decide_leave(
    session: Session, actor: User, request_id: int, decision: LeaveStatus, ip: str | None = None
) -> LeaveRequest:
    request = session.get(LeaveRequest, request_id)
    if request is None:
        raise AppError("NOT_FOUND", "Leave request not found.", 404)
    decision = LeaveStatus(decision)
    if decision not in (LeaveStatus.APPROVED, LeaveStatus.REJECTED):
        raise AppError("VALIDATION_ERROR", "A decision is APPROVED or REJECTED.", 422)
    if request.status != LeaveStatus.PENDING.value:
        raise AppError("ALREADY_DECIDED", f"This request is already {request.status}.", 409)

    request.status = decision.value
    request.decided_by = actor.id
    audit.log(session, actor.id, "LEAVE_DECIDED", "leave_request", request.id,
              {"decision": decision.value}, ip)
    session.commit()
    session.refresh(request)
    return request


# ------------------------------------------------------------------------------ payroll


def _valid_month(month: str) -> str:
    try:
        year, month_number = (int(part) for part in month.split("-"))
        date(year, month_number, 1)
    except (ValueError, TypeError):
        raise AppError("VALIDATION_ERROR", "month must look like YYYY-MM.", 422) from None
    return f"{year:04d}-{month_number:02d}"


def list_payroll(session: Session, month: str | None = None) -> list[Payroll]:
    filters = [Payroll.month == _valid_month(month)] if month else []
    return list(
        session.execute(
            select(Payroll).where(*filters).order_by(Payroll.month.desc(), Payroll.employee_id)
        )
        .scalars()
        .all()
    )


def run_payroll(session: Session, actor: User, month: str, ip: str | None = None) -> list[Payroll]:
    """Idempotent: UNIQUE(month, employee_id) means a second run adds only new employees."""
    month = _valid_month(month)
    created = []
    for employee in list_employees(session, active_only=True):
        existing = session.execute(
            select(Payroll).where(
                Payroll.month == month, Payroll.employee_id == employee.id
            )
        ).scalar_one_or_none()
        if existing is not None:
            continue

        row = Payroll(
            month=month,
            employee_id=employee.id,
            base_paise=int(employee.monthly_salary_paise),
            deductions_paise=0,
            net_paise=int(employee.monthly_salary_paise),
            status=PayrollStatus.PENDING.value,
        )
        session.add(row)
        try:
            session.flush()
        except IntegrityError:
            session.rollback()
            continue
        created.append(row)

    audit.log(session, actor.id, "PAYROLL_RUN", "payroll", None,
              {"month": month, "created": len(created)}, ip)
    session.commit()
    for row in created:
        session.refresh(row)
    return created


def mark_payroll_paid(
    session: Session, actor: User, payroll_id: int, ip: str | None = None
) -> Payroll:
    row = session.get(Payroll, payroll_id)
    if row is None:
        raise AppError("NOT_FOUND", "Payroll row not found.", 404)
    if row.status == PayrollStatus.PAID.value:
        raise AppError("ALREADY_PAID", "This payroll row is already paid.", 409)

    employee = get_employee(session, row.employee_id)
    row.status = PayrollStatus.PAID.value
    session.add(
        Expense(
            category="PAYROLL",
            vendor=employee.full_name,
            description=f"Salary {row.month}",
            amount_paise=int(row.net_paise),
            status=ExpenseStatus.PAID.value,
            paid_at=utcnow(),
            due_date=local_date(utcnow()),
            created_by=actor.id,
        )
    )
    audit.log(session, actor.id, "PAYROLL_PAID", "payroll", row.id,
              {"net_paise": int(row.net_paise)}, ip)
    session.commit()
    session.refresh(row)
    return row


def payroll_totals(session: Session, month: str) -> dict:
    month = _valid_month(month)
    rows = session.execute(
        select(Payroll.status, func.coalesce(func.sum(Payroll.net_paise), 0))
        .where(Payroll.month == month)
        .group_by(Payroll.status)
    ).all()
    return {status: int(total) for status, total in rows}
