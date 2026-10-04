import { createContext, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { Product } from '../api/types'
import { useAuth } from '../hooks/useAuth'

export interface CartLine {
  product: Product
  quantity: number
}

interface CartState {
  lines: CartLine[]
  setLines: Dispatch<SetStateAction<CartLine[]>>
  /** Adds one unit; returns false when the line is already at `maxQty`. */
  addOne: (product: Product, maxQty: number) => boolean
}

const CartContext = createContext<CartState | null>(null)

/**
 * One cart per signed-in user, shared by the product page, the member shop drawer and the
 * staff counter. It lives in memory only and is emptied whenever the account changes.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [lines, setLines] = useState<CartLine[]>([])

  useEffect(() => {
    setLines([])
  }, [user?.id])

  const addOne = (product: Product, maxQty: number) => {
    const current = lines.find((l) => l.product.id === product.id)?.quantity ?? 0
    if (maxQty <= 0 || current >= maxQty) return false
    setLines((prev) =>
      prev.some((l) => l.product.id === product.id)
        ? prev.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l))
        : [...prev, { product, quantity: 1 }],
    )
    return true
  }

  return <CartContext.Provider value={{ lines, setLines, addOne }}>{children}</CartContext.Provider>
}

export function useCart(): CartState {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>')
  return ctx
}
