import React, { useState } from 'react'
import type { Sport, Tier, PaymentMethod, Booking } from '../../api/types'
import {
  useCreateBooking,
  useCancelBooking,
  useUpdateBookingStatus,
  usePayBooking,
  useBookings,
  useCourts,
  useMemberByCode,
  useErrorSimulation,
} from '../../api/hooks'
import { getTodayIST, formatMoney, formatTimeIST, formatDateIST } from '../../lib/format'
import { CourtScheduleGrid } from '../../components/features/CourtScheduleGrid'
import {
  Button,
  Drawer,
  StatusChip,
  Card,
  useToast,
} from '../../components/ui'
import {
  Calendar,
  Filter,
  UserCheck,
  UserX,
  CreditCard,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '../../lib/utils'

export default function StaffBookings() {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayIST())
  const [sportFilter, setSportFilter] = useState<Sport | 'ALL'>('ALL')

  // Create Booking Drawer State
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<{
    courtId: number
    courtName: string
    sport: Sport
    startAt: string
  } | null>(null)

  const [isMember, setIsMember] = useState(true)
  const [memberCodeInput, setMemberCodeInput] = useState('CC-000001')
  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | 'DESK'>('CASH')
  const [inlineError, setInlineError] = useState<string | null>(null)

  // Booking Detail Drawer State
  const [detailBookingId, setDetailBookingId] = useState<number | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  const { toast } = useToast()
  const { currentError, setSimulatedError } = useErrorSimulation()

  // Queries & Mutations
  const { data: courts = [] } = useCourts()
  const { data: allBookings } = useBookings({ date: selectedDate })
  const { data: lookedUpMember } = useMemberByCode(isMember ? memberCodeInput : '')
  const createBookingMutation = useCreateBooking()
  const cancelBookingMutation = useCancelBooking()
  const updateStatusMutation = useUpdateBookingStatus()
  const payBookingMutation = usePayBooking()

  const selectedBooking = allBookings?.find((b) => b.id === detailBookingId)

  // Calculated tier price for drawer
  const appliedTier: Tier = isMember
    ? (lookedUpMember?.status === 'ACTIVE' && lookedUpMember?.membership ? lookedUpMember.membership.plan_code : 'WALKIN')
    : 'WALKIN'

  const tierPrices: Record<Sport, Record<Tier, number>> = {
    TENNIS: { GOLD: 0, SILVER: 40000, JUNIOR: 25000, WALKIN: 60000 },
    PADEL: { GOLD: 0, SILVER: 70000, JUNIOR: 45000, WALKIN: 100000 },
    BADMINTON: { GOLD: 0, SILVER: 20000, JUNIOR: 12000, WALKIN: 30000 },
    CRICKET_NET: { GOLD: 0, SILVER: 50000, JUNIOR: 30000, WALKIN: 80000 },
  }

  const calculatedPricePaise = selectedSlot
    ? tierPrices[selectedSlot.sport][appliedTier]
    : 0

  // Handlers
  const handleOpenSlot = (courtId: number, courtName: string, sport: Sport, startAt: string) => {
    setSelectedSlot({ courtId, courtName, sport, startAt })
    setInlineError(null)
    setCreateDrawerOpen(true)
  }

  const handleCreateBooking = async () => {
    if (!selectedSlot) return
    setInlineError(null)

    if (isMember && !lookedUpMember) {
      setInlineError('Please enter a valid active member code (e.g. CC-000001)')
      return
    }

    if (!isMember && (!guestName.trim() || !guestPhone.trim())) {
      setInlineError('Guest full name and contact phone number are required')
      return
    }

    try {
      await createBookingMutation.mutateAsync({
        court_id: selectedSlot.courtId,
        start_at: selectedSlot.startAt,
        member_id: isMember && lookedUpMember ? lookedUpMember.id : null,
        guest_name: !isMember ? guestName.trim() : null,
        guest_phone: !isMember ? guestPhone.trim() : null,
        source: 'FRONT_DESK',
        payment_method: calculatedPricePaise === 0 ? null : paymentMethod === 'DESK' ? null : paymentMethod,
      })

      toast('Court booking confirmed successfully', 'success')
      setCreateDrawerOpen(false)
      setSelectedSlot(null)
    } catch (err: any) {
      const code = err?.error?.code ?? 'ERROR'
      if (code === 'SLOT_TAKEN') {
        setInlineError('Slot conflict: This court slot has just been taken.')
      } else if (code === 'DAILY_LIMIT_REACHED') {
        setInlineError('Daily limit reached: Member already has 2 bookings today.')
      } else {
        setInlineError(err?.error?.message ?? 'Failed to create booking.')
      }
    }
  }

  const handleCancelBooking = async () => {
    if (!detailBookingId) return
    try {
      const res = await cancelBookingMutation.mutateAsync({
        id: detailBookingId,
        reason: cancelReason || 'Cancelled at front desk',
      })
      toast(
        res.refunded
          ? `Booking cancelled. Refund of ${formatMoney(res.refund_paise)} processed.`
          : 'Booking cancelled (no refund applicable).',
        'info'
      )
      setDetailBookingId(null)
      setShowCancelConfirm(false)
    } catch (err: any) {
      toast(err?.error?.message ?? 'Failed to cancel booking', 'error')
    }
  }

  const handleMarkStatus = async (status: 'COMPLETED' | 'NO_SHOW') => {
    if (!detailBookingId) return
    try {
      await updateStatusMutation.mutateAsync({ id: detailBookingId, status })
      toast(`Booking marked as ${status}`, 'success')
      setDetailBookingId(null)
    } catch (err: any) {
      toast(err?.error?.message ?? 'Failed to update status', 'error')
    }
  }

  const handlePay = async (method: 'CASH' | 'CARD' | 'UPI') => {
    if (!detailBookingId) return
    try {
      await payBookingMutation.mutateAsync({ id: detailBookingId, method })
      toast(`Payment recorded via ${method}`, 'success')
    } catch (err: any) {
      if (err?.error?.code === 'ALREADY_PAID' || err?.code === 'ALREADY_PAID' || err?.error?.message?.toLowerCase().includes('already paid')) {
        toast('Booking is already paid', 'info')
      } else {
        toast(err?.error?.message ?? 'Failed to record payment', 'error')
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Court Bookings</h1>
          <p className="text-sm text-text-secondary">Front Desk schedule, slot allocations and payments</p>
        </div>

        {/* Date and dev error simulator */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Dev error simulation toggle */}
          {import.meta.env.DEV && (
            <div className="flex items-center gap-1.5 p-1 bg-canvas rounded-pill border border-border-light text-xs">
              <span className="text-[10px] font-semibold text-text-tertiary px-2 uppercase">Simulate Error:</span>
              <button
                type="button"
                onClick={() => setSimulatedError(currentError === 'SLOT_TAKEN' ? null : 'SLOT_TAKEN')}
                className={cn(
                  'px-2 py-0.5 rounded-pill text-[11px] font-medium transition-colors',
                  currentError === 'SLOT_TAKEN' ? 'bg-status-error text-status-error-text font-bold' : 'text-text-secondary hover:text-text-primary'
                )}
              >
                Slot Taken
              </button>
              <button
                type="button"
                onClick={() => setSimulatedError(currentError === 'DAILY_LIMIT_REACHED' ? null : 'DAILY_LIMIT_REACHED')}
                className={cn(
                  'px-2 py-0.5 rounded-pill text-[11px] font-medium transition-colors',
                  currentError === 'DAILY_LIMIT_REACHED' ? 'bg-status-warning text-status-warning-text font-bold' : 'text-text-secondary hover:text-text-primary'
                )}
              >
                Daily Limit
              </button>
            </div>
          )}

          {/* Date Picker Input */}
          <div className="flex items-center gap-2 px-3 py-2 bg-surface rounded-xl border border-border-light shadow-soft">
            <Calendar size={16} className="text-text-tertiary" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-sm font-semibold text-text-primary outline-none cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Sport Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1">
        {(['ALL', 'TENNIS', 'PADEL', 'BADMINTON', 'CRICKET_NET'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSportFilter(s)}
            className={cn(
              'px-4 py-2 rounded-pill text-xs font-semibold whitespace-nowrap transition-colors touch-target',
              sportFilter === s
                ? 'bg-primary-50 text-primary-600 shadow-pill border border-primary-200'
                : 'bg-surface text-text-secondary hover:bg-canvas hover:text-text-primary border border-border-light'
            )}
          >
            {s === 'ALL' ? 'All Sports' : s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Master Interactive Schedule Grid */}
      <CourtScheduleGrid
        selectedDate={selectedDate}
        sportFilter={sportFilter}
        onSelectSlot={handleOpenSlot}
        onSelectBooking={(id) => setDetailBookingId(id)}
      />

      {/* ── CREATE BOOKING DRAWER ────────────────────────────────────────── */}
      <Drawer
        open={createDrawerOpen}
        onClose={() => setCreateDrawerOpen(false)}
        title="Book Court Slot"
      >
        {selectedSlot && (
          <div className="space-y-6">
            {/* Slot summary card */}
            <div className="p-4 rounded-2xl bg-canvas border border-border-light space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-text-tertiary uppercase tracking-wider">Court</span>
                <span className="text-sm font-bold text-text-primary">{selectedSlot.courtName} ({selectedSlot.sport})</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-text-tertiary uppercase tracking-wider">Date & Time</span>
                <span className="text-sm font-semibold text-primary-600">
                  {formatDateIST(selectedSlot.startAt)}, {formatTimeIST(selectedSlot.startAt)} (1 hour)
                </span>
              </div>
            </div>

            {/* Inline Error Alert */}
            {inlineError && (
              <div className="p-3 rounded-2xl bg-status-error border border-status-error-text/30 flex items-start gap-2.5 animate-scale-in">
                <AlertCircle size={18} className="text-status-error-text flex-shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-status-error-text leading-relaxed">{inlineError}</p>
              </div>
            )}

            {/* Customer Type Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider">Booking For</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsMember(true)}
                  className={cn(
                    'flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-semibold transition-colors touch-target',
                    isMember
                      ? 'bg-primary-50 border-primary-500 text-primary-700 shadow-pill'
                      : 'bg-surface border-border-light text-text-secondary hover:bg-canvas'
                  )}
                >
                  <UserCheck size={16} /> Club Member
                </button>
                <button
                  type="button"
                  onClick={() => setIsMember(false)}
                  className={cn(
                    'flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-semibold transition-colors touch-target',
                    !isMember
                      ? 'bg-primary-50 border-primary-500 text-primary-700 shadow-pill'
                      : 'bg-surface border-border-light text-text-secondary hover:bg-canvas'
                  )}
                >
                  <UserX size={16} /> Walk-in Guest
                </button>
              </div>
            </div>

            {/* Member Lookup Form */}
            {isMember ? (
              <div className="space-y-3">
                <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider">Member Code</label>
                <input
                  type="text"
                  placeholder="CC-000001"
                  value={memberCodeInput}
                  onChange={(e) => setMemberCodeInput(e.target.value.toUpperCase())}
                  className="w-full h-11 px-3 rounded-xl border border-border-light bg-surface text-sm font-semibold uppercase tracking-wider outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />

                {lookedUpMember ? (
                  <div className="p-3 rounded-xl bg-surface border border-border-light flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-text-primary">{lookedUpMember.full_name}</p>
                      <p className="text-xs text-text-secondary">{lookedUpMember.phone}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-primary-600">{lookedUpMember.membership?.plan_code} Tier</span>
                      <p className="text-[10px] text-text-tertiary">Status: {lookedUpMember.status}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-text-tertiary italic">
                    Type a 6-digit member code to apply plan pricing (e.g. CC-000001)
                  </p>
                )}
              </div>
            ) : (
              /* Walk-in Guest Details */
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider mb-1 block">
                    Guest Full Name *
                  </label>
                  <input
                    type="text"
                    placeholder="Enter guest full name"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-border-light bg-surface text-sm outline-none focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider mb-1 block">
                    Guest Phone Number *
                  </label>
                  <input
                    type="tel"
                    placeholder="98765 00000"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-border-light bg-surface text-sm outline-none focus:border-primary-500"
                  />
                </div>
              </div>
            )}

            {/* Pricing & Fee Calculation */}
            <div className="p-4 rounded-2xl bg-canvas border border-border-light space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-text-secondary">Tier Applied:</span>
                <span className="text-xs font-bold text-text-primary uppercase">{appliedTier}</span>
              </div>
              <div className="flex justify-between items-center text-base font-bold pt-1 border-t border-border-light">
                <span className="text-text-primary">Hourly Price:</span>
                <span className="text-primary-600">{formatMoney(calculatedPricePaise)}</span>
              </div>
            </div>

            {/* Payment Method (if not waived) */}
            {calculatedPricePaise > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider">Payment Method</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['CASH', 'CARD', 'UPI', 'DESK'] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={cn(
                        'py-2 px-3 rounded-xl border text-xs font-semibold transition-colors touch-target',
                        paymentMethod === method
                          ? 'bg-primary-50 border-primary-500 text-primary-700 shadow-pill'
                          : 'bg-surface border-border-light text-text-secondary hover:bg-canvas'
                      )}
                    >
                      {method === 'DESK' ? 'Pay at Desk (Unpaid)' : method}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="pt-4 flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setCreateDrawerOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                loading={createBookingMutation.isPending}
                onClick={handleCreateBooking}
              >
                Confirm Booking
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* ── BOOKING DETAIL & ACTIONS DRAWER ──────────────────────────────── */}
      <Drawer
        open={detailBookingId !== null}
        onClose={() => {
          setDetailBookingId(null)
          setShowCancelConfirm(false)
        }}
        title={`Booking #${detailBookingId ?? ''}`}
      >
        {selectedBooking && (
          <div className="space-y-6">
            {/* Status overview */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-canvas border border-border-light">
              <div>
                <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider block mb-1">
                  Status
                </span>
                <StatusChip
                  label={selectedBooking.status}
                  variant={
                    selectedBooking.status === 'CONFIRMED'
                      ? 'success'
                      : selectedBooking.status === 'COMPLETED'
                      ? 'info'
                      : 'error'
                  }
                />
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider block mb-1">
                  Payment
                </span>
                <StatusChip
                  label={selectedBooking.payment_status}
                  variant={
                    selectedBooking.payment_status === 'PAID' || selectedBooking.payment_status === 'WAIVED'
                      ? 'success'
                      : selectedBooking.payment_status === 'UNPAID'
                      ? 'warning'
                      : 'error'
                  }
                />
              </div>
            </div>

            {/* Booking Details */}
            {(() => {
              const court = courts.find((c) => c.id === selectedBooking.court_id)
              return (
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-border-light text-sm">
                    <span className="text-text-secondary">Court:</span>
                    <span className="font-bold text-text-primary">
                      {court?.name ?? `Court #${selectedBooking.court_id}`} {court?.sport ? `(${court.sport})` : ''}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border-light text-sm">
                    <span className="text-text-secondary">Customer:</span>
                    <span className="font-bold text-text-primary text-right">
                      {selectedBooking.member_name ?? selectedBooking.guest_name ?? 'Walk-in'}
                      {selectedBooking.member_code && (
                        <span className="block text-xs font-mono font-normal text-text-tertiary">
                          ({selectedBooking.member_code})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border-light text-sm">
                    <span className="text-text-secondary">Slot Time:</span>
                    <span className="font-semibold text-text-primary">
                      {formatDateIST(selectedBooking.start_at)}, {formatTimeIST(selectedBooking.start_at)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border-light text-sm">
                    <span className="text-text-secondary">Fee:</span>
                    <span className="font-bold text-primary-600">{formatMoney(selectedBooking.price_paise)}</span>
                  </div>
                </div>
              )
            })()}

            {/* Unpaid Booking Settlement */}
            {selectedBooking.payment_status === 'UNPAID' && selectedBooking.status !== 'CANCELLED' && (
              <div className="p-4 rounded-2xl bg-status-warning/30 border border-status-warning-text/20 space-y-3">
                <p className="text-xs font-bold text-status-warning-text flex items-center gap-1.5">
                  <CreditCard size={14} /> Outstanding Payment: {formatMoney(selectedBooking.price_paise)}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={payBookingMutation.isPending}
                    onClick={() => handlePay('CASH')}
                  >
                    Cash
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={payBookingMutation.isPending}
                    onClick={() => handlePay('CARD')}
                  >
                    Card
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={payBookingMutation.isPending}
                    onClick={() => handlePay('UPI')}
                  >
                    UPI
                  </Button>
                </div>
              </div>
            )}

            {/* Mark Completed / No Show */}
            {selectedBooking.status === 'CONFIRMED' && (
              <div className="space-y-3 pt-2">
                <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider block">
                  Check-in / Attendance
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    icon={CheckCircle}
                    onClick={() => handleMarkStatus('COMPLETED')}
                  >
                    Completed
                  </Button>
                  <Button
                    variant="secondary"
                    icon={XCircle}
                    onClick={() => handleMarkStatus('NO_SHOW')}
                  >
                    No Show
                  </Button>
                </div>
              </div>
            )}

            {/* Cancellation Section */}
            {selectedBooking.status === 'CONFIRMED' && (
              <div className="pt-4 border-t border-border-light space-y-3">
                {!showCancelConfirm ? (
                  <Button
                    variant="danger"
                    className="w-full"
                    onClick={() => setShowCancelConfirm(true)}
                  >
                    Cancel Booking
                  </Button>
                ) : (
                  <div className="p-4 rounded-2xl bg-status-error/20 border border-status-error space-y-3 animate-scale-in">
                    <p className="text-xs font-bold text-status-error-text">Confirm Cancellation</p>
                    <input
                      type="text"
                      placeholder="Reason for cancellation (optional)"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-border-light bg-surface text-xs outline-none"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onClick={() => setShowCancelConfirm(false)}
                      >
                        Keep Booking
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        className="flex-1"
                        loading={cancelBookingMutation.isPending}
                        onClick={handleCancelBooking}
                      >
                        Confirm Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}
