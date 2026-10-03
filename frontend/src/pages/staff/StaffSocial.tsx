import React, { useMemo, useState } from 'react'
import type { SocialSession } from '../../api/types'
import {
  useCourts,
  useMembers,
  useStaffSocialSessions,
  useSocialParticipants,
  useCreateSocialSession,
  useCancelSocialSession,
} from '../../api/hooks'
import { useAuth } from '../../hooks/useAuth'
import { getTodayIST, formatDateIST, formatTimeIST, formatMoney } from '../../lib/format'
import { Card, Button, Modal, Drawer, DataTable, StatusChip, type Column, useToast } from '../../components/ui'
import { AlertTriangle, Calendar, Plus, Users, XCircle } from 'lucide-react'

const ADMIN_ROLES = ['OWNER', 'MANAGER']

/** Club hours (backend services/booking.py): starts 06:00-21:00 on the half hour. */
const START_TIMES = Array.from({ length: 31 }, (_, i) => {
  const minutes = 6 * 60 + i * 30
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${minutes % 60 ? '30' : '00'}`
})
const END_TIMES = [...START_TIMES.slice(1), '21:30']

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Plain-language text for the social-session error codes (backend services/social.py). */
function describeError(err: any): string {
  const code = err?.error?.code
  switch (code) {
    case 'SLOTS_NOT_FREE': {
      const conflicts: string[] = err?.error?.details?.conflicts ?? []
      const times = conflicts.map((c) => formatTimeIST(c)).join(', ')
      return times
        ? `That court is already booked at ${times}. Pick another court or time.`
        : 'That court already has a booking or session in this time. Pick another court or time.'
    }
    case 'INVALID_SLOT':
      return err?.error?.message ?? 'Choose a start time on the hour or half hour within club hours.'
    case 'COURT_NOT_FOUND':
      return 'That court is inactive or no longer exists.'
    case 'ALREADY_CANCELLED':
      return 'This session was already cancelled.'
    case 'FORBIDDEN':
      return 'Only owners and managers can manage social sessions.'
    case 'VALIDATION_ERROR':
      return 'Some fields are invalid. Check the title, capacity (1-100) and fee.'
    default:
      return err?.error?.message ?? 'Something went wrong. Please try again.'
  }
}

export default function StaffSocial() {
  const { user } = useAuth()
  const { toast } = useToast()
  const isAdmin = !!user && ADMIN_ROLES.includes(user.role)
  const today = getTodayIST()

  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate] = useState(() => addDays(today, 14))
  const { data: sessions = [], isLoading, error } = useStaffSocialSessions(
    { from: fromDate, to: toDate },
    { enabled: isAdmin },
  )
  const { data: courts = [] } = useCourts()
  const { data: members = [] } = useMembers()
  const memberNames = useMemo(() => new Map(members.map((m) => [m.id, m.full_name])), [members])

  const [rosterSession, setRosterSession] = useState<SocialSession | null>(null)
  const { data: participants = [], isLoading: rosterLoading, error: rosterError } = useSocialParticipants(
    rosterSession?.id ?? null,
  )
  const joined = participants.filter((p) => p.status === 'JOINED')
  const left = participants.filter((p) => p.status === 'LEFT')

  const createSession = useCreateSocialSession()
  const cancelSession = useCancelSocialSession()
  const [cancelTarget, setCancelTarget] = useState<SocialSession | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState({
    court_id: 0,
    title: '',
    date: today,
    start: '18:00',
    end: '20:00',
    capacity: 8,
    feeRupees: '0',
  })

  const openForm = () => {
    setForm((f) => ({ ...f, court_id: f.court_id || courts[0]?.id || 0, title: '', date: today }))
    setFormError(null)
    setFormOpen(true)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    const fee = parseFloat(form.feeRupees)
    if (!form.court_id) return setFormError('Choose a court.')
    if (!form.title.trim()) return setFormError('Give the session a title.')
    if (form.end <= form.start) return setFormError('The session must end after it starts.')
    if (!Number.isInteger(form.capacity) || form.capacity < 1 || form.capacity > 100)
      return setFormError('Capacity must be between 1 and 100 players.')
    if (isNaN(fee) || fee < 0) return setFormError('Enter a fee of 0 or more.')
    try {
      await createSession.mutateAsync({
        court_id: form.court_id,
        title: form.title.trim(),
        start_at: `${form.date}T${form.start}:00+05:30`,
        end_at: `${form.date}T${form.end}:00+05:30`,
        capacity: form.capacity,
        fee_paise: Math.round(fee * 100),
      })
      toast(`Session "${form.title.trim()}" created`, 'success')
      setFormOpen(false)
    } catch (err) {
      setFormError(describeError(err))
    }
  }

  const handleCancel = async () => {
    if (!cancelTarget) return
    setCancelError(null)
    try {
      await cancelSession.mutateAsync(cancelTarget.id)
      toast(`Session "${cancelTarget.title}" cancelled and its court slots released`, 'success')
      setCancelTarget(null)
    } catch (err) {
      setCancelError(describeError(err))
    }
  }

  const columns: Column<SocialSession>[] = [
    {
      key: 'when',
      header: 'When (IST)',
      render: (s) => (
        <div className="whitespace-nowrap">
          <p className="text-xs font-semibold text-text-primary">{formatDateIST(s.start_at)}</p>
          <p className="text-[11px] text-text-secondary">
            {formatTimeIST(s.start_at)} – {formatTimeIST(s.end_at)}
          </p>
        </div>
      ),
    },
    {
      key: 'title',
      header: 'Session',
      render: (s) => (
        <div>
          <p className="text-xs font-bold text-text-primary">{s.title}</p>
          <p className="text-[11px] text-text-secondary">
            {s.court_name} · {s.sport.charAt(0) + s.sport.slice(1).toLowerCase()}
          </p>
        </div>
      ),
    },
    {
      key: 'spots',
      header: 'Players',
      render: (s) => (
        <span className="text-xs font-semibold text-text-primary">
          {s.joined_count} / {s.capacity}
        </span>
      ),
    },
    {
      key: 'fee',
      header: 'Fee',
      render: (s) => (
        <span className="text-xs text-text-secondary">{s.fee_paise ? formatMoney(s.fee_paise) : 'Free'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (s) =>
        s.status === 'CANCELLED' ? (
          <StatusChip label="Cancelled" variant="error" />
        ) : s.joined_count >= s.capacity ? (
          <StatusChip label="Full" variant="warning" />
        ) : (
          <StatusChip label="Open" variant="success" />
        ),
    },
    {
      key: 'actions',
      header: '',
      render: (s) => (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" icon={Users} onClick={() => setRosterSession(s)}>
            Players
          </Button>
          {s.status !== 'CANCELLED' && new Date(s.start_at).getTime() > Date.now() && (
            <Button
              variant="secondary"
              size="sm"
              icon={XCircle}
              onClick={() => {
                setCancelError(null)
                setCancelTarget(s)
              }}
              className="text-ink hover:bg-status-error hover:border-status-error-accent"
            >
              Cancel
            </Button>
          )}
        </div>
      ),
    },
  ]

  const inputClass =
    'w-full px-3 py-2 rounded-xl border border-border-light bg-canvas text-xs text-text-primary focus:outline-none focus:border-primary-500 focus:bg-surface'

  if (!isAdmin) {
    return (
      <Card className="p-6 text-center text-sm text-text-secondary flex flex-col items-center gap-2">
        <AlertTriangle size={20} className="text-accent-red" />
        Only owners and managers can manage social sessions.
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Social Play</h1>
          <p className="text-sm text-text-secondary mt-1">
            Open sessions members can join; creating one reserves its court slots
          </p>
        </div>
        <Button variant="primary" icon={Plus} onClick={openForm} className="touch-target">
          New session
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-text-secondary mr-1 flex items-center gap-1">
            <Calendar size={14} /> Dates
          </span>
          <input
            type="date"
            value={fromDate}
            max={toDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl border border-border-light bg-canvas text-xs text-text-primary"
          />
          <span className="text-xs text-text-tertiary">to</span>
          <input
            type="date"
            value={toDate}
            min={fromDate}
            onChange={(e) => setToDate(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl border border-border-light bg-canvas text-xs text-text-primary"
          />
        </div>
      </Card>

      {error ? (
        <Card className="p-6 text-center text-sm text-text-secondary flex flex-col items-center gap-2">
          <AlertTriangle size={20} className="text-accent-red" />
          {describeError(error)}
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <DataTable
            columns={columns}
            data={sessions}
            keyExtractor={(s) => s.id}
            emptyMessage={isLoading ? 'Loading sessions...' : 'No social sessions in these dates'}
          />
        </Card>
      )}

      {/* Roster */}
      <Drawer
        open={!!rosterSession}
        onClose={() => setRosterSession(null)}
        side="right"
        title={rosterSession ? `Players · ${rosterSession.title}` : 'Players'}
      >
        {rosterSession && (
          <div className="space-y-4">
            <div className="p-3 rounded-2xl bg-canvas border border-border-light text-xs space-y-1">
              <p className="font-semibold text-text-primary">
                {formatDateIST(rosterSession.start_at)} · {formatTimeIST(rosterSession.start_at)} –{' '}
                {formatTimeIST(rosterSession.end_at)}
              </p>
              <p className="text-text-secondary">
                {rosterSession.court_name} · {rosterSession.joined_count} of {rosterSession.capacity} spots taken
              </p>
            </div>
            {rosterError ? (
              <p className="text-xs text-accent-red">{describeError(rosterError)}</p>
            ) : rosterLoading ? (
              <p className="text-xs text-text-tertiary">Loading players...</p>
            ) : joined.length === 0 ? (
              <p className="text-xs text-text-tertiary text-center py-6">Nobody has joined yet</p>
            ) : (
              <ul className="divide-y divide-border-light">
                {joined.map((p) => (
                  <li key={p.id} className="py-2.5 flex items-center justify-between text-xs">
                    <span className="font-semibold text-text-primary">
                      {p.member_id
                        ? memberNames.get(p.member_id) ?? `Member #${p.member_id}`
                        : `${p.guest_name ?? 'Guest'} (guest)`}
                    </span>
                    <span className="text-text-secondary">{p.fee_paise ? formatMoney(p.fee_paise) : 'Free'}</span>
                  </li>
                ))}
              </ul>
            )}
            {left.length > 0 && (
              <p className="text-[11px] text-text-tertiary">{left.length} player(s) joined and later left.</p>
            )}
          </div>
        )}
      </Drawer>

      {/* Create */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="New social session">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1">Title *</label>
            <input
              type="text"
              value={form.title}
              maxLength={100}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Friday Night Padel Mixer"
              className={inputClass}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1">Court *</label>
              <select
                value={form.court_id}
                onChange={(e) => setForm({ ...form, court_id: Number(e.target.value) })}
                className={inputClass}
              >
                {courts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.sport.charAt(0) + c.sport.slice(1).toLowerCase()})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1">Date *</label>
              <input
                type="date"
                value={form.date}
                min={today}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1">Starts (IST) *</label>
              <select value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className={inputClass}>
                {START_TIMES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1">Ends (IST) *</label>
              <select value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className={inputClass}>
                {END_TIMES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1">Capacity *</label>
              <input
                type="number"
                min={1}
                max={100}
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: parseInt(e.target.value, 10) || 0 })}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1">Fee per player (₹)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.feeRupees}
                onChange={(e) => setForm({ ...form, feeRupees: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          {formError && (
            <div role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-status-error text-xs text-status-error-text">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-light">
            <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>
              Close
            </Button>
            <Button type="submit" variant="primary" loading={createSession.isPending}>
              Create session
            </Button>
          </div>
        </form>
      </Modal>

      {/* Cancel */}
      <Modal open={!!cancelTarget} onClose={() => setCancelTarget(null)} title="Cancel session" size="sm">
        <div className="space-y-4">
          <p className="text-xs text-text-secondary">
            Cancel <span className="font-bold text-text-primary">{cancelTarget?.title}</span>? Its court slots are
            released for bookings and every player who paid is refunded. This cannot be undone.
          </p>
          {cancelError && <p className="text-xs text-accent-red">{cancelError}</p>}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-light">
            <Button type="button" variant="ghost" onClick={() => setCancelTarget(null)}>
              Keep session
            </Button>
            <Button type="button" variant="danger" loading={cancelSession.isPending} onClick={handleCancel}>
              Cancel session
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
