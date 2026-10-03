"""Shared `str, Enum` classes (SRS 1.4: stored as VARCHAR + CHECK).

Values match the CHECK constraints in the SRS 10 DDL exactly.
"""

from enum import Enum


class _Str(str, Enum):
    def __str__(self) -> str:  # pragma: no cover - convenience only
        return self.value


class Role(_Str):
    OWNER = "OWNER"
    MANAGER = "MANAGER"
    FRONT_DESK = "FRONT_DESK"
    BAR_STAFF = "BAR_STAFF"
    MEMBER = "MEMBER"


STAFF_ROLES: tuple[Role, ...] = (Role.OWNER, Role.MANAGER, Role.FRONT_DESK, Role.BAR_STAFF)


class PlanCode(_Str):
    GOLD = "GOLD"
    SILVER = "SILVER"
    JUNIOR = "JUNIOR"


class Tier(_Str):
    GOLD = "GOLD"
    SILVER = "SILVER"
    JUNIOR = "JUNIOR"
    WALKIN = "WALKIN"


class MembershipStatus(_Str):
    ACTIVE = "ACTIVE"
    CANCELLED = "CANCELLED"


class MemberStatus(_Str):
    """Derived on read (SRS 3.2.3), never stored."""

    ACTIVE = "ACTIVE"
    EXPIRING = "EXPIRING"
    EXPIRED = "EXPIRED"
    NONE = "NONE"


class Sport(_Str):
    TENNIS = "TENNIS"
    PADEL = "PADEL"
    BADMINTON = "BADMINTON"
    CRICKET_NET = "CRICKET_NET"


class BookingStatus(_Str):
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"
    NO_SHOW = "NO_SHOW"


class BookingPaymentStatus(_Str):
    PAID = "PAID"
    UNPAID = "UNPAID"
    WAIVED = "WAIVED"
    REFUNDED = "REFUNDED"


class BookingSource(_Str):
    WEB = "WEB"
    FRONT_DESK = "FRONT_DESK"
    PHONE = "PHONE"


class SlotState(_Str):
    """Availability grid states (SRS 3.2.4), never stored."""

    FREE = "FREE"
    BOOKED = "BOOKED"
    SOCIAL = "SOCIAL"
    PAST = "PAST"


class SocialSessionStatus(_Str):
    OPEN = "OPEN"
    CANCELLED = "CANCELLED"


class SocialParticipantStatus(_Str):
    JOINED = "JOINED"
    LEFT = "LEFT"


class ProductCategory(_Str):
    RACKET = "RACKET"
    BALL = "BALL"
    SHOE = "SHOE"
    ACCESSORY = "ACCESSORY"
    APPAREL = "APPAREL"


class ShopChannel(_Str):
    COUNTER = "COUNTER"
    ONLINE = "ONLINE"


class Fulfilment(_Str):
    INSTORE = "INSTORE"
    PICKUP = "PICKUP"
    DELIVERY = "DELIVERY"


class ShopOrderStatus(_Str):
    PLACED = "PLACED"
    READY = "READY"
    OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class OrderPaymentStatus(_Str):
    PAID = "PAID"
    UNPAID = "UNPAID"
    REFUNDED = "REFUNDED"


class StockReason(_Str):
    SALE = "SALE"
    RESTOCK = "RESTOCK"
    CANCEL = "CANCEL"
    ADJUST = "ADJUST"


class MenuCategory(_Str):
    FOOD = "FOOD"
    DRINK = "DRINK"
    SNACK = "SNACK"


class KitchenStatus(_Str):
    NEW = "NEW"
    PREPARING = "PREPARING"
    READY = "READY"
    SERVED = "SERVED"
    CANCELLED = "CANCELLED"


class BarPaymentStatus(_Str):
    UNPAID = "UNPAID"
    PAID = "PAID"


class SourceType(_Str):
    BOOKING = "BOOKING"
    SOCIAL = "SOCIAL"
    SHOP_ORDER = "SHOP_ORDER"
    BAR_ORDER = "BAR_ORDER"
    MEMBERSHIP = "MEMBERSHIP"
    INVOICE = "INVOICE"


class PaymentMethod(_Str):
    CASH = "CASH"
    CARD = "CARD"
    UPI = "UPI"
    ONLINE_MOCK = "ONLINE_MOCK"


class PaymentStatus(_Str):
    COMPLETED = "COMPLETED"
    REFUNDED = "REFUNDED"


class LeadInterest(_Str):
    TRIAL = "TRIAL"
    MEMBERSHIP = "MEMBERSHIP"
    CORPORATE = "CORPORATE"
    OTHER = "OTHER"


class LeadStatus(_Str):
    NEW = "NEW"
    CONTACTED = "CONTACTED"
    QUOTED = "QUOTED"
    WON = "WON"
    LOST = "LOST"


class QuoteStatus(_Str):
    SENT = "SENT"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"


class InvoiceKind(_Str):
    MEMBERSHIP = "MEMBERSHIP"
    CORPORATE = "CORPORATE"


class InvoiceStatus(_Str):
    DRAFT = "DRAFT"
    SENT = "SENT"
    PAID = "PAID"
    VOID = "VOID"


class ExpenseStatus(_Str):
    PAID = "PAID"
    UNPAID = "UNPAID"


class ShiftArea(_Str):
    FRONT_DESK = "FRONT_DESK"
    BAR = "BAR"
    SHOP = "SHOP"
    COURTS = "COURTS"


class LeaveStatus(_Str):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class PayrollStatus(_Str):
    PENDING = "PENDING"
    PAID = "PAID"


class NotificationType(_Str):
    NEW_LEAD = "NEW_LEAD"
    LOW_STOCK = "LOW_STOCK"
    MEMBERSHIP_EXPIRING = "MEMBERSHIP_EXPIRING"
    ONLINE_ORDER = "ONLINE_ORDER"
    LEAVE_REQUEST = "LEAVE_REQUEST"


def values(enum_cls: type[_Str]) -> str:
    """Render an enum as a SQL CHECK value list."""
    return ",".join(f"'{member.value}'" for member in enum_cls)
