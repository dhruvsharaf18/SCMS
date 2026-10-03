import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { getNavItems, type NavItem } from '../../lib/nav-config'
import { IconRailItem } from '../ui/IconRailItem'
import { cn } from '../../lib/utils'

// ── Desktop: Floating pill icon rail on the left ───────────────────────────
export function IconRail() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const navItems = getNavItems(user?.role)

  return (
    <nav
      aria-label="Main navigation"
      className="hidden md:flex flex-col items-center gap-1 w-rail py-4 bg-surface rounded-full shadow-rail"
    >
      {/* Logo / home */}
      <button
        onClick={() => navigate(user?.role === 'MEMBER' ? '/portal' : '/staff')}
        className="flex items-center justify-center w-10 h-10 rounded-xl mb-2 bg-primary-500 text-white font-bold text-sm"
        aria-label="Home"
      >
        CC
      </button>

      <div className="flex-1 flex flex-col items-center gap-0.5 overflow-y-auto scrollbar-hide py-1">
        {navItems.map((item) => (
          <IconRailItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={isActive(item.path, location.pathname)}
            onClick={() => navigate(item.path)}
          />
        ))}
      </div>
    </nav>
  )
}

// ── Mobile: Bottom tab bar ─────────────────────────────────────────────────
export function BottomTabBar() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const navItems = getNavItems(user?.role).filter((i) => i.mobileBar)

  return (
    <nav
      aria-label="Main navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around bg-surface border-t border-border-light h-bottombar px-2 safe-area-pb"
    >
      {navItems.slice(0, 5).map((item) => {
        const active = isActive(item.path, location.pathname)
        const Icon = item.icon
        return (
          <button
            key={item.id}
            onClick={() => navigate(item.path)}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 flex-1 py-1 touch-target transition-colors',
              active ? 'text-primary-500' : 'text-text-tertiary',
            )}
          >
            <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
            <span className="text-[10px] font-medium leading-tight">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function isActive(itemPath: string, currentPath: string): boolean {
  // Exact match for index routes, prefix for sub-routes
  if (itemPath === '/staff' || itemPath === '/portal') {
    return currentPath === itemPath
  }
  return currentPath.startsWith(itemPath)
}

