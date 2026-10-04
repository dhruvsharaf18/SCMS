import { Link } from 'react-router-dom'
import { cn } from '../../lib/utils'

export interface SectionHeaderProps {
  title: string
  /** "View all" destination */
  viewAllTo?: string
  viewAllLabel?: string
  className?: string
}

export function SectionHeader({
  title,
  viewAllTo,
  viewAllLabel = 'View all',
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between', className)}>
      <h2 className="text-lg font-bold text-text-primary">{title}</h2>
      {viewAllTo && (
        <Link
          to={viewAllTo}
          className="text-sm font-semibold text-odoo-purple hover:underline transition-colors"
        >
          {viewAllLabel} →
        </Link>
      )}
    </div>
  )
}
