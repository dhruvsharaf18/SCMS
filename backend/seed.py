"""Deterministic demo data (SRS 10.1).

Every section is idempotent on its own table, so adding a section later still runs
even though users already exist. The API calls this on every startup when SEED=true.
"""

import os
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import CLUB_TZ, settings
from app.enums import (
    BookingSource,
    BookingStatus,
    KitchenStatus,
    LeadInterest,
    LeadStatus,
    MembershipStatus,
    MenuCategory,
    PaymentMethod,
    PlanCode,
    ProductCategory,
    Role,
    ShopChannel,
    ShopOrderStatus,
    SourceType,
    Sport,
    Tier,
)
from app.models import (
    BarTable,
    Court,
    CourtPrice,
    CourtSlot,
    Lead,
    MenuItem,
    Member,
    Membership,
    Payment,
    Plan,
    Product,
    TableReservation,
    User,
)
from app.security import AppError, hash_password
from app.services import bar as bar_svc
from app.services import booking as booking_svc
from app.services import dining as dining_svc
from app.services import leads as leads_svc
from app.services import shop as shop_svc
from app.services import social as social_svc

SEED_USERS: tuple[tuple[str, str, Role], ...] = (
    ("owner@club.test", "Owner", Role.OWNER),
    ("manager@club.test", "Manager", Role.MANAGER),
    ("desk@club.test", "Front Desk", Role.FRONT_DESK),
    ("bar@club.test", "Bar Staff", Role.BAR_STAFF),
    ("member1@club.test", "Member One", Role.MEMBER),
    ("member2@club.test", "Member Two", Role.MEMBER),
    ("member3@club.test", "Member Three", Role.MEMBER),
)

SEED_PLANS: tuple[tuple[PlanCode, str, int, int, int], ...] = (
    (PlanCode.GOLD, "Gold", 300000, 15, 15),
    (PlanCode.SILVER, "Silver", 150000, 5, 5),
    (PlanCode.JUNIOR, "Junior", 80000, 10, 10),
)

SEED_COURTS: tuple[tuple[str, Sport], ...] = (
    ("Tennis 1", Sport.TENNIS),
    ("Tennis 2", Sport.TENNIS),
    ("Padel 1", Sport.PADEL),
    ("Badminton 1", Sport.BADMINTON),
    ("Badminton 2", Sport.BADMINTON),
    ("Cricket Net 1", Sport.CRICKET_NET),
)

# Gold / Silver / Junior / Walk-in, in paise per hour.
SEED_COURT_PRICES: dict[Sport, tuple[int, int, int, int]] = {
    Sport.TENNIS: (0, 40000, 25000, 60000),
    Sport.PADEL: (0, 70000, 45000, 100000),
    Sport.BADMINTON: (0, 20000, 12000, 30000),
    Sport.CRICKET_NET: (0, 50000, 30000, 80000),
}
_TIER_ORDER = (Tier.GOLD, Tier.SILVER, Tier.JUNIOR, Tier.WALKIN)

SEED_PRODUCTS: tuple[tuple[str, str, ProductCategory, int, int, int], ...] = (
    ("RKT-001", "Yonex Astrox 88", ProductCategory.RACKET, 450000, 6, 3),
    ("RKT-002", "Wilson Pro Staff", ProductCategory.RACKET, 980000, 2, 3),
    ("RKT-003", "Head Speed MP", ProductCategory.RACKET, 820000, 4, 3),
    ("BAL-001", "Tennis Balls (can of 3)", ProductCategory.BALL, 45000, 40, 10),
    ("BAL-002", "Shuttlecocks (tube of 6)", ProductCategory.BALL, 60000, 1, 5),
    ("BAL-003", "Padel Balls (can of 3)", ProductCategory.BALL, 52000, 18, 6),
    ("SHO-001", "Asics Gel Court", ProductCategory.SHOE, 720000, 5, 2),
    ("SHO-002", "Yonex Power Cushion", ProductCategory.SHOE, 650000, 2, 3),
    ("ACC-001", "Overgrip (pack of 3)", ProductCategory.ACCESSORY, 35000, 50, 10),
    ("ACC-002", "Wrist Band", ProductCategory.ACCESSORY, 25000, 30, 8),
    ("ACC-003", "Racket Bag", ProductCategory.ACCESSORY, 280000, 7, 3),
    ("APP-001", "Club Polo Shirt", ProductCategory.APPAREL, 150000, 25, 8),
    ("APP-002", "Club Shorts", ProductCategory.APPAREL, 120000, 20, 8),
    ("APP-003", "Club Cap", ProductCategory.APPAREL, 60000, 15, 5),
)

SEED_MENU: tuple[tuple[str, MenuCategory, int], ...] = (
    ("Masala Chai", MenuCategory.DRINK, 4000),
    ("Filter Coffee", MenuCategory.DRINK, 5000),
    ("Fresh Lime Soda", MenuCategory.DRINK, 8000),
    ("Buttermilk", MenuCategory.DRINK, 6000),
    ("Protein Shake", MenuCategory.DRINK, 18000),
    ("Coconut Water", MenuCategory.DRINK, 7000),
    ("Veg Sandwich", MenuCategory.FOOD, 14000),
    ("Paneer Tikka", MenuCategory.FOOD, 26000),
    ("Chicken Roll", MenuCategory.FOOD, 22000),
    ("Pasta Alfredo", MenuCategory.FOOD, 28000),
    ("Dal Khichdi", MenuCategory.FOOD, 20000),
    ("Masala Peanuts", MenuCategory.SNACK, 9000),
    ("French Fries", MenuCategory.SNACK, 12000),
    ("Fruit Bowl", MenuCategory.SNACK, 15000),
    ("Energy Bar", MenuCategory.SNACK, 10000),
)

MEMBER_COUNT = 30
# Deterministic plan rotation across the 30 members.
_PLAN_ROTATION = (PlanCode.GOLD, PlanCode.SILVER, PlanCode.JUNIOR)
# Members 1-3 are the demo logins; 4-8 expire within 7 days; 9-11 are already expired.
_EXPIRING_SOON = range(4, 9)
_EXPIRED = range(9, 12)


def _today_ist() -> date:
    return datetime.now(tz=CLUB_TZ).date()


def _seed_users(session: Session) -> None:
    existing = set(
        session.execute(
            select(User.email).where(User.email.in_([e for e, _, _ in SEED_USERS]))
        ).scalars()
    )
    rows = [
        User(
            email=email,
            password_hash=hash_password(settings.seed_password),
            full_name=full_name,
            role=role.value,
        )
        for email, full_name, role in SEED_USERS
        if email not in existing
    ]
    if rows:
        session.add_all(rows)
        session.commit()


def _seed_plans(session: Session) -> None:
    existing = set(session.execute(select(Plan.code)).scalars())
    rows = [
        Plan(
            code=code.value,
            name=name,
            fee_paise=fee,
            duration_days=30,
            shop_discount_pct=shop,
            bar_discount_pct=bar,
        )
        for code, name, fee, shop, bar in SEED_PLANS
        if code.value not in existing
    ]
    if rows:
        session.add_all(rows)
        session.commit()


def _seed_courts(session: Session) -> None:
    existing = set(session.execute(select(Court.name)).scalars())
    rows = [
        Court(name=name, sport=sport.value)
        for name, sport in SEED_COURTS
        if name not in existing
    ]
    if rows:
        session.add_all(rows)
        session.commit()


def _seed_court_prices(session: Session) -> None:
    existing = {
        (sport, tier) for sport, tier in session.execute(select(CourtPrice.sport, CourtPrice.tier))
    }
    rows = [
        CourtPrice(sport=sport.value, tier=tier.value, price_per_hour_paise=price)
        for sport, prices in SEED_COURT_PRICES.items()
        for tier, price in zip(_TIER_ORDER, prices)
        if (sport.value, tier.value) not in existing
    ]
    if rows:
        session.add_all(rows)
        session.commit()


def _seed_products(session: Session) -> None:
    existing = set(session.execute(select(Product.sku)).scalars())
    rows = [
        Product(
            sku=sku,
            name=name,
            category=category.value,
            price_paise=price,
            stock_qty=stock,
            reorder_level=reorder,
        )
        for sku, name, category, price, stock, reorder in SEED_PRODUCTS
        if sku not in existing
    ]
    if rows:
        session.add_all(rows)
        session.commit()


def _seed_menu(session: Session) -> None:
    existing = set(session.execute(select(MenuItem.name)).scalars())
    rows = [
        MenuItem(name=name, category=category.value, price_paise=price)
        for name, category, price in SEED_MENU
        if name not in existing
    ]
    if rows:
        session.add_all(rows)
        session.commit()


def _seed_bar_tables(session: Session) -> None:
    existing = set(session.execute(select(BarTable.label)).scalars())
    rows = [
        BarTable(label=f"T{n}", seats=4 if n <= 6 else 6)
        for n in range(1, 9)
        if f"T{n}" not in existing
    ]
    if rows:
        session.add_all(rows)
        session.commit()


def _seed_members(session: Session) -> None:
    today = _today_ist()
    plans = {code: plan_id for code, plan_id in session.execute(select(Plan.code, Plan.id))}
    demo_users = {
        email: user_id
        for email, user_id in session.execute(
            select(User.email, User.id).where(
                User.email.in_(["member1@club.test", "member2@club.test", "member3@club.test"])
            )
        )
    }
    existing = set(session.execute(select(Member.member_code)).scalars())

    for n in range(1, MEMBER_COUNT + 1):
        code = f"CC-{n:06d}"
        if code in existing:
            continue

        plan_code = _PLAN_ROTATION[(n - 1) % 3]
        if n <= 3:
            # Members 1-3 are the demo logins: Gold, Silver, Junior in that order.
            plan_code = _PLAN_ROTATION[n - 1]
            user_id = demo_users.get(f"member{n}@club.test")
        else:
            user_id = None

        if n in _EXPIRED:
            end_date = today - timedelta(days=(n - 8) * 3)
        elif n in _EXPIRING_SOON:
            end_date = today + timedelta(days=n - 3)
        else:
            end_date = today + timedelta(days=20 + (n % 10))
        start_date = end_date - timedelta(days=30)

        member = Member(
            member_code=code,
            user_id=user_id,
            full_name=f"Member {n:02d}",
            phone=f"90000{n:05d}",
            email=f"member{n:02d}@club.test" if n > 3 else f"member{n}@club.test",
            dob=date(1990, 1, 1) + timedelta(days=n * 97),
            emergency_contact=f"91000{n:05d}",
        )
        session.add(member)
        session.flush()
        session.add(
            Membership(
                member_id=member.id,
                plan_id=plans[plan_code.value],
                start_date=start_date,
                end_date=end_date,
                status=MembershipStatus.ACTIVE.value,
            )
        )
    session.commit()


HISTORY_DAYS = 30
_METHODS = (PaymentMethod.CASH, PaymentMethod.UPI, PaymentMethod.CARD)

SEED_LEADS: tuple[tuple[str, str, str, LeadInterest, LeadStatus], ...] = (
    ("Anita Rao", "anita.rao@example.com", "9810010001", LeadInterest.MEMBERSHIP, LeadStatus.NEW),
    ("Vikram Shah", "vikram.shah@example.com", "9810010002", LeadInterest.TRIAL,
     LeadStatus.CONTACTED),
    ("Neha Gupta", "neha.gupta@example.com", "9810010003", LeadInterest.CORPORATE,
     LeadStatus.QUOTED),
    ("Imran Khan", "imran.khan@example.com", "9810010004", LeadInterest.OTHER, LeadStatus.WON),
)


def _shift(row, days: int, *fields: str) -> None:
    """Move a service-created row back in time so the demo has a 30-day history."""
    for field in fields:
        value = getattr(row, field, None)
        if value is not None:
            setattr(row, field, value - timedelta(days=days))


def _next_weekday(start: date, weekday: int) -> date:
    return start + timedelta(days=(weekday - start.weekday()) % 7 or 7)


def _seed_history(session: Session) -> None:
    """Demo bookings / orders / payments / leads, all created through the services.

    Every row goes through the real service call so the ledger, stock and slot rules hold,
    then the past-dated ones are shifted back by whole days. Shifting whole days keeps the
    court_slots UNIQUE(court_id, slot_start) key intact because each target day is distinct.
    """
    if session.execute(select(func.count(Payment.id))).scalar_one():
        return  # payments exist only once history has run, so this is the idempotency guard

    owner = session.execute(select(User).where(User.email == "owner@club.test")).scalar_one()
    desk = session.execute(select(User).where(User.email == "desk@club.test")).scalar_one()
    bar_staff = session.execute(select(User).where(User.email == "bar@club.test")).scalar_one()

    courts = session.execute(select(Court).order_by(Court.id)).scalars().all()
    members = session.execute(select(Member).order_by(Member.id)).scalars().all()
    products = session.execute(select(Product).order_by(Product.id)).scalars().all()
    menu = session.execute(select(MenuItem).order_by(MenuItem.id)).scalars().all()
    tables = session.execute(select(BarTable).order_by(BarTable.id)).scalars().all()

    today = _today_ist()

    # ---------------------------------------------------------------- past bookings
    # Each booking is created on a free future slot, then moved to its own past day.
    for index in range(30):
        days_back = index + 1
        court = courts[index % len(courts)]
        member = members[index % len(members)] if index % 4 else None
        # The service refuses a start more than 14 days out, so the row is created on a free
        # near-future slot and then moved back; temp slots are unique by (day, hour).
        hour = 7 + (index % 13)
        temp_day = 1 + index // 13
        slot = datetime.combine(
            today + timedelta(days=temp_day), time(hour, 0), tzinfo=CLUB_TZ
        ).astimezone(timezone.utc)

        data = {
            "court_id": court.id,
            "start_at": slot,
            "source": (BookingSource.WEB if index % 3 == 0 else BookingSource.FRONT_DESK),
        }
        if member is None:
            data["guest_name"] = f"Walk-in {index + 1}"
            data["guest_phone"] = f"90000{index:05d}"
        else:
            data["member_id"] = member.id
        if index % 5:
            data["payment_method"] = _METHODS[index % 3]

        try:
            booking = booking_svc.create_booking(session, desk, data)
        except AppError:
            continue  # a member at their daily limit is simply skipped; the demo is illustrative

        shift = days_back + temp_day
        _shift(booking, shift, "start_at", "end_at", "created_at")
        for slot_row in session.execute(
            select(CourtSlot).where(CourtSlot.booking_id == booking.id)
        ).scalars():
            _shift(slot_row, shift, "slot_start")
        for payment in session.execute(
            select(Payment).where(
                Payment.source_type == SourceType.BOOKING.value,
                Payment.source_id == booking.id,
            )
        ).scalars():
            _shift(payment, shift, "created_at")
        booking.status = (
            BookingStatus.NO_SHOW.value if index % 9 == 0 else BookingStatus.COMPLETED.value
        )
    session.commit()

    # ------------------------------------------------------- upcoming bookings (demo grid)
    for index in range(8):
        court = courts[index % len(courts)]
        member = members[(index + 3) % len(members)]
        slot = datetime.combine(
            today + timedelta(days=1 + index), time(18 + index % 3, 0), tzinfo=CLUB_TZ
        ).astimezone(timezone.utc)
        try:
            booking_svc.create_booking(
                session,
                desk,
                {
                    "court_id": court.id,
                    "member_id": member.id,
                    "start_at": slot,
                    "source": BookingSource.WEB,
                },
            )
        except AppError:
            continue
    session.commit()

    # ------------------------------------------------- today's bookings (dashboard tiles)
    # Only slots still ahead of the clock are legal, so late in the evening this adds none.
    now_hour = datetime.now(CLUB_TZ).hour
    for index, hour in enumerate(range(max(now_hour + 1, 7), 22)):
        if index >= 3:
            break
        try:
            booking_svc.create_booking(
                session,
                desk,
                {
                    "court_id": courts[index % len(courts)].id,
                    "member_id": members[index].id,
                    "start_at": datetime.combine(today, time(hour, 0), tzinfo=CLUB_TZ).astimezone(
                        timezone.utc
                    ),
                    "source": BookingSource.FRONT_DESK,
                    "payment_method": _METHODS[index % 3],
                },
            )
        except AppError:
            continue
    session.commit()

    # ----------------------------------------------------------------- shop orders
    for index in range(14):
        days_back = index * 2
        product = products[index % len(products)]
        member = members[(index * 3) % len(members)] if index % 3 else None
        try:
            order = shop_svc.create_order(
                session,
                desk,
                {
                    "channel": ShopChannel.COUNTER,
                    "member_id": member.id if member else None,
                    "guest_name": None if member else f"Counter {index + 1}",
                    "items": [{"product_id": product.id, "qty": 1 + index % 3}],
                    "payment_method": _METHODS[index % 3],
                },
            )
        except AppError:
            continue
        if order.status != ShopOrderStatus.COMPLETED.value:
            shop_svc.set_status(session, desk, order.id, ShopOrderStatus.COMPLETED)
        _shift(order, days_back, "created_at")
        for payment in session.execute(
            select(Payment).where(
                Payment.source_type == SourceType.SHOP_ORDER.value, Payment.source_id == order.id
            )
        ).scalars():
            _shift(payment, days_back, "created_at")
    session.commit()

    # ------------------------------------------------------------------ bar orders
    for index in range(16):
        days_back = index * 2
        items = [
            {"menu_item_id": menu[index % len(menu)].id, "qty": 1 + index % 2},
            {"menu_item_id": menu[(index + 5) % len(menu)].id, "qty": 1},
        ]
        member = members[(index * 5) % len(members)] if index % 2 else None
        try:
            order = bar_svc.create_order(
                session,
                bar_staff,
                {
                    "table_id": tables[index % len(tables)].id,
                    "member_id": member.id if member else None,
                    "guest_name": None if member else f"Table guest {index + 1}",
                    "items": items,
                },
            )
            for status in (KitchenStatus.PREPARING, KitchenStatus.SERVED):
                bar_svc.set_kitchen_status(session, bar_staff, order.id, status)
            bar_svc.pay_order(session, bar_staff, order.id, _METHODS[index % 3])
        except AppError:
            continue
        _shift(order, days_back, "created_at", "paid_at")
        for payment in session.execute(
            select(Payment).where(
                Payment.source_type == SourceType.BAR_ORDER.value, Payment.source_id == order.id
            )
        ).scalars():
            _shift(payment, days_back, "created_at")
    session.commit()

    # ----------------------------------------------------------------------- leads
    for index, (name, email, phone, interest, target) in enumerate(SEED_LEADS):
        lead = leads_svc.record_enquiry(
            session,
            {
                "name": name,
                "email": email,
                "phone": phone,
                "interest": interest.value,
                "message": "Interested in joining the club.",
            },
        )
        session.commit()
        row = session.get(Lead, lead["id"])
        for step in (LeadStatus.CONTACTED, LeadStatus.QUOTED, LeadStatus.WON):
            if LeadStatus(row.status) is target:
                break
            leads_svc.update_lead(session, desk, row.id, {"status": step.value})
        _shift(row, index * 3 + 2, "created_at")
    session.commit()

    # ------------------------------------------------------- Friday social session
    friday = _next_weekday(today, 4)
    start_at = datetime.combine(friday, time(19, 0), tzinfo=CLUB_TZ).astimezone(timezone.utc)
    try:
        social = social_svc.create_session(
            session,
            owner,
            {
                "court_id": courts[0].id,
                "title": "Friday Social Doubles",
                "start_at": start_at,
                "end_at": start_at + timedelta(hours=2),
                "capacity": 8,
                "fee_paise": 20000,
            },
        )
        for member in members[:5]:
            try:
                social_svc.join(session, owner, social.id, member_id=member.id)
            except AppError:
                continue
    except AppError:
        pass
    session.commit()


# (member code, days ahead, IST start, party size, note) — booked by the front desk.
SEED_RESERVATIONS: tuple[tuple[str, int, time, int, str | None], ...] = (
    ("CC-000001", 1, time(19, 30), 4, "Anniversary dinner"),
    ("CC-000002", 2, time(13, 0), 2, None),
    ("CC-000005", 1, time(20, 0), 6, "Team celebration"),
    ("CC-000012", 3, time(18, 30), 3, None),
)


def _seed_reservations(session: Session) -> None:
    """A few upcoming table bookings so the dining pages have something to show."""
    if session.execute(select(func.count(TableReservation.id))).scalar_one():
        return
    desk = session.execute(select(User).where(User.email == "desk@club.test")).scalar_one()
    members = dict(session.execute(select(Member.member_code, Member.id)).tuples().all())
    today = _today_ist()
    for code, days, start, party, note in SEED_RESERVATIONS:
        start_at = datetime.combine(today + timedelta(days=days), start, tzinfo=CLUB_TZ)
        try:
            dining_svc.create_reservation(
                session,
                desk,
                {
                    "member_id": members[code],
                    "start_at": start_at.astimezone(timezone.utc),
                    "party_size": party,
                    "note": note,
                },
            )
        except AppError:
            session.rollback()


# ------------------------------------------------------------------ bulk members
# Optional demo volume. Off by default, so the 30-member seed and the tests are untouched.
# Set SEED_MEMBERS_TOTAL=300 in .env to grow the club to 300 members (codes CC-000031 ...).
# Deterministic: same input, same rows. Fake data only (.test emails, 98xxxxxxxx phones).

_FIRST_NAMES = (
    "Aarav", "Vivaan", "Aditya", "Arjun", "Rohan", "Karan", "Rahul", "Siddharth", "Ishaan",
    "Kabir", "Vikram", "Amit", "Nikhil", "Varun", "Yash", "Dev", "Meera", "Ananya", "Diya",
    "Isha", "Kavya", "Neha", "Pooja", "Priya", "Riya", "Sana", "Shreya", "Tanvi", "Aisha",
    "Anjali", "Divya", "Nisha", "Simran", "Sneha", "Zoya", "Farhan", "Imran", "Harpreet",
    "Gurpreet", "Manish",
)
_LAST_NAMES = (
    "Sharma", "Verma", "Patel", "Shah", "Mehta", "Desai", "Joshi", "Kulkarni", "Iyer", "Nair",
    "Menon", "Reddy", "Rao", "Naidu", "Gupta", "Agarwal", "Singh", "Kaur", "Khan", "Ansari",
    "Sheikh", "Bose", "Banerjee", "Chatterjee", "Das", "Ghosh", "Kapoor", "Malhotra", "Chopra",
    "Bhatt",
)


def _bulk_plan(n: int) -> PlanCode:
    slot = n % 20
    if slot < 3:
        return PlanCode.GOLD      # 15%
    if slot < 15:
        return PlanCode.SILVER    # 60%
    return PlanCode.JUNIOR        # 25%


def _bulk_end_date(n: int, today: date) -> date:
    slot = (n * 7 + 3) % 20
    if slot < 2:                  # 10% expired, 1-60 days ago
        return today - timedelta(days=1 + (n * 5) % 60)
    if slot < 4:                  # 10% expiring, today .. today+7
        return today + timedelta(days=(n * 3) % 8)
    return today + timedelta(days=8 + (n * 11) % 23)   # 80% active, 8-30 days left


def _bulk_dob(n: int, plan: PlanCode, today: date) -> date:
    month, day = (n * 5) % 12 + 1, (n * 11) % 28 + 1
    age = 8 + (n * 3) % 10 if plan is PlanCode.JUNIOR else 19 + (n * 7) % 45   # Junior < 18
    return date(today.year - age, month, day)


def _bulk_joined(n: int, today: date) -> datetime:
    # Back-dated so the dashboard's "new members" tiles are not flooded with 270 rows.
    days = 1 + (n // 25) % 20 if n % 25 == 0 else 35 + (n * 37) % 330
    return datetime.combine(
        today - timedelta(days=days), time(10, 0), tzinfo=CLUB_TZ
    ).astimezone(timezone.utc)


def _backdate(row, when: datetime) -> None:
    if hasattr(row, "created_at"):
        row.created_at = when


def _seed_bulk_members(session: Session) -> None:
    try:
        total = min(int(os.environ.get("SEED_MEMBERS_TOTAL", "0") or 0), 1000)
    except ValueError:
        return
    if total <= MEMBER_COUNT:
        return

    today = _today_ist()
    plans = {code: plan_id for code, plan_id in session.execute(select(Plan.code, Plan.id))}
    existing_codes = set(session.execute(select(Member.member_code)).scalars())
    existing_phones = set(session.execute(select(Member.phone)).scalars())

    pending = []
    for n in range(MEMBER_COUNT + 1, total + 1):
        code, phone = f"CC-{n:06d}", f"98{n:08d}"
        if code in existing_codes or phone in existing_phones:
            continue
        plan_code = _bulk_plan(n)
        joined = _bulk_joined(n, today)
        member = Member(
            member_code=code,
            full_name=(
                f"{_FIRST_NAMES[(n * 7) % len(_FIRST_NAMES)]} "
                f"{_LAST_NAMES[(n * 13 + n // 40) % len(_LAST_NAMES)]}"
            ),
            phone=phone,
            email=f"member{n:02d}@club.test",
            dob=_bulk_dob(n, plan_code, today),
            emergency_contact=f"97{n:08d}",
        )
        _backdate(member, joined)
        pending.append((member, plan_code, joined, _bulk_end_date(n, today)))

    if not pending:
        return
    session.add_all([m for m, _, _, _ in pending])
    session.flush()  # assigns member ids
    for member, plan_code, joined, end_date in pending:
        membership = Membership(
            member_id=member.id,
            plan_id=plans[plan_code.value],
            start_date=end_date - timedelta(days=30),
            end_date=end_date,
            status=MembershipStatus.ACTIVE.value,
        )
        _backdate(membership, joined)
        session.add(membership)
    session.commit()
    print(f"seed: added {len(pending)} bulk members (target total {total})")


def run_seed(session: Session) -> None:
    _seed_users(session)
    _seed_plans(session)
    _seed_courts(session)
    _seed_court_prices(session)
    _seed_products(session)
    _seed_menu(session)
    _seed_bar_tables(session)
    _seed_members(session)
    _seed_history(session)
    _seed_reservations(session)
    _seed_bulk_members(session)