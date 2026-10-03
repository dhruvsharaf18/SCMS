// replace with openapi-typescript output

/**
 * Hand-written TypeScript types mirroring SRS 3.2 JSON shapes exactly.
 * Conventions (SRS 1.4):
 * - snake_case keys
 * - *_paise integers (BIGINT in database)
 * - ISO-8601 UTC strings ending with 'Z'
 */

// ── Enums (SRS 3.1, 10, backend/app/enums.py) ──────────────────────────────
export type Role = 'OWNER' | 'MANAGER' | 'FRONT_DESK' | 'BAR_STAFF' | 'MEMBER'

// ── Auth Types (SRS 3.2.1) ─────────────────────────────────────────────────
export interface AuthUser {
  id: number
  email: string
  full_name: string
  role: Role
  member_id: number | null
}

export interface LoginResponse {
  user: AuthUser
}

export interface LoginRequest {
  email: string
  password: string
}

export type Sport = 'TENNIS' | 'PADEL' | 'BADMINTON' | 'CRICKET_NET'

export type Tier = 'GOLD' | 'SILVER' | 'JUNIOR' | 'WALKIN'

export type PlanCode = 'GOLD' | 'SILVER' | 'JUNIOR'

export type MemberStatus = 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'NONE'

export type MembershipStatus = 'ACTIVE' | 'CANCELLED'

export type BookingStatus = 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW'

export type BookingSource = 'WEB' | 'FRONT_DESK' | 'PHONE'

export type PaymentStatus = 'PAID' | 'UNPAID' | 'WAIVED' | 'REFUNDED'

/** Status of a row in the payments ledger, as opposed to a booking's or order's payment_status. */
export type LedgerStatus = 'COMPLETED' | 'REFUNDED'

export type PaymentMethod = 'CASH' | 'CARD' | 'UPI' | 'ONLINE_MOCK'

export type ProductCategory = 'RACKET' | 'BALL' | 'SHOE' | 'ACCESSORY' | 'APPAREL'

export type ShopChannel = 'COUNTER' | 'ONLINE'

export type ShopFulfilment = 'INSTORE' | 'PICKUP' | 'DELIVERY'

export type ShopOrderStatus = 'PLACED' | 'READY' | 'OUT_FOR_DELIVERY' | 'COMPLETED' | 'CANCELLED'

export type MenuCategory = 'FOOD' | 'DRINK' | 'SNACK'

export type KitchenStatus = 'NEW' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED'

export type SourceType = 'BOOKING' | 'SOCIAL' | 'SHOP_ORDER' | 'BAR_ORDER' | 'MEMBERSHIP' | 'INVOICE'

// ── Plans & Pricing ────────────────────────────────────────────────────────
export interface Plan {
  id: number
  code: PlanCode
  name: string
  fee_paise: number
  duration_days: number
  shop_discount_pct: number
  bar_discount_pct: number
  max_bookings_per_day?: number
  advance_booking_days?: number
}

export interface CourtPrice {
  id: number
  sport: Sport
  tier: Tier
  price_per_hour_paise: number
}

// ── Courts & Availability (SRS 3.2.4) ──────────────────────────────────────
export interface Court {
  id: number
  name: string
  sport: Sport
  is_active: boolean
}

export type SlotState = 'FREE' | 'BOOKED' | 'SOCIAL'

export interface CourtSlotAvailability {
  start_at: string // ISO UTC
  state: SlotState
  bookable_1h: boolean
  price_paise: number | null
  booking_id?: number
  member_name?: string
  member_tier?: Tier
  guest_name?: string
}

export interface CourtAvailability {
  court_id: number
  name: string
  sport: Sport
  slots: CourtSlotAvailability[]
}

export interface CourtAvailabilityResponse {
  date: string // YYYY-MM-DD
  slot_minutes: number
  courts: CourtAvailability[]
}

// ── Public Availability (SRS 3.2.4 & S-15) ─────────────────────────────────
export type PublicSlotState = 'FREE' | 'BUSY'

export interface PublicCourtSlot {
  start_at: string // ISO UTC
  state: PublicSlotState
}

export interface PublicCourtAvailability {
  court_id: number
  name: string
  sport: Sport
  slots: PublicCourtSlot[]
}

export interface PublicAvailabilityResponse {
  from: string // YYYY-MM-DD
  days: number
  slot_minutes: number
  courts: PublicCourtAvailability[]
}

// ── Public Products (SRS 3.2.7 & S-15) ─────────────────────────────────────
export interface PublicProduct {
  id: number
  sku: string
  name: string
  category: ProductCategory
  variant: string | null
  description: string | null
  price_paise: number
  in_stock: boolean
}

// ── Public Leads / Enquiries (SRS 3.2.10) ──────────────────────────────────
export type LeadInterest = 'TRIAL' | 'MEMBERSHIP' | 'CORPORATE' | 'OTHER'

export interface PublicEnquiryInput {
  name: string
  email?: string | null
  phone?: string | null
  interest: LeadInterest
  preferred_plan_id?: number | null
  message?: string | null
  website?: string // Honeypot field
}

export interface PublicEnquiryResponse {
  id: number
  status: 'received'
}

// ── Bookings (SRS 3.2.5 / BookingOut) ──────────────────────────────────────
export interface Booking {
  id: number
  court_id: number
  member_id: number | null
  guest_name: string | null
  start_at: string // ISO UTC
  end_at: string   // ISO UTC
  status: BookingStatus
  tier_applied: Tier
  price_paise: number
  payment_status: PaymentStatus
  source: BookingSource
  member_name: string | null
  member_code: string | null
}

export interface BookingCreateInput {
  court_id: number
  start_at: string // ISO UTC
  member_id?: number | null
  guest_name?: string | null
  guest_phone?: string | null
  source: BookingSource
  payment_method: PaymentMethod | null
}

export interface BookingCancelResponse {
  id: number
  status: 'CANCELLED'
  refunded: boolean
  refund_paise: number
}

// ── Social Sessions (SRS 3.2.6) ───────────────────────────────────────────
export interface SocialSessionParticipant {
  member_id: number
  member_name: string
  joined_at: string
}

export interface SocialSession {
  id: number
  court_id: number
  court_name: string
  sport: Sport
  title: string
  start_at: string // ISO UTC
  end_at: string   // ISO UTC
  capacity: number
  joined_count: number
  fee_paise: number
  is_joined?: boolean
  participants: SocialSessionParticipant[]
}

export interface SocialSessionJoinInput {
  sessionId: number
  memberId: number
  memberName?: string
}

// ── Members (SRS 3.2.3) ────────────────────────────────────────────────────
export interface Membership {
  id: number
  plan_code: PlanCode
  plan_id?: number
  start_date: string // YYYY-MM-DD
  end_date: string   // YYYY-MM-DD
  status: MembershipStatus
}

export interface Member {
  id: number
  member_code: string
  full_name: string
  phone: string
  email: string | null
  dob: string | null
  emergency_contact: string | null
  notes: string | null
  membership: Membership | null
  status: MemberStatus
  tier: Tier
}

export interface MemberHistoryEvent {
  kind: 'BOOKING' | 'SHOP_ORDER' | 'BAR_ORDER' | 'PAYMENT'
  id: number
  at: string
  amount_paise: number
  detail: string
}

export interface MemberCreateInput {
  full_name: string
  phone: string
  email?: string | null
  dob?: string | null
  emergency_contact?: string | null
  plan_id?: number | null
  payment_method?: PaymentMethod | null
  lead_id?: number | null
}

// ── Leads (SRS 3.2.10) ─────────────────────────────────────────────────────
export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUOTED' | 'WON' | 'LOST'

export interface Lead {
  id: number
  name: string
  email: string | null
  phone: string | null
  interest: LeadInterest
  preferred_plan_id: number | null
  message: string | null
  status: LeadStatus
  assigned_to: number | null
  created_at: string
}

export interface PaginatedLeads {
  items: Lead[]
  total: number
  page: number
  page_size: number
}

export interface LeadUpdateInput {
  status?: LeadStatus | null
  assigned_to?: number | null
}

export interface LeadNote {
  id: number
  lead_id: number
  author_id: number
  body: string
  created_at: string
}

export interface Quote {
  id: number
  lead_id: number
  amount_paise: number
  description: string
  valid_until: string | null
  status: 'SENT' | 'ACCEPTED' | 'REJECTED'
}

export interface QuoteCreateInput {
  amount_paise: number
  description: string
  valid_until?: string | null
}

export interface LeadConvertedResponse {
  lead_id: number
  member_prefill: {
    full_name: string
    email: string | null
    phone: string | null
    plan_id: number | null
  }
}

// ── Notifications (SRS 3.2.11) ─────────────────────────────────────────────
export type NotificationType =
  | 'NEW_LEAD'
  | 'LOW_STOCK'
  | 'MEMBERSHIP_EXPIRING'
  | 'ONLINE_ORDER'
  | 'LEAVE_REQUEST'
  | 'SYSTEM'

export interface Notification {
  id: number
  type: NotificationType
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

export interface PaginatedNotifications {
  items: Notification[]
  total: number
  page: number
  page_size: number
}

export interface UnreadCountResponse {
  count: number
}

export interface MemberHistoryItem {
  id: string
  type: 'BOOKING' | 'SHOP_ORDER' | 'BAR_ORDER' | 'PAYMENT'
  date: string // ISO UTC
  title: string
  amount_paise: number
  status: string
}

// ── Products & Shop (SRS 3.2.7) ────────────────────────────────────────────
export interface Product {
  id: number
  sku: string
  name: string
  category: ProductCategory
  variant: string | null
  description: string | null
  price_paise: number
  stock_qty: number
  reorder_level: number
  is_active: boolean
}

export interface ShopOrderItem {
  product_id: number
  name: string
  qty: number
  unit_price_paise: number
  line_total_paise: number
}

export interface ShopOrder {
  id: number
  member_id: number | null
  member_name?: string
  guest_name: string | null
  channel: ShopChannel
  fulfilment: ShopFulfilment
  delivery_address: string | null
  status: ShopOrderStatus
  subtotal_paise: number
  discount_paise: number
  total_paise: number
  tax_paise: number
  payment_status: PaymentStatus
  created_at: string
  items: ShopOrderItem[]
}

export interface ShopOrderCreateInput {
  member_id?: number | null
  guest_name?: string | null
  channel: ShopChannel
  fulfilment: ShopFulfilment
  delivery_address?: string | null
  items: { product_id: number; qty: number }[]
  payment_method: PaymentMethod
}

export interface ProductRestockInput {
  qty: number
  note?: string
}

export interface ProductCreateInput {
  sku: string
  name: string
  category: ProductCategory
  variant?: string | null
  description?: string | null
  price_paise: number
  stock_qty: number
  reorder_level: number
  is_active?: boolean
}

export interface ProductUpdateInput {
  sku?: string
  name?: string
  category?: ProductCategory
  variant?: string | null
  description?: string | null
  price_paise?: number
  stock_qty?: number
  reorder_level?: number
  is_active?: boolean
}

export interface PaymentRefundResponse {
  id: number
  status: 'REFUNDED'
  refund_paise: number
}

// ── Bar & Kitchen (SRS 3.2.8) ──────────────────────────────────────────────
export interface MenuItem {
  id: number
  name: string
  category: MenuCategory
  price_paise: number
  is_available: boolean
}

// ── Bar & Dining (member menu + table reservations) ───────────────────────
export type ReservationStatus = 'CONFIRMED' | 'SEATED' | 'CANCELLED' | 'NO_SHOW'

export interface DiningMenuItem {
  id: number
  name: string
  category: MenuCategory
  price_paise: number
  member_price_paise: number
}

export interface DiningMenu {
  tier: string
  discount_pct: number
  items: DiningMenuItem[]
}

export interface DiningSlot {
  start_at: string
  available: boolean
}

export interface DiningAvailability {
  date: string
  party_size: number
  max_party_size: number
  sitting_minutes: number
  slots: DiningSlot[]
}

export interface TableReservation {
  id: number
  member_id: number
  member_name: string | null
  member_code: string | null
  table_id: number
  table_label: string
  party_size: number
  start_at: string
  end_at: string
  status: ReservationStatus
  note: string | null
  created_at: string
}

export interface ReservationCreateInput {
  start_at: string
  party_size: number
  note?: string
}

export interface BarTable {
  id: number
  label: string
  seats: number
  open_orders: number
  open_total_paise: number | null
  open_order_id?: number | null
  open_order_total_paise?: number | null
}

export interface BarOrderItem {
  menu_item_id: number
  name: string
  qty: number
  unit_price_paise: number
  line_total_paise: number
  note: string | null
}

export interface BarOrder {
  id: number
  table_id: number | null
  table_label?: string | null
  member_id: number | null
  member_name?: string | null
  member_code?: string | null
  guest_name: string | null
  kitchen_status: KitchenStatus
  payment_status: 'UNPAID' | 'PAID'
  is_tab: boolean
  subtotal_paise: number
  discount_paise: number
  total_paise: number
  tax_paise: number
  paid_at?: string | null
  created_at?: string
  items: BarOrderItem[]
}

export interface BarOrderCreateInput {
  table_id?: number | null
  member_id?: number | null
  guest_name?: string | null
  items: { menu_item_id: number; qty: number; note?: string }[]
}

export interface TabSettleInput {
  member_id: number
  order_ids: number[]
  method: PaymentMethod
}

export interface BarDailyReport {
  date: string
  orders: number
  revenue_paise: number
  tax_paise: number
  by_method: Record<string, number>
  by_staff: { user_id: number; name: string; revenue_paise: number }[]
  outstanding_tabs_paise: number
}

// ── Payments & Finance (SRS 3.2.9) ─────────────────────────────────────────
export interface Payment {
  id: number
  source_type: SourceType
  source_id: number
  member_id: number | null
  amount_paise: number
  tax_paise: number
  method: PaymentMethod
  status: LedgerStatus
  reference: string | null
  received_by: number | null
  created_at: string
}

// ── Staff / HR (SRS 3.2.11) ────────────────────────────────────────────────
export type StaffRole = Exclude<Role, 'MEMBER'>

export interface Employee {
  id: number
  user_id: number | null
  full_name: string
  title: string | null
  monthly_salary_paise: number
  is_active: boolean
  login_email: string | null
  login_role: StaffRole | null
  login_active: boolean | null
}

export interface EmployeeCreateInput {
  full_name: string
  title?: string
  monthly_salary_paise: number
  login?: { email: string; password: string; role: StaffRole }
}

export interface EmployeeUpdateInput {
  full_name?: string
  title?: string | null
  monthly_salary_paise?: number
  is_active?: boolean
}

export interface PaymentTotals {
  count: number
  collected_paise: number
  refunded_count: number
  refunded_paise: number
}

export interface TaxSummary {
  month: string
  revenue_paise: number
  tax_paise: number
  by_source: Record<string, { revenue_paise: number; tax_paise: number }>
}

export interface PaginatedPayments {
  items: Payment[]
  total: number
  page: number
  page_size: number
}

// ── Dashboard Summary & Reports (SRS 3.2.9) ──────────────────────────────────
export interface DashboardSummary {
  period: string
  from: string
  to: string
  revenue: {
    total_paise: number
    by_source: Record<string, number>
    by_method: Record<string, number>
  }
  receivables: {
    unpaid_tabs_paise: number
    unpaid_invoices_paise: number
  }
  payables: {
    unpaid_expenses_paise: number
    pending_payroll_paise: number
  }
  bookings: {
    count: number
    utilization_pct: number
  }
  members: {
    new: number
    expiring_7d: number
  }
  leads: {
    new: number
  }
  low_stock: {
    product_id: number
    name: string
    stock_qty: number
    reorder_level: number
  }[]
}

export interface RevenueDay {
  date: string
  total_paise: number
  by_source: Record<string, number>
}

export interface RevenueSeries {
  period: string
  days: RevenueDay[]
}

export interface RevenueSeriesPoint {
  date: string
  total_paise: number
  booking_paise: number
  shop_paise: number
  bar_paise: number
  membership_paise: number
}

// ── Error Envelope (SRS 6) ─────────────────────────────────────────────────
export interface ApiError {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}
