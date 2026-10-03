# Frontend Build — Task Tracker

Source: `reports/prompt1.md` · Spec: `docs/SRS.md` §2.2–2.4, `docs/PRD.md` §F-16

---

## Phase 1 — Design System & App Shell (prompt1)

### 1. Foundation
- [x] `tailwind.config.js` — theme tokens (colors, border-radius, shadows, fonts)
- [x] `src/index.css` — base styles, Inter font, hatch pattern, scrollbar
- [x] Install `clsx` dependency

### 2. UI Components (`src/components/ui/`)
- [x] `Card.tsx`
- [x] `SectionHeader.tsx`
- [x] `PillTabs.tsx`
- [x] `IconRailItem.tsx`
- [x] `Avatar.tsx`
- [x] `AvatarStack.tsx`
- [x] `StatusChip.tsx`
- [x] `StatCard.tsx`
- [x] `Button.tsx`
- [x] `Modal.tsx`
- [x] `Drawer.tsx`
- [x] `DataTable.tsx`
- [x] `EmptyState.tsx`
- [x] `Skeleton.tsx`
- [x] `Toast.tsx`
- [x] `index.ts` — barrel export

### 3. Layout Components (`src/components/layout/`)
- [x] `AppShell.tsx` — icon rail + top bar + content area; bottom tabs on mobile
- [x] `TopBar.tsx` — pill tabs, search, avatar stack, bell, user avatar, role switcher
- [x] `IconRail.tsx` — floating left icon rail (desktop); bottom tab bar (mobile)
- [x] Navigation config object keyed by role (`src/lib/nav-config.ts`)
- [x] `RoleGuard.tsx` — guards routes based on role

### 4. Auth & Hooks
- [x] `src/hooks/useAuth.ts` — mock auth hook with role switcher (dev only)
- [x] `src/lib/auth-context.tsx` — AuthProvider context with mock users

### 5. Routing
- [x] React Router setup in `main.tsx` with QueryClient + AuthProvider + ToastProvider
- [x] Placeholder pages: `/`, `/about`, `/plans`, `/availability`, `/shop`, `/contact`, `/login`
- [x] Placeholder pages: `/portal/*` routes (home, book, bookings, shop, orders, social, profile)
- [x] Placeholder pages: `/staff/*` routes (dashboard, members, members/:id, bookings, courts, social, shop, stock, bar, kitchen, leads, payments, invoices, expenses, reports, hr, audit)
- [x] `/dev/design` — component showcase page

### 6. Utilities
- [x] `src/lib/utils.ts` — `cn()`, `formatINR()`, `formatDate()`, `formatTime()`, `getInitials()`
- [x] `src/lib/nav-config.ts` — navigation items by role
- [x] `src/api/client.ts` — API client scaffold

### 7. Verification
- [x] TypeScript compiles with zero errors (`npx tsc --noEmit`)
- [x] Vite dev server runs successfully
- [x] All 14 component sections render correctly on `/dev/design`
- [x] Modal, Drawer, and Toast interactions work
- [x] Icon rail and top bar navigation display correctly
- [x] Role switcher switches between OWNER/MANAGER/FRONT_DESK/BAR_STAFF/MEMBER

---

## Status
Phase 1: **COMPLETE** ✅

---

## Deliberately NOT done in this prompt
- Feature screens (members, bookings, shop, bar, dashboard, etc.)
- Real API integration (all endpoints use placeholder)
- Real authentication (JWT, refresh tokens)
- PWA manifest icons (192/512 png)
- Data fetching with TanStack Query (client scaffold ready)
- Mobile responsiveness fine-tuning (foundation is mobile-first)
- Public page layouts (no-shell public site design)
