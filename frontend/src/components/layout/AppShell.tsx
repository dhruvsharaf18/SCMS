import { Outlet } from 'react-router-dom'
import { IconRail, BottomTabBar } from './IconRail'
import { TopBar } from './TopBar'

/**
 * AppShell: the main layout container.
 *
 * Desktop (≥768px):
 *   ┌──────────────────────────────────────────────────┐
 *   │  canvas (cool grey-blue background)              │
 *   │ ┌──┐ ┌─────────────────────────────────────────┐ │
 *   │ │  │ │ rounded-[32px] main container            │ │
 *   │ │  │ │ ┌──── TopBar ────────────────────────┐  │ │
 *   │ │Ic│ │ │  [pill tabs]        [🔍] [🔔] [👤] │  │ │
 *   │ │on│ │ └────────────────────────────────────┘  │ │
 *   │ │  │ │                                         │ │
 *   │ │Ra│ │  ┌─── Content (Outlet) ──────────────┐  │ │
 *   │ │il│ │  │                                    │  │ │
 *   │ │  │ │  └────────────────────────────────────┘  │ │
 *   │ └──┘ └─────────────────────────────────────────┘ │
 *   └──────────────────────────────────────────────────┘
 *
 * Mobile (<768px):
 *   ┌────────────────────────┐
 *   │ [☰]  Page Title  [🔔]👤│  ← TopBar
 *   │                        │
 *   │  Content (Outlet)      │
 *   │                        │
 *   │ [🏠] [👥] [📅] [🛒] [👤] │  ← BottomTabBar
 *   └────────────────────────┘
 */
export function AppShell() {
  return (
    <div className="min-h-screen bg-canvas p-2 md:p-4 lg:p-5">
      <div className="flex gap-3 h-full min-h-[calc(100vh-2.5rem)]">
        {/* Desktop icon rail */}
        <div className="hidden md:flex flex-col sticky top-4 self-start">
          <IconRail />
        </div>

        {/* Main container */}
        <div className="flex-1 bg-canvas rounded-shell border border-border-light flex flex-col min-h-0 overflow-hidden text-ink">
          <TopBar />

          {/* Content area */}
          <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-bottombar md:pb-6">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Mobile bottom tab bar */}
      <BottomTabBar />
    </div>
  )
}
