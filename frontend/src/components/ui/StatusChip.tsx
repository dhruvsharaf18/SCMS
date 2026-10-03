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
  success: 'bg-status-success text-status-success-text',
  warning: 'bg-status-warning text-status-warning-text',
  error: 'bg-status-error text-status-error-text',
  info: 'bg-status-info text-status-info-text',
  pending: 'bg-status-pending text-status-pending-text',
  neutral: 'bg-canvas text-text-secondary',
}

export function StatusChip({ label, variant = 'neutral', className, dot }: StatusChipProps) {
  if (dot) {
    return (
      <span className={cn('flex items-center gap-1.5 text-xs font-medium', className)}>
        <span
          className={cn('w-2 h-2 rounded-full', {
            'bg-accent-green': variant === 'success',
            'bg-accent-yellow': variant === 'warning',
            'bg-accent-red': variant === 'error',
            'bg-primary-500': variant === 'info',
            'bg-accent-purple': variant === 'pending',
            'bg-text-tertiary': variant === 'neutral',
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
