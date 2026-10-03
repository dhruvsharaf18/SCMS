"""Part C: Extended demo data — 300-400 records for the hackathon jury.

Run directly via:
    cd backend
    DATABASE_URL=... python -c "
    from app.db import SessionLocal
    from seed_demo import run_demo_seed
    with SessionLocal() as s:
        run_demo_seed(s)
    "

Or set DEMO_SEED=true in the environment and call run_demo_seed(session) from main.py/seed.py.

Design:
- Completely idempotent — guarded by count checks on each section.
- Extends (does NOT replace) the base seed.py data.
- All rows go through real service calls so ledger, stock and slot rules hold.
- Past-dated rows are shifted back by whole days (same strategy as base seed.py).
- Generates approx:
    70 extra members          (+memberships, +70 rows × 2 = 140)
    60 extra past bookings    (+payments                   = 120)
    30 extra shop orders      (+payments                   =  60)
    30 extra bar orders       (+payments                   =  60)
    16 extra leads            (+notes                      =  32)
     6 social sessions        (+participants ~4 each       =  30)
    12 table reservations                                  =  12)
     8 employees              (+shifts ×5 +payroll ×3      =  64)
                                               ≈ total      518 rows
"""
from __future__ import annotations

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
    PaymentMethod,
    PayrollStatus,
    PlanCode,
    ShiftArea,
    ShopChannel,
    ShopOrderStatus,
    SourceType,
    Sport,
)
from app.models import (
    BarTable,
    Booking,
    Court,
    CourtSlot,
    Employee,
    Lead,
    Member,
    Membership,
    MenuItem,
    Payment,
    Payroll,
    Plan,
    Product,
    Shift,
    User,
)
from app.security import AppError, hash_password
from app.services import bar as bar_svc
from app.services import booking as booking_svc
from app.services import leads as leads_svc
from app.services import shop as shop_svc
from app.services import social as social_svc

# ── sentinel prefix — all demo-seed rows use this to stay idempotent ────────
_DEMO_CODE_PREFIX = "DS-"   # member_code
_DEMO_EMP_PREFIX = "DEMO "  # employee full_name

_PAYMENT_METHODS = (PaymentMethod.CASH, PaymentMethod.UPI, PaymentMethod.CARD)
_PLAN_CYCLE = (PlanCode.GOLD, PlanCode.SILVER, PlanCode.JUNIOR)

_EXTRA_MEMBERS = 70
_EXTRA_BOOKINGS = 60
_EXTRA_SHOP_ORDERS = 30
_EXTRA_BAR_ORDERS = 30
_EXTRA_LEADS = 16
_EXTRA_SOCIALS = 6
_EXTRA_RESERVATIONS = 12
_EXTRA_EMPLOYEES = 8


def _today() -> date:
    return datetime.now(tz=CLUB_TZ).date()


def _shift_rows(session: Session, rows, days: int, *fields: str) -> None:
    """Move timestamps back `days` days (same strategy as base seed.py)."""
    for row in rows:
        for field in fields:
            v = getattr(row, field, None)
            if v is not None:
                setattr(row, field, v - timedelta(days=days))


# ────────────────────────────────────────────── members ─────────────────────

def _seed_extra_members(session: Session) -> list[Member]:
    existing_codes = set(
        session.execute(select(Member.member_code).where(
            Member.member_code.like(f"{_DEMO_CODE_PREFIX}%")
        )).scalars()
    )
    if len(existing_codes) >= _EXTRA_MEMBERS:
        return list(
            session.execute(select(Member).where(
                Member.member_code.like(f"{_DEMO_CODE_PREFIX}%")
            )).scalars()
        )

    today = _today()
    plans = {code: plan_id for code, plan_id in session.execute(select(Plan.code, Plan.id))}
    new_members: list[Member] = []

    FIRST_NAMES = [
        "Arjun", "Priya", "Rahul", "Sunita", "Karthik", "Meena", "Vijay", "Lakshmi",
        "Arun", "Deepa", "Suresh", "Kavitha", "Ravi", "Anitha", "Ganesh", "Usha",
        "Mohan", "Rekha", "Sanjay", "Pooja", "Ajay", "Nisha", "Manoj", "Shweta",
        "Naveen", "Divya", "Sunil", "Shalini", "Harish", "Mamta", "Dinesh", "Rajni",
        "Ashok", "Geeta", "Vinod", "Smita", "Pramod", "Leela", "Ramesh", "Chitra",
        "Santosh", "Archana", "Anil", "Bharati", "Hemant", "Jyoti", "Prakash", "Savita",
        "Sudhir", "Padma", "Girish", "Roopa", "Yogesh", "Asha", "Kishore", "Vani",
        "Bala", "Lalitha", "Naresh", "Vaijayanti", "Rajesh", "Kamala", "Devendra",
        "Rukmini", "Aditya", "Anjali", "Nitin", "Snehal", "Umesh", "Bhavana",
    ]
    LAST_NAMES = [
        "Sharma", "Patel", "Rao", "Nair", "Iyer", "Singh", "Kumar", "Reddy",
        "Menon", "Pillai", "Joshi", "Shah", "Mehta", "Gupta", "Das", "Sinha",
    ]

    for n in range(1, _EXTRA_MEMBERS + 1):
        code = f"{_DEMO_CODE_PREFIX}{n:06d}"
        if code in existing_codes:
            continue
        first = FIRST_NAMES[(n - 1) % len(FIRST_NAMES)]
        last = LAST_NAMES[(n - 1) % len(LAST_NAMES)]
        plan_code = _PLAN_CYCLE[(n - 1) % 3]
        days_offset = (n % 90)
        if n % 7 == 0:
            end_date = today - timedelta(days=days_offset)     # expired
        elif n % 5 == 0:
            end_date = today + timedelta(days=n % 6)           # expiring soon
        else:
            end_date = today + timedelta(days=15 + days_offset)
        start_date = end_date - timedelta(days=30)

        member = Member(
            member_code=code,
            full_name=f"{first} {last}",
            phone=f"7900{n:06d}",
            email=f"demo.member{n:03d}@club.test",
            dob=date(1985 + (n % 20), 1 + (n % 12), 1 + (n % 28)),
            emergency_contact=f"8800{n:06d}",
        )
        session.add(member)
        session.flush()
        session.add(Membership(
            member_id=member.id,
            plan_id=plans[plan_code.value],
            start_date=start_date,
            end_date=end_date,
            status=MembershipStatus.ACTIVE.value,
        ))
        new_members.append(member)

    session.commit()
    return list(
        session.execute(select(Member).where(
            Member.member_code.like(f"{_DEMO_CODE_PREFIX}%")
        )).scalars()
    )


# ──────────────────────────────────────────── bookings ──────────────────────

def _seed_extra_bookings(
    session: Session,
    desk: User,
    courts: list[Court],
    members: list[Member],
) -> None:
    demo_booking_count = session.execute(
        select(func.count(Booking.id)).join(Member, Booking.member_id == Member.id, isouter=True).where(
            (Member.member_code.like(f"{_DEMO_CODE_PREFIX}%")) | (Booking.guest_name.like("Demo Guest %"))
        )
    ).scalar_one()
    if demo_booking_count >= _EXTRA_BOOKINGS - 5:
        return

    today = _today()

    for index in range(_EXTRA_BOOKINGS):
        days_back = 3 + index          # spread across 3-62 days ago
        temp_day = 3 + (index // 13)  # create on a free near-future slot
        hour = 7 + (index % 13)
        slot = datetime.combine(
            today + timedelta(days=temp_day), time(hour, 0), tzinfo=CLUB_TZ
        ).astimezone(timezone.utc)

        court = courts[index % len(courts)]
        member = members[index % len(members)] if index % 3 else None

        data: dict = {
            "court_id": court.id,
            "start_at": slot,
            "source": (BookingSource.WEB if index % 4 == 0 else BookingSource.FRONT_DESK),
        }
        if member is None:
            data["guest_name"] = f"Demo Guest {index + 1}"
            data["guest_phone"] = f"8000{index:06d}"
        else:
            data["member_id"] = member.id
        if index % 3:
            data["payment_method"] = _PAYMENT_METHODS[index % 3]

        try:
            booking = booking_svc.create_booking(session, desk, data)
        except AppError:
            continue

        shift = days_back + temp_day
        booking.created_at = booking.created_at - timedelta(days=shift)
        booking.start_at -= timedelta(days=shift)
        booking.end_at -= timedelta(days=shift)
        for slot_row in session.execute(
            select(CourtSlot).where(CourtSlot.booking_id == booking.id)
        ).scalars():
            slot_row.slot_start -= timedelta(days=shift)
        for payment in session.execute(
            select(Payment).where(
                Payment.source_type == SourceType.BOOKING.value,
                Payment.source_id == booking.id,
            )
        ).scalars():
            payment.created_at -= timedelta(days=shift)

        booking.status = (
            BookingStatus.NO_SHOW.value if index % 11 == 0
            else BookingStatus.COMPLETED.value
        )

    session.commit()


# ──────────────────────────────────────────── shop orders ───────────────────

def _seed_extra_shop_orders(
    session: Session,
    desk: User,
    products: list[Product],
    members: list[Member],
) -> None:
    # Use Payment count on SHOP_ORDER as guard.
    count = session.execute(
        select(func.count(Payment.id)).where(Payment.source_type == SourceType.SHOP_ORDER.value)
    ).scalar_one()
    if count >= 14 + _EXTRA_SHOP_ORDERS - 5:
        return

    for index in range(_EXTRA_SHOP_ORDERS):
        days_back = 1 + index * 2
        product = products[index % len(products)]
        member = members[(index * 7) % len(members)] if index % 3 else None
        try:
            order = shop_svc.create_order(
                session, desk, {
                    "channel": ShopChannel.COUNTER,
                    "member_id": member.id if member else None,
                    "guest_name": None if member else f"Demo Counter {index + 1}",
                    "items": [{"product_id": product.id, "qty": 1 + index % 3}],
                    "payment_method": _PAYMENT_METHODS[index % 3],
                },
            )
        except AppError:
            continue
        if order.status != ShopOrderStatus.COMPLETED.value:
            try:
                shop_svc.set_status(session, desk, order.id, ShopOrderStatus.COMPLETED)
            except AppError:
                pass
        order.created_at -= timedelta(days=days_back)
        for payment in session.execute(
            select(Payment).where(
                Payment.source_type == SourceType.SHOP_ORDER.value,
                Payment.source_id == order.id,
            )
        ).scalars():
            payment.created_at -= timedelta(days=days_back)
    session.commit()


# ──────────────────────────────────────────── bar orders ────────────────────

def _seed_extra_bar_orders(
    session: Session,
    bar_staff: User,
    menu: list[MenuItem],
    tables: list[BarTable],
    members: list[Member],
) -> None:
    count = session.execute(
        select(func.count(Payment.id)).where(Payment.source_type == SourceType.BAR_ORDER.value)
    ).scalar_one()
    if count >= 16 + _EXTRA_BAR_ORDERS - 5:
        return

    for index in range(_EXTRA_BAR_ORDERS):
        days_back = 1 + index
        items = [
            {"menu_item_id": menu[index % len(menu)].id, "qty": 1 + index % 2},
            {"menu_item_id": menu[(index + 7) % len(menu)].id, "qty": 1},
        ]
        member = members[(index * 11) % len(members)] if index % 2 else None
        try:
            order = bar_svc.create_order(
                session, bar_staff, {
                    "table_id": tables[index % len(tables)].id,
                    "member_id": member.id if member else None,
                    "guest_name": None if member else f"Demo Bar Guest {index + 1}",
                    "items": items,
                },
            )
            for status in (KitchenStatus.PREPARING, KitchenStatus.SERVED):
                bar_svc.set_kitchen_status(session, bar_staff, order.id, status)
            bar_svc.pay_order(session, bar_staff, order.id, _PAYMENT_METHODS[index % 3])
        except AppError:
            continue
        order.created_at -= timedelta(days=days_back)
        if order.paid_at:
            order.paid_at -= timedelta(days=days_back)
        for payment in session.execute(
            select(Payment).where(
                Payment.source_type == SourceType.BAR_ORDER.value,
                Payment.source_id == order.id,
            )
        ).scalars():
            payment.created_at -= timedelta(days=days_back)
    session.commit()


# ──────────────────────────────────────────── leads ─────────────────────────

_EXTRA_LEAD_DATA = [
    ("Aryan Kapoor", "aryan.kapoor@example.com", "9820020001", LeadInterest.MEMBERSHIP, LeadStatus.NEW),
    ("Sneha Jain", "sneha.jain@example.com", "9820020002", LeadInterest.TRIAL, LeadStatus.CONTACTED),
    ("Ritu Malhotra", "ritu.malhotra@example.com", "9820020003", LeadInterest.CORPORATE, LeadStatus.QUOTED),
    ("Tarun Bhatia", "tarun.bhatia@example.com", "9820020004", LeadInterest.TRIAL, LeadStatus.NEW),
    ("Pallavi Desai", "pallavi.desai@example.com", "9820020005", LeadInterest.MEMBERSHIP, LeadStatus.WON),
    ("Vivek Agarwal", "vivek.agarwal@example.com", "9820020006", LeadInterest.OTHER, LeadStatus.LOST),
    ("Sonia Pillai", "sonia.pillai@example.com", "9820020007", LeadInterest.MEMBERSHIP, LeadStatus.CONTACTED),
    ("Mohit Saxena", "mohit.saxena@example.com", "9820020008", LeadInterest.TRIAL, LeadStatus.NEW),
    ("Gayatri Iyer", "gayatri.iyer@example.com", "9820020009", LeadInterest.CORPORATE, LeadStatus.QUOTED),
    ("Rajiv Nair", "rajiv.nair@example.com", "9820020010", LeadInterest.MEMBERSHIP, LeadStatus.WON),
    ("Preeti Menon", "preeti.menon@example.com", "9820020011", LeadInterest.TRIAL, LeadStatus.CONTACTED),
    ("Suresh Reddy", "suresh.reddy@example.com", "9820020012", LeadInterest.MEMBERSHIP, LeadStatus.NEW),
    ("Meghna Sinha", "meghna.sinha@example.com", "9820020013", LeadInterest.CORPORATE, LeadStatus.LOST),
    ("Anand Kumar", "anand.kumar@example.com", "9820020014", LeadInterest.OTHER, LeadStatus.CONTACTED),
    ("Lata Bhatt", "lata.bhatt@example.com", "9820020015", LeadInterest.MEMBERSHIP, LeadStatus.QUOTED),
    ("Dinesh Choudhary", "dinesh.choudhary@example.com", "9820020016", LeadInterest.TRIAL, LeadStatus.NEW),
]


def _seed_extra_leads(session: Session, desk: User) -> None:
    existing_emails = set(session.execute(select(Lead.email)).scalars())
    for index, (name, email, phone, interest, target) in enumerate(_EXTRA_LEAD_DATA):
        if email in existing_emails:
            continue
        lead_dict = leads_svc.record_enquiry(
            session,
            {
                "name": name,
                "email": email,
                "phone": phone,
                "interest": interest.value,
                "message": f"Demo enquiry from {name}. Interested in joining Champions Club.",
            },
        )
        session.commit()
        row = session.get(Lead, lead_dict["id"])
        if row is None:
            continue
        for step in (LeadStatus.CONTACTED, LeadStatus.QUOTED, LeadStatus.WON, LeadStatus.LOST):
            if LeadStatus(row.status) is target:
                break
            try:
                leads_svc.update_lead(session, desk, row.id, {"status": step.value})
            except AppError:
                break
        if row.created_at:
            row.created_at -= timedelta(days=index * 2 + 1)
    session.commit()


# ──────────────────────────────────────────── social sessions ───────────────

_SOCIAL_CONFIGS = [
    ("Saturday Doubles Clinic", 6, time(9, 0), 2, 8, 25000),
    ("Junior Training Camp", 5, time(8, 0), 2, 12, 15000),
    ("Mixed Badminton Evening", 8, time(18, 0), 2, 10, 20000),
    ("Padel Beginner Workshop", 7, time(10, 0), 1, 8, 30000),
    ("Cricket Net Practice", 10, time(7, 0), 2, 16, 10000),
    ("Tennis Ladies Morning", 12, time(7, 30), 1, 8, 20000),
]


def _seed_extra_socials(
    session: Session,
    owner: User,
    courts: list[Court],
    members: list[Member],
) -> None:
    # Guard by social count beyond base seed's 1 session.
    from app.models import SocialSession
    count = session.execute(select(func.count(SocialSession.id))).scalar_one()
    if count >= 1 + _EXTRA_SOCIALS - 1:
        return

    today = _today()
    for idx, (title, days_ahead, start_t, duration_h, capacity, fee) in enumerate(
        _SOCIAL_CONFIGS
    ):
        start_at = datetime.combine(
            today + timedelta(days=days_ahead + idx), start_t, tzinfo=CLUB_TZ
        ).astimezone(timezone.utc)
        court = courts[idx % len(courts)]
        try:
            soc = social_svc.create_session(
                session, owner, {
                    "court_id": court.id,
                    "title": title,
                    "start_at": start_at,
                    "end_at": start_at + timedelta(hours=duration_h),
                    "capacity": capacity,
                    "fee_paise": fee,
                },
            )
            for member in members[idx * 3: idx * 3 + 4]:
                try:
                    social_svc.join(session, owner, soc.id, member_id=member.id)
                except AppError:
                    continue
        except AppError:
            continue
    session.commit()


# ──────────────────────────────────────────── table reservations ────────────

def _seed_extra_reservations(
    session: Session, desk: User, members: list[Member]
) -> None:
    from app.models import TableReservation
    from app.services import dining as dining_svc
    count = session.execute(select(func.count(TableReservation.id))).scalar_one()
    if count >= 4 + _EXTRA_RESERVATIONS - 2:
        return

    today = _today()
    for idx, member in enumerate(members[:_EXTRA_RESERVATIONS]):
        days_ahead = 1 + (idx % 7)
        start_at = datetime.combine(
            today + timedelta(days=days_ahead),
            time(12 + idx % 9, 0),
            tzinfo=CLUB_TZ,
        )
        try:
            dining_svc.create_reservation(
                session, desk, {
                    "member_id": member.id,
                    "start_at": start_at.astimezone(timezone.utc),
                    "party_size": 2 + idx % 5,
                    "note": f"Demo reservation {idx + 1}" if idx % 3 == 0 else None,
                },
            )
        except AppError:
            session.rollback()
    session.commit()


# ──────────────────────────────────────────── employees ─────────────────────

_EMPLOYEE_DATA = [
    ("DEMO Rajan P.", "Head Coach", 8000000),
    ("DEMO Meera S.", "Court Attendant", 3500000),
    ("DEMO Sunil K.", "Bar Manager", 5000000),
    ("DEMO Priya R.", "Receptionist", 3000000),
    ("DEMO Arun V.", "Shop Assistant", 3200000),
    ("DEMO Kavya N.", "Fitness Trainer", 4500000),
    ("DEMO Bhaskar T.", "Groundskeeper", 3000000),
    ("DEMO Ananya M.", "Housekeeping Lead", 3000000),
]

_SHIFT_AREAS = (ShiftArea.FRONT_DESK, ShiftArea.BAR, ShiftArea.SHOP, ShiftArea.COURTS)


def _seed_employees(session: Session) -> None:
    existing_names = set(session.execute(
        select(Employee.full_name).where(Employee.full_name.like(f"{_DEMO_EMP_PREFIX}%"))
    ).scalars())

    today = _today()
    new_employees: list[Employee] = []

    for name, title, salary in _EMPLOYEE_DATA:
        if name in existing_names:
            continue
        emp = Employee(full_name=name, title=title, monthly_salary_paise=salary)
        session.add(emp)
        session.flush()
        new_employees.append(emp)

        # Add 5 recent shifts.
        for day_offset in range(5):
            shift_date = today - timedelta(days=day_offset)
            area = _SHIFT_AREAS[day_offset % len(_SHIFT_AREAS)]
            session.add(Shift(
                employee_id=emp.id,
                shift_date=shift_date,
                start_time=time(9, 0),
                end_time=time(17, 0),
                area=area.value,
            ))

        # Add 3 months of payroll.
        for month_offset in range(3):
            month_date = today.replace(day=1) - timedelta(days=month_offset * 31)
            month_str = month_date.strftime("%Y-%m")
            deductions = salary // 10
            session.add(Payroll(
                month=month_str,
                employee_id=emp.id,
                base_paise=salary,
                deductions_paise=deductions,
                net_paise=salary - deductions,
                status=(PayrollStatus.PAID.value if month_offset > 0 else PayrollStatus.PENDING.value),
            ))

    session.commit()


# ──────────────────────────────────────────── entry point ───────────────────

def run_demo_seed(session: Session) -> None:
    """Idempotent. Safe to call multiple times and after the base seed."""
    # Load actors and fixtures the base seed already created.
    owner = session.execute(select(User).where(User.email == "owner@club.test")).scalar_one_or_none()
    desk = session.execute(select(User).where(User.email == "desk@club.test")).scalar_one_or_none()
    bar_staff = session.execute(select(User).where(User.email == "bar@club.test")).scalar_one_or_none()

    if not owner or not desk or not bar_staff:
        raise RuntimeError(
            "Base seed must run first (owner@club.test / desk@club.test / bar@club.test not found)."
        )

    courts = session.execute(select(Court).order_by(Court.id)).scalars().all()
    products = session.execute(select(Product).order_by(Product.id)).scalars().all()
    menu = session.execute(select(MenuItem).order_by(MenuItem.id)).scalars().all()
    tables = session.execute(select(BarTable).order_by(BarTable.id)).scalars().all()

    if not courts or not products or not menu or not tables:
        raise RuntimeError("Base seed must run first (courts/products/menu/tables missing).")

    # 1. Extra members (and memberships).
    extra_members = _seed_extra_members(session)

    # 2. Extra bookings (uses demo members).
    _seed_extra_bookings(session, desk, courts, extra_members)

    # 3. Extra shop orders.
    _seed_extra_shop_orders(session, desk, products, extra_members)

    # 4. Extra bar orders.
    _seed_extra_bar_orders(session, bar_staff, menu, tables, extra_members)

    # 5. Extra leads.
    _seed_extra_leads(session, desk)

    # 6. Extra social sessions.
    _seed_extra_socials(session, owner, courts, extra_members)

    # 7. Extra table reservations.
    _seed_extra_reservations(session, desk, extra_members)

    # 8. Employees (+ shifts + payroll).
    _seed_employees(session)


if __name__ == "__main__":
    from app.db import SessionLocal
    with SessionLocal() as s:
        run_demo_seed(s)
        print("--- Demo Seed Table Counts ---")
        for model in (Member, Booking, CourtSlot, Payment, Lead, Employee, Shift, Payroll):
            c = s.execute(select(func.count(model.id))).scalar_one()
            print(f"{model.__name__}: {c}")
    print("Demo seed completed successfully.")
