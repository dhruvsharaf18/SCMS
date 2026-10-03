"""Stage 2: plans, court prices, members (F-02)."""

import uuid
from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import local_date
from app.enums import MemberStatus, PlanCode, Role
from app.models import Member, Plan, User
from app.security import utcnow

from .conftest import API, GOOD_PASSWORD, TEST_PHONE_PREFIX, as_user, login_token, sign_in


def _token(client: TestClient, user: User) -> str:
    return login_token(client, user.email)


def _auth(token: str) -> dict[str, str]:
    return as_user(token)


def _phone() -> str:
    return TEST_PHONE_PREFIX + uuid.uuid4().int.__str__()[:6]


def _plan_id(session: Session, code: PlanCode) -> int:
    return session.execute(select(Plan.id).where(Plan.code == code.value)).scalar_one()


def test_plans_and_court_prices_are_public(client: TestClient) -> None:
    plans = client.get(f"{API}/plans")
    assert plans.status_code == 200
    assert {p["code"] for p in plans.json()} == {"GOLD", "SILVER", "JUNIOR"}

    prices = client.get(f"{API}/court-prices")
    assert prices.status_code == 200
    assert len(prices.json()) == 16


def test_junior_plan_rejects_an_adult(client: TestClient, make_user, session: Session) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    adult_dob = (date.today() - timedelta(days=365 * 25)).isoformat()
    response = client.post(
        f"{API}/members",
        json={
            "full_name": "Adult Junior",
            "phone": _phone(),
            "dob": adult_dob,
            "plan_id": _plan_id(session, PlanCode.JUNIOR),
        },
        headers=_auth(token),
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "JUNIOR_AGE_INVALID"


def test_duplicate_phone_is_409(client: TestClient, make_user, session: Session) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    phone = _phone()
    body = {"full_name": "First Person", "phone": phone}

    first = client.post(f"{API}/members", json=body, headers=_auth(token))
    assert first.status_code == 201, first.text
    assert first.json()["member_code"].startswith("CC-")

    second = client.post(
        f"{API}/members", json={"full_name": "Second", "phone": phone}, headers=_auth(token)
    )
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "PHONE_EXISTS"


def test_member_create_with_plan_records_one_membership_payment(
    client: TestClient, make_user, session: Session
) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    response = client.post(
        f"{API}/members",
        json={
            "full_name": "Paying Member",
            "phone": _phone(),
            "plan_id": _plan_id(session, PlanCode.SILVER),
            "payment_method": "UPI",
        },
        headers=_auth(token),
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["membership"]["plan_code"] == "SILVER"
    assert body["payment_id"] is not None

    from app.models import Payment

    payment = session.get(Payment, body["payment_id"])
    assert payment.source_type == "MEMBERSHIP"
    assert payment.amount_paise == 150000
    assert payment.tax_paise == 22881  # (150000*18 + 59) // 118


def test_status_boundaries_at_plus_seven_and_plus_eight() -> None:
    from app.services.membership import member_status

    today = date(2026, 10, 3)
    assert member_status(today + timedelta(days=8), today) == MemberStatus.ACTIVE
    assert member_status(today + timedelta(days=7), today) == MemberStatus.EXPIRING
    assert member_status(today, today) == MemberStatus.EXPIRING
    assert member_status(today - timedelta(days=1), today) == MemberStatus.EXPIRED
    assert member_status(None, today) == MemberStatus.NONE


def test_member_cannot_read_another_member(client: TestClient, session: Session) -> None:
    """T-08 part: IDOR returns 404, not 403."""
    member_user = session.execute(
        select(User).where(User.email == "member1@club.test")
    ).scalar_one()
    own_id = session.execute(
        select(Member.id).where(Member.user_id == member_user.id)
    ).scalar_one()
    other_id = session.execute(
        select(Member.id).where(Member.user_id.is_(None)).limit(1)
    ).scalar_one()

    import os

    token = login_token(
        client, "member1@club.test", os.environ.get("SEED_PASSWORD", "Club@12345")
    )

    assert client.get(f"{API}/members/{own_id}", headers=_auth(token)).status_code == 200
    blocked = client.get(f"{API}/members/{other_id}", headers=_auth(token))
    assert blocked.status_code == 404
    assert blocked.json()["error"]["code"] == "NOT_FOUND"

    blocked_history = client.get(f"{API}/members/{other_id}/history", headers=_auth(token))
    assert blocked_history.status_code == 404


def test_login_returns_real_member_id_for_members(client: TestClient, session: Session) -> None:
    import os

    body = sign_in(client, "member1@club.test", os.environ.get("SEED_PASSWORD", "Club@12345"))
    expected = session.execute(
        select(Member.id).join(User, User.id == Member.user_id).where(
            User.email == "member1@club.test"
        )
    ).scalar_one()
    assert body["user"]["member_id"] == expected

    me = client.get(f"{API}/auth/me", headers=_auth(body["token"]))
    assert me.json()["member_id"] == expected


def test_staff_login_has_no_member_id(client: TestClient, make_user) -> None:
    user = make_user(Role.FRONT_DESK)
    body = sign_in(client, user.email, GOOD_PASSWORD)
    assert body["user"]["member_id"] is None


def test_search_by_code_and_phone(client: TestClient, make_user) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    by_code = client.get(f"{API}/members/by-code/CC-000001", headers=_auth(token))
    assert by_code.status_code == 200
    assert by_code.json()["member_code"] == "CC-000001"

    found = client.get(f"{API}/members", params={"q": "CC-000002"}, headers=_auth(token))
    assert found.status_code == 200
    assert found.json()["total"] == 1
    assert set(found.json()) == {"items", "total", "page", "page_size"}


def test_bar_staff_sees_only_name_plan_code(client: TestClient, make_user) -> None:
    token = _token(client, make_user(Role.BAR_STAFF))
    response = client.get(f"{API}/members/1", headers=_auth(token))
    assert response.status_code == 200
    assert set(response.json()) == {"id", "member_code", "full_name", "plan_code"}


def test_expiring_list_and_idempotent_notifications(
    client: TestClient, make_user, session: Session
) -> None:
    token = _token(client, make_user(Role.MANAGER))
    first = client.get(f"{API}/members/expiring", params={"days": 7}, headers=_auth(token))
    assert first.status_code == 200
    assert first.json()["total"] >= 5

    from app.models import Notification

    def count() -> int:
        return len(
            list(
                session.execute(
                    select(Notification.id).where(Notification.type == "MEMBERSHIP_EXPIRING")
                ).scalars()
            )
        )

    after_first = count()
    client.get(f"{API}/members/expiring", params={"days": 7}, headers=_auth(token))
    session.expire_all()
    assert count() == after_first


def test_renew_extends_membership(client: TestClient, make_user, session: Session) -> None:
    token = _token(client, make_user(Role.MANAGER))
    created = client.post(
        f"{API}/members",
        json={"full_name": "Renewer", "phone": _phone()},
        headers=_auth(token),
    )
    member_id = created.json()["id"]

    renewed = client.post(
        f"{API}/members/{member_id}/renew",
        json={"plan_id": _plan_id(session, PlanCode.GOLD), "payment_method": "CASH"},
        headers=_auth(token),
    )
    assert renewed.status_code == 200, renewed.text
    body = renewed.json()
    assert body["membership"]["plan_code"] == "GOLD"
    assert body["payment_id"] is not None

    today = local_date(utcnow())
    assert date.fromisoformat(body["membership"]["end_date"]) == today + timedelta(days=30)


def test_court_price_update_is_audited(client: TestClient, make_user, session: Session) -> None:
    token = _token(client, make_user(Role.OWNER))
    current = client.get(f"{API}/court-prices").json()
    original = next(p for p in current if p["sport"] == "TENNIS" and p["tier"] == "SILVER")

    response = client.put(
        f"{API}/court-prices",
        json=[{"sport": "TENNIS", "tier": "SILVER", "price_per_hour_paise": 41000}],
        headers=_auth(token),
    )
    assert response.status_code == 200

    from app.models import AuditLog

    actions = list(
        session.execute(
            select(AuditLog.action).where(AuditLog.action == "COURT_PRICES_UPDATED")
        ).scalars()
    )
    assert actions

    client.put(
        f"{API}/court-prices",
        json=[{"sport": "TENNIS", "tier": "SILVER",
               "price_per_hour_paise": original["price_per_hour_paise"]}],
        headers=_auth(token),
    )


def test_member_cannot_create_members(client: TestClient, make_user) -> None:
    token = _token(client, make_user(Role.MEMBER))
    response = client.post(
        f"{API}/members", json={"full_name": "Nope", "phone": _phone()}, headers=_auth(token)
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"
