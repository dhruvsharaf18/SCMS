import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  Court,
  CourtAvailabilityResponse,
  Booking,
  BookingCreateInput,
  BookingCancelResponse,
  Member,
  MemberCreateInput,
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
  Payment,
  PaymentRefundResponse,
  SocialSession,
  SocialSessionJoinInput,
  DashboardSummary,
  RevenueSeriesPoint,
  KitchenStatus,
  Sport,
  Plan,
  CourtPrice,
  PublicAvailabilityResponse,
  PublicProduct,
  PublicEnquiryInput,
  PublicEnquiryResponse,
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
      await new Promise((r) => setTimeout(r, 60))
      return getMockMember(id)
    },
    enabled: id > 0,
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
      await new Promise((r) => setTimeout(r, 60))
      return getMockMenuItems(category)
    },
  })
}

export function useBarTables() {
  return useQuery<BarTable[], ApiError>({
    queryKey: ['bar', 'tables'],
    queryFn: async () => {
      await new Promise((r) => setTimeout(r, 60))
      return getMockBarTables()
    },
  })
}

export function useBarOrders(filters?: { kitchen_status?: string; payment_status?: string; table_id?: number }) {
  return useQuery<BarOrder[], ApiError>({
    queryKey: ['bar', 'orders', filters],
    queryFn: async () => {
      await new Promise((r) => setTimeout(r, 60))
      return getMockBarOrders(filters)
    },
  })
}

export function useCreateBarOrder() {
  const qc = useQueryClient()
  return useMutation<BarOrder, ApiError, BarOrderCreateInput>({
    mutationFn: async (input) => {
      await new Promise((r) => setTimeout(r, 100))
      return createMockBarOrder(input)
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
      await new Promise((r) => setTimeout(r, 80))
      return addMockBarOrderItems(orderId, items)
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
      await new Promise((r) => setTimeout(r, 80))
      return setMockKitchenStatus(orderId, status)
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
      await new Promise((r) => setTimeout(r, 80))
      return payMockBarOrder(orderId, method)
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
      await new Promise((r) => setTimeout(r, 80))
      return putMockOrderOnTab(orderId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bar', 'orders'] })
      qc.invalidateQueries({ queryKey: ['bar', 'tables'] })
    },
  })
}

export function useSettleTabs() {
  const qc = useQueryClient()
  return useMutation<number, ApiError, { memberId: number; method: 'CASH' | 'CARD' | 'UPI' }>({
    mutationFn: async ({ memberId, method }) => {
      await new Promise((r) => setTimeout(r, 100))
      return settleMockTabs(memberId, method)
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
      await new Promise((r) => setTimeout(r, 60))
      return getMockBarDailyReport(date)
    },
  })
}

// ── Dashboard & Finance Hooks ──────────────────────────────────────────────
export function useDashboardSummary(period: 'today' | 'week' | 'month' = 'today') {
  return useQuery<DashboardSummary, ApiError>({
    queryKey: ['dashboard', 'summary', period],
    queryFn: async () => {
      await new Promise((r) => setTimeout(r, 60))
      return getMockDashboardSummary(period)
    },
  })
}

export function useRevenueSeries() {
  return useQuery<RevenueSeriesPoint[], ApiError>({
    queryKey: ['dashboard', 'revenue-series'],
    queryFn: async () => {
      await new Promise((r) => setTimeout(r, 60))
      return getMockRevenueSeries()
    },
  })
}

// ── Payments & Reports Hooks ───────────────────────────────────────────────
export function usePayments(filters?: {
  from?: string
  to?: string
  source_type?: string
  method?: string
}) {
  return useQuery<Payment[], ApiError>({
    queryKey: ['payments', filters],
    queryFn: async () => {
      await new Promise((r) => setTimeout(r, 60))
      return getMockPayments(filters)
    },
  })
}

export function useRefundPayment() {
  const qc = useQueryClient()
  return useMutation<PaymentRefundResponse, ApiError, { paymentId: number; reason?: string }>({
    mutationFn: async ({ paymentId, reason }) => {
      await new Promise((r) => setTimeout(r, 100))
      return refundMockPayment(paymentId, reason)
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
      await new Promise((r) => setTimeout(r, 60))
      return getMockPlans()
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

