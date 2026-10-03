import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, Bell, Menu, ChevronDown, LogOut } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { Avatar } from '../ui/Avatar'
import { PillTabs, type PillTab } from '../ui/PillTabs'
import { Drawer } from '../ui/Drawer'
import { STAFF_NAV, getNavItems, getNavSections, NOTIFICATION_ICON, type NavItem } from '../../lib/nav-config'
import { cn, formatDate, formatTime } from '../../lib/utils'
import type { Role } from '../../lib/auth-context'
import { useUnreadNotificationsCount, useNotifications, useMarkNotificationRead } from '../../api/hooks'

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

export function TopBar({ className }: TopBarProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false)

  // Notification hooks with 30s polling
  const {
    data: unreadData,
    isError: isUnreadError,
    error: unreadError,
  } = useUnreadNotificationsCount({ refetchInterval: 30000 })

  const {
    data: notifsData,
    isError: isNotifsError,
    error: notifsError,
  } = useNotifications({ page_size: 20 }, { refetchInterval: 30000 })

  const markReadMutation = useMarkNotificationRead()

  const isForbiddenOrNotFound =
    (isUnreadError && ((unreadError as any)?.status === 403 || (unreadError as any)?.status === 404)) ||
    (isNotifsError && ((notifsError as any)?.status === 403 || (notifsError as any)?.status === 404))

  const unreadCount = isForbiddenOrNotFound ? 0 : (unreadData?.count ?? 0)
  const notifications = isForbiddenOrNotFound ? [] : (notifsData?.items ?? [])

  const navItems = getNavItems(user?.role)
  const tabs: PillTab[] = navItems.map((item) => ({ id: item.id, label: item.label }))
  const activeTab = navItems.find((i) => isActive(i.path, location.pathname))?.id ?? navItems[0]?.id ?? ''

  const NotifIcon = NOTIFICATION_ICON

  const handleNotificationClick = async (notifId: number, link?: string | null) => {
    try {
      await markReadMutation.mutateAsync({ notificationId: notifId })
    } catch {
      // Ignore inline mark read error
    }
    if (link) {
      navigate(link)
    }
  }

  return (
    <>
      <header
        className={cn(
          'flex items-center gap-3 h-topbar px-4 lg:px-6 bg-odoo-grey border-b border-border-light text-ink',
          className,
        )}
      >
        {/* Mobile: hamburger */}
        <button
          className="md:hidden flex items-center justify-center w-9 h-9 rounded-xl text-ink hover:bg-grey-tint transition-colors touch-target"
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
            className="flex items-center justify-center w-9 h-9 rounded-xl text-ink hover:bg-grey-tint transition-colors"
            aria-label="Search"
          >
            <Search size={18} />
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              className="relative flex items-center justify-center w-9 h-9 rounded-xl text-ink hover:bg-grey-tint transition-colors"
              aria-label="Notifications"
              onClick={() => {
                if (!isForbiddenOrNotFound) {
                  setNotifDropdownOpen((v) => !v)
                }
              }}
            >
              <NotifIcon size={18} />
              {/* Unread count badge */}
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-4 px-1 flex items-center justify-center rounded-full bg-primary-500 text-[10px] font-bold text-ink border border-ink leading-none">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notifications Dropdown */}
            {notifDropdownOpen && !isForbiddenOrNotFound && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setNotifDropdownOpen(false)} />
                <div className="absolute right-0 top-full mt-2 z-50 w-80 max-w-[90vw] bg-surface rounded-2xl shadow-raised border border-border-light py-2 animate-scale-in text-ink">
                  <div className="px-4 py-2 border-b border-border-light flex items-center justify-between">
                    <h3 className="text-xs font-bold text-ink uppercase tracking-wider">Notifications</h3>
                    {unreadCount > 0 && (
                      <span className="text-[11px] font-bold text-ink bg-primary-500 px-2 py-0.5 rounded-full border border-ink">
                        {unreadCount} unread
                      </span>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-border-light/50">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-xs text-ink">No notifications yet</div>
                    ) : (
                      notifications.map((n) => {
                        const isUnread = !n.read_at
                        return (
                          <div
                            key={n.id}
                            onClick={() => handleNotificationClick(n.id, n.link)}
                            className={cn(
                              'p-3 flex items-start gap-2.5 transition-colors cursor-pointer hover:bg-surface-light',
                              isUnread ? 'bg-primary-50' : 'opacity-85'
                            )}
                          >
                            <div className="mt-0.5 flex-shrink-0">
                              <span
                                className={cn(
                                  'inline-block px-1.5 py-0.5 text-[9px] font-extrabold rounded-md uppercase tracking-wider',
                                  n.type === 'NEW_LEAD'
                                    ? 'bg-status-info text-ink border border-accent-teal'
                                    : n.type === 'LOW_STOCK'
                                    ? 'bg-status-warning text-ink border border-accent-orange'
                                    : 'bg-surface-dark text-ink border border-ink'
                                )}
                              >
                                {n.type.replace('_', ' ')}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={cn('text-xs leading-snug', isUnread ? 'font-bold text-text-primary' : 'font-medium text-text-secondary')}>
                                {n.title}
                              </p>
                              {n.body && <p className="text-[11px] text-text-tertiary mt-0.5 line-clamp-2">{n.body}</p>}
                              <p className="text-[10px] text-text-tertiary mt-1">
                                {formatDate(n.created_at)} {formatTime(n.created_at)}
                              </p>
                            </div>
                            {isUnread && <span className="w-2 h-2 rounded-full bg-primary-500 mt-1 flex-shrink-0" />}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Divider */}
          <div className="hidden md:block w-px h-6 bg-border-light mx-1" />

          {/* Account menu. A role only changes by logging out and signing in as another user. */}
          <div className="relative">
            <button
              onClick={() => setAccountMenuOpen((v) => !v)}
              className="flex items-center gap-2 px-2 py-1 rounded-xl hover:bg-surface transition-colors"
              aria-label="Account menu"
            >
              <Avatar name={user?.full_name ?? 'User'} size="sm" />
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium text-text-primary leading-tight">{user?.full_name}</p>
                <p className="text-[11px] text-text-tertiary leading-tight">{user ? ROLE_LABELS[user.role] : ''}</p>
              </div>
              <ChevronDown size={14} className="hidden md:block text-text-tertiary" />
            </button>

            {accountMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setAccountMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-surface rounded-2xl shadow-raised border border-border-light py-1 min-w-[220px] animate-scale-in">
                  <div className="px-3 py-2 border-b border-border-light">
                    <p className="text-sm font-semibold text-text-primary truncate">{user?.full_name}</p>
                    <p className="text-[11px] text-text-tertiary truncate">{user?.email}</p>
                    <p className="text-[11px] text-primary-600 font-medium mt-0.5">{user ? ROLE_LABELS[user.role] : ''}</p>
                  </div>
                  <button
                    onClick={async () => {
                      setAccountMenuOpen(false)
                      await logout()
                      navigate('/login', { replace: true })
                    }}
                    className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm text-accent-red hover:bg-canvas transition-colors"
                  >
                    <LogOut size={16} />
                    Log out
                  </button>
                </div>
              </>
            )}
          </div>
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
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-colors touch-target',
        active ? 'bg-primary-500 text-ink shadow-pill' : 'text-ink hover:bg-surface-light',
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

