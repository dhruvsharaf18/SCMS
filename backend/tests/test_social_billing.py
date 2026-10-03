"""Stage 8: social sessions, expenses, clients and invoices (F-04/F-11/F-12), including T-11."""

import os
import uuid
from datetime import datetime, time, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import CLUB_TZ, local_date
from app.enums import PlanCode, Role, Sport
from app.models import CourtSlot, Invoice, Member, Membership, Payment, Plan, User
from app.security import utcnow
from app.services import membership as membership_svc

from .conftest import API, GOOD_PASSWORD, TEST_PHONE_PREFIX, as_user, login_token, sign_in


def _token(client: TestClient, user: User) -> str:
    return login_token(client, user.email)


def _auth(token: str) -> dict[str, str]:
    return as_user(token)


def _slot(days_ahead: int, hour: int, minute: int = 0) -> str:
    day = local_date(utcnow()) + timedelta(days=days_ahead)
    moment = datetime.combine(day, time(hour, minute), tzinfo=CLUB_TZ).astimezone(timezone.utc)
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


@pytest.fixture
def make_member(session: Session):
    def _make(plan: PlanCode | None = PlanCode.SILVER) -> Member:
        member = Member(
            member_code=membership_svc.next_member_code(session),
            full_name=f"Social Tester {uuid.uuid4().hex[:4]}",
            phone=TEST_PHONE_PREFIX + uuid.uuid4().int.__str__()[:6],
        )
        session.add(member)
        session.commit()
        if plan is not None:
            plan_id = session.execute(
                select(Plan.id).where(Plan.code == plan.value)
            ).scalar_one()
            today = local_date(utcnow())
            session.add(
                Membership(
                    member_id=member.id,
                    plan_id=plan_id,
                    start_date=today - timedelta(days=1),
                    end_date=today + timedelta(days=60),
                )
            )
            session.commit()
        session.refresh(member)
        return member

    return _make


def _session_body(court_id: int, days_ahead: int, hour: int, **extra) -> dict:
    body = {
        "court_id": court_id,
        "title": "Saturday social",
        "start_at": _slot(days_ahead, hour),
        "end_at": _slot(days_ahead, hour + 1),
        "capacity": 4,
        "fee_paise": 20000,
    }
    body.update(extra)
    return body


# --------------------------------------------------------------------------- sessions


def test_creating_a_session_holds_the_slots(
    client: TestClient, make_user, make_court, session: Session
) -> None:
    token = _token(client, make_user(Role.MANAGER))
    court = make_court(Sport.TENNIS)

    created = client.post(
        f"{API}/social-sessions", json=_session_body(court.id, 3, 18), headers=_auth(token)
    )
    assert created.status_code == 201, created.text
    assert created.json()["joined_count"] == 0

    held = session.execute(
        select(func.count(CourtSlot.id)).where(
            CourtSlot.social_session_id == created.json()["id"]
        )
    ).scalar_one()
    assert held == 2  # a one-hour window is two 30-minute rows


def test_social_slots_block_bookings_and_show_as_social(
    client: TestClient, make_user, make_court
) -> None:
    manager = _token(client, make_user(Role.MANAGER))
    court = make_court(Sport.TENNIS)
    body = _session_body(court.id, 4, 19)
    client.post(f"{API}/social-sessions", json=body, headers=_auth(manager))

    desk = _token(client, make_user(Role.FRONT_DESK))
    blocked = client.post(
        f"{API}/bookings",
        json={
            "court_id": court.id,
            "start_at": body["start_at"],
            "guest_name": "Walk In",
            "guest_phone": "7000000020",
        },
        headers=_auth(desk),
    )
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "SLOT_TAKEN"

    day = body["start_at"][:10]
    grid = next(
        c
        for c in client.get(
            f"{API}/courts/availability", params={"date": day}, headers=_auth(desk)
        ).json()["courts"]
        if c["court_id"] == court.id
    )
    states = {s["start_at"]: s["state"] for s in grid["slots"]}
    assert states[body["start_at"]] == "SOCIAL"


def test_a_booking_blocks_a_social_session(client: TestClient, make_user, make_court) -> None:
    desk = _token(client, make_user(Role.FRONT_DESK))
    court = make_court(Sport.TENNIS)
    start = _slot(5, 20)
    client.post(
        f"{API}/bookings",
        json={
            "court_id": court.id,
            "start_at": start,
            "guest_name": "Walk In",
            "guest_phone": "7000000021",
        },
        headers=_auth(desk),
    )

    manager = _token(client, make_user(Role.MANAGER))
    clash = client.post(
        f"{API}/social-sessions", json=_session_body(court.id, 5, 20), headers=_auth(manager)
    )
    assert clash.status_code == 409
    assert clash.json()["error"]["code"] == "SLOTS_NOT_FREE"
    assert start in clash.json()["error"]["details"]["conflicts"]


# --------------------------------------------------------------------------- T-11


def test_t11_capacity_two_rejects_the_third_join(
    client: TestClient, make_user, make_court, make_member
) -> None:
    manager = _token(client, make_user(Role.MANAGER))
    court = make_court(Sport.PADEL)
    social = client.post(
        f"{API}/social-sessions",
        json=_session_body(court.id, 6, 17, capacity=2),
        headers=_auth(manager),
    ).json()

    desk = _token(client, make_user(Role.FRONT_DESK))
    results = []
    for _ in range(3):
        member = make_member()
        response = client.post(
            f"{API}/social-sessions/{social['id']}/join",
            json={"member_id": member.id},
            headers=_auth(desk),
        )
        results.append(response.status_code)

    assert results[:2] == [201, 201]
    assert results[2] == 409

    full = client.post(
        f"{API}/social-sessions/{social['id']}/join",
        json={"member_id": make_member().id},
        headers=_auth(desk),
    )
    assert full.json()["error"]["code"] == "SESSION_FULL"

    after = client.get(f"{API}/social-sessions/{social['id']}", headers=_auth(desk)).json()
    assert after["joined_count"] == 2


def test_joining_twice_is_409(client: TestClient, make_user, make_court, make_member) -> None:
    manager = _token(client, make_user(Role.MANAGER))
    court = make_court(Sport.TENNIS)
    social = client.post(
        f"{API}/social-sessions", json=_session_body(court.id, 7, 16), headers=_auth(manager)
    ).json()

    member = make_member()
    first = client.post(
        f"{API}/social-sessions/{social['id']}/join",
        json={"member_id": member.id},
        headers=_auth(manager),
    )
    assert first.status_code == 201

    again = client.post(
        f"{API}/social-sessions/{social['id']}/join",
        json={"member_id": member.id},
        headers=_auth(manager),
    )
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "ALREADY_JOINED"


def test_gold_plays_free_others_pay(
    client: TestClient, make_user, make_court, make_member, session: Session
) -> None:
    manager = _token(client, make_user(Role.MANAGER))
    court = make_court(Sport.TENNIS)
    social = client.post(
        f"{API}/social-sessions", json=_session_body(court.id, 8, 15), headers=_auth(manager)
    ).json()

    gold = make_member(PlanCode.GOLD)
    silver = make_member(PlanCode.SILVER)

    gold_join = client.post(
        f"{API}/social-sessions/{social['id']}/join",
        json={"member_id": gold.id},
        headers=_auth(manager),
    ).json()
    assert gold_join["fee_paise"] == 0

    silver_join = client.post(
        f"{API}/social-sessions/{social['id']}/join",
        json={"member_id": silver.id},
        headers=_auth(manager),
    ).json()
    assert silver_join["fee_paise"] == 20000

    paid = session.execute(
        select(func.count(Payment.id)).where(
            Payment.source_type == "SOCIAL", Payment.source_id == social["id"]
        )
    ).scalar_one()
    assert paid == 1  # only the Silver member generated a payment row


def test_leaving_refunds_the_fee(
    client: TestClient, make_user, make_court, make_member, session: Session
) -> None:
    manager = _token(client, make_user(Role.MANAGER))
    court = make_court(Sport.TENNIS)
    social = client.post(
        f"{API}/social-sessions", json=_session_body(court.id, 9, 14), headers=_auth(manager)
    ).json()
    member = make_member(PlanCode.SILVER)
    client.post(
        f"{API}/social-sessions/{social['id']}/join",
        json={"member_id": member.id},
        headers=_auth(manager),
    )

    left = client.post(
        f"{API}/social-sessions/{social['id']}/leave",
        json={"member_id": member.id},
        headers=_auth(manager),
    )
    assert left.status_code == 204

    session.expire_all()
    payment = session.execute(
        select(Payment).where(
            Payment.source_type == "SOCIAL",
            Payment.source_id == social["id"],
            Payment.member_id == member.id,
        )
    ).scalar_one()
    assert payment.status == "REFUNDED"
    assert (
        client.get(f"{API}/social-sessions/{social['id']}", headers=_auth(manager)).json()[
            "joined_count"
        ]
        == 0
    )


def test_cancelling_frees_slots_and_refunds(
    client: TestClient, make_user, make_court, make_member, session: Session
) -> None:
    manager = _token(client, make_user(Role.MANAGER))
    court = make_court(Sport.TENNIS)
    body = _session_body(court.id, 10, 13)
    social = client.post(f"{API}/social-sessions", json=body, headers=_auth(manager)).json()
    member = make_member(PlanCode.SILVER)
    client.post(
        f"{API}/social-sessions/{social['id']}/join",
        json={"member_id": member.id},
        headers=_auth(manager),
    )

    cancelled = client.delete(f"{API}/social-sessions/{social['id']}", headers=_auth(manager))
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "CANCELLED"

    session.expire_all()
    assert session.execute(
        select(func.count(CourtSlot.id)).where(CourtSlot.social_session_id == social["id"])
    ).scalar_one() == 0
    assert session.execute(
        select(Payment.status).where(
            Payment.source_type == "SOCIAL", Payment.source_id == social["id"]
        )
    ).scalar_one() == "REFUNDED"

    # The court is bookable again.
    desk = _token(client, make_user(Role.FRONT_DESK))
    assert client.post(
        f"{API}/bookings",
        json={
            "court_id": court.id,
            "start_at": body["start_at"],
            "guest_name": "Walk In",
            "guest_phone": "7000000022",
        },
        headers=_auth(desk),
    ).status_code == 201


def test_member_joins_itself_and_roster_is_staff_only(
    client: TestClient, make_user, make_court
) -> None:
    manager = _token(client, make_user(Role.MANAGER))
    court = make_court(Sport.TENNIS)
    social = client.post(
        f"{API}/social-sessions", json=_session_body(court.id, 11, 12, fee_paise=0),
        headers=_auth(manager),
    ).json()

    login = sign_in(client, "member1@club.test", os.environ.get("SEED_PASSWORD", "Club@12345"))

    joined = client.post(
        f"{API}/social-sessions/{social['id']}/join",
        json={"member_id": 99999},  # ignored: the token decides
        headers=_auth(login["token"]),
    )
    assert joined.status_code == 201
    assert joined.json()["member_id"] == login["user"]["member_id"]

    blocked = client.get(
        f"{API}/social-sessions/{social['id']}/participants",
        headers=_auth(login["token"]),
    )
    assert blocked.status_code == 403


def test_only_managers_create_sessions(client: TestClient, make_user, make_court) -> None:
    desk = _token(client, make_user(Role.FRONT_DESK))
    court = make_court(Sport.TENNIS)
    response = client.post(
        f"{API}/social-sessions", json=_session_body(court.id, 12, 11), headers=_auth(desk)
    )
    assert response.status_code == 403


# -------------------------------------------------------------------------- expenses


def test_expense_lifecycle_feeds_payables(
    client: TestClient, make_user, session: Session
) -> None:
    token = _token(client, make_user(Role.MANAGER))
    before = client.get(f"{API}/dashboard/summary", headers=_auth(token)).json()["payables"]

    created = client.post(
        f"{API}/expenses",
        json={"category": "UTILITIES", "vendor": "State Power", "amount_paise": 120000},
        headers=_auth(token),
    )
    assert created.status_code == 201, created.text
    assert created.json()["status"] == "UNPAID"

    after = client.get(f"{API}/dashboard/summary", headers=_auth(token)).json()["payables"]
    assert after["unpaid_expenses_paise"] == before["unpaid_expenses_paise"] + 120000

    paid = client.post(f"{API}/expenses/{created.json()['id']}/mark-paid", headers=_auth(token))
    assert paid.status_code == 200
    assert paid.json()["status"] == "PAID"
    assert paid.json()["paid_at"] is not None

    settled = client.get(f"{API}/dashboard/summary", headers=_auth(token)).json()["payables"]
    assert settled["unpaid_expenses_paise"] == before["unpaid_expenses_paise"]

    # An expense is money out, so it must never appear in the revenue ledger.
    assert session.execute(
        select(func.count(Payment.id)).where(Payment.source_id == created.json()["id"],
                                             Payment.source_type == "INVOICE")
    ).scalar_one() == 0

    again = client.post(f"{API}/expenses/{created.json()['id']}/mark-paid", headers=_auth(token))
    assert again.status_code == 409


def test_front_desk_cannot_see_expenses(client: TestClient, make_user) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    assert client.get(f"{API}/expenses", headers=_auth(token)).status_code == 403


# ----------------------------------------------------------------- clients & invoices


def _client_row(client: TestClient, token: str) -> dict:
    return client.post(
        f"{API}/clients",
        json={"company_name": f"ZZTEST Corp {uuid.uuid4().hex[:5]}", "email": "ap@test.local"},
        headers=_auth(token),
    ).json()


def test_invoice_numbering_and_totals(client: TestClient, make_user, session: Session) -> None:
    token = _token(client, make_user(Role.OWNER))
    corporate = _client_row(client, token)

    created = client.post(
        f"{API}/invoices",
        json={
            "kind": "CORPORATE",
            "client_id": corporate["id"],
            "lines": [
                {"description": "Court hire", "qty": 4, "unit_price_paise": 60000},
                {"description": "Coaching", "qty": 1, "unit_price_paise": 100000},
            ],
        },
        headers=_auth(token),
    )
    assert created.status_code == 201, created.text
    body = created.json()

    year = local_date(utcnow()).year
    assert body["number"].startswith(f"INV-{year}-")
    assert len(body["number"].rsplit("-", 1)[1]) == 4
    assert body["status"] == "DRAFT"
    assert body["subtotal_paise"] == 340000
    assert body["total_paise"] == 340000
    assert body["tax_paise"] == 51864  # (340000*18 + 59) // 118
    assert len(body["lines"]) == 2

    second = client.post(
        f"{API}/invoices",
        json={
            "kind": "CORPORATE",
            "client_id": corporate["id"],
            "lines": [{"description": "Court hire", "qty": 1, "unit_price_paise": 1000}],
        },
        headers=_auth(token),
    ).json()
    assert int(second["number"].rsplit("-", 1)[1]) == int(body["number"].rsplit("-", 1)[1]) + 1


def test_mark_paid_creates_exactly_one_payment(
    client: TestClient, make_user, session: Session
) -> None:
    token = _token(client, make_user(Role.OWNER))
    corporate = _client_row(client, token)
    invoice = client.post(
        f"{API}/invoices",
        json={
            "kind": "CORPORATE",
            "client_id": corporate["id"],
            "lines": [{"description": "Court hire", "qty": 1, "unit_price_paise": 250000}],
        },
        headers=_auth(token),
    ).json()

    client.post(f"{API}/invoices/{invoice['id']}/status", json={"status": "SENT"}, headers=_auth(token))

    receivable = client.get(f"{API}/dashboard/summary", headers=_auth(token)).json()["receivables"]
    assert receivable["unpaid_invoices_paise"] >= 250000

    paid = client.post(
        f"{API}/invoices/{invoice['id']}/mark-paid", json={"method": "UPI"}, headers=_auth(token)
    )
    assert paid.status_code == 200
    assert paid.json()["status"] == "PAID"

    session.expire_all()
    payments = session.execute(
        select(func.count(Payment.id)).where(
            Payment.source_type == "INVOICE", Payment.source_id == invoice["id"]
        )
    ).scalar_one()
    assert payments == 1

    again = client.post(
        f"{API}/invoices/{invoice['id']}/mark-paid", json={"method": "UPI"}, headers=_auth(token)
    )
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "ALREADY_PAID"

    session.expire_all()
    assert session.execute(
        select(func.count(Payment.id)).where(
            Payment.source_type == "INVOICE", Payment.source_id == invoice["id"]
        )
    ).scalar_one() == 1


def test_invoice_must_bill_exactly_one_party(client: TestClient, make_user, make_member) -> None:
    token = _token(client, make_user(Role.OWNER))
    neither = client.post(
        f"{API}/invoices",
        json={"kind": "MEMBERSHIP", "lines": [{"description": "x", "qty": 1, "unit_price_paise": 1}]},
        headers=_auth(token),
    )
    assert neither.status_code == 422

    corporate = _client_row(client, token)
    both = client.post(
        f"{API}/invoices",
        json={
            "kind": "MEMBERSHIP",
            "client_id": corporate["id"],
            "member_id": make_member().id,
            "lines": [{"description": "x", "qty": 1, "unit_price_paise": 1}],
        },
        headers=_auth(token),
    )
    assert both.status_code == 422


def test_invoice_print_escapes_user_text(client: TestClient, make_user) -> None:
    token = _token(client, make_user(Role.OWNER))
    corporate = client.post(
        f"{API}/clients",
        json={"company_name": "ZZTEST <script>alert(1)</script>"},
        headers=_auth(token),
    ).json()
    invoice = client.post(
        f"{API}/invoices",
        json={
            "kind": "CORPORATE",
            "client_id": corporate["id"],
            "lines": [{"description": "<img src=x onerror=alert(1)>", "qty": 1, "unit_price_paise": 100}],
        },
        headers=_auth(token),
    ).json()

    page = client.get(f"{API}/invoices/{invoice['id']}/print", headers=_auth(token))
    assert page.status_code == 200
    assert page.headers["content-type"].startswith("text/html")
    assert "<script>" not in page.text
    assert "<img" not in page.text
    assert "&lt;script&gt;" in page.text
    assert "&lt;img src=x onerror=alert(1)&gt;" in page.text  # inert text, not markup


def test_paid_invoice_cannot_be_voided(client: TestClient, make_user) -> None:
    token = _token(client, make_user(Role.OWNER))
    corporate = _client_row(client, token)
    invoice = client.post(
        f"{API}/invoices",
        json={
            "kind": "CORPORATE",
            "client_id": corporate["id"],
            "lines": [{"description": "x", "qty": 1, "unit_price_paise": 5000}],
        },
        headers=_auth(token),
    ).json()
    client.post(
        f"{API}/invoices/{invoice['id']}/mark-paid", json={"method": "CASH"}, headers=_auth(token)
    )

    voided = client.post(
        f"{API}/invoices/{invoice['id']}/status", json={"status": "VOID"}, headers=_auth(token)
    )
    assert voided.status_code == 409


def test_front_desk_reads_invoices_but_cannot_write_them(
    client: TestClient, make_user
) -> None:
    """SRS 3.1 gives FRONT_DESK R on invoices and clients, and nothing more."""
    token = _token(client, make_user(Role.FRONT_DESK))
    assert client.get(f"{API}/invoices", headers=_auth(token)).status_code == 200
    assert client.get(f"{API}/clients", headers=_auth(token)).status_code == 200
    assert client.post(
        f"{API}/clients", json={"company_name": "ZZTEST Nope"}, headers=_auth(token)
    ).status_code == 403

    bar = _token(client, make_user(Role.BAR_STAFF))
    assert client.get(f"{API}/invoices", headers=_auth(bar)).status_code == 403
