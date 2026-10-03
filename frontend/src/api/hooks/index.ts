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
} from '../types'
import { api } from '../client'
import {
  getMockCourtAvailability,
  getMockBookings,
  createMockBooking,
  cancelMockBooking,
  updateMockBookingStatus,
  payMockBooking,
  getMockMembers,
  getMockMember,
  getMockMemberByCode,
  createMockMember,
  getMockProducts,
  getMockLowStockProducts,
  createMockShopOrder,
  restockMockProduct,
  createMockProduct,
  updateMockProduct,
  getMockMenuItems,
  getMockBarTables,
  getMockBarOrders,
  createMockBarOrder,
  addMockBarOrderItems,
  setMockKitchenStatus,
  payMockBarOrder,
  putMockOrderOnTab,
  settleMockTabs,
  getMockBarDailyReport,
  getMockDashboardSummary,
  getMockRevenueSeries,
  getMockPayments,
  refundMockPayment,
  getMockSocialSessions,
  joinMockSocialSession,
  leaveMockSocialSession,
  getMockMyBookings,
  getMockMyPayments,
  getMockMyOrders,
  cancelMockShopOrder,
  getMockCourts,
  getMockPlans,
  getMockCourtPrices,
  getMockPublicAvailability,
  getMockPublicProducts,
  submitMockPublicEnquiry,
  setSimulatedError,
  getSimulatedError,
} from '../../mocks/store'

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'

// ── Dev Error Simulation Toggle ────────────────────────────────────────────
export function useErrorSimulation() {
  return {
    currentError: getSimulatedError(),
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
        return getMockCourts(sport)
      }
      return api.get<Court[]>(`/courts${sport ? `?sport=${sport}` : ''}`)
    },
  })
}

export function useCourtAvailability(date: string, sport?: Sport, memberId?: number) {
  return useQuery<CourtAvailabilityResponse, ApiError>({
    queryKey: ['courts', 'availability', date, sport, memberId],
    queryFn: async () => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 60))
        return getMockCourtAvailability(date, sport, memberId)
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
        return getMockBookings(filters)
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
        return createMockBooking(input)
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
        return cancelMockBooking(id, reason)
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
        return updateMockBookingStatus(id, status)
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
        return payMockBooking(id, method)
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
      await new Promise((r) => setTimeout(r, 60))
      return getMockMembers(params)
    },
  })
}

export function useMember(id: number) {
  return useQuery<Member | null, ApiError>({
    queryKey: ['member', id],
    queryFn: async () => {
      if (USE_MOCKS) {
        await new Promise((r) => setTimeout(r, 60))
        return getMockMember(id)
      }
      return api.get<Member>(`/members/${id}`)
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
      await new Promise((r) => setTimeout(r, 60))
      return getMockMemberByCode(code)
    },
    enabled: code.trim().length >= 3,
  })
}

export function useCreateMember() {
  const qc = useQueryClient()
  return useMutation<Member, ApiError, MemberCreateInput>({
    mutationFn: async (input) => {
      await new Promise((r) => setTimeout(r, 100))
      return createMockMember(input)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

// ── Products & Shop Hooks ──────────────────────────────────────────────────
export function useProducts(category?: string) {
  return useQuery<Product[], ApiError>({
    queryKey: ['products', category],
    queryFn: async () => {
      await new Promise((r) => setTimeout(r, 60))
      return getMockProducts(category)
    },
  })
}

export function useLowStockProducts() {
  return useQuery<Product[], ApiError>({
    queryKey: ['products', 'low-stock'],
    queryFn: async () => {
      await new Promise((r) => setTimeout(r, 60))
      return getMockLowStockProducts()
    },
  })
}

export function useCreateShopOrder() {
  const qc = useQueryClient()
  return useMutation<ShopOrder, ApiError, ShopOrderCreateInput>({
    mutationFn: async (input) => {
      await new Promise((r) => setTimeout(r, 100))
      return createMockShopOrder(input)
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
  return useMutation<ShopOrder, ApiError, { orderId: number; reason?: string }>({
    mutationFn: async ({ orderId, reason }) => {
      await new Promise((r) => setTimeout(r, 100))
      return cancelMockShopOrder(orderId, reason)
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
  return useMutation<Product, ApiError, { id: number; qty: number }>({
    mutationFn: async ({ id, qty }) => {
      await new Promise((r) => setTimeout(r, 80))
      return restockMockProduct(id, qty)
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
      await new Promise((r) => setTimeout(r, 100))
      return createMockProduct(input)
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
      await new Promise((r) => setTimeout(r, 80))
      return updateMockProduct(id, data)
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
        return getMockMenuItems(category)
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
        return getMockBarTables()
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
        return getMockBarOrders(filters)
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
        return createMockBarOrder(input)
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
        return addMockBarOrderItems(orderId, items)
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
        return setMockKitchenStatus(orderId, status)
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
        return payMockBarOrder(orderId, method)
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
        return putMockOrderOnTab(orderId)
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
        return settleMockTabs(memberId, method)
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
        return getMockBarDailyReport(date)
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
        return getMockDashboardSummary(period)
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
        return getMockRevenueSeries()
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
        const items = getMockPayments(filters)
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
        return refundMockPayment(paymentId, reason)
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
export function useSocialSessions(params?: { from?: string; to?: string; memberId?: number }) {
  return useQuery<SocialSession[], ApiError>({
    queryKey: ['social-sessions', params],
    queryFn: async () => {
      await new Promise((r) => setTimeout(r, 60))
      return getMockSocialSessions(params?.from, params?.to, params?.memberId)
    },
  })
}

export function useJoinSocialSession() {
  const qc = useQueryClient()
  return useMutation<SocialSession, ApiError, SocialSessionJoinInput>({
    mutationFn: async ({ sessionId, memberId, memberName }) => {
      await new Promise((r) => setTimeout(r, 100))
      return joinMockSocialSession(sessionId, memberId, memberName)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-sessions'] })
    },
  })
}

export function useLeaveSocialSession() {
  const qc = useQueryClient()
  return useMutation<SocialSession, ApiError, { sessionId: number; memberId: number }>({
    mutationFn: async ({ sessionId, memberId }) => {
      await new Promise((r) => setTimeout(r, 80))
      return leaveMockSocialSession(sessionId, memberId)
    },
    onSuccess: () => {
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
        return getMockMyBookings(memberId)
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
      await new Promise((r) => setTimeout(r, 60))
      return getMockMyPayments(memberId)
    },
    enabled: !!memberId,
  })
}

export function useMyOrders(memberId?: number) {
  return useQuery<ShopOrder[], ApiError>({
    queryKey: ['shop', 'orders', 'my', memberId],
    queryFn: async () => {
      if (!memberId) return []
      await new Promise((r) => setTimeout(r, 60))
      return getMockMyOrders(memberId)
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
        return getMockPlans()
      }
      return api.get<Plan[]>('/plans')
    },
  })
}

export function useCourtPrices() {
  return useQuery<CourtPrice[], ApiError>({
    queryKey: ['court-prices', 'public'],
    queryFn: async () => {
      await new Promise((r) => setTimeout(r, 60))
      return getMockCourtPrices()
    },
  })
}

export function usePublicAvailability(params?: { from?: string; days?: number; sport?: Sport }) {
  return useQuery<PublicAvailabilityResponse, ApiError>({
    queryKey: ['availability', 'public', params],
    queryFn: async () => {
      await new Promise((r) => setTimeout(r, 60))
      return getMockPublicAvailability(params?.from, params?.days ?? 7, params?.sport)
    },
  })
}

export function usePublicProducts(category?: string) {
  return useQuery<PublicProduct[], ApiError>({
    queryKey: ['products', 'public', category],
    queryFn: async () => {
      await new Promise((r) => setTimeout(r, 60))
      return getMockPublicProducts(category)
    },
  })
}

export function useSubmitEnquiry() {
  return useMutation<PublicEnquiryResponse, ApiError, PublicEnquiryInput>({
    mutationFn: async (input) => {
      await new Promise((r) => setTimeout(r, 120))
      return submitMockPublicEnquiry(input)
    },
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
  options?: { refetchInterval?: number | false }
) {
  return useQuery<PaginatedNotifications, ApiError>({
    queryKey: ['notifications', params],
    refetchInterval: options?.refetchInterval ?? 30000,
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      if (params?.unread_only) searchParams.set('unread_only', 'true')
      searchParams.set('page', String(params?.page ?? 1))
      searchParams.set('page_size', String(params?.page_size ?? 50))

      return api.get<PaginatedNotifications>(`/notifications?${searchParams.toString()}`)
    },
  })
}

export function useUnreadNotificationsCount(options?: { refetchInterval?: number | false }) {
  return useQuery<UnreadCountResponse, ApiError>({
    queryKey: ['notifications', 'unread-count'],
    refetchInterval: options?.refetchInterval ?? 30000,
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] })
    },
  })
}

