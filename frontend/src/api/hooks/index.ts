import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  Court,
  CourtAvailabilityResponse,
  Booking,
  BookingCreateInput,
  BookingCancelResponse,
  Member,
  MemberCreateInput,
  MemberHistoryEvent,
  Product,
  ProductCreateInput,
  ProductUpdateInput,
  ShopOrder,
  ShopOrderCreateInput,
  MenuItem,
  BarTable,
  BarOrder,
  BarOrderCreateInput,
  BarDailyReport,
  DiningMenu,
  DiningAvailability,
  TableReservation,
  ReservationCreateInput,
  ReservationStatus,
  Payment,
  PaginatedPayments,
  PaymentTotals,
  TaxSummary,
  Employee,
  EmployeeCreateInput,
  EmployeeUpdateInput,
  SocialSession,
  SocialSessionJoinInput,
  DashboardSummary,
  RevenueSeries,
  RevenueSeriesPoint,
  KitchenStatus,
  Sport,
  Plan,
  CourtPrice,
  PublicAvailabilityResponse,
  PublicProduct,
  PublicEnquiryInput,
  PublicEnquiryResponse,
  Lead,
  PaginatedLeads,
  LeadUpdateInput,
  LeadNote,
  Quote,
  QuoteCreateInput,
  LeadConvertedResponse,
  Notification,
  PaginatedNotifications,
  UnreadCountResponse,
  ApiError,
  SocialParticipant,
  SocialSessionCreateInput,
  CourtCreateInput,
  CourtUpdateInput,
  PaginatedAuditLogs,
} from '../types'
import { api, ApiError as HttpError } from '../client'
import { useAuth } from '../../hooks/useAuth'
import { getTodayIST } from '../../lib/format'
import {
  toMember,
  toPublicProduct,
  publicToProduct,
  toShopOrder,
  historyToPayment,
  toSocialSession,
  toPublicAvailability,
  type MemberApi,
  type PublicProductApi,
  type ShopOrderApi,
  type SocialSessionApi,
  type PublicAvailabilityApi,
} from '../mappers'

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'

/** The mock store is only fetched in mock mode, so production bundles never contain it. */
const loadMocks = () => import('../../mocks/store')

const STAFF_SHOP_ROLES = ['OWNER', 'MANAGER', 'FRONT_DESK']

interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

// ── Dev Error Simulation Toggle ────────────────────────────────────────────
let simulatedErrorCode: string | null = null

export function useErrorSimulation() {
  const [currentError, setCurrentError] = useState<string | null>(simulatedErrorCode)
  const setSimulatedError = (code: string | null) => {
    simulatedErrorCode = code
    setCurrentError(code)
    if (USE_MOCKS) void loadMocks().then((m) => m.setSimulatedError(code))
  }
  return {
    currentError,
    setSimulatedError,
    clearError: () => setSimulatedError(null),
  }
}

// ── Court & Availability Hooks ─────────────────────────────────────────────
export function useCourts(sport?: Sport) {
  return useQuery<Court[], ApiError>({
    queryKey: ['courts', sport],
    queryFn: async () => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 60))
        return (await loadMocks()).getMockCourts(sport)
      }
      return api.get<Court[]>(`/courts${sport ? `?sport=${sport}` : ''}`)
    },
  })
}

/** Courts admin list: inactive courts included (OWNER / MANAGER page). */
export function useAllCourts(options?: { enabled?: boolean }) {
  return useQuery<Court[], ApiError>({
    queryKey: ['courts', 'all'],
    queryFn: () => api.get<Court[]>('/courts?include_inactive=true'),
    enabled: options?.enabled ?? true,
  })
}

export function useCreateCourt() {
  const qc = useQueryClient()
  return useMutation<Court, ApiError, CourtCreateInput>({
    mutationFn: (input) => api.post<Court>('/courts', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['courts'] }),
  })
}

export function useUpdateCourt() {
  const qc = useQueryClient()
  return useMutation<Court, ApiError, { id: number; changes: CourtUpdateInput }>({
    mutationFn: ({ id, changes }) => api.patch<Court>(`/courts/${id}`, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['courts'] }),
  })
}

export function useCourtAvailability(date: string, sport?: Sport, memberId?: number) {
  return useQuery<CourtAvailabilityResponse, ApiError>({
    queryKey: ['courts', 'availability', date, sport, memberId],
    queryFn: async () => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 60))
        return (await loadMocks()).getMockCourtAvailability(date, sport, memberId)
      }
      const params = new URLSearchParams()
      if (date) params.append('date', date)
      if (sport) params.append('sport', sport)
      if (memberId) params.append('member_id', String(memberId))
      return api.get<CourtAvailabilityResponse>(`/courts/availability?${params.toString()}`)
    },
  })
}

// ── Booking Hooks ──────────────────────────────────────────────────────────
export function useBookings(filters?: { date?: string; court_id?: number; member_id?: number; status?: string; page_size?: number }) {
  return useQuery<Booking[], ApiError>({
    queryKey: ['bookings', filters],
    queryFn: async () => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 60))
        return (await loadMocks()).getMockBookings(filters)
      }
      const params = new URLSearchParams()
      params.append('page_size', String(filters?.page_size ?? 100))
      if (filters?.date) params.append('date', filters.date)
      if (filters?.court_id) params.append('court_id', String(filters.court_id))
      if (filters?.member_id) params.append('member_id', String(filters.member_id))
      if (filters?.status) params.append('status', filters.status)
      const res = await api.get<{ items: Booking[]; total: number } | Booking[]>(
        `/bookings?${params.toString()}`
      )
      return Array.isArray(res) ? res : res.items
    },
  })
}

export function useCreateBooking() {
  const qc = useQueryClient()
  return useMutation<Booking, ApiError, BookingCreateInput>({
    mutationFn: async (input) => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 100))
        return (await loadMocks()).createMockBooking(input)
      }
      return api.post<Booking>('/bookings', input)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['courts', 'availability'] })
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useCancelBooking() {
  const qc = useQueryClient()
  return useMutation<BookingCancelResponse, ApiError, { id: number; reason?: string; refund?: boolean }>({
    mutationFn: async ({ id, reason, refund }) => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 80))
        return (await loadMocks()).cancelMockBooking(id, reason)
      }
      return api.post<BookingCancelResponse>(`/bookings/${id}/cancel`, { reason, refund })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['courts', 'availability'] })
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useUpdateBookingStatus() {
  const qc = useQueryClient()
  return useMutation<Booking, ApiError, { id: number; status: 'COMPLETED' | 'NO_SHOW' }>({
    mutationFn: async ({ id, status }) => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 80))
        return (await loadMocks()).updateMockBookingStatus(id, status)
      }
      return api.post<Booking>(`/bookings/${id}/status`, { status })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export const useSetBookingStatus = useUpdateBookingStatus

export function usePayBooking() {
  const qc = useQueryClient()
  return useMutation<Booking, ApiError, { id: number; method: 'CASH' | 'CARD' | 'UPI' }>({
    mutationFn: async ({ id, method }) => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 80))
        return (await loadMocks()).payMockBooking(id, method)
      }
      return api.post<Booking>(`/bookings/${id}/pay`, { payment_method: method })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

// ── Members Hooks ──────────────────────────────────────────────────────────
export function useMembers(params?: { q?: string; status?: string; tier?: string }) {
  return useQuery<Member[], ApiError>({
    queryKey: ['members', params],
    queryFn: async () => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 60))
        return (await loadMocks()).getMockMembers(params)
      }
      const search = new URLSearchParams({ page_size: '100' })
      if (params?.q?.trim()) search.set('q', params.q.trim())
      if (params?.status) search.set('status', params.status)
      const res = await api.get<Page<MemberApi>>(`/members?${search.toString()}`)
      const members = res.items.map(toMember)
      // The API has no tier filter; tier is derived from the current plan.
      return params?.tier ? members.filter((m) => m.tier === params.tier) : members
    },
  })
}

export function useMember(id: number) {
  return useQuery<Member | null, ApiError>({
    queryKey: ['member', id],
    queryFn: async () => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 60))
        return (await loadMocks()).getMockMember(id)
      }
      return toMember(await api.get<MemberApi>(`/members/${id}`))
    },
    enabled: id > 0,
  })
}

export function useMemberHistory(id: number, pageSize = 20) {
  return useQuery<MemberHistoryEvent[], ApiError>({
    queryKey: ['member', id, 'history', pageSize],
    queryFn: async () => {
      const res = await api.get<{ items: MemberHistoryEvent[] }>(
        `/members/${id}/history?page_size=${pageSize}`,
      )
      return res.items
    },
    enabled: id > 0 && !USE_MOCKS,
  })
}

export function useMemberByCode(code: string) {
  return useQuery<Member | null, ApiError>({
    queryKey: ['member', 'code', code],
    queryFn: async () => {
      if (!code.trim()) return null
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 60))
        return (await loadMocks()).getMockMemberByCode(code)
      }
      try {
        return toMember(await api.get<MemberApi>(`/members/by-code/${encodeURIComponent(code.trim())}`))
      } catch (err) {
        if (err instanceof HttpError && err.status === 404) return null
        throw err
      }
    },
    enabled: code.trim().length >= 3,
  })
}

export function useCreateMember() {
  const qc = useQueryClient()
  return useMutation<Member, ApiError, MemberCreateInput>({
    mutationFn: async (input) => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 100))
        return (await loadMocks()).createMockMember(input)
      }
      const created = await api.post<MemberApi & { payment_id: number | null }>('/members', input)
      return toMember({ ...created, phone: input.phone, email: input.email ?? null, dob: input.dob ?? null })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

// ── Products & Shop Hooks ──────────────────────────────────────────────────
/**
 * Staff read the full catalogue (`/products`, with stock); members may only read the
 * public one, so their products carry a line cap instead of a stock count (S-15).
 */
export function useProducts(category?: string) {
  const { user } = useAuth()
  const staffCatalogue = !!user && STAFF_SHOP_ROLES.includes(user.role)
  return useQuery<Product[], ApiError>({
    queryKey: ['products', staffCatalogue ? 'staff' : 'member', category],
    queryFn: async () => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 60))
        return (await loadMocks()).getMockProducts(category)
      }
      const query = category && category !== 'ALL' ? `?category=${category}` : ''
      if (staffCatalogue) return api.get<Product[]>(`/products${query}`)
      const items = await api.get<PublicProductApi[]>(`/public/products${query}`)
      return items.map((p) => publicToProduct(toPublicProduct(p)))
    },
    enabled: !!user,
  })
}

export function useLowStockProducts() {
  return useQuery<Product[], ApiError>({
    queryKey: ['products', 'low-stock'],
    queryFn: async () => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 60))
        return (await loadMocks()).getMockLowStockProducts()
      }
      return api.get<Product[]>('/products/low-stock')
    },
  })
}

export function useCreateShopOrder() {
  const qc = useQueryClient()
  return useMutation<ShopOrder, ApiError, ShopOrderCreateInput>({
    mutationFn: async (input) => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 100))
        return (await loadMocks()).createMockShopOrder(input)
      }
      const order = await api.post<ShopOrderApi>('/shop/orders', input)
      return toShopOrder(order, new Date().toISOString())
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['shop', 'orders'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['payments'] })
    },
  })
}

export function useCancelShopOrder() {
  const qc = useQueryClient()
  return useMutation<{ id: number; status: string }, ApiError, { orderId: number; reason?: string }>({
    mutationFn: async ({ orderId, reason }) => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 100))
        return (await loadMocks()).cancelMockShopOrder(orderId, reason)
      }
      return api.post<{ id: number; status: string; refunded: boolean; refund_paise: number }>(
        `/shop/orders/${orderId}/cancel`,
        reason ? { reason } : {},
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['shop', 'orders'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['payments'] })
    },
  })
}

export function useRestockProduct() {
  const qc = useQueryClient()
  return useMutation<Product, ApiError, { id: number; qty: number; note?: string }>({
    mutationFn: async ({ id, qty, note }) => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 80))
        return (await loadMocks()).restockMockProduct(id, qty)
      }
      return api.post<Product>(`/products/${id}/restock`, note?.trim() ? { qty, note: note.trim() } : { qty })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useCreateProduct() {
  const qc = useQueryClient()
  return useMutation<Product, ApiError, ProductCreateInput>({
    mutationFn: async (input) => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 100))
        return (await loadMocks()).createMockProduct(input)
      }
      // ProductCreate has no is_active (new products start active) and forbids extra fields.
      const { is_active: _ignored, ...body } = input
      return api.post<Product>('/products', body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useUpdateProduct() {
  const qc = useQueryClient()
  return useMutation<Product, ApiError, { id: number; data: ProductUpdateInput }>({
    mutationFn: async ({ id, data }) => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 80))
        return (await loadMocks()).updateMockProduct(id, data)
      }
      // SKU is immutable and stock only moves through restock/sales; ProductUpdate forbids both.
      const { sku: _sku, stock_qty: _stock, ...body } = data
      return api.patch<Product>(`/products/${id}`, body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

// ── Bar & Kitchen Hooks ────────────────────────────────────────────────────
export function useMenuItems(category?: string) {
  return useQuery<MenuItem[], ApiError>({
    queryKey: ['menu', category],
    queryFn: async () => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 60))
        return (await loadMocks()).getMockMenuItems(category)
      }
      return api.get<MenuItem[]>(`/menu-items${category && category !== 'ALL' ? `?category=${category}` : ''}`)
    },
  })
}

// ── Bar & Dining (member menu + table reservations) ───────────────────────
export function useDiningMenu() {
  return useQuery<DiningMenu, ApiError>({
    queryKey: ['dining', 'menu'],
    queryFn: () => api.get<DiningMenu>('/dining/menu'),
  })
}

export function useDiningAvailability(date: string, partySize: number) {
  return useQuery<DiningAvailability, ApiError>({
    queryKey: ['dining', 'availability', date, partySize],
    queryFn: () =>
      api.get<DiningAvailability>(`/dining/availability?date=${date}&party_size=${partySize}`),
    enabled: Boolean(date) && partySize > 0,
  })
}

export function useReservations(filters?: { date?: string; status?: ReservationStatus; upcoming?: boolean }) {
  return useQuery<TableReservation[], ApiError>({
    queryKey: ['dining', 'reservations', filters],
    queryFn: async () => {
      const params = new URLSearchParams({ page_size: '100' })
      if (filters?.date) params.set('date', filters.date)
      if (filters?.status) params.set('status', filters.status)
      if (filters?.upcoming) params.set('upcoming', 'true')
      const res = await api.get<{ items: TableReservation[] }>(`/dining/reservations?${params.toString()}`)
      return res.items
    },
  })
}

export function useCreateReservation() {
  const qc = useQueryClient()
  return useMutation<TableReservation, ApiError, ReservationCreateInput>({
    mutationFn: (input) => api.post<TableReservation>('/dining/reservations', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dining'] }),
  })
}

export function useCancelReservation() {
  const qc = useQueryClient()
  return useMutation<TableReservation, ApiError, number>({
    mutationFn: (id) => api.post<TableReservation>(`/dining/reservations/${id}/cancel`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dining'] }),
  })
}

export function useSetReservationStatus() {
  const qc = useQueryClient()
  return useMutation<TableReservation, ApiError, { id: number; status: 'SEATED' | 'NO_SHOW' }>({
    mutationFn: ({ id, status }) =>
      api.post<TableReservation>(`/dining/reservations/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dining'] }),
  })
}

export function useBarTables() {
  return useQuery<BarTable[], ApiError>({
    queryKey: ['bar', 'tables'],
    queryFn: async () => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 60))
        return (await loadMocks()).getMockBarTables()
      }
      return api.get<BarTable[]>('/bar/tables')
    },
  })
}

export function useBarOrders(
  filters?: { kitchen_status?: string; payment_status?: string; table_id?: number; member_id?: number; page?: number; page_size?: number },
  options?: { refetchInterval?: number | false }
) {
  return useQuery<BarOrder[], ApiError>({
    queryKey: ['bar', 'orders', filters],
    refetchInterval: options?.refetchInterval ?? (USE_MOCKS ? false : 5000),
    queryFn: async () => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 60))
        return (await loadMocks()).getMockBarOrders(filters)
      }
      const params = new URLSearchParams()
      if (filters?.kitchen_status) params.set('kitchen_status', filters.kitchen_status)
      if (filters?.payment_status) params.set('payment_status', filters.payment_status)
      if (filters?.table_id) params.set('table_id', String(filters.table_id))
      if (filters?.member_id) params.set('member_id', String(filters.member_id))
      params.set('page', String(filters?.page ?? 1))
      params.set('page_size', String(filters?.page_size ?? 100))

      const page = await api.get<{ items: BarOrder[]; total: number; page: number; page_size: number }>(`/bar/orders?${params.toString()}`)
      return page.items || []
    },
  })
}

export function useCreateBarOrder() {
  const qc = useQueryClient()
  return useMutation<BarOrder, ApiError, BarOrderCreateInput>({
    mutationFn: async (input) => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 100))
        return (await loadMocks()).createMockBarOrder(input)
      }
      return api.post<BarOrder>('/bar/orders', input)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bar', 'orders'] })
      qc.invalidateQueries({ queryKey: ['bar', 'tables'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useAddBarOrderItems() {
  const qc = useQueryClient()
  return useMutation<BarOrder, ApiError, { orderId: number; items: { menu_item_id: number; qty: number; note?: string }[] }>({
    mutationFn: async ({ orderId, items }) => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 80))
        return (await loadMocks()).addMockBarOrderItems(orderId, items)
      }
      return api.post<BarOrder>(`/bar/orders/${orderId}/items`, { items })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bar', 'orders'] })
      qc.invalidateQueries({ queryKey: ['bar', 'tables'] })
    },
  })
}

export function useSetKitchenStatus() {
  const qc = useQueryClient()
  return useMutation<BarOrder, ApiError, { orderId: number; status: KitchenStatus }>({
    mutationFn: async ({ orderId, status }) => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 80))
        return (await loadMocks()).setMockKitchenStatus(orderId, status)
      }
      return api.post<BarOrder>(`/bar/orders/${orderId}/kitchen-status`, { status })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bar', 'orders'] })
    },
  })
}

export function usePayBarOrder() {
  const qc = useQueryClient()
  return useMutation<BarOrder, ApiError, { orderId: number; method: 'CASH' | 'CARD' | 'UPI' }>({
    mutationFn: async ({ orderId, method }) => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 80))
        return (await loadMocks()).payMockBarOrder(orderId, method)
      }
      return api.post<BarOrder>(`/bar/orders/${orderId}/pay`, { method })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bar', 'orders'] })
      qc.invalidateQueries({ queryKey: ['bar', 'tables'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['bar', 'reports'] })
    },
  })
}

export function usePutOnTab() {
  const qc = useQueryClient()
  return useMutation<BarOrder, ApiError, { orderId: number }>({
    mutationFn: async ({ orderId }) => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 80))
        return (await loadMocks()).putMockOrderOnTab(orderId)
      }
      return api.post<BarOrder>(`/bar/orders/${orderId}/tab`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bar', 'orders'] })
      qc.invalidateQueries({ queryKey: ['bar', 'tables'] })
    },
  })
}

export function useSettleTabs() {
  const qc = useQueryClient()
  return useMutation<number, ApiError, { memberId: number; orderIds?: number[]; method: 'CASH' | 'CARD' | 'UPI' }>({
    mutationFn: async ({ memberId, orderIds, method }) => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 100))
        return (await loadMocks()).settleMockTabs(memberId, method)
      }
      let targetOrderIds = orderIds
      if (!targetOrderIds || targetOrderIds.length === 0) {
        const page = await api.get<{ items: BarOrder[]; total: number; page: number; page_size: number }>(
          `/bar/orders?member_id=${memberId}&payment_status=UNPAID&page_size=100`
        )
        targetOrderIds = (page.items || []).filter((o) => o.is_tab).map((o) => o.id)
      }
      const settledOrders = await api.post<BarOrder[]>('/bar/tabs/settle', {
        member_id: memberId,
        order_ids: targetOrderIds,
        method,
      })
      return (settledOrders || []).reduce((sum, o) => sum + o.total_paise, 0)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bar', 'orders'] })
      qc.invalidateQueries({ queryKey: ['bar', 'tables'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['bar', 'reports'] })
    },
  })
}

export function useBarDailyReport(date?: string) {
  return useQuery<BarDailyReport, ApiError>({
    queryKey: ['bar', 'reports', 'daily', date],
    queryFn: async () => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 60))
        return (await loadMocks()).getMockBarDailyReport(date)
      }
      return api.get<BarDailyReport>(`/bar/reports/daily${date ? `?date=${date}` : ''}`)
    },
  })
}

// ── Dashboard & Finance Hooks ──────────────────────────────────────────────
export function useDashboardSummary(period: 'today' | 'week' | 'month' = 'today') {
  return useQuery<DashboardSummary, ApiError>({
    queryKey: ['dashboard', 'summary', period],
    queryFn: async () => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 60))
        return (await loadMocks()).getMockDashboardSummary(period)
      }
      return api.get<DashboardSummary>(`/dashboard/summary?period=${period}`)
    },
  })
}

export function useRevenueSeries(period: 'today' | 'week' | 'month' = 'week') {
  return useQuery<RevenueSeriesPoint[], ApiError>({
    queryKey: ['dashboard', 'revenue-series', period],
    queryFn: async () => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 60))
        return (await loadMocks()).getMockRevenueSeries()
      }
      const res = await api.get<RevenueSeries>(`/dashboard/revenue-series?period=${period}`)
      return (res.days || []).map((d) => ({
        date: d.date,
        total_paise: d.total_paise,
        booking_paise: d.by_source?.BOOKING ?? 0,
        shop_paise: d.by_source?.SHOP_ORDER ?? 0,
        bar_paise: d.by_source?.BAR_ORDER ?? 0,
        membership_paise: d.by_source?.MEMBERSHIP ?? 0,
      }))
    },
  })
}

// ── Payments & Reports Hooks ───────────────────────────────────────────────
export function usePayments(filters?: {
  from?: string
  to?: string
  source_type?: string
  method?: string
  page?: number
  page_size?: number
}) {
  return useQuery<PaginatedPayments, ApiError>({
    queryKey: ['payments', filters],
    queryFn: async () => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 60))
        const items = (await loadMocks()).getMockPayments(filters)
        return {
          items,
          total: items.length,
          page: filters?.page ?? 1,
          page_size: filters?.page_size ?? 100,
        }
      }
      const params = new URLSearchParams()
      if (filters?.from) params.set('from', filters.from)
      if (filters?.to) params.set('to', filters.to)
      if (filters?.source_type && filters.source_type !== 'ALL') params.set('source_type', filters.source_type)
      if (filters?.method && filters.method !== 'ALL') params.set('method', filters.method)
      params.set('page', String(filters?.page ?? 1))
      params.set('page_size', String(filters?.page_size ?? 100))

      return api.get<PaginatedPayments>(`/payments?${params.toString()}`)
    },
  })
}

// ── Staff / HR ─────────────────────────────────────────────────────────────
export function useEmployees(includeInactive: boolean) {
  return useQuery<Employee[], ApiError>({
    queryKey: ['employees', includeInactive],
    queryFn: () => api.get<Employee[]>(`/employees${includeInactive ? '?include_inactive=true' : ''}`),
  })
}

export function useCreateEmployee() {
  const qc = useQueryClient()
  return useMutation<Employee, ApiError, EmployeeCreateInput>({
    mutationFn: (input) => api.post<Employee>('/employees', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  })
}

export function useUpdateEmployee() {
  const qc = useQueryClient()
  return useMutation<Employee, ApiError, { id: number; changes: EmployeeUpdateInput }>({
    mutationFn: ({ id, changes }) => api.patch<Employee>(`/employees/${id}`, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  })
}

export function usePaymentTotals(filters: { from?: string; to?: string; source_type?: string; method?: string }) {
  return useQuery<PaymentTotals, ApiError>({
    queryKey: ['payments', 'summary', filters],
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.from) params.set('from', filters.from)
      if (filters.to) params.set('to', filters.to)
      if (filters.source_type && filters.source_type !== 'ALL') params.set('source_type', filters.source_type)
      if (filters.method && filters.method !== 'ALL') params.set('method', filters.method)
      return api.get<PaymentTotals>(`/payments/summary?${params.toString()}`)
    },
    enabled: !USE_MOCKS,
  })
}

export function useTaxSummary(month: string) {
  return useQuery<TaxSummary, ApiError>({
    queryKey: ['reports', 'tax-summary', month],
    queryFn: () => api.get<TaxSummary>(`/reports/tax-summary?month=${month}`),
    enabled: Boolean(month) && !USE_MOCKS,
  })
}

export function useRefundPayment() {
  const qc = useQueryClient()
  return useMutation<Payment, ApiError, { paymentId: number; reason?: string }>({
    mutationFn: async ({ paymentId, reason }) => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 100))
        return (await loadMocks()).refundMockPayment(paymentId, reason)
      }
      return api.post<Payment>(`/payments/${paymentId}/refund`, reason ? { reason } : {})
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

// ── Social Sessions Hooks (SRS 3.2.6) ──────────────────────────────────────
/**
 * The API never tells a member which sessions they joined (the roster is staff-only, S-15),
 * so joins made in this tab are remembered here; ALREADY_JOINED also marks a session.
 */
const joinedSessionIds = new Set<number>()

export function useSocialSessions(params?: { from?: string; to?: string; memberId?: number }) {
  return useQuery<SocialSession[], ApiError>({
    queryKey: ['social-sessions', params],
    queryFn: async () => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 60))
        return (await loadMocks()).getMockSocialSessions(params?.from, params?.to, params?.memberId)
      }
      const search = new URLSearchParams()
      if (params?.from) search.set('from', params.from)
      if (params?.to) search.set('to', params.to)
      const [sessions, courts] = await Promise.all([
        api.get<SocialSessionApi[]>(`/social-sessions${search.toString() ? `?${search.toString()}` : ''}`),
        api.get<Court[]>('/courts?include_inactive=true'),
      ])
      return sessions
        .filter((s) => s.status !== 'CANCELLED')
        .map((s) => toSocialSession(s, courts, joinedSessionIds.has(s.id)))
    },
  })
}

/** Staff view: every session in the range, cancelled ones included. */
export function useStaffSocialSessions(params: { from?: string; to?: string }, options?: { enabled?: boolean }) {
  return useQuery<SocialSession[], ApiError>({
    queryKey: ['social-sessions', 'staff', params],
    queryFn: async () => {
      const search = new URLSearchParams()
      if (params.from) search.set('from', params.from)
      if (params.to) search.set('to', params.to)
      const [sessions, courts] = await Promise.all([
        api.get<SocialSessionApi[]>(`/social-sessions${search.toString() ? `?${search.toString()}` : ''}`),
        api.get<Court[]>('/courts?include_inactive=true'),
      ])
      return sessions.map((s) => toSocialSession(s, courts, false))
    },
    enabled: options?.enabled ?? true,
  })
}

export function useSocialParticipants(sessionId: number | null) {
  return useQuery<SocialParticipant[], ApiError>({
    queryKey: ['social-sessions', 'participants', sessionId],
    queryFn: () => api.get<SocialParticipant[]>(`/social-sessions/${sessionId}/participants`),
    enabled: !!sessionId,
  })
}

export function useCreateSocialSession() {
  const qc = useQueryClient()
  return useMutation<SocialSessionApi, ApiError, SocialSessionCreateInput>({
    mutationFn: (input) => api.post<SocialSessionApi>('/social-sessions', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-sessions'] })
      qc.invalidateQueries({ queryKey: ['courts', 'availability'] })
    },
  })
}

export function useCancelSocialSession() {
  const qc = useQueryClient()
  return useMutation<SocialSessionApi, ApiError, number>({
    mutationFn: (id) => api.delete<SocialSessionApi>(`/social-sessions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-sessions'] })
      qc.invalidateQueries({ queryKey: ['courts', 'availability'] })
    },
  })
}

export function useJoinSocialSession() {
  const qc = useQueryClient()
  return useMutation<unknown, ApiError, SocialSessionJoinInput>({
    mutationFn: async ({ sessionId, memberId, memberName }) => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 100))
        return (await loadMocks()).joinMockSocialSession(sessionId, memberId, memberName)
      }
      try {
        // The server binds a MEMBER caller to their own member id, so the body stays empty.
        return await api.post<SocialParticipant>(`/social-sessions/${sessionId}/join`, {})
      } catch (err) {
        if (err instanceof HttpError && err.code === 'ALREADY_JOINED') joinedSessionIds.add(sessionId)
        throw err
      }
    },
    onSuccess: (_data, { sessionId }) => {
      joinedSessionIds.add(sessionId)
      qc.invalidateQueries({ queryKey: ['social-sessions'] })
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: ['social-sessions'] })
    },
  })
}

export function useLeaveSocialSession() {
  const qc = useQueryClient()
  return useMutation<unknown, ApiError, { sessionId: number; memberId: number }>({
    mutationFn: async ({ sessionId, memberId }) => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 80))
        return (await loadMocks()).leaveMockSocialSession(sessionId, memberId)
      }
      try {
        return await api.post<void>(`/social-sessions/${sessionId}/leave`, {})
      } catch (err) {
        if (err instanceof HttpError && err.status === 404) joinedSessionIds.delete(sessionId)
        throw err
      }
    },
    onSuccess: (_data, { sessionId }) => {
      joinedSessionIds.delete(sessionId)
      qc.invalidateQueries({ queryKey: ['social-sessions'] })
    },
  })
}

// ── Member-Scoped Hooks (SRS 3.1) ──────────────────────────────────────────
export function useMyBookings(memberId?: number, filters?: { date?: string; status?: string; page_size?: number }) {
  return useQuery<Booking[], ApiError>({
    queryKey: ['bookings', 'my', memberId, filters],
    queryFn: async () => {
      if (USE_MOCKS) {
        if (!memberId) return []
        await new Promise((r) => setTimeout(r, 60))
        return (await loadMocks()).getMockMyBookings(memberId)
      }
      const params = new URLSearchParams()
      params.append('page_size', String(filters?.page_size ?? 100))
      if (memberId) params.append('member_id', String(memberId))
      if (filters?.date) params.append('date', filters.date)
      if (filters?.status) params.append('status', filters.status)
      const res = await api.get<{ items: Booking[]; total: number } | Booking[]>(
        `/bookings${params.toString() ? `?${params.toString()}` : ''}`
      )
      return Array.isArray(res) ? res : res.items
    },
    enabled: !!memberId,
  })
}

export function useMyPayments(memberId?: number) {
  return useQuery<Payment[], ApiError>({
    queryKey: ['payments', 'my', memberId],
    queryFn: async () => {
      if (!memberId) return []
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 60))
        return (await loadMocks()).getMockMyPayments(memberId)
      }
      // /payments is OWNER-only; a member's own ledger rows come from their history feed.
      const res = await api.get<Page<MemberHistoryEvent>>(`/members/${memberId}/history?page_size=100`)
      return res.items.filter((e) => e.kind === 'PAYMENT').map((e) => historyToPayment(e, memberId))
    },
    enabled: !!memberId,
  })
}

export function useMyOrders(memberId?: number) {
  return useQuery<ShopOrder[], ApiError>({
    queryKey: ['shop', 'orders', 'my', memberId],
    queryFn: async () => {
      if (!memberId) return []
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 60))
        return (await loadMocks()).getMockMyOrders(memberId)
      }
      // ShopOrderOut has no timestamp; the member history feed carries it per order.
      const orders = await api.get<Page<ShopOrderApi>>('/shop/orders?page_size=100')
      const placedAt = new Map<number, string>()
      for (let page = 1; page <= 10; page++) {
        const history = await api.get<Page<MemberHistoryEvent>>(
          `/members/${memberId}/history?page=${page}&page_size=100`,
        )
        for (const e of history.items) if (e.kind === 'SHOP_ORDER') placedAt.set(e.id, e.at)
        const done = orders.items.every((o) => placedAt.has(o.id))
        if (done || page * history.page_size >= history.total) break
      }
      return orders.items.map((o) => toShopOrder(o, placedAt.get(o.id) ?? ''))
    },
    enabled: !!memberId,
  })
}

// ── Public Hooks (SRS 3.2.4, 3.2.7, 3.2.10 & S-15) ─────────────────────────
export function usePlans() {
  return useQuery<Plan[], ApiError>({
    queryKey: ['plans', 'public'],
    queryFn: async () => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 60))
        return (await loadMocks()).getMockPlans()
      }
      return api.get<Plan[]>('/plans')
    },
  })
}

export function useCourtPrices() {
  return useQuery<CourtPrice[], ApiError>({
    queryKey: ['court-prices', 'public'],
    queryFn: async () => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 60))
        return (await loadMocks()).getMockCourtPrices()
      }
      // CourtPriceOut has no id; the (sport, tier) pair is unique, so the index is a stable key.
      const prices = await api.get<Omit<CourtPrice, 'id'>[]>('/court-prices')
      return prices.map((p, i) => ({ ...p, id: i + 1 }))
    },
  })
}

export function usePublicAvailability(params?: { from?: string; days?: number; sport?: Sport }) {
  return useQuery<PublicAvailabilityResponse, ApiError>({
    queryKey: ['availability', 'public', params],
    queryFn: async () => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 60))
        return (await loadMocks()).getMockPublicAvailability(params?.from, params?.days ?? 7, params?.sport)
      }
      const from = params?.from ?? getTodayIST()
      const search = new URLSearchParams({ from, days: String(params?.days ?? 7) })
      if (params?.sport) search.set('sport', params.sport)
      const res = await api.get<PublicAvailabilityApi>(`/public/availability?${search.toString()}`)
      return toPublicAvailability(res, from)
    },
  })
}

export function usePublicProducts(category?: string) {
  return useQuery<PublicProduct[], ApiError>({
    queryKey: ['products', 'public', category],
    queryFn: async () => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 60))
        return (await loadMocks()).getMockPublicProducts(category)
      }
      const query = category && category !== 'ALL' ? `?category=${category}` : ''
      const items = await api.get<PublicProductApi[]>(`/public/products${query}`)
      return items.map(toPublicProduct)
    },
  })
}

/**
 * Fetch a single public product by id. There is no public single-product endpoint,
 * so it is picked from `/public/products`; null when the id is not in the catalogue.
 * S-15: Response never includes stock_qty, only in_stock boolean.
 */
export function usePublicProduct(id: number | null) {
  return useQuery<PublicProduct | null, ApiError>({
    queryKey: ['products', 'public', 'detail', id],
    queryFn: async () => {
      if (!id) return null
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 60))
        return (await loadMocks()).getMockPublicProduct(id)
      }
      const items = await api.get<PublicProductApi[]>('/public/products')
      const found = items.find((p) => p.id === id)
      return found ? toPublicProduct(found) : null
    },
    enabled: id !== null && id > 0,
  })
}

export function useSubmitEnquiry() {
  return useMutation<PublicEnquiryResponse, ApiError, PublicEnquiryInput>({
    mutationFn: async (input) => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 120))
        return (await loadMocks()).submitMockPublicEnquiry(input)
      }
      return api.post<PublicEnquiryResponse>('/public/enquiries', input)
    },
  })
}

// ── Audit log (OWNER, read-only) ───────────────────────────────────────────
export function useAuditLogs(
  filters: { action?: string; entity?: string; actor_id?: number; page: number; page_size: number },
  options?: { enabled?: boolean },
) {
  return useQuery<PaginatedAuditLogs, ApiError>({
    queryKey: ['audit-logs', filters],
    queryFn: () => {
      const search = new URLSearchParams({ page: String(filters.page), page_size: String(filters.page_size) })
      if (filters.action) search.set('action', filters.action)
      if (filters.entity) search.set('entity', filters.entity)
      if (filters.actor_id) search.set('actor_id', String(filters.actor_id))
      return api.get<PaginatedAuditLogs>(`/audit-logs?${search.toString()}`)
    },
    placeholderData: (prev) => prev,
    enabled: options?.enabled ?? true,
  })
}

// ── Leads Hooks (SRS 3.2.10) ────────────────────────────────────────────────
export function useLeads(params?: { status?: string; assigned_to?: number; page?: number; page_size?: number }) {
  return useQuery<PaginatedLeads, ApiError>({
    queryKey: ['leads', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      if (params?.status && params.status !== 'ALL') searchParams.set('status', params.status)
      if (params?.assigned_to) searchParams.set('assigned_to', String(params.assigned_to))
      searchParams.set('page', String(params?.page ?? 1))
      searchParams.set('page_size', String(params?.page_size ?? 100))

      return api.get<PaginatedLeads>(`/leads?${searchParams.toString()}`)
    },
  })
}

export function useLead(leadId: number) {
  return useQuery<Lead, ApiError>({
    queryKey: ['lead', leadId],
    queryFn: async () => {
      return api.get<Lead>(`/leads/${leadId}`)
    },
    enabled: !!leadId,
  })
}

export function useUpdateLead() {
  const qc = useQueryClient()
  return useMutation<Lead, ApiError, { leadId: number; data: LeadUpdateInput }>({
    mutationFn: async ({ leadId, data }) => {
      return api.patch<Lead>(`/leads/${leadId}`, data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['lead'] })
    },
  })
}

export function useLeadNotes(leadId: number) {
  return useQuery<LeadNote[], ApiError>({
    queryKey: ['leads', leadId, 'notes'],
    queryFn: async () => {
      return api.get<LeadNote[]>(`/leads/${leadId}/notes`)
    },
    enabled: !!leadId,
  })
}

export function useAddLeadNote() {
  const qc = useQueryClient()
  return useMutation<LeadNote, ApiError, { leadId: number; body: string }>({
    mutationFn: async ({ leadId, body }) => {
      return api.post<LeadNote>(`/leads/${leadId}/notes`, { body })
    },
    onSuccess: (_, { leadId }) => {
      qc.invalidateQueries({ queryKey: ['leads', leadId, 'notes'] })
    },
  })
}

export function useLeadQuotes(leadId: number) {
  return useQuery<Quote[], ApiError>({
    queryKey: ['leads', leadId, 'quotes'],
    queryFn: async () => {
      return api.get<Quote[]>(`/leads/${leadId}/quotes`)
    },
    enabled: !!leadId,
  })
}

export function useAddLeadQuote() {
  const qc = useQueryClient()
  return useMutation<Quote, ApiError, { leadId: number; quote: QuoteCreateInput }>({
    mutationFn: async ({ leadId, quote }) => {
      return api.post<Quote>(`/leads/${leadId}/quotes`, quote)
    },
    onSuccess: (_, { leadId }) => {
      qc.invalidateQueries({ queryKey: ['leads', leadId, 'quotes'] })
      qc.invalidateQueries({ queryKey: ['leads'] })
    },
  })
}

export function useConvertLead() {
  const qc = useQueryClient()
  return useMutation<LeadConvertedResponse, ApiError, { leadId: number }>({
    mutationFn: async ({ leadId }) => {
      return api.post<LeadConvertedResponse>(`/leads/${leadId}/convert`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] })
    },
  })
}

// ── Notifications Hooks (SRS 3.2.11) ────────────────────────────────────────
export function useNotifications(
  params?: { unread_only?: boolean; page?: number; page_size?: number },
  options?: {
    enabled?: boolean
    refetchInterval?: number | false
    refetchIntervalInBackground?: boolean
    staleTime?: number
  }
) {
  return useQuery<PaginatedNotifications, ApiError>({
    queryKey: ['notifications', params],
    enabled: options?.enabled ?? true,
    refetchInterval: options?.refetchInterval ?? false,
    refetchIntervalInBackground: options?.refetchIntervalInBackground ?? false,
    staleTime: options?.staleTime ?? 0,
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      if (params?.unread_only) searchParams.set('unread_only', 'true')
      searchParams.set('page', String(params?.page ?? 1))
      searchParams.set('page_size', String(params?.page_size ?? 50))

      return api.get<PaginatedNotifications>(`/notifications?${searchParams.toString()}`)
    },
  })
}

export function useUnreadNotificationsCount(options?: {
  enabled?: boolean
  refetchInterval?: number | false
  refetchIntervalInBackground?: boolean
}) {
  return useQuery<UnreadCountResponse, ApiError>({
    queryKey: ['notifications', 'unread-count'],
    enabled: options?.enabled ?? true,
    refetchInterval: options?.refetchInterval ?? 60000,
    refetchIntervalInBackground: options?.refetchIntervalInBackground ?? false,
    queryFn: async () => {
      return api.get<UnreadCountResponse>('/notifications/unread-count')
    },
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation<{ id: number; read_at: string }, ApiError, { notificationId: number }>({
    mutationFn: async ({ notificationId }) => {
      return api.post<{ id: number; read_at: string }>(`/notifications/${notificationId}/read`)
    },
    onSuccess: (data, { notificationId }) => {
      // Update unread-count immediately in cache
      qc.setQueryData<UnreadCountResponse>(['notifications', 'unread-count'], (old) => {
        if (!old) return old
        return { count: Math.max(0, old.count - 1) }
      })
      // Update notifications list items in cache
      qc.setQueriesData<{ items: Notification[]; total?: number }>({ queryKey: ['notifications'] }, (old) => {
        if (!old || !old.items) return old
        return {
          ...old,
          items: old.items.map((item) =>
            item.id === notificationId ? { ...item, read_at: data.read_at || new Date().toISOString() } : item
          ),
        }
      })
      qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] })
    },
  })
}

