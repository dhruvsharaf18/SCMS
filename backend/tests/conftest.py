import uuid
from collections.abc import Callable, Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, or_, select, update
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.enums import Role, Sport
from app.main import app
from app.models import (
    AuditLog,
    BarOrder,
    BarOrderItem,
    BarTable,
    Booking,
    Court,
    CourtSlot,
    Client,
    Employee,
    Expense,
    Invoice,
    InvoiceLine,
    Lead,
    LeaveRequest,
    LeadNote,
    Member,
    Membership,
    MenuItem,
    Notification,
    Payment,
    Payroll,
    Product,
    Quote,
    LoginSession,
    ShopOrder,
    ShopOrderItem,
    SocialParticipant,
    Shift,
    SocialSession,
    StockMovement,
    TableReservation,
    User,
)
from app.security import SESSION_COOKIE_NAME, hash_password, limiter

API = "/api/v1"
TEST_EMAIL_PREFIX = "test-"
TEST_EMAIL_DOMAIN = "@test.local"
GOOD_PASSWORD = "Str0ngPassword"
TEST_PHONE_PREFIX = "7999"
# Booking tests only ever touch courts they created, so seeded courts keep a clean grid.
TEST_COURT_PREFIX = "ZZTEST"
TEST_SKU_PREFIX = "ZZTEST-"
TEST_MENU_PREFIX = "ZZTEST "
TEST_TABLE_PREFIX = "ZZT-"
TEST_LEAD_PREFIX = "ZZTEST"
TEST_EMPLOYEE_PREFIX = "ZZTEST"


def sign_in(client: TestClient, email: str, password: str = GOOD_PASSWORD) -> dict:
    """The login body with the session id added under "token"; the cookie jar is left empty.

    Tests juggle several users on one client, so each request names its user explicitly
    through `as_user` instead of inheriting whoever logged in last.
    """
    response = client.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    body = response.json()
    body["token"] = response.cookies[SESSION_COOKIE_NAME]
    client.cookies.clear()
    return body


def login_token(client: TestClient, email: str, password: str = GOOD_PASSWORD) -> str:
    return sign_in(client, email, password)["token"]


def as_user(token: str) -> dict[str, str]:
    return {"Cookie": f"{SESSION_COOKIE_NAME}={token}"}


@pytest.fixture(autouse=True)
def _limiter_disabled() -> Iterator[None]:
    """Only the rate-limit test turns this on, and it restores it afterwards."""
    limiter.enabled = False
    yield
    limiter.enabled = False


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def session() -> Iterator[Session]:
    with SessionLocal() as db:
        yield db


@pytest.fixture
def make_user(session: Session) -> Callable[..., User]:
    """Throwaway users only. Seeded accounts are never touched."""

    def _make(
        role: Role = Role.FRONT_DESK,
        password: str = GOOD_PASSWORD,
        is_active: bool = True,
    ) -> User:
        user = User(
            email=f"{TEST_EMAIL_PREFIX}{uuid.uuid4().hex[:12]}{TEST_EMAIL_DOMAIN}",
            password_hash=hash_password(password),
            full_name="Test User",
            role=role.value,
            is_active=is_active,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        return user

    return _make


@pytest.fixture
def make_court(session: Session) -> Callable[..., Court]:
    def _make(sport: Sport = Sport.TENNIS) -> Court:
        court = Court(name=f"{TEST_COURT_PREFIX} {uuid.uuid4().hex[:8]}", sport=sport.value)
        session.add(court)
        session.commit()
        session.refresh(court)
        return court

    return _make


@pytest.fixture(scope="session", autouse=True)
def _cleanup_test_rows() -> Iterator[None]:
    """Remove everything the suite created, in foreign-key order. Seed rows stay."""
    yield
    with SessionLocal() as db:
        user_ids = (
            db.execute(
                select(User.id).where(User.email.like(f"{TEST_EMAIL_PREFIX}%{TEST_EMAIL_DOMAIN}"))
            )
            .scalars()
            .all()
        )
        member_ids = (
            db.execute(select(Member.id).where(Member.phone.like(f"{TEST_PHONE_PREFIX}%")))
            .scalars()
            .all()
        )

        employee_ids = (
            db.execute(
                select(Employee.id).where(Employee.full_name.like(f"{TEST_EMPLOYEE_PREFIX}%"))
            )
            .scalars()
            .all()
        )
        if employee_ids:
            db.execute(delete(Shift).where(Shift.employee_id.in_(employee_ids)))
            db.execute(delete(LeaveRequest).where(LeaveRequest.employee_id.in_(employee_ids)))
            db.execute(delete(Payroll).where(Payroll.employee_id.in_(employee_ids)))
            db.execute(delete(Employee).where(Employee.id.in_(employee_ids)))
            db.execute(delete(Expense).where(Expense.category == "PAYROLL"))
            db.execute(
                delete(Notification).where(Notification.dedupe_key.like("LEAVE_REQUEST:%"))
            )

        client_ids = (
            db.execute(select(Client.id).where(Client.company_name.like(f"{TEST_LEAD_PREFIX}%")))
            .scalars()
            .all()
        )
        if client_ids:
            invoice_ids = (
                db.execute(select(Invoice.id).where(Invoice.client_id.in_(client_ids)))
                .scalars()
                .all()
            )
            if invoice_ids:
                db.execute(delete(InvoiceLine).where(InvoiceLine.invoice_id.in_(invoice_ids)))
                db.execute(
                    delete(Payment).where(
                        Payment.source_type == "INVOICE", Payment.source_id.in_(invoice_ids)
                    )
                )
                db.execute(delete(Invoice).where(Invoice.id.in_(invoice_ids)))
            db.execute(delete(Client).where(Client.id.in_(client_ids)))

        lead_ids = (
            db.execute(select(Lead.id).where(Lead.name.like(f"{TEST_LEAD_PREFIX}%")))
            .scalars()
            .all()
        )
        if lead_ids:
            db.execute(delete(LeadNote).where(LeadNote.lead_id.in_(lead_ids)))
            db.execute(delete(Quote).where(Quote.lead_id.in_(lead_ids)))
            db.execute(update(Member).where(Member.lead_id.in_(lead_ids)).values(lead_id=None))
            db.execute(
                delete(Notification).where(
                    Notification.type == "NEW_LEAD",
                    Notification.dedupe_key.like("NEW_LEAD:%"),
                )
            )
            db.execute(delete(Lead).where(Lead.id.in_(lead_ids)))

        menu_ids = (
            db.execute(select(MenuItem.id).where(MenuItem.name.like(f"{TEST_MENU_PREFIX}%")))
            .scalars()
            .all()
        )
        if menu_ids:
            bar_order_ids = (
                db.execute(
                    select(BarOrderItem.order_id)
                    .where(BarOrderItem.menu_item_id.in_(menu_ids))
                    .distinct()
                )
                .scalars()
                .all()
            )
            db.execute(delete(BarOrderItem).where(BarOrderItem.menu_item_id.in_(menu_ids)))
            if bar_order_ids:
                db.execute(
                    delete(Payment).where(
                        Payment.source_type == "BAR_ORDER", Payment.source_id.in_(bar_order_ids)
                    )
                )
                db.execute(delete(BarOrder).where(BarOrder.id.in_(bar_order_ids)))
            db.execute(delete(MenuItem).where(MenuItem.id.in_(menu_ids)))
        test_table_ids = select(BarTable.id).where(BarTable.label.like(f"{TEST_TABLE_PREFIX}%"))
        db.execute(
            delete(TableReservation).where(
                or_(
                    TableReservation.table_id.in_(test_table_ids),
                    TableReservation.member_id.in_(member_ids or [0]),
                    TableReservation.created_by.in_(user_ids or [0]),
                )
            )
        )
        db.execute(delete(BarTable).where(BarTable.label.like(f"{TEST_TABLE_PREFIX}%")))

        product_ids = (
            db.execute(select(Product.id).where(Product.sku.like(f"{TEST_SKU_PREFIX}%")))
            .scalars()
            .all()
        )
        if product_ids:
            order_ids = (
                db.execute(
                    select(ShopOrderItem.order_id)
                    .where(ShopOrderItem.product_id.in_(product_ids))
                    .distinct()
                )
                .scalars()
                .all()
            )
            db.execute(delete(StockMovement).where(StockMovement.product_id.in_(product_ids)))
            db.execute(delete(ShopOrderItem).where(ShopOrderItem.product_id.in_(product_ids)))
            if order_ids:
                db.execute(
                    delete(Payment).where(
                        Payment.source_type == "SHOP_ORDER", Payment.source_id.in_(order_ids)
                    )
                )
                db.execute(delete(ShopOrder).where(ShopOrder.id.in_(order_ids)))
            db.execute(delete(Product).where(Product.id.in_(product_ids)))

        court_ids = (
            db.execute(select(Court.id).where(Court.name.like(f"{TEST_COURT_PREFIX}%")))
            .scalars()
            .all()
        )
        if court_ids:
            booking_ids = (
                db.execute(select(Booking.id).where(Booking.court_id.in_(court_ids)))
                .scalars()
                .all()
            )
            social_ids = (
                db.execute(select(SocialSession.id).where(SocialSession.court_id.in_(court_ids)))
                .scalars()
                .all()
            )
            db.execute(delete(CourtSlot).where(CourtSlot.court_id.in_(court_ids)))
            if social_ids:
                db.execute(
                    delete(SocialParticipant).where(SocialParticipant.session_id.in_(social_ids))
                )
                db.execute(
                    delete(Payment).where(
                        Payment.source_type == "SOCIAL", Payment.source_id.in_(social_ids)
                    )
                )
                db.execute(delete(SocialSession).where(SocialSession.id.in_(social_ids)))
            if booking_ids:
                db.execute(
                    delete(Payment).where(
                        Payment.source_type == "BOOKING", Payment.source_id.in_(booking_ids)
                    )
                )
                db.execute(delete(Booking).where(Booking.id.in_(booking_ids)))
            db.execute(delete(Court).where(Court.id.in_(court_ids)))

        if member_ids:
            db.execute(delete(Payment).where(Payment.member_id.in_(member_ids)))
            db.execute(delete(Membership).where(Membership.member_id.in_(member_ids)))
            db.execute(delete(Member).where(Member.id.in_(member_ids)))

        if user_ids:
            db.execute(delete(Expense).where(Expense.created_by.in_(user_ids)))
            db.execute(delete(LoginSession).where(LoginSession.user_id.in_(user_ids)))
            db.execute(delete(AuditLog).where(AuditLog.actor_id.in_(user_ids)))
            db.execute(
                delete(AuditLog).where(AuditLog.entity == "user", AuditLog.entity_id.in_(user_ids))
            )
            # Nullable back-references on rows we keep.
            db.execute(
                update(Membership)
                .where(Membership.created_by.in_(user_ids))
                .values(created_by=None)
            )
            db.execute(
                update(Payment).where(Payment.received_by.in_(user_ids)).values(received_by=None)
            )
            db.execute(delete(User).where(User.id.in_(user_ids)))
        db.commit()
