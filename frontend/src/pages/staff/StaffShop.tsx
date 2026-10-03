import React, { useState } from 'react'
import type { Product, ProductCategory, PaymentMethod, ShopOrder } from '../../api/types'
import {
  useProducts,
  useCreateShopOrder,
  useMemberByCode,
  useErrorSimulation,
} from '../../api/hooks'
import { formatMoney, calcDiscountPaise, calcTaxPaise } from '../../lib/format'
import {
  Card,
  Button,
  StatusChip,
  Modal,
  useToast,
} from '../../components/ui'
import {
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  Search,
  CheckCircle,
  AlertTriangle,
  Receipt,
  UserCheck,
  UserX,
  CreditCard,
  Printer,
} from 'lucide-react'
import { cn } from '../../lib/utils'

export default function StaffShop() {
  const [activeCategory, setActiveCategory] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // Cart State
  const [cart, setCart] = useState<{ product: Product; qty: number }[]>([])
  const [isMember, setIsMember] = useState(true)
  const [memberCodeInput, setMemberCodeInput] = useState('CC-000001')
  const [guestName, setGuestName] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CARD')
  const [cartError, setCartError] = useState<string | null>(null)

  // Receipt Modal State
  const [receiptOrder, setReceiptOrder] = useState<ShopOrder | null>(null)

  const { toast } = useToast()
  const { currentError, setSimulatedError } = useErrorSimulation()

  const { data: products, isLoading } = useProducts(activeCategory)
  const { data: lookedUpMember } = useMemberByCode(isMember ? memberCodeInput : '')
  const createOrderMutation = useCreateShopOrder()

  // Calculate discount percentage
  const discountPct = isMember && lookedUpMember?.status === 'ACTIVE' && lookedUpMember?.membership
    ? lookedUpMember.membership.plan_code === 'GOLD'
      ? 15
      : lookedUpMember.membership.plan_code === 'SILVER'
      ? 5
      : 10
    : 0

  // Integer cart totals
  const subtotalPaise = cart.reduce((sum, item) => sum + item.product.price_paise * item.qty, 0)
  const discountPaise = calcDiscountPaise(subtotalPaise, discountPct)
  const totalPaise = subtotalPaise - discountPaise
  const taxPaise = calcTaxPaise(totalPaise, 5)

  // Cart controls
  const handleAddToCart = (product: Product) => {
    setCartError(null)
    if (product.stock_qty <= 0) {
      toast(`Item ${product.name} is currently out of stock`, 'error')
      return
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id)
      if (existing) {
        if (existing.qty >= product.stock_qty) {
          toast(`Cannot exceed available stock of ${product.stock_qty}`, 'warning')
          return prev
        }
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item
        )
      }
      return [...prev, { product, qty: 1 }]
    })
  }

  const handleUpdateQty = (productId: number, delta: number) => {
    setCartError(null)
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.qty + delta
            if (newQty > item.product.stock_qty) {
              toast(`Only ${item.product.stock_qty} in stock`, 'warning')
              return item
            }
            return { ...item, qty: newQty }
          }
          return item
        })
        .filter((item) => item.qty > 0)
    )
  }

  const handleCheckout = async () => {
    if (cart.length === 0) {
      setCartError('Cart is empty. Add products to proceed.')
      return
    }

    if (isMember && !lookedUpMember) {
      setCartError('Please enter a valid member code or switch to Walk-in Guest.')
      return
    }

    setCartError(null)
    try {
      const order = await createOrderMutation.mutateAsync({
        member_id: isMember && lookedUpMember ? lookedUpMember.id : null,
        guest_name: !isMember ? (guestName.trim() || 'Walk-in Guest') : null,
        channel: 'COUNTER',
        fulfilment: 'INSTORE',
        items: cart.map((item) => ({ product_id: item.product.id, qty: item.qty })),
        payment_method: paymentMethod,
      })

      setReceiptOrder(order)
      setCart([])
      toast('Counter order completed successfully', 'success')
    } catch (err: any) {
      const code = err?.error?.code ?? 'ERROR'
      if (code === 'OUT_OF_STOCK') {
        setCartError(err?.error?.message ?? 'One or more items in the cart are out of stock.')
      } else {
        setCartError(err?.error?.message ?? 'Checkout failed. Please retry.')
      }
    }
  }

  const filteredProducts = products?.filter((p) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
  })

  return (
    <div className="space-y-6">
      {/* Header with dev error toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Pro Shop — Counter POS</h1>
          <p className="text-sm text-text-secondary">Counter merchandise sales, inventory check, and receipt issue</p>
        </div>

        {import.meta.env.DEV && (
          <div className="flex items-center gap-1.5 p-1 bg-canvas rounded-pill border border-border-light text-xs">
            <span className="text-[10px] font-semibold text-text-tertiary px-2 uppercase">Simulate Error:</span>
            <button
              type="button"
              onClick={() => setSimulatedError(currentError === 'OUT_OF_STOCK' ? null : 'OUT_OF_STOCK')}
              className={cn(
                'px-2.5 py-0.5 rounded-pill text-[11px] font-medium transition-colors',
                currentError === 'OUT_OF_STOCK'
                  ? 'bg-status-error text-status-error-text font-bold'
                  : 'text-text-secondary hover:text-text-primary'
              )}
            >
              Out of Stock
            </button>
          </div>
        )}
      </div>

      {/* Main Grid: Catalog (2 cols on lg) + Cart Drawer / Panel (1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left 2 Cols: Catalog */}
        <div className="lg:col-span-2 space-y-4">
          {/* Categories & Search */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-canvas rounded-xl border border-border-light">
              <Search size={16} className="text-text-tertiary" />
              <input
                type="text"
                placeholder="Search products by title or SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent text-sm w-full outline-none text-text-primary"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-0.5">
              {(['ALL', 'RACKET', 'BALL', 'SHOE', 'ACCESSORY', 'APPAREL'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    'px-3.5 py-1.5 rounded-pill text-xs font-semibold whitespace-nowrap transition-colors touch-target',
                    activeCategory === cat
                      ? 'bg-primary-50 text-primary-600 border border-primary-200 shadow-pill'
                      : 'bg-canvas text-text-secondary hover:text-text-primary'
                  )}
                >
                  {cat === 'ALL' ? 'All Items' : cat}
                </button>
              ))}
            </div>
          </Card>

          {/* Products Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {filteredProducts?.map((product) => {
              const isLowStock = product.stock_qty <= product.reorder_level && product.stock_qty > 0
              const isOutOfStock = product.stock_qty <= 0

              return (
                <div
                  key={product.id}
                  className="p-4 rounded-2xl bg-surface border border-border-light shadow-soft hover:shadow-card transition-shadow flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-1 mb-2">
                      <span className="font-mono text-[10px] text-text-tertiary uppercase">{product.sku}</span>
                      {isOutOfStock ? (
                        <StatusChip label="Out of Stock" variant="error" />
                      ) : isLowStock ? (
                        <StatusChip label={`Low: ${product.stock_qty}`} variant="warning" />
                      ) : (
                        <span className="text-[10px] font-semibold text-status-success-text bg-status-success px-2 py-0.5 rounded-full">
                          {product.stock_qty} in stock
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-sm text-text-primary leading-snug">{product.name}</h3>
                    {product.variant && (
                      <p className="text-xs text-text-tertiary mt-0.5">{product.variant}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-border-light">
                    <span className="font-extrabold text-sm text-text-primary">
                      {formatMoney(product.price_paise)}
                    </span>
                    <Button
                      variant={isOutOfStock ? 'ghost' : 'secondary'}
                      size="sm"
                      icon={Plus}
                      disabled={isOutOfStock}
                      onClick={() => handleAddToCart(product)}
                      className="touch-target"
                    >
                      Add
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right 1 Col: Counter Cart */}
        <Card className="p-5 space-y-5 lg:sticky lg:top-20">
          <div className="flex items-center justify-between pb-3 border-b border-border-light">
            <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
              <ShoppingBag size={18} className="text-primary-600" />
              Counter Cart
            </h2>
            <span className="text-xs font-semibold text-text-tertiary">
              {cart.reduce((s, i) => s + i.qty, 0)} items
            </span>
          </div>

          {/* Member Discount Lookup */}
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsMember(true)}
                className={cn(
                  'flex-1 py-1.5 rounded-xl text-xs font-semibold border transition-colors touch-target',
                  isMember ? 'bg-primary-50 border-primary-500 text-primary-700' : 'bg-canvas border-transparent text-text-secondary'
                )}
              >
                Club Member
              </button>
              <button
                type="button"
                onClick={() => setIsMember(false)}
                className={cn(
                  'flex-1 py-1.5 rounded-xl text-xs font-semibold border transition-colors touch-target',
                  !isMember ? 'bg-primary-50 border-primary-500 text-primary-700' : 'bg-canvas border-transparent text-text-secondary'
                )}
              >
                Walk-in
              </button>
            </div>

            {isMember ? (
              <div className="space-y-1.5">
                <input
                  type="text"
                  placeholder="Member Code (e.g. CC-000001)"
                  value={memberCodeInput}
                  onChange={(e) => setMemberCodeInput(e.target.value.toUpperCase())}
                  className="w-full h-10 px-3 rounded-xl border border-border-light bg-canvas text-xs font-bold uppercase tracking-wider outline-none"
                />
                {lookedUpMember ? (
                  <div className="p-2.5 rounded-xl bg-primary-50/70 border border-primary-100 flex items-center justify-between text-xs">
                    <span className="font-bold text-primary-900 truncate">{lookedUpMember.full_name}</span>
                    <span className="font-bold text-primary-700 bg-white px-2 py-0.5 rounded-pill shadow-soft">
                      {discountPct}% OFF ({lookedUpMember.membership?.plan_code})
                    </span>
                  </div>
                ) : (
                  <p className="text-[11px] text-text-tertiary italic">Enter code for member discount</p>
                )}
              </div>
            ) : (
              <input
                type="text"
                placeholder="Walk-in Guest Name"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-border-light bg-canvas text-xs outline-none"
              />
            )}
          </div>

          {/* Cart Error Message */}
          {cartError && (
            <div className="p-3 rounded-xl bg-status-error border border-status-error-text/30 flex items-start gap-2">
              <AlertTriangle size={16} className="text-status-error-text flex-shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-status-error-text">{cartError}</p>
            </div>
          )}

          {/* Cart Items List */}
          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {cart.length === 0 ? (
              <p className="text-xs text-text-tertiary text-center py-6">No items in cart</p>
            ) : (
              cart.map(({ product, qty }) => (
                <div key={product.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-canvas text-xs">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-text-primary truncate">{product.name}</p>
                    <p className="text-text-tertiary">{formatMoney(product.price_paise)} each</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleUpdateQty(product.id, -1)}
                      className="w-6 h-6 rounded-lg bg-surface hover:bg-border-light flex items-center justify-center font-bold touch-target"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="font-bold w-5 text-center">{qty}</span>
                    <button
                      onClick={() => handleUpdateQty(product.id, 1)}
                      className="w-6 h-6 rounded-lg bg-surface hover:bg-border-light flex items-center justify-center font-bold touch-target"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  <span className="font-bold text-text-primary min-w-[50px] text-right">
                    {formatMoney(product.price_paise * qty)}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Totals Calculation */}
          <div className="space-y-2 pt-3 border-t border-border-light text-xs">
            <div className="flex justify-between text-text-secondary">
              <span>Subtotal:</span>
              <span>{formatMoney(subtotalPaise)}</span>
            </div>
            {discountPaise > 0 && (
              <div className="flex justify-between text-status-success-text font-semibold">
                <span>Member Discount ({discountPct}%):</span>
                <span>-{formatMoney(discountPaise)}</span>
              </div>
            )}
            <div className="flex justify-between text-text-secondary">
              <span>GST Included (5%):</span>
              <span>{formatMoney(taxPaise)}</span>
            </div>
            <div className="flex justify-between text-base font-extrabold text-text-primary pt-2 border-t border-border-light">
              <span>Total Payable:</span>
              <span className="text-primary-600">{formatMoney(totalPaise)}</span>
            </div>
          </div>

          {/* Payment Method */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Payment Method</label>
            <div className="grid grid-cols-3 gap-2">
              {(['CARD', 'UPI', 'CASH'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  className={cn(
                    'py-2 rounded-xl text-xs font-bold border transition-colors touch-target',
                    paymentMethod === m
                      ? 'bg-primary-50 border-primary-500 text-primary-700'
                      : 'bg-canvas border-transparent text-text-secondary'
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <Button
            variant="primary"
            className="w-full h-11"
            loading={createOrderMutation.isPending}
            disabled={cart.length === 0}
            onClick={handleCheckout}
          >
            Collect {formatMoney(totalPaise)}
          </Button>
        </Card>
      </div>

      {/* ── RECEIPT MODAL ────────────────────────────────────────────────── */}
      <Modal
        open={receiptOrder !== null}
        onClose={() => setReceiptOrder(null)}
        title="Payment Receipt"
      >
        {receiptOrder && (
          <div className="space-y-4">
            <div className="text-center pb-3 border-b border-border-light">
              <span className="w-10 h-10 rounded-full bg-status-success text-status-success-text flex items-center justify-center mx-auto mb-2">
                <CheckCircle size={24} />
              </span>
              <h3 className="font-extrabold text-lg text-text-primary">Payment Successful</h3>
              <p className="text-xs text-text-secondary">Order #{receiptOrder.id} · Counter Sale</p>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-text-secondary">
                <span>Customer:</span>
                <span className="font-bold text-text-primary">
                  {receiptOrder.member_name ?? receiptOrder.guest_name ?? 'Walk-in'}
                </span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>Date:</span>
                <span>{new Date(receiptOrder.created_at).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>Method:</span>
                <span className="font-bold">{paymentMethod}</span>
              </div>
            </div>

            {/* Line items */}
            <div className="py-2 border-y border-border-light space-y-1.5 text-xs">
              {receiptOrder.items.map((it, idx) => (
                <div key={idx} className="flex justify-between">
                  <span className="text-text-primary">
                    {it.qty} × {it.name}
                  </span>
                  <span className="font-semibold">{formatMoney(it.line_total_paise)}</span>
                </div>
              ))}
            </div>

            {/* Receipt Summary */}
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-text-secondary">
                <span>Subtotal:</span>
                <span>{formatMoney(receiptOrder.subtotal_paise)}</span>
              </div>
              {receiptOrder.discount_paise > 0 && (
                <div className="flex justify-between text-status-success-text">
                  <span>Discount Applied:</span>
                  <span>-{formatMoney(receiptOrder.discount_paise)}</span>
                </div>
              )}
              <div className="flex justify-between text-text-secondary">
                <span>GST Tax (5%):</span>
                <span>{formatMoney(receiptOrder.tax_paise)}</span>
              </div>
              <div className="flex justify-between text-base font-extrabold text-text-primary pt-2 border-t border-border-light">
                <span>Total Paid:</span>
                <span className="text-primary-600">{formatMoney(receiptOrder.total_paise)}</span>
              </div>
            </div>

            <div className="pt-3 flex gap-3">
              <Button
                variant="secondary"
                icon={Printer}
                className="flex-1"
                onClick={() => toast('Print job sent to counter receipt printer', 'info')}
              >
                Print Receipt
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => setReceiptOrder(null)}
              >
                New Sale
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
