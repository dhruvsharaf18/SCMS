import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'

export interface IconRailItemProps {
  icon: LucideIcon
  label: string
  active?: boolean
  onClick?: () => void
  badge?: number
}

export function IconRailItem({ icon: Icon, label, active, onClick, badge }: IconRailItemProps) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200 touch-target',
        active
          ? 'bg-primary-50 text-primary-600 shadow-pill'
          : 'text-text-tertiary hover:text-text-primary hover:bg-canvas',
      )}
    >
      <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-accent-red text-[10px] font-bold text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}
