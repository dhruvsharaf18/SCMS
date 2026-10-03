from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from ..db import get_session
from ..enums import ProductCategory, Role, ShopOrderStatus
from ..models import User
from ..schemas import (
    OrderCancel,
    OrderLineOut,
    OrderPay,
    Page,
    PageOut,
    PageSize,
    ProductCreate,
    ProductOut,
    ProductUpdate,
    RestockRequest,
    ShopOrderCancelled,
    ShopOrderCreate,
    ShopOrderOut,
    ShopOrderStatusUpdate,
)
from ..security import client_ip, require_roles
from ..services import shop as svc

# Paths are written in full so they match SRS 3.2 exactly (see DECISIONS).
router = APIRouter(prefix="/api/v1", tags=["shop"])

_STAFF = (Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
_ADMIN = (Role.OWNER, Role.MANAGER)
_BUYERS = (Role.OWNER, Role.MANAGER, Role.FRONT_DESK, Role.MEMBER)


# ------------------------------------------------------------------------------ products


@router.get("/products", response_model=list[ProductOut])
def list_products(
    category: ProductCategory | None = None,
    q: str | None = None,
    include_inactive: bool = False,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_STAFF)),
) -> list[ProductOut]:
    products = svc.list_products(session, category, q, active_only=not include_inactive)
    return [ProductOut.model_validate(product) for product in products]


@router.get("/products/low-stock", response_model=list[ProductOut])
def low_stock(
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_STAFF)),
) -> list[ProductOut]:
    return [ProductOut.model_validate(product) for product in svc.low_stock(session)]


@router.post("/products", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_product(
    payload: ProductCreate,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ADMIN)),
) -> ProductOut:
    product = svc.create_product(session, user, payload.model_dump(), client_ip(request))
    return ProductOut.model_validate(product)


@router.get("/products/{product_id}", response_model=ProductOut)
def get_product(
    product_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_STAFF)),
) -> ProductOut:
    return ProductOut.model_validate(svc.get_product(session, product_id))


@router.patch("/products/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int,
    payload: ProductUpdate,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ADMIN)),
) -> ProductOut:
    data = payload.model_dump(exclude_unset=True)
    return ProductOut.model_validate(
        svc.update_product(session, user, product_id, data, client_ip(request))
    )


@router.post("/products/{product_id}/restock", response_model=ProductOut)
def restock(
    product_id: int,
    payload: RestockRequest,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ADMIN)),
) -> ProductOut:
    product = svc.restock(
        session, user, product_id, payload.qty, payload.note, client_ip(request)
    )
    return ProductOut.model_validate(product)


# -------------------------------------------------------------------------------- orders


def _out(session: Session, order) -> ShopOrderOut:
    body = ShopOrderOut.model_validate(order)
    body.items = [OrderLineOut(**line) for line in svc.order_items(session, order.id)]
    return body


@router.post("/shop/orders", response_model=ShopOrderOut, status_code=status.HTTP_201_CREATED)
def create_order(
    payload: ShopOrderCreate,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_BUYERS)),
) -> ShopOrderOut:
    data = payload.model_dump()
    data["items"] = [dict(item) for item in data["items"]]
    return _out(session, svc.create_order(session, user, data, client_ip(request)))


@router.get("/shop/orders", response_model=PageOut)
def list_orders(
    order_status: ShopOrderStatus | None = Query(default=None, alias="status"),
    member_id: int | None = None,
    page: Page = 1,
    page_size: PageSize = 50,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_BUYERS)),
) -> PageOut:
    rows, total = svc.list_orders(session, user, order_status, member_id, page, page_size)
    return PageOut(
        items=[_out(session, row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/shop/orders/{order_id}", response_model=ShopOrderOut)
def get_order(
    order_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_BUYERS)),
) -> ShopOrderOut:
    return _out(session, svc.get_order(session, order_id, user))


@router.post("/shop/orders/{order_id}/status", response_model=ShopOrderOut)
def set_status(
    order_id: int,
    payload: ShopOrderStatusUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_STAFF)),
) -> ShopOrderOut:
    return _out(session, svc.set_status(session, user, order_id, payload.status))


@router.post("/shop/orders/{order_id}/pay", response_model=ShopOrderOut)
def pay_order(
    order_id: int,
    payload: OrderPay,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_STAFF)),
) -> ShopOrderOut:
    return _out(session, svc.pay_order(session, user, order_id, payload.payment_method))


@router.post("/shop/orders/{order_id}/cancel", response_model=ShopOrderCancelled)
def cancel_order(
    order_id: int,
    payload: OrderCancel,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_BUYERS)),
) -> ShopOrderCancelled:
    order, refunded, refund_paise = svc.cancel_order(
        session, user, order_id, payload.reason, client_ip(request)
    )
    return ShopOrderCancelled(
        id=order.id,
        status=ShopOrderStatus(order.status),
        refunded=refunded,
        refund_paise=refund_paise,
    )
