import { useMemo, useState } from 'react'
import type { ReservationStatus } from '../../api/types'
import { useReservations, useSetReservationStatus, useCancelReservation } from '../../api/hooks'
import { getTodayIST, formatTimeIST } from '../../lib/format'
import { Card, Button, StatusChip, SectionHeader, PillTabs, useToast } from '../../components/ui'
import type { ChipVariant } from '../../components/ui'
import { CalendarDays, Users, Armchair, UserX, XCircle } from 'lucide-react'

const STATUS_VARIANTS: Record<ReservationStatus, ChipVariant> = {
  CONFIRMED: 'success',
  SEATED: 'info',
  CANCELLED: 'neutral',
  NO_SHOW: 'error',
}

const FILTER_TABS = [
  { id: 'ALL', label: 'All' },
  { id: 'CONFIRMED', label: 'Confirmed' },
  { id: 'SEATED', label: 'Seated' },
  { id: 'NO_SHOW', label: 'No-show' },
  { id: 'CANCELLED', label: 'Cancelled' },
]

export default function StaffReservations() {
  const { toast } = useToast()
  const [date, setDate] = useState(getTodayIST())
  const [filter, setFilter] = useState('ALL')

  const { data: reservations = [], isLoading } = useReservations({ date })
  const setStatus = useSetReservationStatus()
  const cancel = useCancelReservation()

  const visible = useMemo(
    () => reservations.filter((r) => filter === 'ALL' || r.status === filter),
    [reservations, filter],
  )
  const expectedGuests = reservations
    .filter((r) => r.status === 'CONFIRMED' || r.status === 'SEATED')
    .reduce((sum, r) => sum + r.party_size, 0)

  const run = async (action: Promise<unknown>, done: string) => {
    try {
      await action
      toast(done, 'success')
    } catch (err: any) {
      toast(err?.error?.message ?? 'Action failed.', 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Table Reservations</h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Members' advance bookings for the bar & dining area
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
          <CalendarDays size={14} />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 px-3 rounded-xl border border-border-light bg-surface text-sm text-text-primary"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-[10px] uppercase font-semibold tracking-wider text-text-tertiary">Reservations</p>
          <p className="text-2xl font-extrabold text-text-primary">{reservations.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase font-semibold tracking-wider text-text-tertiary">Expected guests</p>
          <p className="text-2xl font-extrabold text-text-primary">{expectedGuests}</p>
        </Card>
      </div>

      <Card className="p-3 overflow-x-auto">
        <PillTabs tabs={FILTER_TABS} activeId={filter} onChange={setFilter} size="sm" />
      </Card>

      <div className="space-y-3">
        <SectionHeader title="Bookings" />
        {isLoading ? (
          <Card className="p-6 text-center text-xs text-text-tertiary animate-pulse">Loading...</Card>
        ) : visible.length === 0 ? (
          <Card className="p-6 text-center text-xs text-text-tertiary">No reservations for this day.</Card>
        ) : (
          visible.map((r) => (
            <Card key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-4 min-w-0">
                <div className="text-center flex-shrink-0 w-20">
                  <p className="font-extrabold text-sm text-text-primary">{formatTimeIST(r.start_at)}</p>
                  <p className="text-[10px] text-text-tertiary">to {formatTimeIST(r.end_at)}</p>
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm text-text-primary truncate">
                    {r.member_name ?? `Member #${r.member_id}`}{' '}
                    <span className="font-mono text-[11px] text-text-tertiary">{r.member_code}</span>
                  </p>
                  <p className="text-xs text-text-secondary mt-0.5 flex items-center gap-1.5">
                    Table {r.table_label} · <Users size={12} /> {r.party_size}
                    {r.note ? ` · ${r.note}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <StatusChip label={r.status.replace('_', ' ')} variant={STATUS_VARIANTS[r.status]} />
                {r.status === 'CONFIRMED' && (
                  <>
                    <Button
                      size="sm"
                      icon={Armchair}
                      disabled={setStatus.isPending}
                      onClick={() => run(setStatus.mutateAsync({ id: r.id, status: 'SEATED' }), 'Guests seated')}
                    >
                      Seat
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={UserX}
                      disabled={setStatus.isPending}
                      onClick={() => run(setStatus.mutateAsync({ id: r.id, status: 'NO_SHOW' }), 'Marked as no-show')}
                    >
                      No-show
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={XCircle}
                      disabled={cancel.isPending}
                      onClick={() => run(cancel.mutateAsync(r.id), 'Reservation cancelled')}
                    >
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
