import React, { useState, useMemo } from 'react'
import type { Payment, SourceType, PaymentMethod } from '../../api/types'
import {
  usePayments,
  useRefundPayment,
  useErrorSimulation,
} from '../../api/hooks'
import { useAuth } from '../../hooks/useAuth'
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
  Search,
} from 'lucide-react'

const SOURCE_OPTIONS: { id: SourceType | 'ALL'; label: string }[] = [
  { id: 'ALL', label: 'All Sources' },
  { id: 'BOOKING', label: 'Court Booking' },
  { id: 'SHOP_ORDER', label: 'Pro Shop' },
  { id: 'BAR_ORDER', label: 'Bar & Cafe' },
  { id: 'MEMBERSHIP', label: 'Membership' },
]

const METHOD_OPTIONS: { id: PaymentMethod | 'ALL'; label: string }[] = [
  { id: 'ALL', label: 'All Methods' },
  { id: 'CASH', label: 'Cash' },
  { id: 'CARD', label: 'Card' },
  { id: 'UPI', label: 'UPI' },
]

export default function StaffReports() {
  const { user } = useAuth()
  const { toast } = useToast()
  const todayStr = getTodayIST()

  // Date range state (default to past 30 days)
  const defaultFrom = useMemo(() => {
    const [y, m, d] = todayStr.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d - 30))
    return dt.toISOString().slice(0, 10)
  }, [todayStr])

  const [fromDate, setFromDate] = useState(defaultFrom)
  const [toDate, setToDate] = useState(todayStr)
  const [selectedSource, setSelectedSource] = useState<SourceType | 'ALL'>('ALL')
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | 'ALL'>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // Data fetching
  const { data: payments = [], isLoading } = usePayments({
    from: fromDate,
    to: toDate,
    source_type: selectedSource,
    method: selectedMethod,
  })

  const refundMutation = useRefundPayment()
  const { currentError, setSimulatedError } = useErrorSimulation()

  // Refund Modal state
  const [refundTarget, setRefundTarget] = useState<Payment | null>(null)
  const [refundReason, setRefundReason] = useState('')

  // Filtered payments
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchRef = (p.reference ?? '').toLowerCase().includes(q)
        const matchName = (p.member_name ?? '').toLowerCase().includes(q)
        if (!matchRef && !matchName) return false
      }
      return true
    })
  }, [payments, searchQuery])

  // Aggregate metrics
  const totals = useMemo(() => {
    let completedPaise = 0
    let refundedPaise = 0
    let refundCount = 0

    for (const p of filteredPayments) {
      if (p.status === 'COMPLETED') {
        completedPaise += p.amount_paise
      } else if (p.status === 'REFUNDED') {
        refundedPaise += p.amount_paise
        refundCount++
      }
    }

    return {
      netCollectionsPaise: completedPaise,
      totalCount: filteredPayments.length,
      refundedPaise,
      refundCount,
    }
  }, [filteredPayments])

  // Handlers
  const handleRefundSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!refundTarget) return

    try {
      const res = await refundMutation.mutateAsync({
        paymentId: refundTarget.id,
        reason: refundReason.trim() || undefined,
      })
      toast(`Refund of ${formatMoney(res.refund_paise)} processed successfully`, 'success')
      setRefundTarget(null)
      setRefundReason('')
    } catch (err: any) {
      toast(err?.error?.message ?? 'Failed to process refund', 'error')
    }
  }

  const exportCSV = () => {
    if (filteredPayments.length === 0) {
      toast('No transaction records to export', 'error')
      return
    }

    const headers = ['Reference', 'Date_IST', 'Source', 'Customer', 'Method', 'Amount_INR', 'GST_Tax_INR', 'Status']
    const rows = filteredPayments.map((p) => [
      p.reference ?? `TXN-${p.id}`,
      `${formatDateIST(p.created_at)} ${formatTimeIST(p.created_at)}`,
      p.source_type,
      `"${p.member_name ?? 'Guest'}"`,
      p.method,
      (p.amount_paise / 100).toFixed(2),
      (p.tax_paise / 100).toFixed(2),
      p.status,
    ])

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `CCMS_Payments_Ledger_${fromDate}_to_${toDate}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast('CSV Ledger export downloaded', 'success')
  }

  // Quick preset ranges
  const setQuickRange = (days: number) => {
    const [y, m, d] = todayStr.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d - days))
    setFromDate(dt.toISOString().slice(0, 10))
    setToDate(todayStr)
  }

  // Columns definition
  const columns: Column<any>[] = [
    {
      key: 'reference',
      header: 'Reference & Date',
      render: (p: Payment) => (
        <div>
          <p className="font-mono font-bold text-xs text-text-primary">
            {p.reference ?? `TXN-${p.id}`}
          </p>
          <p className="text-[11px] text-text-secondary mt-0.5">
            {formatDateIST(p.created_at)} · {formatTimeIST(p.created_at)}
          </p>
        </div>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      render: (p: Payment) => {
        const labels: Record<SourceType, string> = {
          BOOKING: 'Court Booking',
          SHOP_ORDER: 'Pro Shop',
          BAR_ORDER: 'Bar & Cafe',
          MEMBERSHIP: 'Membership',
          SOCIAL: 'Social Event',
          INVOICE: 'Invoice',
        }
        return (
          <span className="text-xs font-medium text-text-secondary px-2.5 py-1 rounded-full bg-canvas border border-border-light">
            {labels[p.source_type] ?? p.source_type}
          </span>
        )
      },
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (p: Payment) => (
        <span className="font-medium text-xs text-text-primary">
          {p.member_name ?? 'Walk-in Guest'}
        </span>
      ),
    },
    {
      key: 'method',
      header: 'Method',
      render: (p: Payment) => {
        const icons: Record<PaymentMethod, any> = {
          CASH: Banknote,
          CARD: CreditCard,
          UPI: Smartphone,
          ONLINE_MOCK: CreditCard,
        }
        const Icon = icons[p.method] ?? CreditCard
        return (
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <Icon size={14} className="text-text-tertiary" />
            <span>{p.method}</span>
          </div>
        )
      },
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (p: Payment) => (
        <div>
          <p className="font-bold text-sm text-text-primary">
            {formatMoney(p.amount_paise)}
          </p>
          <p className="text-[10px] text-text-tertiary">
            GST: {formatMoney(p.tax_paise)}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p: Payment) => (
        <StatusChip
          label={p.status}
          variant={p.status === 'COMPLETED' ? 'success' : 'error'}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (p: Payment) => (
        <div className="flex items-center justify-end">
          {p.status === 'COMPLETED' ? (
            <Button
              variant="secondary"
              size="sm"
              icon={RotateCcw}
              onClick={() => {
                setRefundTarget(p)
                setRefundReason('')
              }}
              className="touch-target text-xs text-accent-red hover:bg-rose-50 hover:border-rose-200"
            >
              Refund
            </Button>
          ) : (
            <span className="text-xs text-text-tertiary italic">Refunded</span>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">
              Financial Ledger & Reports
            </h1>
            <StatusChip label="SRS 3.2.9" variant="info" />
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Complete transaction ledger, audit trail, and payment refunds
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            icon={Download}
            onClick={exportCSV}
            className="touch-target"
          >
            Export CSV
          </Button>
        </div>
      </div>

      {/* Aggregate KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Net Collections (Selected Period)"
          value={formatMoney(totals.netCollectionsPaise)}
          icon={TrendingUp}
        />

        <StatCard
          label="Total Transactions"
          value={String(totals.totalCount)}
          icon={Receipt}
          iconBg="bg-primary-50"
          iconColor="text-primary-500"
        />

        <StatCard
          label="Processed Refunds"
          value={formatMoney(totals.refundedPaise)}
          icon={RotateCcw}
          iconBg="bg-rose-50"
          iconColor="text-accent-red"
        />
      </div>

      {/* Filters Card */}
      <Card className="p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Quick Date Presets & Inputs */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-text-secondary mr-1 flex items-center gap-1">
              <Calendar size={14} /> Date Range:
            </span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-border-light bg-canvas text-xs text-text-primary focus:outline-none focus:border-primary-500"
            />
            <span className="text-xs text-text-tertiary">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-border-light bg-canvas text-xs text-text-primary focus:outline-none focus:border-primary-500"
            />

            <div className="flex items-center gap-1 ml-2">
              <button
                type="button"
                onClick={() => setQuickRange(7)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-canvas hover:bg-surface border border-border-light text-text-secondary hover:text-text-primary transition-colors"
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => setQuickRange(30)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-canvas hover:bg-surface border border-border-light text-text-secondary hover:text-text-primary transition-colors"
              >
                30 Days
              </button>
              <button
                type="button"
                onClick={() => setQuickRange(60)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-canvas hover:bg-surface border border-border-light text-text-secondary hover:text-text-primary transition-colors"
              >
                60 Days
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[220px]">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reference, customer…"
              className="w-full pl-9 pr-4 py-2 text-xs bg-canvas rounded-xl border border-border-light focus:outline-none focus:border-primary-500 focus:bg-surface text-text-primary placeholder:text-text-tertiary"
            />
          </div>
        </div>

        {/* Source & Method Filter Tabs */}
        <div className="pt-3 border-t border-border-light flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold text-text-secondary">Source:</span>
            <PillTabs
              tabs={SOURCE_OPTIONS}
              activeId={selectedSource}
              onChange={(id) => setSelectedSource(id as SourceType | 'ALL')}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold text-text-secondary">Method:</span>
            <PillTabs
              tabs={METHOD_OPTIONS}
              activeId={selectedMethod}
              onChange={(id) => setSelectedMethod(id as PaymentMethod | 'ALL')}
            />
          </div>
        </div>
      </Card>

      {/* Ledger Table */}
      <Card className="p-0 overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredPayments as any}
          keyExtractor={(p: any) => p.id}
          emptyMessage="No transaction records match your filters"
        />
      </Card>

      {/* ── Refund Modal ──────────────────────────────────────────────────── */}
      <Modal
        open={!!refundTarget}
        onClose={() => setRefundTarget(null)}
        title="Process Transaction Refund"
      >
        <form onSubmit={handleRefundSubmit} className="space-y-4">
          <div className="p-4 rounded-2xl bg-canvas border border-border-light space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-text-secondary">Transaction Ref:</span>
              <span className="font-mono font-bold text-text-primary">
                {refundTarget?.reference ?? `TXN-${refundTarget?.id}`}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Customer:</span>
              <span className="font-bold text-text-primary">
                {refundTarget?.member_name ?? 'Walk-in Guest'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Payment Method:</span>
              <span className="font-semibold text-text-primary">{refundTarget?.method}</span>
            </div>
            <div className="flex justify-between border-t border-border-light pt-2">
              <span className="text-text-secondary font-bold">Refund Amount:</span>
              <span className="font-bold text-base text-accent-red">
                {formatMoney(refundTarget?.amount_paise ?? 0)}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1">
              Reason for Refund *
            </label>
            <input
              type="text"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="e.g., Rainout / court booking cancellation requested"
              className="w-full px-3.5 py-2.5 rounded-xl border border-border-light bg-canvas text-xs text-text-primary focus:outline-none focus:border-primary-500 focus:bg-surface"
              required
            />
          </div>

          <p className="text-[11px] text-text-tertiary">
            Per SRS 3.2.9: This will reverse the payment status to REFUNDED, record an audit event, and update financial ledger totals.
          </p>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-light">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRefundTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={refundMutation.isPending || !refundReason.trim()}
            >
              {refundMutation.isPending ? 'Processing...' : 'Confirm Refund'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
