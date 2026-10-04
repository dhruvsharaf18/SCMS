import { cn } from '../../lib/utils'

export interface SkeletonProps {
  className?: string
  /** Predefined shape */
  variant?: 'text' | 'circle' | 'rect' | 'card'
}

export function Skeleton({ className, variant = 'rect' }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn(
        'bg-surface-dark animate-pulse',
        variant === 'text' && 'h-4 rounded-md',
        variant === 'circle' && 'rounded-full',
        variant === 'rect' && 'rounded-2xl',
        variant === 'card' && 'rounded-3xl h-32',
        className,
      )}
    />
  )
}

/** Pre-composed skeleton for a stat card */
export function StatCardSkeleton() {
  return (
    <div className="bg-surface rounded-3xl shadow-card p-5 lg:p-6 space-y-3">
      <Skeleton variant="text" className="w-24" />
      <Skeleton variant="text" className="w-32 h-8" />
    </div>
  )
}

/** Pre-composed skeleton for a table row */
export function TableRowSkeleton({ cols = 4 }: { cols?: number }) {
  return (
    <div className="flex gap-4 px-4 py-3">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} variant="text" className="flex-1" />
      ))}
    </div>
  )
}
