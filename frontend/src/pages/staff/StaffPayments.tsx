import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Payment, SourceType, PaymentMethod } from '../../api/types'
import { usePayments, usePaymentTotals, useRefundPayment } from '../../api/hooks'
import { downloadPaymentsCsvApi } from '../../api/client'
import { getTodayIST, formatDateIST, formatTimeIST, formatMoney } from '../../lib/format'
import {
  Card,
  Button,
  StatusChip,
  Modal,
  PillTabs,
  DataTable,
  type Column,
  StatCard,
  useToast,
} from '../../components/ui'
import {
  Receipt,
  Download,
  RotateCcw,
  Calendar,
  CreditCard,
  Banknote,
  Smartphone,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react'

const PAGE_SIZE = 50

export const SOURCE_LABELS: Record<SourceType, string> = {
  BOOKING: 'Court Booking',
  SOCIAL: 'Social Play',
  SHOP_ORDER: 'Pro Shop',
  BAR_ORDER: 'Bar & Cafe',
  MEMBERSHIP: 'Membership',
  INVOICE: 'Invoice',
}

const SOURCE_TABS = [
  { id: 'ALL', label: 'All' },
  ...(Object.keys(SOURCE_LABELS) as SourceType[]).map((id) => ({ id, label: SOURCE_LABELS[id] })),
]

const METHOD_TABS = [
  { id: 'ALL', label: 'All' },
  { id: 'CASH', label: 'Cash' },
  { id: 'CARD', label: 'Card' },
  { id: 'UPI', label: 'UPI' },
  { id: 'ONLINE_MOCK', label: 'Online' },
]

const METHOD_ICONS: Record<PaymentMethod, typeof CreditCard> = {
  CASH: Banknote,
  CARD: CreditCard,
  UPI: Smartphone,
  ONLINE_MOCK: CreditCard,
}

function daysAgo(today: string, days: number): string {
  const [y, m, d] = today.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10)
}

export async function downloadLedgerCsv(from: string, to: string) {
  const blob = await downloadPaymentsCsvApi(from, to)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `CCMS_Payments_${from}_to_${to}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function StaffPayments() {
  const { toast } = useToast()
  const today = getTodayIST()

  const [fromDate, setFromDate] = useState(() => daysAgo(today, 30))
  const [toDate, setToDate] = useState(today)
  const [source, setSource] = useState('ALL')
  const [method, setMethod] = useState('ALL')
  const [page, setPage] = useState(1)

  const filters = useMemo(
    () => ({ from: fromDate, to: toDate, source_type: source, method }),
    [fromDate, toDate, source, method],
  )
  const { data, isLoading, error } = usePayments({ ...filters, page, page_size: PAGE_SIZE })
  const { data: totals } = usePaymentTotals(filters)
  const refund = useRefundPayment()

  const [refundTarget, setRefundTarget] = useState<Payment | null>(null)
  const [refundReason, setRefundReason] = useState('')

  const payments = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const updateFilter = (apply: () => void) => {
    apply()
    setPage(1)
  }

  const handleRefund = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!refundTarget) return
    try {
      const row = await refund.mutateAsync({ paymentId: refundTarget.id, reason: refundReason.trim() || undefined })
      toast(`Refunded ${formatMoney(row.amount_paise)}`, 'success')
      setRefundTarget(null)
      setRefundReason('')
    } catch (err: any) {
      toast(err?.error?.message ?? 'Refund failed', 'error')
    }
  }

  const exportCsv = async () => {
    try {
      await downloadLedgerCsv(fromDate, toDate)
      toast('CSV downloaded', 'success')
    } catch (err: any) {
      toast(err?.message ?? 'CSV export failed', 'error')
    }
  }

  const columns: Column<Payment>[] = [
    {
      key: 'reference',
      header: 'Payment',
      render: (p) => (
        <div>
          <p className="font-mono font-bold text-xs text-text-primary">{p.reference ?? `#${p.id}`}</p>
          <p className="text-[11px] text-text-secondary mt-0.5">
            {formatDateIST(p.created_at)} · {formatTimeIST(p.created_at)}
          </p>
        </div>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      render: (p) => (
        <span className="text-xs font-medium text-text-secondary px-2.5 py-1 rounded-full bg-canvas border border-border-light whitespace-nowrap">
          {SOURCE_LABELS[p.source_type] ?? p.source_type} #{p.source_id}
        </span>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (p) =>
        p.member_id ? (
          <Link to={`/staff/members/${p.member_id}`} className="text-xs font-semibold text-primary-600 hover:underline">
            Member #{p.member_id}
          </Link>
        ) : (
          <span className="text-xs text-text-secondary">Walk-in</span>
        ),
    },
    {
      key: 'method',
      header: 'Method',
      render: (p) => {
        const Icon = METHOD_ICONS[p.method] ?? CreditCard
        return (
          <span className="flex items-center gap-1.5 text-xs text-text-secondary">
            <Icon size={14} className="text-text-tertiary" />
            {p.method === 'ONLINE_MOCK' ? 'Online' : p.method}
          </span>
        )
      },
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (p) => (
        <div>
          <p className={`font-bold text-sm ${p.status === 'REFUNDED' ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>
            {formatMoney(p.amount_paise)}
          </p>
          <p className="text-[10px] text-text-tertiary">incl. GST {formatMoney(p.tax_paise)}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => (
        <StatusChip
          label={p.status === 'COMPLETED' ? 'Paid' : 'Refunded'}
          variant={p.status === 'COMPLETED' ? 'success' : 'error'}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (p) =>
        p.status === 'COMPLETED' ? (
          <div className="flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              icon={RotateCcw}
              onClick={() => {
                setRefundTarget(p)
                setRefundReason('')
              }}
              className="text-ink hover:bg-status-error hover:border-status-error-accent"
            >
              Refund
            </Button>
          </div>
        ) : null,
    },
  ]

  const presetClass =
    'px-2.5 py-1 rounded-lg text-[11px] font-medium bg-canvas hover:bg-surface border border-border-light text-text-secondary hover:text-text-primary transition-colors'

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Payments Ledger</h1>
          <p className="text-sm text-text-secondary mt-1">
            Every payment taken across courts, shop, bar, memberships and invoices
          </p>
        </div>
        <Button variant="secondary" icon={Download} onClick={exportCsv} className="touch-target">
          Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Collected" value={formatMoney(totals?.collected_paise ?? 0)} icon={TrendingUp} />
        <StatCard
          label="Payments"
          value={String(totals?.count ?? total)}
          icon={Receipt}
          iconBg="bg-primary-500"
          iconColor="text-ink"
        />
        <StatCard
          label={`Refunded (${totals?.refunded_count ?? 0})`}
          value={formatMoney(totals?.refunded_paise ?? 0)}
          icon={RotateCcw}
          iconBg="bg-status-error"
          iconColor="text-ink"
        />
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-text-secondary mr-1 flex items-center gap-1">
            <Calendar size={14} /> Dates
          </span>
          <input
            type="date"
            value={fromDate}
            max={toDate}
            onChange={(e) => updateFilter(() => setFromDate(e.target.value))}
            className="px-2.5 py-1.5 rounded-xl border border-border-light bg-canvas text-xs text-text-primary"
          />
          <span className="text-xs text-text-tertiary">to</span>
          <input
            type="date"
            value={toDate}
            min={fromDate}
            onChange={(e) => updateFilter(() => setToDate(e.target.value))}
            className="px-2.5 py-1.5 rounded-xl border border-border-light bg-canvas text-xs text-text-primary"
          />
          {[
            { label: 'Today', days: 0 },
            { label: '7 days', days: 7 },
            { label: '30 days', days: 30 },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={presetClass}
              onClick={() =>
                updateFilter(() => {
                  setFromDate(daysAgo(today, preset.days))
                  setToDate(today)
                })
              }
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="pt-3 border-t border-border-light space-y-3">
          <div className="flex items-center gap-3 overflow-x-auto">
            <span className="text-xs font-bold text-text-secondary flex-shrink-0">Source</span>
            <PillTabs tabs={SOURCE_TABS} activeId={source} onChange={(id) => updateFilter(() => setSource(id))} size="sm" />
          </div>
          <div className="flex items-center gap-3 overflow-x-auto">
            <span className="text-xs font-bold text-text-secondary flex-shrink-0">Method</span>
            <PillTabs tabs={METHOD_TABS} activeId={method} onChange={(id) => updateFilter(() => setMethod(id))} size="sm" />
          </div>
        </div>
      </Card>

      {error ? (
        <Card className="p-6 text-center text-sm text-text-secondary flex flex-col items-center gap-2">
          <AlertTriangle size={20} className="text-accent-red" />
          {error.error?.code === 'FORBIDDEN'
            ? 'Only owners and managers can view the payments ledger.'
            : error.error?.message ?? 'Could not load payments.'}
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <DataTable
            columns={columns}
            data={payments}
            keyExtractor={(p) => p.id}
            emptyMessage={isLoading ? 'Loading payments...' : 'No payments match these filters'}
          />
          <div className="p-4 flex items-center justify-between border-t border-border-light text-xs text-text-secondary">
            <span>
              Page {page} of {totalPages} · {total} payments
            </span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>
                Previous
              </Button>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((n) => n + 1)}>
                Next
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Modal open={!!refundTarget} onClose={() => setRefundTarget(null)} title="Refund payment">
        <form onSubmit={handleRefund} className="space-y-4">
          <div className="p-4 rounded-2xl bg-canvas border border-border-light space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-text-secondary">Payment</span>
              <span className="font-mono font-bold text-text-primary">{refundTarget?.reference ?? `#${refundTarget?.id}`}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">For</span>
              <span className="font-semibold text-text-primary">
                {refundTarget ? `${SOURCE_LABELS[refundTarget.source_type]} #${refundTarget.source_id}` : ''}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Method</span>
              <span className="font-semibold text-text-primary">{refundTarget?.method}</span>
            </div>
            <div className="flex justify-between border-t border-border-light pt-2">
              <span className="text-text-secondary font-bold">Refund amount</span>
              <span className="font-bold text-base text-ink">{formatMoney(refundTarget?.amount_paise ?? 0)}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1">Reason</label>
            <input
              type="text"
              value={refundReason}
              maxLength={200}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="e.g. Rain-out, court cancelled"
              className="w-full px-3.5 py-2.5 rounded-xl border border-border-light bg-canvas text-xs text-text-primary"
              required
            />
          </div>

          <p className="text-[11px] text-text-tertiary">
            The payment is marked REFUNDED (never deleted), the booking or order it paid for is updated, and the
            refund is written to the audit log.
          </p>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-light">
            <Button type="button" variant="ghost" onClick={() => setRefundTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={refund.isPending} disabled={!refundReason.trim()}>
              Confirm refund
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
