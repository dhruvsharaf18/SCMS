import { cn } from '../../lib/utils'

export type ChipVariant =
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'pending'
  | 'neutral'

export interface StatusChipProps {
  label: string
  variant?: ChipVariant
  className?: string
  /** Render as a small dot instead of text */
  dot?: boolean
}

const variantStyles: Record<ChipVariant, string> = {
  success: 'bg-status-success text-ink border border-accent-green font-bold',
  warning: 'bg-status-warning text-ink border border-accent-orange font-bold',
  error: 'bg-status-error text-ink border border-accent-red font-bold',
  info: 'bg-status-info text-ink border border-accent-teal font-bold',
  pending: 'bg-status-pending text-ink border border-accent-purple font-bold',
  neutral: 'bg-surface-dark text-ink border border-ink font-bold',
}

export function StatusChip({ label, variant = 'neutral', className, dot }: StatusChipProps) {
  if (dot) {
    return (
      <span className={cn('flex items-center gap-1.5 text-xs font-bold text-ink', className)}>
        <span
          className={cn('w-2.5 h-2.5 rounded-full border border-ink/40', {
            'bg-accent-green': variant === 'success',
            'bg-accent-orange': variant === 'warning',
            'bg-accent-red': variant === 'error',
            'bg-accent-teal': variant === 'info',
            'bg-accent-purple': variant === 'pending',
            'bg-ink': variant === 'neutral',
          })}
        />
        {label}
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        variantStyles[variant],
        className,
      )}
    >
      {label}
    </span>
  )
}
