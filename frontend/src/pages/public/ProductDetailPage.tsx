import React, { useState } from 'react'
import { useParams, useNavigate, Link, Navigate } from 'react-router-dom'
import {
  Package,
  ShoppingCart,
  Zap,
  LogIn,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronLeft,
  Tag,
  Layers,
} from 'lucide-react'
import { Button, Card, Skeleton, useToast } from '../../components/ui'
import { usePublicProduct, usePublicProducts, useProducts } from '../../api/hooks'
import { publicToProduct, MEMBER_LINE_CAP } from '../../api/mappers'
import { useAuth } from '../../hooks/useAuth'
import { useCart } from '../../lib/cart-context'
import { formatMoney } from '../../lib/format'
import { getProductPresentation } from '../../lib/product-presentation'
import type { PublicProduct } from '../../api/types'

const SHOP_STAFF_ROLES = ['OWNER', 'MANAGER', 'FRONT_DESK']

// ── Product Image Component ────────────────────────────────────────────────
function ProductImage({
  sku,
  name,
  className = '',
}: {
  sku: string
  name: string
  className?: string
}) {
  const { imagePath, imageAlt } = getProductPresentation(sku)
  const [imgError, setImgError] = useState(false)

  if (!imagePath || imgError) {
    return (
      <div
        className={`flex items-center justify-center bg-canvas rounded-2xl border border-border-light ${className}`}
        aria-label={`${name} — no image available`}
      >
        <Package className="text-text-tertiary" size={64} />
      </div>
    )
  }

  return (
    <img
      src={imagePath}
      alt={imageAlt || name}
      className={`object-contain ${className}`}
      onError={() => setImgError(true)}
    />
  )
}

// ── Related Products Row ───────────────────────────────────────────────────
function RelatedProductCard({ product }: { product: PublicProduct }) {
  const navigate = useNavigate()
  const { imagePath, imageAlt } = getProductPresentation(product.sku)
  const [imgError, setImgError] = useState(false)

  return (
    <button
      onClick={() => navigate(`/shop/${product.id}`)}
      className="flex flex-col gap-3 p-3 bg-surface rounded-2xl border border-border-light hover:border-primary-300 hover:shadow-card-hover transition-all duration-200 text-left group w-full"
      aria-label={`View ${product.name}`}
    >
      <div className="w-full h-24 rounded-xl bg-canvas border border-border-light flex items-center justify-center overflow-hidden">
        {imagePath && !imgError ? (
          <img
            src={imagePath}
            alt={imageAlt || product.name}
            className="w-full h-full object-contain p-2"
            onError={() => setImgError(true)}
          />
        ) : (
          <Package className="text-text-tertiary group-hover:text-primary-400 transition-colors" size={32} />
        )}
      </div>
      <div>
        <p className="text-xs font-bold text-text-primary line-clamp-2">{product.name}</p>
        <p className="text-xs font-semibold text-primary-600 mt-0.5">{formatMoney(product.price_paise)}</p>
      </div>
    </button>
  )
}

// ── Main ProductDetailPage ─────────────────────────────────────────────────
export default function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isLoggedIn = user !== null
  const isMember = user?.role === 'MEMBER'

  const parsedId = productId ? parseInt(productId, 10) : NaN
  const validId = Number.isInteger(parsedId) && parsedId > 0
  const numericId = validId ? parsedId : null

  const {
    data: product,
    isLoading,
    isError,
    refetch,
  } = usePublicProduct(numericId)

  // Related products (same category, max 4, excluding current)
  const { data: allProducts = [] } = usePublicProducts(product?.category)
  const related = allProducts.filter((p) => p.id !== numericId).slice(0, 4)

  const canBuy = isMember || (!!user && SHOP_STAFF_ROLES.includes(user.role))
  // Staff carts need real stock levels from /products; members get the public catalogue.
  const { data: buyableProducts = [] } = useProducts()
  const { addOne } = useCart()
  const { toast } = useToast()
  const [addedToCart, setAddedToCart] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)

  // Validate id is a positive integer
  if (!validId) {
    return <Navigate to="/shop" replace />
  }

  // ── Loading state ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6 pb-12">
        <Skeleton className="w-32 h-4 rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Skeleton className="w-full h-80 rounded-2xl" />
          <div className="space-y-4">
            <Skeleton className="w-3/4 h-8 rounded" />
            <Skeleton className="w-1/3 h-6 rounded" />
            <Skeleton className="w-full h-32 rounded-xl" />
            <Skeleton className="w-full h-12 rounded-xl" />
          </div>
        </div>
      </div>
    )
  }

  // ── Error state ────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="py-16 flex flex-col items-center gap-4">
        <AlertTriangle className="text-status-error" size={40} />
        <h2 className="font-bold text-text-primary text-lg">Failed to load product</h2>
        <Button variant="secondary" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  // ── 404 state ──────────────────────────────────────────────────────────
  if (!product) {
    return (
      <div className="py-16 flex flex-col items-center gap-4 text-center">
        <Package className="text-text-tertiary" size={48} />
        <h2 className="font-bold text-text-primary text-xl">Product not found</h2>
        <p className="text-sm text-text-secondary max-w-xs">
          This product may have been removed or the URL is incorrect.
        </p>
        <Link to="/shop">
          <Button variant="secondary">Back to Shop</Button>
        </Link>
      </div>
    )
  }

  // ── Presentation layer (image, bullets) ───────────────────────────────
  const presentation = getProductPresentation(product.sku)
  // Use API description as bullets if available; fall back to presentation layer
  const bullets =
    presentation.bullets.length > 0
      ? presentation.bullets
      : product.description
      ? [product.description]
      : []

  // ── Discount display (API-computed; only show if member is entitled) ──
  // We show the member's tier discount % from the API response (plan).
  // The UI never calculates price itself — that is the server's job.
  // For the public page we only show the badge; actual discounted price is shown in portal.
  const showDiscountBadge = isMember

  // ── "Log in to order" redirect path (returns user to this product) ────
  const loginTarget = `/login?next=/shop/${product.id}`

  // ── Actions ───────────────────────────────────────────────────────────
  // Both buttons only touch the shared cart; the order is placed from the cart's checkout.
  function addToSharedCart(): 'added' | 'full' | 'unavailable' {
    setOrderError(null)
    const buyable = buyableProducts.find((p) => p.id === product!.id)
    if (!buyable && !isMember) {
      setOrderError('This product is not available at the counter right now.')
      return 'unavailable'
    }
    const line = buyable ?? publicToProduct(product!)
    const maxQty = isMember ? Math.min(line.stock_qty, MEMBER_LINE_CAP) : line.stock_qty
    if (maxQty <= 0) {
      setOrderError('Out of stock.')
      return 'unavailable'
    }
    return addOne(line, maxQty) ? 'added' : 'full'
  }

  function handleAddToCart() {
    if (!canBuy) {
      navigate(loginTarget)
      return
    }
    const result = addToSharedCart()
    if (result === 'full') {
      setOrderError('Your cart already holds the most you can order of this item.')
      return
    }
    if (result !== 'added') return
    toast(`${product!.name} added to your cart.`, 'success')
    setAddedToCart(true)
    setTimeout(() => setAddedToCart(false), 3000)
  }

  function handleBuyNow() {
    if (!canBuy) {
      navigate(loginTarget)
      return
    }
    if (addToSharedCart() === 'unavailable') return
    navigate(isMember ? '/portal/shop?cart=open' : '/staff/shop')
  }

  return (
    <div className="space-y-8 pb-12">
      {/* ── Breadcrumb ─────────────────────────────────────────────────── */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-text-tertiary">
        <Link to="/shop" className="flex items-center gap-1 hover:text-primary-600 transition-colors font-medium">
          <ChevronLeft size={14} />
          <span>Shop</span>
        </Link>
        <span>/</span>
        <span className="text-text-secondary font-medium">{product.name}</span>
      </nav>

      {/* ── Main Detail Grid ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
        {/* Left: Product Image */}
        <div className="flex flex-col gap-4">
          <div className="w-full h-72 sm:h-96 rounded-2xl bg-canvas border border-border-light flex items-center justify-center overflow-hidden shadow-soft">
            <ProductImage
              sku={product.sku}
              name={product.name}
              className="w-full h-full p-6"
            />
          </div>

          {/* SKU label */}
          {product.sku && (
            <p className="text-[11px] text-text-tertiary text-center">
              SKU: <span className="font-mono font-semibold">{product.sku}</span>
            </p>
          )}
        </div>

        {/* Right: Product Info */}
        <div className="flex flex-col gap-5">
          {/* Category & Stock */}
          <div className="flex items-center justify-between">
            <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest bg-canvas border border-border-light text-text-tertiary">
              {product.category}
            </span>
            <span
              className={`text-xs font-semibold flex items-center gap-1.5 ${
                product.in_stock ? 'text-accent-green' : 'text-accent-red'
              }`}
            >
              {product.in_stock ? (
                <CheckCircle2 size={14} />
              ) : (
                <XCircle size={14} />
              )}
              {/* S-15: Public page shows In stock / Out of stock only — never exact qty */}
              {product.in_stock ? 'In stock' : 'Out of stock'}
            </span>
          </div>

          {/* Name */}
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-text-primary">
              {product.name}
            </h1>
            {product.variant && (
              <p className="text-sm text-text-secondary mt-1 flex items-center gap-1.5">
                <Layers size={14} className="text-text-tertiary shrink-0" />
                {product.variant}
              </p>
            )}
          </div>

          {/* Price */}
          <div className="flex items-center gap-3">
            <span className="text-3xl font-extrabold text-primary-600">
              {formatMoney(product.price_paise)}
            </span>
            {showDiscountBadge && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary-50 border border-primary-200 text-primary-600 text-xs font-bold">
                <Tag size={12} />
                Member discount applied at checkout
              </span>
            )}
          </div>
          <p className="text-[11px] text-text-tertiary -mt-3">Includes 18% GST</p>

          {/* Description Bullets */}
          {bullets.length > 0 && (
            <Card className="p-4 rounded-2xl bg-canvas border border-border-light">
              <ul className="space-y-2">
                {bullets.map((bullet, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-xs text-text-secondary">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary-400 mt-1.5 shrink-0" />
                    {/* Text only — never dangerouslySetInnerHTML */}
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Error banner */}
          {orderError && (
            <div
              role="alert"
              className="flex items-start gap-2 p-3 rounded-xl bg-status-error border border-accent-red/20 text-xs text-accent-red"
            >
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{orderError}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            {!isLoggedIn ? (
              // Not logged in: show "Log in to order" — return to this product after login
              <Link to={loginTarget} className="flex-1">
                <Button
                  variant="primary"
                  pill
                  className="w-full min-h-[48px] text-sm font-bold gap-2"
                  iconRight={LogIn}
                >
                  Log in to Order
                </Button>
              </Link>
            ) : !canBuy ? (
              <p className="text-xs text-text-tertiary">
                Shop orders are placed by members online or by front-desk staff at the counter.
              </p>
            ) : (
              <>
                <Button
                  id="btn-add-to-cart"
                  variant="secondary"
                  pill
                  disabled={!product.in_stock}
                  onClick={handleAddToCart}
                  className="flex-1 min-h-[48px] text-sm font-bold gap-2"
                >
                  {addedToCart ? (
                    <>
                      <CheckCircle2 size={16} />
                      Added!
                    </>
                  ) : (
                    <>
                      <ShoppingCart size={16} />
                      {product.in_stock ? 'Add to Cart' : 'Out of Stock'}
                    </>
                  )}
                </Button>
                <Button
                  id="btn-buy-now"
                  variant="primary"
                  pill
                  disabled={!product.in_stock}
                  onClick={handleBuyNow}
                  className="flex-1 min-h-[48px] text-sm font-bold gap-2"
                >
                  <Zap size={16} />
                  {product.in_stock ? 'Buy Now' : 'Unavailable'}
                </Button>
              </>
            )}
          </div>

          {!product.in_stock && (
            <p className="text-[11px] text-text-tertiary text-center">
              This item is currently out of stock. Check back soon.
            </p>
          )}
        </div>
      </div>

      {/* ── Related Products ───────────────────────────────────────────── */}
      {related.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-base font-bold text-text-primary">
            More in {product.category.charAt(0) + product.category.slice(1).toLowerCase()}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {related.map((rel) => (
              <RelatedProductCard key={rel.id} product={rel} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
