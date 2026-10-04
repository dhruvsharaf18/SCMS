/**
 * Adapters from the real API shapes (backend/app/schemas.py) to the view types in ./types.
 * Each one exists because the screen needs a field the endpoint does not return as such.
 */
import type {
  Court,
  LedgerStatus,
  Member,
  MemberHistoryEvent,
  MemberStatus,
  Membership,
  PaymentMethod,
  Payment,
  PlanCode,
  Product,
  ProductCategory,
  PublicAvailabilityResponse,
  PublicCourtAvailability,
  PublicProduct,
  ShopOrder,
  SocialSession,
  SocialSessionStatus,
  SourceType,
  Sport,
  Tier,
} from './types'
import { skuForProductName } from '../lib/product-presentation'

/** Members never see stock counts (S-15), so one portal cart line is capped at this. */
export const MEMBER_LINE_CAP = 20

/** MemberOut (full profile) or MemberBrief (BAR_STAFF: no contact details, `plan_code` only). */
export interface MemberApi {
  id: number
  member_code: string
  full_name: string
  phone?: string
  email?: string | null
  dob?: string | null
  emergency_contact?: string | null
  notes?: string | null
  status?: MemberStatus
  membership?: Membership | null
  plan_code?: PlanCode | null
}

export function toMember(raw: MemberApi): Member {
  const planCode = raw.membership?.plan_code ?? raw.plan_code ?? null
  const status: MemberStatus = raw.status ?? (planCode ? 'ACTIVE' : 'NONE')
  const current = status === 'ACTIVE' || status === 'EXPIRING'
  const tier: Tier = current && planCode ? planCode : 'WALKIN'
  return {
    id: raw.id,
    member_code: raw.member_code,
    full_name: raw.full_name,
    phone: raw.phone ?? '',
    email: raw.email ?? null,
    dob: raw.dob ?? null,
    emergency_contact: raw.emergency_contact ?? null,
    notes: raw.notes ?? null,
    membership: raw.membership ?? null,
    status,
    tier,
  }
}

/** PublicProductOut: no SKU, no description, `in_stock` instead of a count. */
export interface PublicProductApi {
  id: number
  name: string
  category: ProductCategory
  variant: string | null
  price_paise: number
  in_stock: boolean
}

export function toPublicProduct(raw: PublicProductApi): PublicProduct {
  return { ...raw, sku: skuForProductName(raw.name), description: null }
}

/** Members buy from the public catalogue; stock is the line cap or 0, never the real count. */
export function publicToProduct(p: PublicProduct): Product {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    category: p.category,
    variant: p.variant,
    description: p.description,
    price_paise: p.price_paise,
    stock_qty: p.in_stock ? MEMBER_LINE_CAP : 0,
    reorder_level: 0,
    is_active: true,
  }
}

/** ShopOrderOut carries no timestamp; callers pass one from member history or the sale moment. */
export type ShopOrderApi = Omit<ShopOrder, 'created_at' | 'member_name'>

export function toShopOrder(raw: ShopOrderApi, createdAt: string): ShopOrder {
  return { ...raw, created_at: createdAt }
}

/** History PAYMENT rows encode "SOURCE/METHOD/STATUS" in `detail` (services/membership.py). */
export function historyToPayment(event: MemberHistoryEvent, memberId: number): Payment {
  const [source, method, status] = event.detail.split('/')
  return {
    id: event.id,
    source_type: source as SourceType,
    source_id: 0,
    member_id: memberId,
    amount_paise: event.amount_paise,
    tax_paise: 0,
    method: method as PaymentMethod,
    status: status as LedgerStatus,
    reference: null,
    received_by: null,
    created_at: event.at,
  }
}

export interface SocialSessionApi {
  id: number
  court_id: number
  title: string
  start_at: string
  end_at: string
  capacity: number
  joined_count: number
  fee_paise: number
  status: SocialSessionStatus
}

export function toSocialSession(raw: SocialSessionApi, courts: Court[], isJoined: boolean): SocialSession {
  const court = courts.find((c) => c.id === raw.court_id)
  return {
    ...raw,
    court_name: court?.name ?? `Court #${raw.court_id}`,
    sport: (court?.sport ?? 'TENNIS') as Sport,
    is_joined: isJoined,
    participants: [],
  }
}

/** PublicAvailabilityOut is grouped by day; the pages want one slot list per court. */
export interface PublicAvailabilityApi {
  slot_minutes: number
  days: { date: string; courts: PublicCourtAvailability[] }[]
}

export function toPublicAvailability(raw: PublicAvailabilityApi, from: string): PublicAvailabilityResponse {
  const byCourt = new Map<number, PublicCourtAvailability>()
  for (const day of raw.days) {
    for (const court of day.courts) {
      const entry = byCourt.get(court.court_id)
      if (entry) entry.slots.push(...court.slots)
      else byCourt.set(court.court_id, { ...court, slots: [...court.slots] })
    }
  }
  return { from, days: raw.days.length, slot_minutes: raw.slot_minutes, courts: [...byCourt.values()] }
}
