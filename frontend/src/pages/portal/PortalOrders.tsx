import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ShopOrder, ShopOrderStatus, PaymentStatus } from '../../api/types'
import {
  useMyOrders,
  useCancelShopOrder,
  useErrorSimulation,
} from '../../api/hooks'
import { useAuth } from '../../hooks/useAuth'
import {
  formatDateTimeIST,
  formatMoney,
  calcShopTaxPaise,
} from '../../lib/format'
import {
  Card,
  Button,
  StatusChip,
  Modal,
  PillTabs,
  EmptyState,
  Skeleton,
  useToast,
  type ChipVariant,
} from '../../components/ui'
import {
  Package,
  Clock,
  Truck,
  Store,
  RotateCcw,
  AlertTriangle,
  Receipt,
  Plus,
  Info,
} from 'lucide-react'

function getOrderStatusChip(status: ShopOrderStatus): { label: string; variant: ChipVariant } {
  switch (status) {
    case 'COMPLETED':
      return { label: 'Completed', variant: 'success' }
    case 'READY':
      return { label: 'Ready for Pickup', variant: 'info' }
    case 'OUT_FOR_DELIVERY':
      return { label: 'Out for Delivery', variant: 'pending' }
    case 'PLACED':
      return { label: 'Placed', variant: 'warning' }
    case 'CANCELLED':
      return { label: 'Cancelled', variant: 'error' }
    default:
      return { label: status, variant: 'neutral' }
  }
}

function getPaymentStatusChip(status: PaymentStatus): { label: string; variant: ChipVariant } {
  switch (status) {
    case 'PAID':
      return { label: 'Paid', variant: 'success' }
    case 'REFUNDED':
      return { label: 'Refunded', variant: 'info' }
    case 'WAIVED':
      return { label: 'Waived', variant: 'neutral' }
    case 'UNPAID':
    default:
      return { label: 'Unpaid', variant: 'warning' }
  }
}

export default function PortalOrders() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const memberId = user?.member_id ?? 1

  const [activeTab, setActiveTab] = useState<string>('ALL')
  const { data: orders = [], isLoading, isError, refetch } = useMyOrders(memberId)
  const cancelMutation = useCancelShopOrder()
  const { currentError, setSimulatedError } = useErrorSimulation()

  // Cancellation Modal state
  const [cancellingOrder, setCancellingOrder] = useState<ShopOrder | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelInlineError, setCancelInlineError] = useState<string | null>(null)

  // Details Modal state
  const [inspectingOrder, setInspectingOrder] = useState<ShopOrder | null>(null)

  // Sorted orders (newest first)
  const sortedOrders = useMemo(() => {
    return [...orders].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }, [orders])

  // Filtered orders based on tab
  const filteredOrders = useMemo(() => {
    switch (activeTab) {
      case 'ACTIVE':
        return sortedOrders.filter((o) =>
          ['PLACED', 'READY', 'OUT_FOR_DELIVERY'].includes(o.status)
        )
      case 'COMPLETED':
        return sortedOrders.filter((o) => o.status === 'COMPLETED')
      case 'CANCELLED':
        return sortedOrders.filter((o) => o.status === 'CANCELLED')
      default:
        return sortedOrders
    }
  }, [sortedOrders, activeTab])

  // Handler for cancelling an order
  const handleConfirmCancel = async () => {
    if (!cancellingOrder) return
    setCancelInlineError(null)

    try {
      await cancelMutation.mutateAsync({
        orderId: cancellingOrder.id,
        reason: cancelReason.trim() || undefined,
      })

      toast(`Order #ORD-${cancellingOrder.id} has been cancelled.`, 'success')
      setCancellingOrder(null)
      setCancelReason('')
    } catch (err: any) {
      const msg =
        err?.message ||
        (err?.code === 'ALREADY_CANCELLED'
          ? 'This order has already been cancelled.'
          : err?.code === 'ORDER_LOCKED'
          ? 'This order has already been processed and cannot be cancelled.'
          : 'Failed to cancel order. Please try again.')
      setCancelInlineError(msg)
    }
  }

  const activeOrdersCount = sortedOrders.filter((o) =>
    ['PLACED', 'READY', 'OUT_FOR_DELIVERY'].includes(o.status)
  ).length

  return (
    <div className="space-y-6 pb-20">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">My Orders</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Track and manage your Pro Shop equipment, apparel, and accessory purchases.
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => navigate('/portal/shop')}
          className="gap-2 self-start sm:self-auto min-h-[44px]"
        >
          <Plus size={16} />
          <span>Shop Equipment</span>
        </Button>
      </div>

      {/* Status Filter Tabs */}
      <PillTabs
        tabs={[
          { id: 'ALL', label: `All Orders (${sortedOrders.length})` },
          { id: 'ACTIVE', label: `In Progress (${activeOrdersCount})` },
          {
            id: 'COMPLETED',
            label: `Completed (${sortedOrders.filter((o) => o.status === 'COMPLETED').length})`,
          },
          {
            id: 'CANCELLED',
            label: `Cancelled (${sortedOrders.filter((o) => o.status === 'CANCELLED').length})`,
          },
        ]}
        activeId={activeTab}
        onChange={setActiveTab}
      />

      {/* Orders List */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="p-5 bg-surface rounded-2xl border border-border-light space-y-4">
              <div className="flex justify-between">
                <Skeleton className="w-32 h-5 rounded" />
                <Skeleton className="w-20 h-5 rounded" />
              </div>
              <Skeleton className="w-3/4 h-4 rounded" />
              <Skeleton className="w-1/2 h-4 rounded" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <Card className="p-8 text-center">
          <AlertTriangle className="mx-auto text-status-error mb-3" size={32} />
          <h3 className="text-base font-bold text-text-primary mb-1">Failed to load orders</h3>
          <p className="text-sm text-text-secondary mb-4">
            Could not fetch your order history. Please try again.
          </p>
          <Button variant="secondary" onClick={() => refetch()}>
            Retry
          </Button>
        </Card>
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          icon={Package}
          title={
            activeTab === 'ALL'
              ? 'No shop orders yet'
              : `No ${activeTab.toLowerCase()} orders found`
          }
          description={
            activeTab === 'ALL'
              ? 'You have not placed any pro-shop orders yet. Check out the official gear.'
              : 'Try selecting a different filter tab.'
          }
          action={
            activeTab === 'ALL' ? (
              <Button variant="secondary" onClick={() => navigate('/portal/shop')}>
                Browse Pro Shop
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const isCancellable = order.status === 'PLACED'
            const gst = calcShopTaxPaise(order.total_paise)
            const totalItemsCount = order.items.reduce((acc, item) => acc + item.qty, 0)
            const orderStatus = getOrderStatusChip(order.status)
            const paymentStatus = getPaymentStatusChip(order.payment_status)

            return (
              <Card
                key={order.id}
                className="p-5 border-border-light hover:border-primary-200 transition-all space-y-4"
              >
                {/* Header: Order ID, Date, Chips */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-border-light">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-canvas flex items-center justify-center border border-border-light text-primary-600 shrink-0">
                      <Package size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-text-primary">
                          #ORD-{order.id}
                        </h3>
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-canvas border border-border-light text-text-tertiary">
                          {order.fulfilment === 'PICKUP' ? (
                            <>
                              <Store size={12} className="text-text-secondary" />
                              <span>Pickup</span>
                            </>
                          ) : (
                            <>
                              <Truck size={12} className="text-text-secondary" />
                              <span>Delivery</span>
                            </>
                          )}
                        </span>
                      </div>
                      <p className="text-xs text-text-tertiary flex items-center gap-1.5 mt-0.5">
                        <Clock size={12} />
                        <span>{formatDateTimeIST(order.created_at)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <StatusChip label={orderStatus.label} variant={orderStatus.variant} />
                    <StatusChip label={paymentStatus.label} variant={paymentStatus.variant} />
                  </div>
                </div>

                {/* Items Summary */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-text-secondary">
                    Items ({totalItemsCount}):
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {order.items.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 bg-canvas rounded-xl border border-border-light text-xs flex items-center justify-between"
                      >
                        <div className="truncate pr-2">
                          <span className="font-bold text-text-primary">
                            {item.qty}x
                          </span>{' '}
                          <span className="text-text-secondary">{item.name}</span>
                        </div>
                        <span className="font-semibold text-text-primary shrink-0">
                          {formatMoney(item.unit_price_paise * item.qty)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {order.fulfilment === 'DELIVERY' && order.delivery_address && (
                    <div className="p-2.5 bg-canvas/50 rounded-xl border border-border-light text-xs text-text-secondary flex items-start gap-2">
                      <Truck size={14} className="text-text-tertiary shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-text-primary">Delivery to: </strong>
                        {order.delivery_address}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer: Price breakdown & actions */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-border-light">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs text-text-secondary">Order Total:</span>
                      <span className="text-lg font-extrabold text-primary-600">
                        {formatMoney(order.total_paise)}
                      </span>
                    </div>
                    <p className="text-[11px] text-text-tertiary">
                      includes {formatMoney(gst)} GST (18%)
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setInspectingOrder(order)}
                      className="gap-1.5 min-h-[40px]"
                    >
                      <Receipt size={14} />
                      <span>Details</span>
                    </Button>

                    {isCancellable && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          setCancellingOrder(order)
                          setCancelInlineError(null)
                          setCancelReason('')
                        }}
                        className="gap-1.5 min-h-[40px]"
                      >
                        <RotateCcw size={14} />
                        <span>Cancel Order</span>
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Cancellation Confirm Modal */}
      {cancellingOrder && (
        <Modal
          open={!!cancellingOrder}
          onClose={() => setCancellingOrder(null)}
          title="Cancel Shop Order"
          size="md"
        >
          <div className="space-y-4">
            <div className="p-3.5 bg-canvas rounded-xl border border-border-light space-y-2 text-xs">
              <div className="flex justify-between items-center text-text-primary">
                <span className="font-bold">Order Reference:</span>
                <span className="font-mono">#ORD-{cancellingOrder.id}</span>
              </div>
              <div className="flex justify-between items-center text-text-primary">
                <span className="font-bold">Order Total:</span>
                <span className="font-bold text-primary-600">
                  {formatMoney(cancellingOrder.total_paise)}
                </span>
              </div>
            </div>

            {/* Refund & Inventory notice */}
            <div className="p-3 bg-accent-yellow/10 border border-accent-yellow/20 rounded-xl space-y-1.5 text-xs text-accent-yellow">
              <div className="font-bold flex items-center gap-1.5">
                <Info size={15} />
                <span>Cancellation & Refund Policy</span>
              </div>
              <p>
                • Reserved equipment will immediately be released back to the pro shop stock.
              </p>
              {cancellingOrder.payment_status === 'PAID' ? (
                <p className="text-accent-green font-semibold">
                  • 100% full refund of {formatMoney(cancellingOrder.total_paise)} will be credited back to your original payment method.
                </p>
              ) : (
                <p>• No payment was captured for this order.</p>
              )}
            </div>

            {/* Reason input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-secondary">
                Reason for cancellation (optional):
              </label>
              <textarea
                rows={2}
                placeholder="E.g., Ordered wrong racket model, changed my mind..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-canvas border border-border-light rounded-xl text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary-500"
              />
            </div>

            {/* Dev Simulated Error Active Indicator */}
            {currentError && (
              <div className="p-2.5 bg-accent-yellow/10 border border-accent-yellow/30 rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-accent-yellow font-medium">
                  <AlertTriangle size={14} />
                  <span>Dev Mock Error: {currentError}</span>
                </div>
                <button
                  onClick={() => setSimulatedError(null)}
                  className="text-accent-yellow hover:underline font-bold text-[10px]"
                >
                  Clear
                </button>
              </div>
            )}

            {/* Inline Error */}
            {cancelInlineError && (
              <div className="p-3 bg-status-error border border-accent-red/20 rounded-xl text-accent-red text-xs flex items-start gap-2">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>{cancelInlineError}</span>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2 border-t border-border-light">
              <Button
                variant="secondary"
                onClick={() => setCancellingOrder(null)}
                disabled={cancelMutation.isPending}
              >
                Keep Order
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmCancel}
                loading={cancelMutation.isPending}
                className="gap-2"
              >
                Confirm Cancellation
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Order Details Breakdown Modal */}
      {inspectingOrder && (
        <Modal
          open={!!inspectingOrder}
          onClose={() => setInspectingOrder(null)}
          title={`Order Details #ORD-${inspectingOrder.id}`}
          size="md"
        >
          <div className="space-y-4">
            {/* Meta Row */}
            <div className="flex items-center justify-between text-xs pb-3 border-b border-border-light">
              <span className="text-text-tertiary">
                Placed on {formatDateTimeIST(inspectingOrder.created_at)}
              </span>
              <div className="flex items-center gap-1.5">
                <StatusChip
                  label={getOrderStatusChip(inspectingOrder.status).label}
                  variant={getOrderStatusChip(inspectingOrder.status).variant}
                />
                <StatusChip
                  label={getPaymentStatusChip(inspectingOrder.payment_status).label}
                  variant={getPaymentStatusChip(inspectingOrder.payment_status).variant}
                />
              </div>
            </div>

            {/* Items List */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                Purchased Items
              </h4>
              <div className="space-y-1.5">
                {inspectingOrder.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-canvas rounded-xl border border-border-light flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-text-primary">{item.name}</div>
                      <div className="text-[11px] text-text-tertiary">
                        {item.qty} × {formatMoney(item.unit_price_paise)}
                      </div>
                    </div>
                    <span className="font-bold text-text-primary">
                      {formatMoney(item.unit_price_paise * item.qty)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Fulfilment & Payment details */}
            <div className="p-3 bg-canvas rounded-xl border border-border-light text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-text-secondary">Fulfilment Method:</span>
                <span className="font-bold text-text-primary">
                  {inspectingOrder.fulfilment === 'PICKUP' ? 'Club Pro-Shop Pickup' : 'Home Delivery'}
                </span>
              </div>
              {inspectingOrder.fulfilment === 'DELIVERY' && inspectingOrder.delivery_address && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">Delivery Address:</span>
                  <span className="font-medium text-text-primary text-right max-w-xs">
                    {inspectingOrder.delivery_address}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-text-secondary">Channel:</span>
                <span className="font-bold text-text-primary">
                  {inspectingOrder.channel === 'ONLINE' ? 'Member Web Portal' : 'POS Desk'}
                </span>
              </div>
            </div>

            {/* Money Breakdown */}
            <div className="p-3.5 bg-canvas rounded-xl border border-border-light space-y-2 text-xs">
              <div className="flex justify-between text-text-secondary">
                <span>Subtotal</span>
                <span className="font-semibold text-text-primary">
                  {formatMoney(inspectingOrder.subtotal_paise)}
                </span>
              </div>

              {inspectingOrder.discount_paise > 0 && (
                <div className="flex justify-between text-accent-green font-medium">
                  <span>Member Tier Discount</span>
                  <span>-{formatMoney(inspectingOrder.discount_paise)}</span>
                </div>
              )}

              <div className="pt-2 border-t border-border-light flex justify-between items-baseline">
                <div>
                  <span className="text-sm font-bold text-text-primary">Total Paid/Due</span>
                  <p className="text-[11px] text-text-tertiary">
                    includes {formatMoney(calcShopTaxPaise(inspectingOrder.total_paise))} GST (18%)
                  </p>
                </div>
                <span className="text-base font-extrabold text-primary-600">
                  {formatMoney(inspectingOrder.total_paise)}
                </span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button variant="secondary" onClick={() => setInspectingOrder(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
