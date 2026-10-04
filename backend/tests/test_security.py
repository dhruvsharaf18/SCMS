"""Stage 10: T-07 (RBAC matrix) and T-08 (IDOR), plus the S-01..S-23 spot checks.

The matrix below is read straight off SRS 3.1. Every router gets at least one role that must
be let in and one that must be turned away, so a future `require_roles` slip fails here.
"""

import os
import uuid
from datetime import datetime, time, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import CLUB_TZ, local_date
from app.enums import Role, Sport
from app.main import app
from app.models import Member, User
from app.security import utcnow

from .conftest import API, GOOD_PASSWORD, as_user, login_token, sign_in

SEED_PASSWORD = os.environ.get("SEED_PASSWORD", "Club@12345")


def _token(client: TestClient, user: User) -> str:
    return login_token(client, user.email)


def _auth(token: str) -> dict[str, str]:
    return as_user(token)


def _slot(days_ahead: int, hour: int) -> str:
    day = local_date(utcnow()) + timedelta(days=days_ahead)
    return (
        datetime.combine(day, time(hour, 0), tzinfo=CLUB_TZ)
        .astimezone(timezone.utc)
        .strftime("%Y-%m-%dT%H:%M:%SZ")
    )


# --------------------------------------------------------------------------- T-07


# (label, method, path, body, allowed role, forbidden role) — one row per router, from SRS 3.1.
RBAC_MATRIX = [
    ("users", "POST", "/users", "user", Role.OWNER, Role.FRONT_DESK),
    ("plans write", "PATCH", "/plans/1", {"fee_paise": 150000}, Role.MANAGER, Role.FRONT_DESK),
    ("members write", "POST", "/members", "member", Role.FRONT_DESK, Role.BAR_STAFF),
    ("courts write", "POST", "/courts", "court", Role.MANAGER, Role.FRONT_DESK),
    ("bookings", "GET", "/bookings", None, Role.FRONT_DESK, Role.BAR_STAFF),
    ("social write", "POST", "/social-sessions", "social", Role.MANAGER, Role.FRONT_DESK),
    ("products", "GET", "/products", None, Role.FRONT_DESK, Role.BAR_STAFF),
    ("shop orders", "GET", "/shop/orders", None, Role.FRONT_DESK, Role.BAR_STAFF),
    ("menu write", "POST", "/menu-items", "menu", Role.MANAGER, Role.BAR_STAFF),
    ("bar orders", "GET", "/bar/orders", None, Role.BAR_STAFF, Role.MEMBER),
    ("dining menu", "GET", "/dining/menu", None, Role.BAR_STAFF, None),
    (
        "dining status",
        "POST",
        "/dining/reservations/999999/status",
        {"status": "SEATED"},
        Role.FRONT_DESK,
        Role.MEMBER,
    ),
    ("payments ledger", "GET", "/payments", None, Role.MANAGER, Role.FRONT_DESK),
    ("dashboard", "GET", "/dashboard/summary", None, Role.OWNER, Role.BAR_STAFF),
    ("exports", "GET", "/reports/payments.csv", None, Role.OWNER, Role.FRONT_DESK),
    ("leads", "GET", "/leads", None, Role.FRONT_DESK, Role.MEMBER),
    ("invoices read", "GET", "/invoices", None, Role.FRONT_DESK, Role.BAR_STAFF),
    ("clients write", "POST", "/clients", "client", Role.MANAGER, Role.FRONT_DESK),
    ("expenses", "GET", "/expenses", None, Role.MANAGER, Role.FRONT_DESK),
    ("employees", "GET", "/employees", None, Role.MANAGER, Role.FRONT_DESK),
    ("payroll pay", "POST", "/payroll/999999/mark-paid", None, Role.OWNER, Role.MANAGER),
    ("audit log", "GET", "/audit-logs", None, Role.OWNER, Role.MANAGER),
    ("notifications", "GET", "/notifications", None, Role.MEMBER, None),
]


def _body(kind, court_id: int | None):
    if kind == "user":
        return {
            "email": f"test-{uuid.uuid4().hex[:10]}@test.local",
            "password": GOOD_PASSWORD,
            "role": "FRONT_DESK",
            "full_name": "RBAC Probe",
        }
    if kind == "member":
        return {"full_name": "RBAC Probe", "phone": "7999" + uuid.uuid4().int.__str__()[:6]}
    if kind == "court":
        return {"name": f"ZZTEST {uuid.uuid4().hex[:6]}", "sport": "TENNIS"}
    if kind == "social":
        return {
            "court_id": court_id,
            "title": "RBAC probe",
            "start_at": _slot(20, 9),
            "end_at": _slot(20, 10),
            "capacity": 4,
        }
    if kind == "menu":
        return {"name": f"ZZTEST {uuid.uuid4().hex[:5]}", "category": "DRINK", "price_paise": 100}
    if kind == "client":
        return {"company_name": f"ZZTEST Corp {uuid.uuid4().hex[:5]}"}
    return kind


@pytest.mark.parametrize(
    "label,method,path,body,allowed,forbidden",
    RBAC_MATRIX,
    ids=[row[0] for row in RBAC_MATRIX],
)
def test_t07_rbac_matrix(
    client: TestClient, make_user, make_court, label, method, path, body, allowed, forbidden
) -> None:
    court = make_court(Sport.TENNIS) if body == "social" else None

    allowed_token = _token(client, make_user(allowed))
    response = client.request(
        method, f"{API}{path}", json=_body(body, court.id if court else None),
        headers=_auth(allowed_token)
    )
    assert response.status_code != 403, f"{label}: {allowed.value} was wrongly refused"

    if forbidden is None:
        return
    forbidden_token = _token(client, make_user(forbidden))
    refused = client.request(
        method, f"{API}{path}", json=_body(body, court.id if court else None),
        headers=_auth(forbidden_token)
    )
    assert refused.status_code == 403, f"{label}: {forbidden.value} was wrongly allowed"
    assert refused.json()["error"]["code"] == "FORBIDDEN"


def test_t07_every_non_public_route_has_a_role_guard() -> None:
    """A route added without `require_roles` fails here rather than in production."""
    import inspect

    public = {
        "/api/v1/auth/login",
        "/api/v1/auth/login-key",  # public: anyone fetches the RSA key before encrypting login
        "/api/v1/auth/logout",
        "/api/v1/auth/me",  # guarded by get_current_user, which has no role list
        "/api/v1/plans",  # SRS 3.2.2: the price list is public
        "/api/v1/court-prices",
        "/api/v1/public/availability",
        "/api/v1/public/products",
        "/api/v1/public/enquiries",
    }

    unguarded = []
    for route in app.routes:
        path = getattr(route, "path", "")
        if not path.startswith("/api/") or path in public:
            continue
        if "require_roles" not in inspect.getsource(route.endpoint):
            unguarded.append(path)
    assert unguarded == []


def test_every_request_body_forbids_unknown_fields() -> None:
    """S-05: a typo'd or injected field must never be silently ignored."""
    from app import schemas

    leaky = [
        name
        for name, obj in vars(schemas).items()
        if isinstance(obj, type)
        and issubclass(obj, schemas._Request)
        and obj is not schemas._Request
        and obj.model_config.get("extra") != "forbid"
    ]
    assert leaky == []


# --------------------------------------------------------------------------- T-08


@pytest.fixture
def two_members(client: TestClient, session: Session):
    """member1 and member2 are seeded accounts; the test only reads through them."""
    logins = {}
    for email in ("member1@club.test", "member2@club.test"):
        logins[email] = sign_in(client, email, SEED_PASSWORD)
    return logins


def test_t08_member_cannot_read_another_members_profile(two_members) -> None:
    a, b = two_members["member1@club.test"], two_members["member2@club.test"]
    assert a["user"]["member_id"] != b["user"]["member_id"]


def test_t08_idor_across_profile_booking_and_order(
    client: TestClient, make_user, make_court, two_members, session: Session
) -> None:
    a = two_members["member1@club.test"]
    b = two_members["member2@club.test"]
    a_token, b_token = a["token"], b["token"]
    b_member_id = b["user"]["member_id"]

    # Staff set up a booking and a shop order that belong to member B.
    staff_user = make_user(Role.FRONT_DESK)
    staff = _token(client, staff_user)
    court = make_court(Sport.TENNIS)

    booking = client.post(
        f"{API}/bookings",
        json={"court_id": court.id, "start_at": _slot(10, 10), "member_id": b_member_id},
        headers=_auth(staff),
    )
    assert booking.status_code == 201, booking.text

    from app.models import Product

    product = Product(
        sku=f"ZZTEST-{uuid.uuid4().hex[:10].upper()}",
        name="IDOR probe",
        category="BALL",
        price_paise=1000,
        stock_qty=10,
        reorder_level=0,
    )
    session.add(product)
    session.commit()

    order = client.post(
        f"{API}/shop/orders",
        json={
            "member_id": b_member_id,
            "channel": "COUNTER",
            "items": [{"product_id": product.id, "qty": 1}],
            "payment_method": "CASH",
        },
        headers=_auth(staff),
    )
    assert order.status_code == 201, order.text

    # Member A must get 404 everywhere — never 403, which would confirm the row exists.
    for url in (
        f"{API}/members/{b_member_id}",
        f"{API}/members/{b_member_id}/history",
        f"{API}/bookings/{booking.json()['id']}",
        f"{API}/shop/orders/{order.json()['id']}",
    ):
        response = client.get(url, headers=_auth(a_token))
        assert response.status_code == 404, f"{url} returned {response.status_code}"
        assert response.json()["error"]["code"] == "NOT_FOUND"

    # And member B still sees all of it.
    for url in (
        f"{API}/members/{b_member_id}",
        f"{API}/bookings/{booking.json()['id']}",
        f"{API}/shop/orders/{order.json()['id']}",
    ):
        assert client.get(url, headers=_auth(b_token)).status_code == 200


def test_t08_list_endpoints_are_scoped_not_filtered_client_side(
    client: TestClient, two_members
) -> None:
    """Passing someone else's member_id must not widen what a member sees."""
    a = two_members["member1@club.test"]
    b_id = two_members["member2@club.test"]["user"]["member_id"]
    token = a["token"]
    own_id = a["user"]["member_id"]

    for path in ("/bookings", "/shop/orders", "/payments/mine"):
        body = client.get(
            f"{API}{path}", params={"member_id": b_id}, headers=_auth(token)
        ).json()
        assert all(
            item.get("member_id") in (own_id, None) for item in body["items"]
        ), f"{path} leaked another member's rows"


def test_t08_member_cannot_mutate_another_members_booking(
    client: TestClient, make_user, make_court, two_members
) -> None:
    a = two_members["member1@club.test"]
    b_member_id = two_members["member2@club.test"]["user"]["member_id"]

    staff = _token(client, make_user(Role.FRONT_DESK))
    court = make_court(Sport.TENNIS)
    booking = client.post(
        f"{API}/bookings",
        json={"court_id": court.id, "start_at": _slot(11, 11), "member_id": b_member_id},
        headers=_auth(staff),
    ).json()

    cancelled = client.post(
        f"{API}/bookings/{booking['id']}/cancel",
        json={"reason": "not mine"},
        headers=_auth(a["token"]),
    )
    assert cancelled.status_code == 404


# ------------------------------------------------------------------ S-checklist spots


def test_s02_password_hash_never_leaves_the_api(client: TestClient, make_user) -> None:
    owner = _token(client, make_user(Role.OWNER))
    created = client.post(f"{API}/users", json=_body("user", None), headers=_auth(owner))
    assert created.status_code == 201, created.text
    body = created.text + client.get(f"{API}/auth/me", headers=_auth(owner)).text
    assert "password_hash" not in body
    assert "$argon2" not in body


def test_s11_unauthenticated_calls_are_401_not_500(client: TestClient) -> None:
    for path in ("/members", "/bookings", "/dashboard/summary", "/audit-logs"):
        response = client.get(f"{API}{path}")
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "NOT_AUTHENTICATED"


def test_s12_a_tampered_session_id_is_rejected(client: TestClient, make_user) -> None:
    token = _token(client, make_user(Role.OWNER))
    forged = token[:-3] + ("xyz" if not token.endswith("xyz") else "abc")
    response = client.get(f"{API}/dashboard/summary", headers=_auth(forged))
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "NOT_AUTHENTICATED"


def test_s15_public_endpoints_return_no_personal_data(
    client: TestClient, make_user, make_court
) -> None:
    staff = _token(client, make_user(Role.FRONT_DESK))
    court = make_court(Sport.TENNIS)
    client.post(
        f"{API}/bookings",
        json={
            "court_id": court.id,
            "start_at": _slot(12, 12),
            "guest_name": "Private Person",
            "guest_phone": "7000009999",
        },
        headers=_auth(staff),
    )

    day = (local_date(utcnow()) + timedelta(days=12)).isoformat()
    grid = client.get(f"{API}/public/availability", params={"from": day, "days": 1}).text
    assert "Private Person" not in grid
    assert "7000009999" not in grid

    catalogue = client.get(f"{API}/public/products").text
    assert "stock_qty" not in catalogue


def test_s18_errors_use_the_srs_envelope(client: TestClient, make_user) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    body = client.get(f"{API}/members/999999", headers=_auth(token)).json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details"}
    assert "Traceback" not in str(body)


def test_s20_health_needs_no_auth_and_leaks_nothing(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert "password" not in str(body).lower()
    assert "database_url" not in str(body).lower()
