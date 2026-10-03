import type {
  Court,
  CourtPrice,
  Plan,
  Product,
  MenuItem,
  BarTable,
  Member,
  Booking,
  ShopOrder,
  BarOrder,
  Payment,
  CourtAvailabilityResponse,
  CourtAvailability,
  CourtSlotAvailability,
  BookingCreateInput,
  BookingCancelResponse,
  MemberCreateInput,
  ShopOrderCreateInput,
  BarOrderCreateInput,
  BarDailyReport,
  DashboardSummary,
  RevenueSeriesPoint,
  ProductCreateInput,
  ProductUpdateInput,
  PaymentRefundResponse,
  SocialSession,
  SocialSessionParticipant,
  KitchenStatus,
  BookingStatus,
  Sport,
  Tier,
  PublicAvailabilityResponse,
  PublicCourtAvailability,
  PublicCourtSlot,
  PublicProduct,
  PublicEnquiryInput,
  PublicEnquiryResponse,
  ApiError,
} from '../api/types'
import {
  MOCK_PLANS,
  MOCK_COURT_PRICES,
  MOCK_COURTS,
  MOCK_PRODUCTS,
  MOCK_MENU,
  MOCK_TABLES,
  generateMockMembers,
  generateInitialBookings,
  generateInitialBarOrders,
  generateInitialShopOrders,
  generateInitialPayments,
  generateInitialSocialSessions,
} from './seed-data'
import { getTodayIST, istToUtcIso, calcDiscountPaise, calcTaxPaise, calcShopTaxPaise } from '../lib/format'

// ── In-Memory State ────────────────────────────────────────────────────────
let members: Member[] = generateMockMembers()
let bookings: Booking[] = generateInitialBookings(members)
let products: Product[] = [...MOCK_PRODUCTS]
let menuItems: MenuItem[] = [...MOCK_MENU]
let tables: BarTable[] = [...MOCK_TABLES]
let barOrders: BarOrder[] = generateInitialBarOrders(members)
let shopOrders: ShopOrder[] = generateInitialShopOrders(members)
let payments: Payment[] = generateInitialPayments(members)
let socialSessions: SocialSession[] = generateInitialSocialSessions(members)

// Track simulated error toggle for dev testing
let simulatedError: string | null = null

export function setSimulatedError(code: string | null) {
  simulatedError = code
}

export function getSimulatedError(): string | null {
  return simulatedError
}

function checkSimulatedError(expectedCode?: string) {
  if (simulatedError) {
    const code = simulatedError
    // reset after throw if desired or keep until manually cleared
    const err: ApiError = {
      error: {
        code,
        message: `Simulated error: ${code}`,
      },
    }
    throw err
  }
}

// ── Pricing Helper ─────────────────────────────────────────────────────────
export function getTierPrice(sport: Sport, tier: Tier): number {
  const p = MOCK_COURT_PRICES.find((cp) => cp.sport === sport && cp.tier === tier)
  return p ? p.price_per_hour_paise : 0
}

export function getMemberDiscount(memberId: number | null, kind: 'SHOP' | 'BAR'): number {
  if (!memberId) return 0
  const m = members.find((mem) => mem.id === memberId)
  if (!m || m.status !== 'ACTIVE' || !m.membership) return 0
  const plan = MOCK_PLANS.find((pl) => pl.code === m.membership?.plan_code)
  if (!plan) return 0
  return kind === 'SHOP' ? plan.shop_discount_pct : plan.bar_discount_pct
}

// ── Court Availability (SRS 3.2.4) ─────────────────────────────────────────
export function getMockCourtAvailability(dateStr: string, sportFilter?: Sport, requestingMemberId?: number): CourtAvailabilityResponse {
  // Operational hours: 06:00 to 21:00 (last 1h booking starts at 20:00, last 30m slot at 20:30)
  const slotTimes: string[] = []
  for (let h = 6; h <= 20; h++) {
    const hh = String(h).padStart(2, '0')
    slotTimes.push(`${hh}:00`)
    if (h < 21) {
      slotTimes.push(`${hh}:30`)
    }
  }

  // Determine requesting tier
  let reqTier: Tier = 'WALKIN'
  if (requestingMemberId) {
    const m = members.find((mem) => mem.id === requestingMemberId)
    if (m && m.status === 'ACTIVE' && m.membership) {
      reqTier = m.membership.plan_code as Tier
    }
  }

  const filteredCourts = sportFilter ? MOCK_COURTS.filter((c) => c.sport === sportFilter) : MOCK_COURTS

  const courtsResult: CourtAvailability[] = filteredCourts.map((court) => {
    const courtBookings = bookings.filter(
      (b) => b.court_id === court.id && b.status !== 'CANCELLED' && b.start_at.startsWith(dateStr)
    )

    const slots: CourtSlotAvailability[] = slotTimes.map((tStr) => {
      const startIso = istToUtcIso(dateStr, tStr)

      // Find if slot is booked
      const existing = courtBookings.find((b) => {
        // A booking is 1 hour long -> occupies start_at and start_at + 30m
        const bStart = new Date(b.start_at).getTime()
        const bEnd = new Date(b.end_at).getTime()
        const sTime = new Date(startIso).getTime()
        return sTime >= bStart && sTime < bEnd
      })

      if (existing) {
        const m = existing.member_id ? members.find((mem) => mem.id === existing.member_id) : null
        return {
          start_at: startIso,
          state: 'BOOKED',
          bookable_1h: false,
          price_paise: null,
          booking_id: existing.id,
          member_name: m?.full_name ?? undefined,
          member_tier: existing.tier_applied,
          guest_name: existing.guest_name ?? undefined,
        }
      }

      // Check if Friday evening social play
      const dayOfWeek = new Date(dateStr).getDay() // 5 = Friday
      if (dayOfWeek === 5 && court.sport === 'PADEL' && (tStr === '18:00' || tStr === '18:30' || tStr === '19:00')) {
        return {
          start_at: startIso,
          state: 'SOCIAL',
          bookable_1h: false,
          price_paise: null,
        }
      }

      // Free slot
      const price = getTierPrice(court.sport, reqTier)
      return {
        start_at: startIso,
        state: 'FREE',
        bookable_1h: true,
        price_paise: price,
      }
    })

    return {
      court_id: court.id,
      name: court.name,
      sport: court.sport,
      slots,
    }
  })

  return {
    date: dateStr,
    slot_minutes: 30,
    courts: courtsResult,
  }
}

// ── Bookings Operations ────────────────────────────────────────────────────
export function getMockBookings(filters?: { date?: string; court_id?: number; member_id?: number; status?: string }): Booking[] {
  let list = [...bookings]
  if (filters?.date) {
    list = list.filter((b) => b.start_at.startsWith(filters.date!))
  }
  if (filters?.court_id) {
    list = list.filter((b) => b.court_id === filters.court_id)
  }
  if (filters?.member_id) {
    list = list.filter((b) => b.member_id === filters.member_id)
  }
  if (filters?.status) {
    list = list.filter((b) => b.status === filters.status)
  }
  return list.sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime())
}

export function createMockBooking(input: BookingCreateInput): Booking {
  checkSimulatedError('SLOT_TAKEN')

  const court = MOCK_COURTS.find((c) => c.id === input.court_id)
  if (!court) {
    throw { error: { code: 'COURT_NOT_FOUND', message: 'Court not found' } }
  }

  // Calculate 1-hour end_at
  const startMs = new Date(input.start_at).getTime()
  const endIso = new Date(startMs + 60 * 60 * 1000).toISOString()

  // Collision check
  const conflict = bookings.find(
    (b) =>
      b.court_id === input.court_id &&
      b.status !== 'CANCELLED' &&
      new Date(b.start_at).getTime() < new Date(endIso).getTime() &&
      new Date(b.end_at).getTime() > startMs
  )

  if (conflict) {
    throw { error: { code: 'SLOT_TAKEN', message: 'This slot is already booked' } }
  }

  // Daily limit check: max 2 bookings per day for members
  if (input.member_id) {
    const bookingDate = input.start_at.split('T')[0]
    const count = bookings.filter(
      (b) =>
        b.member_id === input.member_id &&
        b.status !== 'CANCELLED' &&
        b.start_at.startsWith(bookingDate)
    ).length

    if (count >= 2) {
      throw { error: { code: 'DAILY_LIMIT_REACHED', message: 'Member has reached maximum 2 bookings for this day' } }
    }
  }

  // Member details & tier
  let memberName: string | null = null
  let memberCode: string | null = null
  let tier: Tier = 'WALKIN'

  if (input.member_id) {
    const m = members.find((mem) => mem.id === input.member_id)
    if (m) {
      tier = (m.status === 'ACTIVE' && m.membership ? m.membership.plan_code : 'WALKIN') as Tier
    }
  }

  const price = getTierPrice(court.sport, tier)
  const isPaid = price === 0 ? 'WAIVED' : input.payment_method ? 'PAID' : 'UNPAID'

  const newBooking: Booking = {
    id: 200 + bookings.length + 1,
    court_id: input.court_id,
    member_id: input.member_id ?? null,
    member_name: null,
    member_code: null,
    guest_name: input.guest_name ?? null,
    start_at: input.start_at,
    end_at: endIso,
    status: 'CONFIRMED',
    tier_applied: tier,
    price_paise: price,
    payment_status: isPaid,
    source: input.source,
  }

  bookings.unshift(newBooking)
  return newBooking
}

export function cancelMockBooking(id: number, reason?: string): BookingCancelResponse {
  checkSimulatedError('ALREADY_CANCELLED')
  const b = bookings.find((item) => item.id === id)
  if (!b) throw { error: { code: 'NOT_FOUND', message: 'Booking not found' } }
  if (b.status === 'CANCELLED') throw { error: { code: 'ALREADY_CANCELLED', message: 'Booking already cancelled' } }

  const startTimeMs = new Date(b.start_at).getTime()
  const nowMs = Date.now()
  if (startTimeMs <= nowMs) {
    throw { error: { code: 'BOOKING_STARTED', message: 'Cannot cancel a booking that has already started' } }
  }

  const hoursUntilStart = (startTimeMs - nowMs) / (1000 * 60 * 60)
  // SRS 4.3: if PAID and >= 2h before start -> full refund; otherwise no refund
  const isEligibleForRefund = b.payment_status === 'PAID' && hoursUntilStart >= 2
  const refundPaise = isEligibleForRefund ? b.price_paise : 0

  b.status = 'CANCELLED'
  if (isEligibleForRefund) {
    b.payment_status = 'REFUNDED'
  }

  return {
    id: b.id,
    status: 'CANCELLED',
    refunded: isEligibleForRefund,
    refund_paise: refundPaise,
  }
}

export function updateMockBookingStatus(id: number, status: 'COMPLETED' | 'NO_SHOW'): Booking {
  const b = bookings.find((item) => item.id === id)
  if (!b) throw { error: { code: 'NOT_FOUND', message: 'Booking not found' } }
  b.status = status
  return b
}

export function payMockBooking(id: number, method: 'CASH' | 'CARD' | 'UPI'): Booking {
  const b = bookings.find((item) => item.id === id)
  if (!b) throw { error: { code: 'NOT_FOUND', message: 'Booking not found' } }
  b.payment_status = 'PAID'
  return b
}

// ── Members Operations ─────────────────────────────────────────────────────
export function getMockMembers(params?: { q?: string; status?: string; tier?: string }): Member[] {
  let list = [...members]
  if (params?.q) {
    const query = params.q.toLowerCase()
    list = list.filter(
      (m) =>
        m.full_name.toLowerCase().includes(query) ||
        m.phone.includes(query) ||
        m.member_code.toLowerCase().includes(query)
    )
  }
  if (params?.status) {
    list = list.filter((m) => m.status === params.status)
  }
  if (params?.tier) {
    list = list.filter((m) => m.tier === params.tier)
  }
  return list
}

export function getMockMember(id: number): Member | null {
  return members.find((m) => m.id === id) ?? null
}

export function getMockMemberByCode(code: string): Member | null {
  const clean = code.trim().toUpperCase()
  return members.find((m) => m.member_code === clean) ?? null
}

export function createMockMember(input: MemberCreateInput): Member {
  checkSimulatedError('PHONE_EXISTS')

  const id = members.length + 1
  const member_code = `CC-${String(id).padStart(6, '0')}`
  const today = getTodayIST()
  const plan = MOCK_PLANS.find((p) => p.id === (input.plan_id ?? 1)) ?? MOCK_PLANS[0]

  // end date in 30 days
  const [y, m, d] = today.split('-').map(Number)
  const endDate = new Date(Date.UTC(y, m - 1, d + 30)).toISOString().split('T')[0]

  const newMember: Member = {
    id,
    member_code,
    full_name: input.full_name,
    phone: input.phone,
    email: input.email ?? null,
    dob: input.dob ?? null,
    emergency_contact: input.emergency_contact ?? null,
    notes: null,
    tier: plan.code,
    status: 'ACTIVE',
    membership: {
      id: id * 10,
      plan_code: plan.code,
      plan_id: plan.id,
      start_date: today,
      end_date: endDate,
      status: 'ACTIVE',
    },
  }

  members.unshift(newMember)
  return newMember
}

// ── Products & Shop Operations ─────────────────────────────────────────────
export function getMockProducts(category?: string): Product[] {
  let list = [...products]
  if (category && category !== 'ALL') {
    list = list.filter((p) => p.category === category)
  }
  return list
}

export function getMockLowStockProducts(): Product[] {
  return products.filter((p) => p.stock_qty <= p.reorder_level)
}

export function createMockShopOrder(input: ShopOrderCreateInput): ShopOrder {
  checkSimulatedError('OUT_OF_STOCK')

  if (!input.items || input.items.length === 0) {
    throw { error: { code: 'EMPTY_CART', message: 'Cart is empty. Please add items to order.' } }
  }

  if (input.fulfilment === 'DELIVERY' && (!input.delivery_address || !input.delivery_address.trim())) {
    throw { error: { code: 'ADDRESS_REQUIRED', message: 'Delivery address is required for home delivery' } }
  }

  // Stock check
  for (const item of input.items) {
    const prod = products.find((p) => p.id === item.product_id)
    if (!prod || prod.stock_qty < item.qty) {
      throw {
        error: {
          code: 'OUT_OF_STOCK',
          message: `"${prod?.name ?? 'Item'}" is out of stock (available: ${prod?.stock_qty ?? 0})`,
          details: { product_id: item.product_id, available: prod?.stock_qty ?? 0 },
        },
      }
    }
  }

  // Deduct stock
  const orderItems = input.items.map((item) => {
    const prod = products.find((p) => p.id === item.product_id)!
    prod.stock_qty -= item.qty
    return {
      product_id: prod.id,
      name: prod.name,
      qty: item.qty,
      unit_price_paise: prod.price_paise,
      line_total_paise: prod.price_paise * item.qty,
    }
  })

  const subtotal = orderItems.reduce((sum, item) => sum + item.line_total_paise, 0)
  const discountPct = getMemberDiscount(input.member_id ?? null, 'SHOP')
  const discount = calcDiscountPaise(subtotal, discountPct)
  const total = subtotal - discount
  const tax = calcShopTaxPaise(total)

  let memberName: string | undefined = undefined
  if (input.member_id) {
    const m = members.find((mem) => mem.id === input.member_id)
    if (m) memberName = m.full_name
  }

  const isPaid = input.payment_method === 'ONLINE_MOCK' || (input.channel === 'COUNTER' && input.payment_method !== null)
  const initialStatus = input.channel === 'ONLINE' ? 'PLACED' : 'COMPLETED'

  const order: ShopOrder = {
    id: 100 + shopOrders.length + 1,
    member_id: input.member_id ?? null,
    member_name: memberName,
    guest_name: input.guest_name ?? null,
    channel: input.channel,
    fulfilment: input.fulfilment,
    delivery_address: input.delivery_address?.trim() ?? null,
    status: initialStatus,
    subtotal_paise: subtotal,
    discount_paise: discount,
    total_paise: total,
    tax_paise: tax,
    payment_status: isPaid ? 'PAID' : 'UNPAID',
    created_at: new Date().toISOString(),
    items: orderItems,
  }

  shopOrders.unshift(order)
  return order
}

export function cancelMockShopOrder(orderId: number, _reason?: string): ShopOrder {
  checkSimulatedError('ALREADY_CANCELLED')
  const order = shopOrders.find((o) => o.id === orderId)
  if (!order) throw { error: { code: 'NOT_FOUND', message: 'Order not found' } }

  if (order.status === 'CANCELLED') {
    throw { error: { code: 'ALREADY_CANCELLED', message: 'Order is already cancelled' } }
  }

  if (order.status !== 'PLACED') {
    throw { error: { code: 'ORDER_LOCKED', message: `Cannot cancel order in ${order.status} status` } }
  }

  // Restore stock
  for (const item of order.items) {
    const prod = products.find((p) => p.id === item.product_id)
    if (prod) {
      prod.stock_qty += item.qty
    }
  }

  order.status = 'CANCELLED'
  if (order.payment_status === 'PAID') {
    order.payment_status = 'REFUNDED'
  }

  return order
}

export function restockMockProduct(productId: number, qty: number): Product {
  const prod = products.find((p) => p.id === productId)
  if (!prod) throw { error: { code: 'NOT_FOUND', message: 'Product not found' } }
  prod.stock_qty += qty
  return prod
}

export function createMockProduct(input: ProductCreateInput): Product {
  checkSimulatedError('DUPLICATE_SKU')
  const existing = products.find((p) => p.sku.toLowerCase() === input.sku.toLowerCase())
  if (existing) {
    throw { error: { code: 'DUPLICATE_SKU', message: `Product with SKU ${input.sku} already exists` } }
  }

  const newProd: Product = {
    id: Math.max(...products.map((p) => p.id), 0) + 1,
    sku: input.sku.trim().toUpperCase(),
    name: input.name.trim(),
    category: input.category,
    variant: input.variant?.trim() ?? null,
    description: input.description?.trim() ?? null,
    price_paise: input.price_paise,
    stock_qty: input.stock_qty,
    reorder_level: input.reorder_level,
    is_active: input.is_active ?? true,
  }

  products.push(newProd)
  return newProd
}

export function updateMockProduct(id: number, input: ProductUpdateInput): Product {
  checkSimulatedError('NOT_FOUND')
  const prod = products.find((p) => p.id === id)
  if (!prod) throw { error: { code: 'NOT_FOUND', message: 'Product not found' } }

  if (input.sku && input.sku.toLowerCase() !== prod.sku.toLowerCase()) {
    const existing = products.find((p) => p.sku.toLowerCase() === input.sku!.toLowerCase() && p.id !== id)
    if (existing) {
      throw { error: { code: 'DUPLICATE_SKU', message: `Product with SKU ${input.sku} already exists` } }
    }
    prod.sku = input.sku.trim().toUpperCase()
  }

  if (input.name !== undefined) prod.name = input.name.trim()
  if (input.category !== undefined) prod.category = input.category
  if (input.variant !== undefined) prod.variant = input.variant ? input.variant.trim() : null
  if (input.description !== undefined) prod.description = input.description ? input.description.trim() : null
  if (input.price_paise !== undefined) prod.price_paise = input.price_paise
  if (input.stock_qty !== undefined) prod.stock_qty = input.stock_qty
  if (input.reorder_level !== undefined) prod.reorder_level = input.reorder_level
  if (input.is_active !== undefined) prod.is_active = input.is_active

  return prod
}

// ── Bar & Kitchen Operations ───────────────────────────────────────────────
export function getMockMenuItems(category?: string): MenuItem[] {
  let list = [...menuItems]
  if (category && category !== 'ALL') {
    list = list.filter((m) => m.category === category)
  }
  return list
}

export function getMockBarTables(): BarTable[] {
  // refresh open totals
  return tables.map((t) => {
    const openOrder = barOrders.find((o) => o.table_id === t.id && o.payment_status === 'UNPAID')
    return {
      ...t,
      open_order_id: openOrder?.id ?? null,
      open_order_total_paise: openOrder?.total_paise ?? null,
    }
  })
}

export function getMockBarOrders(filters?: { kitchen_status?: string; payment_status?: string; table_id?: number }): BarOrder[] {
  let list = [...barOrders]
  if (filters?.kitchen_status) {
    list = list.filter((o) => o.kitchen_status === filters.kitchen_status)
  }
  if (filters?.payment_status) {
    list = list.filter((o) => o.payment_status === filters.payment_status)
  }
  if (filters?.table_id) {
    list = list.filter((o) => o.table_id === filters.table_id)
  }
  return list
}

export function createMockBarOrder(input: BarOrderCreateInput): BarOrder {
  checkSimulatedError('EMPTY_CART')

  const items = input.items.map((it) => {
    const m = menuItems.find((mi) => mi.id === it.menu_item_id)!
    return {
      menu_item_id: m.id,
      name: m.name,
      qty: it.qty,
      unit_price_paise: m.price_paise,
      line_total_paise: m.price_paise * it.qty,
      note: it.note ?? null,
    }
  })

  const subtotal = items.reduce((s, it) => s + it.line_total_paise, 0)
  const discountPct = getMemberDiscount(input.member_id ?? null, 'BAR')
  const discount = calcDiscountPaise(subtotal, discountPct)
  const total = subtotal - discount
  const tax = calcTaxPaise(total, 5)

  let memberName: string | null = null
  let memberCode: string | null = null
  if (input.member_id) {
    const m = members.find((mem) => mem.id === input.member_id)
    if (m) {
      memberName = m.full_name
      memberCode = m.member_code
    }
  }

  const table = input.table_id ? tables.find((t) => t.id === input.table_id) : null

  const newOrder: BarOrder = {
    id: 10 + barOrders.length + 1,
    table_id: input.table_id ?? null,
    table_label: table ? table.label : null,
    member_id: input.member_id ?? null,
    member_name: memberName,
    member_code: memberCode,
    guest_name: input.guest_name ?? null,
    kitchen_status: 'NEW',
    payment_status: 'UNPAID',
    is_tab: false,
    subtotal_paise: subtotal,
    discount_paise: discount,
    total_paise: total,
    tax_paise: tax,
    created_at: new Date().toISOString(),
    items,
  }

  barOrders.unshift(newOrder)
  return newOrder
}

export function addMockBarOrderItems(orderId: number, newItems: { menu_item_id: number; qty: number; note?: string }[]): BarOrder {
  const o = barOrders.find((ord) => ord.id === orderId)
  if (!o) throw { error: { code: 'NOT_FOUND', message: 'Order not found' } }
  if (o.kitchen_status === 'SERVED' || o.payment_status === 'PAID') {
    throw { error: { code: 'ORDER_LOCKED', message: 'Cannot add items to served or paid orders' } }
  }

  for (const it of newItems) {
    const m = menuItems.find((mi) => mi.id === it.menu_item_id)!
    o.items.push({
      menu_item_id: m.id,
      name: m.name,
      qty: it.qty,
      unit_price_paise: m.price_paise,
      line_total_paise: m.price_paise * it.qty,
      note: it.note ?? null,
    })
  }

  o.subtotal_paise = o.items.reduce((s, it) => s + it.line_total_paise, 0)
  const discountPct = getMemberDiscount(o.member_id, 'BAR')
  o.discount_paise = calcDiscountPaise(o.subtotal_paise, discountPct)
  o.total_paise = o.subtotal_paise - o.discount_paise
  o.tax_paise = calcTaxPaise(o.total_paise, 5)

  return o
}

const KITCHEN_TRANSITIONS: Record<KitchenStatus, KitchenStatus | null> = {
  NEW: 'PREPARING',
  PREPARING: 'READY',
  READY: 'SERVED',
  SERVED: null,
  CANCELLED: null,
}

export function setMockKitchenStatus(orderId: number, status: KitchenStatus): BarOrder {
  checkSimulatedError('INVALID_TRANSITION')
  const o = barOrders.find((ord) => ord.id === orderId)
  if (!o) throw { error: { code: 'NOT_FOUND', message: 'Order not found' } }

  const nextValid = KITCHEN_TRANSITIONS[o.kitchen_status]
  if (status !== 'CANCELLED' && status !== nextValid) {
    throw {
      error: {
        code: 'INVALID_TRANSITION',
        message: `Cannot transition from ${o.kitchen_status} to ${status}. Transitions are forward-only: NEW -> PREPARING -> READY -> SERVED`,
      },
    }
  }

  o.kitchen_status = status
  return o
}

export function payMockBarOrder(orderId: number, _method: 'CASH' | 'CARD' | 'UPI'): BarOrder {
  checkSimulatedError('ORDER_ALREADY_PAID')
  const o = barOrders.find((ord) => ord.id === orderId)
  if (!o) throw { error: { code: 'NOT_FOUND', message: 'Order not found' } }
  if (o.payment_status === 'PAID') throw { error: { code: 'ORDER_ALREADY_PAID', message: 'Order is already paid' } }

  o.payment_status = 'PAID'
  o.is_tab = false
  o.paid_at = new Date().toISOString()
  return o
}

export function putMockOrderOnTab(orderId: number): BarOrder {
  checkSimulatedError('MEMBER_REQUIRED_FOR_TAB')
  const o = barOrders.find((ord) => ord.id === orderId)
  if (!o) throw { error: { code: 'NOT_FOUND', message: 'Order not found' } }
  if (!o.member_id) {
    throw { error: { code: 'MEMBER_REQUIRED_FOR_TAB', message: 'Active member code required to put order on club tab' } }
  }
  o.is_tab = true
  return o
}

export function settleMockTabs(memberId: number, _method: 'CASH' | 'CARD' | 'UPI'): number {
  const memberTabs = barOrders.filter((o) => o.member_id === memberId && o.is_tab && o.payment_status === 'UNPAID')
  const totalSettled = memberTabs.reduce((sum, o) => sum + o.total_paise, 0)
  for (const o of memberTabs) {
    o.payment_status = 'PAID'
    o.is_tab = false
    o.paid_at = new Date().toISOString()
  }
  return totalSettled
}

export function getMockBarDailyReport(dateStr?: string): BarDailyReport {
  const targetDate = dateStr ?? getTodayIST()
  const ordersOnDate = barOrders.filter((o) => (o.created_at ?? '').startsWith(targetDate))
  const revenue = ordersOnDate.filter((o) => o.payment_status === 'PAID').reduce((sum, o) => sum + o.total_paise, 0)
  const tax = calcTaxPaise(revenue, 5)
  const outstandingTabs = barOrders.filter((o) => o.is_tab && o.payment_status === 'UNPAID').reduce((s, o) => s + o.total_paise, 0)

  return {
    date: targetDate,
    orders: ordersOnDate.length,
    revenue_paise: revenue,
    tax_paise: tax,
    by_method: {
      CASH: Math.floor((revenue * 35) / 100),
      CARD: Math.floor((revenue * 40) / 100),
      UPI: Math.floor((revenue * 25) / 100),
      ONLINE_MOCK: 0,
    },
    by_staff: [
      { user_id: 4, name: 'Sana Mirza', revenue_paise: revenue },
    ],
    outstanding_tabs_paise: outstandingTabs,
  }
}

// ── Dashboard Summary (SRS 3.2.9) ──────────────────────────────────────────
export function getMockDashboardSummary(period: 'today' | 'week' | 'month' = 'today'): DashboardSummary {
  const today = getTodayIST()
  const multiplier = period === 'month' ? 30 : period === 'week' ? 7 : 1

  return {
    period,
    from: istToUtcIso(today, '00:00'),
    to: istToUtcIso(today, '23:59'),
    revenue: {
      total_paise: 2450000 * multiplier,
      by_source: {
        BOOKING: 600000 * multiplier,
        SOCIAL: 0,
        SHOP_ORDER: 900000 * multiplier,
        BAR_ORDER: 812000 * multiplier,
        MEMBERSHIP: 138000 * multiplier,
        INVOICE: 0,
      },
      by_method: {
        CASH: 900000 * multiplier,
        CARD: 700000 * multiplier,
        UPI: 600000 * multiplier,
        ONLINE_MOCK: 250000 * multiplier,
      },
    },
    receivables: {
      unpaid_tabs_paise: 45000,
      unpaid_invoices_paise: 0,
    },
    payables: {
      unpaid_expenses_paise: 120000,
      pending_payroll_paise: 0,
    },
    bookings: {
      count: 28 * multiplier,
      utilization_pct: 46.7,
    },
    members: {
      new: 3,
      expiring_7d: 5,
    },
    leads: {
      new: 2,
    },
    low_stock: getMockLowStockProducts().map((p) => ({
      product_id: p.id,
      name: p.name,
      stock_qty: p.stock_qty,
      reorder_level: p.reorder_level,
    })),
  }
}

export function getMockRevenueSeries(): RevenueSeriesPoint[] {
  const points: RevenueSeriesPoint[] = []
  const today = getTodayIST()
  const [y, m, d] = today.split('-').map(Number)

  for (let i = 29; i >= 0; i--) {
    const dt = new Date(Date.UTC(y, m - 1, d - i))
    const dtStr = dt.toISOString().split('T')[0]
    const bPaise = 400000 + ((i * 37) % 250000)
    const sPaise = 300000 + ((i * 43) % 200000)
    const barPaise = 250000 + ((i * 51) % 180000)
    const mPaise = i % 4 === 0 ? 150000 : 0
    points.push({
      date: dtStr,
      total_paise: bPaise + sPaise + barPaise + mPaise,
      booking_paise: bPaise,
      shop_paise: sPaise,
      bar_paise: barPaise,
      membership_paise: mPaise,
    })
  }

  return points
}

// ── Payments & Ledger (SRS 3.2.9) ──────────────────────────────────────────
export function getMockPayments(filters?: {
  from?: string
  to?: string
  source_type?: string
  method?: string
}): Payment[] {
  let list = [...payments]
  if (filters?.from) {
    list = list.filter((p) => p.created_at.slice(0, 10) >= filters.from!)
  }
  if (filters?.to) {
    list = list.filter((p) => p.created_at.slice(0, 10) <= filters.to!)
  }
  if (filters?.source_type && filters.source_type !== 'ALL') {
    list = list.filter((p) => p.source_type === filters.source_type)
  }
  if (filters?.method && filters.method !== 'ALL') {
    list = list.filter((p) => p.method === filters.method)
  }
  return list.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export function refundMockPayment(paymentId: number, _reason?: string): Payment {
  checkSimulatedError('ALREADY_REFUNDED')
  const p = payments.find((pay) => pay.id === paymentId)
  if (!p) throw { error: { code: 'NOT_FOUND', message: 'Payment not found' } }
  if (p.status === 'REFUNDED') {
    throw { error: { code: 'ALREADY_REFUNDED', message: 'Payment is already refunded' } }
  }

  p.status = 'REFUNDED'
  return { ...p }
}

// ── Social Sessions Operations (SRS 3.2.6) ─────────────────────────────────
export function getMockSocialSessions(from?: string, to?: string, memberId?: number): SocialSession[] {
  let list = socialSessions.map((s) => ({
    ...s,
    is_joined: memberId ? s.participants.some((p) => p.member_id === memberId) : false,
  }))

  if (from) {
    list = list.filter((s) => s.start_at.slice(0, 10) >= from)
  }
  if (to) {
    list = list.filter((s) => s.start_at.slice(0, 10) <= to)
  }

  return list.sort((a, b) => a.start_at.localeCompare(b.start_at))
}

export function joinMockSocialSession(sessionId: number, memberId: number, memberName?: string): SocialSession {
  checkSimulatedError('SESSION_FULL')
  const session = socialSessions.find((s) => s.id === sessionId)
  if (!session) throw { error: { code: 'NOT_FOUND', message: 'Social session not found' } }

  const alreadyJoined = session.participants.some((p) => p.member_id === memberId)
  if (alreadyJoined) {
    throw { error: { code: 'ALREADY_JOINED', message: 'You have already joined this social session' } }
  }

  if (session.joined_count >= session.capacity) {
    throw { error: { code: 'SESSION_FULL', message: 'This social session is full to capacity' } }
  }

  const name = memberName ?? members.find((m) => m.id === memberId)?.full_name ?? 'Member'
  session.participants.push({
    member_id: memberId,
    member_name: name,
    joined_at: new Date().toISOString(),
  })
  session.joined_count = session.participants.length
  session.is_joined = true

  return session
}

export function leaveMockSocialSession(sessionId: number, memberId: number): SocialSession {
  const session = socialSessions.find((s) => s.id === sessionId)
  if (!session) throw { error: { code: 'NOT_FOUND', message: 'Social session not found' } }

  session.participants = session.participants.filter((p) => p.member_id !== memberId)
  session.joined_count = session.participants.length
  session.is_joined = false

  return session
}

// ── Member-Scoped Queries (SRS 3.1) ────────────────────────────────────────
export function getMockMyBookings(memberId: number): Booking[] {
  return bookings
    .filter((b) => b.member_id === memberId)
    .sort((a, b) => b.start_at.localeCompare(a.start_at))
}

export function getMockMyPayments(memberId: number): Payment[] {
  return payments
    .filter((p) => p.member_id === memberId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export function getMockMyOrders(memberId: number): ShopOrder[] {
  return shopOrders
    .filter((o) => o.member_id === memberId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

// ── Public Endpoints (SRS 3.2.4, 3.2.7, 3.2.10 & S-15) ─────────────────────
export function getMockCourts(sport?: Sport): Court[] {
  return sport ? MOCK_COURTS.filter((c) => c.sport === sport) : MOCK_COURTS
}

export function getMockPlans(): Plan[] {
  return MOCK_PLANS
}

export function getMockCourtPrices(): CourtPrice[] {
  return MOCK_COURT_PRICES
}

export function getMockPublicAvailability(
  from?: string,
  days: number = 7,
  sport?: Sport
): PublicAvailabilityResponse {
  const fromDate = from || getTodayIST()
  const numDays = Math.min(Math.max(days, 1), 7)
  const filteredCourts = MOCK_COURTS.filter(
    (c) => c.is_active && (!sport || c.sport === sport)
  )

  // Generate slots for each day
  const courtSlotsMap: Record<number, PublicCourtSlot[]> = {}
  filteredCourts.forEach((c) => {
    courtSlotsMap[c.id] = []
  })

  // Start date timestamp
  const startDate = new Date(fromDate + 'T00:00:00')

  for (let d = 0; d < numDays; d++) {
    const current = new Date(startDate)
    current.setDate(startDate.getDate() + d)
    const yyyy = current.getFullYear()
    const mm = String(current.getMonth() + 1).padStart(2, '0')
    const dd = String(current.getDate()).padStart(2, '0')
    const dateStr = `${yyyy}-${mm}-${dd}`

    // 06:00 to 21:00 slots (30-min intervals)
    for (let h = 6; h < 21; h++) {
      for (const m of [0, 30]) {
        const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
        const startIso = istToUtcIso(dateStr, timeStr)
        const currentSlotTime = new Date(startIso).getTime()
        const nowMs = Date.now()

        filteredCourts.forEach((court) => {
          // Check if slot has active booking or social session
          const hasBooking = bookings.some(
            (b) =>
              b.court_id === court.id &&
              b.status === 'CONFIRMED' &&
              new Date(b.start_at).getTime() <= currentSlotTime &&
              new Date(b.end_at).getTime() > currentSlotTime
          )

          const hasSocial = socialSessions.some(
            (s) =>
              s.court_id === court.id &&
              new Date(s.start_at).getTime() <= currentSlotTime &&
              new Date(s.end_at).getTime() > currentSlotTime
          )

          const isBusy = hasBooking || hasSocial || currentSlotTime < nowMs

          courtSlotsMap[court.id].push({
            start_at: startIso,
            state: isBusy ? 'BUSY' : 'FREE',
          })
        })
      }
    }
  }

  return {
    from: fromDate,
    days: numDays,
    slot_minutes: 30,
    courts: filteredCourts.map((c) => ({
      court_id: c.id,
      name: c.name,
      sport: c.sport,
      slots: courtSlotsMap[c.id] || [],
    })),
  }
}

export function getMockPublicProducts(category?: string): PublicProduct[] {
  let list = products.filter((p) => p.is_active)
  if (category && category !== 'ALL') {
    list = list.filter((p) => p.category === category)
  }

  // S-15: Never return stock_qty or reorder_level
  return list.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    category: p.category,
    variant: p.variant,
    description: p.description,
    price_paise: p.price_paise,
    in_stock: p.stock_qty > 0,
  }))
}

let mockEnquiriesCount = 4

export function submitMockPublicEnquiry(input: PublicEnquiryInput): PublicEnquiryResponse {
  checkSimulatedError('RATE_LIMITED')

  // Honeypot check: If the hidden 'website' field is populated, silently accept without action
  if (input.website && input.website.trim().length > 0) {
    return { id: 9999, status: 'received' }
  }

  if (!input.name || !input.name.trim()) {
    throw { error: { code: 'VALIDATION_ERROR', message: 'Name is required' } }
  }

  mockEnquiriesCount += 1
  return {
    id: mockEnquiriesCount,
    status: 'received',
  }
}

