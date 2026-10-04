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
  iconBg = 'bg-odoo-purple',
  iconColor = 'text-white',
  className,
}: StatCardProps) {
  const DeltaIcon = delta === undefined || delta === 0
    ? Minus
    : delta > 0
      ? TrendingUp
      : TrendingDown

  const deltaColor = delta === undefined || delta === 0
    ? 'text-ink'
    : delta > 0
      ? 'text-accent-green font-bold'
      : 'text-accent-red font-bold'

  return (
    <div
      className={cn(
        'bg-surface rounded-3xl shadow-card p-5 lg:p-6 flex flex-col gap-3 border border-border-light',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink font-semibold">{label}</span>
        {Icon && (
          <span className={cn('flex items-center justify-center w-9 h-9 rounded-xl border border-border-light shadow-pill', iconBg)}>
            <Icon size={18} className={iconColor} />
          </span>
        )}
      </div>

      <div className="flex items-end gap-2">
        <span className="text-2xl lg:text-3xl font-extrabold text-ink tracking-tight">
          {value}
        </span>
        {delta !== undefined && (
          <span className={cn('flex items-center gap-0.5 text-sm font-bold mb-0.5', deltaColor)}>
            <DeltaIcon size={14} />
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  )
}
