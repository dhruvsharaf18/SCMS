import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { cn } from '../../lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────
export type ToastVariant = 'success' | 'error' | 'warning' | 'info'

export interface ToastData {
  id: string
  message: string
  variant: ToastVariant
  duration?: number
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant, duration?: number) => void
}

// ── Context ────────────────────────────────────────────────────────────────
const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

// ── Provider ───────────────────────────────────────────────────────────────
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([])
  const idCounter = useRef(0)

  const toast = useCallback(
    (message: string, variant: ToastVariant = 'info', duration = 4000) => {
      const id = `toast-${++idCounter.current}`
      setToasts((prev) => [...prev, { id, message, variant, duration }])
      if (duration > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id))
        }, duration)
      }
    },
    [],
  )

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container — fixed top-right */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none max-w-sm w-full">
        {toasts.map((t) => (
          <ToastItem key={t.id} data={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// ── Individual toast ───────────────────────────────────────────────────────
const icons: Record<ToastVariant, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

const variantStyles: Record<ToastVariant, string> = {
  success: 'border-accent-green/30 bg-status-success',
  error: 'border-accent-red/30 bg-status-error',
  warning: 'border-accent-yellow/30 bg-status-warning',
  info: 'border-primary-200 bg-status-info',
}

const iconColors: Record<ToastVariant, string> = {
  success: 'text-accent-green',
  error: 'text-accent-red',
  warning: 'text-accent-yellow',
  info: 'text-primary-500',
}

function ToastItem({ data, onDismiss }: { data: ToastData; onDismiss: () => void }) {
  const Icon = icons[data.variant]

  return (
    <div
      role="alert"
      className={cn(
        'pointer-events-auto flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-raised animate-toast-in',
        variantStyles[data.variant],
      )}
    >
      <Icon size={18} className={iconColors[data.variant]} />
      <p className="flex-1 text-sm font-medium text-text-primary">{data.message}</p>
      <button
        onClick={onDismiss}
        className="text-text-tertiary hover:text-text-primary transition-colors"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  )
}
