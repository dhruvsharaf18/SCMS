import { cn, getInitials } from '../../lib/utils'

export interface AvatarProps {
  name: string
  src?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

const sizeMap = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-lg',
}

const colorPairs = [
  ['bg-primary-500', 'text-ink border border-ink'],
  ['bg-brand-purple', 'text-white border border-brand-purple-light'],
  ['bg-surface-dark', 'text-white border border-ink'],
  ['bg-ink', 'text-white border border-white/40'],
  ['bg-brand-purple-dark', 'text-white border border-brand-purple-light'],
  ['bg-surface-light', 'text-ink border border-ink'],
]

function colorFor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colorPairs[Math.abs(hash) % colorPairs.length]
}

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const initials = getInitials(name)
  const [bg, fg] = colorFor(name)

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn('rounded-full object-cover', sizeMap[size], className)}
      />
    )
  }

  return (
    <span
      aria-label={name}
      className={cn(
        'inline-flex items-center justify-center rounded-full font-semibold select-none',
        sizeMap[size],
        bg,
        fg,
        className,
      )}
    >
      {initials}
    </span>
  )
}
