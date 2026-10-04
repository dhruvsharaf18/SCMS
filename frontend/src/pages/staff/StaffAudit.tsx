import React, { useMemo, useState } from 'react'
import type { AuditLog } from '../../api/types'
import { useAuditLogs, useEmployees } from '../../api/hooks'
import { useAuth } from '../../hooks/useAuth'
import { formatDateIST, formatTimeIST } from '../../lib/format'
import { Card, Button, DataTable, type Column } from '../../components/ui'
import { AlertTriangle, Search, X } from 'lucide-react'

const PAGE_SIZE = 50

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function DetailsCell({ log }: { log: AuditLog }) {
  const entries = Object.entries(log.meta ?? {})
  if (entries.length === 0 && !log.ip) return <span className="text-xs text-text-tertiary">—</span>
  return (
    <div className="space-y-0.5 max-w-md">
      {entries.slice(0, 4).map(([key, value]) => (
        <p key={key} className="text-[11px] text-text-secondary truncate" title={formatValue(value)}>
          <span className="font-semibold text-text-primary">{key}</span>: {formatValue(value)}
        </p>
      ))}
      {entries.length > 4 && <p className="text-[11px] text-text-tertiary">+{entries.length - 4} more</p>}
      {log.ip && <p className="text-[10px] text-text-tertiary font-mono">IP {log.ip}</p>}
    </div>
  )
}

export default function StaffAudit() {
  const { user } = useAuth()
  const isOwner = user?.role === 'OWNER'

  const [page, setPage] = useState(1)
  const [actionInput, setActionInput] = useState('')
  const [entityInput, setEntityInput] = useState('')
  const [applied, setApplied] = useState<{ action?: string; entity?: string; actor_id?: number }>({})

  const { data, isLoading, isFetching, error } = useAuditLogs(
    { ...applied, page, page_size: PAGE_SIZE },
    { enabled: isOwner },
  )
  const { data: employees = [] } = useEmployees(true)

  const actorNames = useMemo(() => {
    const names = new Map<number, string>()
    for (const e of employees) if (e.user_id) names.set(e.user_id, e.full_name)
    if (user) names.set(user.id, user.full_name)
    return names
  }, [employees, user])

  const actorOptions = useMemo(
    () => [...actorNames.entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [actorNames],
  )

  const logs = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilters = !!(applied.action || applied.entity || applied.actor_id)

  const applyFilters = (e: React.FormEvent) => {
    e.preventDefault()
    setApplied((prev) => ({
      ...prev,
      action: actionInput.trim().toUpperCase() || undefined,
      entity: entityInput.trim().toLowerCase() || undefined,
    }))
    setPage(1)
  }

  const clearFilters = () => {
    setActionInput('')
    setEntityInput('')
    setApplied({})
    setPage(1)
  }

  const actorLabel = (id: number | null) =>
    id === null ? 'System' : actorNames.get(id) ?? `User #${id}`

  const columns: Column<AuditLog>[] = [
    {
      key: 'time',
      header: 'Time (IST)',
      render: (log) => (
        <div className="whitespace-nowrap">
          <p className="text-xs font-semibold text-text-primary">{formatDateIST(log.created_at)}</p>
          <p className="text-[11px] text-text-secondary">{formatTimeIST(log.created_at)}</p>
        </div>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (log) => (
        <span className={`text-xs ${log.actor_id === null ? 'text-text-tertiary' : 'font-semibold text-text-primary'}`}>
          {actorLabel(log.actor_id)}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (log) => (
        <span className="font-mono text-[11px] font-bold text-primary-600 bg-primary-50 px-2 py-1 rounded-lg whitespace-nowrap">
          {log.action}
        </span>
      ),
    },
    {
      key: 'target',
      header: 'Target',
      render: (log) =>
        log.entity ? (
          <span className="text-xs text-text-secondary whitespace-nowrap">
            {log.entity}
            {log.entity_id !== null && <span className="font-mono"> #{log.entity_id}</span>}
          </span>
        ) : (
          <span className="text-xs text-text-tertiary">—</span>
        ),
    },
    {
      key: 'details',
      header: 'Details',
      render: (log) => <DetailsCell log={log} />,
    },
  ]

  const inputClass =
    'px-2.5 py-1.5 rounded-xl border border-border-light bg-canvas text-xs text-text-primary focus:outline-none focus:border-primary-500'

  const forbidden = !isOwner || error?.error?.code === 'FORBIDDEN'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Audit Log</h1>
        <p className="text-sm text-text-secondary mt-1">
          Read-only record of sensitive changes: refunds, price and stock edits, staff and role changes
        </p>
      </div>

      {forbidden ? (
        <Card className="p-6 text-center text-sm text-text-secondary flex flex-col items-center gap-2">
          <AlertTriangle size={20} className="text-accent-red" />
          Only the owner can view the audit log.
        </Card>
      ) : (
        <>
          <Card className="p-4">
            <form onSubmit={applyFilters} className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-text-secondary mr-1">Filter</span>
              <input
                type="text"
                value={actionInput}
                onChange={(e) => setActionInput(e.target.value)}
                placeholder="Action, e.g. PAYMENT_REFUNDED"
                aria-label="Action (exact match)"
                maxLength={60}
                className={`${inputClass} font-mono w-56`}
              />
              <input
                type="text"
                value={entityInput}
                onChange={(e) => setEntityInput(e.target.value)}
                placeholder="Target, e.g. payment"
                aria-label="Target type (exact match)"
                maxLength={40}
                className={`${inputClass} font-mono w-40`}
              />
              <select
                value={applied.actor_id ?? ''}
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : undefined
                  setApplied((prev) => ({ ...prev, actor_id: id }))
                  setPage(1)
                }}
                aria-label="Actor"
                className={inputClass}
              >
                <option value="">Any actor</option>
                {actorOptions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="secondary" size="sm" icon={Search}>
                Apply
              </Button>
              {hasFilters && (
                <Button type="button" variant="ghost" size="sm" icon={X} onClick={clearFilters}>
                  Clear
                </Button>
              )}
              <span className="text-[11px] text-text-tertiary">Action and target match exactly.</span>
            </form>
          </Card>

          {error ? (
            <Card className="p-6 text-center text-sm text-text-secondary flex flex-col items-center gap-2">
              <AlertTriangle size={20} className="text-accent-red" />
              {error.error?.message ?? 'Could not load the audit log.'}
            </Card>
          ) : (
            <Card className="p-0 overflow-hidden">
              <DataTable
                columns={columns}
                data={logs}
                keyExtractor={(log) => log.id}
                emptyMessage={
                  isLoading
                    ? 'Loading audit log...'
                    : hasFilters
                    ? 'No audit entries match these filters'
                    : 'No audit entries yet'
                }
              />
              <div className="p-4 flex items-center justify-between border-t border-border-light text-xs text-text-secondary">
                <span>
                  Page {page} of {totalPages} · {total} entries{isFetching && !isLoading ? ' · refreshing…' : ''}
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((n) => n + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
