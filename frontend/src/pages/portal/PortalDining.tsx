import React, { useMemo, useState } from 'react'
import type { MenuCategory, ReservationStatus } from '../../api/types'
import {
  useDiningMenu,
  useDiningAvailability,
  useReservations,
  useCreateReservation,
  useCancelReservation,
} from '../../api/hooks'
import { getTodayIST, formatDateIST, formatTimeIST, formatMoney, istToUtcIso } from '../../lib/format'
import { Card, Button, StatusChip, SectionHeader, PillTabs, useToast } from '../../components/ui'
import type { ChipVariant } from '../../components/ui'
import {
  UtensilsCrossed,
  Wine,
  Cookie,
  Sparkles,
  Users,
  Minus,
  Plus,
  CalendarCheck,
  Clock,
  AlertTriangle,
  XCircle,
} from 'lucide-react'

const ADVANCE_DAYS = 14

const CATEGORY_TABS = [
  { id: 'ALL', label: 'All' },
  { id: 'FOOD', label: 'Food' },
  { id: 'DRINK', label: 'Drinks' },
  { id: 'SNACK', label: 'Snacks' },
]

const CATEGORY_ICONS: Record<MenuCategory, typeof UtensilsCrossed> = {
  FOOD: UtensilsCrossed,
  DRINK: Wine,
  SNACK: Cookie,
}

const STATUS_VARIANTS: Record<ReservationStatus, ChipVariant> = {
  CONFIRMED: 'success',
  SEATED: 'info',
  CANCELLED: 'neutral',
  NO_SHOW: 'error',
}

export default function PortalDining() {
  const { toast } = useToast()
  const todayStr = getTodayIST()

  const [category, setCategory] = useState<string>('ALL')
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [partySize, setPartySize] = useState(2)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [inlineError, setInlineError] = useState<string | null>(null)

  const { data: menu, isLoading: menuLoading } = useDiningMenu()
  const { data: availability, isLoading: slotsLoading } = useDiningAvailability(selectedDate, partySize)
  const { data: reservations = [], isLoading: reservationsLoading } = useReservations({ upcoming: true })
  const createReservation = useCreateReservation()
  const cancelReservation = useCancelReservation()

  const maxParty = availability?.max_party_size || 6
  const discountPct = menu?.discount_pct ?? 0
  const tier = menu?.tier ?? 'WALKIN'

  const dates = useMemo(() => {
    const [y, m, d] = todayStr.split('-').map(Number)
    return Array.from({ length: ADVANCE_DAYS + 1 }, (_, i) => {
      const dt = new Date(Date.UTC(y, m - 1, d + i))
      return {
        date: dt.toISOString().slice(0, 10),
        dayName: dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
        dayNumber: dt.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' }),
        isToday: i === 0,
      }
    })
  }, [todayStr])

  const visibleItems = useMemo(
    () => (menu?.items ?? []).filter((item) => category === 'ALL' || item.category === category),
    [menu, category],
  )

  const selectedDayLabel = formatDateIST(istToUtcIso(selectedDate, '12:00'))
  const reservedOnSelectedDate = reservations.some(
    (r) => r.status === 'CONFIRMED' && formatDateIST(r.start_at) === selectedDayLabel,
  )

  const pickDate = (date: string) => {
    setSelectedDate(date)
    setSelectedSlot(null)
    setInlineError(null)
  }

  const changeParty = (delta: number) => {
    setPartySize((n) => Math.min(maxParty, Math.max(1, n + delta)))
    setSelectedSlot(null)
    setInlineError(null)
  }

  const handleReserve = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSlot) return
    setInlineError(null)
    try {
      const made = await createReservation.mutateAsync({
        start_at: selectedSlot,
        party_size: partySize,
        note: note.trim() || undefined,
      })
      toast(`Table ${made.table_label} reserved for ${formatTimeIST(made.start_at)}`, 'success')
      setSelectedSlot(null)
      setNote('')
    } catch (err: any) {
      setInlineError(err?.error?.message ?? 'Could not reserve a table.')
    }
  }

  const handleCancel = async (id: number) => {
    try {
      await cancelReservation.mutateAsync(id)
      toast('Reservation cancelled', 'success')
    } catch (err: any) {
      toast(err?.error?.message ?? 'Could not cancel the reservation.', 'error')
    }
  }

  return (
    <div className="space-y-6 pb-8">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Bar & Dining</h1>
        <p className="text-xs text-text-secondary mt-0.5">
          Browse the menu and reserve a table up to {ADVANCE_DAYS} days ahead
        </p>
      </div>

      {/* ── Tier discount banner ── */}
      <div
        className={`p-4 rounded-2xl border flex items-start gap-3 ${
          discountPct > 0
            ? 'bg-gradient-to-r from-amber-50 to-rose-50 border-amber-200'
            : 'bg-canvas border-border-light'
        }`}
      >
        <div className="w-10 h-10 rounded-xl bg-white shadow-soft flex items-center justify-center text-amber-600 flex-shrink-0">
          <Sparkles size={20} />
        </div>
        <div>
          {discountPct > 0 ? (
            <>
              <p className="font-bold text-sm text-text-primary">
                {tier} member · {discountPct}% off food & drinks
              </p>
              <p className="text-xs text-text-secondary mt-0.5">
                Your discount is applied automatically when bar staff link the order to your membership.
              </p>
            </>
          ) : (
            <>
              <p className="font-bold text-sm text-text-primary">Walk-in prices</p>
              <p className="text-xs text-text-secondary mt-0.5">
                Members save at the bar: Gold 15%, Junior 10%, Silver 5%. Ask the front desk about a plan.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── Menu ── */}
        <div className="lg:col-span-3 space-y-3">
          <SectionHeader title="Menu" />
          <Card className="p-3">
            <PillTabs tabs={CATEGORY_TABS} activeId={category} onChange={setCategory} />
          </Card>

          {menuLoading ? (
            <Card className="p-6 text-center text-xs text-text-tertiary animate-pulse">Loading menu...</Card>
          ) : visibleItems.length === 0 ? (
            <Card className="p-6 text-center text-xs text-text-tertiary">Nothing on the menu here right now.</Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {visibleItems.map((item) => {
                const Icon = CATEGORY_ICONS[item.category] ?? UtensilsCrossed
                const discounted = item.member_price_paise < item.price_paise
                return (
                  <Card key={item.id} className="p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center flex-shrink-0">
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-text-primary truncate">{item.name}</p>
                      <p className="text-[10px] uppercase tracking-wider text-text-tertiary">{item.category}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {discounted && (
                        <p className="text-[11px] text-text-tertiary line-through">{formatMoney(item.price_paise)}</p>
                      )}
                      <p className={`font-extrabold text-sm ${discounted ? 'text-accent-green' : 'text-text-primary'}`}>
                        {formatMoney(item.member_price_paise)}
                      </p>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Reserve + my reservations ── */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleReserve} className="space-y-3">
            <SectionHeader title="Reserve a Table" />
            <Card className="p-4 space-y-4">
              <div className="overflow-x-auto pb-1 scrollbar-none">
                <div className="flex items-center gap-2 min-w-max">
                  {dates.map((d) => {
                    const isSelected = d.date === selectedDate
                    return (
                      <button
                        key={d.date}
                        type="button"
                        onClick={() => pickDate(d.date)}
                        className={`flex flex-col items-center justify-center w-14 py-2.5 rounded-2xl border transition-all touch-target ${
                          isSelected
                            ? 'bg-primary-500 border-primary-500 text-white shadow-pill font-bold'
                            : 'bg-surface border-border-light hover:border-primary-300 text-text-secondary'
                        }`}
                      >
                        <span className={`text-[10px] uppercase font-semibold ${isSelected ? 'text-white/80' : 'text-text-tertiary'}`}>
                          {d.dayName}
                        </span>
                        <span className="text-base font-extrabold">{d.dayNumber}</span>
                        {d.isToday && (
                          <span className={`text-[9px] font-bold ${isSelected ? 'text-white' : 'text-primary-600'}`}>Today</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
                  <Users size={14} /> Guests
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => changeParty(-1)}
                    disabled={partySize <= 1}
                    className="w-8 h-8 rounded-lg border border-border-light flex items-center justify-center disabled:opacity-40"
                    aria-label="Fewer guests"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-6 text-center font-bold text-sm">{partySize}</span>
                  <button
                    type="button"
                    onClick={() => changeParty(1)}
                    disabled={partySize >= maxParty}
                    className="w-8 h-8 rounded-lg border border-border-light flex items-center justify-center disabled:opacity-40"
                    aria-label="More guests"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-text-secondary mb-2">
                  Start time · {availability?.sitting_minutes ?? 120} min sitting
                </p>
                {slotsLoading ? (
                  <p className="text-xs text-text-tertiary animate-pulse">Checking tables...</p>
                ) : !availability?.slots.some((s) => s.available) ? (
                  <p className="text-xs text-text-tertiary">No tables left on this day. Try another date.</p>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {availability.slots.map((slot) => {
                      const isSelected = slot.start_at === selectedSlot
                      return (
                        <button
                          key={slot.start_at}
                          type="button"
                          disabled={!slot.available}
                          onClick={() => {
                            setSelectedSlot(slot.start_at)
                            setInlineError(null)
                          }}
                          className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                            isSelected
                              ? 'bg-primary-500 border-primary-500 text-white'
                              : slot.available
                              ? 'bg-surface border-border-light hover:border-primary-300 text-text-primary'
                              : 'bg-canvas border-transparent text-text-tertiary line-through cursor-not-allowed'
                          }`}
                        >
                          {formatTimeIST(slot.start_at)}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <input
                type="text"
                value={note}
                maxLength={200}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note for the bar (optional), e.g. birthday, window seat"
                className="w-full h-10 px-3 rounded-xl border border-border-light bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
              />

              {reservedOnSelectedDate && (
                <p className="text-[11px] text-amber-700 flex items-center gap-1.5">
                  <AlertTriangle size={12} /> You already have a table on this day (limit 1 per day).
                </p>
              )}
              {inlineError && (
                <p className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">{inlineError}</p>
              )}

              <Button
                type="submit"
                className="w-full touch-target"
                icon={CalendarCheck}
                disabled={!selectedSlot}
                loading={createReservation.isPending}
              >
                {selectedSlot
                  ? `Reserve for ${partySize} at ${formatTimeIST(selectedSlot)}`
                  : 'Pick a time'}
              </Button>
            </Card>
          </form>

          <div className="space-y-3">
            <SectionHeader title="My Reservations" />
            {reservationsLoading ? (
              <Card className="p-6 text-center text-xs text-text-tertiary animate-pulse">Loading...</Card>
            ) : reservations.length === 0 ? (
              <Card className="p-6 text-center text-xs text-text-tertiary">No upcoming reservations.</Card>
            ) : (
              reservations.map((r) => (
                <Card key={r.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center flex-shrink-0">
                      <Clock size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-text-primary">
                        {formatDateIST(r.start_at)} · {formatTimeIST(r.start_at)}
                      </p>
                      <p className="text-xs text-text-secondary mt-0.5 truncate">
                        Table {r.table_label} · {r.party_size} guests{r.note ? ` · ${r.note}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <StatusChip label={r.status.replace('_', ' ')} variant={STATUS_VARIANTS[r.status]} />
                    {r.status === 'CONFIRMED' && new Date(r.start_at) > new Date() && (
                      <button
                        type="button"
                        onClick={() => handleCancel(r.id)}
                        disabled={cancelReservation.isPending}
                        className="text-[11px] font-semibold text-accent-red flex items-center gap-1 hover:underline"
                      >
                        <XCircle size={12} /> Cancel
                      </button>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
