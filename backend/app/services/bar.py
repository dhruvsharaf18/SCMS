"""SRS 3.2.8 / 4.6 — menu, tables, bar orders, tabs and the daily bar report.

Two rules carry the module. The kitchen status only ever moves forward, and an order is paid
by exactly one payments row — enforced by locking the order row before writing it, so two staff
pressing "pay" at once produce one payment and one 409.
"""

from datetime import date, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import audit
from ..config import day_bounds_utc, local_date
from ..enums import (
    BarPaymentStatus,
    KitchenStatus,
    MenuCategory,
    PaymentMethod,
    PaymentStatus,
    Role,
    SourceType,
)
from ..models import (
    BarOrder,
    BarOrderItem,
    BarTable,
    Member,
    MenuItem,
    Payment,
    User,
)
from ..security import AppError, utcnow
from . import payments as payments_svc
from . import pricing

MAX_LINE_QTY = 50

# Forward only. CANCELLED is a terminal exit available before the food is served.
_KITCHEN_ORDER = [
    KitchenStatus.NEW,
    KitchenStatus.PREPARING,
    KitchenStatus.READY,
    KitchenStatus.SERVED,
]


# ---------------------------------------------------------------------------- menu items


def list_menu_items(
    session: Session, category: MenuCategory | str | None = None, available_only: bool = True
) -> list[MenuItem]:
    filters = []
    if available_only:
        filters.append(MenuItem.is_available.is_(True))
    if category is not None:
        filters.append(MenuItem.category == MenuCategory(category).value)
    return list(
        session.execute(select(MenuItem).where(*filters).order_by(MenuItem.id)).scalars().all()
    )


def create_menu_item(session: Session, actor: User, data: dict, ip: str | None = None) -> MenuItem:
    item = MenuItem(**data)
    session.add(item)
    session.flush()
    audit.log(session, actor.id, "MENU_ITEM_CREATED", "menu_item", item.id, data, ip)
    session.commit()
    session.refresh(item)
    return item


def update_menu_item(
    session: Session, actor: User, item_id: int, data: dict, ip: str | None = None
) -> MenuItem:
    item = session.get(MenuItem, item_id)
    if item is None:
        raise AppError("NOT_FOUND", "Menu item not found.", 404)
    for field, value in data.items():
        setattr(item, field, value)
    audit.log(session, actor.id, "MENU_ITEM_UPDATED", "menu_item", item.id, data, ip)
    session.commit()
    session.refresh(item)
    return item


# --------------------------------------------------------------------------- bar tables


def list_tables(session: Session) -> list[dict]:
    """Each table with the running total of its open (unpaid, uncancelled) order, or null."""
    open_total = (
        select(
            BarOrder.table_id.label("table_id"),
            func.sum(BarOrder.total_paise).label("total_paise"),
            func.count(BarOrder.id).label("orders"),
        )
        .where(
            BarOrder.table_id.is_not(None),
            BarOrder.payment_status == BarPaymentStatus.UNPAID.value,
            BarOrder.kitchen_status != KitchenStatus.CANCELLED.value,
        )
        .group_by(BarOrder.table_id)
        .subquery()
    )
    rows = session.execute(
        select(BarTable, open_total.c.total_paise, open_total.c.orders)
        .outerjoin(open_total, open_total.c.table_id == BarTable.id)
        .order_by(BarTable.id)
    ).all()
    return [
        {
            "id": table.id,
            "label": table.label,
            "seats": table.seats,
            "open_orders": int(orders or 0),
            "open_total_paise": int(total) if total is not None else None,
        }
        for table, total, orders in rows
    ]


def create_table(session: Session, actor: User, data: dict, ip: str | None = None) -> BarTable:
    clash = session.execute(
        select(BarTable.id).where(func.lower(BarTable.label) == data["label"].lower())
    ).scalar_one_or_none()
    if clash is not None:
        raise AppError("TABLE_EXISTS", "A table with that label already exists.", 409)
    table = BarTable(**data)
    session.add(table)
    session.flush()
    audit.log(session, actor.id, "BAR_TABLE_CREATED", "bar_table", table.id, data, ip)
    session.commit()
    session.refresh(table)
    return table


def update_table(
    session: Session, actor: User, table_id: int, data: dict, ip: str | None = None
) -> BarTable:
    table = session.get(BarTable, table_id)
    if table is None:
        raise AppError("NOT_FOUND", "Table not found.", 404)
    for field, value in data.items():
        setattr(table, field, value)
    audit.log(session, actor.id, "BAR_TABLE_UPDATED", "bar_table", table.id, data, ip)
    session.commit()
    session.refresh(table)
    return table


# -------------------------------------------------------------------------- bar orders


def _price_lines(session: Session, items: list[dict]) -> list[dict]:
    if not items:
        raise AppError("EMPTY_CART", "Add at least one item.", 422)
    lines = []
    for item in items:
        if item["qty"] <= 0 or item["qty"] > MAX_LINE_QTY:
            raise AppError("VALIDATION_ERROR", f"qty must be 1..{MAX_LINE_QTY}.", 422)
        menu_item = session.get(MenuItem, item["menu_item_id"])
        if menu_item is None or not menu_item.is_available:
            raise AppError("NOT_FOUND", f"Menu item {item['menu_item_id']} not available.", 404)
        lines.append(
            {
                "menu_item_id": menu_item.id,
                "name": menu_item.name,
                "qty": item["qty"],
                "unit_price_paise": int(menu_item.price_paise),
                "line_total_paise": int(menu_item.price_paise) * item["qty"],
                "note": item.get("note"),
            }
        )
    return lines


def _retotal(session: Session, order: BarOrder) -> None:
    """Recomputed from the stored line snapshots, so adding items stays consistent."""
    subtotal = int(
        session.execute(
            select(func.coalesce(func.sum(BarOrderItem.line_total_paise), 0)).where(
                BarOrderItem.order_id == order.id
            )
        ).scalar_one()
    )
    pct = pricing.discount_pct(session, order.member_id, "BAR")
    discount = payments_svc.apply_discount(subtotal, pct)
    total = subtotal - discount
    order.subtotal_paise = subtotal
    order.discount_paise = discount
    order.total_paise = total
    order.tax_paise = payments_svc.tax_inclusive(
        total, payments_svc.tax_rate_for(SourceType.BAR_ORDER)
    )


def create_order(session: Session, actor: User, data: dict, ip: str | None = None) -> BarOrder:
    member_id = data.get("member_id")
    if member_id is not None and session.get(Member, member_id) is None:
        raise AppError("MEMBER_NOT_FOUND", "Member not found.", 404)
    if data.get("table_id") is not None and session.get(BarTable, data["table_id"]) is None:
        raise AppError("NOT_FOUND", "Table not found.", 404)

    lines = _price_lines(session, data.get("items") or [])
    order = BarOrder(
        table_id=data.get("table_id"),
        member_id=member_id,
        guest_name=data.get("guest_name") if member_id is None else None,
        kitchen_status=KitchenStatus.NEW.value,
        payment_status=BarPaymentStatus.UNPAID.value,
        created_by=actor.id,
    )
    session.add(order)
    session.flush()
    _add_lines(session, order, lines)
    _retotal(session, order)
    session.commit()
    session.refresh(order)
    return order


def _add_lines(session: Session, order: BarOrder, lines: list[dict]) -> None:
    session.add_all(
        BarOrderItem(
            order_id=order.id,
            menu_item_id=line["menu_item_id"],
            qty=line["qty"],
            unit_price_paise=line["unit_price_paise"],
            line_total_paise=line["line_total_paise"],
            note=line["note"],
        )
        for line in lines
    )
    session.flush()


def add_items(session: Session, actor: User, order_id: int, items: list[dict]) -> BarOrder:
    order = get_order(session, order_id, actor)
    if order.payment_status == BarPaymentStatus.PAID.value:
        raise AppError("ORDER_ALREADY_PAID", "This order is already paid.", 409)
    if order.kitchen_status in (KitchenStatus.SERVED.value, KitchenStatus.CANCELLED.value):
        raise AppError("INVALID_TRANSITION", f"Order is {order.kitchen_status}.", 409)

    _add_lines(session, order, _price_lines(session, items))
    _retotal(session, order)
    session.commit()
    session.refresh(order)
    return order


def get_order(session: Session, order_id: int, actor: User) -> BarOrder:
    order = session.get(BarOrder, order_id)
    if order is None:
        raise AppError("NOT_FOUND", "Order not found.", 404)
    if actor.role == Role.MEMBER.value:
        own = session.execute(
            select(Member.id).where(Member.user_id == actor.id)
        ).scalar_one_or_none()
        if order.member_id != own:
            raise AppError("NOT_FOUND", "Order not found.", 404)
    return order


def order_items(session: Session, order_id: int) -> list[dict]:
    rows = session.execute(
        select(BarOrderItem, MenuItem.name)
        .join(MenuItem, MenuItem.id == BarOrderItem.menu_item_id)
        .where(BarOrderItem.order_id == order_id)
        .order_by(BarOrderItem.id)
    ).all()
    return [
        {
            "menu_item_id": item.menu_item_id,
            "name": name,
            "qty": item.qty,
            "unit_price_paise": int(item.unit_price_paise),
            "line_total_paise": int(item.line_total_paise),
            "note": item.note,
        }
        for item, name in rows
    ]


def list_orders(
    session: Session,
    actor: User,
    kitchen_status: KitchenStatus | str | None = None,
    payment_status: BarPaymentStatus | str | None = None,
    table_id: int | None = None,
    member_id: int | None = None,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[BarOrder], int]:
    if actor.role == Role.MEMBER.value:
        member_id = session.execute(
            select(Member.id).where(Member.user_id == actor.id)
        ).scalar_one_or_none()

    filters = []
    if kitchen_status is not None:
        filters.append(BarOrder.kitchen_status == KitchenStatus(kitchen_status).value)
    if payment_status is not None:
        filters.append(BarOrder.payment_status == BarPaymentStatus(payment_status).value)
    if table_id is not None:
        filters.append(BarOrder.table_id == table_id)
    if member_id is not None:
        filters.append(BarOrder.member_id == member_id)

    total = session.execute(select(func.count(BarOrder.id)).where(*filters)).scalar_one()
    rows = (
        session.execute(
            select(BarOrder)
            .where(*filters)
            .order_by(BarOrder.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .scalars()
        .all()
    )
    return list(rows), int(total)


def set_kitchen_status(
    session: Session, actor: User, order_id: int, status: KitchenStatus
) -> BarOrder:
    order = get_order(session, order_id, actor)
    status = KitchenStatus(status)
    current = KitchenStatus(order.kitchen_status)

    if current is KitchenStatus.CANCELLED:
        raise AppError("INVALID_TRANSITION", "This order was cancelled.", 409)
    if status is KitchenStatus.CANCELLED:
        if current is KitchenStatus.SERVED or order.payment_status == BarPaymentStatus.PAID.value:
            raise AppError("INVALID_TRANSITION", "Served or paid orders cannot be cancelled.", 409)
    elif _KITCHEN_ORDER.index(status) <= _KITCHEN_ORDER.index(current):
        raise AppError(
            "INVALID_TRANSITION", f"Cannot move the kitchen from {current.value} to {status.value}.", 409
        )

    order.kitchen_status = status.value
    session.commit()
    session.refresh(order)
    return order


def pay_order(
    session: Session, actor: User, order_id: int, method: PaymentMethod, ip: str | None = None
) -> BarOrder:
    """Row-locked so two staff cannot both write a payment (SRS 8 Bar)."""
    get_order(session, order_id, actor)
    order = session.execute(
        select(BarOrder).where(BarOrder.id == order_id).with_for_update()
    ).scalar_one()

    if order.payment_status == BarPaymentStatus.PAID.value:
        raise AppError("ORDER_ALREADY_PAID", "This order is already paid.", 409)
    if order.kitchen_status == KitchenStatus.CANCELLED.value:
        raise AppError("INVALID_TRANSITION", "This order was cancelled.", 409)
    if order.total_paise <= 0:
        raise AppError("EMPTY_CART", "There is nothing to pay for.", 422)

    payments_svc.record_payment(
        session,
        SourceType.BAR_ORDER,
        order.id,
        int(order.total_paise),
        PaymentMethod(method),
        member_id=order.member_id,
        user_id=actor.id,
    )
    order.payment_status = BarPaymentStatus.PAID.value
    order.paid_at = utcnow()
    session.commit()
    session.refresh(order)
    return order


def open_tab(session: Session, actor: User, order_id: int) -> BarOrder:
    """A tab is money owed by a known member, so a guest can never open one."""
    order = get_order(session, order_id, actor)
    if order.member_id is None:
        raise AppError("MEMBER_REQUIRED_FOR_TAB", "Tabs are for members only.", 422)
    if order.payment_status == BarPaymentStatus.PAID.value:
        raise AppError("ORDER_ALREADY_PAID", "This order is already paid.", 409)
    order.is_tab = True
    session.commit()
    session.refresh(order)
    return order


def settle_tabs(
    session: Session,
    actor: User,
    member_id: int,
    order_ids: list[int],
    method: PaymentMethod,
    ip: str | None = None,
) -> list[BarOrder]:
    """All or nothing (T-12): one bad id and not a single payment row is written."""
    if not order_ids:
        raise AppError("VALIDATION_ERROR", "Name at least one order.", 422)
    if session.get(Member, member_id) is None:
        raise AppError("MEMBER_NOT_FOUND", "Member not found.", 404)

    unique_ids = sorted(set(order_ids))
    locked = {
        order.id: order
        for order in session.execute(
            select(BarOrder)
            .where(BarOrder.id.in_(unique_ids))
            .order_by(BarOrder.id)  # a stable lock order keeps concurrent settles deadlock-free
            .with_for_update()
        ).scalars()
    }

    orders = []
    for order_id in unique_ids:
        order = locked.get(order_id)
        if order is None or order.member_id != member_id:
            session.rollback()
            raise AppError("NOT_FOUND", f"Order {order_id} is not on this member's tab.", 404)
        if order.payment_status == BarPaymentStatus.PAID.value:
            session.rollback()
            raise AppError("ORDER_ALREADY_PAID", f"Order {order_id} is already paid.", 409)
        if order.kitchen_status == KitchenStatus.CANCELLED.value:
            session.rollback()
            raise AppError("INVALID_TRANSITION", f"Order {order_id} was cancelled.", 409)
        orders.append(order)

    now = utcnow()
    for order in orders:
        payments_svc.record_payment(
            session,
            SourceType.BAR_ORDER,
            order.id,
            int(order.total_paise),
            PaymentMethod(method),
            member_id=member_id,
            user_id=actor.id,
        )
        order.payment_status = BarPaymentStatus.PAID.value
        order.paid_at = now

    audit.log(
        session,
        actor.id,
        "BAR_TAB_SETTLED",
        "member",
        member_id,
        {"order_ids": unique_ids, "method": PaymentMethod(method).value},
        ip,
    )
    session.commit()
    for order in orders:
        session.refresh(order)
    return orders


# ------------------------------------------------------------------------ daily report


def daily_report(session: Session, day: date, actor: User) -> dict:
    """Revenue is read from the payments ledger, never from the order rows (SRS 4.7)."""
    day_from, day_to = day_bounds_utc(day)
    filters = [
        Payment.source_type == SourceType.BAR_ORDER.value,
        Payment.status == PaymentStatus.COMPLETED.value,
        Payment.created_at >= day_from,
        Payment.created_at < day_to,
    ]
    if actor.role == Role.BAR_STAFF.value:
        filters.append(Payment.received_by == actor.id)

    rows = session.execute(select(Payment).where(*filters)).scalars().all()
    by_method: dict[str, int] = {}
    by_staff: dict[int, int] = {}
    for payment in rows:
        by_method[payment.method] = by_method.get(payment.method, 0) + int(payment.amount_paise)
        if payment.received_by is not None:
            by_staff[payment.received_by] = by_staff.get(payment.received_by, 0) + int(
                payment.amount_paise
            )

    names = dict(
        session.execute(
            select(User.id, User.full_name).where(User.id.in_(by_staff.keys() or [0]))
        ).all()
    )

    outstanding = int(
        session.execute(
            select(func.coalesce(func.sum(BarOrder.total_paise), 0)).where(
                BarOrder.is_tab.is_(True),
                BarOrder.payment_status == BarPaymentStatus.UNPAID.value,
                BarOrder.kitchen_status != KitchenStatus.CANCELLED.value,
            )
        ).scalar_one()
    )

    return {
        "date": day,
        "orders": len(rows),
        "revenue_paise": sum(int(p.amount_paise) for p in rows),
        "tax_paise": sum(int(p.tax_paise) for p in rows),
        "by_method": by_method,
        "by_staff": [
            {"user_id": user_id, "name": names.get(user_id, ""), "revenue_paise": amount}
            for user_id, amount in sorted(by_staff.items())
        ],
        "outstanding_tabs_paise": outstanding,
    }


def today(moment: datetime | None = None) -> date:
    return local_date(moment or utcnow())
