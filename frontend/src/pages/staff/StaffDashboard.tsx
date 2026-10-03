import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import {
  useBookings,
  useCourts,
  useLowStockProducts,
  useUpdateBookingStatus,
  useBarDailyReport,
  useDashboardSummary,
  useRevenueSeries,
} from '../../api/hooks'
import { getTodayIST, formatTimeIST, formatDateIST, formatMoney } from '../../lib/format'
import {
  Card,
  Button,
  StatusChip,
  SectionHeader,
  StatCard,
  PillTabs,
  useToast,
} from '../../components/ui'
import {
  CalendarDays,
  UserPlus,
  ShoppingBag,
  CheckCircle,
  AlertTriangle,
  Clock,
  ArrowRight,
  Package,
  Coffee,
  Banknote,
  CreditCard,
  Smartphone,
  UtensilsCrossed,
  Wallet,
  ChefHat,
  TrendingUp,
  Activity,
  Users,
  Receipt,
  FileSpreadsheet,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts'

// ── Executive Dashboard (OWNER & MANAGER) ─────────────────────────────────
function OwnerManagerDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today')

  const { data: summary, isLoading: summaryLoading } = useDashboardSummary(period)
  const { data: series, isLoading: seriesLoading } = useRevenueSeries()
  const todayStr = getTodayIST()

  const chartData = (series ?? []).map((pt) => ({
    date: pt.date.slice(5),
    fullDate: pt.date,
    total: Math.round(pt.total_paise / 100),
    bookings: Math.round(pt.booking_paise / 100),
    shop: Math.round(pt.shop_paise / 100),
    bar: Math.round(pt.bar_paise / 100),
    membership: Math.round(pt.membership_paise / 100),
  }))

  const sourceData = summary?.revenue?.by_source
    ? [
        { name: 'Court Bookings', value: Math.round(summary.revenue.by_source.BOOKING / 100), color: '#3B82F6' },
        { name: 'Pro Shop', value: Math.round(summary.revenue.by_source.SHOP_ORDER / 100), color: '#8B5CF6' },
        { name: 'Bar & Cafe', value: Math.round(summary.revenue.by_source.BAR_ORDER / 100), color: '#10B981' },
        { name: 'Memberships', value: Math.round(summary.revenue.by_source.MEMBERSHIP / 100), color: '#F59E0B' },
      ].filter((d) => d.value > 0)
    : []

  const methodData = summary?.revenue?.by_method
    ? [
        { name: 'Cash', value: Math.round(summary.revenue.by_method.CASH / 100), color: '#10B981' },
        { name: 'Card', value: Math.round(summary.revenue.by_method.CARD / 100), color: '#3B82F6' },
        { name: 'UPI', value: Math.round(summary.revenue.by_method.UPI / 100), color: '#8B5CF6' },
        { name: 'Online', value: Math.round(summary.revenue.by_method.ONLINE_MOCK / 100), color: '#EC4899' },
      ].filter((d) => d.value > 0)
    : []

  const periodTabs = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'This Week' },
    { id: 'month', label: 'This Month' },
  ]

  return (
    <div className="space-y-6">
      {/* Header & Period Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">
              Executive Overview
            </h1>
            <StatusChip label={user?.role ?? 'STAFF'} variant="info" />
          </div>
          <p className="text-sm text-text-secondary mt-1">
            {formatDateIST(todayStr)} · Club operational metrics & financial performance
          </p>
        </div>

        <div className="flex items-center gap-3">
          <PillTabs
            tabs={periodTabs}
            activeId={period}
            onChange={(tabId) => setPeriod(tabId as 'today' | 'week' | 'month')}
          />
          <Button
            variant="secondary"
            size="sm"
            icon={FileSpreadsheet}
            onClick={() => navigate('/staff/reports')}
          >
            Financial Ledger
          </Button>
        </div>
      </div>

      {/* Primary KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={`Revenue (${period})`}
          value={summaryLoading ? '—' : formatMoney(summary?.revenue.total_paise ?? 0)}
          icon={TrendingUp}
          delta={14.8}
        />

        <StatCard
          label="Court Utilization"
          value={summaryLoading ? '—' : `${summary?.bookings.utilization_pct ?? 0}%`}
          icon={Activity}
          iconBg="bg-accent-green/10"
          iconColor="text-accent-green"
        />

        <StatCard
          label="New Members"
          value={summaryLoading ? '—' : `${summary?.members.new ?? 0}`}
          icon={Users}
          iconBg="bg-accent-purple/10"
          iconColor="text-accent-purple"
        />

        <StatCard
          label="New Leads"
          value={summaryLoading ? '—' : `${summary?.leads.new ?? 0}`}
          icon={UserPlus}
          iconBg="bg-accent-yellow/10"
          iconColor="text-accent-yellow"
        />
      </div>

      {/* 30-Day Revenue Trend (Recharts Area Chart) */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
          <div>
            <h2 className="text-base font-bold text-text-primary">30-Day Revenue Trend</h2>
            <p className="text-xs text-text-secondary mt-0.5">
              Daily revenue breakdown across Court Bookings, Pro Shop, Bar & Memberships
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium text-text-secondary">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-primary-500" /> Bookings
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-accent-purple" /> Shop
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-accent-green" /> Bar
            </span>
          </div>
        </div>

        <div className="h-72 w-full">
          {seriesLoading ? (
            <div className="h-full flex items-center justify-center text-xs text-text-tertiary">
              Loading 30-day analytics...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#9CA3AF"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#E5E7EB' }}
                />
                <YAxis
                  stroke="#9CA3AF"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                />
                <Tooltip
                  formatter={(val: number) => [`₹${Number(val).toLocaleString('en-IN')}`, 'Revenue']}
                  labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullDate ?? _label}
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '16px',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                    border: '1px solid #E5E7EB',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#3B82F6"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorTotal)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Revenue Breakdown & Working Capital Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue by Source (Recharts Bar Chart) */}
        <Card className="p-6">
          <SectionHeader title="Revenue by Source" />
          <div className="mt-4 h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sourceData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  fontSize={11}
                  stroke="#6B7280"
                  tickLine={false}
                  axisLine={false}
                  width={95}
                />
                <Tooltip
                  formatter={(val: number) => [`₹${Number(val).toLocaleString('en-IN')}`, 'Revenue']}
                  contentStyle={{ borderRadius: '12px', fontSize: '12px' }}
                />
                <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                  {sourceData.map((entry, index) => (
                    <Cell key={`source-cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Revenue by Payment Method (Recharts Bar) */}
        <Card className="p-6">
          <SectionHeader title="Payment Methods" />
          <div className="mt-4 h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={methodData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="name" fontSize={11} stroke="#6B7280" tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip
                  formatter={(val: number) => [`₹${Number(val).toLocaleString('en-IN')}`, 'Amount']}
                  contentStyle={{ borderRadius: '12px', fontSize: '12px' }}
                />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {methodData.map((entry, index) => (
                    <Cell key={`method-cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Receivables & Payables ("Owed to us / We owe") */}
        <Card className="p-6 flex flex-col justify-between">
          <div>
            <SectionHeader title="Receivables & Payables" />
            <div className="mt-4 space-y-4">
              {/* Owed to Us */}
              <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                    Owed to Us (Receivables)
                  </span>
                  <span className="text-xs font-bold text-emerald-700">
                    {formatMoney(
                      (summary?.receivables.unpaid_tabs_paise ?? 0) +
                        (summary?.receivables.unpaid_invoices_paise ?? 0)
                    )}
                  </span>
                </div>
                <div className="text-xs text-emerald-700 space-y-1 mt-2">
                  <div className="flex justify-between">
                    <span>Unpaid Member Tabs:</span>
                    <span className="font-semibold">{formatMoney(summary?.receivables.unpaid_tabs_paise ?? 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Outstanding Invoices:</span>
                    <span className="font-semibold">{formatMoney(summary?.receivables.unpaid_invoices_paise ?? 0)}</span>
                  </div>
                </div>
              </div>

              {/* We Owe */}
              <div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-100">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">
                    We Owe (Payables)
                  </span>
                  <span className="text-xs font-bold text-rose-700">
                    {formatMoney(
                      (summary?.payables.unpaid_expenses_paise ?? 0) +
                        (summary?.payables.pending_payroll_paise ?? 0)
                    )}
                  </span>
                </div>
                <div className="text-xs text-rose-700 space-y-1 mt-2">
                  <div className="flex justify-between">
                    <span>Vendor & Stock Expenses:</span>
                    <span className="font-semibold">{formatMoney(summary?.payables.unpaid_expenses_paise ?? 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Pending Staff Payroll:</span>
                    <span className="font-semibold">{formatMoney(summary?.payables.pending_payroll_paise ?? 0)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-border-light flex items-center justify-between text-xs">
            <span className="text-text-secondary font-medium">Net Position:</span>
            <span className="font-bold text-text-primary">
              {formatMoney(
                (summary?.receivables.unpaid_tabs_paise ?? 0) -
                  (summary?.payables.unpaid_expenses_paise ?? 0)
              )}
            </span>
          </div>
        </Card>
      </div>

      {/* Bottom Row: Low Stock Management & Operational Shortcuts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Low Stock List */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <SectionHeader title="Inventory Alerts" />
            <Button
              variant="secondary"
              size="sm"
              icon={Package}
              onClick={() => navigate('/staff/stock')}
            >
              Stock Management
            </Button>
          </div>

          <Card className="p-4">
            {summaryLoading ? (
              <p className="text-xs text-text-tertiary py-4 text-center">Checking inventory levels...</p>
            ) : !summary?.low_stock || summary.low_stock.length === 0 ? (
              <div className="text-center py-6 text-xs text-status-success-text flex items-center justify-center gap-1.5 font-semibold">
                <CheckCircle size={16} /> All product stocks are above reorder thresholds
              </div>
            ) : (
              <div className="divide-y divide-border-light">
                {summary.low_stock.map((item) => (
                  <div key={item.product_id} className="py-3 flex items-center justify-between gap-3 first:pt-1 last:pb-1">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                        <AlertTriangle size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-text-primary truncate">{item.name}</p>
                        <p className="text-xs text-text-secondary">
                          Current Stock: <span className="font-semibold text-accent-red">{item.stock_qty}</span> (Min: {item.reorder_level})
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate('/staff/stock')}
                      className="touch-target text-xs"
                    >
                      Restock
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Quick Management Shortcuts */}
        <div className="space-y-3">
          <SectionHeader title="Quick Actions" />
          <Card className="p-4 space-y-3">
            <button
              type="button"
              onClick={() => navigate('/staff/reports')}
              className="w-full p-3.5 rounded-xl bg-surface border border-border-light hover:border-primary-300 hover:bg-canvas transition-all text-left flex items-center justify-between group touch-target"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
                  <Receipt size={18} />
                </div>
                <div>
                  <p className="font-bold text-xs text-text-primary">Financial Ledger</p>
                  <p className="text-[10px] text-text-tertiary">Audit payments & refunds</p>
                </div>
              </div>
              <ArrowRight size={14} className="text-text-tertiary group-hover:text-primary-600" />
            </button>

            <button
              type="button"
              onClick={() => navigate('/staff/stock')}
              className="w-full p-3.5 rounded-xl bg-surface border border-border-light hover:border-primary-300 hover:bg-canvas transition-all text-left flex items-center justify-between group touch-target"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <Package size={18} />
                </div>
                <div>
                  <p className="font-bold text-xs text-text-primary">Catalog & Stock</p>
                  <p className="text-[10px] text-text-tertiary">Add products & restock</p>
                </div>
              </div>
              <ArrowRight size={14} className="text-text-tertiary group-hover:text-purple-600" />
            </button>

            <button
              type="button"
              onClick={() => navigate('/staff/members')}
              className="w-full p-3.5 rounded-xl bg-surface border border-border-light hover:border-primary-300 hover:bg-canvas transition-all text-left flex items-center justify-between group touch-target"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Users size={18} />
                </div>
                <div>
                  <p className="font-bold text-xs text-text-primary">Members & Plans</p>
                  <p className="text-[10px] text-text-tertiary">Manage memberships</p>
                </div>
              </div>
              <ArrowRight size={14} className="text-text-tertiary group-hover:text-emerald-600" />
            </button>
          </Card>
        </div>
      </div>
    </div>
  )
}

// ── Bar Daily Report Card (BAR_STAFF own-shift) ───────────────────────────
function BarDailyReportCard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const todayStr = getTodayIST()
  const { data: report, isLoading } = useBarDailyReport(todayStr)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            Bar Shift Report
          </h1>
          <p className="text-sm text-text-secondary mt-1">Loading today's data…</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 rounded-3xl bg-surface animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight flex items-center gap-2">
            <ChefHat size={28} className="text-primary-500" />
            Bar Shift Report
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {formatDateIST(todayStr)} · {user?.full_name ?? 'Staff'}
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => navigate('/staff/bar')}
          className="p-5 rounded-2xl bg-surface border border-border-light shadow-soft hover:shadow-card hover:border-primary-300 transition-all text-left flex items-center justify-between group touch-target"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-primary-50 flex items-center justify-center text-primary-600 group-hover:scale-105 transition-transform">
              <Coffee size={24} />
            </div>
            <div>
              <p className="font-bold text-sm text-text-primary">Bar POS</p>
              <p className="text-xs text-text-tertiary">Take new orders</p>
            </div>
          </div>
          <ArrowRight size={18} className="text-text-tertiary group-hover:text-primary-600 transition-colors" />
        </button>

        <button
          type="button"
          onClick={() => navigate('/staff/kitchen')}
          className="p-5 rounded-2xl bg-surface border border-border-light shadow-soft hover:shadow-card hover:border-primary-300 transition-all text-left flex items-center justify-between group touch-target"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-accent-green/10 flex items-center justify-center text-accent-green group-hover:scale-105 transition-transform">
              <UtensilsCrossed size={24} />
            </div>
            <div>
              <p className="font-bold text-sm text-text-primary">Kitchen Display</p>
              <p className="text-xs text-text-tertiary">KDS preparation board</p>
            </div>
          </div>
          <ArrowRight size={18} className="text-text-tertiary group-hover:text-accent-green transition-colors" />
        </button>
      </div>

      {/* Shift Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Orders Today"
          value={String(report?.orders ?? 0)}
          icon={UtensilsCrossed}
        />
        <StatCard
          label="Shift Revenue"
          value={formatMoney(report?.revenue_paise ?? 0)}
          icon={TrendingUp}
        />
        <StatCard
          label="Outstanding Tabs"
          value={formatMoney(report?.outstanding_tabs_paise ?? 0)}
          icon={Wallet}
        />
      </div>

      {/* Payment Method Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <SectionHeader title="Revenue by Payment Method" />
          <div className="mt-4 space-y-3">
            {report && (
              <>
                {[
                  { method: 'CASH', icon: Banknote, amount: report.by_method.CASH, color: 'text-accent-green' },
                  { method: 'CARD', icon: CreditCard, amount: report.by_method.CARD, color: 'text-primary-500' },
                  { method: 'UPI', icon: Smartphone, amount: report.by_method.UPI, color: 'text-accent-purple' },
                ].map((entry) => {
                  const pct = report.revenue_paise > 0
                    ? Math.round((entry.amount / report.revenue_paise) * 100)
                    : 0
                  return (
                    <div key={entry.method} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-canvas flex items-center justify-center">
                        <entry.icon size={16} className={entry.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-text-primary">{entry.method}</span>
                          <span className="font-bold text-text-primary">{formatMoney(entry.amount)}</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-border-light overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary-500 transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-xs font-medium text-text-tertiary w-10 text-right">{pct}%</span>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Summary" />
          <div className="mt-3 space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Total Revenue</span>
              <span className="font-bold text-text-primary">{formatMoney(report?.revenue_paise ?? 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Tax (GST 5%)</span>
              <span className="font-medium text-text-primary">{formatMoney(report?.tax_paise ?? 0)}</span>
            </div>
            <div className="flex justify-between text-sm border-t border-border-light pt-2">
              <span className="text-text-secondary">Outstanding Tabs</span>
              <span className="font-bold text-accent-red">{formatMoney(report?.outstanding_tabs_paise ?? 0)}</span>
            </div>
            {report?.by_staff && report.by_staff.length > 0 && (
              <>
                <div className="border-t border-border-light pt-2">
                  <p className="text-xs font-bold text-text-secondary mb-1.5 uppercase tracking-wider">Staff</p>
                  {report.by_staff.map((s) => (
                    <div key={s.user_id} className="flex justify-between text-sm">
                      <span className="text-text-secondary">{s.name}</span>
                      <span className="font-medium text-text-primary">{formatMoney(s.revenue_paise)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

// ── Front Desk Dashboard ─────────────────────────────────────────────────
function FrontDeskDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const todayStr = getTodayIST()
  const { data: courts = [] } = useCourts()
  const { data: todayBookings, isLoading: bookingsLoading } = useBookings({ date: todayStr })
  const { data: lowStockProducts, isLoading: stockLoading } = useLowStockProducts()
  const updateStatusMutation = useUpdateBookingStatus()

  const handleCheckIn = async (bookingId: number) => {
    try {
      await updateStatusMutation.mutateAsync({ id: bookingId, status: 'COMPLETED' })
      toast('Member checked in successfully', 'success')
    } catch {
      toast('Failed to mark check-in', 'error')
    }
  }

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            Front Desk Console
          </h1>
          <p className="text-sm text-text-secondary">
            Today is {formatDateIST(todayStr)} · Welcome back, {user?.full_name ?? 'Staff'}
          </p>
        </div>
      </div>

      {/* Quick Actions Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => navigate('/staff/bookings')}
          className="p-5 rounded-2xl bg-surface border border-border-light shadow-soft hover:shadow-card hover:border-primary-300 transition-all text-left flex items-center justify-between group touch-target"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-primary-50 flex items-center justify-center text-primary-600 group-hover:scale-105 transition-transform">
              <CalendarDays size={24} />
            </div>
            <div>
              <p className="font-bold text-sm text-text-primary">Book Court</p>
              <p className="text-xs text-text-tertiary">Reserve 1-hour slot</p>
            </div>
          </div>
          <ArrowRight size={18} className="text-text-tertiary group-hover:text-primary-600 transition-colors" />
        </button>

        <button
          type="button"
          onClick={() => navigate('/staff/members')}
          className="p-5 rounded-2xl bg-surface border border-border-light shadow-soft hover:shadow-card hover:border-primary-300 transition-all text-left flex items-center justify-between group touch-target"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-accent-green/10 flex items-center justify-center text-accent-green group-hover:scale-105 transition-transform">
              <UserPlus size={24} />
            </div>
            <div>
              <p className="font-bold text-sm text-text-primary">Register Member</p>
              <p className="text-xs text-text-tertiary">New subscription</p>
            </div>
          </div>
          <ArrowRight size={18} className="text-text-tertiary group-hover:text-accent-green transition-colors" />
        </button>

        <button
          type="button"
          onClick={() => navigate('/staff/shop')}
          className="p-5 rounded-2xl bg-surface border border-border-light shadow-soft hover:shadow-card hover:border-primary-300 transition-all text-left flex items-center justify-between group touch-target"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-accent-purple/10 flex items-center justify-center text-accent-purple group-hover:scale-105 transition-transform">
              <ShoppingBag size={24} />
            </div>
            <div>
              <p className="font-bold text-sm text-text-primary">Counter POS</p>
              <p className="text-xs text-text-tertiary">Sell merchandise</p>
            </div>
          </div>
          <ArrowRight size={18} className="text-text-tertiary group-hover:text-accent-purple transition-colors" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left 2 Cols: Today's Bookings */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <SectionHeader title="Today's Court Schedule" />
            <Button
              variant="ghost"
              size="sm"
              icon={ArrowRight}
              onClick={() => navigate('/staff/bookings')}
            >
              View Grid
            </Button>
          </div>

          <Card className="p-4 space-y-3">
            {bookingsLoading ? (
              <p className="text-xs text-text-tertiary py-4 text-center">Loading schedule...</p>
            ) : !todayBookings || todayBookings.length === 0 ? (
              <p className="text-xs text-text-tertiary py-6 text-center">No court bookings scheduled for today</p>
            ) : (
              <div className="divide-y divide-border-light">
                {todayBookings.map((b) => {
                  const court = courts.find((c) => c.id === b.court_id)
                  return (
                    <div key={b.id} className="py-3 flex items-center justify-between gap-3 first:pt-1 last:pb-1">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-canvas flex flex-col items-center justify-center text-xs font-bold text-text-primary">
                          <Clock size={16} className="text-text-tertiary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-text-primary truncate">
                            {b.member_name ?? b.guest_name ?? 'Walk-in'}
                            {b.member_code && (
                              <span className="ml-1.5 text-xs font-mono font-normal text-text-tertiary">
                                ({b.member_code})
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-text-secondary truncate">
                            {court?.name ?? `Court #${b.court_id}`} {court?.sport ? `(${court.sport})` : ''} · {formatTimeIST(b.start_at)}
                          </p>
                        </div>
                      </div>

                    <div className="flex items-center gap-2.5">
                      <StatusChip
                        label={b.status}
                        variant={b.status === 'CONFIRMED' ? 'success' : b.status === 'COMPLETED' ? 'info' : 'error'}
                      />
                      {b.status === 'CONFIRMED' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={CheckCircle}
                          onClick={() => handleCheckIn(b.id)}
                          className="touch-target text-xs"
                        >
                          Check In
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
              </div>
            )}
          </Card>
        </div>

        {/* Right 1 Col: Low Stock List (Read-only for Front Desk per RBAC) */}
        <div className="space-y-3">
          <SectionHeader title="Low Stock Warning" />
          <Card className="p-4 space-y-3">
            <p className="text-[11px] text-text-tertiary">
              Merchandise below reorder threshold (Front Desk view-only):
            </p>
            {stockLoading ? (
              <p className="text-xs text-text-tertiary text-center py-4">Checking stock...</p>
            ) : !lowStockProducts || lowStockProducts.length === 0 ? (
              <div className="text-center py-6 text-xs text-status-success-text flex items-center justify-center gap-1.5 font-semibold">
                <CheckCircle size={16} /> All products healthy
              </div>
            ) : (
              <div className="divide-y divide-border-light">
                {lowStockProducts.map((p) => (
                  <div key={p.id} className="py-2.5 flex items-center justify-between gap-2 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="font-bold text-xs text-text-primary truncate">{p.name}</p>
                      <span className="font-mono text-[10px] text-text-tertiary">{p.sku}</span>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <StatusChip label={`${p.stock_qty} left`} variant="warning" />
                      <p className="text-[10px] text-text-tertiary mt-0.5">Min: {p.reorder_level}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

// ── Exported Dashboard (role-aware) ──────────────────────────────────────
export default function StaffDashboard() {
  const { user } = useAuth()

  // BAR_STAFF sees their own-shift daily report card
  if (user?.role === 'BAR_STAFF') {
    return <BarDailyReportCard />
  }

  // OWNER and MANAGER get the full executive analytics dashboard
  if (user?.role === 'OWNER' || user?.role === 'MANAGER') {
    return <OwnerManagerDashboard />
  }

  // FRONT_DESK sees the operational front desk console
  return <FrontDeskDashboard />
}
