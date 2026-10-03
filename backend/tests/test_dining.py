"""Bar & dining for members: tier-priced menu and advance table reservations."""

import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, time, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import CLUB_TZ, local_date
from app.db import SessionLocal
from app.enums import PlanCode, Role
from app.models import BarTable, Member, Membership, MenuItem, Plan, User
from app.security import AppError, utcnow
from app.services import dining as svc
from app.services import membership as membership_svc

from .conftest import API, TEST_MENU_PREFIX, TEST_PHONE_PREFIX, TEST_TABLE_PREFIX, as_user, login_token


def _auth(client: TestClient, user: User) -> dict[str, str]:
    return as_user(login_token(client, user.email))


def _slot(days_ahead: int = 3, hour: int = 19, minute: int = 0) -> datetime:
    day = local_date(utcnow()) + timedelta(days=days_ahead)
    return datetime.combine(day, time(hour, minute), tzinfo=CLUB_TZ).astimezone(timezone.utc)


def _iso(moment: datetime) -> str:
    return moment.isoformat().replace("+00:00", "Z")


@pytest.fixture
def make_member(session: Session, make_user):
    """A member login linked to a member row, optionally holding an active plan."""

    def _make(plan: PlanCode | None = PlanCode.GOLD) -> tuple[User, Member]:
        user = make_user(Role.MEMBER)
        member = Member(
            member_code=membership_svc.next_member_code(session),
            full_name="Dining Tester",
            phone=TEST_PHONE_PREFIX + str(uuid.uuid4().int)[:6],
            user_id=user.id,
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
        return user, member

    return _make


@pytest.fixture
def make_table(session: Session):
    """Test tables are larger than any seeded one, and each test uses a bigger party than the
    tables earlier tests left behind, so a party of that size only fits the tables it made."""

    def _make(seats: int) -> BarTable:
        table = BarTable(label=f"{TEST_TABLE_PREFIX}{uuid.uuid4().hex[:6]}", seats=seats)
        session.add(table)
        session.commit()
        session.refresh(table)
        return table

    return _make


def _reserve(client, headers, start_at, party_size, **extra):
    return client.post(
        f"{API}/dining/reservations",
        json={"start_at": _iso(start_at), "party_size": party_size, **extra},
        headers=headers,
    )


# ----------------------------------------------------------------------------------- menu


@pytest.mark.parametrize("plan,pct", [(PlanCode.GOLD, 15), (PlanCode.SILVER, 5), (None, 0)])
def test_menu_shows_the_members_tier_discount(
    client: TestClient, session: Session, make_member, plan, pct
):
    item = MenuItem(name=f"{TEST_MENU_PREFIX}{uuid.uuid4().hex[:6]}", category="FOOD", price_paise=40000)
    session.add(item)
    session.commit()
    user, _ = make_member(plan)

    response = client.get(f"{API}/dining/menu", headers=_auth(client, user))

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["discount_pct"] == pct
    assert body["tier"] == (plan.value if plan else "WALKIN")
    row = next(i for i in body["items"] if i["id"] == item.id)
    assert row["price_paise"] == 40000
    assert row["member_price_paise"] == 40000 - (40000 * pct + 50) // 100


def test_menu_hides_unavailable_items(client: TestClient, session: Session, make_member):
    item = MenuItem(
        name=f"{TEST_MENU_PREFIX}{uuid.uuid4().hex[:6]}",
        category="SNACK",
        price_paise=1000,
        is_available=False,
    )
    session.add(item)
    session.commit()
    user, _ = make_member()

    ids = [i["id"] for i in client.get(f"{API}/dining/menu", headers=_auth(client, user)).json()["items"]]

    assert item.id not in ids


def test_staff_see_walk_in_prices(client: TestClient, make_user):
    response = client.get(f"{API}/dining/menu", headers=_auth(client, make_user(Role.BAR_STAFF)))

    assert response.status_code == 200
    assert response.json()["discount_pct"] == 0


# ---------------------------------------------------------------------------- reservations


def test_member_reserves_the_smallest_table_that_fits(
    client: TestClient, make_member, make_table
):
    big = make_table(seats=31)
    small = make_table(seats=30)
    user, member = make_member()

    response = _reserve(client, _auth(client, user), _slot(), 30, note="Birthday")

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["table_id"] == small.id != big.id
    assert body["member_id"] == member.id
    assert body["status"] == "CONFIRMED"
    assert body["note"] == "Birthday"
    assert body["start_at"].endswith("Z")
    end = datetime.fromisoformat(body["end_at"].replace("Z", "+00:00"))
    assert end - _slot() == timedelta(minutes=svc.SITTING_MINUTES)


def test_overlapping_sitting_gets_another_table_then_409(
    client: TestClient, make_member, make_table
):
    make_table(seats=32)
    first, second, third = (make_member()[0] for _ in range(3))
    make_table(seats=32)

    assert _reserve(client, _auth(client, first), _slot(hour=19), 32).status_code == 201
    assert _reserve(client, _auth(client, second), _slot(hour=20), 32).status_code == 201
    refused = _reserve(client, _auth(client, third), _slot(hour=19, minute=30), 32)

    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "NO_TABLE_AVAILABLE"


def test_back_to_back_sittings_share_a_table(client: TestClient, make_member, make_table):
    table = make_table(seats=33)
    early, late = make_member()[0], make_member()[0]

    a = _reserve(client, _auth(client, early), _slot(hour=17), 33)
    b = _reserve(client, _auth(client, late), _slot(hour=19), 33)

    assert a.status_code == b.status_code == 201
    assert a.json()["table_id"] == b.json()["table_id"] == table.id


def test_one_reservation_per_member_per_day(client: TestClient, make_member, make_table):
    make_table(seats=34)
    user, _ = make_member()
    headers = _auth(client, user)

    assert _reserve(client, headers, _slot(hour=12), 34).status_code == 201
    again = _reserve(client, headers, _slot(hour=19), 34)

    assert again.status_code == 409
    assert again.json()["error"]["code"] == "DAILY_LIMIT_REACHED"
    assert _reserve(client, headers, _slot(days_ahead=4, hour=19), 34).status_code == 201


@pytest.mark.parametrize(
    "start,code",
    [
        (lambda: _slot(days_ahead=-1), "INVALID_SLOT"),
        (lambda: _slot(hour=7, minute=30), "INVALID_SLOT"),
        (lambda: _slot(hour=21, minute=30), "INVALID_SLOT"),
        (lambda: _slot(hour=19, minute=15), "INVALID_SLOT"),
        (lambda: _slot(days_ahead=svc.ADVANCE_DAYS + 1), "INVALID_SLOT"),
    ],
    ids=["past", "before-open", "after-last-start", "off-grid", "beyond-horizon"],
)
def test_bad_start_times_are_refused(client: TestClient, make_member, start, code):
    user, _ = make_member()

    response = _reserve(client, _auth(client, user), start(), 2)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == code


def test_party_larger_than_any_table_is_409(client: TestClient, make_member):
    user, _ = make_member()

    response = _reserve(client, _auth(client, user), _slot(), 50)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "NO_TABLE_AVAILABLE"


def test_member_cannot_book_for_someone_else(
    client: TestClient, make_member, make_table
):
    make_table(seats=35)
    user, member = make_member()
    _, other = make_member()

    response = _reserve(client, _auth(client, user), _slot(), 35, member_id=other.id)

    assert response.status_code == 201
    assert response.json()["member_id"] == member.id


def test_staff_book_for_a_member(client: TestClient, make_user, make_member, make_table):
    table = make_table(seats=36)
    _, member = make_member()
    headers = _auth(client, make_user(Role.FRONT_DESK))

    missing = _reserve(client, headers, _slot(), 36)
    made = _reserve(client, headers, _slot(), 36, member_id=member.id, table_id=table.id)

    assert missing.status_code == 422
    assert missing.json()["error"]["code"] == "MEMBER_REQUIRED"
    assert made.status_code == 201
    assert made.json()["member_name"] == "Dining Tester"


def test_unknown_fields_are_refused(client: TestClient, make_member):
    user, _ = make_member()

    response = _reserve(client, _auth(client, user), _slot(), 2, status="SEATED")

    assert response.status_code == 422


# ---------------------------------------------------------------- privacy, cancel, staff


def test_members_only_see_their_own_reservations(
    client: TestClient, make_member, make_table
):
    make_table(seats=37)
    owner, _ = make_member()
    snoop, _ = make_member()
    made = _reserve(client, _auth(client, owner), _slot(), 37).json()
    snoop_headers = _auth(client, snoop)

    assert client.get(f"{API}/dining/reservations/{made['id']}", headers=snoop_headers).status_code == 404
    cancel = client.post(f"{API}/dining/reservations/{made['id']}/cancel", headers=snoop_headers)
    assert cancel.status_code == 404
    listed = client.get(f"{API}/dining/reservations", headers=snoop_headers).json()
    assert listed["total"] == 0
    assert listed["items"] == []


def test_cancel_frees_the_table(client: TestClient, make_member, make_table):
    make_table(seats=38)
    first, second = make_member()[0], make_member()[0]
    first_headers = _auth(client, first)
    made = _reserve(client, first_headers, _slot(), 38).json()

    cancelled = client.post(f"{API}/dining/reservations/{made['id']}/cancel", headers=first_headers)
    twice = client.post(f"{API}/dining/reservations/{made['id']}/cancel", headers=first_headers)

    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "CANCELLED"
    assert twice.status_code == 409
    assert _reserve(client, _auth(client, second), _slot(), 38).status_code == 201


def test_staff_seat_or_no_show_a_reservation(
    client: TestClient, make_user, make_member, make_table
):
    make_table(seats=39)
    user, _ = make_member()
    made = _reserve(client, _auth(client, user), _slot(), 39).json()
    url = f"{API}/dining/reservations/{made['id']}/status"

    as_member = client.post(url, json={"status": "SEATED"}, headers=_auth(client, user))
    staff = _auth(client, make_user(Role.BAR_STAFF))
    bad = client.post(url, json={"status": "CANCELLED"}, headers=staff)
    seated = client.post(url, json={"status": "SEATED"}, headers=staff)
    again = client.post(url, json={"status": "NO_SHOW"}, headers=staff)

    assert as_member.status_code == 403
    assert bad.status_code == 422
    assert seated.status_code == 200
    assert seated.json()["status"] == "SEATED"
    assert again.status_code == 409


def test_staff_list_reservations_by_day(client: TestClient, make_user, make_member, make_table):
    make_table(seats=40)
    user, _ = make_member()
    made = _reserve(client, _auth(client, user), _slot(days_ahead=5), 40).json()
    day = local_date(_slot(days_ahead=5)).isoformat()

    listed = client.get(
        f"{API}/dining/reservations",
        params={"date": day},
        headers=_auth(client, make_user(Role.FRONT_DESK)),
    ).json()

    row = next(r for r in listed["items"] if r["id"] == made["id"])
    assert row["member_code"]
    assert row["table_label"].startswith(TEST_TABLE_PREFIX)


# ---------------------------------------------------------------------------- availability


def test_availability_marks_full_slots(client: TestClient, make_member, make_table):
    make_table(seats=41)
    user, _ = make_member()
    headers = _auth(client, user)
    _reserve(client, headers, _slot(days_ahead=6, hour=19), 41)
    day = local_date(_slot(days_ahead=6)).isoformat()

    body = client.get(
        f"{API}/dining/availability", params={"date": day, "party_size": 41}, headers=headers
    ).json()

    by_start = {s["start_at"]: s["available"] for s in body["slots"]}
    assert len(body["slots"]) == 27  # 08:00 .. 21:00 every 30 minutes
    assert by_start[_iso(_slot(days_ahead=6, hour=18))] is False  # overlaps 19:00 - 21:00
    assert by_start[_iso(_slot(days_ahead=6, hour=19, minute=30))] is False
    assert by_start[_iso(_slot(days_ahead=6, hour=17))] is True
    assert by_start[_iso(_slot(days_ahead=6, hour=21))] is True
    assert body["sitting_minutes"] == svc.SITTING_MINUTES


def test_availability_past_slots_are_closed(client: TestClient, make_member):
    user, _ = make_member()
    yesterday = (local_date(utcnow()) - timedelta(days=1)).isoformat()

    body = client.get(
        f"{API}/dining/availability", params={"date": yesterday}, headers=_auth(client, user)
    ).json()

    assert not any(s["available"] for s in body["slots"])


# ----------------------------------------------------------------------------------- race


def test_two_members_racing_for_the_last_table_get_one_reservation(
    make_member, make_table
):
    make_table(seats=42)
    racers = [make_member()[0] for _ in range(2)]
    start_at = _slot(days_ahead=7)

    def attempt(i: int) -> str:
        with SessionLocal() as db:
            actor = db.get(User, racers[i].id)
            try:
                svc.create_reservation(db, actor, {"start_at": start_at, "party_size": 42})
                return "OK"
            except AppError as exc:
                return exc.code
            except Exception as exc:
                return type(exc).__name__

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(attempt, range(2)))

    assert sorted(results) == ["NO_TABLE_AVAILABLE", "OK"], results
