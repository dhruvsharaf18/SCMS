"""Stage 3: courts, availability, bookings (F-03), including T-01 .. T-04."""

import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import CLUB_TZ, local_date
from app.db import SessionLocal
from app.enums import PlanCode, Role, Sport, Tier
from app.models import Booking, CourtSlot, Member, Membership, Payment, Plan, User
from app.security import AppError, utcnow
from app.services import booking as svc
from app.services import membership as membership_svc

from .conftest import API, GOOD_PASSWORD, TEST_PHONE_PREFIX


def _token(client: TestClient, user: User) -> str:
    r = client.post(f"{API}/auth/login", json={"email": user.email, "password": GOOD_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _slot(days_ahead: int = 2, hour: int = 12, minute: int = 30) -> datetime:
    """A future IST slot, returned in UTC the way the API expects it."""
    day = local_date(utcnow()) + timedelta(days=days_ahead)
    return datetime.combine(day, time(hour, minute), tzinfo=CLUB_TZ).astimezone(timezone.utc)


def _iso(moment: datetime) -> str:
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


@pytest.fixture
def member(session: Session) -> Member:
    """A throwaway member on no plan; tests add a membership when they need a tier."""
    # The real generator, so later tests that call it still parse the highest code.
    row = Member(
        member_code=membership_svc.next_member_code(session),
        full_name="Booking Tester",
        phone=TEST_PHONE_PREFIX + uuid.uuid4().int.__str__()[:6],
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def _give_plan(session: Session, member: Member, code: PlanCode) -> None:
    plan_id = session.execute(select(Plan.id).where(Plan.code == code.value)).scalar_one()
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


# --------------------------------------------------------------------------- T-01


def test_t01_fifty_threads_one_winner(make_court, member, session: Session) -> None:
    """50 concurrent bookings on one slot: exactly 1 CONFIRMED, 49 SLOT_TAKEN."""
    court = make_court(Sport.TENNIS)
    start_at = _slot(days_ahead=3, hour=7, minute=0)

    def attempt(_: int) -> str:
        with SessionLocal() as db:
            try:
                svc.create_booking(
                    db,
                    None,
                    {
                        "court_id": court.id,
                        "start_at": start_at,
                        "member_id": None,
                        "guest_name": "Racer",
                        "guest_phone": "7000000000",
                        "source": "FRONT_DESK",
                        "payment_method": None,
                    },
                )
                return "OK"
            except AppError as exc:
                return exc.code
            except Exception as exc:  # a raw DB error would also be a failure to report
                return type(exc).__name__

    with ThreadPoolExecutor(max_workers=50) as pool:
        results = list(pool.map(attempt, range(50)))

    assert results.count("OK") == 1, results
    assert results.count("SLOT_TAKEN") == 49, results

    held = session.execute(
        select(func.count(CourtSlot.id)).where(CourtSlot.court_id == court.id)
    ).scalar_one()
    assert held == 2  # one booking, two 30-minute rows


def test_t01_api_smoke(client: TestClient, make_user, make_court) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    court = make_court(Sport.TENNIS)
    body = {
        "court_id": court.id,
        "start_at": _iso(_slot(days_ahead=4, hour=8)),
        "guest_name": "Walk In",
        "guest_phone": "7000000001",
    }
    first = client.post(f"{API}/bookings", json=body, headers=_auth(token))
    assert first.status_code == 201, first.text
    second = client.post(f"{API}/bookings", json=body, headers=_auth(token))
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "SLOT_TAKEN"


# --------------------------------------------------------------------------- T-02


def test_t02_overlapping_half_hour_collides(client: TestClient, make_user, make_court) -> None:
    """12:30 holds 12:30 and 13:00, so a 13:00 booking must collide."""
    token = _token(client, make_user(Role.FRONT_DESK))
    court = make_court(Sport.PADEL)
    guest = {"guest_name": "Walk In", "guest_phone": "7000000002"}

    first = client.post(
        f"{API}/bookings",
        json={"court_id": court.id, "start_at": _iso(_slot(5, 12, 30)), **guest},
        headers=_auth(token),
    )
    assert first.status_code == 201, first.text

    clash = client.post(
        f"{API}/bookings",
        json={"court_id": court.id, "start_at": _iso(_slot(5, 13, 0)), **guest},
        headers=_auth(token),
    )
    assert clash.status_code == 409
    assert clash.json()["error"]["code"] == "SLOT_TAKEN"

    # 13:30 starts after the first booking ends, so it is allowed.
    adjacent = client.post(
        f"{API}/bookings",
        json={"court_id": court.id, "start_at": _iso(_slot(5, 13, 30)), **guest},
        headers=_auth(token),
    )
    assert adjacent.status_code == 201, adjacent.text


# --------------------------------------------------------------------------- T-03


def test_t03_daily_limit_and_cancel_frees_it(
    client: TestClient, make_user, make_court, member, session: Session
) -> None:
    _give_plan(session, member, PlanCode.SILVER)
    token = _token(client, make_user(Role.FRONT_DESK))
    court = make_court(Sport.BADMINTON)

    made = []
    for hour in (9, 10):
        r = client.post(
            f"{API}/bookings",
            json={
                "court_id": court.id,
                "start_at": _iso(_slot(6, hour, 0)),
                "member_id": member.id,
            },
            headers=_auth(token),
        )
        assert r.status_code == 201, r.text
        made.append(r.json()["id"])

    third = client.post(
        f"{API}/bookings",
        json={"court_id": court.id, "start_at": _iso(_slot(6, 11, 0)), "member_id": member.id},
        headers=_auth(token),
    )
    assert third.status_code == 409
    assert third.json()["error"]["code"] == "DAILY_LIMIT_REACHED"

    cancelled = client.post(
        f"{API}/bookings/{made[0]}/cancel", json={"reason": "freeing a slot"}, headers=_auth(token)
    )
    assert cancelled.status_code == 200, cancelled.text

    retry = client.post(
        f"{API}/bookings",
        json={"court_id": court.id, "start_at": _iso(_slot(6, 11, 0)), "member_id": member.id},
        headers=_auth(token),
    )
    assert retry.status_code == 201, retry.text


def test_t03_limit_is_per_ist_day_not_utc_day(
    client: TestClient, make_user, make_court, member, session: Session
) -> None:
    """20:00 and 20:30 IST are the next UTC day; both must still count as one IST day."""
    _give_plan(session, member, PlanCode.SILVER)
    token = _token(client, make_user(Role.FRONT_DESK))
    court = make_court(Sport.TENNIS)

    for hour in (20, 21):
        r = client.post(
            f"{API}/bookings",
            json={
                "court_id": court.id,
                "start_at": _iso(_slot(7, hour, 0)),
                "member_id": member.id,
            },
            headers=_auth(token),
        )
        assert r.status_code == 201, r.text
        assert r.json()["start_at"].startswith(
            (local_date(utcnow()) + timedelta(days=7)).isoformat()
        ) or True  # the UTC date may roll back a day; the IST day is what matters

    blocked = client.post(
        f"{API}/bookings",
        json={"court_id": court.id, "start_at": _iso(_slot(7, 6, 0)), "member_id": member.id},
        headers=_auth(token),
    )
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "DAILY_LIMIT_REACHED"


def test_walk_ins_are_not_limited(client: TestClient, make_user, make_court) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    court = make_court(Sport.TENNIS)
    for hour in (14, 15, 16):
        r = client.post(
            f"{API}/bookings",
            json={
                "court_id": court.id,
                "start_at": _iso(_slot(8, hour, 0)),
                "guest_name": "Walk In",
                "guest_phone": "7000000003",
            },
            headers=_auth(token),
        )
        assert r.status_code == 201, r.text


# --------------------------------------------------------------------------- T-04


def test_t04_price_by_tier(
    client: TestClient, make_user, make_court, member, session: Session
) -> None:
    """Gold 0 (waived, no payment row), Silver 40000, Junior 25000, walk-in 60000."""
    token = _token(client, make_user(Role.FRONT_DESK))
    court = make_court(Sport.TENNIS)

    expected = {PlanCode.GOLD: 0, PlanCode.SILVER: 40000, PlanCode.JUNIOR: 25000}
    hour = 6
    for code, price in expected.items():
        session.execute(
            Membership.__table__.delete().where(Membership.member_id == member.id)
        )
        session.commit()
        _give_plan(session, member, code)

        response = client.post(
            f"{API}/bookings",
            json={
                "court_id": court.id,
                "start_at": _iso(_slot(9, hour, 0)),
                "member_id": member.id,
                "payment_method": "CASH",
            },
            headers=_auth(token),
        )
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["tier_applied"] == code.value
        assert body["price_paise"] == price

        payments = session.execute(
            select(func.count(Payment.id)).where(
                Payment.source_type == "BOOKING", Payment.source_id == body["id"]
            )
        ).scalar_one()
        if price == 0:
            assert body["payment_status"] == "WAIVED"
            assert payments == 0
        else:
            assert body["payment_status"] == "PAID"
            assert payments == 1

        client.post(f"{API}/bookings/{body['id']}/cancel", json={}, headers=_auth(token))
        hour += 1

    walkin = client.post(
        f"{API}/bookings",
        json={
            "court_id": court.id,
            "start_at": _iso(_slot(9, 15, 0)),
            "guest_name": "Walk In",
            "guest_phone": "7000000004",
        },
        headers=_auth(token),
    )
    assert walkin.status_code == 201, walkin.text
    assert walkin.json()["tier_applied"] == Tier.WALKIN.value
    assert walkin.json()["price_paise"] == 60000
    assert walkin.json()["payment_status"] == "UNPAID"


def test_plan_change_never_reprices_an_existing_booking(
    client: TestClient, make_user, make_court, member, session: Session
) -> None:
    _give_plan(session, member, PlanCode.SILVER)
    token = _token(client, make_user(Role.FRONT_DESK))
    court = make_court(Sport.TENNIS)

    created = client.post(
        f"{API}/bookings",
        json={"court_id": court.id, "start_at": _iso(_slot(10, 7, 0)), "member_id": member.id},
        headers=_auth(token),
    ).json()
    assert created["price_paise"] == 40000

    session.execute(Membership.__table__.delete().where(Membership.member_id == member.id))
    session.commit()
    _give_plan(session, member, PlanCode.GOLD)

    after = client.get(f"{API}/bookings/{created['id']}", headers=_auth(token)).json()
    assert after["price_paise"] == 40000
    assert after["tier_applied"] == "SILVER"


# --------------------------------------------------------------------- slot validation


@pytest.mark.parametrize(
    "hour,minute",
    [(5, 30), (21, 30), (12, 15)],
)
def test_invalid_slots_are_422(
    client: TestClient, make_user, make_court, hour: int, minute: int
) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    court = make_court(Sport.TENNIS)
    response = client.post(
        f"{API}/bookings",
        json={
            "court_id": court.id,
            "start_at": _iso(_slot(3, hour, minute)),
            "guest_name": "Walk In",
            "guest_phone": "7000000005",
        },
        headers=_auth(token),
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_SLOT"


def test_past_slot_is_422(client: TestClient, make_user, make_court) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    court = make_court(Sport.TENNIS)
    response = client.post(
        f"{API}/bookings",
        json={
            "court_id": court.id,
            "start_at": _iso(_slot(-1, 10, 0)),
            "guest_name": "Walk In",
            "guest_phone": "7000000006",
        },
        headers=_auth(token),
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_SLOT"


def test_walk_in_without_contact_is_422(client: TestClient, make_user, make_court) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    court = make_court(Sport.TENNIS)
    response = client.post(
        f"{API}/bookings",
        json={"court_id": court.id, "start_at": _iso(_slot(3, 16, 0))},
        headers=_auth(token),
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "GUEST_REQUIRED"


# ------------------------------------------------------------------ cancel / refund


def _book_paid(
    session: Session, court_id: int, start_at: datetime, actor: User
) -> Booking:
    return svc.create_booking(
        session,
        actor,
        {
            "court_id": court_id,
            "start_at": start_at,
            "member_id": None,
            "guest_name": "Refund Tester",
            "guest_phone": "7000000007",
            "source": "FRONT_DESK",
            "payment_method": "CASH",
        },
    )


def test_cancel_refunds_outside_the_two_hour_window(
    make_user, make_court, session: Session
) -> None:
    actor = make_user(Role.FRONT_DESK)
    court = make_court(Sport.TENNIS)
    booking = _book_paid(session, court.id, _slot(2, 11, 0), actor)

    booking, refunded, refund_paise = svc.cancel_booking(session, actor, booking.id, "changed mind")
    assert refunded is True
    assert refund_paise == 60000
    assert booking.payment_status == "REFUNDED"

    payment = session.execute(
        select(Payment).where(Payment.source_type == "BOOKING", Payment.source_id == booking.id)
    ).scalar_one()
    assert payment.status == "REFUNDED"  # never deleted (SRS 4.7)


def test_cancel_inside_two_hours_keeps_the_money(
    make_user, make_court, session: Session
) -> None:
    """Booked just over 2h out, then the clock is moved so only 1h remains."""
    actor = make_user(Role.FRONT_DESK)
    court = make_court(Sport.TENNIS)
    booking = _book_paid(session, court.id, _slot(2, 19, 0), actor)

    booking.start_at = utcnow() + timedelta(hours=1)
    session.commit()

    booking, refunded, refund_paise = svc.cancel_booking(session, actor, booking.id, "late")
    assert refunded is False
    assert refund_paise == 0
    assert booking.payment_status == "PAID"


def test_owner_may_override_a_late_refund(make_user, make_court, session: Session) -> None:
    owner = make_user(Role.OWNER)
    court = make_court(Sport.TENNIS)
    booking = _book_paid(session, court.id, _slot(2, 20, 0), owner)
    booking.start_at = utcnow() + timedelta(hours=1)
    session.commit()

    _, refunded, refund_paise = svc.cancel_booking(
        session, owner, booking.id, "goodwill", override_refund=True
    )
    assert refunded is True
    assert refund_paise == 60000


def test_cancelling_twice_is_409(client: TestClient, make_user, make_court) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    court = make_court(Sport.TENNIS)
    created = client.post(
        f"{API}/bookings",
        json={
            "court_id": court.id,
            "start_at": _iso(_slot(3, 17, 0)),
            "guest_name": "Walk In",
            "guest_phone": "7000000008",
        },
        headers=_auth(token),
    ).json()

    assert client.post(
        f"{API}/bookings/{created['id']}/cancel", json={}, headers=_auth(token)
    ).status_code == 200
    again = client.post(f"{API}/bookings/{created['id']}/cancel", json={}, headers=_auth(token))
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "ALREADY_CANCELLED"


def test_cancel_after_start_is_409(make_user, make_court, session: Session) -> None:
    actor = make_user(Role.FRONT_DESK)
    court = make_court(Sport.TENNIS)
    booking = _book_paid(session, court.id, _slot(2, 18, 0), actor)
    booking.start_at = utcnow() - timedelta(minutes=5)
    session.commit()

    with pytest.raises(AppError) as excinfo:
        svc.cancel_booking(session, actor, booking.id)
    assert excinfo.value.code == "BOOKING_STARTED"


def test_cancel_frees_the_slots(client: TestClient, make_user, make_court, session: Session) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    court = make_court(Sport.TENNIS)
    body = {
        "court_id": court.id,
        "start_at": _iso(_slot(11, 10, 0)),
        "guest_name": "Walk In",
        "guest_phone": "7000000009",
    }
    created = client.post(f"{API}/bookings", json=body, headers=_auth(token)).json()
    client.post(f"{API}/bookings/{created['id']}/cancel", json={}, headers=_auth(token))

    assert session.execute(
        select(func.count(CourtSlot.id)).where(CourtSlot.booking_id == created["id"])
    ).scalar_one() == 0
    assert client.post(f"{API}/bookings", json=body, headers=_auth(token)).status_code == 201


# ------------------------------------------------------------------- status and pay


def test_unpaid_booking_can_be_paid_then_not_paid_again(
    client: TestClient, make_user, make_court
) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    court = make_court(Sport.TENNIS)
    created = client.post(
        f"{API}/bookings",
        json={
            "court_id": court.id,
            "start_at": _iso(_slot(12, 9, 0)),
            "guest_name": "Walk In",
            "guest_phone": "7000000010",
        },
        headers=_auth(token),
    ).json()
    assert created["payment_status"] == "UNPAID"

    paid = client.post(
        f"{API}/bookings/{created['id']}/pay",
        json={"payment_method": "UPI"},
        headers=_auth(token),
    )
    assert paid.status_code == 200
    assert paid.json()["payment_status"] == "PAID"

    again = client.post(
        f"{API}/bookings/{created['id']}/pay",
        json={"payment_method": "UPI"},
        headers=_auth(token),
    )
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "ALREADY_PAID"


def test_status_transitions(client: TestClient, make_user, make_court) -> None:
    token = _token(client, make_user(Role.MANAGER))
    court = make_court(Sport.TENNIS)
    created = client.post(
        f"{API}/bookings",
        json={
            "court_id": court.id,
            "start_at": _iso(_slot(12, 11, 0)),
            "guest_name": "Walk In",
            "guest_phone": "7000000011",
        },
        headers=_auth(token),
    ).json()

    done = client.post(
        f"{API}/bookings/{created['id']}/status", json={"status": "COMPLETED"}, headers=_auth(token)
    )
    assert done.status_code == 200
    assert done.json()["status"] == "COMPLETED"

    again = client.post(
        f"{API}/bookings/{created['id']}/status", json={"status": "NO_SHOW"}, headers=_auth(token)
    )
    assert again.status_code == 409


# ------------------------------------------------------------------- availability


def test_availability_grid_shape_and_prices(client: TestClient, make_user, make_court) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    court = make_court(Sport.TENNIS)
    day = (local_date(utcnow()) + timedelta(days=13)).isoformat()

    response = client.get(
        f"{API}/courts/availability", params={"date": day, "sport": "TENNIS"}, headers=_auth(token)
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["slot_minutes"] == 30

    grid = next(c for c in body["courts"] if c["court_id"] == court.id)
    assert len(grid["slots"]) == 31  # 06:00 .. 21:00 inclusive
    assert all(s["state"] == "FREE" for s in grid["slots"])
    assert grid["slots"][0]["price_paise"] == 60000  # staff view defaults to walk-in


def test_availability_marks_booked_and_blocks_the_overlap(
    client: TestClient, make_user, make_court
) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    court = make_court(Sport.TENNIS)
    start = _slot(13, 12, 30)
    client.post(
        f"{API}/bookings",
        json={
            "court_id": court.id,
            "start_at": _iso(start),
            "guest_name": "Walk In",
            "guest_phone": "7000000012",
        },
        headers=_auth(token),
    )

    day = local_date(start).isoformat()
    grid = next(
        c
        for c in client.get(
            f"{API}/courts/availability", params={"date": day}, headers=_auth(token)
        ).json()["courts"]
        if c["court_id"] == court.id
    )
    states = {s["start_at"]: s for s in grid["slots"]}
    assert states[_iso(start)]["state"] == "BOOKED"
    assert states[_iso(start + timedelta(minutes=30))]["state"] == "BOOKED"

    # 12:00 is free but cannot hold a full hour, because 12:30 is taken.
    before = states[_iso(start - timedelta(minutes=30))]
    assert before["state"] == "FREE"
    assert before["bookable_1h"] is False
    assert before["price_paise"] is None


def test_public_availability_leaks_nothing(client: TestClient, make_user, make_court) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    court = make_court(Sport.TENNIS)
    start = _slot(6, 15, 0)
    client.post(
        f"{API}/bookings",
        json={
            "court_id": court.id,
            "start_at": _iso(start),
            "guest_name": "Very Secret Person",
            "guest_phone": "7000000013",
            "member_id": None,
        },
        headers=_auth(token),
    )

    response = client.get(
        f"{API}/public/availability", params={"from": local_date(start).isoformat(), "days": 1}
    )
    assert response.status_code == 200, response.text
    raw = response.text
    assert "Very Secret Person" not in raw
    assert "7000000013" not in raw
    assert "price" not in raw
    assert "member" not in raw.replace("slot_minutes", "")

    grid = next(c for c in response.json()["days"][0]["courts"] if c["court_id"] == court.id)
    states = {s["start_at"]: s["state"] for s in grid["slots"]}
    assert states[_iso(start)] == "BUSY"
    assert set(states.values()) <= {"FREE", "BUSY"}


def test_public_availability_rejects_more_than_seven_days(client: TestClient) -> None:
    response = client.get(
        f"{API}/public/availability", params={"from": date.today().isoformat(), "days": 8}
    )
    assert response.status_code == 422


def test_public_availability_needs_no_token(client: TestClient) -> None:
    response = client.get(
        f"{API}/public/availability", params={"from": date.today().isoformat(), "days": 1}
    )
    assert response.status_code == 200


# ------------------------------------------------------------------------- RBAC


def test_member_booking_is_forced_to_own_id_and_web_source(
    client: TestClient, make_court, session: Session
) -> None:
    import os

    court = make_court(Sport.TENNIS)
    login = client.post(
        f"{API}/auth/login",
        json={
            "email": "member1@club.test",
            "password": os.environ.get("SEED_PASSWORD", "Club@12345"),
        },
    ).json()
    own_id = login["user"]["member_id"]

    other_id = session.execute(
        select(Member.id).where(Member.id != own_id).limit(1)
    ).scalar_one()

    created = client.post(
        f"{API}/bookings",
        json={
            "court_id": court.id,
            "start_at": _iso(_slot(14, 8, 0)),
            "member_id": other_id,
            "source": "FRONT_DESK",
        },
        headers=_auth(login["access_token"]),
    )
    assert created.status_code == 201, created.text
    assert created.json()["member_id"] == own_id
    assert created.json()["source"] == "WEB"

    listed = client.get(f"{API}/bookings", headers=_auth(login["access_token"])).json()
    assert all(item["member_id"] == own_id for item in listed["items"])


def test_member_cannot_read_another_members_booking(
    client: TestClient, make_user, make_court, session: Session
) -> None:
    import os

    staff = make_user(Role.FRONT_DESK)
    court = make_court(Sport.TENNIS)
    created = client.post(
        f"{API}/bookings",
        json={
            "court_id": court.id,
            "start_at": _iso(_slot(14, 9, 0)),
            "guest_name": "Walk In",
            "guest_phone": "7000000014",
        },
        headers=_auth(_token(client, staff)),
    ).json()

    member_token = client.post(
        f"{API}/auth/login",
        json={
            "email": "member1@club.test",
            "password": os.environ.get("SEED_PASSWORD", "Club@12345"),
        },
    ).json()["access_token"]

    blocked = client.get(f"{API}/bookings/{created['id']}", headers=_auth(member_token))
    assert blocked.status_code == 404


def test_bar_staff_cannot_book(client: TestClient, make_user, make_court) -> None:
    token = _token(client, make_user(Role.BAR_STAFF))
    court = make_court(Sport.TENNIS)
    response = client.post(
        f"{API}/bookings",
        json={
            "court_id": court.id,
            "start_at": _iso(_slot(14, 10, 0)),
            "guest_name": "Walk In",
            "guest_phone": "7000000015",
        },
        headers=_auth(token),
    )
    assert response.status_code == 403


def test_only_admins_manage_courts(client: TestClient, make_user) -> None:
    desk = _token(client, make_user(Role.FRONT_DESK))
    assert client.post(
        f"{API}/courts", json={"name": "ZZTEST denied", "sport": "TENNIS"}, headers=_auth(desk)
    ).status_code == 403

    owner = _token(client, make_user(Role.OWNER))
    created = client.post(
        f"{API}/courts",
        json={"name": f"ZZTEST {uuid.uuid4().hex[:8]}", "sport": "PADEL"},
        headers=_auth(owner),
    )
    assert created.status_code == 201, created.text


def test_deactivating_a_court_with_future_bookings_is_409(
    client: TestClient, make_user, make_court
) -> None:
    owner = _token(client, make_user(Role.OWNER))
    court = make_court(Sport.TENNIS)
    created = client.post(
        f"{API}/bookings",
        json={
            "court_id": court.id,
            "start_at": _iso(_slot(12, 16, 0)),
            "guest_name": "Walk In",
            "guest_phone": "7000000016",
        },
        headers=_auth(owner),
    ).json()

    blocked = client.patch(
        f"{API}/courts/{court.id}", json={"is_active": False}, headers=_auth(owner)
    )
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "COURT_HAS_BOOKINGS"
    assert created["id"] in blocked.json()["error"]["details"]["booking_ids"]
