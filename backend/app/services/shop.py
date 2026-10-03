"""SRS 4.5 / 4.6 — products, stock and shop orders.

Stock is never read-then-written. Every decrement is a conditional UPDATE guarded by
`stock_qty >= :qty`, so two concurrent orders for the last unit can never both succeed and
`stock_qty` can never go negative. Rows are locked in product_id order to avoid deadlocks.
"""

from sqlalchemy import func, select, update
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from .. import audit
from ..enums import (
    Fulfilment,
    NotificationType,
    OrderPaymentStatus,
    PaymentMethod,
    ProductCategory,
    Role,
    ShopChannel,
    ShopOrderStatus,
    SourceType,
    StockReason,
)
from ..models import Member, Product, ShopOrder, ShopOrderItem, StockMovement, User
from ..security import AppError
from . import notifications, payments as payments_svc, pricing

MAX_LINE_QTY = 100

# Forward-only lifecycle. COUNTER orders are born COMPLETED, so they have nowhere to go.
_NEXT_STATUS = {
    ShopOrderStatus.PLACED: {ShopOrderStatus.READY, ShopOrderStatus.OUT_FOR_DELIVERY},
    ShopOrderStatus.READY: {ShopOrderStatus.OUT_FOR_DELIVERY, ShopOrderStatus.COMPLETED},
    ShopOrderStatus.OUT_FOR_DELIVERY: {ShopOrderStatus.COMPLETED},
    ShopOrderStatus.COMPLETED: set(),
    ShopOrderStatus.CANCELLED: set(),
}


# ----------------------------------------------------------------------------- products


def list_products(
    session: Session,
    category: ProductCategory | str | None = None,
    q: str | None = None,
    active_only: bool = True,
) -> list[Product]:
    filters = []
    if active_only:
        filters.append(Product.is_active.is_(True))
    if category is not None:
        filters.append(Product.category == ProductCategory(category).value)
    if q:
        filters.append(func.lower(Product.name).like(f"%{q.lower()}%"))
    return list(
        session.execute(select(Product).where(*filters).order_by(Product.id)).scalars().all()
    )


def get_product(session: Session, product_id: int) -> Product:
    product = session.get(Product, product_id)
    if product is None:
        raise AppError("NOT_FOUND", "Product not found.", 404)
    return product


def create_product(session: Session, actor: User, data: dict, ip: str | None = None) -> Product:
    clash = session.execute(
        select(Product.id).where(Product.sku == data["sku"])
    ).scalar_one_or_none()
    if clash is not None:
        raise AppError("SKU_EXISTS", "A product with that SKU already exists.", 409)

    product = Product(**data)
    session.add(product)
    session.flush()
    if product.stock_qty:
        _movement(session, product.id, product.stock_qty, StockReason.RESTOCK, None, None,
                  "opening stock", actor.id)
    audit.log(session, actor.id, "PRODUCT_CREATED", "product", product.id, data, ip)
    session.commit()
    session.refresh(product)
    return product


def update_product(
    session: Session, actor: User, product_id: int, data: dict, ip: str | None = None
) -> Product:
    """Price changes are audited; stock is only ever moved through restock / orders."""
    product = get_product(session, product_id)
    for field, value in data.items():
        setattr(product, field, value)
    audit.log(session, actor.id, "PRODUCT_UPDATED", "product", product.id, data, ip)
    session.commit()
    session.refresh(product)
    return product


def deactivate_product(
    session: Session, actor: User, product_id: int, ip: str | None = None
) -> Product:
    """Soft delete only — stock history and past order lines must stay readable."""
    product = get_product(session, product_id)
    product.is_active = False
    audit.log(session, actor.id, "PRODUCT_DEACTIVATED", "product", product.id, None, ip)
    session.commit()
    session.refresh(product)
    return product


def low_stock(session: Session) -> list[Product]:
    return list(
        session.execute(
            select(Product)
            .where(Product.is_active.is_(True), Product.stock_qty <= Product.reorder_level)
            .order_by(Product.stock_qty, Product.id)
        )
        .scalars()
        .all()
    )


def restock(
    session: Session, actor: User, product_id: int, qty: int, note: str | None, ip: str | None
) -> Product:
    if qty <= 0:
        raise AppError("VALIDATION_ERROR", "qty must be positive.", 422)
    product = get_product(session, product_id)
    product.stock_qty += qty
    _movement(session, product.id, qty, StockReason.RESTOCK, None, None, note, actor.id)
    audit.log(session, actor.id, "PRODUCT_RESTOCKED", "product", product.id, {"qty": qty}, ip)
    session.commit()
    session.refresh(product)
    return product


def _movement(
    session: Session,
    product_id: int,
    delta: int,
    reason: StockReason,
    ref_type: str | None,
    ref_id: int | None,
    note: str | None,
    user_id: int | None,
) -> None:
    session.add(
        StockMovement(
            product_id=product_id,
            delta=delta,
            reason=StockReason(reason).value,
            ref_type=ref_type,
            ref_id=ref_id,
            note=note,
            created_by=user_id,
        )
    )


# -------------------------------------------------------------------------------- stock


def _take_stock(session: Session, product_id: int, qty: int) -> None:
    """The whole race guard: a conditional UPDATE that simply does not match when short."""
    taken = session.execute(
        update(Product)
        .where(
            Product.id == product_id,
            Product.is_active.is_(True),
            Product.stock_qty >= qty,
        )
        .values(stock_qty=Product.stock_qty - qty)
    ).rowcount
    if taken == 0:
        available = session.execute(
            select(Product.stock_qty).where(Product.id == product_id)
        ).scalar_one_or_none()
        raise AppError(
            "OUT_OF_STOCK",
            "Not enough stock for that order.",
            409,
            {"product_id": product_id, "available": int(available or 0)},
        )


def _notify_low_stock(session: Session, product_ids: list[int]) -> None:
    """Once per crossing: the dedupe key carries the level the product dropped to."""
    for product in session.execute(
        select(Product).where(
            Product.id.in_(product_ids), Product.stock_qty <= Product.reorder_level
        )
    ).scalars():
        notifications.notify(
            session,
            Role.MANAGER,
            NotificationType.LOW_STOCK,
            f"Low stock: {product.name}",
            f"{product.stock_qty} left (reorder at {product.reorder_level}).",
            f"/products/{product.id}",
            dedupe_key=f"LOW_STOCK:{product.id}:{product.stock_qty}",
        )


# ------------------------------------------------------------------------------- orders


def _price_lines(session: Session, items: list[dict]) -> list[dict]:
    """Snapshot unit prices so a later price change never rewrites an order."""
    if not items:
        raise AppError("EMPTY_CART", "Add at least one item.", 422)

    merged: dict[int, int] = {}
    for item in items:
        if item["qty"] <= 0 or item["qty"] > MAX_LINE_QTY:
            raise AppError("VALIDATION_ERROR", f"qty must be 1..{MAX_LINE_QTY}.", 422)
        merged[item["product_id"]] = merged.get(item["product_id"], 0) + item["qty"]

    lines = []
    for product_id in sorted(merged):  # sorted: the deadlock-avoidance order from SRS 4.5
        product = session.get(Product, product_id)
        if product is None or not product.is_active:
            raise AppError("NOT_FOUND", f"Product {product_id} not found.", 404)
        qty = merged[product_id]
        lines.append(
            {
                "product_id": product.id,
                "name": product.name,
                "qty": qty,
                "unit_price_paise": int(product.price_paise),
                "line_total_paise": int(product.price_paise) * qty,
            }
        )
    return lines


def _totals(session: Session, member_id: int | None, lines: list[dict]) -> dict:
    subtotal = sum(line["line_total_paise"] for line in lines)
    pct = pricing.discount_pct(session, member_id, "SHOP")
    discount = payments_svc.apply_discount(subtotal, pct)
    total = subtotal - discount
    tax = payments_svc.tax_inclusive(total, payments_svc.tax_rate_for(SourceType.SHOP_ORDER))
    return {
        "subtotal_paise": subtotal,
        "discount_paise": discount,
        "total_paise": total,
        "tax_paise": tax,
    }


def create_order(session: Session, actor: User, data: dict, ip: str | None = None) -> ShopOrder:
    channel = ShopChannel(data.get("channel") or ShopChannel.COUNTER)
    fulfilment = Fulfilment(data.get("fulfilment") or Fulfilment.INSTORE)
    member_id = data.get("member_id")

    if actor.role == Role.MEMBER.value:
        member_id = _own_member_id(session, actor)
        channel = ShopChannel.ONLINE
    elif channel is ShopChannel.ONLINE:
        raise AppError("FORBIDDEN", "Online orders are placed by members.", 403)

    if channel is ShopChannel.ONLINE:
        if fulfilment not in (Fulfilment.PICKUP, Fulfilment.DELIVERY):
            raise AppError("VALIDATION_ERROR", "Online orders are PICKUP or DELIVERY.", 422)
        if fulfilment is Fulfilment.DELIVERY and not data.get("delivery_address"):
            raise AppError("ADDRESS_REQUIRED", "A delivery address is required.", 422)

    if member_id is not None and session.get(Member, member_id) is None:
        raise AppError("MEMBER_NOT_FOUND", "Member not found.", 404)

    lines = _price_lines(session, data.get("items") or [])
    totals = _totals(session, member_id, lines)
    method = data.get("payment_method")

    if channel is ShopChannel.COUNTER and not method:
        raise AppError("VALIDATION_ERROR", "Counter sales are paid at the counter.", 422)

    paid = bool(method)
    order = ShopOrder(
        member_id=member_id,
        guest_name=data.get("guest_name") if member_id is None else None,
        channel=channel.value,
        fulfilment=fulfilment.value,
        delivery_address=data.get("delivery_address"),
        status=(
            ShopOrderStatus.COMPLETED.value
            if channel is ShopChannel.COUNTER
            else ShopOrderStatus.PLACED.value
        ),
        payment_status=(
            OrderPaymentStatus.PAID.value if paid else OrderPaymentStatus.UNPAID.value
        ),
        created_by=actor.id,
        **totals,
    )
    session.add(order)
    session.flush()

    try:
        for line in lines:  # already sorted by product_id
            _take_stock(session, line["product_id"], line["qty"])
            session.add(
                ShopOrderItem(
                    order_id=order.id,
                    product_id=line["product_id"],
                    qty=line["qty"],
                    unit_price_paise=line["unit_price_paise"],
                    line_total_paise=line["line_total_paise"],
                )
            )
            _movement(
                session,
                line["product_id"],
                -line["qty"],
                StockReason.SALE,
                "SHOP_ORDER",
                order.id,
                None,
                actor.id,
            )
    except AppError:
        session.rollback()  # nothing partially saved (SRS 3.2.7)
        raise
    except OperationalError:
        session.rollback()
        raise AppError("OUT_OF_STOCK", "Could not reserve stock, please retry.", 409) from None

    if paid:
        payments_svc.record_payment(
            session,
            SourceType.SHOP_ORDER,
            order.id,
            totals["total_paise"],
            PaymentMethod(method),
            member_id=member_id,
            user_id=actor.id,
        )

    if channel is ShopChannel.ONLINE:
        notifications.notify(
            session,
            Role.FRONT_DESK,
            NotificationType.ONLINE_ORDER,
            f"Online order #{order.id}",
            f"{fulfilment.value.title()} order for {totals['total_paise']} paise.",
            f"/shop/orders/{order.id}",
            dedupe_key=f"ONLINE_ORDER:{order.id}",
        )

    _notify_low_stock(session, [line["product_id"] for line in lines])
    session.commit()
    session.refresh(order)
    return order


def _own_member_id(session: Session, user: User) -> int:
    member_id = session.execute(
        select(Member.id).where(Member.user_id == user.id)
    ).scalar_one_or_none()
    if member_id is None:
        raise AppError("MEMBER_NOT_FOUND", "This account is not linked to a member.", 404)
    return member_id


def get_order(session: Session, order_id: int, actor: User) -> ShopOrder:
    order = session.get(ShopOrder, order_id)
    if order is None:
        raise AppError("NOT_FOUND", "Order not found.", 404)
    if actor.role == Role.MEMBER.value and order.member_id != _own_member_id(session, actor):
        raise AppError("NOT_FOUND", "Order not found.", 404)
    return order


def order_items(session: Session, order_id: int) -> list[dict]:
    rows = session.execute(
        select(ShopOrderItem, Product.name)
        .join(Product, Product.id == ShopOrderItem.product_id)
        .where(ShopOrderItem.order_id == order_id)
        .order_by(ShopOrderItem.id)
    ).all()
    return [
        {
            "product_id": item.product_id,
            "name": name,
            "qty": item.qty,
            "unit_price_paise": int(item.unit_price_paise),
            "line_total_paise": int(item.line_total_paise),
        }
        for item, name in rows
    ]


def list_orders(
    session: Session,
    actor: User,
    status: ShopOrderStatus | str | None = None,
    member_id: int | None = None,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[ShopOrder], int]:
    if actor.role == Role.MEMBER.value:
        member_id = _own_member_id(session, actor)

    filters = []
    if status is not None:
        filters.append(ShopOrder.status == ShopOrderStatus(status).value)
    if member_id is not None:
        filters.append(ShopOrder.member_id == member_id)

    total = session.execute(select(func.count(ShopOrder.id)).where(*filters)).scalar_one()
    rows = (
        session.execute(
            select(ShopOrder)
            .where(*filters)
            .order_by(ShopOrder.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .scalars()
        .all()
    )
    return list(rows), int(total)


def set_status(
    session: Session, actor: User, order_id: int, status: ShopOrderStatus
) -> ShopOrder:
    order = get_order(session, order_id, actor)
    status = ShopOrderStatus(status)
    allowed = _NEXT_STATUS[ShopOrderStatus(order.status)]
    if status not in allowed:
        raise AppError(
            "INVALID_TRANSITION", f"Cannot move an order from {order.status} to {status.value}.", 409
        )
    if status is ShopOrderStatus.COMPLETED and order.payment_status == OrderPaymentStatus.UNPAID.value:
        raise AppError("ORDER_UNPAID", "Take payment before completing the order.", 409)
    order.status = status.value
    session.commit()
    session.refresh(order)
    return order


def pay_order(
    session: Session, actor: User, order_id: int, method: PaymentMethod
) -> ShopOrder:
    order = get_order(session, order_id, actor)
    if order.status == ShopOrderStatus.CANCELLED.value:
        raise AppError("ORDER_CANCELLED", "This order was cancelled.", 409)
    if order.payment_status != OrderPaymentStatus.UNPAID.value:
        raise AppError("ORDER_ALREADY_PAID", f"Order is {order.payment_status}.", 409)

    payments_svc.record_payment(
        session,
        SourceType.SHOP_ORDER,
        order.id,
        int(order.total_paise),
        PaymentMethod(method),
        member_id=order.member_id,
        user_id=actor.id,
    )
    order.payment_status = OrderPaymentStatus.PAID.value
    session.commit()
    session.refresh(order)
    return order


def cancel_order(
    session: Session, actor: User, order_id: int, reason: str | None, ip: str | None = None
) -> tuple[ShopOrder, bool, int]:
    """Stock goes back exactly once; a paid order is refunded, never deleted."""
    order = get_order(session, order_id, actor)
    if order.status == ShopOrderStatus.CANCELLED.value:
        raise AppError("ALREADY_CANCELLED", "This order is already cancelled.", 409)
    if order.status == ShopOrderStatus.COMPLETED.value and actor.role not in (
        Role.OWNER.value,
        Role.MANAGER.value,
    ):
        raise AppError("ORDER_COMPLETED", "Only a manager can cancel a completed order.", 409)

    for item in session.execute(
        select(ShopOrderItem)
        .where(ShopOrderItem.order_id == order.id)
        .order_by(ShopOrderItem.product_id)
    ).scalars():
        session.execute(
            update(Product)
            .where(Product.id == item.product_id)
            .values(stock_qty=Product.stock_qty + item.qty)
        )
        _movement(
            session, item.product_id, item.qty, StockReason.CANCEL, "SHOP_ORDER", order.id,
            reason, actor.id,
        )

    refunded, refund_paise = False, 0
    if order.payment_status == OrderPaymentStatus.PAID.value:
        payment = payments_svc.payment_for(session, SourceType.SHOP_ORDER, order.id)
        if payment is not None:
            payments_svc.refund_payment(session, payment)
            order.payment_status = OrderPaymentStatus.REFUNDED.value
            refunded, refund_paise = True, int(payment.amount_paise)

    order.status = ShopOrderStatus.CANCELLED.value
    audit.log(
        session,
        actor.id,
        "SHOP_ORDER_CANCELLED",
        "shop_order",
        order.id,
        {"reason": reason, "refund_paise": refund_paise},
        ip,
    )
    session.commit()
    session.refresh(order)
    return order, refunded, refund_paise


# -------------------------------------------------------------------------------- public


def public_products(session: Session, category: ProductCategory | str | None = None) -> list[dict]:
    """Never the exact quantity — a competitor should not be able to read our stock (SRS 3.2.7)."""
    return [
        {
            "id": product.id,
            "name": product.name,
            "category": product.category,
            "variant": product.variant,
            "price_paise": int(product.price_paise),
            "in_stock": product.stock_qty > 0,
        }
        for product in list_products(session, category)
    ]
