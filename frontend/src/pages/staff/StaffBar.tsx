import React, { useState, useMemo } from 'react'
import type { MenuItem, MenuCategory, PaymentMethod, BarOrder, BarTable } from '../../api/types'
import {
  useBarTables,
  useBarOrders,
  useMenuItems,
  useCreateBarOrder,
  useAddBarOrderItems,
  usePayBarOrder,
  usePutOnTab,
  useSettleTabs,
  useMemberByCode,
  useErrorSimulation,
} from '../../api/hooks'
import { formatMoney, formatTimeIST } from '../../lib/format'
import {
  Card,
  Button,
  StatusChip,
  Modal,
  Drawer,
  useToast,
  EmptyState,
  Skeleton,
} from '../../components/ui'
import {
  UtensilsCrossed,
  Plus,
  Minus,
  Trash2,
  Search,
  CreditCard,
  Banknote,
  Smartphone,
  Receipt,
  UserCheck,
  Clock,
  AlertTriangle,
  Coffee,
  ChefHat,
  ClipboardList,
  StickyNote,
  X,
  Wallet,
} from 'lucide-react'
import { cn } from '../../lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────
interface CartItem {
  menuItem: MenuItem
  qty: number
  note: string
}

// ── Component ──────────────────────────────────────────────────────────────
export default function StaffBar() {
  // ── State ──
  const [activeMenuCategory, setActiveMenuCategory] = useState<string>('ALL')
  const [menuSearch, setMenuSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedTable, setSelectedTable] = useState<BarTable | null>(null)
  const [isMember, setIsMember] = useState(false)
  const [memberCodeInput, setMemberCodeInput] = useState('')
  const [guestName, setGuestName] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH')
  const [cartError, setCartError] = useState<string | null>(null)
  const [noteInput, setNoteInput] = useState<Record<number, string>>({})

  // Pay modal
  const [payOrder, setPayOrder] = useState<BarOrder | null>(null)
  const [payMethod, setPayMethod] = useState<'CASH' | 'CARD' | 'UPI'>('CASH')

  // Tab settle modal
  const [settleDrawerOpen, setSettleDrawerOpen] = useState(false)
  const [settleCode, setSettleCode] = useState('')
  const [settleMethod, setSettleMethod] = useState<'CASH' | 'CARD' | 'UPI'>('CASH')

  // Order detail drawer
  const [viewOrder, setViewOrder] = useState<BarOrder | null>(null)

  const { toast } = useToast()
  const { currentError, setSimulatedError } = useErrorSimulation()

  // ── Queries ──
  const { data: tables, isLoading: tablesLoading } = useBarTables()
  const { data: allOrders, isLoading: ordersLoading } = useBarOrders()
  const { data: menuItems, isLoading: menuLoading } = useMenuItems(activeMenuCategory)
  const { data: settleMember } = useMemberByCode(settleCode)

  // ── Mutations ──
  const createOrderMut = useCreateBarOrder()
  const addItemsMut = useAddBarOrderItems()
  const payBarMut = usePayBarOrder()
  const putOnTabMut = usePutOnTab()
  const settleTabsMut = useSettleTabs()
  const { data: lookedUpMember } = useMemberByCode(isMember ? memberCodeInput : '')

  // ── Filtered menu ──
  const filteredMenu = useMemo(() => {
    if (!menuItems) return []
    let list = menuItems
    if (menuSearch.trim()) {
      const q = menuSearch.toLowerCase()
      list = list.filter((m) => m.name.toLowerCase().includes(q))
    }
    return list.filter((m) => m.is_available)
  }, [menuItems, menuSearch])

  // ── Tabs (unpaid tab orders) ──
  const tabOrders = useMemo(() => {
    if (!allOrders) return []
    return allOrders.filter((o) => o.is_tab && o.payment_status === 'UNPAID')
  }, [allOrders])

  // Tab totals grouped by member
  const tabsByMember = useMemo(() => {
    const map = new Map<number, { name: string; code: string; orders: BarOrder[]; total_paise: number }>()
    for (const o of tabOrders) {
      if (!o.member_id) continue
      const existing = map.get(o.member_id)
      if (existing) {
        existing.orders.push(o)
        existing.total_paise += o.total_paise
      } else {
        map.set(o.member_id, {
          name: o.member_name || 'Unknown',
          code: o.member_code || '',
          orders: [o],
          total_paise: o.total_paise,
        })
      }
    }
    return Array.from(map.entries()).map(([id, data]) => ({ member_id: id, ...data }))
  }, [tabOrders])

  // ── Cart helpers ──
  function addToCart(item: MenuItem) {
    setCartError(null)
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.menuItem.id === item.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 }
        return next
      }
      return [...prev, { menuItem: item, qty: 1, note: noteInput[item.id] || '' }]
    })
  }

  function updateCartQty(itemId: number, delta: number) {
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.menuItem.id === itemId)
      if (idx < 0) return prev
      const next = [...prev]
      const newQty = next[idx].qty + delta
      if (newQty <= 0) {
        next.splice(idx, 1)
      } else {
        next[idx] = { ...next[idx], qty: newQty }
      }
      return next
    })
  }

  function setCartNote(itemId: number, note: string) {
    setCart((prev) => prev.map((c) => (c.menuItem.id === itemId ? { ...c, note } : c)))
  }

  function clearCart() {
    setCart([])
    setCartError(null)
    setSelectedTable(null)
    setIsMember(false)
    setMemberCodeInput('')
    setGuestName('')
    setNoteInput({})
  }

  const cartSubtotal = cart.reduce((s, c) => s + c.menuItem.price_paise * c.qty, 0)

  // ── Place order ──
  async function handlePlaceOrder() {
    if (cart.length === 0) {
      setCartError('Add items to the cart first')
      return
    }

    try {
      const order = await createOrderMut.mutateAsync({
        table_id: selectedTable?.id ?? null,
        member_id: isMember && lookedUpMember ? lookedUpMember.id : null,
        guest_name: !isMember && guestName ? guestName : null,
        items: cart.map((c) => ({
          menu_item_id: c.menuItem.id,
          qty: c.qty,
          note: c.note || undefined,
        })),
      })
      toast(`Order #${order.id} sent to kitchen`, 'success')
      clearCart()
    } catch (err: any) {
      const code = err?.error?.code || 'UNKNOWN'
      setCartError(err?.error?.message || `Error: ${code}`)
    }
  }

  // ── Pay order ──
  async function handlePayOrder() {
    if (!payOrder) return
    try {
      await payBarMut.mutateAsync({ orderId: payOrder.id, method: payMethod })
      toast(`Order #${payOrder.id} paid via ${payMethod}`, 'success')
      setPayOrder(null)
    } catch (err: any) {
      toast(err?.error?.message || 'Payment failed', 'error')
    }
  }

  // ── Put on tab ──
  async function handlePutOnTab(order: BarOrder) {
    try {
      await putOnTabMut.mutateAsync({ orderId: order.id })
      toast(`Order #${order.id} added to member tab`, 'success')
    } catch (err: any) {
      toast(err?.error?.message || 'Active member code required for tab', 'error')
    }
  }

  // ── Settle tabs ──
  async function handleSettleTabs() {
    if (!settleMember) return
    try {
      const totalSettled = await settleTabsMut.mutateAsync({
        memberId: settleMember.id,
        method: settleMethod,
      })
      toast(`${formatMoney(totalSettled)} settled for ${settleMember.full_name}`, 'success')
      setSettleDrawerOpen(false)
      setSettleCode('')
    } catch (err: any) {
      toast(err?.error?.message || 'Failed to settle tab', 'error')
    }
  }

  const menuCategories = ['ALL', 'FOOD', 'DRINK', 'SNACK'] as const

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Bar & Kitchen POS</h1>
          <p className="text-sm text-text-secondary mt-1">Manage orders, tables, and tabs</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            icon={ClipboardList}
            onClick={() => setSettleDrawerOpen(true)}
          >
            Settle Tabs ({tabOrders.length})
          </Button>
          {import.meta.env.DEV && (
            <select
              className="h-10 px-3 rounded-xl bg-surface border border-border-light text-xs text-text-secondary"
              value={currentError || ''}
              onChange={(e) => setSimulatedError(e.target.value || null)}
            >
              <option value="">No simulated error</option>
              <option value="MEMBER_REQUIRED_FOR_TAB">MEMBER_REQUIRED_FOR_TAB</option>
              <option value="ORDER_ALREADY_PAID">ORDER_ALREADY_PAID</option>
              <option value="INVALID_TRANSITION">INVALID_TRANSITION</option>
            </select>
          )}
        </div>
      </div>

      {/* ── Main Layout: Tables + Menu/Cart ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ── LEFT: Tables grid + Active orders ── */}
        <div className="lg:col-span-4 space-y-6">
          {/* Table Grid */}
          <Card>
            <h2 className="text-base font-bold text-text-primary mb-4 flex items-center gap-2">
              <UtensilsCrossed size={18} className="text-primary-500" />
              Tables
            </h2>
            {tablesLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-2xl" />
                ))}
              </div>
            ) : !tables || tables.length === 0 ? (
              <EmptyState title="No tables" description="No tables configured" />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {tables.map((table) => {
                  const hasOrder = !!table.open_order_id
                  const isSelected = selectedTable?.id === table.id
                  return (
                    <button
                      key={table.id}
                      onClick={() => setSelectedTable(isSelected ? null : table)}
                      className={cn(
                        'relative flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all min-h-[6rem]',
                        'hover:shadow-md active:scale-[0.98]',
                        isSelected
                          ? 'border-ink bg-primary-500 shadow-md text-ink'
                          : hasOrder
                          ? 'border-ink bg-primary-50 text-ink'
                          : 'border-border-light bg-surface hover:border-primary-500',
                      )}
                    >
                      <span className="text-sm font-bold text-text-primary">{table.label}</span>
                      <span className="text-xs text-text-tertiary mt-0.5">{table.seats} seats</span>
                      {hasOrder && (
                        <span className="mt-2 text-xs font-bold text-ink">
                          {formatMoney(table.open_order_total_paise ?? 0)}
                        </span>
                      )}
                      {hasOrder && (
                        <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-primary-500 border border-ink animate-pulse" />
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </Card>

          {/* Active Orders */}
          <Card>
            <h2 className="text-base font-bold text-text-primary mb-4 flex items-center gap-2">
              <Receipt size={18} className="text-primary-500" />
              Active Orders
            </h2>
            {ordersLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-xl" />
                ))}
              </div>
            ) : !allOrders || allOrders.filter((o) => o.payment_status === 'UNPAID').length === 0 ? (
              <EmptyState title="No active orders" description="All orders are paid" />
            ) : (
              <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                {allOrders
                  .filter((o) => o.payment_status === 'UNPAID')
                  .map((order) => (
                    <button
                      key={order.id}
                      onClick={() => setViewOrder(order)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-canvas hover:bg-border-light/50 transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-text-primary">#{order.id}</span>
                          {order.table_label && (
                            <span className="text-xs text-text-tertiary">{order.table_label}</span>
                          )}
                          <StatusChip
                            label={order.kitchen_status}
                            variant={
                              order.kitchen_status === 'NEW'
                                ? 'info'
                                : order.kitchen_status === 'PREPARING'
                                ? 'warning'
                                : order.kitchen_status === 'READY'
                                ? 'success'
                                : 'neutral'
                            }
                          />
                          {order.is_tab && <StatusChip label="TAB" variant="pending" />}
                        </div>
                        <p className="text-xs text-text-secondary mt-0.5 truncate">
                          {order.member_name || order.guest_name || 'Walk-in'} · {order.items.length} items
                        </p>
                      </div>
                      <span className="text-sm font-bold text-text-primary whitespace-nowrap">
                        {formatMoney(order.total_paise)}
                      </span>
                    </button>
                  ))}
              </div>
            )}
          </Card>
        </div>

        {/* ── MIDDLE: Menu Grid ── */}
        <div className="lg:col-span-4 space-y-4">
          <Card noPadding>
            <div className="p-4 pb-0">
              <h2 className="text-base font-bold text-text-primary mb-3 flex items-center gap-2">
                <Coffee size={18} className="text-primary-500" />
                Menu
              </h2>

              {/* Category tabs */}
              <div className="flex gap-1.5 mb-3">
                {menuCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveMenuCategory(cat)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-semibold transition-all',
                      activeMenuCategory === cat
                        ? 'bg-primary-500 text-white shadow-pill'
                        : 'bg-canvas text-text-secondary hover:bg-border-light',
                    )}
                  >
                    {cat === 'ALL' ? 'All' : cat.charAt(0) + cat.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative mb-3">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                <input
                  type="text"
                  placeholder="Search menu items…"
                  value={menuSearch}
                  onChange={(e) => setMenuSearch(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 rounded-xl bg-canvas border border-border-light text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                />
              </div>
            </div>

            <div className="px-4 pb-4 max-h-[55vh] overflow-y-auto">
              {menuLoading ? (
                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-28 rounded-2xl" />
                  ))}
                </div>
              ) : filteredMenu.length === 0 ? (
                <EmptyState title="No items" description="No menu items found" />
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {filteredMenu.map((item) => {
                    const inCart = cart.find((c) => c.menuItem.id === item.id)
                    return (
                      <button
                        key={item.id}
                        onClick={() => addToCart(item)}
                        className={cn(
                          'relative flex flex-col p-3 rounded-2xl border transition-all text-left',
                          'hover:shadow-md active:scale-[0.98] min-h-[6.5rem]',
                          inCart
                            ? 'border-primary-500 bg-primary-50/50'
                            : 'border-border-light bg-canvas hover:border-primary-300',
                        )}
                      >
                        <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
                          {item.category}
                        </span>
                        <span className="text-sm font-bold text-text-primary mt-1 line-clamp-2">
                          {item.name}
                        </span>
                        <span className="text-sm font-bold text-primary-500 mt-auto pt-1">
                          {formatMoney(item.price_paise)}
                        </span>
                        {inCart && (
                          <span className="absolute top-2 right-2 flex items-center justify-center w-6 h-6 rounded-full bg-primary-500 text-white text-xs font-bold">
                            {inCart.qty}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ── RIGHT: Cart / Order Summary ── */}
        <div className="lg:col-span-4 space-y-4">
          <Card>
            <h2 className="text-base font-bold text-text-primary mb-4 flex items-center gap-2">
              <ChefHat size={18} className="text-primary-500" />
              New Order
              {selectedTable && (
                <StatusChip label={selectedTable.label} variant="info" />
              )}
            </h2>

            {/* Customer toggle */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setIsMember(false)}
                className={cn(
                  'flex-1 h-10 rounded-xl text-sm font-medium transition-all',
                  !isMember ? 'bg-primary-500 text-white' : 'bg-canvas text-text-secondary border border-border-light',
                )}
              >
                Guest / Walk-in
              </button>
              <button
                onClick={() => setIsMember(true)}
                className={cn(
                  'flex-1 h-10 rounded-xl text-sm font-medium transition-all',
                  isMember ? 'bg-primary-500 text-white' : 'bg-canvas text-text-secondary border border-border-light',
                )}
              >
                <UserCheck size={14} className="inline mr-1" />
                Member
              </button>
            </div>

            {isMember ? (
              <div className="mb-3">
                <input
                  type="text"
                  placeholder="Member code (e.g. CC-000001)"
                  value={memberCodeInput}
                  onChange={(e) => setMemberCodeInput(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-canvas border border-border-light text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                />
                {lookedUpMember && (
                  <div className="mt-2 p-2 rounded-xl bg-status-success/10 text-xs text-accent-green font-medium flex items-center gap-1.5">
                    <UserCheck size={14} />
                    {lookedUpMember.full_name} — {lookedUpMember.tier}
                    {lookedUpMember.membership && ` (${lookedUpMember.membership.plan_code})`}
                  </div>
                )}
                {memberCodeInput.length >= 3 && !lookedUpMember && (
                  <p className="mt-1 text-xs text-accent-red">No member found</p>
                )}
              </div>
            ) : (
              <input
                type="text"
                placeholder="Guest name (optional)"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-canvas border border-border-light text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/30 mb-3"
              />
            )}

            {/* Cart items */}
            <div className="space-y-2 max-h-[30vh] overflow-y-auto mb-4">
              {cart.length === 0 ? (
                <div className="text-center py-8 text-text-tertiary text-sm">
                  Tap menu items to add
                </div>
              ) : (
                cart.map((c) => (
                  <div key={c.menuItem.id} className="flex items-start gap-2 p-2.5 rounded-xl bg-canvas">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{c.menuItem.name}</p>
                      <p className="text-xs text-text-tertiary">
                        {formatMoney(c.menuItem.price_paise)} × {c.qty} ={' '}
                        <span className="font-bold">{formatMoney(c.menuItem.price_paise * c.qty)}</span>
                      </p>
                      {/* Note input */}
                      <div className="mt-1 flex items-center gap-1">
                        <StickyNote size={12} className="text-text-tertiary flex-shrink-0" />
                        <input
                          type="text"
                          placeholder="Note…"
                          value={c.note}
                          onChange={(e) => setCartNote(c.menuItem.id, e.target.value)}
                          className="w-full h-6 px-1.5 rounded text-xs bg-surface border border-border-light text-text-secondary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-primary-500/30"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => updateCartQty(c.menuItem.id, -1)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface border border-border-light text-text-secondary hover:bg-border-light transition-colors"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-6 text-center text-sm font-bold text-text-primary">{c.qty}</span>
                      <button
                        onClick={() => updateCartQty(c.menuItem.id, 1)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface border border-border-light text-text-secondary hover:bg-border-light transition-colors"
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        onClick={() => setCart((prev) => prev.filter((ci) => ci.menuItem.id !== c.menuItem.id))}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-ink hover:bg-status-error transition-colors ml-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Cart summary */}
            {cart.length > 0 && (
              <div className="border-t border-border-light pt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">Subtotal (Estimate)</span>
                  <span className="font-bold text-text-primary">{formatMoney(cartSubtotal)}</span>
                </div>
                {isMember && lookedUpMember?.membership && (
                  <div className="flex justify-between text-sm text-ink font-semibold">
                    <span>Member discount</span>
                    <span className="font-medium">
                      {lookedUpMember.membership.plan_code === 'GOLD'
                        ? '15%'
                        : lookedUpMember.membership.plan_code === 'SILVER'
                        ? '5%'
                        : '10%'}{' '}
                      off
                    </span>
                  </div>
                )}

                {cartError && (
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-status-error text-ink border border-status-error-accent text-xs font-medium">
                    <AlertTriangle size={14} />
                    {cartError}
                  </div>
                )}

                {/* Payment method for direct pay */}
                <div className="flex gap-1.5">
                  {(['CASH', 'CARD', 'UPI'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setPaymentMethod(m)}
                      className={cn(
                        'flex-1 h-9 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all',
                        paymentMethod === m
                          ? 'bg-primary-500 text-white shadow-pill'
                          : 'bg-canvas text-text-secondary border border-border-light hover:border-primary-300',
                      )}
                    >
                      {m === 'CASH' ? <Banknote size={14} /> : m === 'CARD' ? <CreditCard size={14} /> : <Smartphone size={14} />}
                      {m}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    className="flex-1"
                    loading={createOrderMut.isPending}
                    onClick={handlePlaceOrder}
                  >
                    Place Order
                  </Button>
                  <Button variant="ghost" onClick={clearCart}>
                    Clear
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Tabs summary */}
          {tabsByMember.length > 0 && (
            <Card>
              <h2 className="text-base font-bold text-text-primary mb-3 flex items-center gap-2">
                <Wallet size={18} className="text-accent-purple" />
                Open Tabs
              </h2>
              <div className="space-y-2">
                {tabsByMember.map((tab) => (
                  <div
                    key={tab.member_id}
                    className="flex items-center justify-between p-3 rounded-xl bg-canvas"
                  >
                    <div>
                      <p className="text-sm font-medium text-text-primary">{tab.name}</p>
                      <p className="text-xs text-text-tertiary">{tab.code} · {tab.orders.length} orders</p>
                    </div>
                    <span className="text-sm font-bold text-accent-purple">{formatMoney(tab.total_paise)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* ── Order Detail Drawer ── */}
      <Drawer
        open={!!viewOrder}
        onClose={() => setViewOrder(null)}
        title={viewOrder ? `Order #${viewOrder.id}` : ''}
        side="right"
        className="!w-96"
      >
        {viewOrder && (
          <div className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <StatusChip
                label={viewOrder.kitchen_status}
                variant={
                  viewOrder.kitchen_status === 'NEW'
                    ? 'info'
                    : viewOrder.kitchen_status === 'PREPARING'
                    ? 'warning'
                    : viewOrder.kitchen_status === 'READY'
                    ? 'success'
                    : 'neutral'
                }
              />
              <StatusChip
                label={viewOrder.payment_status}
                variant={viewOrder.payment_status === 'PAID' ? 'success' : 'warning'}
              />
              {viewOrder.is_tab && <StatusChip label="TAB" variant="pending" />}
            </div>

            <div className="space-y-1">
              <p className="text-xs text-text-tertiary">Customer</p>
              <p className="text-sm font-medium text-text-primary">
                {viewOrder.member_name || viewOrder.guest_name || 'Walk-in'}
              </p>
              {viewOrder.table_label && (
                <p className="text-xs text-text-secondary">{viewOrder.table_label}</p>
              )}
              <p className="text-xs text-text-tertiary">
                <Clock size={12} className="inline mr-1" />
                {formatTimeIST(viewOrder.created_at ?? '')}
              </p>
            </div>

            <div className="border-t border-border-light pt-3">
              <h3 className="text-xs font-bold text-text-secondary mb-2 uppercase tracking-wider">Items</h3>
              <div className="space-y-1.5">
                {viewOrder.items.map((item, i) => (
                  <div key={i} className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-text-primary">
                        {item.name} × {item.qty}
                      </p>
                      {item.note && <p className="text-xs text-text-tertiary italic">{item.note}</p>}
                    </div>
                    <span className="text-sm font-medium text-text-primary">{formatMoney(item.line_total_paise)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border-light pt-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Subtotal</span>
                <span>{formatMoney(viewOrder.subtotal_paise)}</span>
              </div>
              {viewOrder.discount_paise > 0 && (
                <div className="flex justify-between text-sm text-accent-green">
                  <span>Discount</span>
                  <span>-{formatMoney(viewOrder.discount_paise)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Tax (5% GST)</span>
                <span>{formatMoney(viewOrder.tax_paise)}</span>
              </div>
              <div className="flex justify-between text-base font-bold pt-1 border-t border-border-light">
                <span>Total</span>
                <span>{formatMoney(viewOrder.total_paise)}</span>
              </div>
            </div>

            {viewOrder.payment_status === 'UNPAID' && (
              <div className="flex gap-2 pt-2">
                <Button
                  variant="primary"
                  className="flex-1"
                  icon={CreditCard}
                  onClick={() => {
                    setPayOrder(viewOrder)
                    setViewOrder(null)
                  }}
                >
                  Pay
                </Button>
                {!viewOrder.is_tab && viewOrder.member_id && (
                  <Button
                    variant="secondary"
                    icon={Wallet}
                    loading={putOnTabMut.isPending}
                    onClick={() => {
                      handlePutOnTab(viewOrder)
                      setViewOrder(null)
                    }}
                  >
                    Tab
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* ── Pay Order Modal ── */}
      <Modal open={!!payOrder} onClose={() => setPayOrder(null)} title={`Pay Order #${payOrder?.id}`} size="sm">
        {payOrder && (
          <div className="space-y-4">
            <div className="text-center py-3">
              <p className="text-3xl font-bold text-text-primary">{formatMoney(payOrder.total_paise)}</p>
              <p className="text-sm text-text-secondary mt-1">
                {payOrder.member_name || payOrder.guest_name || 'Walk-in'}
                {payOrder.table_label && ` · ${payOrder.table_label}`}
              </p>
            </div>

            <div className="flex gap-2">
              {(['CASH', 'CARD', 'UPI'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setPayMethod(m)}
                  className={cn(
                    'flex-1 h-12 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition-all',
                    payMethod === m
                      ? 'bg-primary-500 text-white shadow-pill'
                      : 'bg-canvas text-text-secondary border border-border-light hover:border-primary-300',
                  )}
                >
                  {m === 'CASH' ? <Banknote size={16} /> : m === 'CARD' ? <CreditCard size={16} /> : <Smartphone size={16} />}
                  {m}
                </button>
              ))}
            </div>

            <Button
              variant="primary"
              className="w-full"
              size="lg"
              loading={payBarMut.isPending}
              onClick={handlePayOrder}
            >
              Confirm Payment
            </Button>
          </div>
        )}
      </Modal>

      {/* ── Settle Tabs Drawer ── */}
      <Drawer
        open={settleDrawerOpen}
        onClose={() => setSettleDrawerOpen(false)}
        title="Settle Member Tabs"
        side="right"
        className="!w-96"
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">Member Code</label>
            <input
              type="text"
              placeholder="CC-000001"
              value={settleCode}
              onChange={(e) => setSettleCode(e.target.value)}
              className="w-full h-10 px-3 rounded-xl bg-canvas border border-border-light text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            />
          </div>

          {settleMember && (
            <div className="p-3 rounded-xl bg-status-success/10">
              <p className="text-sm font-medium text-text-primary">{settleMember.full_name}</p>
              <p className="text-xs text-text-secondary">{settleMember.member_code} · {settleMember.tier}</p>
            </div>
          )}

          {settleMember && (
            <>
              {/* Tabs for this member */}
              {tabsByMember
                .filter((t) => t.member_id === settleMember.id)
                .map((tab) => (
                  <div key={tab.member_id} className="space-y-2">
                    <p className="text-sm font-medium text-text-primary">
                      {tab.orders.length} tab orders · Total: <strong>{formatMoney(tab.total_paise)}</strong>
                    </p>
                    {tab.orders.map((o) => (
                      <div key={o.id} className="flex justify-between p-2 rounded-xl bg-canvas text-sm">
                        <span className="text-text-secondary">Order #{o.id}</span>
                        <span className="font-medium text-text-primary">{formatMoney(o.total_paise)}</span>
                      </div>
                    ))}
                  </div>
                ))}

              {tabsByMember.filter((t) => t.member_id === settleMember.id).length === 0 && (
                <EmptyState title="No open tabs" description="This member has no unsettled tabs" />
              )}

              <div>
                <label className="text-xs font-medium text-text-secondary mb-1 block">Payment Method</label>
                <div className="flex gap-2">
                  {(['CASH', 'CARD', 'UPI'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setSettleMethod(m)}
                      className={cn(
                        'flex-1 h-10 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition-all',
                        settleMethod === m
                          ? 'bg-primary-500 text-white shadow-pill'
                          : 'bg-canvas text-text-secondary border border-border-light',
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                variant="primary"
                className="w-full"
                size="lg"
                loading={settleTabsMut.isPending}
                onClick={handleSettleTabs}
                disabled={tabsByMember.filter((t) => t.member_id === settleMember.id).length === 0}
              >
                Settle All Tabs
              </Button>
            </>
          )}
        </div>
      </Drawer>
    </div>
  )
}
