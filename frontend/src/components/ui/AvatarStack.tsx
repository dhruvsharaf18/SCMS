import { cn } from '../../lib/utils'
import { Avatar, type AvatarProps } from './Avatar'

export interface AvatarStackProps {
  users: Pick<AvatarProps, 'name' | 'src'>[]
  /** Max visible avatars before showing +N */
  max?: number
  size?: AvatarProps['size']
  className?: string
}

export function AvatarStack({ users, max = 3, size = 'sm', className }: AvatarStackProps) {
  const visible = users.slice(0, max)
  const overflow = users.length - max

  return (
    <div className={cn('flex items-center -space-x-2', className)}>
      {visible.map((user, i) => (
        <div
          key={i}
          className="ring-2 ring-surface rounded-full"
        >
          <Avatar name={user.name} src={user.src} size={size} />
        </div>
      ))}
      {overflow > 0 && (
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full bg-canvas text-text-secondary font-semibold ring-2 ring-surface',
            size === 'xs' ? 'w-6 h-6 text-[9px]' : size === 'sm' ? 'w-8 h-8 text-[10px]' : 'w-10 h-10 text-xs',
          )}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}
