import React, { useState, useMemo } from 'react'
import type { Product, ProductCategory, ProductCreateInput, ProductUpdateInput } from '../../api/types'
import {
  useProducts,
  useRestockProduct,
  useCreateProduct,
  useUpdateProduct,
  useErrorSimulation,
} from '../../api/hooks'
import { useAuth } from '../../hooks/useAuth'
import { formatMoney } from '../../lib/format'
import {
  Card,
  Button,
  StatusChip,
  Modal,
  PillTabs,
  DataTable,
  type Column,
  useToast,
} from '../../components/ui'
import {
  Package,
  Plus,
  AlertTriangle,
  Search,
  CheckCircle,
  RefreshCw,
  Edit2,
  Filter,
  Boxes,
  Layers,
  Sparkles,
} from 'lucide-react'

const CATEGORIES: { id: ProductCategory | 'ALL'; label: string }[] = [
  { id: 'ALL', label: 'All Items' },
  { id: 'RACKET', label: 'Rackets' },
  { id: 'BALL', label: 'Balls' },
  { id: 'SHOE', label: 'Shoes' },
  { id: 'ACCESSORY', label: 'Accessories' },
  { id: 'APPAREL', label: 'Apparel' },
]

export default function StaffStock() {
  const { user } = useAuth()
  const { toast } = useToast()
  const canManageProducts = user?.role === 'OWNER' || user?.role === 'MANAGER'

  // Data fetching
  const { data: products = [], isLoading } = useProducts()
  const restockMutation = useRestockProduct()
  const createMutation = useCreateProduct()
  const updateMutation = useUpdateProduct()
  const { currentError, setSimulatedError } = useErrorSimulation()

  // Filters & search
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'ALL'>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)

  // Restock Modal state
  const [restockProduct, setRestockProduct] = useState<Product | null>(null)
  const [restockQty, setRestockQty] = useState<number>(10)
  const [restockNote, setRestockNote] = useState('')

  // Add / Edit Product Modal state
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [formData, setFormData] = useState<{
    sku: string
    name: string
    category: ProductCategory
    variant: string
    description: string
    priceRupees: string
    stock_qty: number
    reorder_level: number
    is_active: boolean
  }>({
    sku: '',
    name: '',
    category: 'RACKET',
    variant: '',
    description: '',
    priceRupees: '',
    stock_qty: 10,
    reorder_level: 3,
    is_active: true,
  })

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (selectedCategory !== 'ALL' && p.category !== selectedCategory) return false
      if (lowStockOnly && p.stock_qty > p.reorder_level) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchName = p.name.toLowerCase().includes(q)
        const matchSku = p.sku.toLowerCase().includes(q)
        const matchVariant = (p.variant ?? '').toLowerCase().includes(q)
        if (!matchName && !matchSku && !matchVariant) return false
      }
      return true
    })
  }, [products, selectedCategory, lowStockOnly, searchQuery])

  // Summary counts
  const lowStockCount = useMemo(() => {
    return products.filter((p) => p.stock_qty <= p.reorder_level).length
  }, [products])

  const totalInventoryValuePaise = useMemo(() => {
    return products.reduce((sum, p) => sum + p.price_paise * p.stock_qty, 0)
  }, [products])

  // Handlers
  const openAddModal = () => {
    setEditingProduct(null)
    setFormData({
      sku: `SKU-${Date.now().toString().slice(-4)}`,
      name: '',
      category: 'RACKET',
      variant: '',
      description: '',
      priceRupees: '',
      stock_qty: 10,
      reorder_level: 3,
      is_active: true,
    })
    setIsFormOpen(true)
  }

  const openEditModal = (p: Product) => {
    setEditingProduct(p)
    setFormData({
      sku: p.sku,
      name: p.name,
      category: p.category,
      variant: p.variant ?? '',
      description: p.description ?? '',
      priceRupees: (p.price_paise / 100).toString(),
      stock_qty: p.stock_qty,
      reorder_level: p.reorder_level,
      is_active: p.is_active,
    })
    setIsFormOpen(true)
  }

  const handleRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!restockProduct || restockQty <= 0) return

    try {
      await restockMutation.mutateAsync({
        id: restockProduct.id,
        qty: restockQty,
        note: restockNote,
      })
      toast(`Successfully added ${restockQty} units to ${restockProduct.name}`, 'success')
      setRestockProduct(null)
      setRestockQty(10)
      setRestockNote('')
    } catch (err: any) {
      toast(err?.error?.message ?? 'Failed to restock product', 'error')
    }
  }

  const handleProductFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim() || !formData.sku.trim()) {
      toast('Please enter a valid product name and SKU', 'error')
      return
    }

    const priceRupeesNum = parseFloat(formData.priceRupees)
    if (isNaN(priceRupeesNum) || priceRupeesNum < 0) {
      toast('Please enter a valid price in rupees', 'error')
      return
    }
    const price_paise = Math.round(priceRupeesNum * 100)

    try {
      if (editingProduct) {
        // Update product
        const updateInput: ProductUpdateInput = {
          sku: formData.sku,
          name: formData.name,
          category: formData.category,
          variant: formData.variant || null,
          description: formData.description || null,
          price_paise,
          stock_qty: formData.stock_qty,
          reorder_level: formData.reorder_level,
          is_active: formData.is_active,
        }
        await updateMutation.mutateAsync({
          id: editingProduct.id,
          data: updateInput,
        })
        toast(`Updated "${formData.name}" successfully`, 'success')
      } else {
        // Create new product
        const createInput: ProductCreateInput = {
          sku: formData.sku,
          name: formData.name,
          category: formData.category,
          variant: formData.variant || null,
          description: formData.description || null,
          price_paise,
          stock_qty: formData.stock_qty,
          reorder_level: formData.reorder_level,
          is_active: formData.is_active,
        }
        await createMutation.mutateAsync(createInput)
        toast(`Created "${formData.name}" successfully`, 'success')
      }
      setIsFormOpen(false)
    } catch (err: any) {
      toast(err?.error?.message ?? 'Failed to save product', 'error')
    }
  }

  // Table columns definition
  const columns: Column<any>[] = [
    {
      key: 'product',
      header: 'Product',
      render: (p: Product) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-canvas flex items-center justify-center text-text-secondary flex-shrink-0">
            <Package size={20} />
          </div>
          <div>
            <p className="font-bold text-sm text-text-primary">{p.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono text-xs text-text-tertiary">{p.sku}</span>
              {p.variant && (
                <span className="text-xs text-text-secondary px-1.5 py-0.5 rounded-md bg-canvas">
                  {p.variant}
                </span>
              )}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (p: Product) => (
        <span className="text-xs font-medium text-text-secondary px-2.5 py-1 rounded-full bg-canvas border border-border-light">
          {p.category}
        </span>
      ),
    },
    {
      key: 'price',
      header: 'Unit Price',
      render: (p: Product) => (
        <span className="font-bold text-sm text-text-primary">
          {formatMoney(p.price_paise)}
        </span>
      ),
    },
    {
      key: 'stock',
      header: 'Stock Status',
      render: (p: Product) => {
        const isLow = p.stock_qty <= p.reorder_level
        const isOut = p.stock_qty === 0
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <StatusChip
                label={isOut ? 'Out of Stock' : isLow ? `${p.stock_qty} Low Stock` : `${p.stock_qty} In Stock`}
                variant={isOut || isLow ? 'warning' : 'success'}
              />
            </div>
            <p className="text-[11px] text-text-tertiary">
              Reorder threshold: {p.reorder_level}
            </p>
          </div>
        )
      },
    },
    {
      key: 'actions',
      header: '',
      render: (p: Product) => (
        <div className="flex items-center gap-2 justify-end">
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            onClick={() => {
              setRestockProduct(p)
              setRestockQty(10)
              setRestockNote('')
            }}
            className="touch-target text-xs"
          >
            Restock
          </Button>
          {canManageProducts && (
            <Button
              variant="ghost"
              size="sm"
              icon={Edit2}
              onClick={() => openEditModal(p)}
              className="touch-target text-xs"
            >
              Edit
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Top Title & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">
              Stock & Inventory
            </h1>
            <StatusChip
              label={`${products.length} Products`}
              variant="info"
            />
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Pro Shop merchandise catalog, stock levels, and replenishment
          </p>
        </div>

        <div className="flex items-center gap-3">
          {canManageProducts && (
            <Button
              variant="primary"
              icon={Plus}
              onClick={openAddModal}
              className="touch-target"
            >
              Add Product
            </Button>
          )}
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Total Catalog Items
            </p>
            <p className="text-2xl font-bold text-text-primary mt-1">
              {products.length}
            </p>
            <p className="text-xs text-text-tertiary mt-0.5">Active SKUs</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-primary-50 text-primary-600 flex items-center justify-center">
            <Boxes size={24} />
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Low Stock Warnings
            </p>
            <p className="text-2xl font-bold text-accent-red mt-1">
              {lowStockCount}
            </p>
            <p className="text-xs text-text-tertiary mt-0.5">Below reorder limit</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-accent-red flex items-center justify-center">
            <AlertTriangle size={24} />
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Total Stock Valuation
            </p>
            <p className="text-2xl font-bold text-text-primary mt-1">
              {formatMoney(totalInventoryValuePaise)}
            </p>
            <p className="text-xs text-text-tertiary mt-0.5">Retail inventory value</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-accent-green flex items-center justify-center">
            <Layers size={24} />
          </div>
        </Card>
      </div>

      {/* Filters Bar */}
      <Card className="p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Category Tabs */}
          <PillTabs
            tabs={CATEGORIES}
            activeId={selectedCategory}
            onChange={(id) => setSelectedCategory(id as ProductCategory | 'ALL')}
          />

          {/* Search and Low Stock Toggle */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px]">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, SKU, variant…"
                className="w-full pl-9 pr-4 py-2 text-xs bg-canvas rounded-xl border border-border-light focus:outline-none focus:border-primary-500 focus:bg-surface text-text-primary placeholder:text-text-tertiary"
              />
            </div>

            <button
              type="button"
              onClick={() => setLowStockOnly(!lowStockOnly)}
              className={`px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors border ${
                lowStockOnly
                  ? 'bg-rose-50 border-rose-200 text-accent-red'
                  : 'bg-canvas border-border-light text-text-secondary hover:text-text-primary'
              }`}
            >
              <AlertTriangle size={14} />
              Low Stock Only ({lowStockCount})
            </button>
          </div>
        </div>
      </Card>

      {/* Products DataTable */}
      <Card className="p-0 overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredProducts as any}
          keyExtractor={(p: any) => p.id}
          emptyMessage="No products match your filter criteria"
        />
      </Card>

      {/* ── Restock Modal ─────────────────────────────────────────────────── */}
      <Modal
        open={!!restockProduct}
        onClose={() => setRestockProduct(null)}
        title={`Restock: ${restockProduct?.name ?? ''}`}
      >
        <form onSubmit={handleRestockSubmit} className="space-y-4">
          <div className="p-3.5 rounded-2xl bg-canvas border border-border-light space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-text-secondary">SKU:</span>
              <span className="font-mono font-bold text-text-primary">{restockProduct?.sku}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Current Stock:</span>
              <span className="font-bold text-text-primary">{restockProduct?.stock_qty} units</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Reorder Threshold:</span>
              <span className="text-text-primary">{restockProduct?.reorder_level} units</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1">
              Units to Add
            </label>
            <input
              type="number"
              min={1}
              max={500}
              value={restockQty}
              onChange={(e) => setRestockQty(parseInt(e.target.value) || 0)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border-light bg-canvas text-sm font-semibold text-text-primary focus:outline-none focus:border-primary-500 focus:bg-surface"
              required
            />
            <p className="text-[11px] text-text-tertiary mt-1">
              New stock total will be: {(restockProduct?.stock_qty ?? 0) + (restockQty || 0)} units
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1">
              Supplier / Restock Note (optional)
            </label>
            <input
              type="text"
              value={restockNote}
              onChange={(e) => setRestockNote(e.target.value)}
              placeholder="e.g., PO #4401 - Yonex Distributor India"
              className="w-full px-3.5 py-2.5 rounded-xl border border-border-light bg-canvas text-xs text-text-primary focus:outline-none focus:border-primary-500 focus:bg-surface"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-light">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRestockProduct(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={restockMutation.isPending || restockQty <= 0}
            >
              {restockMutation.isPending ? 'Updating...' : 'Confirm Restock'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Add / Edit Product Modal ──────────────────────────────────────── */}
      <Modal
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingProduct ? `Edit Product: ${editingProduct.name}` : 'Add New Product'}
      >
        <form onSubmit={handleProductFormSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1">
                SKU Code *
              </label>
              <input
                type="text"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                placeholder="e.g. RKT-004"
                className="w-full px-3 py-2 rounded-xl border border-border-light bg-canvas text-xs font-mono font-bold text-text-primary focus:outline-none focus:border-primary-500 focus:bg-surface disabled:opacity-60"
                disabled={!!editingProduct}
                title={editingProduct ? 'SKU cannot be changed after creation' : undefined}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1">
                Category *
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as ProductCategory })}
                className="w-full px-3 py-2 rounded-xl border border-border-light bg-canvas text-xs font-medium text-text-primary focus:outline-none focus:border-primary-500 focus:bg-surface"
              >
                <option value="RACKET">Racket</option>
                <option value="BALL">Ball</option>
                <option value="SHOE">Shoe</option>
                <option value="ACCESSORY">Accessory</option>
                <option value="APPAREL">Apparel</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1">
              Product Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Wilson Clash 100 v2"
              className="w-full px-3 py-2 rounded-xl border border-border-light bg-canvas text-xs font-medium text-text-primary focus:outline-none focus:border-primary-500 focus:bg-surface"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1">
                Variant / Specification
              </label>
              <input
                type="text"
                value={formData.variant}
                onChange={(e) => setFormData({ ...formData, variant: e.target.value })}
                placeholder="e.g. Grip 3 / 295g"
                className="w-full px-3 py-2 rounded-xl border border-border-light bg-canvas text-xs text-text-primary focus:outline-none focus:border-primary-500 focus:bg-surface"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1">
                Retail Price (₹) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.priceRupees}
                onChange={(e) => setFormData({ ...formData, priceRupees: e.target.value })}
                placeholder="e.g. 8500"
                className="w-full px-3 py-2 rounded-xl border border-border-light bg-canvas text-xs font-bold text-text-primary focus:outline-none focus:border-primary-500 focus:bg-surface"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1">
                Initial / Current Stock
              </label>
              <input
                type="number"
                min="0"
                value={formData.stock_qty}
                onChange={(e) => setFormData({ ...formData, stock_qty: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 rounded-xl border border-border-light bg-canvas text-xs font-semibold text-text-primary focus:outline-none focus:border-primary-500 focus:bg-surface disabled:opacity-60"
                disabled={!!editingProduct}
                title={editingProduct ? 'Use Restock to change stock' : undefined}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1">
                Reorder Threshold Level
              </label>
              <input
                type="number"
                min="0"
                value={formData.reorder_level}
                onChange={(e) => setFormData({ ...formData, reorder_level: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 rounded-xl border border-border-light bg-canvas text-xs font-semibold text-text-primary focus:outline-none focus:border-primary-500 focus:bg-surface"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1">
              Description (optional)
            </label>
            <textarea
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Detailed description of features, materials, warranty..."
              className="w-full px-3 py-2 rounded-xl border border-border-light bg-canvas text-xs text-text-primary focus:outline-none focus:border-primary-500 focus:bg-surface resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-light">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsFormOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Saving...'
                : editingProduct
                ? 'Update Product'
                : 'Create Product'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
