from datetime import date

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from ..db import get_session
from ..enums import BarPaymentStatus, KitchenStatus, MenuCategory, Role
from ..models import User
from ..schemas import (
    BarDailyReport,
    BarItemsAdd,
    BarLineOut,
    BarOrderCreate,
    BarOrderOut,
    BarPay,
    BarTableCreate,
    BarTableOut,
    BarTableUpdate,
    KitchenStatusUpdate,
    MenuItemCreate,
    MenuItemOut,
    MenuItemUpdate,
    Page,
    PageOut,
    PageSize,
    TabSettle,
)
from ..security import client_ip, require_roles
from ..services import bar as svc

# Paths are written in full so they match SRS 3.2 exactly (see DECISIONS).
router = APIRouter(prefix="/api/v1", tags=["bar"])

_ADMIN = (Role.OWNER, Role.MANAGER)
_BAR = (Role.OWNER, Role.MANAGER, Role.BAR_STAFF)
_READERS = (Role.OWNER, Role.MANAGER, Role.FRONT_DESK, Role.BAR_STAFF)


def _out(session: Session, order) -> BarOrderOut:
    body = BarOrderOut.model_validate(order)
    body.items = [BarLineOut(**line) for line in svc.order_items(session, order.id)]
    return body


# ---------------------------------------------------------------------------- menu items


@router.get("/menu-items", response_model=list[MenuItemOut])
def list_menu_items(
    category: MenuCategory | None = None,
    include_unavailable: bool = False,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_READERS)),
) -> list[MenuItemOut]:
    items = svc.list_menu_items(session, category, available_only=not include_unavailable)
    return [MenuItemOut.model_validate(item) for item in items]


@router.post("/menu-items", response_model=MenuItemOut, status_code=status.HTTP_201_CREATED)
def create_menu_item(
    payload: MenuItemCreate,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ADMIN)),
) -> MenuItemOut:
    item = svc.create_menu_item(session, user, payload.model_dump(), client_ip(request))
    return MenuItemOut.model_validate(item)


@router.patch("/menu-items/{item_id}", response_model=MenuItemOut)
def update_menu_item(
    item_id: int,
    payload: MenuItemUpdate,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ADMIN)),
) -> MenuItemOut:
    data = payload.model_dump(exclude_unset=True)
    return MenuItemOut.model_validate(
        svc.update_menu_item(session, user, item_id, data, client_ip(request))
    )


# --------------------------------------------------------------------------- bar tables


@router.get("/bar/tables", response_model=list[BarTableOut])
def list_tables(
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_READERS)),
) -> list[BarTableOut]:
    return [BarTableOut(**table) for table in svc.list_tables(session)]


@router.post("/bar/tables", response_model=BarTableOut, status_code=status.HTTP_201_CREATED)
def create_table(
    payload: BarTableCreate,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ADMIN)),
) -> BarTableOut:
    table = svc.create_table(session, user, payload.model_dump(), client_ip(request))
    return BarTableOut(
        id=table.id, label=table.label, seats=table.seats, open_orders=0, open_total_paise=None
    )


@router.patch("/bar/tables/{table_id}", response_model=BarTableOut)
def update_table(
    table_id: int,
    payload: BarTableUpdate,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_ADMIN)),
) -> BarTableOut:
    data = payload.model_dump(exclude_unset=True)
    table = svc.update_table(session, user, table_id, data, client_ip(request))
    current = next(row for row in svc.list_tables(session) if row["id"] == table.id)
    return BarTableOut(**current)


# -------------------------------------------------------------------------- bar orders


@router.post("/bar/orders", response_model=BarOrderOut, status_code=status.HTTP_201_CREATED)
def create_order(
    payload: BarOrderCreate,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_BAR)),
) -> BarOrderOut:
    data = payload.model_dump()
    data["items"] = [dict(item) for item in data["items"]]
    return _out(session, svc.create_order(session, user, data, client_ip(request)))


@router.get("/bar/orders", response_model=PageOut)
def list_orders(
    kitchen_status: KitchenStatus | None = None,
    payment_status: BarPaymentStatus | None = None,
    table_id: int | None = None,
    member_id: int | None = None,
    page: Page = 1,
    page_size: PageSize = 50,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_READERS)),
) -> PageOut:
    rows, total = svc.list_orders(
        session, user, kitchen_status, payment_status, table_id, member_id, page, page_size
    )
    return PageOut(
        items=[_out(session, row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/bar/reports/daily", response_model=BarDailyReport)
def daily_report(
    date_: date = Query(alias="date"),
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_BAR)),
) -> BarDailyReport:
    """BAR_STAFF see only what they took themselves; managers see the whole bar (SRS 3.2.8)."""
    return BarDailyReport.model_validate(svc.daily_report(session, date_, user))


@router.get("/bar/orders/{order_id}", response_model=BarOrderOut)
def get_order(
    order_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_READERS)),
) -> BarOrderOut:
    return _out(session, svc.get_order(session, order_id, user))


@router.post("/bar/orders/{order_id}/items", response_model=BarOrderOut)
def add_items(
    order_id: int,
    payload: BarItemsAdd,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_BAR)),
) -> BarOrderOut:
    items = [dict(item) for item in payload.model_dump()["items"]]
    return _out(session, svc.add_items(session, user, order_id, items))


@router.post("/bar/orders/{order_id}/kitchen-status", response_model=BarOrderOut)
def set_kitchen_status(
    order_id: int,
    payload: KitchenStatusUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_BAR)),
) -> BarOrderOut:
    return _out(session, svc.set_kitchen_status(session, user, order_id, payload.status))


@router.post("/bar/orders/{order_id}/pay", response_model=BarOrderOut)
def pay_order(
    order_id: int,
    payload: BarPay,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_BAR)),
) -> BarOrderOut:
    return _out(session, svc.pay_order(session, user, order_id, payload.method, client_ip(request)))


@router.post("/bar/orders/{order_id}/tab", response_model=BarOrderOut)
def open_tab(
    order_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_BAR)),
) -> BarOrderOut:
    return _out(session, svc.open_tab(session, user, order_id))


@router.post("/bar/tabs/settle", response_model=list[BarOrderOut])
def settle_tabs(
    payload: TabSettle,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_BAR)),
) -> list[BarOrderOut]:
    orders = svc.settle_tabs(
        session, user, payload.member_id, payload.order_ids, payload.method, client_ip(request)
    )
    return [_out(session, order) for order in orders]
