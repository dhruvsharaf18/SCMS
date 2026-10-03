# CCMS — Task Tracker

Source of truth: `docs/SRS.md`. Current prompt: `reports/prompt_1.md` (H0 — repo skeleton + local deployment).

> Specification documents live in `docs/`; `reports/` holds build prompts and reports.

---

## Prompt 1 — Repo skeleton & local deployment (SRS §1.3, §1.4, §2.1, §2.2, §6, §11)

### Completed
- [x] Read SRS §1.3, §1.4, §2.1, §2.2, §6, §11 and the build playbook H0 row
- [x] `docker-compose.yml` — `db` (postgres:16, no published ports, named volume `pgdata`),
      `api` (built from `backend/Dockerfile`), `web` (multi-stage node → nginx:alpine, only `8080:80`)
- [x] `docker-compose.dev.yml` — publishes `127.0.0.1:5432` and `127.0.0.1:8000` only
- [x] `db/init/01-app-role.sh` — creates non-superuser app role `ccms_app` (SRS §11.1, S-20)
- [x] `backend/Dockerfile` (python:3.12-slim, uvicorn with `--proxy-headers --forwarded-allow-ips="*"`)
- [x] `backend/requirements.txt` — only SRS §1.3 libraries, versions pinned to what actually installs
- [x] `.env.example` — exactly as SRS §11.3
- [x] `backend/app/config.py` — pydantic-settings reading env
- [x] `backend/app/db.py` — `engine`, `SessionLocal`, `Base = DeclarativeBase`, `get_session`
- [x] `backend/app/enums.py` — placeholder (Dev B fills)
- [x] `backend/app/main.py` — FastAPI app, `GET /health`, startup `create_all()` + seed if `SEED=true`
- [x] `backend/seed.py` — placeholder `run_seed()` (Dev B fills)
- [x] Empty package skeleton: `backend/app/routers/`, `backend/app/services/`, `backend/tests/`
- [x] `nginx.conf` — SPA fallback, `/api/` proxy (prefix preserved), `X-Forwarded-For`/`X-Real-IP`,
      S-10 security headers, no HSTS
- [x] Minimal `frontend/` so the `web` stage builds (SRS §2.2 layout, §1.3 libraries)
- [x] `reset_db.sh` as in SRS §11.5
- [x] `README.md` documenting the `/api` prefix decision and run modes
- [x] `.gitignore` (S-13: `.env` never committed)
- [x] Verify: `docker compose ... up --build db api` + `curl localhost:8000/health`
- [x] Verify: `docker compose build web`
- [x] `reports/prompt_1_report.md` write-up

### Deliberately NOT done in this prompt
- Routers and models (`models.py`, `schemas.py`, `security.py`, `audit.py`, `routers/*`, `services/*`)
  — later prompts
- Real enum members in `enums.py` — Dev B
- Real seed data (SRS §10.1) — Dev B
- Error-envelope exception handlers (SRS §6) — handler module belongs to the auth/error prompt
- `frontend/public/icon-192.png` / `icon-512.png` (binary assets) — frontend prompt
- `package-lock.json` / `pip` lockfile commit (S-19 `pip-audit` / `npm audit` at H21)

---

## Status
Prompt 1: **COMPLETE** — verified on Docker 29.7.2 / Compose v5.3.1.

---

## Verification pass (prompt 1 audit)

| Check | Result |
|-------|--------|
| 1. `reset_db.sh` | PASS after fix — 4.6 s, `/health` 200, `ccms_app` still attribute-free |
| 2. fresh clone | PASS after fix — git initialised, `.env` ignored, only 8080 published |
| 3. client IP (S-23) | PASS — uvicorn logs the forwarded IP, not nginx's container IP |
| 4. XFF spoofing | PASS after fix — `$proxy_add_x_forwarded_for` → `$remote_addr` in both blocks |
| 5. frontend packages | PASS — all SRS 1.3 versions correct, no stray UI libraries |

### Defects found and fixed
- [x] `reset_db.sh`: `psql -c` does not interpolate `:"var"` — converted both statements to
      heredoc-on-stdin, the form `db/init/01-app-role.sh` already used
- [x] `reset_db.sh`: restart dropped an active dev override's port mapping — added `--dev` flag
- [x] `reset_db.sh`: added a readiness poll so "done" means the API answered `/health`
- [x] `nginx.conf`: `X-Forwarded-For` appended to client input, allowing IP spoofing past the
      lockout and rate limiter — now overwritten with `$remote_addr` in both proxy blocks
- [x] `.gitattributes` added: `core.autocrlf=true` would otherwise check out `*.sh` with CRLF on a
      fresh Windows clone and break the Postgres init script
- [x] git repository initialised, first commit `f01bf62`

### Known environment note (not a repo defect)
- On Windows the `bash` on `PATH` is the WSL shim with no distro installed; use Git Bash to run
  `reset_db.sh`. Documented in README.

---

## Prompt 2 — F-01 Auth & Roles (SRS 3.1, 3.2.1, 6, 7, 10)

### Completed
- [x] `enums.py`: `Role` (OWNER, MANAGER, FRONT_DESK, BAR_STAFF, MEMBER) + `STAFF_ROLES`
- [x] `models.py`: `users`, `refresh_tokens`, `audit_logs` per SRS 10 (+ `created_at`), imported in
      `main.py` before `create_all()`
- [x] `schemas.py`: Pydantic v2, `extra="forbid"` on every request body
- [x] SRS 6 error envelope as global handlers in `main.py`; `AppError` in `security.py`
- [x] `security.py`: argon2, password policy, HS256 JWT, `get_current_user`, `require_roles`,
      slowapi limiter, lockout, refresh rotation, user management
- [x] `audit.py`: `log()` in the caller's transaction; `USER_CREATED` / `USER_UPDATED`
- [x] `routers/auth.py`: login, refresh, logout, me, POST /users, PATCH /users/{id}
- [x] CORS from `ALLOWED_ORIGINS`, `allow_credentials=True`, `*` filtered out
- [x] `seed.py`: idempotent get-or-create of the 7 SRS 10.1 users only
- [x] `tests/`: 12 tests, all green

### Known gaps carried forward
- `member_id` in the login / `/auth/me` response is always `null` until the `members` table
  exists (F-02). The field is in the contract already so the frontend shape never changes.
- `/auth/register-member` is P1 and was skipped, as instructed.
- `PATCH /users/{id}` restricts `role` to the four staff roles, same as `POST /users`.
  The SRS does not say whether a staff user may be demoted to MEMBER; flagged, not guessed.

---

## Frontend Phase 1 — Design System & App Shell (`reports/prompt1.md`)

Spec: `docs/SRS.md` §2.2–2.4, `docs/PRD.md` §F-16

### Completed
- [x] Foundation: `tailwind.config.js` theme tokens (canvas `#E8ECF3`, rounded-3xl/32px, soft shadows, semantic accent colors), `src/index.css` Inter font + hatch pattern
- [x] UI Components (`src/components/ui/`):
  - `Card.tsx`, `SectionHeader.tsx`, `PillTabs.tsx`, `IconRailItem.tsx`
  - `Avatar.tsx`, `AvatarStack.tsx`, `StatusChip.tsx`, `StatCard.tsx`
  - `Button.tsx` (pill, primary/secondary/ghost/danger)
  - `Modal.tsx`, `Drawer.tsx`, `DataTable.tsx` (sortable + responsive)
  - `EmptyState.tsx`, `Skeleton.tsx`, `Toast.tsx` + `ToastProvider`
  - `index.ts` barrel export
- [x] App Shell & Layout (`src/components/layout/`):
  - `AppShell.tsx`: Outer soft container (`rounded-[32px]`), responsive layout (desktop icon rail / mobile bottom bar)
  - `TopBar.tsx`: Pill tabs, search trigger, avatar stack, action button, notification bell, role switcher
  - `IconRail.tsx`: Floating pill-shaped vertical icon rail + responsive mobile bottom navigation
  - `RoleGuard.tsx`: Role-based route guard
- [x] Config & Auth:
  - `src/lib/nav-config.ts`: Centralized navigation configuration keyed by role
  - `src/lib/auth-context.tsx` & `src/hooks/useAuth.ts`: Auth provider with mock role switcher for all personas
  - `src/lib/utils.ts`: `cn`, currency formatting (`formatINR`), date/time helpers, name initials
  - `src/api/client.ts`: Scaffolded typed API client targeting `/api` prefix
- [x] Routing & Placeholder Screens:
  - React Router setup in `main.tsx` with QueryClient + AuthProvider + ToastProvider
  - Public routes: `/`, `/about`, `/plans`, `/availability`, `/shop`, `/contact`, `/login`
  - Member portal routes: `/portal/*` (home, book, bookings, shop, orders, social, profile)
  - Staff routes: `/staff/*` (dashboard, members, courts, bookings, social, shop, stock, bar, kitchen, leads, payments, invoices, expenses, reports, hr, audit)
  - Design showcase page: `/dev/design` rendering all 14 components and interactive states
- [x] Verification:
  - TypeScript compiles clean (`tsc --noEmit`)
  - Dev server verified via browser subagent with zero visual defects across breakpoints (360px, 768px, 1280px)

### Status
Phase 1 Frontend: **COMPLETE** ✅

---

## Frontend Phase 2 — Staff Screens (`reports/prompt2.md`)

Spec: `docs/SRS.md` §1.4, §2.4, §3.1, §3.2, §10.1 · `docs/PRD.md`

### Data Layer
- [x] `src/api/types.ts` — exact SRS 3.2 JSON shapes (snake_case, *_paise integers, UTC ISO)
- [x] `src/lib/format.ts` — `formatMoney(paise)` integer-only arithmetic, `formatTimeIST`, `formatDateIST`
- [x] `src/mocks/` — seed-like data matching SRS 10.1 (courts, plans, prices, 14 products, 15 menu items, 8 tables, 30 members, 60-day history)
- [x] `src/api/hooks/` — TanStack React Query v5 hooks returning mock state with error simulations (SLOT_TAKEN, DAILY_LIMIT_REACHED, OUT_OF_STOCK, etc.)
- [x] Dev error-simulation toggle for mutations

### Stage A: FRONT_DESK
- [x] `CourtScheduleGrid` (`src/components/features/CourtScheduleGrid.tsx`): 30-min slots, 1-day view & 7-day overview, states (FREE, BOOKED, SOCIAL, hatch past slots, blue dashed today/now line)
- [x] `/staff/bookings`: grid + sport filter + date picker + booking Drawer (member lookup / walk-in guest, duration, tier price, payment method, inline errors) + cancel/complete/no-show actions
- [x] `/staff/members`: DataTable with search, tier & status filters, register Drawer; `/staff/members/:id` profile, membership, history
- [x] `/staff/shop`: counter POS sale: product grid, cart, member discount, payment method, out-of-stock handling, receipt Modal
- [x] `/staff` (FRONT_DESK dashboard): today's bookings, quick actions, read-only low-stock list

### Stage B: BAR_STAFF
- [x] `/staff/bar`: table grid, menu grid, order cart, add to order, payments, tabs list & settle flow
- [x] `/staff/kitchen`: KDS board (NEW -> PREPARING -> READY -> SERVED), forward-only touch cards, elapsed timer
- [x] Own-shift daily report card

### Stage C: OWNER and MANAGER
- [x] `/staff` (Executive dashboard): revenue StatCards, recharts breakdown, 30-day series, receivables/payables ("owed to us / we owe"), utilization, expiring members
- [x] `/staff/stock`: products DataTable, restock Modal (qty + note), add/edit product (MANAGER/OWNER)
- [x] `/staff/reports`: payments ledger table with date range and source/method filters, refund action, CSV export stub

### Status
Phase 2 Frontend (Staff Screens): **COMPLETE** ✅

---

## Frontend Phase 3 — Member Portal (`reports/prompt3.md`)

Spec: `docs/SRS.md` §2.4, §3.1, §3.2.3, §3.2.4, §3.2.5, §3.2.6, §3.2.7, §3.2.9 · `docs/PRD.md`

### Data Layer
- [x] `src/api/types.ts` — SocialSession, SocialSessionJoinInput, online order input, member-scoped types
- [x] `src/mocks/` — social sessions seed, member payments, 2-booking daily limit checks, session joining state
- [x] `src/api/hooks/` — Member-scoped hooks: `useMyBookings`, `useMyPayments`, `useMyOrders`, `useSocialSessions`, `useJoinSocialSession`, `useLeaveSocialSession`, `useCreateOnlineOrder`

### Pair 1: Portal Home & Court Booking
- [x] `/portal` (PortalHome.tsx): Greeting, Membership card (Tier, status ACTIVE/EXPIRING/EXPIRED, expiry date, member_code + QRCode display), upcoming bookings card, quick actions, my recent payments
- [x] `/portal/book` (PortalBook.tsx): Phone-friendly slot picker & court schedule, sport selector, date picker, tier price indicator, "Bookings today x/2" indicator, confirm Drawer, inline error handling (SLOT_TAKEN, DAILY_LIMIT_REACHED)

### Pair 2: My Bookings & Social Play
- [x] `/portal/bookings` (PortalBookings.tsx): Upcoming vs Past tabs, booking details, cancel Modal with refund info
- [x] `/portal/social` (PortalSocial.tsx): Friday social sessions, capacity & joined counts, Join/Leave mutation, SESSION_FULL and ALREADY_JOINED error handling

### Pair 3: Online Pro Shop & Order History
- [x] `/portal/shop` (PortalShop.tsx): Product catalogue grid by category, in_stock indicator ("In stock" / "Out of stock"), floating cart trigger, cart Drawer with integer money rules (SRS 1.4/4.6, tier discount, 18% GST), checkout (PICKUP / DELIVERY with required address), inline mock error handling (OUT_OF_STOCK, ADDRESS_REQUIRED, EMPTY_CART), order confirmation modal
- [x] `/portal/orders` (PortalOrders.tsx): Member's order history sorted newest first, status filter tabs, line items breakdown, cancellation flow for PLACED orders with full refund and stock restoration notice, inline error handling (ALREADY_CANCELLED, ORDER_LOCKED)

### Status
Phase 3 Frontend (Member Portal): **COMPLETE** ✅

---

## Frontend Phase 4 — Public Pages (`reports/prompt4.md`)

Spec: `docs/SRS.md` §2.4, §3.2.4, §3.2.7, §3.2.10, §10.1 · S-15 Public Data Rules

### Layout & Data Layer
- [x] `src/components/layout/PublicLayout.tsx`: Sticky top navigation (brand logo, pill links, mobile menu, login CTA), main container, and club footer (hours, location, contact, copyright)
- [x] `src/api/types.ts`: Public types (`PublicAvailabilityResponse`, `PublicProduct`, `PublicEnquiryInput`, `PublicEnquiryResponse`)
- [x] `src/mocks/store.ts` & `src/api/hooks/index.ts`: Public-only queries & mutations (`usePlans`, `useCourtPrices`, `usePublicAvailability`, `usePublicProducts`, `useSubmitEnquiry`) adhering to S-15 (no member names, phones, or exact stock counts)

### Stage A: Home & Membership Plans
- [x] `/` (HomePage.tsx): Hero with CTAs, 4-sport strip, live today's availability teaser, plans preview, amenities & facilities grid, member testimonials, closing CTA banner
- [x] `/plans` (PlansPage.tsx): Three tier cards (GOLD 3,000/mo, SILVER 1,500/mo, JUNIOR 800/mo) using `formatMoney`, court hourly rate comparison table (SRS §10.1), membership FAQ, custom group CTA

### Stage B: Public Court Availability & Pro Shop
- [x] `/availability` (AvailabilityPage.tsx): Sport filter chips, 7-day date strip, courts x 30-min slot grid showing FREE/BUSY states only, login prompt for booking
- [x] `/shop` (ShopPage.tsx): Public equipment catalogue grid by category, search filter, in_stock indicator ("In stock" / "Out of stock"), tier discount announcement, login-to-order flow

### Stage C: Enquiries & Login
- [x] `/contact` (ContactPage.tsx): Enquiry form (name, email, phone, interest, plan, message with 1000 char limit), hidden honeypot field (`website`), 429 rate limit handling, received-only success state (SRS §3.2.10), club contact details
- [x] `/login` (LoginPage.tsx): Email & password form, show/hide password toggle, generic invalid credentials error, distinct lockout message (423), role-based redirect (MEMBER -> `/portal`, Staff -> `/staff`), DEV mode demo quick-fill personas

### Status
Phase 4 Frontend (Public Pages): **COMPLETE** ✅

---

## Frontend Phase 5 — Real Auth Integration (SRS §3.2.1, §6, §7)

Spec: `docs/SRS.md` §3.2.1, §6, §7 (S-02 in-memory tokens, S-05 lockout, S-12 cookies)

### Implementation
- [x] `src/api/client.ts`: In-memory access token storage (never localStorage/sessionStorage), `credentials: 'include'` for HttpOnly refresh cookie, single in-flight `refreshSession()` promise on 401 `TOKEN_EXPIRED`, request retry, SRS §6 error envelope parsing into typed `ApiError`
- [x] `src/lib/auth-context.tsx`: Session restoration on load via `POST /auth/refresh`, loader screen during initialization, real `loginApi` and `logoutApi` flows, DEV role switcher gated behind `import.meta.env.DEV`
- [x] `src/pages/public/LoginPage.tsx`: Integrated with real `login(email, password)` API, strict error mapping (401 -> "Invalid email or password", 423 -> lockout message, 429 -> rate limit message), post-login role redirection (MEMBER -> `/portal`, Staff -> `/staff`)
- [x] `src/api/types.ts`: Auth request & response interfaces (`AuthUser`, `TokenResponse`, `LoginRequest`)

### Status
Phase 5 Frontend (Real Auth Integration): **COMPLETE** ✅

---

## Frontend Phase 6 — Courts, Availability & Bookings Real API (SRS §3.2.4, §3.2.5, §4.2, §6)

Spec: `docs/SRS.md` §1.4, §3.2.4, §3.2.5, §6

### Implementation
- [x] Swapped `useCourts`, `useCourtAvailability`, `useBookings`, `useCreateBooking`, `useCancelBooking`, `useUpdateBookingStatus` / `useSetBookingStatus`, `usePayBooking`, and `useMyBookings` to real API endpoints (`GET /courts`, `GET /courts/availability`, `GET/POST /bookings`, `POST /bookings/{id}/cancel`, `POST /bookings/{id}/status`, `POST /bookings/{id}/pay`)
- [x] Unwrapped paginated `PageOut` responses (`{ items, total, page, page_size }`) from `GET /bookings`
- [x] Preserved mock implementations behind `VITE_USE_MOCKS=true`
- [x] Retained error surfaces (`SLOT_TAKEN`, `DAILY_LIMIT_REACHED`, `INVALID_SLOT`, `GUEST_REQUIRED`, `ALREADY_CANCELLED`, `BOOKING_STARTED`)
- [x] Scoped fix: strictly aligned `Booking` interface to backend `BookingOut` schema (removed `court_name`, `sport`, `member_name`, `member_code`, `cancelled_at`, `cancel_reason`)
- [x] Derived `court_name` and `sport` from cached `useCourts()` data across all views (`PortalBookings`, `PortalHome`, `StaffBookings`, `StaffDashboard`, `StaffMemberDetail`)
- [x] Rendered member fallback `Member #<id>` / `Guest` across staff views (`StaffBookings`, `StaffDashboard`, `CourtScheduleGrid`)
- [x] Enforced `page_size=100` on paginated booking queries and used filtered queries (`date`, `status`) for daily 2-booking limit calculation in `PortalBook`

### Status
Phase 6 Frontend (Courts & Bookings Real API): **COMPLETE** ✅

---

## Frontend Phase 7 — Booking Member Info & Pay Body Fix (SRS §3.2.5, openapi.json)

Spec: `docs/SRS.md` §3.2.5, `openapi.json`

### Implementation
- [x] Updated `Booking` interface in `src/api/types.ts` to include required nullable fields `member_name: string | null` and `member_code: string | null` matching OpenAPI `BookingOut`.
- [x] Replaced `Member #<id>` fallback in `StaffBookings.tsx`, `StaffDashboard.tsx`, and `CourtScheduleGrid.tsx` with `member_name ?? guest_name ?? "Walk-in"`. Displayed `member_code` secondary label where space allows.
- [x] Verified member-facing screens (`PortalBookings`, `PortalHome`) do not display `member_name` or `member_code`.
- [x] Confirmed `usePayBooking` sends `{ payment_method }` body and `StaffBookings.tsx` handles `ALREADY_PAID` inline.
- [x] Documented type differences remaining between `src/api/types.ts` and `openapi.json`.

### Status
Phase 7 Frontend (Booking Member Info & Pay Body Fix): **COMPLETE** ✅

---

## Frontend Phase 8 — Dashboard & Payments Ledger Real API Integration (SRS §1.4, §3.2.9, §4.8, §6)

Spec: `docs/SRS.md` §1.4, §3.2.9, §4.8, §6, `openapi.json`

### Implementation
- [x] Swapped `useDashboardSummary`, `useRevenueSeries`, `usePayments`, and `useRefundPayment` hooks from mocks to real API endpoints (`GET /dashboard/summary`, `GET /dashboard/revenue-series`, `GET /payments`, `POST /payments/{id}/refund`) when `VITE_USE_MOCKS` is false.
- [x] Aligned `DashboardSummary`, `RevenueSeries`, `RevenueDay`, and `Payment` interfaces in `src/api/types.ts` strictly to `openapi.json` schemas.
- [x] Implemented paginated ledger in `StaffReports.tsx` requesting `page_size=100`, with page state and Next/Prev controls.
- [x] Restricted payment refund visibility to OWNER and MANAGER roles and refreshed queries (`['payments']`, `['dashboard']`) on refund mutation success.
- [x] Added `downloadPaymentsCsvApi` helper in `src/api/client.ts` to fetch `/reports/payments.csv` with Bearer auth token and trigger a Blob download.
- [x] Documented shape differences between original mock types and real API responses.

### Status
Phase 8 Frontend (Dashboard & Payments Real API Integration): **COMPLETE** ✅

---

## Frontend Phase 9 — Bar & Kitchen Real API Integration (SRS §3.2.8, §4.6, §6)

Spec: `docs/SRS.md` §3.2.8, §4.6, §6, `openapi.json`

### Implementation
- [x] Swapped `useMenuItems`, `useBarTables`, `useBarOrders`, `useCreateBarOrder`, `useAddBarOrderItems`, `useSetKitchenStatus`, `usePayBarOrder`, `usePutOnTab`, `useSettleTabs`, and `useBarDailyReport` from mocks to real REST API endpoints (`GET /menu-items`, `GET /bar/tables`, `GET/POST /bar/orders`, `POST /bar/orders/{id}/items`, `POST /bar/orders/{id}/kitchen-status`, `POST /bar/orders/{id}/pay`, `POST /bar/orders/{id}/tab`, `POST /bar/tabs/settle`, `GET /bar/reports/daily`).
- [x] Aligned `MenuItem`, `BarTable`, `BarOrderItem`, `BarOrder`, `TabSettleInput`, and `BarDailyReport` interfaces in `src/api/types.ts` strictly to `openapi.json` schemas.
- [x] Configured 5000 ms refetch interval polling for kitchen board order updates in `useBarOrders`.
- [x] Labeled cart subtotal as "Estimate" prior to order placement in `StaffBar.tsx`.
- [x] Documented all shape differences between mock types and real API responses.

### Status
Phase 9 Frontend (Bar & Kitchen Real API Integration): **COMPLETE** ✅

---

## Frontend Phase 10 — Leads & Notification Bell Integration (SRS §3.1, §3.2.10, §3.2.11)

Spec: `docs/SRS.md` §3.1, §3.2.10, §3.2.11, `openapi.json`

### Implementation
- [x] Built `/staff/leads` page (`StaffLeads.tsx`) gated for `OWNER`, `MANAGER`, and `FRONT_DESK` roles (`BAR_STAFF` and `MEMBER` redirected).
- [x] Added `DataTable` of `GET /leads` with status filter tabs (`NEW`, `CONTACTED`, `QUOTED`, `WON`, `LOST`), `page_size=100`, and total count header.
- [x] Implemented Lead detail Drawer with status change (`PATCH /leads/{id}`), notes list & creation (`POST /leads/{id}/notes`), quotes list & creation with integer rupee-to-paise conversion (`POST /leads/{id}/quotes`), and plain text message rendering.
- [x] Implemented Lead-to-Member conversion workflow (`POST /leads/{id}/convert`) pre-filling the member registration drawer; passing `lead_id` on `POST /members` marks the lead as WON on member creation.
- [x] Updated Notification Bell in `TopBar.tsx` using `GET /notifications` and `GET /notifications/unread-count` with 30s background polling, unread badge, dropdown list (type, text, IST timestamp), and mark as read action (`POST /notifications/{id}/read`).
- [x] Gracefully hid bell dropdown behaviour on 403/404 response errors without crashing.
- [x] Hid placeholder nav items (`/staff/courts`, `/staff/social`, `/staff/invoices`, `/staff/expenses`, `/staff/hr`, `/staff/audit`) from navigation.

### Status
Phase 10 Frontend (Leads & Notifications Integration): **COMPLETE** ✅

---

## Deferred to the mobile phase (H21)

- [ ] **Phone test over Wi-Fi.** Open `http://<LAN-IP>:8080` from a phone, then run
      `docker compose logs api --tail 5`. A `192.168.x.x` client address means the real IP is
      preserved. If it shows `172.20.0.1`, every phone shares one rate-limit bucket (S-23), so
      raise the login rate limit for demo mode and note it in the README.
- [ ] Add the LAN IP to `ALLOWED_ORIGINS` in `.env`.
- [ ] Allow inbound TCP 8080 in the Windows firewall (private network only).
- [ ] Create `frontend/public/icon-192.png` and `frontend/public/icon-512.png`, referenced by
      `manifest.webmanifest`.
- [ ] Verify "Add to Home Screen" and the viewport / `theme-color` meta tags.



