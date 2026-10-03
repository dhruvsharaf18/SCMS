# Frontend Design System & App Shell — Final Report

Champions Club Management System (CCMS) Frontend · Phase 1 (Prompt 1)
Stack: React 18, TypeScript, Vite, Tailwind CSS 3.4, React Router v6, TanStack React Query v5, lucide-react, clsx

---

## 1. Executive Summary

Phase 1 of the CCMS Frontend has been executed strictly against `reports/prompt1.md`, `docs/SRS.md` (§2.2–2.4), and `docs/PRD.md` (§F-16). 

The goal of this phase was to establish an **uncompromising, modern soft-UI design system** and a **responsive, role-driven application shell** without building premature feature screens or introducing heavy external component libraries (no MUI, Chakra, or shadcn).

Every reusable UI component, layout element, routing scaffold, role-guarding boundary, and theme token has been built, compiled with zero TypeScript errors (`tsc --noEmit`), and visually verified via automated browser inspection across mobile (360px), tablet (768px), and desktop (1280px+).

---

## 2. What Was Done

### 2.1 Design Tokens & Global Styling
- **`frontend/tailwind.config.js`**: Configured custom tokens:
  - Canvas background: `#E8ECF3` (`canvas`).
  - Containers: `rounded-[32px]` (`container`), `rounded-3xl` (`card` / 24px), `rounded-full` (`pill`).
  - Soft UI drop shadows: `shadow-soft` (`0 10px 30px -5px rgba(0, 0, 0, 0.04), 0 4px 12px -2px rgba(0, 0, 0, 0.025)`), `shadow-soft-md`, and `shadow-raised`.
  - Color palette: `brand-blue` (`#3B82F6`), `brand-purple` (`#8B5CF6`), `brand-green` (`#10B981`), `brand-yellow` (`#F59E0B`), `brand-red` (`#EF4444`), `text-main` (`#0F172A`), `text-muted` (`#64748B`).
- **`frontend/src/index.css`**: Configured Inter typography, smooth scrolling, custom scrollbar, and the diagonal hatch pattern `.hatch-pattern` (`repeating-linear-gradient(45deg, ...)`) for unavailable court slots.

### 2.2 Reusable UI Components (`src/components/ui/`)
All 14 specified atomic components were implemented in isolated, strongly typed files:
1. **`Card.tsx`**: White, rounded-3xl, soft shadow, generous padding, hover variants.
2. **`SectionHeader.tsx`**: Bold title, optional badge, and right-aligned "View all" navigation action.
3. **`PillTabs.tsx`**: Floating pill tabs with lightly tinted active state, badge counts, and smooth transitions.
4. **`IconRailItem.tsx`**: Vertical rail icon button with raised active state, tooltip, badge counter, and routing support.
5. **`Avatar.tsx`**: Circular avatar with fallback initials, online status indicator, and size variants (`xs`, `sm`, `md`, `lg`, `xl`).
6. **`AvatarStack.tsx`**: Overlapping cluster of avatars with automatic `+N` overflow bubble.
7. **`StatusChip.tsx`**: Pill-shaped status indicator badge with semantic color mappings ("Approved", "Pending", "Paid", "Low stock", "Overdue", etc.).
8. **`StatCard.tsx`**: Dashboard KPI card with metric label, formatted value, positive/negative delta indicator, and optional icon.
9. **`Button.tsx`**: Pill-shaped action buttons supporting `primary`, `secondary`, `ghost`, and `danger` variants, icon slots, and animated spinner loading states.
10. **`Modal.tsx`**: Accessible modal dialogue with backdrop blur, exit-on-ESC, click-outside handling, and soft container styling.
11. **`Drawer.tsx`**: Slide-over panel docking to the right viewport, ideal for details views, POS carts, and quick actions.
12. **`DataTable.tsx`**: Responsive data table supporting client-side column sorting, customizable cell renderers, empty state fallback, and pagination.
13. **`EmptyState.tsx`**: Clean placeholder for empty datasets with icon bubble, title, description, and primary CTA.
14. **`Skeleton.tsx`**: Shimmering pulse placeholders for text lines, avatars, and rectangular cards.
15. **`Toast.tsx`**: Complete toast notification system (`ToastProvider`, `useToast` hook) rendering floating status alerts (`success`, `error`, `info`, `warning`).
16. **`index.ts`**: Clean barrel export for all UI primitives.

### 2.3 Shell & Layout Architecture (`src/components/layout/`)
- **`AppShell.tsx`**: Master responsive wrapper. Encapsulates the application inside a canvas container (`rounded-[32px]`) with a floating left icon rail and sticky top bar on desktop. Automatically converts to a mobile bottom navigation bar and condensed header below 768px.
- **`TopBar.tsx`**: Features pill navigation tabs, quick search button, avatar stack with `+N` badge, primary action button, unread notification bell, and an interactive dev role switcher.
- **`IconRail.tsx`**: Floating vertical pill rail on desktop; switches to bottom navigation dock on mobile screens.
- **`RoleGuard.tsx`**: Route protection boundary ensuring users can only navigate to routes permitted by their role.

### 2.4 State, Navigation & Auth Abstractions
- **`src/lib/nav-config.ts`**: Single source of truth for navigation structure keyed by role (`owner`, `manager`/`admin`, `front_desk`/`receptionist`, `bar_staff`/`bartender`, `kitchen`, `shopkeeper`, `member`). Adding or editing nav items requires touching only this file.
- **`src/lib/auth-context.tsx` & `src/hooks/useAuth.ts`**: Auth provider with dev-only role switcher allowing instant live switching between `OWNER`, `MANAGER`, `FRONT_DESK`, `BAR_STAFF`, and `MEMBER` personas.
- **`src/lib/utils.ts`**: Utility helpers for class merging (`cn`), Indian Rupee formatting (`formatINR`), dates, times, and initials.
- **`src/api/client.ts`**: Standardized typed fetch client configured for the backend API proxy at `/api`.

### 2.5 Routing & Placeholder Pre-registration
Pre-registered all system routes with structured placeholders:
- **Public**: `/`, `/about`, `/plans`, `/availability`, `/shop`, `/contact`, `/login`.
- **Member Portal**: `/portal`, `/portal/book`, `/portal/bookings`, `/portal/shop`, `/portal/orders`, `/portal/social`, `/portal/profile`.
- **Staff Operations**: `/staff`, `/staff/members`, `/staff/members/:id`, `/staff/bookings`, `/staff/courts`, `/staff/social`, `/staff/shop`, `/staff/stock`, `/staff/bar`, `/staff/kitchen`, `/staff/leads`, `/staff/payments`, `/staff/invoices`, `/staff/expenses`, `/staff/reports`, `/staff/hr`, `/staff/audit`.
- **Design System Showcase**: `/dev/design` rendering every component, interaction, and design token.

---

## 3. How It Was Done

### 3.1 Token-Driven Soft-UI Design System
Instead of hardcoding colors, borders, and shadows throughout JSX, tokens were declared inside `tailwind.config.js`:
```javascript
// tailwind.config.js
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#E8ECF3',
        primary: { DEFAULT: '#3B82F6', hover: '#2563EB', light: '#EFF6FF' },
        brand: {
          purple: '#8B5CF6',
          green: '#10B981',
          yellow: '#F59E0B',
          red: '#EF4444',
        },
        'text-main': '#0F172A',
        'text-muted': '#64748B',
      },
      borderRadius: {
        'card': '24px',
        'pill': '9999px',
        'container': '32px',
      },
      boxShadow: {
        'soft': '0 10px 30px -5px rgba(0, 0, 0, 0.04), 0 4px 12px -2px rgba(0, 0, 0, 0.025)',
        'soft-md': '0 14px 34px -4px rgba(0, 0, 0, 0.06), 0 6px 16px -3px rgba(0, 0, 0, 0.03)',
        'raised': '0 4px 14px 0 rgba(59, 130, 246, 0.25)',
      },
    },
  },
};
```
All components compose these tokens directly (e.g. `bg-canvas`, `rounded-card`, `shadow-soft`).

### 3.2 Responsive Dual-Mode Shell
In `AppShell.tsx`, screen widths determine layout mode via Tailwind's `md:` breakpoint:
1. **Desktop (`>= 768px`)**:
   - Canvas padding `p-4 sm:p-6 lg:p-8`.
   - Floating left `IconRail` positioned vertically alongside main content.
   - `TopBar` displaying pill navigation tabs, search trigger, member avatar stack, notification bell, and dev role switcher.
2. **Mobile (`< 768px`)**:
   - `IconRail` shifts to a fixed bottom dock with icon and text labels.
   - `TopBar` collapses to club title, current role indicator, and avatar.
   - Content area includes bottom padding (`pb-20`) so floating elements never obscure page content.

### 3.3 Config-Driven Navigation
`src/lib/nav-config.ts` maps user roles to nav trees:
```typescript
export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  badge?: number;
}

export const ROLE_NAVIGATION: Record<UserRole, NavItem[]> = {
  OWNER: [...],
  MANAGER: [...],
  FRONT_DESK: [...],
  BAR_STAFF: [...],
  MEMBER: [...]
};
```
When the active role changes in `useAuth()`, both the `IconRail` and `TopBar` automatically re-render the appropriate routes and navigation tabs.

---

## 4. Why It Was Done

1. **Strict Alignment with Modern Soft-UI Spec**:
   - The PRD and SRS specify a premium sports club aesthetic: light cool grey-blue canvas (`#E8ECF3`), rounded containers (`rounded-[32px]`), pill-shaped interactive elements, and soft ambient shadows. Harsh dark lines, stark black borders, and heavy corporate styling were avoided.
2. **Zero Third-Party UI Lock-in**:
   - By constructing all 14 components in pure Tailwind and standard React, the application has zero dependency overhead, zero bundle bloat from complex CSS-in-JS libraries, and total customization freedom for sports club flows (court grids, POS tabs, hatch patterns).
3. **Role-Driven Shell Modularity**:
   - CCMS serves 5 distinct personas (Owner, Manager, Front Desk, Bar Staff, Member). Making navigation purely configuration-driven ensures future feature development only requires writing page components and registering a route, with zero layout refactoring.
4. **Dev Experience & Instant Visual Auditability**:
   - The `/dev/design` showcase and live role switcher allow engineers, designers, and stakeholders to test all UI components and role permissions without needing a seeded database or real authentication server running.

---

## 5. Verification & Testing

### 5.1 Static Analysis
- Run: `npm run typecheck` (`tsc --noEmit`)
- Result: **0 errors, clean exit code 0**.

### 5.2 Browser Subagent Visual Audit
The dev server was launched on `http://localhost:5173/dev/design` and thoroughly audited using the automated browser agent:
- **Visual Inspection**: Verified 14 dedicated showcase sections:
  1. Palette tokens (canvas, brand colors, text hierarchy).
  2. Typography scale.
  3. Diagonal hatch pattern (`.hatch-pattern`).
  4. Buttons (all variants, sizes, icon slots, disabled, and loading states).
  5. Status chips (Approved, Pending, Paid, Low stock, Overdue, Cancelled).
  6. Avatars & AvatarStacks (initials fallback, images, online dots, `+N` bubbles).
  7. StatCards (positive delta, negative delta, neutral, icons).
  8. PillTabs (tab switching, badge counters).
  9. IconRail items (active raised state, hover).
  10. Cards & SectionHeaders (actions, subtitles, hover cards).
  11. EmptyState & Skeletons.
  12. Interactive Modal (tested trigger, backdrop blur, close button, ESC).
  13. Interactive Drawer (tested slide-out panel, action footer).
  14. Interactive Toast (tested triggers for success, error, warning, info toasts).
  15. Interactive DataTable (tested column sorting by Name, Role, and Amount).
- **Responsive Layout Verification**:
  - `1280px` (Desktop): Floating left rail, spacious canvas, full top bar navigation.
  - `768px` (Tablet): Responsive wrapping, adaptable grid layouts.
  - `360px` (Mobile): Icon rail transforms into bottom navigation bar; top bar condenses cleanly.

---

## 6. Tasks Remaining & Implementation Roadmap

Now that the design system and application shell are complete, the following phases represent the remaining frontend feature work:

```
Phase 1: Design System & App Shell (DONE ✅)
   │
   ├── Phase 2: Auth & Role Gateways (F-01)
   ├── Phase 3: Member Portal & Court Booking (F-02, F-03, F-04)
   ├── Phase 4: Pro Shop & Inventory Management (F-05, F-06)
   ├── Phase 5: Bar POS & Kitchen Display (F-07)
   ├── Phase 6: Financials, Billing & Staff Dashboard (F-10, F-11, F-12)
   ├── Phase 7: Public Website & Lead Capture (F-08, F-09)
   ├── Phase 8: HR, Shifts & Payroll (F-13)
   └── Phase 9: PWA, Real-Time Notifications & Hardening (F-14, F-15, F-16)
```

---

## 7. How to Implement Remaining Tasks

### Phase 2: Authentication & Real RBAC (F-01)
1. **API Integration**:
   - Replace mock `auth-context.tsx` with calls to `POST /api/auth/login`, `POST /api/auth/refresh`, and `POST /api/auth/logout`.
   - Store access token in memory / React state and refresh token in `HttpOnly` cookie or secure rotation storage.
   - Implement axios/fetch interceptor in `src/api/client.ts` to automatically refresh tokens on 401 responses.
2. **Screens**:
   - Build `/login` with member code / email / password fields using `Card`, `Button`, and error toasts.
   - Wire `RoleGuard` to redirect unauthenticated requests to `/login`.

### Phase 3: Member Portal & Court Booking Engine (F-02, F-03, F-04)
1. **Interactive Court Grid**:
   - Build a 7-day court schedule grid using CSS grid (`grid-cols-7`).
   - Use `.hatch-pattern` for unavailable/maintenance slots.
   - Render booked slots with `StatusChip` and user avatars.
2. **Booking Flow**:
   - Implement click-to-book opening `Drawer` with slot duration, guest selection, and tier pricing calculation.
   - Integrate TanStack Query `useMutation` calling `POST /api/bookings` with optimistic updates.
3. **QR Code Check-In**:
   - Integrate `qrcode.react` to generate dynamic booking check-in passes.

### Phase 4: Pro Shop & Inventory (F-05, F-06)
1. **Catalog & Cart**:
   - Implement product grid using `Card` with image, category chip, price in `formatINR`, and stock badge.
   - Implement shopping cart drawer with item quantity increments and member discount calculation.
2. **Inventory Management (Staff)**:
   - Use `DataTable` for stock management with low-stock badges (`StatusChip variant="warning"`).
   - Add stock adjustment modal (`Modal`) with audit log notes.

### Phase 5: Bar POS & Kitchen Display System (F-07)
1. **Bar POS Screen**:
   - Fast-tap item grid categorized by drinks, snacks, and meals.
   - Active tabs manager supporting open tabs linked to member codes or guest cards.
   - Split-bill settlement modal (`Modal`) supporting cash, card, and member account balance.
2. **Kitchen Display System (KDS)**:
   - Card-based order queue showing elapsed prep timer, order items, and status progression (`PENDING` → `PREPARING` → `READY`).

### Phase 6: Financials, Billing & Staff Dashboard (F-10, F-11, F-12)
1. **Executive Dashboard**:
   - Compose `StatCard` row showing today's revenue, active court occupancy, member visits, and pending tabs.
   - Use Recharts to render revenue breakdown and hourly court utilization graphs.
2. **Ledger & Invoices**:
   - `DataTable` with date range filter, export to CSV button, and invoice preview drawer.

### Phase 7: Public Website & Lead Capture (F-08, F-09)
1. **Marketing Pages**:
   - Build public landing (`/`), `/about`, `/plans`, and court availability preview (`/availability`).
   - Implement lead enquiry form on `/contact` with honeypot spam protection.

### Phase 8: HR, Shifts & Payroll (F-13)
1. **Staff Management**:
   - Staff schedule calendar with shift assignments, leave approval modal, and payroll summary table.

### Phase 9: PWA & Polish (F-14, F-15, F-16)
1. **Mobile Experience**:
   - Generate `icon-192.png` and `icon-512.png` in `frontend/public/`.
   - Test "Add to Home Screen" on iOS Safari and Android Chrome.
   - Test offline fallback and background push notifications.

---

## 8. Summary Table of Files Created

| Category | File Path | Purpose |
|---|---|---|
| **Tokens & Styles** | `frontend/tailwind.config.js` | Custom color palette, rounded tokens, soft shadows |
| | `frontend/src/index.css` | Google Inter font, diagonal hatch pattern, scrollbar |
| **UI Components** | `frontend/src/components/ui/Card.tsx` | Soft white rounded card |
| | `frontend/src/components/ui/SectionHeader.tsx` | Header with title & "View all" action |
| | `frontend/src/components/ui/PillTabs.tsx` | Tab strip with active highlight & counters |
| | `frontend/src/components/ui/IconRailItem.tsx` | Vertical rail icon button with raised active state |
| | `frontend/src/components/ui/Avatar.tsx` | User avatar with image & initials fallback |
| | `frontend/src/components/ui/AvatarStack.tsx` | Overlapping avatar group with +N bubble |
| | `frontend/src/components/ui/StatusChip.tsx` | Rounded pill status badge with semantic colors |
| | `frontend/src/components/ui/StatCard.tsx` | KPI stat card with value & delta indicator |
| | `frontend/src/components/ui/Button.tsx` | Primary/secondary/ghost/danger pill button |
| | `frontend/src/components/ui/Modal.tsx` | Accessible modal dialog with backdrop blur |
| | `frontend/src/components/ui/Drawer.tsx` | Slide-over drawer for details & actions |
| | `frontend/src/components/ui/DataTable.tsx` | Sortable, responsive data table |
| | `frontend/src/components/ui/EmptyState.tsx` | Placeholder for empty lists with CTA |
| | `frontend/src/components/ui/Skeleton.tsx` | Shimmer pulse placeholders |
| | `frontend/src/components/ui/Toast.tsx` | Global toast alert provider & hook |
| | `frontend/src/components/ui/index.ts` | Barrel export for UI components |
| **Layout** | `frontend/src/components/layout/AppShell.tsx` | Responsive shell (desktop rail / mobile dock) |
| | `frontend/src/components/layout/TopBar.tsx` | Top bar with tabs, avatars, search, role switch |
| | `frontend/src/components/layout/IconRail.tsx` | Floating icon rail & mobile bottom bar |
| | `frontend/src/components/layout/RoleGuard.tsx` | Role-based route authorization barrier |
| **Utilities & State**| `frontend/src/lib/nav-config.ts` | Role-keyed navigation tree config |
| | `frontend/src/lib/auth-context.tsx` | Auth context provider with mock role switcher |
| | `frontend/src/hooks/useAuth.ts` | Custom auth hook |
| | `frontend/src/lib/utils.ts` | `cn`, INR currency formatter, date/time tools |
| | `frontend/src/api/client.ts` | Typed fetch API client scaffold |
| **Pages & Routes** | `frontend/src/pages/PlaceholderPage.tsx`| Pre-registered placeholder route component |
| | `frontend/src/pages/dev/DesignShowcasePage.tsx`| Interactive showcase of all design tokens & UI components |
| | `frontend/src/main.tsx` | App root with providers and complete route tree |
| **Tracking** | `reports/frontend_tasks.md` | Detailed task-by-task execution tracker |
| | `tasks.md` | Workspace task tracker with Phase 1 section |
| | `reports/frontend_report.md` | Final comprehensive frontend execution report |

---

## 5. Phase 8 — Dashboard & Payments Ledger Real API Integration

### Summary
Replaced mock data layer in dashboard and payments module with real REST API endpoints (`GET /dashboard/summary`, `GET /dashboard/revenue-series`, `GET /payments`, `POST /payments/{id}/refund`, `GET /reports/payments.csv`).

### Changes & Type Alignments
- `PaymentOut`: Removed non-existent `member_name` property to match `openapi.json` `PaymentOut`. Updated `StaffReports.tsx` customer column to `Member #<id>` / `Walk-in Guest`.
- `DashboardSummary`: Aligned nested schemas (`revenue.by_source`, `revenue.by_method`, `receivables`, `payables`, `bookings`, `members`, `leads`, `low_stock`) to `openapi.json`.
- `RevenueSeries`: Converted endpoint response to `RevenueSeries` shape (`{ period: string, days: RevenueDay[] }`).
- `PaginatedPayments`: Added `items`, `total`, `page`, `page_size` pagination handling in `StaffReports.tsx` with `page_size=100` and Next/Prev controls.
- `Refund`: Enforced RBAC (OWNER and MANAGER roles only) for payment refunds and set automatic query cache invalidation on `['payments']` and `['dashboard']`.
- `CSV Export`: Integrated `downloadPaymentsCsvApi` helper in `client.ts` using shared client with Bearer Authorization header saving response as Blob download.

---

## 6. Phase 9 — Bar & Kitchen Real API Integration

### Summary
Replaced mock data layer in Bar & Kitchen module with real REST API endpoints (`GET /menu-items`, `GET /bar/tables`, `GET/POST /bar/orders`, `POST /bar/orders/{id}/items`, `POST /bar/orders/{id}/kitchen-status`, `POST /bar/orders/{id}/pay`, `POST /bar/orders/{id}/tab`, `POST /bar/tabs/settle`, `GET /bar/reports/daily`).

### Changes & Type Alignments
- `BarOrder`: Removed mock properties `table_label`, `member_name`, `member_code`; made `paid_at: string | null` required and `created_at?: string` optional to match `openapi.json` `BarOrderOut`.
- `BarTable`: Removed mock `open_order_id`; replaced with required `open_orders: number` and `open_total_paise: number | null` matching `BarTableOut`.
- `BarDailyReport`: Updated `by_method` to `Record<string, number>` matching `openapi.json`.
- `TabSettle`: Implemented `POST /bar/tabs/settle` payload (`{ member_id, order_ids, method }`) returning total settled paise amount.
- `Polling`: Enabled 5000 ms `refetchInterval` polling for kitchen order board updates when `VITE_USE_MOCKS` is false.
- `Cart`: Labeled cart subtotal as "Estimate" prior to order placement in `StaffBar.tsx`.

