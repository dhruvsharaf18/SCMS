import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Sport, Tier, PaymentMethod, CourtSlotAvailability } from '../../api/types'
import {
  useCourtAvailability,
  useCreateBooking,
  useMyBookings,
  useMember,
  useErrorSimulation,
} from '../../api/hooks'
import { useAuth } from '../../hooks/useAuth'
import { getTodayIST, formatDateIST, formatTimeIST, formatMoney } from '../../lib/format'
import {
  Card,
  Button,
  StatusChip,
  PillTabs,
  Drawer,
  useToast,
} from '../../components/ui'
import {
  CalendarDays,
  Clock,
  AlertTriangle,
  CheckCircle,
  CreditCard,
  Banknote,
  Smartphone,
  ChevronRight,
  ShieldCheck,
  Dumbbell,
  Sparkles,
  Info,
} from 'lucide-react'

const SPORTS: { id: Sport | 'ALL'; label: string }[] = [
  { id: 'ALL', label: 'All Sports' },
  { id: 'TENNIS', label: 'Tennis' },
  { id: 'PADEL', label: 'Padel' },
  { id: 'BADMINTON', label: 'Badminton' },
  { id: 'CRICKET_NET', label: 'Cricket Net' },
]

export default function PortalBook() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const memberId = user?.member_id ?? 1

  const todayStr = getTodayIST()
  const [selectedDate, setSelectedDate] = useState<string>(todayStr)
  const [selectedSport, setSelectedSport] = useState<Sport | 'ALL'>('ALL')

  // Generate 7 upcoming dates
  const next7Days = useMemo(() => {
    const days: { date: string; dayName: string; dayNumber: string; isToday: boolean }[] = []
    const [y, m, d] = todayStr.split('-').map(Number)
    for (let i = 0; i < 7; i++) {
      const dt = new Date(Date.UTC(y, m - 1, d + i))
      const dateStr = dt.toISOString().slice(0, 10)
      const dayName = dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
      const dayNumber = dt.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' })
      days.push({
        date: dateStr,
        dayName,
        dayNumber,
        isToday: i === 0,
      })
    }
    return days
  }, [todayStr])

  // Fetch member info
  const { data: member } = useMember(memberId)
  const memberTier: Tier = member?.membership?.plan_code ?? member?.tier ?? 'GOLD'

  // Fetch court availability for member
  const sportParam = selectedSport === 'ALL' ? undefined : selectedSport
  const { data: availability, isLoading: availLoading } = useCourtAvailability(
    selectedDate,
    sportParam,
    memberId,
  )

  // Fetch member's bookings to calculate daily limit (x/2) using filtered query
  const { data: myBookings = [] } = useMyBookings(memberId, { date: selectedDate, status: 'CONFIRMED' })
  const createBookingMutation = useCreateBooking()
  const { currentError, setSimulatedError } = useErrorSimulation()

  // Calculate confirmed bookings count for selected date
  const bookingsOnDateCount = useMemo(() => {
    return myBookings.filter(
      (b) => b.status === 'CONFIRMED' && b.start_at.slice(0, 10) === selectedDate,
    ).length
  }, [myBookings, selectedDate])

  const isDailyLimitReached = bookingsOnDateCount >= 2

  // Confirm Drawer state
  const [confirmSlot, setConfirmSlot] = useState<{
    courtId: number
    courtName: string
    sport: Sport
    slot: CourtSlotAvailability
  } | null>(null)

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI')
  const [inlineError, setInlineError] = useState<string | null>(null)

  const handleSlotClick = (
    courtId: number,
    courtName: string,
    sport: Sport,
    slot: CourtSlotAvailability,
  ) => {
    if (slot.state !== 'FREE' || !slot.bookable_1h) return
    setInlineError(null)
    setConfirmSlot({
      courtId,
      courtName,
      sport,
      slot,
    })
  }

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!confirmSlot) return
    setInlineError(null)

    const price = confirmSlot.slot.price_paise ?? 0
    const methodToPass = price === 0 ? null : paymentMethod

    try {
      await createBookingMutation.mutateAsync({
        court_id: confirmSlot.courtId,
        start_at: confirmSlot.slot.start_at,
        member_id: memberId,
        source: 'WEB',
        payment_method: methodToPass,
      })

      toast('Court booking confirmed successfully!', 'success')
      setConfirmSlot(null)
      navigate('/portal/bookings')
    } catch (err: any) {
      const msg = err?.error?.message ?? 'Failed to reserve court slot.'
      setInlineError(msg)
    }
  }

  return (
    <div className="space-y-6 pb-8">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            Book a Court
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Select a sport, choose a date, and reserve a 1-hour playing slot
          </p>
        </div>

        {/* Daily Booking Limit Badge */}
        <div className="flex items-center gap-2">
          <div
            className={`px-3 py-1.5 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
              isDailyLimitReached
                ? 'bg-status-error border-status-error-accent text-ink'
                : bookingsOnDateCount === 1
                ? 'bg-status-warning border-status-warning-accent text-ink'
                : 'bg-surface-dark border-border-light text-white'
            }`}
          >
            <span>Bookings for this date:</span>
            <span
              className={`px-2 py-0.5 rounded-lg text-xs font-mono font-extrabold ${
                isDailyLimitReached ? 'bg-ink text-white' : 'bg-white text-ink shadow-sm'
              }`}
            >
              {bookingsOnDateCount} / 2 max
            </span>
          </div>
        </div>
      </div>

      {/* ── 7-Day Fast Date Strip Selector ── */}
      <div className="overflow-x-auto pb-1 scrollbar-none">
        <div className="flex items-center gap-2.5 min-w-max">
          {next7Days.map((d) => {
            const isSelected = d.date === selectedDate
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => {
                  setSelectedDate(d.date)
                  setConfirmSlot(null)
                }}
                className={`flex flex-col items-center justify-center w-16 py-3 px-2 rounded-2xl border transition-all touch-target ${
                  isSelected
                    ? 'bg-primary-500 border-primary-500 text-white shadow-pill font-bold scale-[1.02]'
                    : 'bg-surface border-border-light hover:border-primary-300 text-text-secondary hover:text-text-primary'
                }`}
              >
                <span className={`text-[10px] uppercase font-semibold ${isSelected ? 'text-white/80' : 'text-text-tertiary'}`}>
                  {d.dayName}
                </span>
                <span className="text-lg font-extrabold mt-0.5">
                  {d.dayNumber}
                </span>
                {d.isToday && (
                  <span className={`text-[9px] font-bold mt-0.5 ${isSelected ? 'text-white' : 'text-primary-600'}`}>
                    Today
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Sport Filter Tabs ── */}
      <Card className="p-3">
        <PillTabs
          tabs={SPORTS}
          activeId={selectedSport}
          onChange={(id) => setSelectedSport(id as Sport | 'ALL')}
        />
      </Card>

      {/* Daily limit notice */}
      {isDailyLimitReached && (
        <div className="p-4 rounded-2xl bg-status-error border border-status-error-accent text-xs text-ink flex items-start gap-3">
          <AlertTriangle size={18} className="text-ink flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Daily Booking Limit Reached (2 / 2)</p>
            <p className="text-[11px] text-ink mt-0.5 font-medium">
              Per Champions Club rules (SRS 4.3), members are limited to a maximum of 2 court bookings on any single day. Please choose another date or cancel an existing booking.
            </p>
          </div>
        </div>
      )}

      {/* ── Courts & Available Slots Grid ── */}
      {availLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-6 h-36 animate-pulse bg-surface">
              <div className="h-full" />
            </Card>
          ))}
        </div>
      ) : !availability || availability.courts.length === 0 ? (
        <Card className="p-12 text-center space-y-2">
          <Dumbbell size={32} className="mx-auto text-text-tertiary" />
          <p className="font-bold text-sm text-text-primary">No courts available</p>
          <p className="text-xs text-text-secondary">
            No active courts match the selected sport filter for {formatDateIST(selectedDate)}
          </p>
        </Card>
      ) : (
        <div className="space-y-5">
          {availability.courts.map((court) => (
            <Card key={court.court_id} className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-base text-text-primary flex items-center gap-2">
                    {court.name}
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-canvas text-text-secondary border border-border-light">
                      {court.sport}
                    </span>
                  </h3>
                  <p className="text-xs text-text-tertiary mt-0.5">
                    1-hour slots · {memberTier} Tier applied
                  </p>
                </div>
              </div>

              {/* Slot Buttons Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 gap-2.5">
                {court.slots.map((slot) => {
                  const startTime = formatTimeIST(slot.start_at)
                  const isFree = slot.state === 'FREE' && slot.bookable_1h
                  const isSocial = slot.state === 'SOCIAL'
                  const isBooked = slot.state === 'BOOKED'
                  const price = slot.price_paise ?? 0

                  return (
                    <button
                      key={slot.start_at}
                      type="button"
                      disabled={!isFree || isDailyLimitReached}
                      onClick={() =>
                        handleSlotClick(court.court_id, court.name, court.sport, slot)
                      }
                      className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-center touch-target ${
                        isFree
                          ? isDailyLimitReached
                            ? 'bg-surface-dark border-border-light/60 opacity-50 cursor-not-allowed text-white'
                            : 'bg-surface border-border-light hover:border-primary-500 hover:bg-primary-500/20 shadow-soft cursor-pointer group text-ink'
                          : isSocial
                          ? 'bg-brand-purple text-white cursor-not-allowed border border-ink'
                          : 'bg-surface-dark border-border-light/60 opacity-60 cursor-not-allowed text-white'
                      }`}
                    >
                      <span
                        className={`text-xs font-bold ${
                          isFree
                            ? 'text-ink group-hover:text-ink'
                            : isSocial
                            ? 'text-white'
                            : 'text-white/60'
                        }`}
                      >
                        {startTime}
                      </span>

                      <span className="text-[10px] font-semibold mt-1">
                        {isFree ? (
                          price === 0 ? (
                            <span className="text-ink font-bold">FREE</span>
                          ) : (
                            <span className="text-ink font-bold">{formatMoney(price)}</span>
                          )
                        ) : isSocial ? (
                          <span className="text-white/90">Social</span>
                        ) : (
                          <span className="text-white/60">Booked</span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Confirm Booking Drawer ── */}
      <Drawer
        open={!!confirmSlot}
        onClose={() => setConfirmSlot(null)}
        title="Confirm Court Booking"
        side="right"
        className="w-full max-w-md"
      >
        {confirmSlot && (
          <form onSubmit={handleBookingSubmit} className="space-y-5">
            {/* Booking Summary Box */}
            <div className="p-4 rounded-2xl bg-canvas border border-border-light space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-text-secondary">Court:</span>
                <span className="font-bold text-text-primary">
                  {confirmSlot.courtName} ({confirmSlot.sport})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Date:</span>
                <span className="font-semibold text-text-primary">
                  {formatDateIST(confirmSlot.slot.start_at)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Time Slot:</span>
                <span className="font-bold text-text-primary">
                  {formatTimeIST(confirmSlot.slot.start_at)} (1 Hour Duration)
                </span>
              </div>
              <div className="flex justify-between border-t border-border-light pt-2">
                <span className="text-text-secondary">Membership Tier:</span>
                <span className="font-bold text-primary-600 uppercase">
                  {memberTier} Member
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary font-bold">Booking Total:</span>
                <span className="font-extrabold text-base text-text-primary">
                  {confirmSlot.slot.price_paise === 0
                    ? '₹0.00 (Complimentary)'
                    : formatMoney(confirmSlot.slot.price_paise ?? 0)}
                </span>
              </div>
            </div>

            {/* Payment Method Selector (if not complimentary) */}
            {(confirmSlot.slot.price_paise ?? 0) > 0 && (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-text-secondary">
                  Select Payment Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'UPI' as PaymentMethod, label: 'UPI / QR', icon: Smartphone },
                    { id: 'CARD' as PaymentMethod, label: 'Card', icon: CreditCard },
                    { id: 'CASH' as PaymentMethod, label: 'Pay at Desk', icon: Banknote },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id)}
                      className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-center touch-target ${
                        paymentMethod === m.id
                          ? 'bg-primary-50 border-primary-500 text-primary-600 font-bold shadow-soft'
                          : 'bg-surface border-border-light text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      <m.icon size={18} className="mb-1" />
                      <span className="text-[11px]">{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Inline Error Message */}
            {inlineError && (
              <div className="p-3.5 rounded-xl bg-status-error border border-status-error-accent text-xs text-ink font-semibold flex items-center gap-2">
                <AlertTriangle size={16} className="flex-shrink-0" />
                <span>{inlineError}</span>
              </div>
            )}

            <div className="p-3 rounded-xl bg-primary-500 text-ink border border-ink text-[11px] font-medium flex items-start gap-2">
              <Info size={16} className="text-ink flex-shrink-0 mt-0.5" />
              <span>
                Free cancellation available up to start time. Cancellations automatically refund the paid fee.
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-4 border-t border-border-light">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmSlot(null)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={createBookingMutation.isPending}
                className="flex-1 touch-target"
              >
                {createBookingMutation.isPending ? 'Confirming...' : 'Confirm Booking'}
              </Button>
            </div>
          </form>
        )}
      </Drawer>
    </div>
  )
}
