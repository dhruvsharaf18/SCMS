import { cn } from '../../lib/utils'

export interface PillTab {
  id: string
  label: string
}

export interface PillTabsProps {
  tabs: PillTab[]
  activeId: string
  onChange: (id: string) => void
  className?: string
  size?: 'sm' | 'md'
}

export function PillTabs({ tabs, activeId, onChange, className, size = 'md' }: PillTabsProps) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-surface-dark p-1 border border-border-light',
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              'rounded-full font-medium transition-all duration-200 whitespace-nowrap',
              size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm',
              active
                ? 'bg-primary-500 text-ink shadow-pill font-bold'
                : 'text-ink hover:bg-surface-light',
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
