"""Stage 9: HR stubs — employees, shifts, leave and payroll (F-13, P2)."""

import uuid
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import local_date
from app.enums import Role
from app.models import Employee, Expense, Payroll, User
from app.security import utcnow

from .conftest import API, GOOD_PASSWORD, TEST_EMPLOYEE_PREFIX


def _token(client: TestClient, user: User) -> str:
    r = client.post(f"{API}/auth/login", json={"email": user.email, "password": GOOD_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def employee(client: TestClient, make_user):
    owner = _token(client, make_user(Role.OWNER))
    created = client.post(
        f"{API}/employees",
        json={
            "full_name": f"{TEST_EMPLOYEE_PREFIX} {uuid.uuid4().hex[:5]}",
            "title": "Coach",
            "monthly_salary_paise": 4500000,
        },
        headers=_auth(owner),
    )
    assert created.status_code == 201, created.text
    return created.json()


def test_employee_create_and_list(client: TestClient, make_user, employee) -> None:
    token = _token(client, make_user(Role.MANAGER))
    listed = client.get(f"{API}/employees", headers=_auth(token))
    assert listed.status_code == 200
    assert employee["id"] in [row["id"] for row in listed.json()]
    assert employee["monthly_salary_paise"] == 4500000


def test_shift_roster_is_a_monday_to_sunday_week(
    client: TestClient, make_user, employee
) -> None:
    owner = _token(client, make_user(Role.OWNER))
    monday = local_date(utcnow()) - timedelta(days=local_date(utcnow()).weekday())

    created = client.post(
        f"{API}/shifts",
        json={
            "employee_id": employee["id"],
            "shift_date": (monday + timedelta(days=2)).isoformat(),
            "start_time": "06:00:00",
            "end_time": "14:00:00",
            "area": "COURTS",
        },
        headers=_auth(owner),
    )
    assert created.status_code == 201, created.text

    this_week = client.get(
        f"{API}/shifts",
        params={"week": (monday + timedelta(days=5)).isoformat()},
        headers=_auth(owner),
    ).json()
    assert created.json()["id"] in [row["id"] for row in this_week]

    next_week = client.get(
        f"{API}/shifts",
        params={"week": (monday + timedelta(days=9)).isoformat()},
        headers=_auth(owner),
    ).json()
    assert created.json()["id"] not in [row["id"] for row in next_week]


def test_shift_must_end_after_it_starts(client: TestClient, make_user, employee) -> None:
    owner = _token(client, make_user(Role.OWNER))
    response = client.post(
        f"{API}/shifts",
        json={
            "employee_id": employee["id"],
            "shift_date": date.today().isoformat(),
            "start_time": "14:00:00",
            "end_time": "06:00:00",
            "area": "BAR",
        },
        headers=_auth(owner),
    )
    assert response.status_code == 422


def test_leave_request_then_decision(
    client: TestClient, make_user, employee, session: Session
) -> None:
    desk_user = make_user(Role.FRONT_DESK)
    session.get(Employee, employee["id"]).user_id = desk_user.id
    session.commit()

    desk = _token(client, desk_user)
    today = local_date(utcnow())
    created = client.post(
        f"{API}/leave-requests",
        json={
            "from_date": (today + timedelta(days=10)).isoformat(),
            "to_date": (today + timedelta(days=12)).isoformat(),
            "reason": "family wedding",
        },
        headers=_auth(desk),
    )
    assert created.status_code == 201, created.text
    assert created.json()["status"] == "PENDING"
    assert created.json()["employee_id"] == employee["id"]

    # The requester cannot approve their own leave.
    assert client.post(
        f"{API}/leave-requests/{created.json()['id']}/decide",
        json={"decision": "APPROVED"},
        headers=_auth(desk),
    ).status_code == 403

    manager = _token(client, make_user(Role.MANAGER))
    decided = client.post(
        f"{API}/leave-requests/{created.json()['id']}/decide",
        json={"decision": "APPROVED"},
        headers=_auth(manager),
    )
    assert decided.status_code == 200
    assert decided.json()["status"] == "APPROVED"
    assert decided.json()["decided_by"] is not None

    again = client.post(
        f"{API}/leave-requests/{created.json()['id']}/decide",
        json={"decision": "REJECTED"},
        headers=_auth(manager),
    )
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "ALREADY_DECIDED"


def test_staff_see_only_their_own_leave(
    client: TestClient, make_user, employee, session: Session
) -> None:
    owner = _token(client, make_user(Role.OWNER))
    client.post(
        f"{API}/leave-requests",
        json={
            "employee_id": employee["id"],
            "from_date": date.today().isoformat(),
            "to_date": date.today().isoformat(),
        },
        headers=_auth(owner),
    )

    unlinked = _token(client, make_user(Role.BAR_STAFF))
    assert client.get(f"{API}/leave-requests", headers=_auth(unlinked)).json() == []

    assert len(client.get(f"{API}/leave-requests", headers=_auth(owner)).json()) >= 1


def test_payroll_run_is_idempotent_and_pay_creates_an_expense(
    client: TestClient, make_user, employee, session: Session
) -> None:
    owner = _token(client, make_user(Role.OWNER))
    month = local_date(utcnow()).strftime("%Y-%m")

    first = client.post(f"{API}/payroll/run", json={"month": month}, headers=_auth(owner))
    assert first.status_code == 201, first.text
    row = next(r for r in first.json() if r["employee_id"] == employee["id"])
    assert row["base_paise"] == 4500000
    assert row["deductions_paise"] == 0
    assert row["net_paise"] == row["base_paise"] - row["deductions_paise"]
    assert row["status"] == "PENDING"

    second = client.post(f"{API}/payroll/run", json={"month": month}, headers=_auth(owner))
    assert second.status_code == 201
    assert employee["id"] not in [r["employee_id"] for r in second.json()]

    session.expire_all()
    assert session.execute(
        select(func.count(Payroll.id)).where(
            Payroll.month == month, Payroll.employee_id == employee["id"]
        )
    ).scalar_one() == 1

    payables_before = client.get(f"{API}/dashboard/summary", headers=_auth(owner)).json()[
        "payables"
    ]
    assert payables_before["pending_payroll_paise"] >= 4500000

    paid = client.post(f"{API}/payroll/{row['id']}/mark-paid", headers=_auth(owner))
    assert paid.status_code == 200
    assert paid.json()["status"] == "PAID"

    session.expire_all()
    expense = session.execute(
        select(Expense).where(
            Expense.category == "PAYROLL", Expense.amount_paise == 4500000
        ).order_by(Expense.id.desc()).limit(1)
    ).scalar_one()
    assert expense.status == "PAID"

    again = client.post(f"{API}/payroll/{row['id']}/mark-paid", headers=_auth(owner))
    assert again.status_code == 409


def test_bad_payroll_month_is_422(client: TestClient, make_user) -> None:
    owner = _token(client, make_user(Role.OWNER))
    assert client.post(
        f"{API}/payroll/run", json={"month": "2026-13"}, headers=_auth(owner)
    ).status_code == 422
    assert client.post(
        f"{API}/payroll/run", json={"month": "October"}, headers=_auth(owner)
    ).status_code == 422


@pytest.mark.parametrize("role", [Role.FRONT_DESK, Role.BAR_STAFF, Role.MEMBER])
def test_hr_admin_routes_are_closed(client: TestClient, make_user, role: Role) -> None:
    token = _token(client, make_user(role))
    assert client.get(f"{API}/employees", headers=_auth(token)).status_code == 403
    assert client.get(f"{API}/payroll", headers=_auth(token)).status_code == 403
    assert client.post(
        f"{API}/payroll/run", json={"month": "2026-01"}, headers=_auth(token)
    ).status_code == 403


def test_a_manager_runs_payroll_but_cannot_pay_it(
    client: TestClient, make_user, employee
) -> None:
    """SRS 3.1: MANAGER has W on payroll "(no payroll pay)"."""
    manager = _token(client, make_user(Role.MANAGER))
    ran = client.post(f"{API}/payroll/run", json={"month": "2026-01"}, headers=_auth(manager))
    assert ran.status_code == 201, ran.text

    row = next(r for r in ran.json() if r["employee_id"] == employee["id"])
    assert client.post(
        f"{API}/payroll/{row['id']}/mark-paid", headers=_auth(manager)
    ).status_code == 403
