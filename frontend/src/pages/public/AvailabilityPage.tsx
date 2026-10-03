import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Calendar,
  Clock,
  LogIn,
  AlertTriangle,
  ChevronRight,
  Sparkles,
  Info,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { Button, Card, Skeleton } from '../../components/ui'
import { usePublicAvailability } from '../../api/hooks'
import { getTodayIST, formatTimeIST, formatDateIST } from '../../lib/format'
import type { Sport } from '../../api/types'

const SPORTS_FILTER: { id: 'ALL' | Sport; label: string }[] = [
  { id: 'ALL', label: 'All Sports' },
  { id: 'TENNIS', label: 'Tennis' },
  { id: 'PADEL', label: 'Padel' },
  { id: 'BADMINTON', label: 'Badminton' },
  { id: 'CRICKET_NET', label: 'Cricket Net' },
]

export default function AvailabilityPage() {
  const navigate = useNavigate()
  const todayStr = useMemo(() => getTodayIST(), [])

  const [selectedSport, setSelectedSport] = useState<'ALL' | Sport>('ALL')
  const [selectedDate, setSelectedDate] = useState<string>(todayStr)

  // 7-day strip generation
  const next7Days = useMemo(() => {
    const list: { dateStr: string; dayLabel: string; dateNum: string; isToday: boolean }[] = []
    const base = new Date(todayStr + 'T00:00:00')

    for (let i = 0; i < 7; i++) {
      const d = new Date(base)
      d.setDate(base.getDate() + i)
      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      const dateStr = `${yyyy}-${mm}-${dd}`

      const dayLabel = d.toLocaleDateString('en-IN', { weekday: 'short' })
      const dateNum = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })

      list.push({
        dateStr,
        dayLabel: i === 0 ? 'Today' : dayLabel,
        dateNum,
        isToday: i === 0,
      })
    }
    return list
  }, [todayStr])

  const {
    data: availability,
    isLoading,
    isError,
    refetch,
  } = usePublicAvailability({
    from: selectedDate,
    days: 1,
    sport: selectedSport === 'ALL' ? undefined : selectedSport,
  })

  // Filter slots for the selected date
  const courtsWithDaySlots = useMemo(() => {
    if (!availability?.courts) return []
    return availability.courts.map((court) => {
      const daySlots = court.slots.filter((s) => s.start_at.startsWith(selectedDate))
      return {
        ...court,
        slots: daySlots,
      }
    })
  }, [availability, selectedDate])

  const handleSlotClick = () => {
    navigate('/login')
  }

  return (
    <div className="space-y-8 pb-12">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-50 border border-primary-200 text-primary-600 text-xs font-bold shadow-soft mb-2">
            <Calendar size={14} />
            <span>Real-time Court Availability (SRS §3.2.4)</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-text-primary">
            Public Court Schedule
          </h1>
          <p className="text-xs sm:text-sm text-text-secondary mt-1">
            Check free court slots across all sports. Log in to book online with instant confirmation.
          </p>
        </div>

        <Button
          variant="primary"
          pill
          onClick={() => navigate('/login')}
          iconRight={LogIn}
          className="text-xs font-bold self-start md:self-auto min-h-[44px] px-5"
        >
          Log in to Book
        </Button>
      </div>

      {/* ── 7-Day Date Selector Strip ────────────────────────────────────── */}
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-wider text-text-secondary block">
          Select Date (Next 7 Days)
        </label>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {next7Days.map((item) => {
            const isSelected = selectedDate === item.dateStr
            return (
              <button
                key={item.dateStr}
                onClick={() => setSelectedDate(item.dateStr)}
                className={`p-2.5 sm:p-3 rounded-2xl border text-center transition-all touch-manipulation min-h-[56px] flex flex-col items-center justify-center ${
                  isSelected
                    ? 'bg-primary-500 text-white font-bold border-primary-500 shadow-pill ring-2 ring-primary-500/20'
                    : 'bg-surface hover:bg-canvas text-text-primary border-border-light'
                }`}
              >
                <span className={`text-[11px] font-semibold ${isSelected ? 'text-white/90' : 'text-text-tertiary'}`}>
                  {item.dayLabel}
                </span>
                <span className="text-xs sm:text-sm font-extrabold mt-0.5">
                  {item.dateNum}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Sport Filter Chips ───────────────────────────────────────────── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {SPORTS_FILTER.map((sport) => {
          const isSelected = selectedSport === sport.id
          return (
            <button
              key={sport.id}
              onClick={() => setSelectedSport(sport.id)}
              className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all touch-manipulation min-h-[44px] ${
                isSelected
                  ? 'bg-primary-500 text-white font-bold shadow-pill'
                  : 'bg-surface hover:bg-canvas text-text-secondary border border-border-light'
              }`}
            >
              {sport.label}
            </button>
          )
        })}
      </div>

      {/* ── Schedule Legend & Privacy Notice (S-15) ──────────────────────── */}
      <div className="p-4 bg-surface rounded-2xl border border-border-light flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-md bg-accent-green" />
            <span className="font-semibold text-text-primary">Available (FREE)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-md bg-canvas border border-border-light" />
            <span className="font-semibold text-text-tertiary">Occupied (BUSY)</span>
          </div>
        </div>

        <div className="text-[11px] text-text-secondary flex items-center gap-1.5">
          <Info size={14} className="text-text-tertiary shrink-0" />
          <span>Member privacy protected: schedules show availability only.</span>
        </div>
      </div>

      {/* ── Courts & Slots Grid ──────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="p-5 bg-surface rounded-2xl border border-border-light space-y-3">
              <Skeleton className="w-40 h-5 rounded" />
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {[...Array(8)].map((_, j) => (
                  <Skeleton key={j} className="w-full h-10 rounded-xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <Card className="p-8 text-center space-y-3">
          <AlertTriangle className="mx-auto text-status-error" size={32} />
          <h3 className="font-bold text-text-primary">Failed to load schedule</h3>
          <p className="text-xs text-text-secondary">Could not fetch public court availability.</p>
          <Button variant="secondary" onClick={() => refetch()}>
            Retry
          </Button>
        </Card>
      ) : courtsWithDaySlots.length === 0 ? (
        <Card className="p-8 text-center text-xs text-text-secondary">
          No active courts found for this sport filter.
        </Card>
      ) : (
        <div className="space-y-4">
          {courtsWithDaySlots.map((court) => {
            const freeCount = court.slots.filter((s) => s.state === 'FREE').length

            return (
              <Card key={court.court_id} className="p-5 border-border-light space-y-4 shadow-card">
                {/* Court Header */}
                <div className="flex items-center justify-between pb-3 border-b border-border-light">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-primary-500" />
                    <h3 className="font-extrabold text-base text-text-primary">{court.name}</h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-canvas border border-border-light text-text-tertiary">
                      {court.sport}
                    </span>
                  </div>

                  <span className="text-xs font-bold text-accent-green">
                    {freeCount} free slots
                  </span>
                </div>

                {/* Slots Grid */}
                <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-8 gap-2">
                  {court.slots.map((slot, idx) => {
                    const isFree = slot.state === 'FREE'
                    const timeLabel = formatTimeIST(slot.start_at)

                    return (
                      <button
                        key={idx}
                        disabled={!isFree}
                        onClick={handleSlotClick}
                        title={isFree ? `Book ${timeLabel} on ${court.name}` : 'Slot occupied'}
                        className={`p-2 rounded-xl text-center transition-all touch-manipulation min-h-[44px] flex flex-col items-center justify-center ${
                          isFree
                            ? 'bg-status-success text-accent-green font-bold border border-accent-green/30 hover:scale-105 active:scale-95 cursor-pointer shadow-soft'
                            : 'bg-canvas text-text-tertiary border border-border-light/60 opacity-40 cursor-not-allowed'
                        }`}
                      >
                        <span className="text-xs leading-none">{timeLabel}</span>
                        <span className="text-[9px] font-semibold mt-0.5 leading-none">
                          {isFree ? 'FREE' : 'BUSY'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Booking Banner ───────────────────────────────────────────────── */}
      <section className="p-6 sm:p-8 rounded-3xl bg-primary-500 text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-raised">
        <div className="space-y-1 text-center sm:text-left">
          <h3 className="font-extrabold text-lg sm:text-xl">Want to Reserve a Court?</h3>
          <p className="text-xs text-primary-100">
            Log in with your member account to lock in your preferred slots instantly.
          </p>
        </div>

        <Button
          variant="secondary"
          pill
          onClick={() => navigate('/login')}
          className="text-xs font-bold min-h-[44px] px-6 bg-white text-primary-700 hover:bg-primary-50 whitespace-nowrap"
        >
          Sign In to Book
        </Button>
      </section>
    </div>
  )
}
