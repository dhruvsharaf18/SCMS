import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Booking } from '../../api/types'
import {
  useMyBookings,
  useCancelBooking,
  useErrorSimulation,
  useCourts,
} from '../../api/hooks'
import { useAuth } from '../../hooks/useAuth'
import { formatDateIST, formatTimeIST, formatMoney } from '../../lib/format'
import {
  Card,
  Button,
  StatusChip,
  Modal,
  PillTabs,
  useToast,
} from '../../components/ui'
import {
  CalendarDays,
  Clock,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  Plus,
  Dumbbell,
  ShieldAlert,
  Info,
  ChevronRight,
  Receipt,
} from 'lucide-react'

export default function PortalBookings() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const memberId = user?.member_id ?? 1

  const [activeTab, setActiveTab] = useState<'UPCOMING' | 'PAST'>('UPCOMING')
  const { data: bookings = [], isLoading, isError } = useMyBookings(memberId)
  const { data: courts = [] } = useCourts()
  const cancelMutation = useCancelBooking()
  const { currentError, setSimulatedError } = useErrorSimulation()

  const getCourtInfo = (courtId: number) => {
    const c = courts.find((item) => item.id === courtId)
    return {
      name: c?.name ?? `Court #${courtId}`,
      sport: c?.sport ?? 'SPORTS',
    }
  }

  // Cancellation Modal state
  const [cancellingBooking, setCancellingBooking] = useState<Booking | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [inlineError, setInlineError] = useState<string | null>(null)

  const nowMs = Date.now()

  // Split bookings into Upcoming vs Past
  const { upcomingBookings, pastBookings } = useMemo(() => {
    const upcoming: Booking[] = []
    const past: Booking[] = []

    for (const b of bookings) {
      const startMs = new Date(b.start_at).getTime()
      if (b.status === 'CONFIRMED' && startMs > nowMs) {
        upcoming.push(b)
      } else {
        past.push(b)
      }
    }

    // Sort upcoming ascending by start date, past descending by start date
    upcoming.sort((a, b) => a.start_at.localeCompare(b.start_at))
    past.sort((a, b) => b.start_at.localeCompare(a.start_at))

    return { upcomingBookings: upcoming, pastBookings: past }
  }, [bookings, nowMs])

  const displayedBookings = activeTab === 'UPCOMING' ? upcomingBookings : pastBookings

  // Calculate refund eligibility for modal
  const refundDetails = useMemo(() => {
    if (!cancellingBooking) return null

    const startTimeMs = new Date(cancellingBooking.start_at).getTime()
    const hoursUntilStart = (startTimeMs - nowMs) / (1000 * 60 * 60)
    const isPaid = cancellingBooking.payment_status === 'PAID'
    const isWaived = cancellingBooking.payment_status === 'WAIVED'
    const isEligible = isPaid && hoursUntilStart >= 2

    return {
      isPaid,
      isWaived,
      isEligible,
      hoursUntilStart: Math.max(0, hoursUntilStart),
      refundPaise: isEligible ? cancellingBooking.price_paise : 0,
    }
  }, [cancellingBooking, nowMs])

  const handleOpenCancel = (b: Booking) => {
    setCancellingBooking(b)
    setCancelReason('')
    setInlineError(null)
  }

  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cancellingBooking) return
    setInlineError(null)

    try {
      const res = await cancelMutation.mutateAsync({
        id: cancellingBooking.id,
        reason: cancelReason.trim() || undefined,
      })

      if (res.refunded && res.refund_paise > 0) {
        toast(`Booking cancelled. ${formatMoney(res.refund_paise)} refunded to original method.`, 'success')
      } else {
        toast('Booking cancelled successfully.', 'success')
      }

      setCancellingBooking(null)
    } catch (err: any) {
      const msg = err?.error?.message || 'Failed to cancel booking.'
      setInlineError(msg)
    }
  }

  const tabOptions = [
    { id: 'UPCOMING', label: `Upcoming (${upcomingBookings.length})` },
    { id: 'PAST', label: `Past & History (${pastBookings.length})` },
  ]

  return (
    <div className="space-y-6 pb-8">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            My Court Bookings
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Manage your scheduled court reservations and cancellation refunds
          </p>
        </div>

        <Button
          variant="primary"
          icon={Plus}
          onClick={() => navigate('/portal/book')}
          className="touch-target"
        >
          Book Court
        </Button>
      </div>

      {/* ── Tabs ── */}
      <Card className="p-3">
        <PillTabs
          tabs={tabOptions}
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as 'UPCOMING' | 'PAST')}
        />
      </Card>

      {/* ── Bookings List ── */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-5 h-28 animate-pulse bg-surface">
              <div className="h-full" />
            </Card>
          ))}
        </div>
      ) : isError ? (
        <Card className="p-8 text-center text-accent-red space-y-2">
          <AlertTriangle size={32} className="mx-auto" />
          <p className="font-bold text-sm">Failed to load bookings</p>
          <p className="text-xs text-text-secondary">Please check your connection and try again.</p>
        </Card>
      ) : displayedBookings.length === 0 ? (
        <Card className="p-12 text-center space-y-3">
          <CalendarDays size={36} className="mx-auto text-text-tertiary" />
          <div>
            <p className="font-bold text-sm text-text-primary">
              {activeTab === 'UPCOMING' ? 'No upcoming bookings' : 'No past booking records'}
            </p>
            <p className="text-xs text-text-secondary mt-0.5">
              {activeTab === 'UPCOMING'
                ? 'You have no court reservations scheduled. Ready to play?'
                : 'Your completed or cancelled court sessions will appear here.'}
            </p>
          </div>
          {activeTab === 'UPCOMING' && (
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => navigate('/portal/book')}
              className="touch-target mx-auto"
            >
              Book a Slot Now
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {displayedBookings.map((b) => {
            const startMs = new Date(b.start_at).getTime()
            const canCancel = b.status === 'CONFIRMED' && startMs > nowMs

            const statusVariants: Record<string, 'success' | 'warning' | 'error' | 'info'> = {
              CONFIRMED: 'success',
              COMPLETED: 'info',
              CANCELLED: 'error',
              NO_SHOW: 'warning',
            }

            const paymentVariants: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
              PAID: 'success',
              WAIVED: 'info',
              UNPAID: 'warning',
              REFUNDED: 'neutral',
            }

            const courtInfo = getCourtInfo(b.court_id)

            return (
              <Card key={b.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                {/* Left details */}
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-2xl bg-primary-50 text-primary-600 flex flex-col items-center justify-center flex-shrink-0">
                    <Clock size={22} />
                  </div>

                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-base text-text-primary truncate">
                        {courtInfo.name}
                      </p>
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-canvas text-text-secondary border border-border-light">
                        {courtInfo.sport}
                      </span>
                    </div>

                    <p className="text-xs text-text-secondary">
                      {formatDateIST(b.start_at)} · {formatTimeIST(b.start_at)} (1 Hour)
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <StatusChip
                        label={b.status}
                        variant={statusVariants[b.status] ?? 'neutral'}
                      />
                      <StatusChip
                        label={b.payment_status}
                        variant={paymentVariants[b.payment_status] ?? 'neutral'}
                      />
                    </div>
                  </div>
                </div>

                {/* Right price & action */}
                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 pt-3 sm:pt-0 border-t sm:border-0 border-border-light">
                  <div className="text-left sm:text-right">
                    <p className="font-bold text-sm text-text-primary">
                      {b.price_paise === 0 ? 'Complimentary' : formatMoney(b.price_paise)}
                    </p>
                    <span className="text-[10px] text-text-tertiary font-mono">
                      Ref: #{b.id}
                    </span>
                  </div>

                  {canCancel && (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={RotateCcw}
                      onClick={() => handleOpenCancel(b)}
                      className="touch-target text-xs text-accent-red hover:bg-rose-50 hover:border-rose-200"
                    >
                      Cancel Booking
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Cancellation Confirm Modal ── */}
      <Modal
        open={!!cancellingBooking}
        onClose={() => setCancellingBooking(null)}
        title="Cancel Court Reservation"
      >
        {cancellingBooking && refundDetails && (
          <form onSubmit={handleConfirmCancel} className="space-y-4">
            {/* Booking Summary */}
            <div className="p-4 rounded-2xl bg-canvas border border-border-light space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-text-secondary">Court:</span>
                <span className="font-bold text-text-primary">
                  {getCourtInfo(cancellingBooking.court_id).name} ({getCourtInfo(cancellingBooking.court_id).sport})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Date & Time:</span>
                <span className="font-semibold text-text-primary">
                  {formatDateIST(cancellingBooking.start_at)} · {formatTimeIST(cancellingBooking.start_at)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Fee Paid:</span>
                <span className="font-bold text-text-primary">
                  {cancellingBooking.price_paise === 0 ? '₹0.00 (Gold Waived)' : formatMoney(cancellingBooking.price_paise)}
                </span>
              </div>
            </div>

            {/* SRS 4.3 Refund Policy Callout */}
            <div
              className={`p-3.5 rounded-2xl border text-xs space-y-1 ${
                refundDetails.isWaived
                  ? 'bg-primary-50 border-primary-100 text-primary-900'
                  : refundDetails.isEligible
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold">
                <Info size={16} />
                <span>
                  {refundDetails.isWaived
                    ? 'Complimentary Booking'
                    : refundDetails.isEligible
                    ? `100% Refund: ${formatMoney(refundDetails.refundPaise)}`
                    : 'No Refund Applicable'}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed">
                {refundDetails.isWaived
                  ? 'This booking was complimentary under your Gold tier membership. Cancelling will free the slot and restore your daily quota.'
                  : refundDetails.isEligible
                  ? `Per SRS §4.3, full refund applies because cancellation is requested > 2 hours prior to start time (${refundDetails.hoursUntilStart.toFixed(1)}h remaining).`
                  : 'Per SRS §4.3, court cancellations within 2 hours of start time are non-refundable.'}
              </p>
            </div>

            {/* Reason input */}
            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1">
                Reason for Cancellation (optional)
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g., Schedule conflict, weather, etc."
                className="w-full px-3.5 py-2.5 rounded-xl border border-border-light bg-canvas text-xs text-text-primary focus:outline-none focus:border-primary-500 focus:bg-surface"
              />
            </div>

            {/* Inline Error Message */}
            {inlineError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-accent-red flex items-center gap-2">
                <AlertTriangle size={16} className="flex-shrink-0" />
                <span>{inlineError}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-light">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCancellingBooking(null)}
              >
                Keep Booking
              </Button>
              <Button
                type="submit"
                variant="danger"
                disabled={cancelMutation.isPending}
                className="touch-target"
              >
                {cancelMutation.isPending ? 'Cancelling...' : 'Confirm Cancellation'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
