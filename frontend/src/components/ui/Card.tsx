import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export interface CardProps {
  children: ReactNode
  className?: string
  /** Remove default padding */
  noPadding?: boolean
  /** Click handler — adds hover/active effects */
  onClick?: () => void
}

export function Card({ children, className, noPadding, onClick }: CardProps) {
  const interactive = !!onClick
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={interactive ? (e) => e.key === 'Enter' && onClick?.() : undefined}
      className={cn(
        'bg-surface rounded-3xl shadow-card',
        !noPadding && 'p-5 lg:p-6',
        interactive && 'cursor-pointer transition-shadow hover:shadow-raised active:shadow-soft',
        className,
      )}
    >
      {children}
    </div>
  )
}
