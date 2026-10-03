import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'

export interface StatCardProps {
  label: string
  value: string
  /** Percentage change — positive, negative, or zero */
  delta?: number
  /** Optional icon */
  icon?: LucideIcon
  /** Accent color class for the icon bg */
  iconBg?: string
  iconColor?: string
  className?: string
}

export function StatCard({
  label,
  value,
  delta,
  icon: Icon,
  iconBg = 'bg-primary-50',
  iconColor = 'text-primary-500',
  className,
}: StatCardProps) {
  const DeltaIcon = delta === undefined || delta === 0
    ? Minus
    : delta > 0
      ? TrendingUp
      : TrendingDown

  const deltaColor = delta === undefined || delta === 0
    ? 'text-text-tertiary'
    : delta > 0
      ? 'text-accent-green'
      : 'text-accent-red'

  return (
    <div
      className={cn(
        'bg-surface rounded-3xl shadow-card p-5 lg:p-6 flex flex-col gap-3',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-secondary font-medium">{label}</span>
        {Icon && (
          <span className={cn('flex items-center justify-center w-9 h-9 rounded-xl', iconBg)}>
            <Icon size={18} className={iconColor} />
          </span>
        )}
      </div>

      <div className="flex items-end gap-2">
        <span className="text-2xl lg:text-3xl font-bold text-text-primary tracking-tight">
          {value}
        </span>
        {delta !== undefined && (
          <span className={cn('flex items-center gap-0.5 text-sm font-medium mb-0.5', deltaColor)}>
            <DeltaIcon size={14} />
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  )
}
