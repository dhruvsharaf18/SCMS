import React, { useState } from 'react'
import type { Court, Sport } from '../../api/types'
import { useAllCourts, useCreateCourt, useUpdateCourt } from '../../api/hooks'
import { useAuth } from '../../hooks/useAuth'
import { Card, Button, Modal, DataTable, StatusChip, type Column, useToast } from '../../components/ui'
import { AlertTriangle, Pencil, Plus, Power } from 'lucide-react'

const ADMIN_ROLES = ['OWNER', 'MANAGER']

const SPORTS: { id: Sport; label: string }[] = [
  { id: 'TENNIS', label: 'Tennis' },
  { id: 'PADEL', label: 'Padel' },
  { id: 'BADMINTON', label: 'Badminton' },
  { id: 'CRICKET_NET', label: 'Cricket net' },
]

const sportLabel = (sport: Sport) => SPORTS.find((s) => s.id === sport)?.label ?? sport

function describeError(err: any): string {
  switch (err?.error?.code) {
    case 'COURT_EXISTS':
      return 'A court with that name already exists. Choose a different name.'
    case 'COURT_HAS_BOOKINGS': {
      const count = (err?.error?.details?.booking_ids ?? []).length
      return count
        ? `This court has ${count} upcoming booking(s). Cancel them before deactivating the court.`
        : 'This court has upcoming bookings. Cancel them before deactivating the court.'
    }
    case 'COURT_NOT_FOUND':
      return 'That court no longer exists. Refresh the page.'
    case 'FORBIDDEN':
      return 'Only owners and managers can manage courts.'
    case 'VALIDATION_ERROR':
      return 'Enter a name of 1-50 characters and pick a sport.'
    default:
      return err?.error?.message ?? 'Something went wrong. Please try again.'
  }
}

export default function StaffCourts() {
  const { user } = useAuth()
  const { toast } = useToast()
  const isAdmin = !!user && ADMIN_ROLES.includes(user.role)

  const { data: courts = [], isLoading, error } = useAllCourts({ enabled: isAdmin })
  const createCourt = useCreateCourt()
  const updateCourt = useUpdateCourt()

  const [editing, setEditing] = useState<Court | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [name, setName] = useState('')
  const [sport, setSport] = useState<Sport>('TENNIS')
  const [formError, setFormError] = useState<string | null>(null)
  const [toggleTarget, setToggleTarget] = useState<Court | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)

  const openCreate = () => {
    setEditing(null)
    setName('')
    setSport('TENNIS')
    setFormError(null)
    setFormOpen(true)
  }

  const openEdit = (court: Court) => {
    setEditing(court)
    setName(court.name)
    setSport(court.sport)
    setFormError(null)
    setFormOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    const trimmed = name.trim()
    if (!trimmed) return setFormError('Enter a court name.')
    try {
      if (editing) {
        const changes: { name?: string; sport?: Sport } = {}
        if (trimmed !== editing.name) changes.name = trimmed
        if (sport !== editing.sport) changes.sport = sport
        if (Object.keys(changes).length > 0) await updateCourt.mutateAsync({ id: editing.id, changes })
        toast(`Saved ${trimmed}`, 'success')
      } else {
        await createCourt.mutateAsync({ name: trimmed, sport })
        toast(`Added ${trimmed}`, 'success')
      }
      setFormOpen(false)
    } catch (err) {
      setFormError(describeError(err))
    }
  }

  const handleToggle = async () => {
    if (!toggleTarget) return
    setToggleError(null)
    try {
      await updateCourt.mutateAsync({ id: toggleTarget.id, changes: { is_active: !toggleTarget.is_active } })
      toast(`${toggleTarget.name} ${toggleTarget.is_active ? 'deactivated' : 'reactivated'}`, 'success')
      setToggleTarget(null)
    } catch (err) {
      setToggleError(describeError(err))
    }
  }

  const columns: Column<Court>[] = [
    {
      key: 'name',
      header: 'Court',
      render: (c) => <span className="text-xs font-bold text-text-primary">{c.name}</span>,
    },
    {
      key: 'sport',
      header: 'Sport',
      render: (c) => <span className="text-xs text-text-secondary">{sportLabel(c.sport)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => (
        <StatusChip label={c.is_active ? 'Active' : 'Inactive'} variant={c.is_active ? 'success' : 'neutral'} />
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (c) => (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" icon={Pencil} onClick={() => openEdit(c)}>
            Edit
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={Power}
            onClick={() => {
              setToggleError(null)
              setToggleTarget(c)
            }}
            className={c.is_active ? 'text-accent-red hover:bg-rose-50 hover:border-rose-200' : undefined}
          >
            {c.is_active ? 'Deactivate' : 'Reactivate'}
          </Button>
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
        Only owners and managers can manage courts.
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Courts</h1>
          <p className="text-sm text-text-secondary mt-1">
            Inactive courts disappear from booking and availability; their history is kept
          </p>
        </div>
        <Button variant="primary" icon={Plus} onClick={openCreate} className="touch-target">
          Add court
        </Button>
      </div>

      {error ? (
        <Card className="p-6 text-center text-sm text-text-secondary flex flex-col items-center gap-2">
          <AlertTriangle size={20} className="text-accent-red" />
          {describeError(error)}
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <DataTable
            columns={columns}
            data={courts}
            keyExtractor={(c) => c.id}
            emptyMessage={isLoading ? 'Loading courts...' : 'No courts yet'}
          />
        </Card>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? `Edit ${editing.name}` : 'Add court'} size="sm">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1">Name *</label>
            <input
              type="text"
              value={name}
              maxLength={50}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tennis 3"
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1">Sport *</label>
            <select value={sport} onChange={(e) => setSport(e.target.value as Sport)} className={inputClass}>
              {SPORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
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
            <Button type="submit" variant="primary" loading={createCourt.isPending || updateCourt.isPending}>
              {editing ? 'Save' : 'Add court'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        title={toggleTarget?.is_active ? 'Deactivate court' : 'Reactivate court'}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-text-secondary">
            {toggleTarget?.is_active
              ? `${toggleTarget?.name} will stop accepting bookings and disappear from availability. A court with upcoming bookings cannot be deactivated.`
              : `${toggleTarget?.name} will accept bookings again.`}
          </p>
          {toggleError && <p className="text-xs text-accent-red">{toggleError}</p>}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-light">
            <Button type="button" variant="ghost" onClick={() => setToggleTarget(null)}>
              Close
            </Button>
            <Button
              type="button"
              variant={toggleTarget?.is_active ? 'danger' : 'primary'}
              loading={updateCourt.isPending}
              onClick={handleToggle}
            >
              {toggleTarget?.is_active ? 'Deactivate' : 'Reactivate'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
