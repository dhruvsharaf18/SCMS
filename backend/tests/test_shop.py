"""Stage 4: products, stock and shop orders (F-05/F-06), including T-05."""

import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import local_date
from app.db import SessionLocal
from app.enums import PlanCode, Role
from app.models import Member, Membership, Notification, Payment, Plan, Product, StockMovement, User
from app.security import AppError, utcnow
from app.services import membership as membership_svc
from app.services import shop as svc

from .conftest import API, GOOD_PASSWORD, TEST_PHONE_PREFIX, TEST_SKU_PREFIX


def _token(client: TestClient, user: User) -> str:
    r = client.post(f"{API}/auth/login", json={"email": user.email, "password": GOOD_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def make_product(session: Session):
    def _make(price_paise: int = 450000, stock_qty: int = 10, reorder_level: int = 3) -> Product:
        product = Product(
            sku=f"{TEST_SKU_PREFIX}{uuid.uuid4().hex[:10].upper()}",
            name=f"Test Racket {uuid.uuid4().hex[:4]}",
            category="RACKET",
            price_paise=price_paise,
            stock_qty=stock_qty,
            reorder_level=reorder_level,
        )
        session.add(product)
        session.commit()
        session.refresh(product)
        return product

    return _make


@pytest.fixture
def silver_member(session: Session) -> Member:
    member = Member(
        member_code=membership_svc.next_member_code(session),
        full_name="Shop Tester",
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


# --------------------------------------------------------------------------- T-05


def test_t05_two_parallel_orders_for_the_last_unit(make_product, session: Session) -> None:
    """Stock 1, two concurrent orders: one 201, one OUT_OF_STOCK, stock never negative."""
    product = make_product(price_paise=100000, stock_qty=1)
    staff = session.execute(
        select(User).where(User.email == "desk@club.test")
    ).scalar_one()

    def attempt(_: int) -> str:
        with SessionLocal() as db:
            actor = db.get(User, staff.id)
            try:
                svc.create_order(
                    db,
                    actor,
                    {
                        "channel": "COUNTER",
                        "fulfilment": "INSTORE",
                        "guest_name": "Racer",
                        "items": [{"product_id": product.id, "qty": 1}],
                        "payment_method": "CASH",
                    },
                )
                return "OK"
            except AppError as exc:
                return exc.code
            except Exception as exc:
                return type(exc).__name__

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(attempt, range(2)))

    assert results.count("OK") == 1, results
    assert results.count("OUT_OF_STOCK") == 1, results

    session.expire_all()
    assert session.get(Product, product.id).stock_qty == 0


def test_t05_fifty_threads_never_oversell(make_product, session: Session) -> None:
    product = make_product(price_paise=1000, stock_qty=10)
    staff = session.execute(
        select(User).where(User.email == "desk@club.test")
    ).scalar_one()

    def attempt(_: int) -> str:
        with SessionLocal() as db:
            try:
                svc.create_order(
                    db,
                    db.get(User, staff.id),
                    {
                        "channel": "COUNTER",
                        "guest_name": "Racer",
                        "items": [{"product_id": product.id, "qty": 1}],
                        "payment_method": "CASH",
                    },
                )
                return "OK"
            except AppError as exc:
                return exc.code

    with ThreadPoolExecutor(max_workers=50) as pool:
        results = list(pool.map(attempt, range(50)))

    assert results.count("OK") == 10, results
    session.expire_all()
    assert session.get(Product, product.id).stock_qty == 0


def test_qty_above_stock_saves_nothing(
    client: TestClient, make_user, make_product, session: Session
) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    plenty = make_product(stock_qty=50)
    scarce = make_product(stock_qty=2)

    response = client.post(
        f"{API}/shop/orders",
        json={
            "channel": "COUNTER",
            "guest_name": "Walk In",
            "items": [
                {"product_id": plenty.id, "qty": 1},
                {"product_id": scarce.id, "qty": 5},
            ],
            "payment_method": "CASH",
        },
        headers=_auth(token),
    )
    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "OUT_OF_STOCK"
    assert error["details"] == {"product_id": scarce.id, "available": 2}

    session.expire_all()
    assert session.get(Product, plenty.id).stock_qty == 50  # the first line was rolled back
    assert session.get(Product, scarce.id).stock_qty == 2
    assert session.execute(
        select(func.count(StockMovement.id)).where(
            StockMovement.product_id.in_([plenty.id, scarce.id]),
            StockMovement.reason == "SALE",
        )
    ).scalar_one() == 0


# ------------------------------------------------------------------- totals (SRS 4.6)


def test_srs_example_totals(
    client: TestClient, make_user, make_product, silver_member, session: Session
) -> None:
    """The SRS 3.2.7 sample: subtotal 650000, discount 32500 at 5%, total 617500, tax 94195."""
    token = _token(client, make_user(Role.FRONT_DESK))
    racket = make_product(price_paise=450000, stock_qty=5)
    balls = make_product(price_paise=100000, stock_qty=5)

    plan = session.execute(select(Plan).where(Plan.code == PlanCode.SILVER.value)).scalar_one()
    assert plan.shop_discount_pct == 5

    response = client.post(
        f"{API}/shop/orders",
        json={
            "member_id": silver_member.id,
            "channel": "COUNTER",
            "items": [
                {"product_id": racket.id, "qty": 1},
                {"product_id": balls.id, "qty": 2},
            ],
            "payment_method": "CARD",
        },
        headers=_auth(token),
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["subtotal_paise"] == 650000
    assert body["discount_paise"] == 32500
    assert body["total_paise"] == 617500
    assert body["tax_paise"] == 94195
    assert body["status"] == "COMPLETED"
    assert body["payment_status"] == "PAID"

    payment = session.execute(
        select(Payment).where(Payment.source_type == "SHOP_ORDER", Payment.source_id == body["id"])
    ).scalar_one()
    assert payment.amount_paise == 617500
    assert payment.tax_paise == 94195


def test_unit_price_is_snapshotted(
    client: TestClient, make_user, make_product, session: Session
) -> None:
    admin = _token(client, make_user(Role.MANAGER))
    product = make_product(price_paise=10000, stock_qty=5)

    order = client.post(
        f"{API}/shop/orders",
        json={
            "channel": "COUNTER",
            "guest_name": "Walk In",
            "items": [{"product_id": product.id, "qty": 1}],
            "payment_method": "CASH",
        },
        headers=_auth(admin),
    ).json()

    client.patch(
        f"{API}/products/{product.id}", json={"price_paise": 99000}, headers=_auth(admin)
    )
    after = client.get(f"{API}/shop/orders/{order['id']}", headers=_auth(admin)).json()
    assert after["items"][0]["unit_price_paise"] == 10000
    assert after["total_paise"] == 10000


# ------------------------------------------------------------------- stock lifecycle


def test_cancel_restores_stock_once_and_refunds(
    client: TestClient, make_user, make_product, session: Session
) -> None:
    token = _token(client, make_user(Role.MANAGER))
    product = make_product(price_paise=50000, stock_qty=10)

    order = client.post(
        f"{API}/shop/orders",
        json={
            "channel": "COUNTER",
            "guest_name": "Walk In",
            "items": [{"product_id": product.id, "qty": 3}],
            "payment_method": "CASH",
        },
        headers=_auth(token),
    ).json()
    session.expire_all()
    assert session.get(Product, product.id).stock_qty == 7

    cancelled = client.post(
        f"{API}/shop/orders/{order['id']}/cancel",
        json={"reason": "customer changed mind"},
        headers=_auth(token),
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["refunded"] is True
    assert cancelled.json()["refund_paise"] == 150000

    session.expire_all()
    assert session.get(Product, product.id).stock_qty == 10

    again = client.post(
        f"{API}/shop/orders/{order['id']}/cancel", json={}, headers=_auth(token)
    )
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "ALREADY_CANCELLED"

    session.expire_all()
    assert session.get(Product, product.id).stock_qty == 10  # restored exactly once

    payment = session.execute(
        select(Payment).where(
            Payment.source_type == "SHOP_ORDER", Payment.source_id == order["id"]
        )
    ).scalar_one()
    assert payment.status == "REFUNDED"  # row kept, excluded from revenue


def test_restock_adds_a_movement(
    client: TestClient, make_user, make_product, session: Session
) -> None:
    token = _token(client, make_user(Role.MANAGER))
    product = make_product(stock_qty=1)

    response = client.post(
        f"{API}/products/{product.id}/restock",
        json={"qty": 20, "note": "weekly delivery"},
        headers=_auth(token),
    )
    assert response.status_code == 200
    assert response.json()["stock_qty"] == 21

    movement = session.execute(
        select(StockMovement).where(
            StockMovement.product_id == product.id, StockMovement.reason == "RESTOCK"
        ).order_by(StockMovement.id.desc()).limit(1)
    ).scalar_one()
    assert movement.delta == 20
    assert movement.note == "weekly delivery"


def test_low_stock_list_and_notification(
    client: TestClient, make_user, make_product, session: Session
) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    product = make_product(price_paise=1000, stock_qty=4, reorder_level=3)

    client.post(
        f"{API}/shop/orders",
        json={
            "channel": "COUNTER",
            "guest_name": "Walk In",
            "items": [{"product_id": product.id, "qty": 2}],
            "payment_method": "CASH",
        },
        headers=_auth(token),
    )

    listed = client.get(f"{API}/products/low-stock", headers=_auth(token))
    assert listed.status_code == 200
    assert product.id in [p["id"] for p in listed.json()]

    session.expire_all()
    notes = session.execute(
        select(func.count(Notification.id)).where(
            Notification.type == "LOW_STOCK", Notification.dedupe_key.like(f"LOW_STOCK:{product.id}:%")
        )
    ).scalar_one()
    assert notes == 1


# ----------------------------------------------------------------------- online orders


def _member_login(client: TestClient) -> dict:
    return client.post(
        f"{API}/auth/login",
        json={
            "email": "member1@club.test",
            "password": os.environ.get("SEED_PASSWORD", "Club@12345"),
        },
    ).json()


def test_online_delivery_needs_an_address(client: TestClient, make_product) -> None:
    login = _member_login(client)
    product = make_product(stock_qty=5)

    response = client.post(
        f"{API}/shop/orders",
        json={
            "channel": "ONLINE",
            "fulfilment": "DELIVERY",
            "items": [{"product_id": product.id, "qty": 1}],
        },
        headers=_auth(login["access_token"]),
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "ADDRESS_REQUIRED"


def test_online_pickup_is_placed_and_reserves_stock(
    client: TestClient, make_product, session: Session
) -> None:
    login = _member_login(client)
    product = make_product(price_paise=20000, stock_qty=5)

    response = client.post(
        f"{API}/shop/orders",
        json={
            "channel": "ONLINE",
            "fulfilment": "PICKUP",
            "items": [{"product_id": product.id, "qty": 2}],
        },
        headers=_auth(login["access_token"]),
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "PLACED"
    assert body["payment_status"] == "UNPAID"
    assert body["member_id"] == login["user"]["member_id"]

    session.expire_all()
    assert session.get(Product, product.id).stock_qty == 3


def test_staff_cannot_place_an_online_order(client: TestClient, make_user, make_product) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    product = make_product(stock_qty=5)
    response = client.post(
        f"{API}/shop/orders",
        json={
            "channel": "ONLINE",
            "fulfilment": "PICKUP",
            "items": [{"product_id": product.id, "qty": 1}],
        },
        headers=_auth(token),
    )
    assert response.status_code == 403


def test_pay_at_pickup_then_complete(client: TestClient, make_user, make_product) -> None:
    login = _member_login(client)
    product = make_product(price_paise=30000, stock_qty=5)
    order = client.post(
        f"{API}/shop/orders",
        json={
            "channel": "ONLINE",
            "fulfilment": "PICKUP",
            "items": [{"product_id": product.id, "qty": 1}],
        },
        headers=_auth(login["access_token"]),
    ).json()

    staff = _token(client, make_user(Role.FRONT_DESK))
    early = client.post(
        f"{API}/shop/orders/{order['id']}/status", json={"status": "COMPLETED"}, headers=_auth(staff)
    )
    assert early.status_code == 409
    assert early.json()["error"]["code"] in ("INVALID_TRANSITION", "ORDER_UNPAID")

    ready = client.post(
        f"{API}/shop/orders/{order['id']}/status", json={"status": "READY"}, headers=_auth(staff)
    )
    assert ready.status_code == 200

    paid = client.post(
        f"{API}/shop/orders/{order['id']}/pay",
        json={"payment_method": "UPI"},
        headers=_auth(staff),
    )
    assert paid.status_code == 200
    assert paid.json()["payment_status"] == "PAID"

    again = client.post(
        f"{API}/shop/orders/{order['id']}/pay",
        json={"payment_method": "UPI"},
        headers=_auth(staff),
    )
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "ORDER_ALREADY_PAID"

    done = client.post(
        f"{API}/shop/orders/{order['id']}/status", json={"status": "COMPLETED"}, headers=_auth(staff)
    )
    assert done.status_code == 200


def test_status_cannot_go_backwards(client: TestClient, make_user, make_product) -> None:
    login = _member_login(client)
    product = make_product(stock_qty=5)
    order = client.post(
        f"{API}/shop/orders",
        json={
            "channel": "ONLINE",
            "fulfilment": "PICKUP",
            "items": [{"product_id": product.id, "qty": 1}],
        },
        headers=_auth(login["access_token"]),
    ).json()

    staff = _token(client, make_user(Role.FRONT_DESK))
    client.post(
        f"{API}/shop/orders/{order['id']}/status", json={"status": "READY"}, headers=_auth(staff)
    )
    back = client.post(
        f"{API}/shop/orders/{order['id']}/status", json={"status": "PLACED"}, headers=_auth(staff)
    )
    assert back.status_code == 409
    assert back.json()["error"]["code"] == "INVALID_TRANSITION"


# -------------------------------------------------------------------------- validation


def test_empty_cart_is_422(client: TestClient, make_user) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    response = client.post(
        f"{API}/shop/orders",
        json={"channel": "COUNTER", "guest_name": "Walk In", "items": [], "payment_method": "CASH"},
        headers=_auth(token),
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "EMPTY_CART"


def test_unknown_field_is_rejected(client: TestClient, make_user, make_product) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    product = make_product()
    response = client.post(
        f"{API}/shop/orders",
        json={
            "channel": "COUNTER",
            "guest_name": "Walk In",
            "items": [{"product_id": product.id, "qty": 1}],
            "payment_method": "CASH",
            "total_paise": 1,
        },
        headers=_auth(token),
    )
    assert response.status_code == 422


# ------------------------------------------------------------------------------ RBAC


def test_front_desk_cannot_write_products(client: TestClient, make_user, make_product) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    product = make_product()
    assert client.patch(
        f"{API}/products/{product.id}", json={"price_paise": 1}, headers=_auth(token)
    ).status_code == 403
    assert client.post(
        f"{API}/products/{product.id}/restock", json={"qty": 1}, headers=_auth(token)
    ).status_code == 403


def test_member_sees_only_own_orders(client: TestClient, make_user, make_product) -> None:
    staff = _token(client, make_user(Role.FRONT_DESK))
    product = make_product(stock_qty=5)
    other = client.post(
        f"{API}/shop/orders",
        json={
            "channel": "COUNTER",
            "guest_name": "Someone Else",
            "items": [{"product_id": product.id, "qty": 1}],
            "payment_method": "CASH",
        },
        headers=_auth(staff),
    ).json()

    login = _member_login(client)
    blocked = client.get(
        f"{API}/shop/orders/{other['id']}", headers=_auth(login["access_token"])
    )
    assert blocked.status_code == 404

    own_id = login["user"]["member_id"]
    listed = client.get(f"{API}/shop/orders", headers=_auth(login["access_token"])).json()
    assert all(item["member_id"] == own_id for item in listed["items"])


# ---------------------------------------------------------------------------- public


def test_public_products_hide_the_quantity(client: TestClient, make_product) -> None:
    product = make_product(stock_qty=7)
    response = client.get(f"{API}/public/products")
    assert response.status_code == 200
    entry = next(p for p in response.json() if p["id"] == product.id)
    assert entry["in_stock"] is True
    assert "stock_qty" not in entry
    assert "7" not in str(entry.get("in_stock"))


def test_public_products_need_no_token(client: TestClient) -> None:
    assert client.get(f"{API}/public/products", params={"category": "BALL"}).status_code == 200
