import React, { useState, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  ShoppingBag,
  Package,
  Sparkles,
  Search,
  LogIn,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Tag,
} from 'lucide-react'
import { Button, Card, EmptyState, Skeleton } from '../../components/ui'
import { usePublicProducts } from '../../api/hooks'
import { formatMoney } from '../../lib/format'
import { getProductPresentation } from '../../lib/product-presentation'
import type { ProductCategory } from '../../api/types'

const CATEGORIES: { id: 'ALL' | ProductCategory; label: string }[] = [
  { id: 'ALL', label: 'All Equipment' },
  { id: 'RACKET', label: 'Rackets' },
  { id: 'BALL', label: 'Balls & Shuttles' },
  { id: 'SHOE', label: 'Footwear' },
  { id: 'APPAREL', label: 'Apparel' },
  { id: 'ACCESSORY', label: 'Accessories' },
]

export default function ShopPage() {
  const navigate = useNavigate()
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | ProductCategory>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  const {
    data: products = [],
    isLoading,
    isError,
    refetch,
  } = usePublicProducts(selectedCategory === 'ALL' ? undefined : selectedCategory)

  // Filter products by search query
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products
    const q = searchQuery.toLowerCase()
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        p.sku.toLowerCase().includes(q)
    )
  }, [products, searchQuery])

  return (
    <div className="space-y-8 pb-12">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-50 border border-primary-200 text-primary-600 text-xs font-bold shadow-soft mb-2">
            <ShoppingBag size={14} />
            <span>Official Equipment & Gear (SRS §3.2.7)</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-text-primary">
            Club Pro Shop
          </h1>
          <p className="text-xs sm:text-sm text-text-secondary mt-1">
            Championship-grade racquets, footwear, balls, and accessories curated for peak performance.
          </p>
        </div>

        <Link to="/login">
          <Button
            variant="primary"
            pill
            iconRight={LogIn}
            className="text-xs font-bold self-start md:self-auto min-h-[44px] px-5"
          >
            Log in to Order
          </Button>
        </Link>
      </div>

      {/* ── Member Discount Information Banner ───────────────────────────── */}
      <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-border-light flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-soft text-ink">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-500 text-ink border border-ink flex items-center justify-center shrink-0">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="font-bold text-text-primary">
              Exclusive Member Tier Discounts Applied Automatically
            </div>
            <div className="text-text-secondary mt-0.5">
              Gold: <strong>15% OFF</strong> • Junior: <strong>10% OFF</strong> • Silver: <strong>5% OFF</strong> on all items.
            </div>
          </div>
        </div>

        <Link to="/plans">
          <span className="font-bold text-primary-600 hover:underline flex items-center gap-1 whitespace-nowrap">
            <span>View Plans</span>
            <ArrowRight size={14} />
          </span>
        </Link>
      </div>

      {/* ── Search & Filter Chips ────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary" size={18} />
          <input
            type="text"
            placeholder="Search rackets, shuttles, shoes, grips..."
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
                    ? 'bg-primary-500 text-white font-bold shadow-pill'
                    : 'bg-surface hover:bg-canvas text-text-secondary border border-border-light'
                }`}
              >
                {cat.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Products Grid (S-15: Public only, no exact counts) ───────────── */}
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
        <Card className="p-8 text-center space-y-3">
          <AlertTriangle className="mx-auto text-status-error" size={32} />
          <h3 className="font-bold text-text-primary">Failed to load shop catalogue</h3>
          <p className="text-xs text-text-secondary">Could not fetch public product catalogue.</p>
          <Button variant="secondary" onClick={() => refetch()}>
            Retry
          </Button>
        </Card>
      ) : filteredProducts.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="No equipment found"
          description={
            searchQuery
              ? `No products matching "${searchQuery}". Try another search term.`
              : 'No equipment currently listed in this category.'
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
            return (
              <Card
                key={product.id}
                className="flex flex-col justify-between overflow-hidden hover:shadow-card-hover transition-all duration-200 border-border-light group"
              >
                <div className="p-4 space-y-3">
                  {/* Category & In Stock Badge */}
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-canvas border border-border-light text-text-tertiary">
                      {product.category}
                    </span>
                    <span
                      className={`text-xs font-semibold flex items-center gap-1.5 ${
                        product.in_stock ? 'text-accent-green' : 'text-accent-red'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          product.in_stock ? 'bg-accent-green' : 'bg-accent-red'
                        }`}
                      />
                      {product.in_stock ? 'In stock' : 'Out of stock'}
                    </span>
                  </div>

                  {/* Visual Image / Frame */}
                  <Link to={`/shop/${product.id}`} className="block group">
                    <div className="w-full h-32 rounded-xl bg-canvas flex items-center justify-center border border-border-light group-hover:border-primary-200 transition-colors overflow-hidden">
                      {getProductPresentation(product.sku).imagePath ? (
                        <img
                          src={getProductPresentation(product.sku).imagePath}
                          alt={getProductPresentation(product.sku).imageAlt}
                          className="w-full h-full object-contain p-2"
                        />
                      ) : (
                        <Package className="text-text-tertiary group-hover:text-primary-500 transition-colors" size={38} />
                      )}
                    </div>
                  </Link>

                  {/* Product Details */}
                  <Link to={`/shop/${product.id}`} className="block group">
                    <h3 className="font-bold text-text-primary text-base line-clamp-1 group-hover:text-primary-600 transition-colors">
                      {product.name}
                    </h3>
                    <p className="text-xs text-text-tertiary mt-0.5 line-clamp-2">
                      {product.description || product.variant || `SKU: ${product.sku}`}
                    </p>
                  </Link>

                  {/* Price */}
                  <div className="pt-1">
                    <div className="text-lg font-extrabold text-primary-600">
                      {formatMoney(product.price_paise)}
                    </div>
                    <div className="text-[10px] text-text-tertiary mt-0.5">
                      Includes 18% GST • Tier discounts at checkout
                    </div>
                  </div>
                </div>

                {/* Card CTA */}
                <div className="p-4 pt-0">
                  <Link to={`/shop/${product.id}`}>
                    <Button
                      variant="secondary"
                      disabled={!product.in_stock}
                      className="w-full text-xs font-bold min-h-[44px] gap-1.5"
                    >
                      <LogIn size={14} />
                      <span>{product.in_stock ? 'View Product' : 'Out of Stock'}</span>
                    </Button>
                  </Link>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Restringing & Customization Services Note ────────────────────── */}
      <section className="p-6 rounded-3xl bg-surface border border-border-light flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-bold text-base text-text-primary">
            Electronic Racquet Restringing & Grip Fitting
          </h3>
          <p className="text-xs text-text-secondary">
            Visit the pro shop counter at the club for same-day professional racquet stringing and custom grip sizing.
          </p>
        </div>

        <Link to="/contact">
          <Button variant="secondary" size="sm" pill className="text-xs font-bold whitespace-nowrap min-h-[40px] px-4">
            Inquire at Desk
          </Button>
        </Link>
      </section>
    </div>
  )
}
