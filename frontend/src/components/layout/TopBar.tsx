import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, Bell, Menu, ChevronDown } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { Avatar } from '../ui/Avatar'
import { PillTabs, type PillTab } from '../ui/PillTabs'
import { Drawer } from '../ui/Drawer'
import { STAFF_NAV, getNavItems, getNavSections, NOTIFICATION_ICON, type NavItem } from '../../lib/nav-config'
import { cn } from '../../lib/utils'
import type { Role } from '../../lib/auth-context'

export interface TopBarProps {
  className?: string
}

const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  FRONT_DESK: 'Front Desk',
  BAR_STAFF: 'Bar Staff',
  MEMBER: 'Member',
}

const ALL_ROLES: Role[] = ['OWNER', 'MANAGER', 'FRONT_DESK', 'BAR_STAFF', 'MEMBER']

export function TopBar({ className }: TopBarProps) {
  const { user, switchRole } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [roleMenuOpen, setRoleMenuOpen] = useState(false)

  const navItems = getNavItems(user?.role)
  const tabs: PillTab[] = navItems.map((item) => ({ id: item.id, label: item.label }))
  const activeTab = navItems.find((i) => isActive(i.path, location.pathname))?.id ?? navItems[0]?.id ?? ''

  const NotifIcon = NOTIFICATION_ICON

  return (
    <>
      <header
        className={cn(
          'flex items-center gap-3 h-topbar px-4 lg:px-6',
          className,
        )}
      >
        {/* Mobile: hamburger */}
        <button
          className="md:hidden flex items-center justify-center w-9 h-9 rounded-xl text-text-secondary hover:bg-surface transition-colors touch-target"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        {/* Page context tabs — hidden on mobile */}
        <div className="hidden lg:block flex-1 min-w-0">
          <PillTabs
            tabs={tabs.slice(0, 6)}
            activeId={activeTab}
            onChange={(id) => {
              const item = navItems.find((i) => i.id === id)
              if (item) navigate(item.path)
            }}
          />
        </div>

        {/* Mobile: page title */}
        <h1 className="lg:hidden flex-1 text-base font-bold text-text-primary truncate">
          {activeTab ? navItems.find((i) => i.id === activeTab)?.label ?? 'Champions Club' : 'Champions Club'}
        </h1>

        {/* Right section */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <button
            className="flex items-center justify-center w-9 h-9 rounded-xl text-text-secondary hover:bg-surface hover:text-text-primary transition-colors"
            aria-label="Search"
          >
            <Search size={18} />
          </button>

          {/* Notifications */}
          <button
            className="relative flex items-center justify-center w-9 h-9 rounded-xl text-text-secondary hover:bg-surface hover:text-text-primary transition-colors"
            aria-label="Notifications"
          >
            <NotifIcon size={18} />
            {/* Unread dot */}
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-accent-red" />
          </button>

          {/* Divider */}
          <div className="hidden md:block w-px h-6 bg-border-light mx-1" />

          {/* User profile / dev role switcher (strictly gated behind import.meta.env.DEV) */}
          {import.meta.env.DEV ? (
            <div className="relative">
              <button
                onClick={() => setRoleMenuOpen((v) => !v)}
                className="flex items-center gap-2 px-2 py-1 rounded-xl hover:bg-surface transition-colors"
                aria-label="Switch role (Dev)"
              >
                <Avatar name={user?.full_name ?? 'User'} size="sm" />
                <div className="hidden md:block text-left">
                  <p className="text-sm font-medium text-text-primary leading-tight">{user?.full_name}</p>
                  <p className="text-[11px] text-text-tertiary leading-tight">{user ? ROLE_LABELS[user.role] : ''}</p>
                </div>
                <ChevronDown size={14} className="hidden md:block text-text-tertiary" />
              </button>

              {roleMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setRoleMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50 bg-surface rounded-2xl shadow-raised border border-border-light py-1 min-w-[180px] animate-scale-in">
                    <p className="px-3 py-1.5 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                      Switch Role (Dev)
                    </p>
                    {ALL_ROLES.map((role) => (
                      <button
                        key={role}
                        onClick={() => {
                          switchRole(role)
                          setRoleMenuOpen(false)
                          navigate(role === 'MEMBER' ? '/portal' : '/staff')
                        }}
                        className={cn(
                          'w-full text-left px-3 py-2 text-sm transition-colors',
                          user?.role === role
                            ? 'bg-primary-50 text-primary-600 font-medium'
                            : 'text-text-primary hover:bg-canvas',
                        )}
                      >
                        {ROLE_LABELS[role]}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 px-2 py-1">
              <Avatar name={user?.full_name ?? 'User'} size="sm" />
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium text-text-primary leading-tight">{user?.full_name}</p>
                <p className="text-[11px] text-text-tertiary leading-tight">{user ? ROLE_LABELS[user.role] : ''}</p>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Mobile drawer with full nav */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Menu">
        <MobileNavList onClose={() => setDrawerOpen(false)} />
      </Drawer>
    </>
  )
}

// ── Mobile nav list inside drawer ──────────────────────────────────────────
function MobileNavList({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  if (!user?.role) return null
  const sections = getNavSections(user.role)

  return (
    <div className="space-y-4">
      {sections.map((section, i) => (
        <div key={i}>
          {section.title && (
            <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider px-2 mb-1">
              {section.title}
            </p>
          )}
          <div className="space-y-0.5">
            {section.items.map((item) => (
              <NavButton key={item.id} item={item} currentPath={location.pathname} onNav={(p) => { navigate(p); onClose() }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function NavButton({ item, currentPath, onNav }: { item: NavItem; currentPath: string; onNav: (path: string) => void }) {
  const active = isActive(item.path, currentPath)
  const Icon = item.icon
  return (
    <button
      onClick={() => onNav(item.path)}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors touch-target',
        active ? 'bg-primary-50 text-primary-600' : 'text-text-secondary hover:bg-canvas hover:text-text-primary',
      )}
    >
      <Icon size={18} />
      {item.label}
    </button>
  )
}

function isActive(itemPath: string, currentPath: string): boolean {
  if (itemPath === '/staff' || itemPath === '/portal') return currentPath === itemPath
  return currentPath.startsWith(itemPath)
}

