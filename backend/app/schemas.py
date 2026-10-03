from datetime import date, datetime, time
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from .enums import (
    STAFF_ROLES,
    BookingPaymentStatus,
    BookingSource,
    BarPaymentStatus,
    BookingStatus,
    ExpenseStatus,
    Fulfilment,
    InvoiceKind,
    InvoiceStatus,
    KitchenStatus,
    LeadInterest,
    LeadStatus,
    LeaveStatus,
    MemberStatus,
    MenuCategory,
    MembershipStatus,
    NotificationType,
    OrderPaymentStatus,
    PaymentMethod,
    PaymentStatus,
    PayrollStatus,
    PlanCode,
    ProductCategory,
    QuoteStatus,
    Role,
    ShopChannel,
    ShiftArea,
    ShopOrderStatus,
    SlotState,
    SocialParticipantStatus,
    SocialSessionStatus,
    SourceType,
    Sport,
    Tier,
)

# The public grid deliberately collapses BOOKED / SOCIAL / PAST into BUSY (SRS 3.2.4).
PublicSlotState = Literal["FREE", "BUSY"]

Email = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        to_lower=True,
        min_length=3,
        max_length=255,
        pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$",
    ),
]
FullName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
# The 10-char / upper / lower / digit policy (S-01) is enforced in security.py so the
# failure comes back as one VALIDATION_ERROR describing exactly what is missing.
Password = Annotated[str, StringConstraints(min_length=1, max_length=128)]


class _Request(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LoginRequest(_Request):
    email: Email
    password: Password


class UserCreate(_Request):
    email: Email
    full_name: FullName
    password: Password
    role: Role

    @field_validator("role")
    @classmethod
    def _staff_only(cls, value: Role) -> Role:
        if value not in STAFF_ROLES:
            raise ValueError("role must be one of OWNER, MANAGER, FRONT_DESK, BAR_STAFF")
        return value


class UserUpdate(_Request):
    role: Role | None = None
    is_active: bool | None = None

    @field_validator("role")
    @classmethod
    def _staff_only(cls, value: Role | None) -> Role | None:
        if value is not None and value not in STAFF_ROLES:
            raise ValueError("role must be one of OWNER, MANAGER, FRONT_DESK, BAR_STAFF")
        return value


class UserSummary(BaseModel):
    """The `user` object embedded in the login response (SRS 3.2.1)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    role: Role
    member_id: int | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    role: Role
    is_active: bool


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserSummary


# ------------------------------------------------------------------ pagination (SRS 1.4)

Page = Annotated[int, Field(ge=1)]
PageSize = Annotated[int, Field(ge=1, le=100)]


class PageOut(BaseModel):
    items: list[Any]
    total: int
    page: int
    page_size: int


# --------------------------------------------------------------- plans & court prices


class PlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: PlanCode
    name: str
    fee_paise: int
    duration_days: int
    shop_discount_pct: int
    bar_discount_pct: int
    max_bookings_per_day: int
    advance_booking_days: int
    is_active: bool


class PlanUpdate(_Request):
    name: Annotated[str, StringConstraints(min_length=1, max_length=50)] | None = None
    fee_paise: Annotated[int, Field(ge=0)] | None = None
    duration_days: Annotated[int, Field(ge=1, le=366)] | None = None
    shop_discount_pct: Annotated[int, Field(ge=0, le=100)] | None = None
    bar_discount_pct: Annotated[int, Field(ge=0, le=100)] | None = None
    max_bookings_per_day: Annotated[int, Field(ge=1, le=24)] | None = None
    advance_booking_days: Annotated[int, Field(ge=1, le=365)] | None = None
    is_active: bool | None = None


class CourtPriceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    sport: Sport
    tier: Tier
    price_per_hour_paise: int


class CourtPriceIn(_Request):
    sport: Sport
    tier: Tier
    price_per_hour_paise: Annotated[int, Field(ge=0)]


# ------------------------------------------------------------------------------ members

Phone = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\d{10,15}$")]


class MemberCreate(_Request):
    full_name: FullName
    phone: Phone
    email: Email | None = None
    dob: date | None = None
    emergency_contact: Annotated[str, StringConstraints(max_length=60)] | None = None
    notes: Annotated[str, StringConstraints(max_length=2000)] | None = None
    plan_id: int | None = None
    payment_method: PaymentMethod | None = None
    lead_id: int | None = None


class MemberUpdate(_Request):
    full_name: FullName | None = None
    phone: Phone | None = None
    email: Email | None = None
    dob: date | None = None
    emergency_contact: Annotated[str, StringConstraints(max_length=60)] | None = None
    notes: Annotated[str, StringConstraints(max_length=2000)] | None = None


class MemberRenew(_Request):
    plan_id: int
    payment_method: PaymentMethod | None = None


class MembershipOut(BaseModel):
    id: int
    plan_code: PlanCode
    start_date: date
    end_date: date
    status: MembershipStatus


class MemberOut(BaseModel):
    """Full profile. BAR_STAFF gets MemberBrief instead (SRS 3.1)."""

    id: int
    member_code: str
    full_name: str
    phone: str
    email: str | None = None
    dob: date | None = None
    emergency_contact: str | None = None
    notes: str | None = None
    status: MemberStatus
    membership: MembershipOut | None = None


class MemberBrief(BaseModel):
    """What BAR_STAFF may see: name, plan and code only (SRS 3.1)."""

    id: int
    member_code: str
    full_name: str
    plan_code: PlanCode | None = None


class MemberCreated(BaseModel):
    id: int
    member_code: str
    full_name: str
    membership: MembershipOut | None = None
    payment_id: int | None = None


class HistoryEvent(BaseModel):
    kind: str
    id: int
    at: datetime
    amount_paise: int
    detail: str


# ------------------------------------------------------------------ courts & availability


class CourtOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    sport: Sport
    is_active: bool


class CourtCreate(_Request):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
    sport: Sport


class CourtUpdate(_Request):
    name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)
    ] | None = None
    sport: Sport | None = None
    is_active: bool | None = None


class SlotOut(BaseModel):
    start_at: datetime
    state: SlotState
    bookable_1h: bool
    price_paise: int | None


class CourtSlotsOut(BaseModel):
    court_id: int
    name: str
    sport: Sport
    slots: list[SlotOut]


class AvailabilityOut(BaseModel):
    date: date
    slot_minutes: int
    courts: list[CourtSlotsOut]


class PublicSlotOut(BaseModel):
    start_at: datetime
    state: PublicSlotState


class PublicCourtOut(BaseModel):
    court_id: int
    name: str
    sport: Sport
    slots: list[PublicSlotOut]


class PublicDayOut(BaseModel):
    date: date
    courts: list[PublicCourtOut]


class PublicAvailabilityOut(BaseModel):
    slot_minutes: int
    days: list[PublicDayOut]


# ------------------------------------------------------------------------------- bookings


class BookingCreate(_Request):
    court_id: int
    start_at: datetime
    member_id: int | None = None
    guest_name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
    ] | None = None
    guest_phone: Phone | None = None
    source: BookingSource = BookingSource.FRONT_DESK
    payment_method: PaymentMethod | None = None


class BookingCancel(_Request):
    reason: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
    ] | None = None
    refund: bool = False


class BookingStatusUpdate(_Request):
    status: BookingStatus


class BookingPay(_Request):
    payment_method: PaymentMethod


class BookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    court_id: int
    member_id: int | None
    guest_name: str | None
    start_at: datetime
    end_at: datetime
    status: BookingStatus
    tier_applied: Tier
    price_paise: int
    payment_status: BookingPaymentStatus
    source: BookingSource
    member_name: str | None = None
    member_code: str | None = None


class BookingCancelled(BaseModel):
    id: int
    status: BookingStatus
    refunded: bool
    refund_paise: int


# ----------------------------------------------------------------------- shop & stock


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sku: str
    name: str
    category: ProductCategory
    variant: str | None
    description: str | None
    price_paise: int
    stock_qty: int
    reorder_level: int
    is_active: bool


class PublicProductOut(BaseModel):
    id: int
    name: str
    category: ProductCategory
    variant: str | None
    price_paise: int
    in_stock: bool


class ProductCreate(_Request):
    sku: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)]
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    category: ProductCategory
    variant: Annotated[str, StringConstraints(max_length=40)] | None = None
    description: Annotated[str, StringConstraints(max_length=2000)] | None = None
    price_paise: Annotated[int, Field(ge=0)]
    stock_qty: Annotated[int, Field(ge=0)] = 0
    reorder_level: Annotated[int, Field(ge=0)] = 3


class ProductUpdate(_Request):
    name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
    ] | None = None
    category: ProductCategory | None = None
    variant: Annotated[str, StringConstraints(max_length=40)] | None = None
    description: Annotated[str, StringConstraints(max_length=2000)] | None = None
    price_paise: Annotated[int, Field(ge=0)] | None = None
    reorder_level: Annotated[int, Field(ge=0)] | None = None
    is_active: bool | None = None


class RestockRequest(_Request):
    qty: Annotated[int, Field(ge=1, le=10000)]
    note: Annotated[str, StringConstraints(max_length=200)] | None = None


class OrderLineIn(_Request):
    product_id: int
    qty: Annotated[int, Field(ge=1, le=100)]


class OrderLineOut(BaseModel):
    product_id: int
    name: str
    qty: int
    unit_price_paise: int
    line_total_paise: int


class ShopOrderCreate(_Request):
    member_id: int | None = None
    guest_name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
    ] | None = None
    channel: ShopChannel = ShopChannel.COUNTER
    fulfilment: Fulfilment = Fulfilment.INSTORE
    delivery_address: Annotated[str, StringConstraints(max_length=300)] | None = None
    items: list[OrderLineIn]
    payment_method: PaymentMethod | None = None


class ShopOrderStatusUpdate(_Request):
    status: ShopOrderStatus


class OrderPay(_Request):
    payment_method: PaymentMethod


class OrderCancel(_Request):
    reason: Annotated[str, StringConstraints(max_length=200)] | None = None


class ShopOrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    member_id: int | None
    guest_name: str | None
    channel: ShopChannel
    fulfilment: Fulfilment
    delivery_address: str | None
    status: ShopOrderStatus
    subtotal_paise: int
    discount_paise: int
    total_paise: int
    tax_paise: int
    payment_status: OrderPaymentStatus
    items: list[OrderLineOut] = []


class ShopOrderCancelled(BaseModel):
    id: int
    status: ShopOrderStatus
    refunded: bool
    refund_paise: int


# ---------------------------------------------------------------------------------- bar


class MenuItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    category: MenuCategory
    price_paise: int
    is_available: bool


class MenuItemCreate(_Request):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
    category: MenuCategory
    price_paise: Annotated[int, Field(ge=0)]
    is_available: bool = True


class MenuItemUpdate(_Request):
    name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)
    ] | None = None
    category: MenuCategory | None = None
    price_paise: Annotated[int, Field(ge=0)] | None = None
    is_available: bool | None = None


class BarTableOut(BaseModel):
    id: int
    label: str
    seats: int
    open_orders: int
    open_total_paise: int | None


class BarTableCreate(_Request):
    label: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)]
    seats: Annotated[int, Field(ge=1, le=50)] = 4


class BarTableUpdate(_Request):
    label: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)
    ] | None = None
    seats: Annotated[int, Field(ge=1, le=50)] | None = None


class BarLineIn(_Request):
    menu_item_id: int
    qty: Annotated[int, Field(ge=1, le=50)]
    note: Annotated[str, StringConstraints(max_length=100)] | None = None


class BarLineOut(BaseModel):
    menu_item_id: int
    name: str
    qty: int
    unit_price_paise: int
    line_total_paise: int
    note: str | None


class BarOrderCreate(_Request):
    table_id: int | None = None
    member_id: int | None = None
    guest_name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
    ] | None = None
    items: list[BarLineIn]


class BarItemsAdd(_Request):
    items: list[BarLineIn]


class KitchenStatusUpdate(_Request):
    status: KitchenStatus


class BarPay(_Request):
    method: PaymentMethod


class TabSettle(_Request):
    member_id: int
    order_ids: list[int]
    method: PaymentMethod


class BarOrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    table_id: int | None
    member_id: int | None
    guest_name: str | None
    kitchen_status: KitchenStatus
    payment_status: BarPaymentStatus
    is_tab: bool
    subtotal_paise: int
    discount_paise: int
    total_paise: int
    tax_paise: int
    paid_at: datetime | None
    items: list[BarLineOut] = []


class StaffRevenue(BaseModel):
    user_id: int
    name: str
    revenue_paise: int


class BarDailyReport(BaseModel):
    date: date
    orders: int
    revenue_paise: int
    tax_paise: int
    by_method: dict[str, int]
    by_staff: list[StaffRevenue]
    outstanding_tabs_paise: int


# --------------------------------------------------------------- payments & dashboard


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_type: SourceType
    source_id: int
    member_id: int | None
    amount_paise: int
    tax_paise: int
    method: PaymentMethod
    status: PaymentStatus
    reference: str | None
    received_by: int | None
    created_at: datetime


class RefundRequest(_Request):
    reason: Annotated[str, StringConstraints(max_length=200)] | None = None


class RevenueBreakdown(BaseModel):
    total_paise: int
    by_source: dict[str, int]
    by_method: dict[str, int]


class Receivables(BaseModel):
    unpaid_tabs_paise: int
    unpaid_invoices_paise: int


class Payables(BaseModel):
    unpaid_expenses_paise: int
    pending_payroll_paise: int


class BookingStats(BaseModel):
    count: int
    utilization_pct: float


class MemberStats(BaseModel):
    new: int
    expiring_7d: int


class LeadStats(BaseModel):
    new: int


class LowStockRow(BaseModel):
    product_id: int
    name: str
    stock_qty: int
    reorder_level: int


class DashboardSummary(BaseModel):
    period: str
    from_: datetime = Field(serialization_alias="from")
    to: datetime
    revenue: RevenueBreakdown
    receivables: Receivables
    payables: Payables
    bookings: BookingStats
    members: MemberStats
    leads: LeadStats
    low_stock: list[LowStockRow]

    model_config = ConfigDict(populate_by_name=True)


class RevenueDay(BaseModel):
    date: date
    total_paise: int
    by_source: dict[str, int]


class RevenueSeries(BaseModel):
    period: str
    days: list[RevenueDay]


class TaxSummary(BaseModel):
    month: str
    revenue_paise: int
    tax_paise: int
    by_source: dict[str, dict[str, int]]


# -------------------------------------------------------------- leads & notifications


class EnquiryCreate(_Request):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    email: Email | None = None
    phone: Phone | None = None
    interest: LeadInterest = LeadInterest.OTHER
    preferred_plan_id: int | None = None
    message: Annotated[str, StringConstraints(max_length=1000)] | None = None
    # Honeypot. Real browsers leave it empty; bots fill every field they find.
    website: Annotated[str, StringConstraints(max_length=200)] | None = None


class EnquiryAccepted(BaseModel):
    """Deliberately tiny: a public caller learns nothing but that we got it (S-15)."""

    id: int
    status: str


class LeadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str | None
    phone: str | None
    interest: LeadInterest
    preferred_plan_id: int | None
    message: str | None
    status: LeadStatus
    assigned_to: int | None
    created_at: datetime


class LeadUpdate(_Request):
    status: LeadStatus | None = None
    assigned_to: int | None = None


class LeadNoteCreate(_Request):
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]


class LeadNoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    lead_id: int
    author_id: int | None
    body: str
    created_at: datetime


class QuoteCreate(_Request):
    amount_paise: Annotated[int, Field(ge=0)]
    description: Annotated[str, StringConstraints(max_length=500)] | None = None
    valid_until: date | None = None


class QuoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    lead_id: int
    amount_paise: int
    description: str | None
    valid_until: date | None
    status: QuoteStatus


class MemberPrefill(BaseModel):
    full_name: str
    email: str | None
    phone: str | None
    plan_id: int | None
    lead_id: int


class LeadConverted(BaseModel):
    lead_id: int
    member_prefill: MemberPrefill


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: NotificationType
    title: str
    body: str | None
    link: str | None
    read_at: datetime | None
    created_at: datetime


class UnreadCount(BaseModel):
    unread: int


# --------------------------------------------------------------------------- social play


class SocialSessionCreate(_Request):
    court_id: int
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    start_at: datetime
    end_at: datetime
    capacity: Annotated[int, Field(ge=1, le=100)]
    fee_paise: Annotated[int, Field(ge=0)] = 0


class SocialJoin(_Request):
    member_id: int | None = None
    guest_name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
    ] | None = None


class SocialLeave(_Request):
    member_id: int | None = None


class SocialSessionOut(BaseModel):
    id: int
    court_id: int
    title: str
    start_at: datetime
    end_at: datetime
    capacity: int
    joined_count: int
    fee_paise: int
    status: SocialSessionStatus


class SocialParticipantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    member_id: int | None
    guest_name: str | None
    fee_paise: int
    status: SocialParticipantStatus


# ------------------------------------------------------------- clients, invoices, expenses


class ClientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_name: str
    contact_name: str | None
    email: str | None
    phone: str | None
    gstin: str | None


class ClientCreate(_Request):
    company_name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=150)
    ]
    contact_name: Annotated[str, StringConstraints(max_length=120)] | None = None
    email: Email | None = None
    phone: Phone | None = None
    gstin: Annotated[str, StringConstraints(max_length=20)] | None = None


class ClientUpdate(_Request):
    company_name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=150)
    ] | None = None
    contact_name: Annotated[str, StringConstraints(max_length=120)] | None = None
    email: Email | None = None
    phone: Phone | None = None
    gstin: Annotated[str, StringConstraints(max_length=20)] | None = None


class InvoiceLineIn(_Request):
    description: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    qty: Annotated[int, Field(ge=1, le=1000)]
    unit_price_paise: Annotated[int, Field(ge=0)]


class InvoiceLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    description: str
    qty: int
    unit_price_paise: int
    line_total_paise: int


class InvoiceCreate(_Request):
    kind: InvoiceKind
    member_id: int | None = None
    client_id: int | None = None
    issue_date: date | None = None
    due_date: date | None = None
    notes: Annotated[str, StringConstraints(max_length=500)] | None = None
    lines: list[InvoiceLineIn]


class InvoiceStatusUpdate(_Request):
    status: InvoiceStatus


class MarkPaid(_Request):
    method: PaymentMethod


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    number: str
    kind: InvoiceKind
    member_id: int | None
    client_id: int | None
    status: InvoiceStatus
    issue_date: date
    due_date: date
    subtotal_paise: int
    tax_paise: int
    total_paise: int
    notes: str | None
    lines: list[InvoiceLineOut] = []


class ExpenseCreate(_Request):
    category: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)]
    vendor: Annotated[str, StringConstraints(max_length=120)] | None = None
    description: Annotated[str, StringConstraints(max_length=200)] | None = None
    amount_paise: Annotated[int, Field(ge=1)]
    due_date: date | None = None


class ExpenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category: str
    vendor: str | None
    description: str | None
    amount_paise: int
    status: ExpenseStatus
    due_date: date | None
    paid_at: datetime | None


# ----------------------------------------------------------------------------------- hr


class EmployeeCreate(_Request):
    user_id: int | None = None
    full_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    title: Annotated[str, StringConstraints(max_length=60)] | None = None
    monthly_salary_paise: Annotated[int, Field(ge=0)]
    is_active: bool = True


class EmployeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int | None
    full_name: str
    title: str | None
    monthly_salary_paise: int
    is_active: bool


class ShiftCreate(_Request):
    employee_id: int
    shift_date: date
    start_time: time
    end_time: time
    area: ShiftArea


class ShiftOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    shift_date: date
    start_time: time
    end_time: time
    area: ShiftArea


class LeaveRequestCreate(_Request):
    employee_id: int | None = None
    from_date: date
    to_date: date
    reason: Annotated[str, StringConstraints(max_length=300)] | None = None


class LeaveDecision(_Request):
    decision: LeaveStatus


class LeaveRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    from_date: date
    to_date: date
    reason: str | None
    status: LeaveStatus
    decided_by: int | None


class PayrollRun(_Request):
    month: Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}$")]


class PayrollOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    month: str
    employee_id: int
    base_paise: int
    deductions_paise: int
    net_paise: int
    status: PayrollStatus


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    actor_id: int | None
    action: str
    entity: str | None
    entity_id: int | None
    meta: dict[str, Any] | None
    ip: str | None
    created_at: datetime
