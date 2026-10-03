from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from ..db import get_session
from ..enums import ExpenseStatus, Role
from ..models import User
from ..schemas import ExpenseCreate, ExpenseOut, Page, PageOut, PageSize
from ..security import client_ip, require_roles
from ..services import billing as svc

# Paths are written in full so they match SRS 3.2 exactly (see DECISIONS).
router = APIRouter(prefix="/api/v1", tags=["expenses"])

_FINANCE = (Role.OWNER, Role.MANAGER)


@router.get("/expenses", response_model=PageOut)
def list_expenses(
    expense_status: ExpenseStatus | None = Query(default=None, alias="status"),
    page: Page = 1,
    page_size: PageSize = 50,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_FINANCE)),
) -> PageOut:
    rows, total = svc.list_expenses(session, expense_status, page, page_size)
    return PageOut(
        items=[ExpenseOut.model_validate(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/expenses", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
def create_expense(
    payload: ExpenseCreate,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_FINANCE)),
) -> ExpenseOut:
    expense = svc.create_expense(session, user, payload.model_dump(), client_ip(request))
    return ExpenseOut.model_validate(expense)


@router.get("/expenses/{expense_id}", response_model=ExpenseOut)
def get_expense(
    expense_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_FINANCE)),
) -> ExpenseOut:
    return ExpenseOut.model_validate(svc.get_expense(session, expense_id))


@router.post("/expenses/{expense_id}/mark-paid", response_model=ExpenseOut)
def mark_paid(
    expense_id: int,
    request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_roles(*_FINANCE)),
) -> ExpenseOut:
    expense = svc.mark_expense_paid(session, user, expense_id, client_ip(request))
    return ExpenseOut.model_validate(expense)
