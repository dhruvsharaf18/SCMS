"""Stage 5: menu, tables, bar orders, tabs and the daily report (F-07), including T-12."""

import uuid
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import local_date
from app.enums import PlanCode, Role
from app.models import BarOrder, Member, Membership, MenuItem, Payment, Plan, User
from app.security import utcnow
from app.services import membership as membership_svc

from .conftest import API, GOOD_PASSWORD, TEST_MENU_PREFIX, TEST_PHONE_PREFIX, TEST_TABLE_PREFIX


def _token(client: TestClient, user: User) -> str:
    r = client.post(f"{API}/auth/login", json={"email": user.email, "password": GOOD_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def make_menu_item(session: Session):
    def _make(price_paise: int = 20000) -> MenuItem:
        item = MenuItem(
            name=f"{TEST_MENU_PREFIX}{uuid.uuid4().hex[:6]}",
            category="DRINK",
            price_paise=price_paise,
        )
        session.add(item)
        session.commit()
        session.refresh(item)
        return item

    return _make


@pytest.fixture
def silver_member(session: Session) -> Member:
    member = Member(
        member_code=membership_svc.next_member_code(session),
        full_name="Bar Tester",
        phone=TEST_PHONE_PREFIX + uuid.uuid4().int.__str__()[:6],
    )
    session.add(member)
    session.commit()
    plan_id = session.execute(
        select(Plan.id).where(Plan.code == PlanCode.SILVER.value)
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


def _order(client: TestClient, token: str, item_id: int, qty: int = 1, **extra) -> dict:
    response = client.post(
        f"{API}/bar/orders",
        json={"items": [{"menu_item_id": item_id, "qty": qty}], **extra},
        headers=_auth(token),
    )
    assert response.status_code == 201, response.text
    return response.json()


# ----------------------------------------------------------------------------- orders


def test_new_order_starts_in_the_kitchen_unpaid(client: TestClient, make_user, make_menu_item):
    token = _token(client, make_user(Role.BAR_STAFF))
    item = make_menu_item(price_paise=15000)
    order = _order(client, token, item.id, qty=2, guest_name="Table guest")

    assert order["kitchen_status"] == "NEW"
    assert order["payment_status"] == "UNPAID"
    assert order["subtotal_paise"] == 30000
    assert order["discount_paise"] == 0
    assert order["total_paise"] == 30000
    assert order["tax_paise"] == 1429  # (30000*5 + 52) // 105, bar rate is 5%
    assert order["items"][0]["qty"] == 2


def test_member_bar_discount_comes_from_the_plan(
    client: TestClient, make_user, make_menu_item, silver_member
):
    token = _token(client, make_user(Role.BAR_STAFF))
    item = make_menu_item(price_paise=100000)
    order = _order(client, token, item.id, member_id=silver_member.id)

    assert order["subtotal_paise"] == 100000
    assert order["discount_paise"] == 5000  # SILVER bar_discount_pct = 5
    assert order["total_paise"] == 95000


def test_adding_items_retotals(client: TestClient, make_user, make_menu_item):
    token = _token(client, make_user(Role.BAR_STAFF))
    item = make_menu_item(price_paise=10000)
    order = _order(client, token, item.id)

    added = client.post(
        f"{API}/bar/orders/{order['id']}/items",
        json={"items": [{"menu_item_id": item.id, "qty": 3, "note": "no ice"}]},
        headers=_auth(token),
    )
    assert added.status_code == 200, added.text
    assert added.json()["total_paise"] == 40000
    assert len(added.json()["items"]) == 2


def test_cannot_add_items_to_a_paid_order(client: TestClient, make_user, make_menu_item):
    token = _token(client, make_user(Role.BAR_STAFF))
    item = make_menu_item()
    order = _order(client, token, item.id)
    client.post(f"{API}/bar/orders/{order['id']}/pay", json={"method": "CASH"}, headers=_auth(token))

    blocked = client.post(
        f"{API}/bar/orders/{order['id']}/items",
        json={"items": [{"menu_item_id": item.id, "qty": 1}]},
        headers=_auth(token),
    )
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "ORDER_ALREADY_PAID"


# -------------------------------------------------------------------- kitchen statuses


def test_kitchen_moves_forward_only(client: TestClient, make_user, make_menu_item):
    token = _token(client, make_user(Role.BAR_STAFF))
    item = make_menu_item()
    order = _order(client, token, item.id)

    for nxt in ("PREPARING", "READY", "SERVED"):
        moved = client.post(
            f"{API}/bar/orders/{order['id']}/kitchen-status",
            json={"status": nxt},
            headers=_auth(token),
        )
        assert moved.status_code == 200, moved.text
        assert moved.json()["kitchen_status"] == nxt

    back = client.post(
        f"{API}/bar/orders/{order['id']}/kitchen-status",
        json={"status": "NEW"},
        headers=_auth(token),
    )
    assert back.status_code == 409
    assert back.json()["error"]["code"] == "INVALID_TRANSITION"


def test_kitchen_may_skip_forward_but_not_repeat(client: TestClient, make_user, make_menu_item):
    token = _token(client, make_user(Role.BAR_STAFF))
    item = make_menu_item()
    order = _order(client, token, item.id)

    skipped = client.post(
        f"{API}/bar/orders/{order['id']}/kitchen-status",
        json={"status": "READY"},
        headers=_auth(token),
    )
    assert skipped.status_code == 200

    repeat = client.post(
        f"{API}/bar/orders/{order['id']}/kitchen-status",
        json={"status": "READY"},
        headers=_auth(token),
    )
    assert repeat.status_code == 409


def test_served_order_cannot_be_cancelled(client: TestClient, make_user, make_menu_item):
    token = _token(client, make_user(Role.BAR_STAFF))
    item = make_menu_item()
    order = _order(client, token, item.id)
    client.post(
        f"{API}/bar/orders/{order['id']}/kitchen-status",
        json={"status": "SERVED"},
        headers=_auth(token),
    )
    blocked = client.post(
        f"{API}/bar/orders/{order['id']}/kitchen-status",
        json={"status": "CANCELLED"},
        headers=_auth(token),
    )
    assert blocked.status_code == 409


# --------------------------------------------------------------------------- payment


def test_pay_once_then_409(client: TestClient, make_user, make_menu_item, session: Session):
    user = make_user(Role.BAR_STAFF)
    token = _token(client, user)
    item = make_menu_item(price_paise=25000)
    order = _order(client, token, item.id)

    paid = client.post(
        f"{API}/bar/orders/{order['id']}/pay", json={"method": "UPI"}, headers=_auth(token)
    )
    assert paid.status_code == 200
    assert paid.json()["payment_status"] == "PAID"
    assert paid.json()["paid_at"] is not None

    again = client.post(
        f"{API}/bar/orders/{order['id']}/pay", json={"method": "UPI"}, headers=_auth(token)
    )
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "ORDER_ALREADY_PAID"

    rows = session.execute(
        select(func.count(Payment.id)).where(
            Payment.source_type == "BAR_ORDER", Payment.source_id == order["id"]
        )
    ).scalar_one()
    assert rows == 1  # exactly one payment row


# ------------------------------------------------------------------------------ tabs


def test_guest_cannot_open_a_tab(client: TestClient, make_user, make_menu_item):
    token = _token(client, make_user(Role.BAR_STAFF))
    item = make_menu_item()
    order = _order(client, token, item.id, guest_name="Just a guest")

    response = client.post(f"{API}/bar/orders/{order['id']}/tab", headers=_auth(token))
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "MEMBER_REQUIRED_FOR_TAB"


def test_tab_stays_unpaid_until_settled(
    client: TestClient, make_user, make_menu_item, silver_member
):
    token = _token(client, make_user(Role.BAR_STAFF))
    item = make_menu_item(price_paise=20000)
    order = _order(client, token, item.id, member_id=silver_member.id)

    tabbed = client.post(f"{API}/bar/orders/{order['id']}/tab", headers=_auth(token))
    assert tabbed.status_code == 200
    assert tabbed.json()["is_tab"] is True
    assert tabbed.json()["payment_status"] == "UNPAID"

    settled = client.post(
        f"{API}/bar/tabs/settle",
        json={"member_id": silver_member.id, "order_ids": [order["id"]], "method": "CARD"},
        headers=_auth(token),
    )
    assert settled.status_code == 200, settled.text
    assert settled.json()[0]["payment_status"] == "PAID"


def test_t12_settle_is_atomic(
    client: TestClient, make_user, make_menu_item, silver_member, session: Session
):
    """One bad order id in the list and not a single payment row is written."""
    token = _token(client, make_user(Role.BAR_STAFF))
    item = make_menu_item(price_paise=30000)

    good = [
        _order(client, token, item.id, member_id=silver_member.id)["id"] for _ in range(3)
    ]
    for order_id in good:
        client.post(f"{API}/bar/orders/{order_id}/tab", headers=_auth(token))

    other_member_order = _order(client, token, item.id, guest_name="Someone else")["id"]

    response = client.post(
        f"{API}/bar/tabs/settle",
        json={
            "member_id": silver_member.id,
            "order_ids": [*good, other_member_order],
            "method": "CASH",
        },
        headers=_auth(token),
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"

    session.expire_all()
    written = session.execute(
        select(func.count(Payment.id)).where(
            Payment.source_type == "BAR_ORDER",
            Payment.source_id.in_([*good, other_member_order]),
        )
    ).scalar_one()
    assert written == 0  # nothing paid

    still_unpaid = session.execute(
        select(func.count(BarOrder.id)).where(
            BarOrder.id.in_(good), BarOrder.payment_status == "UNPAID"
        )
    ).scalar_one()
    assert still_unpaid == 3

    # The same call without the bad id settles everything in one go.
    ok = client.post(
        f"{API}/bar/tabs/settle",
        json={"member_id": silver_member.id, "order_ids": good, "method": "CASH"},
        headers=_auth(token),
    )
    assert ok.status_code == 200
    assert {o["payment_status"] for o in ok.json()} == {"PAID"}

    session.expire_all()
    assert session.execute(
        select(func.count(Payment.id)).where(
            Payment.source_type == "BAR_ORDER", Payment.source_id.in_(good)
        )
    ).scalar_one() == 3


def test_settling_an_already_paid_order_pays_nothing(
    client: TestClient, make_user, make_menu_item, silver_member, session: Session
):
    token = _token(client, make_user(Role.BAR_STAFF))
    item = make_menu_item(price_paise=10000)
    paid = _order(client, token, item.id, member_id=silver_member.id)["id"]
    unpaid = _order(client, token, item.id, member_id=silver_member.id)["id"]
    client.post(f"{API}/bar/orders/{paid}/pay", json={"method": "CASH"}, headers=_auth(token))

    response = client.post(
        f"{API}/bar/tabs/settle",
        json={"member_id": silver_member.id, "order_ids": [paid, unpaid], "method": "CASH"},
        headers=_auth(token),
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "ORDER_ALREADY_PAID"

    session.expire_all()
    assert session.get(BarOrder, unpaid).payment_status == "UNPAID"


# ---------------------------------------------------------------------------- tables


def test_tables_show_running_totals(client: TestClient, make_user, make_menu_item, session: Session):
    admin = _token(client, make_user(Role.MANAGER))
    created = client.post(
        f"{API}/bar/tables",
        json={"label": f"{TEST_TABLE_PREFIX}{uuid.uuid4().hex[:5]}", "seats": 4},
        headers=_auth(admin),
    )
    assert created.status_code == 201, created.text
    table_id = created.json()["id"]
    assert created.json()["open_total_paise"] is None

    bar = _token(client, make_user(Role.BAR_STAFF))
    item = make_menu_item(price_paise=12000)
    _order(client, bar, item.id, qty=2, table_id=table_id, guest_name="Guest")

    row = next(t for t in client.get(f"{API}/bar/tables", headers=_auth(bar)).json() if t["id"] == table_id)
    assert row["open_orders"] == 1
    assert row["open_total_paise"] == 24000


def test_paid_orders_leave_the_table_total(client: TestClient, make_user, make_menu_item):
    admin = _token(client, make_user(Role.MANAGER))
    table_id = client.post(
        f"{API}/bar/tables",
        json={"label": f"{TEST_TABLE_PREFIX}{uuid.uuid4().hex[:5]}"},
        headers=_auth(admin),
    ).json()["id"]

    bar = _token(client, make_user(Role.BAR_STAFF))
    item = make_menu_item(price_paise=5000)
    order = _order(client, bar, item.id, table_id=table_id, guest_name="Guest")
    client.post(f"{API}/bar/orders/{order['id']}/pay", json={"method": "CASH"}, headers=_auth(bar))

    row = next(t for t in client.get(f"{API}/bar/tables", headers=_auth(bar)).json() if t["id"] == table_id)
    assert row["open_total_paise"] is None


# ---------------------------------------------------------------------- daily report


def test_daily_report_equals_the_days_bar_payments(
    client: TestClient, make_user, make_menu_item, session: Session
):
    staff = make_user(Role.BAR_STAFF)
    token = _token(client, staff)
    item = make_menu_item(price_paise=11000)

    for method in ("CASH", "CARD", "UPI"):
        order = _order(client, token, item.id)
        client.post(
            f"{API}/bar/orders/{order['id']}/pay", json={"method": method}, headers=_auth(token)
        )

    today = local_date(utcnow()).isoformat()
    report = client.get(f"{API}/bar/reports/daily", params={"date": today}, headers=_auth(token))
    assert report.status_code == 200, report.text
    body = report.json()

    # BAR_STAFF see only their own take, so this equals exactly what this user just rang up.
    assert body["orders"] == 3
    assert body["revenue_paise"] == 33000
    assert body["by_method"] == {"CASH": 11000, "CARD": 11000, "UPI": 11000}
    assert body["by_staff"] == [
        {"user_id": staff.id, "name": staff.full_name, "revenue_paise": 33000}
    ]
    assert body["tax_paise"] == 3 * 524  # (11000*5 + 52) // 105

    ledger = session.execute(
        select(func.coalesce(func.sum(Payment.amount_paise), 0)).where(
            Payment.source_type == "BAR_ORDER",
            Payment.status == "COMPLETED",
            Payment.received_by == staff.id,
        )
    ).scalar_one()
    assert int(ledger) == body["revenue_paise"]


def test_manager_report_covers_the_whole_bar(client: TestClient, make_user, make_menu_item):
    staff = make_user(Role.BAR_STAFF)
    token = _token(client, staff)
    item = make_menu_item(price_paise=7000)
    order = _order(client, token, item.id)
    client.post(f"{API}/bar/orders/{order['id']}/pay", json={"method": "CASH"}, headers=_auth(token))

    today = local_date(utcnow()).isoformat()
    manager = _token(client, make_user(Role.MANAGER))
    body = client.get(
        f"{API}/bar/reports/daily", params={"date": today}, headers=_auth(manager)
    ).json()

    assert body["revenue_paise"] >= 7000
    assert staff.id in [row["user_id"] for row in body["by_staff"]]


def test_outstanding_tabs_are_reported(
    client: TestClient, make_user, make_menu_item, silver_member
):
    token = _token(client, make_user(Role.BAR_STAFF))
    item = make_menu_item(price_paise=40000)
    order = _order(client, token, item.id, member_id=silver_member.id)
    client.post(f"{API}/bar/orders/{order['id']}/tab", headers=_auth(token))

    today = local_date(utcnow()).isoformat()
    body = client.get(
        f"{API}/bar/reports/daily", params={"date": today}, headers=_auth(token)
    ).json()
    assert body["outstanding_tabs_paise"] >= 38000  # 40000 less the 5% member discount


# ------------------------------------------------------------------------------ RBAC


def test_front_desk_cannot_take_bar_orders(client: TestClient, make_user, make_menu_item):
    token = _token(client, make_user(Role.FRONT_DESK))
    item = make_menu_item()
    response = client.post(
        f"{API}/bar/orders",
        json={"guest_name": "Guest", "items": [{"menu_item_id": item.id, "qty": 1}]},
        headers=_auth(token),
    )
    assert response.status_code == 403


def test_bar_staff_cannot_edit_the_menu(client: TestClient, make_user, make_menu_item):
    token = _token(client, make_user(Role.BAR_STAFF))
    item = make_menu_item()
    response = client.patch(
        f"{API}/menu-items/{item.id}", json={"price_paise": 1}, headers=_auth(token)
    )
    assert response.status_code == 403


def test_members_cannot_read_bar_orders(client: TestClient, make_user, make_menu_item):
    import os

    bar = _token(client, make_user(Role.BAR_STAFF))
    item = make_menu_item()
    other = _order(client, bar, item.id, guest_name="Not you")["id"]

    member_token = client.post(
        f"{API}/auth/login",
        json={
            "email": "member1@club.test",
            "password": os.environ.get("SEED_PASSWORD", "Club@12345"),
        },
    ).json()["access_token"]

    # SRS 3.1 gives MEMBER no access to bar orders at all.
    assert client.get(f"{API}/bar/orders/{other}", headers=_auth(member_token)).status_code == 403
