"""Stage 6: payments ledger, refunds and the dashboard (F-10), including T-10."""

import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import local_date
from app.enums import Role
from app.models import AuditLog, Booking, MenuItem, Payment, Product, User
from app.security import utcnow
from app.services import reports as svc

from .conftest import (
    API,
    GOOD_PASSWORD,
    TEST_MENU_PREFIX,
    TEST_SKU_PREFIX,
    as_user,
    login_token,
    sign_in,
)


def _token(client: TestClient, user: User) -> str:
    return login_token(client, user.email)


def _auth(token: str) -> dict[str, str]:
    return as_user(token)


@pytest.fixture
def product(session: Session) -> Product:
    row = Product(
        sku=f"{TEST_SKU_PREFIX}{uuid.uuid4().hex[:10].upper()}",
        name="Payments Test Ball",
        category="BALL",
        price_paise=100000,
        stock_qty=100,
        reorder_level=0,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def _sell(client: TestClient, token: str, product_id: int, qty: int = 1, method: str = "CASH") -> dict:
    response = client.post(
        f"{API}/shop/orders",
        json={
            "channel": "COUNTER",
            "guest_name": "Walk In",
            "items": [{"product_id": product_id, "qty": qty}],
            "payment_method": method,
        },
        headers=_auth(token),
    )
    assert response.status_code == 201, response.text
    return response.json()


# --------------------------------------------------------------------------- T-10


def test_t10_dashboard_total_matches_the_ledger(
    client: TestClient, make_user, product, session: Session
) -> None:
    """Dashboard revenue == SUM(payments COMPLETED) in the period, refunds excluded."""
    staff = _token(client, make_user(Role.FRONT_DESK))
    owner_user = make_user(Role.OWNER)
    owner = _token(client, owner_user)

    _sell(client, staff, product.id, qty=2, method="CASH")  # 200000
    _sell(client, staff, product.id, qty=1, method="CARD")  # 100000
    refundable = _sell(client, staff, product.id, qty=3, method="UPI")  # 300000

    start, end = svc.period_bounds("today")
    ledger = int(
        session.execute(
            select(func.coalesce(func.sum(Payment.amount_paise), 0)).where(
                Payment.status == "COMPLETED",
                Payment.created_at >= start,
                Payment.created_at < end,
            )
        ).scalar_one()
    )

    body = client.get(
        f"{API}/dashboard/summary", params={"period": "today"}, headers=_auth(owner)
    ).json()
    assert body["revenue"]["total_paise"] == ledger

    # Refund the UPI sale and the dashboard must drop by exactly that amount.
    payment_id = session.execute(
        select(Payment.id).where(
            Payment.source_type == "SHOP_ORDER", Payment.source_id == refundable["id"]
        )
    ).scalar_one()
    refunded = client.post(
        f"{API}/payments/{payment_id}/refund",
        json={"reason": "goods returned"},
        headers=_auth(owner),
    )
    assert refunded.status_code == 200, refunded.text
    assert refunded.json()["status"] == "REFUNDED"

    after = client.get(
        f"{API}/dashboard/summary", params={"period": "today"}, headers=_auth(owner)
    ).json()
    assert after["revenue"]["total_paise"] == ledger - 300000

    session.expire_all()
    recomputed = int(
        session.execute(
            select(func.coalesce(func.sum(Payment.amount_paise), 0)).where(
                Payment.status == "COMPLETED",
                Payment.created_at >= start,
                Payment.created_at < end,
            )
        ).scalar_one()
    )
    assert after["revenue"]["total_paise"] == recomputed


def test_refund_twice_is_409(client: TestClient, make_user, product, session: Session) -> None:
    owner = _token(client, make_user(Role.OWNER))
    order = _sell(client, owner, product.id, method="CARD")
    payment_id = session.execute(
        select(Payment.id).where(
            Payment.source_type == "SHOP_ORDER", Payment.source_id == order["id"]
        )
    ).scalar_one()

    assert client.post(
        f"{API}/payments/{payment_id}/refund", json={}, headers=_auth(owner)
    ).status_code == 200

    again = client.post(f"{API}/payments/{payment_id}/refund", json={}, headers=_auth(owner))
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "ALREADY_REFUNDED"

    rows = session.execute(
        select(func.count(Payment.id)).where(Payment.id == payment_id)
    ).scalar_one()
    assert rows == 1  # the row is flipped, never deleted or duplicated


def test_payment_summary_totals_the_whole_filtered_range(
    client: TestClient, make_user, product, session: Session
) -> None:
    owner = _token(client, make_user(Role.OWNER))
    today = local_date(utcnow()).isoformat()
    params = {"from": today, "to": today, "source_type": "SHOP_ORDER", "method": "CARD"}

    def summary() -> dict:
        response = client.get(f"{API}/payments/summary", params=params, headers=_auth(owner))
        assert response.status_code == 200, response.text
        return response.json()

    before = summary()
    kept = _sell(client, owner, product.id, method="CARD")
    refunded = _sell(client, owner, product.id, method="CARD")
    refunded_payment = session.execute(
        select(Payment.id).where(
            Payment.source_type == "SHOP_ORDER", Payment.source_id == refunded["id"]
        )
    ).scalar_one()
    assert client.post(
        f"{API}/payments/{refunded_payment}/refund", json={}, headers=_auth(owner)
    ).status_code == 200
    after = summary()

    assert after["count"] - before["count"] == 2
    assert after["collected_paise"] - before["collected_paise"] == kept["total_paise"]
    assert after["refunded_count"] - before["refunded_count"] == 1
    assert after["refunded_paise"] - before["refunded_paise"] == refunded["total_paise"]
    listed = client.get(
        f"{API}/payments", params={**params, "page_size": 1}, headers=_auth(owner)
    ).json()
    assert listed["total"] == after["count"]


def test_front_desk_cannot_read_payment_totals(client: TestClient, make_user) -> None:
    desk = _token(client, make_user(Role.FRONT_DESK))

    assert client.get(f"{API}/payments/summary", headers=_auth(desk)).status_code == 403


def test_refund_is_audited_and_updates_the_source(
    client: TestClient, make_user, product, session: Session
) -> None:
    owner = _token(client, make_user(Role.OWNER))
    order = _sell(client, owner, product.id, method="CASH")
    payment_id = session.execute(
        select(Payment.id).where(
            Payment.source_type == "SHOP_ORDER", Payment.source_id == order["id"]
        )
    ).scalar_one()
    client.post(f"{API}/payments/{payment_id}/refund", json={"reason": "damaged"}, headers=_auth(owner))

    logged = session.execute(
        select(AuditLog).where(
            AuditLog.action == "PAYMENT_REFUNDED", AuditLog.entity_id == payment_id
        )
    ).scalar_one()
    assert logged.meta["reason"] == "damaged"
    assert logged.meta["amount_paise"] == 100000

    after = client.get(f"{API}/shop/orders/{order['id']}", headers=_auth(owner)).json()
    assert after["payment_status"] == "REFUNDED"


# --------------------------------------------------------------------- T-07 (part)


def test_bar_staff_cannot_see_the_dashboard(client: TestClient, make_user) -> None:
    token = _token(client, make_user(Role.BAR_STAFF))
    response = client.get(f"{API}/dashboard/summary", headers=_auth(token))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


@pytest.mark.parametrize("role", [Role.FRONT_DESK, Role.BAR_STAFF, Role.MEMBER])
def test_only_finance_roles_reach_payments(client: TestClient, make_user, role: Role) -> None:
    token = _token(client, make_user(role))
    assert client.get(f"{API}/payments", headers=_auth(token)).status_code == 403
    assert client.get(f"{API}/reports/payments.csv", headers=_auth(token)).status_code == 403


def test_payments_mine_is_scoped_to_the_caller(client: TestClient, make_user, product) -> None:
    staff = _token(client, make_user(Role.FRONT_DESK))
    _sell(client, staff, product.id)

    login = sign_in(client, "member1@club.test", os.environ.get("SEED_PASSWORD", "Club@12345"))
    own_id = login["user"]["member_id"]

    mine = client.get(f"{API}/payments/mine", headers=_auth(login["token"]))
    assert mine.status_code == 200
    assert all(item["member_id"] == own_id for item in mine.json()["items"])


# ------------------------------------------------------------------------- periods


def test_period_bounds_are_ist_anchored() -> None:
    from datetime import date as _date

    wednesday = _date(2026, 10, 7)
    start, end = svc.period_bounds("week", wednesday)
    assert local_date(start) == _date(2026, 10, 5)  # Monday
    assert start.strftime("%H:%M") == "18:30"  # 00:00 IST is 18:30 UTC the day before
    assert local_date(end) == _date(2026, 10, 8)

    start, _ = svc.period_bounds("month", wednesday)
    assert local_date(start) == _date(2026, 10, 1)

    start, _ = svc.period_bounds("today", wednesday)
    assert local_date(start) == wednesday


def test_unknown_period_is_422(client: TestClient, make_user) -> None:
    token = _token(client, make_user(Role.OWNER))
    response = client.get(
        f"{API}/dashboard/summary", params={"period": "quarter"}, headers=_auth(token)
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


# ------------------------------------------------------------------- summary shape


def test_summary_has_every_srs_key(client: TestClient, make_user) -> None:
    token = _token(client, make_user(Role.OWNER))
    body = client.get(f"{API}/dashboard/summary", headers=_auth(token)).json()

    assert set(body) == {
        "period", "from", "to", "revenue", "receivables", "payables",
        "bookings", "members", "leads", "low_stock",
    }
    assert set(body["revenue"]) == {"total_paise", "by_source", "by_method"}
    assert set(body["revenue"]["by_source"]) == {
        "BOOKING", "SOCIAL", "SHOP_ORDER", "BAR_ORDER", "MEMBERSHIP", "INVOICE"
    }
    assert set(body["revenue"]["by_method"]) == {"CASH", "CARD", "UPI", "ONLINE_MOCK"}
    assert set(body["receivables"]) == {"unpaid_tabs_paise", "unpaid_invoices_paise"}
    assert set(body["payables"]) == {"unpaid_expenses_paise", "pending_payroll_paise"}
    assert set(body["bookings"]) == {"count", "utilization_pct"}
    assert set(body["members"]) == {"new", "expiring_7d"}
    assert body["from"].endswith("Z")
    assert isinstance(body["bookings"]["utilization_pct"], float)


def test_revenue_split_by_source_and_method(
    client: TestClient, make_user, product, session: Session
) -> None:
    staff = _token(client, make_user(Role.FRONT_DESK))
    owner = _token(client, make_user(Role.OWNER))

    before = client.get(f"{API}/dashboard/summary", headers=_auth(owner)).json()["revenue"]
    _sell(client, staff, product.id, qty=1, method="CASH")
    after = client.get(f"{API}/dashboard/summary", headers=_auth(owner)).json()["revenue"]

    assert after["by_source"]["SHOP_ORDER"] - before["by_source"]["SHOP_ORDER"] == 100000
    assert after["by_method"]["CASH"] - before["by_method"]["CASH"] == 100000
    assert after["total_paise"] - before["total_paise"] == 100000


def test_low_stock_appears_on_the_dashboard(
    client: TestClient, make_user, session: Session
) -> None:
    owner_user = make_user(Role.OWNER)
    owner = _token(client, owner_user)
    scarce = Product(
        sku=f"{TEST_SKU_PREFIX}{uuid.uuid4().hex[:10].upper()}",
        name="Nearly Gone",
        category="BALL",
        price_paise=1000,
        stock_qty=1,
        reorder_level=5,
    )
    session.add(scarce)
    session.commit()

    body = client.get(f"{API}/dashboard/summary", headers=_auth(owner)).json()
    entry = next(row for row in body["low_stock"] if row["product_id"] == scarce.id)
    assert entry == {
        "product_id": scarce.id,
        "name": "Nearly Gone",
        "stock_qty": 1,
        "reorder_level": 5,
    }


def test_utilisation_is_a_percentage(client: TestClient, make_user) -> None:
    token = _token(client, make_user(Role.OWNER))
    pct = client.get(f"{API}/dashboard/summary", headers=_auth(token)).json()["bookings"][
        "utilization_pct"
    ]
    assert 0.0 <= pct <= 100.0


# -------------------------------------------------------------------- revenue series


def test_revenue_series_covers_every_day_of_the_period(
    client: TestClient, make_user, product
) -> None:
    staff = _token(client, make_user(Role.FRONT_DESK))
    owner = _token(client, make_user(Role.OWNER))
    _sell(client, staff, product.id, qty=1, method="UPI")

    body = client.get(
        f"{API}/dashboard/revenue-series", params={"period": "week"}, headers=_auth(owner)
    ).json()
    assert body["period"] == "week"

    today = local_date(utcnow())
    assert len(body["days"]) == today.weekday() + 1
    assert body["days"][-1]["date"] == today.isoformat()
    assert body["days"][-1]["by_source"]["SHOP_ORDER"] >= 100000
    assert sum(day["total_paise"] for day in body["days"]) >= 100000


# ------------------------------------------------------------------------- CSV export


def test_csv_export_is_audited_and_escaped(
    client: TestClient, make_user, product, session: Session
) -> None:
    owner_user = make_user(Role.OWNER)
    owner = _token(client, owner_user)
    order = _sell(client, owner, product.id)

    payment = session.execute(
        select(Payment).where(
            Payment.source_type == "SHOP_ORDER", Payment.source_id == order["id"]
        )
    ).scalar_one()
    payment.reference = "=cmd|'/c calc'!A1"  # the classic CSV-injection payload
    session.commit()

    today = local_date(utcnow()).isoformat()
    response = client.get(
        f"{API}/reports/payments.csv", params={"from": today, "to": today}, headers=_auth(owner)
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "attachment" in response.headers["content-disposition"]

    lines = response.text.strip().splitlines()
    assert lines[0].startswith("id,created_at,source_type")
    assert "'=cmd" in response.text  # neutralised, not executable
    assert ",=cmd" not in response.text

    exported = session.execute(
        select(func.count(AuditLog.id)).where(
            AuditLog.action == "PAYMENTS_EXPORTED", AuditLog.actor_id == owner_user.id
        )
    ).scalar_one()
    assert exported == 1


def test_payments_filters(client: TestClient, make_user, product) -> None:
    staff = _token(client, make_user(Role.FRONT_DESK))
    owner = _token(client, make_user(Role.OWNER))
    _sell(client, staff, product.id, method="CARD")

    body = client.get(
        f"{API}/payments",
        params={"source_type": "SHOP_ORDER", "method": "CARD"},
        headers=_auth(owner),
    ).json()
    assert body["total"] >= 1
    assert all(
        item["source_type"] == "SHOP_ORDER" and item["method"] == "CARD"
        for item in body["items"]
    )

    empty = client.get(
        f"{API}/payments", params={"source_type": "INVOICE"}, headers=_auth(owner)
    ).json()
    assert empty["items"] == []


# ------------------------------------------------------------------------ tax summary


def test_tax_summary_for_this_month(client: TestClient, make_user, product) -> None:
    staff = _token(client, make_user(Role.FRONT_DESK))
    owner = _token(client, make_user(Role.OWNER))
    _sell(client, staff, product.id, qty=1, method="CASH")

    month = local_date(utcnow()).strftime("%Y-%m")
    body = client.get(
        f"{API}/reports/tax-summary", params={"month": month}, headers=_auth(owner)
    ).json()
    assert body["month"] == month
    assert body["by_source"]["SHOP_ORDER"]["revenue_paise"] >= 100000
    assert body["by_source"]["SHOP_ORDER"]["tax_paise"] == 15254 * (
        body["by_source"]["SHOP_ORDER"]["revenue_paise"] // 100000
    ) or body["tax_paise"] > 0


def test_bad_month_is_422(client: TestClient, make_user) -> None:
    token = _token(client, make_user(Role.OWNER))
    response = client.get(
        f"{API}/reports/tax-summary", params={"month": "October"}, headers=_auth(token)
    )
    assert response.status_code == 422
