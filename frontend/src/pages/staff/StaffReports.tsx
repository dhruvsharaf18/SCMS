import { useState } from 'react'
import type { SourceType } from '../../api/types'
import { useTaxSummary } from '../../api/hooks'
import { getTodayIST, formatMoney } from '../../lib/format'
import { Card, Button, SectionHeader, StatCard, useToast } from '../../components/ui'
import { Download, Landmark, TrendingUp, Percent, ChevronLeft, ChevronRight } from 'lucide-react'
import { SOURCE_LABELS, downloadLedgerCsv } from './StaffPayments'

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return d.toISOString().slice(0, 7)
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function monthBounds(month: string): [string, string] {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  return [`${month}-01`, last]
}

export default function StaffReports() {
  const { toast } = useToast()
  const thisMonth = getTodayIST().slice(0, 7)
  const [month, setMonth] = useState(thisMonth)
  const { data: summary, isLoading } = useTaxSummary(month)

  const rows = Object.entries(summary?.by_source ?? {}).sort((a, b) => b[1].revenue_paise - a[1].revenue_paise)

  const exportMonth = async () => {
    const [from, to] = monthBounds(month)
    try {
      await downloadLedgerCsv(from, to)
      toast(`Payments for ${monthLabel(month)} downloaded`, 'success')
    } catch (err: any) {
      toast(err?.message ?? 'CSV export failed', 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Reports</h1>
          <p className="text-sm text-text-secondary mt-1">Monthly revenue and GST collected, by source</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={ChevronLeft} onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month" />
          <span className="text-sm font-bold text-text-primary w-36 text-center">{monthLabel(month)}</span>
          <Button
            variant="secondary"
            size="sm"
            icon={ChevronRight}
            disabled={month >= thisMonth}
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            aria-label="Next month"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Revenue (incl. GST)" value={formatMoney(summary?.revenue_paise ?? 0)} icon={TrendingUp} />
        <StatCard
          label="GST collected"
          value={formatMoney(summary?.tax_paise ?? 0)}
          icon={Landmark}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
        />
        <StatCard
          label="Net of GST"
          value={formatMoney((summary?.revenue_paise ?? 0) - (summary?.tax_paise ?? 0))}
          icon={Percent}
          iconBg="bg-primary-50"
          iconColor="text-primary-500"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionHeader title="By source" />
          <Button variant="secondary" size="sm" icon={Download} onClick={exportMonth}>
            Export month CSV
          </Button>
        </div>
        <Card className="p-0 overflow-hidden">
          {isLoading ? (
            <p className="p-6 text-center text-xs text-text-tertiary animate-pulse">Loading...</p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-center text-xs text-text-tertiary">No payments in {monthLabel(month)}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-light text-left text-text-secondary">
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 font-medium text-right">Revenue</th>
                    <th className="px-4 py-3 font-medium text-right">GST</th>
                    <th className="px-4 py-3 font-medium text-right">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([source, v]) => (
                    <tr key={source} className="border-b border-border-light/50 last:border-0">
                      <td className="px-4 py-3 font-semibold text-text-primary">
                        {SOURCE_LABELS[source as SourceType] ?? source}
                      </td>
                      <td className="px-4 py-3 text-right">{formatMoney(v.revenue_paise)}</td>
                      <td className="px-4 py-3 text-right text-text-secondary">{formatMoney(v.tax_paise)}</td>
                      <td className="px-4 py-3 text-right text-text-secondary">
                        {summary?.revenue_paise ? Math.round((v.revenue_paise / summary.revenue_paise) * 100) : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <p className="text-[11px] text-text-tertiary">
          Refunded payments are excluded. Prices include GST, so GST is the inclusive share of each payment.
        </p>
      </div>
    </div>
  )
}
