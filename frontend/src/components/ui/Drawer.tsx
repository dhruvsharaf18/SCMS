import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** Side to slide from */
  side?: 'left' | 'right'
  className?: string
}

export function Drawer({ open, onClose, title, children, side = 'left', className }: DrawerProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 backdrop-blur-overlay animate-fade-in"
      onClick={(e) => e.target === overlayRef.current && onClose()}
    >
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className={cn(
          'fixed top-0 bottom-0 w-72 bg-surface shadow-modal flex flex-col animate-slide-right',
          side === 'left' ? 'left-0 rounded-r-3xl' : 'right-0 rounded-l-3xl',
          className,
        )}
      >
        {title && (
          <div className="flex items-center justify-between p-4 border-b border-border-light">
            <h3 className="text-lg font-bold text-text-primary">{title}</h3>
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex items-center justify-center w-8 h-8 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-canvas transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  )
}
