import React, { useState, useMemo } from 'react'
import type { Court, Sport, SlotState, Tier, CourtSlotAvailability } from '../../api/types'
import { useCourtAvailability, useBookings } from '../../api/hooks'
import { formatTimeIST, getTodayIST, istToUtcIso } from '../../lib/format'
import { StatusChip } from '../ui/StatusChip'
import { Avatar } from '../ui/Avatar'
import { Skeleton } from '../ui/Skeleton'
import { cn } from '../../lib/utils'

export interface CourtScheduleGridProps {
  selectedDate: string
  sportFilter?: Sport | 'ALL'
  onSelectSlot?: (courtId: number, courtName: string, sport: Sport, startAt: string) => void
  onSelectBooking?: (bookingId: number) => void
}

export function CourtScheduleGrid({
  selectedDate,
  sportFilter,
  onSelectSlot,
  onSelectBooking,
}: CourtScheduleGridProps) {
  const [viewMode, setViewMode] = useState<'day' | '7day'>('day')
  const [active7DayCourtId, setActive7DayCourtId] = useState<number>(1)

  const activeSport = sportFilter === 'ALL' ? undefined : sportFilter
  const { data: dayAvailability, isLoading, isError } = useCourtAvailability(selectedDate, activeSport)
  const { data: allBookings } = useBookings({ date: selectedDate })

  // 7-day overview date range
  const sevenDays = useMemo(() => {
    const list: string[] = []
    const [y, m, d] = selectedDate.split('-').map(Number)
    for (let i = 0; i < 7; i++) {
      const dt = new Date(Date.UTC(y, m - 1, d + i))
      list.push(dt.toISOString().split('T')[0])
    }
    return list
  }, [selectedDate])

  const todayStr = getTodayIST()
  const isToday = selectedDate === todayStr

  // Current time marker calculation (e.g. 10:15 IST)
  const currentNowSlotIndex = useMemo(() => {
    if (!isToday) return -1
    const now = new Date()
    // Convert to IST hours & minutes
    const istHours = (now.getUTCHours() + 5 + Math.floor((now.getUTCMinutes() + 30) / 60)) % 24
    const istMinutes = (now.getUTCMinutes() + 30) % 60
    if (istHours < 6 || istHours >= 21) return -1
    const totalHalfHours = (istHours - 6) * 2 + (istMinutes >= 30 ? 1 : 0)
    return totalHalfHours
  }, [isToday])

  // 30-min slot time headers from 06:00 to 20:30 (30 slots)
  const timeHeaders = useMemo(() => {
    const list: { label: string; timeStr: string }[] = []
    for (let h = 6; h <= 20; h++) {
      const hh = String(h).padStart(2, '0')
      list.push({ label: `${h}:00`, timeStr: `${hh}:00` })
      if (h < 21) {
        list.push({ label: `${h}:30`, timeStr: `${hh}:30` })
      }
    }
    return list
  }, [])

  if (isLoading) {
    return (
      <div className="space-y-3 p-4 bg-surface rounded-card shadow-soft">
        <div className="flex justify-between items-center mb-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-9 w-32 rounded-pill" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !dayAvailability) {
    return (
      <div className="p-8 text-center bg-surface rounded-card shadow-soft border border-status-error/30">
        <p className="text-sm font-semibold text-status-error-text mb-1">Failed to load schedule</p>
        <p className="text-xs text-text-secondary">Please check connection or retry</p>
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-card shadow-soft border border-border-light overflow-hidden">
      {/* Controls & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-border-light bg-canvas/30">
        <div className="flex items-center gap-4 text-xs font-medium text-text-secondary">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md border border-border bg-surface" /> Free slot
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-primary-100 border border-primary-300" /> Booked
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-accent-purple/30 border border-accent-purple" /> Social Play
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md pattern-hatch bg-canvas border border-border" /> Past / Closed
          </span>
        </div>

        {/* 1-Day vs 7-Day Toggle */}
        <div className="flex items-center p-0.5 bg-canvas rounded-pill border border-border-light">
          <button
            type="button"
            onClick={() => setViewMode('day')}
            className={cn(
              'px-3 py-1 text-xs font-semibold rounded-pill transition-colors touch-target',
              viewMode === 'day' ? 'bg-surface text-primary shadow-pill' : 'text-text-secondary hover:text-text-primary'
            )}
          >
            Day View
          </button>
          <button
            type="button"
            onClick={() => setViewMode('7day')}
            className={cn(
              'px-3 py-1 text-xs font-semibold rounded-pill transition-colors touch-target',
              viewMode === '7day' ? 'bg-surface text-primary shadow-pill' : 'text-text-secondary hover:text-text-primary'
            )}
          >
            7-Day Overview
          </button>
        </div>
      </div>

      {/* 7-Day Court Selector Tab Strip */}
      {viewMode === '7day' && (
        <div className="flex items-center gap-2 p-3 bg-canvas/20 border-b border-border-light overflow-x-auto scrollbar-hide">
          <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider pl-1">Court:</span>
          {dayAvailability.courts.map((c) => (
            <button
              key={c.court_id}
              onClick={() => setActive7DayCourtId(c.court_id)}
              className={cn(
                'px-3 py-1 rounded-pill text-xs font-medium transition-colors whitespace-nowrap touch-target',
                active7DayCourtId === c.court_id
                  ? 'bg-primary-50 text-primary-600 font-semibold border border-primary-200'
                  : 'bg-surface text-text-secondary hover:bg-canvas border border-border-light'
              )}
            >
              {c.name} ({c.sport})
            </button>
          ))}
        </div>
      )}

      {/* Main Schedule Matrix (Horizontal scroll stays inside) */}
      <div className="overflow-x-auto relative">
        <div className="inline-block min-w-full align-middle">
          {viewMode === 'day' ? (
            /* Day View: Rows = Courts, Columns = 30-min slots */
            <table className="min-w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border-light bg-canvas/40">
                  <th className="sticky left-0 z-20 bg-canvas/90 backdrop-blur-sm p-3 w-44 min-w-[176px] text-xs font-bold text-text-primary uppercase tracking-wider border-r border-border-light">
                    Court
                  </th>
                  {timeHeaders.map((t, idx) => (
                    <th
                      key={t.timeStr}
                      className={cn(
                        'p-2 text-center text-[11px] font-semibold text-text-secondary border-r border-border-light min-w-[90px]',
                        idx === currentNowSlotIndex && 'bg-primary-50/60'
                      )}
                    >
                      {t.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {dayAvailability.courts.map((court) => (
                  <tr key={court.court_id} className="hover:bg-canvas/10 transition-colors">
                    {/* Sticky Court Column */}
                    <td className="sticky left-0 z-10 bg-surface p-3 font-semibold text-sm text-text-primary border-r border-border-light whitespace-nowrap shadow-[2px_0_6px_-2px_rgba(0,0,0,0.05)]">
                      <div className="flex flex-col">
                        <span className="font-bold">{court.name}</span>
                        <span className="text-[10px] text-text-tertiary font-normal uppercase tracking-wide">
                          {court.sport}
                        </span>
                      </div>
                    </td>

                    {/* Slot Cells */}
                    {court.slots.map((slot, sIdx) => {
                      const isPast = isToday && sIdx < currentNowSlotIndex
                      const isNowSlot = isToday && sIdx === currentNowSlotIndex

                      return (
                        <td
                          key={slot.start_at}
                          className={cn(
                            'p-1 text-center border-r border-border-light relative h-16 min-w-[90px]',
                            isNowSlot && 'border-l-2 border-dashed border-primary-500'
                          )}
                        >
                          {slot.state === 'BOOKED' ? (
                            <button
                              type="button"
                              onClick={() => slot.booking_id && onSelectBooking?.(slot.booking_id)}
                              className="w-full h-full p-1.5 rounded-xl bg-primary-100 hover:bg-primary-200/80 border border-primary-300 text-left flex flex-col justify-between transition-colors shadow-soft overflow-hidden group touch-target"
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[10px] font-bold text-primary-900 truncate">
                                  {slot.member_name ?? slot.guest_name ?? 'Booked'}
                                </span>
                                {slot.member_tier && (
                                  <span className="text-[9px] font-semibold text-primary-700 uppercase">
                                    {slot.member_tier[0]}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 text-[9px] text-primary-700">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
                                <span>1 Hour</span>
                              </div>
                            </button>
                          ) : slot.state === 'SOCIAL' ? (
                            <div className="w-full h-full p-1.5 rounded-xl bg-accent-purple/20 border border-accent-purple/40 text-left flex flex-col justify-between">
                              <span className="text-[10px] font-bold text-accent-purple">Social Play</span>
                              <span className="text-[9px] text-accent-purple/80">Drop-in</span>
                            </div>
                          ) : isPast ? (
                            <div className="w-full h-full rounded-xl pattern-hatch bg-canvas/60 flex items-center justify-center opacity-70 cursor-not-allowed">
                              <span className="text-[9px] text-text-tertiary font-medium">Closed</span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onSelectSlot?.(court.court_id, court.name, court.sport, slot.start_at)}
                              className="w-full h-full rounded-xl border border-dashed border-border-light hover:border-primary-400 hover:bg-primary-50/40 flex flex-col items-center justify-center transition-colors group touch-target"
                              title={`Book ${court.name} at ${formatTimeIST(slot.start_at)}`}
                            >
                              <span className="text-[11px] text-text-tertiary group-hover:text-primary-600 font-medium">
                                +
                              </span>
                              <span className="text-[9px] text-text-tertiary group-hover:text-primary-600 font-normal">
                                Free
                              </span>
                            </button>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            /* 7-Day View: Rows = Next 7 Days, Columns = 30-min slots for active court */
            <table className="min-w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border-light bg-canvas/40">
                  <th className="sticky left-0 z-20 bg-canvas/90 backdrop-blur-sm p-3 w-44 min-w-[176px] text-xs font-bold text-text-primary uppercase tracking-wider border-r border-border-light">
                    Date
                  </th>
                  {timeHeaders.map((t) => (
                    <th
                      key={t.timeStr}
                      className="p-2 text-center text-[11px] font-semibold text-text-secondary border-r border-border-light min-w-[90px]"
                    >
                      {t.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {sevenDays.map((dStr) => {
                  const isDayToday = dStr === todayStr
                  const dateObj = new Date(dStr)
                  const dayName = dateObj.toLocaleDateString('en-IN', { weekday: 'short' })
                  const dayNum = dateObj.getDate()

                  return (
                    <tr key={dStr} className="hover:bg-canvas/10 transition-colors">
                      <td className="sticky left-0 z-10 bg-surface p-3 font-semibold text-sm text-text-primary border-r border-border-light whitespace-nowrap shadow-[2px_0_6px_-2px_rgba(0,0,0,0.05)]">
                        <div className="flex items-center gap-2">
                          <span className={cn('px-2 py-0.5 rounded-lg text-xs font-bold', isDayToday ? 'bg-primary-500 text-white' : 'bg-canvas text-text-primary')}>
                            {dayName} {dayNum}
                          </span>
                          {isDayToday && <span className="text-[10px] text-primary-600 font-bold">TODAY</span>}
                        </div>
                      </td>

                      {/* Display slots for this day */}
                      {timeHeaders.map((t) => {
                        const slotIso = istToUtcIso(dStr, t.timeStr)
                        const booking = allBookings?.find(
                          (b) =>
                            b.court_id === active7DayCourtId &&
                            b.status !== 'CANCELLED' &&
                            new Date(slotIso).getTime() >= new Date(b.start_at).getTime() &&
                            new Date(slotIso).getTime() < new Date(b.end_at).getTime()
                        )

                        return (
                          <td key={t.timeStr} className="p-1 text-center border-r border-border-light h-14 min-w-[90px]">
                            {booking ? (
                              <button
                                type="button"
                                onClick={() => onSelectBooking?.(booking.id)}
                                className="w-full h-full p-1 rounded-xl bg-primary-100 border border-primary-200 text-left flex flex-col justify-center text-[10px] font-bold text-primary-900 truncate hover:bg-primary-200 transition-colors touch-target"
                              >
                                {booking.member_id ? `Member #${booking.member_id}` : (booking.guest_name ?? 'Booked')}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  const c = dayAvailability.courts.find((item) => item.court_id === active7DayCourtId)
                                  if (c) onSelectSlot?.(c.court_id, c.name, c.sport, slotIso)
                                }}
                                className="w-full h-full rounded-xl border border-dashed border-border-light hover:border-primary-400 hover:bg-primary-50/40 flex items-center justify-center text-[10px] text-text-tertiary group-hover:text-primary transition-colors touch-target"
                              >
                                +
                              </button>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
