"""Stage 7: public enquiries, the lead pipeline and notifications (F-08/F-09/F-14)."""

import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.enums import Role
from app.models import Lead, Notification, User
from app.security import limiter

from .conftest import API, GOOD_PASSWORD, TEST_PHONE_PREFIX, as_user, login_token, sign_in

LEAD_MARKER = "ZZTEST"


def _token(client: TestClient, user: User) -> str:
    return login_token(client, user.email)


def _auth(token: str) -> dict[str, str]:
    return as_user(token)


def _enquiry(**overrides) -> dict:
    body = {
        "name": f"{LEAD_MARKER} {uuid.uuid4().hex[:6]}",
        "email": f"lead-{uuid.uuid4().hex[:8]}@test.local",
        "phone": TEST_PHONE_PREFIX + uuid.uuid4().int.__str__()[:6],
        "interest": "TRIAL",
        "message": "Saturday morning?",
        "website": "",
    }
    body.update(overrides)
    return body


def _post_enquiry(client: TestClient, **overrides) -> dict:
    response = client.post(f"{API}/public/enquiries", json=_enquiry(**overrides))
    assert response.status_code == 201, response.text
    return response.json()


# ------------------------------------------------------------------------ public form


def test_enquiry_creates_a_lead_and_notifies_staff(client: TestClient, session: Session) -> None:
    body = _post_enquiry(client)
    assert set(body) == {"id", "status"}  # never echoes what we stored
    assert body["status"] == "received"

    lead = session.get(Lead, body["id"])
    assert lead.status == "NEW"
    assert lead.interest == "TRIAL"

    targets = set(
        session.execute(
            select(Notification.target_role).where(
                Notification.type == "NEW_LEAD",
                Notification.dedupe_key.like(f"NEW_LEAD:{lead.id}:%"),
            )
        ).scalars()
    )
    assert targets == {"MANAGER", "FRONT_DESK"}


def test_honeypot_stores_nothing(client: TestClient, session: Session) -> None:
    before = session.execute(select(func.count(Lead.id))).scalar_one()
    body = _post_enquiry(client, website="http://spam.example")

    assert body == {"id": 0, "status": "received"}  # indistinguishable from a real success
    session.expire_all()
    assert session.execute(select(func.count(Lead.id))).scalar_one() == before


def test_enquiry_needs_no_token_and_rejects_unknown_fields(client: TestClient) -> None:
    sneaky = _enquiry()
    sneaky["status"] = "WON"
    assert client.post(f"{API}/public/enquiries", json=sneaky).status_code == 422


def test_control_characters_are_stripped(client: TestClient, session: Session) -> None:
    body = _post_enquiry(client, name=f"{LEAD_MARKER}\x00 Ni\x07na", message="line\nbreak\x1b[31m")
    lead = session.get(Lead, body["id"])
    assert "\x00" not in lead.name and "\x07" not in lead.name
    assert "\x1b" not in lead.message
    assert "\n" in lead.message  # newlines survive in the message


def test_over_long_message_is_rejected(client: TestClient) -> None:
    response = client.post(f"{API}/public/enquiries", json=_enquiry(message="x" * 1001))
    assert response.status_code == 422


def test_unknown_plan_is_ignored_not_404(client: TestClient, session: Session) -> None:
    """A 404 here would tell an anonymous caller which plan ids exist."""
    body = _post_enquiry(client, preferred_plan_id=999999)
    assert session.get(Lead, body["id"]).preferred_plan_id is None


def test_public_enquiry_rate_limit_is_429(client: TestClient, session: Session) -> None:
    """The only test that turns the limiter on; it clears its own rows afterwards."""
    limiter.enabled = True
    limiter.reset()
    made = []
    try:
        for _ in range(30):
            response = client.post(f"{API}/public/enquiries", json=_enquiry())
            assert response.status_code == 201, response.text
            made.append(response.json()["id"])

        blocked = client.post(f"{API}/public/enquiries", json=_enquiry())
        assert blocked.status_code == 429
        assert blocked.json()["error"]["code"] == "RATE_LIMITED"
    finally:
        limiter.enabled = False
        limiter.reset()
        session.execute(delete(Notification).where(Notification.dedupe_key.like("NEW_LEAD:%")))
        session.execute(delete(Lead).where(Lead.id.in_(made)))
        session.commit()


# ------------------------------------------------------------------------ lead pipeline


def test_status_flows_forward_only(client: TestClient, make_user, session: Session) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    lead_id = _post_enquiry(client)["id"]

    for nxt in ("CONTACTED", "QUOTED", "WON"):
        moved = client.patch(f"{API}/leads/{lead_id}", json={"status": nxt}, headers=_auth(token))
        assert moved.status_code == 200, moved.text
        assert moved.json()["status"] == nxt

    back = client.patch(f"{API}/leads/{lead_id}", json={"status": "NEW"}, headers=_auth(token))
    assert back.status_code == 409
    assert back.json()["error"]["code"] == "INVALID_TRANSITION"


def test_assignment_must_be_a_staff_user(client: TestClient, make_user) -> None:
    token = _token(client, make_user(Role.MANAGER))
    lead_id = _post_enquiry(client)["id"]

    staff = make_user(Role.FRONT_DESK)
    ok = client.patch(
        f"{API}/leads/{lead_id}", json={"assigned_to": staff.id}, headers=_auth(token)
    )
    assert ok.status_code == 200
    assert ok.json()["assigned_to"] == staff.id

    member = make_user(Role.MEMBER)
    bad = client.patch(
        f"{API}/leads/{lead_id}", json={"assigned_to": member.id}, headers=_auth(token)
    )
    assert bad.status_code == 404


def test_notes_and_quotes(client: TestClient, make_user) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    lead_id = _post_enquiry(client)["id"]

    note = client.post(
        f"{API}/leads/{lead_id}/notes", json={"body": "Called, will visit"}, headers=_auth(token)
    )
    assert note.status_code == 201
    assert note.json()["body"] == "Called, will visit"
    assert len(client.get(f"{API}/leads/{lead_id}/notes", headers=_auth(token)).json()) == 1

    quote = client.post(
        f"{API}/leads/{lead_id}/quotes",
        json={"amount_paise": 500000, "description": "Gold, 3 months"},
        headers=_auth(token),
    )
    assert quote.status_code == 201, quote.text
    assert quote.json()["status"] == "SENT"

    # Quoting moves the lead to QUOTED on its own.
    assert client.get(f"{API}/leads/{lead_id}", headers=_auth(token)).json()["status"] == "QUOTED"


def test_convert_prefills_then_member_creation_marks_won(
    client: TestClient, make_user, session: Session
) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    enquiry = _enquiry()
    lead_id = client.post(f"{API}/public/enquiries", json=enquiry).json()["id"]

    prefill = client.post(f"{API}/leads/{lead_id}/convert", headers=_auth(token))
    assert prefill.status_code == 200, prefill.text
    body = prefill.json()["member_prefill"]
    assert body["full_name"] == enquiry["name"]
    assert body["phone"] == enquiry["phone"]
    assert body["lead_id"] == lead_id

    # The lead is still open until a member actually exists.
    assert client.get(f"{API}/leads/{lead_id}", headers=_auth(token)).json()["status"] == "NEW"

    created = client.post(
        f"{API}/members",
        json={"full_name": body["full_name"], "phone": body["phone"], "lead_id": lead_id},
        headers=_auth(token),
    )
    assert created.status_code == 201, created.text

    session.expire_all()
    assert client.get(f"{API}/leads/{lead_id}", headers=_auth(token)).json()["status"] == "WON"


def test_converting_twice_is_409(client: TestClient, make_user) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    lead_id = _post_enquiry(client)["id"]
    client.patch(f"{API}/leads/{lead_id}", json={"status": "CONTACTED"}, headers=_auth(token))
    client.patch(f"{API}/leads/{lead_id}", json={"status": "WON"}, headers=_auth(token))

    again = client.post(f"{API}/leads/{lead_id}/convert", headers=_auth(token))
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "ALREADY_CONVERTED"


def test_lost_lead_cannot_be_converted(client: TestClient, make_user) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    lead_id = _post_enquiry(client)["id"]
    client.patch(f"{API}/leads/{lead_id}", json={"status": "LOST"}, headers=_auth(token))

    response = client.post(f"{API}/leads/{lead_id}/convert", headers=_auth(token))
    assert response.status_code == 409


def test_leads_filter_by_status(client: TestClient, make_user) -> None:
    token = _token(client, make_user(Role.MANAGER))
    _post_enquiry(client)
    body = client.get(f"{API}/leads", params={"status": "NEW"}, headers=_auth(token)).json()
    assert body["total"] >= 1
    assert all(item["status"] == "NEW" for item in body["items"])


# ------------------------------------------------------------------------------ RBAC


@pytest.mark.parametrize("role", [Role.MEMBER, Role.BAR_STAFF])
def test_leads_are_staff_only(client: TestClient, make_user, role: Role) -> None:
    token = _token(client, make_user(role))
    lead_id = _post_enquiry(client)["id"]

    assert client.get(f"{API}/leads", headers=_auth(token)).status_code == 403
    assert client.get(f"{API}/leads/{lead_id}", headers=_auth(token)).status_code == 403
    assert client.patch(
        f"{API}/leads/{lead_id}", json={"status": "LOST"}, headers=_auth(token)
    ).status_code == 403


def test_leads_need_a_token(client: TestClient) -> None:
    assert client.get(f"{API}/leads").status_code == 401


# ----------------------------------------------------------------------- notifications


def test_notifications_are_scoped_to_role(client: TestClient, make_user) -> None:
    _post_enquiry(client)

    desk = _token(client, make_user(Role.FRONT_DESK))
    body = client.get(f"{API}/notifications", headers=_auth(desk)).json()
    assert body["total"] >= 1
    assert any(item["type"] == "NEW_LEAD" for item in body["items"])

    bar = _token(client, make_user(Role.BAR_STAFF))
    bar_body = client.get(f"{API}/notifications", headers=_auth(bar)).json()
    assert all(item["type"] != "NEW_LEAD" for item in bar_body["items"])


def test_unread_count_drops_when_read(client: TestClient, make_user) -> None:
    token = _token(client, make_user(Role.FRONT_DESK))
    _post_enquiry(client)

    before = client.get(f"{API}/notifications/unread-count", headers=_auth(token)).json()["unread"]
    assert before >= 1

    newest = client.get(
        f"{API}/notifications", params={"unread_only": True}, headers=_auth(token)
    ).json()["items"][0]

    read = client.post(f"{API}/notifications/{newest['id']}/read", headers=_auth(token))
    assert read.status_code == 200
    assert read.json()["read_at"] is not None

    after = client.get(f"{API}/notifications/unread-count", headers=_auth(token)).json()["unread"]
    assert after == before - 1


def test_cannot_read_someone_elses_notification(client: TestClient, make_user) -> None:
    desk = _token(client, make_user(Role.FRONT_DESK))
    _post_enquiry(client)
    mine = client.get(f"{API}/notifications", headers=_auth(desk)).json()["items"][0]["id"]

    bar = _token(client, make_user(Role.BAR_STAFF))
    assert client.post(f"{API}/notifications/{mine}/read", headers=_auth(bar)).status_code == 404


def test_member_sees_only_their_own_notifications(client: TestClient) -> None:
    login = sign_in(client, "member1@club.test", os.environ.get("SEED_PASSWORD", "Club@12345"))
    body = client.get(f"{API}/notifications", headers=_auth(login["token"])).json()
    assert all(item["type"] != "NEW_LEAD" for item in body["items"])
