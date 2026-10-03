import React, { useState, useMemo, useEffect, useRef } from 'react'
import type { BarOrder, KitchenStatus } from '../../api/types'
import {
  useBarOrders,
  useSetKitchenStatus,
  useErrorSimulation,
} from '../../api/hooks'
import { formatMoney, formatTimeIST } from '../../lib/format'
import {
  Card,
  Button,
  StatusChip,
  useToast,
  EmptyState,
  Skeleton,
} from '../../components/ui'
import {
  ChefHat,
  Clock,
  ArrowRight,
  AlertTriangle,
  Flame,
  CheckCircle,
  UtensilsCrossed,
  Timer,
} from 'lucide-react'
import { cn } from '../../lib/utils'

// ── Kitchen status columns (forward-only: NEW→PREPARING→READY→SERVED) ──
const KITCHEN_COLUMNS: { status: KitchenStatus; label: string; color: string; countBadge: string; icon: typeof ChefHat }[] = [
  { status: 'NEW', label: 'New', color: 'bg-primary-500 text-ink border border-ink', countBadge: 'bg-ink text-primary-500', icon: Clock },
  { status: 'PREPARING', label: 'Preparing', color: 'bg-brand-purple text-white border border-brand-purple-dark', countBadge: 'bg-white text-brand-purple', icon: Flame },
  { status: 'READY', label: 'Ready', color: 'bg-ink text-white border border-black', countBadge: 'bg-white text-ink', icon: CheckCircle },
  { status: 'SERVED', label: 'Served', color: 'bg-surface-dark text-white border border-ink', countBadge: 'bg-white text-ink', icon: UtensilsCrossed },
]

const NEXT_STATUS: Record<string, KitchenStatus | null> = {
  NEW: 'PREPARING',
  PREPARING: 'READY',
  READY: 'SERVED',
  SERVED: null,
  CANCELLED: null,
}

// ── Elapsed time display ──
function ElapsedTime({ createdAt }: { createdAt: string }) {
  const [elapsed, setElapsed] = useState('')
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    function update() {
      const created = new Date(createdAt).getTime()
      const now = Date.now()
      const diffMs = now - created
      const mins = Math.floor(diffMs / 60000)
      const hrs = Math.floor(mins / 60)
      if (hrs > 0) {
        setElapsed(`${hrs}h ${mins % 60}m`)
      } else {
        setElapsed(`${mins}m`)
      }
    }
    update()
    intervalRef.current = setInterval(update, 30000) // update every 30s
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [createdAt])

  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-text-tertiary">
      <Timer size={12} />
      {elapsed}
    </span>
  )
}

export default function StaffKitchen() {
  const { toast } = useToast()
  const { currentError, setSimulatedError } = useErrorSimulation()

  // Fetch all orders, refresh frequently for kitchen board
  const { data: allOrders, isLoading, refetch } = useBarOrders()
  const setStatusMut = useSetKitchenStatus()

  // Auto-refresh every 15 seconds for live kitchen board
  useEffect(() => {
    const interval = setInterval(() => {
      refetch()
    }, 15000)
    return () => clearInterval(interval)
  }, [refetch])

  // Group orders by kitchen status
  const grouped = useMemo(() => {
    const map: Record<KitchenStatus, BarOrder[]> = {
      NEW: [],
      PREPARING: [],
      READY: [],
      SERVED: [],
      CANCELLED: [],
    }
    if (!allOrders) return map
    for (const o of allOrders) {
      if (map[o.kitchen_status]) {
        map[o.kitchen_status].push(o)
      }
    }
    // Only show served orders from last 2 hours
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
    map['SERVED'] = map['SERVED'].filter((o) => new Date(o.created_at ?? '').getTime() > twoHoursAgo)
    return map
  }, [allOrders])

  // ── Advance status ──
  async function handleAdvance(order: BarOrder) {
    const next = NEXT_STATUS[order.kitchen_status]
    if (!next) return
    try {
      await setStatusMut.mutateAsync({ orderId: order.id, status: next })
      toast(`Order #${order.id} → ${next}`, 'success')
    } catch (err: any) {
      toast(err?.error?.message || 'Invalid transition', 'error')
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <ChefHat size={28} className="text-primary-500" />
            Kitchen Board
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Drag-free board · tap cards to advance status
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Refresh
          </Button>
          {import.meta.env.DEV && (
            <select
              className="h-8 px-3 rounded-xl bg-surface border border-border-light text-xs text-text-secondary"
              value={currentError || ''}
              onChange={(e) => setSimulatedError(e.target.value || null)}
            >
              <option value="">No simulated error</option>
              <option value="INVALID_TRANSITION">INVALID_TRANSITION</option>
            </select>
          )}
        </div>
      </div>

      {/* ── Kanban Columns ── */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {KITCHEN_COLUMNS.map((col) => (
            <div key={col.status} className="space-y-3">
              <Skeleton className="h-10 rounded-xl" />
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-2xl" />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          {KITCHEN_COLUMNS.map((col) => {
            const Icon = col.icon
            const orders = grouped[col.status] || []
            const nextStatus = NEXT_STATUS[col.status]

            return (
              <div key={col.status} className="space-y-3">
                {/* Column header */}
                <div
                  className={cn(
                    'flex items-center justify-between px-4 py-2.5 rounded-2xl',
                    col.color,
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon size={18} />
                    <span className="text-sm font-bold">{col.label}</span>
                  </div>
                  <span className={cn('flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold', col.countBadge)}>
                    {orders.length}
                  </span>
                </div>

                {/* Order cards */}
                {orders.length === 0 ? (
                  <div className="p-6 rounded-2xl border-2 border-dashed border-border-light text-center">
                    <p className="text-sm text-text-tertiary">No orders</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
                    {orders.map((order) => (
                      <div
                        key={order.id}
                        className={cn(
                          'bg-surface rounded-2xl shadow-card p-4 space-y-3 transition-all',
                          // Large touch target for tablet
                          'min-h-[8rem]',
                          nextStatus && 'cursor-pointer hover:shadow-raised active:scale-[0.98]',
                        )}
                        onClick={() => nextStatus && handleAdvance(order)}
                        role={nextStatus ? 'button' : undefined}
                        tabIndex={nextStatus ? 0 : undefined}
                        onKeyDown={nextStatus ? (e) => e.key === 'Enter' && handleAdvance(order) : undefined}
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-base font-bold text-text-primary">#{order.id}</span>
                            {order.table_label && (
                              <StatusChip label={order.table_label} variant="neutral" />
                            )}
                          </div>
                          <ElapsedTime createdAt={order.created_at ?? ''} />
                        </div>

                        {/* Customer */}
                        <p className="text-xs text-text-secondary">
                          {order.member_name || order.guest_name || 'Walk-in'}
                        </p>

                        {/* Items */}
                        <div className="space-y-0.5">
                          {order.items.map((item, i) => (
                            <div key={i} className="flex items-start justify-between">
                              <div className="flex-1">
                                <p className="text-sm text-text-primary">
                                  <span className="font-bold text-ink mr-1">{item.qty}×</span>
                                  {item.name}
                                </p>
                                {item.note && (
                                  <p className="text-xs text-ink italic ml-5">📝 {item.note}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Action */}
                        {nextStatus && (
                          <div className="pt-1 border-t border-border-light">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleAdvance(order)
                              }}
                              disabled={setStatusMut.isPending}
                              className={cn(
                                'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all border border-ink',
                                'hover:opacity-90 active:opacity-80 disabled:opacity-50',
                                col.status === 'NEW'
                                  ? 'bg-brand-purple text-white'
                                  : col.status === 'PREPARING'
                                  ? 'bg-ink text-white'
                                  : 'bg-primary-500 text-ink',
                              )}
                            >
                              {setStatusMut.isPending ? (
                                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                              ) : (
                                <>
                                  Move to {nextStatus}
                                  <ArrowRight size={16} />
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
