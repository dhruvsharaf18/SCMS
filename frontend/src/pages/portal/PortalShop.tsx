import React, { useState, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import type {
  Product,
  ProductCategory,
  ShopFulfilment,
  PaymentMethod,
} from '../../api/types'
import {
  useProducts,
  useMember,
  useCreateShopOrder,
  useErrorSimulation,
} from '../../api/hooks'
import { useAuth } from '../../hooks/useAuth'
import {
  formatMoney,
  calcDiscountPaise,
  calcShopTaxPaise,
} from '../../lib/format'
import { getProductPresentation } from '../../lib/product-presentation'
import {
  Card,
  Button,
  Modal,
  Drawer,
  EmptyState,
  Skeleton,
  useToast,
} from '../../components/ui'
import {
  ShoppingBag,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Package,
  Sparkles,
  Truck,
  Store,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Search,
} from 'lucide-react'

interface CartItem {
  product: Product
  quantity: number
}

const CATEGORIES: { id: 'ALL' | ProductCategory; label: string }[] = [
  { id: 'ALL', label: 'All Items' },
  { id: 'RACKET', label: 'Rackets' },
  { id: 'BALL', label: 'Balls & Shuttles' },
  { id: 'SHOE', label: 'Footwear' },
  { id: 'APPAREL', label: 'Apparel' },
  { id: 'ACCESSORY', label: 'Accessories' },
]

export default function PortalShop() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const memberId = user?.member_id ?? 1

  const { data: member } = useMember(memberId)
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | ProductCategory>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  const {
    data: products = [],
    isLoading,
    isError,
    refetch,
  } = useProducts(selectedCategory === 'ALL' ? undefined : selectedCategory)

  const createOrderMutation = useCreateShopOrder()
  const { currentError, setSimulatedError } = useErrorSimulation()

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([])
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [fulfilment, setFulfilment] = useState<ShopFulfilment>('PICKUP')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('ONLINE_MOCK')
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  // Success modal state
  const [completedOrder, setCompletedOrder] = useState<{
    id: number
    total: number
    fulfilment: ShopFulfilment
  } | null>(null)

  // Filter products by search query
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products
    const q = searchQuery.toLowerCase()
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q)
    )
  }, [products, searchQuery])

  // Member discount percentage based on active membership tier (SRS §1.4 & §4.6)
  const discountPct = useMemo(() => {
    if (!member || member.status !== 'ACTIVE') return 0
    switch (member.tier) {
      case 'GOLD':
        return 15
      case 'SILVER':
        return 5
      case 'JUNIOR':
        return 10
      default:
        return 0
    }
  }, [member])

  // Cart totals using strict integer money rules
  const subtotalPaise = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.product.price_paise * item.quantity, 0)
  }, [cart])

  const discountPaise = useMemo(() => {
    return calcDiscountPaise(subtotalPaise, discountPct)
  }, [subtotalPaise, discountPct])

  const totalPaise = useMemo(() => {
    return Math.max(0, subtotalPaise - discountPaise)
  }, [subtotalPaise, discountPaise])

  const gstPaise = useMemo(() => {
    return calcShopTaxPaise(totalPaise)
  }, [totalPaise])

  const totalCartCount = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.quantity, 0)
  }, [cart])

  // Cart actions
  const addToCart = (product: Product) => {
    if (product.stock_qty <= 0) return
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id)
      if (existing) {
        if (existing.quantity >= Math.min(product.stock_qty, 20)) {
          toast(
            `You cannot add more than ${Math.min(product.stock_qty, 20)} of this item.`,
            'warning'
          )
          return prev
        }
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [...prev, { product, quantity: 1 }]
    })
    toast(`${product.name} added to your basket.`, 'success')
  }

  const updateQuantity = (productId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const nextQty = item.quantity + delta
            if (nextQty <= 0) return null
            if (nextQty > Math.min(item.product.stock_qty, 20)) {
              toast(`Only ${item.product.stock_qty} available in stock.`, 'warning')
              return item
            }
            return { ...item, quantity: nextQty }
          }
          return item
        })
        .filter((item): item is CartItem => item !== null)
    )
  }

  const removeFromCart = (productId: number) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId))
  }

  const handleCheckout = async () => {
    setCheckoutError(null)

    if (cart.length === 0) {
      setCheckoutError('Your cart is empty. Please add items before checking out.')
      return
    }

    if (fulfilment === 'DELIVERY' && !deliveryAddress.trim()) {
      setCheckoutError('Please enter a delivery address for home delivery.')
      return
    }

    try {
      const order = await createOrderMutation.mutateAsync({
        member_id: memberId,
        channel: 'ONLINE',
        items: cart.map((item) => ({
          product_id: item.product.id,
          qty: item.quantity,
        })),
        payment_method: paymentMethod,
        fulfilment: fulfilment,
        delivery_address: fulfilment === 'DELIVERY' ? deliveryAddress.trim() : undefined,
      })

      // Success
      setCompletedOrder({
        id: order.id,
        total: order.total_paise,
        fulfilment: order.fulfilment,
      })
      setCart([])
      setIsCartOpen(false)
      setDeliveryAddress('')
      toast(`Order #ORD-${order.id} placed successfully.`, 'success')
    } catch (err: any) {
      const msg =
        err?.message ||
        (err?.code === 'OUT_OF_STOCK'
          ? 'One or more items in your cart are currently out of stock.'
          : err?.code === 'ADDRESS_REQUIRED'
          ? 'A valid delivery address is required for home delivery.'
          : 'Failed to place order. Please try again.')
      setCheckoutError(msg)
    }
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Pro Shop</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Official equipment, apparel, and accessories for Champions Club members.
          </p>
        </div>

        {/* Member Tier Discount Badge */}
        {discountPct > 0 && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-50 border border-primary-200 text-primary-600 text-xs font-semibold self-start sm:self-auto">
            <Sparkles size={14} />
            <span>
              {member?.tier} Tier: {discountPct}% discount applied at checkout
            </span>
          </div>
        )}
      </div>

      {/* Search & Category Filter Chips */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary" size={18} />
          <input
            type="text"
            placeholder="Search gear, balls, footwear, rackets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border-light rounded-xl text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all touch-manipulation min-h-[44px] ${
                  isSelected
                    ? 'bg-primary-500 text-white font-bold shadow-sm'
                    : 'bg-surface hover:bg-canvas text-text-secondary border border-border-light'
                }`}
              >
                {cat.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Products Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="p-4 bg-surface rounded-2xl border border-border-light space-y-3">
              <Skeleton className="w-full h-36 rounded-xl" />
              <Skeleton className="w-3/4 h-4 rounded" />
              <Skeleton className="w-1/2 h-4 rounded" />
              <Skeleton className="w-full h-10 rounded-xl" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <Card className="p-8 text-center">
          <AlertTriangle className="mx-auto text-status-error mb-3" size={32} />
          <h3 className="text-base font-bold text-text-primary mb-1">Failed to load catalogue</h3>
          <p className="text-sm text-text-secondary mb-4">
            Could not fetch club shop products. Please check your connection.
          </p>
          <Button variant="secondary" onClick={() => refetch()}>
            Retry
          </Button>
        </Card>
      ) : filteredProducts.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="No products found"
          description={
            searchQuery
              ? `No items matching "${searchQuery}". Try another search term or filter.`
              : 'No products currently available in this category.'
          }
          action={
            searchQuery ? (
              <Button variant="secondary" onClick={() => setSearchQuery('')}>
                Clear Search
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredProducts.map((product) => {
            const inStock = product.stock_qty > 0
            const cartItem = cart.find((i) => i.product.id === product.id)
            const isDiscounted = discountPct > 0

            return (
              <Card
                key={product.id}
                className="flex flex-col justify-between overflow-hidden hover:shadow-card-hover transition-all duration-200 border-border-light group"
              >
                <div className="p-4 space-y-3">
                  {/* Category Chip & Stock Indicator (SRS §1.4: never exact count) */}
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-canvas border border-border-light text-text-tertiary">
                      {product.category}
                    </span>
                    <span
                      className={`text-xs font-semibold flex items-center gap-1.5 ${
                        inStock ? 'text-accent-green' : 'text-accent-red'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          inStock ? 'bg-accent-green' : 'bg-accent-red'
                        }`}
                      />
                      {inStock ? 'In stock' : 'Out of stock'}
                    </span>
                  </div>

                  {/* Product Visual Frame */}
                  <Link to={`/shop/${product.id}`} className="block group">
                    <div className="w-full h-32 rounded-xl bg-canvas flex items-center justify-center border border-border-light group-hover:border-primary-200 transition-colors overflow-hidden">
                      {getProductPresentation(product.sku).imagePath ? (
                        <img
                          src={getProductPresentation(product.sku).imagePath}
                          alt={getProductPresentation(product.sku).imageAlt}
                          className="w-full h-full object-contain p-2"
                        />
                      ) : (
                        <Package className="text-text-tertiary group-hover:text-primary-500 transition-colors" size={40} />
                      )}
                    </div>
                  </Link>

                  {/* Product Info */}
                  <Link to={`/shop/${product.id}`} className="block group">
                    <h3 className="font-bold text-text-primary text-base line-clamp-1 group-hover:text-primary-600 transition-colors">
                      {product.name}
                    </h3>
                    <p className="text-xs text-text-tertiary mt-0.5">SKU: {product.sku}</p>
                  </Link>

                  {/* Pricing */}
                  <div className="pt-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-bold text-primary-600">
                        {formatMoney(product.price_paise)}
                      </span>
                      {isDiscounted && (
                        <span className="text-xs text-accent-green font-medium">
                          -{discountPct}% tier
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Action */}
                <div className="p-4 pt-0">
                  {inStock ? (
                    cartItem ? (
                      <div className="flex items-center justify-between bg-canvas rounded-xl p-1 border border-border-light">
                        <button
                          onClick={() => updateQuantity(product.id, -1)}
                          className="w-9 h-9 rounded-lg flex items-center justify-center bg-surface hover:bg-canvas text-text-primary border border-border-light touch-manipulation transition-colors"
                          aria-label="Decrease quantity"
                        >
                          <Minus size={16} />
                        </button>
                        <span className="text-sm font-bold text-text-primary">
                          {cartItem.quantity} in cart
                        </span>
                        <button
                          onClick={() => updateQuantity(product.id, 1)}
                          disabled={cartItem.quantity >= product.stock_qty}
                          className="w-9 h-9 rounded-lg flex items-center justify-center bg-surface hover:bg-canvas text-text-primary border border-border-light disabled:opacity-40 touch-manipulation transition-colors"
                          aria-label="Increase quantity"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    ) : (
                      <Button
                        variant="primary"
                        onClick={() => addToCart(product)}
                        className="w-full gap-2 min-h-[44px]"
                      >
                        <ShoppingCart size={16} />
                        <span>Add to Cart</span>
                      </Button>
                    )
                  ) : (
                    <Button variant="secondary" disabled className="w-full min-h-[44px]">
                      Out of Stock
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Floating Cart Trigger Button */}
      {totalCartCount > 0 && (
        <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 animate-slide-up">
          <button
            onClick={() => setIsCartOpen(true)}
            className="flex items-center gap-3 px-5 py-3.5 bg-primary-500 hover:bg-primary-600 text-white rounded-full shadow-raised transition-all touch-manipulation group"
          >
            <div className="relative">
              <ShoppingCart size={22} />
              <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-accent-red text-white text-[11px] font-extrabold flex items-center justify-center border-2 border-primary-500">
                {totalCartCount}
              </span>
            </div>
            <div className="text-left">
              <p className="text-[10px] uppercase font-bold tracking-wider opacity-90">Your Basket</p>
              <p className="text-sm font-extrabold">{formatMoney(totalPaise)}</p>
            </div>
          </button>
        </div>
      )}

      {/* Cart Drawer */}
      <Drawer
        open={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        title={`Shopping Cart (${totalCartCount})`}
        side="right"
        className="w-full max-w-md"
      >
        <div className="flex flex-col h-full space-y-6">
          {/* Cart Items List */}
          {cart.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
              <ShoppingBag size={48} className="text-text-tertiary mb-3 stroke-[1.5]" />
              <h4 className="text-base font-bold text-text-primary">Your cart is empty</h4>
              <p className="text-xs text-text-secondary mt-1 max-w-xs">
                Browse our pro shop catalogue and add rackets, shoes, or accessories.
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {cart.map(({ product, quantity }) => {
                const lineTotal = product.price_paise * quantity
                return (
                  <div
                    key={product.id}
                    className="p-3 bg-canvas rounded-xl border border-border-light flex items-center justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-text-primary truncate">
                        {product.name}
                      </h4>
                      <p className="text-xs text-text-tertiary mt-0.5">
                        {formatMoney(product.price_paise)} each
                      </p>
                      <p className="text-xs font-bold text-primary-600 mt-1">
                        Line: {formatMoney(lineTotal)}
                      </p>
                    </div>

                    {/* Quantity Selector */}
                    <div className="flex items-center gap-1.5 bg-surface rounded-lg p-1 border border-border-light">
                      <button
                        onClick={() => updateQuantity(product.id, -1)}
                        className="w-7 h-7 rounded flex items-center justify-center hover:bg-canvas text-text-secondary"
                        aria-label="Decrease"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-6 text-center text-xs font-bold text-text-primary">
                        {quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(product.id, 1)}
                        disabled={quantity >= product.stock_qty}
                        className="w-7 h-7 rounded flex items-center justify-center hover:bg-canvas text-text-secondary disabled:opacity-40"
                        aria-label="Increase"
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    {/* Delete Item */}
                    <button
                      onClick={() => removeFromCart(product.id)}
                      className="p-2 text-text-tertiary hover:text-accent-red transition-colors"
                      aria-label="Remove item"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {cart.length > 0 && (
            <div className="space-y-4 pt-4 border-t border-border-light">
              {/* Fulfilment Selector */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-text-secondary block mb-2">
                  Fulfilment Option
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFulfilment('PICKUP')}
                    className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all ${
                      fulfilment === 'PICKUP'
                        ? 'border-primary-500 bg-primary-50 text-primary-600 font-semibold'
                        : 'border-border-light bg-surface text-text-secondary hover:bg-canvas'
                    }`}
                  >
                    <Store size={18} className="shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-text-primary">Club Pickup</div>
                      <div className="text-[10px] text-text-tertiary">Collect at Pro Desk</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFulfilment('DELIVERY')}
                    className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all ${
                      fulfilment === 'DELIVERY'
                        ? 'border-primary-500 bg-primary-50 text-primary-600 font-semibold'
                        : 'border-border-light bg-surface text-text-secondary hover:bg-canvas'
                    }`}
                  >
                    <Truck size={18} className="shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-text-primary">Home Delivery</div>
                      <div className="text-[10px] text-text-tertiary">Delivered to residence</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Delivery Address Field */}
              {fulfilment === 'DELIVERY' && (
                <div className="space-y-1.5 animate-slide-up">
                  <label className="text-xs font-bold text-text-secondary flex items-center justify-between">
                    <span>Delivery Address *</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Enter flat/house no, street, city & pincode"
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-surface border border-border-light rounded-xl text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary-500"
                  />
                </div>
              )}

              {/* Payment Method */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-text-secondary block mb-2">
                  Payment Method
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('ONLINE_MOCK')}
                    className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all ${
                      paymentMethod === 'ONLINE_MOCK'
                        ? 'border-primary-500 bg-primary-50 text-primary-600 font-semibold'
                        : 'border-border-light bg-surface text-text-secondary hover:bg-canvas'
                    }`}
                  >
                    <CreditCard size={18} className="shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-text-primary">Pay Online</div>
                      <div className="text-[10px] text-text-tertiary">UPI / Card / NetBanking</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('CASH')}
                    disabled={fulfilment === 'DELIVERY'}
                    className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all ${
                      paymentMethod === 'CASH'
                        ? 'border-primary-500 bg-primary-50 text-primary-600 font-semibold'
                        : 'border-border-light bg-surface text-text-secondary hover:bg-canvas'
                    } ${fulfilment === 'DELIVERY' ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <Store size={18} className="shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-text-primary">Pay at Club</div>
                      <div className="text-[10px] text-text-tertiary">Cash / Card on pickup</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Pricing Breakdown (SRS 1.4 & 4.6) */}
              <div className="p-3.5 bg-canvas rounded-xl border border-border-light space-y-2 text-xs">
                <div className="flex justify-between text-text-secondary">
                  <span>Subtotal</span>
                  <span className="font-semibold text-text-primary">
                    {formatMoney(subtotalPaise)}
                  </span>
                </div>

                {discountPct > 0 && (
                  <div className="flex justify-between text-accent-green font-medium">
                    <span>Member Tier Discount ({member?.tier} {discountPct}%)</span>
                    <span>-{formatMoney(discountPaise)}</span>
                  </div>
                )}

                <div className="pt-2 border-t border-border-light flex justify-between items-baseline">
                  <div>
                    <span className="text-sm font-bold text-text-primary">Total to Pay</span>
                    <p className="text-[11px] text-text-tertiary">
                      includes {formatMoney(gstPaise)} GST (18%)
                    </p>
                  </div>
                  <span className="text-lg font-extrabold text-primary-600">
                    {formatMoney(totalPaise)}
                  </span>
                </div>
              </div>

              {/* Dev Simulation Error Box */}
              {currentError && (
                <div className="p-2.5 bg-accent-yellow/10 border border-accent-yellow/30 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-accent-yellow font-medium">
                    <AlertTriangle size={14} />
                    <span>Mock Error Active: {currentError}</span>
                  </div>
                  <button
                    onClick={() => setSimulatedError(null)}
                    className="text-accent-yellow hover:underline font-bold text-[10px]"
                  >
                    Clear
                  </button>
                </div>
              )}

              {/* Checkout Error Message */}
              {checkoutError && (
                <div className="p-3 bg-status-error border border-accent-red/20 rounded-xl text-accent-red text-xs flex items-start gap-2">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <span>{checkoutError}</span>
                </div>
              )}

              {/* Place Order CTA Button */}
              <Button
                variant="primary"
                disabled={createOrderMutation.isPending}
                onClick={handleCheckout}
                className="w-full gap-2 min-h-[46px] font-bold"
              >
                {createOrderMutation.isPending ? (
                  'Processing Order...'
                ) : (
                  <>
                    <span>Place Order • {formatMoney(totalPaise)}</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </Drawer>

      {/* Order Confirmation Modal */}
      {completedOrder && (
        <Modal
          open={!!completedOrder}
          onClose={() => setCompletedOrder(null)}
          title="Order Confirmed!"
          size="md"
        >
          <div className="text-center space-y-4 py-2">
            <div className="w-16 h-16 rounded-full bg-status-success text-accent-green flex items-center justify-center mx-auto border border-accent-green/20 animate-scale-in">
              <CheckCircle2 size={36} />
            </div>

            <div>
              <h3 className="text-lg font-bold text-text-primary">
                Order #ORD-{completedOrder.id}
              </h3>
              <p className="text-xs text-text-secondary mt-1">
                Total Paid/Due: <strong className="text-text-primary">{formatMoney(completedOrder.total)}</strong>
              </p>
            </div>

            <div className="p-4 bg-canvas rounded-xl border border-border-light text-left space-y-2 text-xs">
              <div className="flex items-center gap-2 text-text-primary font-bold">
                {completedOrder.fulfilment === 'PICKUP' ? (
                  <>
                    <Store size={16} className="text-primary-500" />
                    <span>Club Pro-Shop Pickup</span>
                  </>
                ) : (
                  <>
                    <Truck size={16} className="text-primary-500" />
                    <span>Home Delivery Dispatch</span>
                  </>
                )}
              </div>
              <p className="text-text-secondary">
                {completedOrder.fulfilment === 'PICKUP'
                  ? 'Your items will be packed and ready for collection at the Pro Shop desk within 30 minutes.'
                  : 'Your package is queued for club courier delivery. You will receive SMS dispatch updates.'}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => setCompletedOrder(null)}
              >
                Continue Shopping
              </Button>
              <Button
                variant="primary"
                className="w-full"
                onClick={() => {
                  setCompletedOrder(null)
                  navigate('/portal/orders')
                }}
              >
                View My Orders
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
