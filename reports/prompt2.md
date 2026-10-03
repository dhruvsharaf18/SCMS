Attach: @docs/SRS.md @docs/PRD.md
Do NOT read or follow reports/frontend_report.md. The SRS is the only source of truth.

TASK: Build the staff screens for the Champions Club Management System in stages. Stop after each stage and wait for me to say "continue".

ALLOWED: the existing components in src/components/ui and src/components/layout, plus recharts 2.x (SRS 1.3). No other new dependencies. Do not modify shared UI/layout files; if something is missing, tell me instead of editing it.
FORBIDDEN: new roles, new routes, report/tracking files, axios, service workers.

ROLES (SRS 3.1, exact enum): OWNER, MANAGER, FRONT_DESK, BAR_STAFF. Routes are only those in SRS 2.4: /staff, /staff/bookings, /staff/members, /staff/members/:id, /staff/shop, /staff/stock, /staff/bar, /staff/kitchen, /staff/reports. Respect the RBAC matrix: e.g. BAR_STAFF has no access to bookings or the dashboard; FRONT_DESK cannot restock or see expenses.

DATA LAYER (do this first, before any screen):

- src/api/types.ts: hand-written TypeScript types that mirror the SRS 3.2 JSON shapes exactly (snake_case keys, \*\_paise integers, ISO UTC strings). Header comment: "replace with openapi-typescript output".
- src/mocks/: seed-like data matching SRS 10.1 (courts: Tennis 1-2, Padel 1, Badminton 1-2, Cricket Net 1; plans GOLD/SILVER/JUNIOR; court prices; 14 products with 3 below reorder level; 15 menu items; 8 tables; ~30 members; 60 days of history for dashboards).
- src/api/hooks/: React Query v5 hooks (useCourtAvailability, useBookings, useCreateBooking, useMembers, useProducts, useCreateShopOrder, useBarTables, useBarOrders, useSetKitchenStatus, useDashboardSummary, ...) returning the mocks. Screens import ONLY from hooks, never from src/mocks.
- Mutations must be able to return the SRS error codes (SLOT_TAKEN, DAILY_LIMIT_REACHED, OUT_OF_STOCK, INVALID_TRANSITION, MEMBER_REQUIRED_FOR_TAB) so error UI is built and tested. Add a dev-only toggle to force an error.
- Utils (one place each): formatMoney(paise) -> "₹x.xx" using integers only; time helpers that display Asia/Kolkata from UTC ISO strings. Never use floats for money.

CONVENTIONS: touch targets >= 44px; every list/form has loading, empty and error states (NFR-008); bar and kitchen screens are tablet-first, the rest desktop-first; works at 768px and 1280px.

STAGE A: FRONT_DESK

1. CourtScheduleGrid (src/components/features/): rows = courts, columns = 30-minute slots for one day, with a toggle for a 7-day overview. States from the SRS: FREE (empty cell), BOOKED (colored block with member avatar and StatusChip), SOCIAL (purple block), past slots use the hatch pattern. Today/now marked with a blue dashed line. Horizontal scroll stays inside the grid.
2. /staff/bookings: grid + sport filter + date picker. Clicking a FREE slot opens a Drawer: member lookup by typed member_code (no camera), or walk-in guest name and phone (required when no member), 1-hour duration, price shown for the member's tier, payment method (CASH/CARD/UPI or "pay at desk"). Shows SLOT_TAKEN and DAILY_LIMIT_REACHED errors inline. Booking actions: cancel (with reason), mark COMPLETED/NO_SHOW, pay.
3. /staff/members: DataTable with search by name/phone/code, tier and status filters (ACTIVE/EXPIRING/EXPIRED/NONE), "register member" Drawer. /staff/members/:id: profile, membership, bookings, payments.
4. /staff/shop: counter sale: product grid by category, cart, member code lookup, automatic member discount shown, payment method, out-of-stock handling, receipt Modal.
5. /staff home for FRONT_DESK: today's bookings, quick actions, low-stock list (read-only).

STAGE B: BAR_STAFF

1. /staff/bar: table grid showing open order totals, menu grid with notes per item, cart, add items to an open order (not if SERVED or paid), pay (CASH/CARD/UPI), "put on tab" (member required), tabs list with settle flow.
2. /staff/kitchen: board with columns NEW, PREPARING, READY, SERVED. Forward-only transitions (NEW->PREPARING->READY->SERVED), large touch cards, elapsed-time label per order.
3. Own-shift daily report card.

STAGE C: OWNER and MANAGER

1. /staff dashboard from the dashboard/summary shape: revenue today/week/month StatCards, revenue by source and by payment method (recharts), 30-day revenue series, receivables and payables card ("owed to us / we owe"), utilization, expiring members, new leads, low-stock list.
2. /staff/stock: products DataTable with low-stock chips, restock Modal (qty + note), add/edit product (MANAGER/OWNER only).
3. /staff/reports: payments ledger table with date range and source/method filters, refund action, CSV export button (can be a stub).

RULES:

- Build in the stage order above and report after each stage: files created/changed and anything you were unsure about. Max 10 lines.
- Do not refactor or restyle anything that already works.
- If you hit the same error 3 times, stop and tell me; do not keep retrying.
- Do not invent endpoints, fields or statuses that are not in the SRS.
