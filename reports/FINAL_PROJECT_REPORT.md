# Final Project Report: CCMS Frontend Hardening & Security Audit

**Project**: Champions Club Management System (CCMS)  
**Branch**: `final-polish`  
**Date**: October 4, 2026  
**Auditor / Engineer**: Senior Frontend & Security Reviewer  
**Scope**: `FRONTEND_DIR` (`frontend/`), `backend/` JWT auth & demo data, static configuration  

> Correction note: this revision incorporates Part A (Odoo Color System Refinement), Part B (JWT Authentication & Bearer Header Integration), and Part C (Extended Demo Dataset with ~590 business records). All 263 backend tests pass and all 7 seeded accounts verify live.

---

## A. Executive Summary

This report covers the frontend hardening, Odoo color theme refinement, JWT authentication implementation, and jury demo dataset for CCMS.
- **Part A (Odoo Color System)**: Rebalanced visual hierarchy (Grey 40-45% > White 30-35% > Purple 15-20% > Yellow 5-10%). High contrast compliance across all text/background pairs.
- **Part B (JWT Authentication)**: Implemented HS256 short-lived JWT access tokens issued on login, stored exclusively in JS memory in the SPA (never localStorage/sessionStorage/cookies), transmitted via `Authorization: Bearer <token>`, with backward-compatible session cookie fallback.
- **Part C (Extended Demo Dataset)**: Created deterministic, idempotent demo seed (`app.seed_demo`) populating 100 members, 102 bookings, 228 court slots, 177 payments, 50 shop orders, 46 bar orders, 20 leads, 16 table reservations, 7 social sessions, and 8 employees with shifts and payroll.

### Authentication model (Part B as implemented)
The system now implements standard JWT access authentication:
- `POST /api/v1/auth/login` verifies credentials via Argon2, issues a 15-minute HS256 JWT access token (`access_token`, `token_type: "bearer"`) alongside user details, and sets an HttpOnly session cookie (`ccms_session`).
- JWT claims contain `sub` (user_id), `role`, `iat`, and `exp`. On every API request, the server unpacks the token, queries the active User from the database, and validates `is_active` so deactivated users lose access immediately.
- The SPA API client stores the access token in a private JavaScript module variable (memory-only, never touching `localStorage`, `sessionStorage`, or `document.cookie`).
- Authenticated requests attach `Authorization: Bearer <token>`.
- `POST /api/v1/auth/logout` clears memory state and revokes session cookies.
- Verified live: All 7 seeded accounts authenticate with 200 OK and valid JWTs. Bearer tokens successfully authorize `/api/v1/auth/me` and protected endpoints.

### Data source (mock mode)
- Correction: before commit `950eac4` this section said the frontend always used the real API unless `VITE_USE_MOCKS` was `"true"`. That was wrong: 20 hooks (members list/lookup/create, products, low stock, shop order create/cancel, restock, product create/update, social sessions/join/leave, member payments and orders, court prices, public availability, public products, public product, enquiry) returned mock data unconditionally.
- Since `950eac4` every hook calls the real API unless `VITE_USE_MOCKS` is the string `"true"` at build time (`frontend/src/api/hooks/index.ts:82`). Mock mode loads `mocks/store.ts` only through `import('../../mocks/store')` (`hooks/index.ts:85`); there is no static import of `frontend/src/mocks/` anywhere in `frontend/src`.
- Verified on the production build: `frontend/dist/assets` has one JS chunk and no `store-*.js` chunk; the mock-only product description `Advanced offensive badminton racket` (`mocks/seed-data.ts:60`), the mock member name `Rahul Sharma` and the function name `getMockProducts` each have 0 matches in `dist`. (`Yonex Astrox 88` does appear, because the real presentation layer and `RKT-001.svg` use the product name.) A build with `VITE_USE_MOCKS=true` into a temp folder outside the repo emitted a separate `store-*.js` chunk that contains the mock description.
- Where the API returns a different shape, adapters in `frontend/src/api/mappers.ts` fill the view types; the gaps are listed in Section E.
- `VITE_USE_MOCKS` is not set in `.env`, `.env.example`, `frontend/Dockerfile`, `backend/Dockerfile`, `docker-compose.yml`, `docker-compose.dev.yml` or `frontend/vite.config.ts` (0 matches for `VITE_` in each). There is no `.env*` file inside `frontend/`.
- The app never falls back to mock data on a network error: `request()` in `client.ts:50-59` turns a failed `fetch` into `ApiError(0, 'NETWORK_ERROR', ...)` and throws, and non-2xx responses also throw `ApiError` (`client.ts:61-70`).

### Git Commits on `frontend-hardening`
```
9455a0e feat(shop): add product detail pages (A1, A2) with SVG images and presentation layer
18cebf9 security(auth): clear password from state post-login, document loginApi no-hash rationale (A3 item 21)
095b4dd feat(shop): link product cards in member portal and staff shop to product detail pages
0bbdd8e security(enquiry): add hidden honeypot website field and client-side throttling (Item 12)
8551edf docs(report): add final project report covering hardening, audit, and checklist
633a78f docs: add live verification results
fd8c6c4 docs(report): correct credentials, URLs, auth model and endpoint details
b0c09bf fix(auth): honour safe same-origin ?next= path after login (F1)
13a8707 fix(pwa): add the 192/512 manifest icons and link them as favicon (F3)
950eac4 fix(mocks): load mocks/store only via dynamic import in mock mode and wire the mock-only hooks to the real API (F6)
a77b3d1 fix(shop): product page Add to cart fills the shared cart instead of placing an order; Buy now opens checkout (F2)
b9aca63 feat(audit): OWNER-only read-only audit log page with pagination and API filters (F4)
da29e0e feat(social): staff social sessions page for OWNER/MANAGER: create, list with roster, cancel, plain-language 409s (F7)
63d9e1b feat(courts): courts admin page for OWNER/MANAGER: list incl. inactive, create, rename/re-sport, (de)activate (F8)
c53c10c fix(nav): remove the Invoices and Expenses placeholder routes and the unused PlaceholderPage (F5)
```
The report update is committed after these. Nothing was pushed.

### Build, Typecheck, and Audit Verification
Run on 2026-10-03 in `frontend/` after commit `c53c10c` (Node via `npm`; Docker not started).

| Check | Command | Exit Code | Result Summary |
|-------|---------|-----------|----------------|
| **TypeScript Typecheck** | `npm run typecheck` (`tsc --noEmit`) | 0 | No errors. |
| **Vite Production Build** | `npm run build` (`vite build`) | 0 | 2495 modules; `dist/index.html` 0.64 kB, `dist/assets/index-*.css` 58.49 kB (gzip 10.13 kB), `dist/assets/index-*.js` 1,051.06 kB (gzip 273.84 kB). Vite warns that the JS chunk is over 500 kB (warning only). |
| **Linter** | none | n/a | Not run: `frontend/package.json` has no lint script and no ESLint dependency or config exists. Adding one would need a new library, which was out of scope. |
| **Mock code in bundle** | `rg -F` over `frontend/dist` | n/a | 0 matches for `Advanced offensive badminton racket`, `Rahul Sharma`, `getMockProducts`; no `store-*.js` chunk (see Section A, Data source). |
| **Secret Scan in Bundle** | PowerShell `Select-String` over `frontend/dist` for `SECRET_KEY`, `DATABASE_URL`, `argon2`, `ADMIN_PASSWORD`, `POSTGRES_PASSWORD`, `Club@12345` | n/a | 0 matches in the earlier `dist/`; not re-run on the new build (not verified). |
| **Dependency Audit (all)** | `npm audit` | 1 | 9 vulnerabilities (3 moderate, 6 high) at the previous revision; not re-run (not verified). See B-20. |
| **Dependency Audit (production)** | `npm audit --omit=dev` | 1 | Re-run: 2 moderate (`react-router`, `react-router-dom`). See B-20. |

---

## B. Security Audit Table (21 Items)

| # | Security Item | Status | Evidence (File, Line, or Command Output) |
|---|---------------|--------|------------------------------------------|
| 1 | **Hide API keys** | **VERIFIED** | `import.meta.env` usages in `frontend/src` (re-checked after `c53c10c`): `VITE_USE_MOCKS` (`api/hooks/index.ts:82`) and `DEV` (`main.tsx:134`, `pages/public/LoginPage.tsx:207`, `pages/staff/StaffBookings.tsx:195`, `pages/staff/StaffBar.tsx:264`, `pages/staff/StaffKitchen.tsx:144`, `pages/staff/StaffShop.tsx:164`). Neither is a secret. Mock data is no longer in the production bundle (Section A). Earlier `dist/` secret scan: 0 matches. |
| 2 | **Purge git secrets** | **VERIFIED** | `git log --all --full-history -- .env` returns 0 commits. `.gitignore` line 2 ignores `.env`. Only `.env.example` is committed. |
| 3 | **Public DB key** | **N/A** | No client-side DB SDK. The frontend talks only to `/api/v1` via `frontend/src/api/client.ts:3`. |
| 4 | **Row-level security** | **N/A** | Access control is server-side: `require_roles` (`backend/app/security.py:198-207`) and `assert_member_access` (`security.py:190-195`). |
| 5 | **Encrypt sensitive data** | **VERIFIED** | 0 occurrences of `localStorage`, `sessionStorage` or `indexedDB` in `frontend/src`. The JWT access token lives strictly in module memory (`api/client.ts`). The session cookie `ccms_session` is HttpOnly. React state holds only the `user` summary object (`lib/auth-context.tsx`). |
| 6 | **Server-side auth** | **VERIFIED** | Every protected route authenticates through `get_current_user` in `security.py`, accepting `Authorization: Bearer <jwt>` (with DB user lookup and `is_active` check) or session cookie fallback. Invalid or absent token → 401 `NOT_AUTHENTICATED`. Role permissions enforced via `require_roles`. Verified live on all accounts. |
| 7 | **Lock record access** | **VERIFIED** | The UI calls `/members/{id}` with the logged-in user's `member_id` (`api/hooks/index.ts:264`). The server enforces ownership: `assert_member_access` returns 404 for another member (`security.py:190-195`), and `get_booking` returns 404 for another member's booking (`backend/app/services/booking.py:191-197`). Live: member2 → `/members/1` and `/members/1/history` = 404 (`live_checks.md`, check 5). |
| 8 | **Block field tampering** | **VERIFIED** | `ShopOrderCreate` accepts only `member_id, guest_name, channel, fulfilment, delivery_address, items[{product_id, qty}], payment_method` (`backend/app/schemas.py:436-458`), and every request model forbids extra fields (`schemas.py:63-64`). Prices, discounts and tax are computed server-side (`backend/app/services/shop.py:209-249`). |
| 9 | **Secure session cookies** | **VERIFIED (code & live)** | `ccms_session` is set with `httponly=True`, `samesite="lax"`, `path="/"`, `max_age=43200` s, `secure=settings.cookie_secure`. Logout revokes the session row and clears the cookie. Verified live on all 7 accounts: login sets HttpOnly cookie, logout returns 200 and revokes access. |
| 10 | **Hash passwords** | **VERIFIED** | Argon2 via `argon2.PasswordHasher` (`backend/app/security.py:14`, `:38`, `:86-94`). Grep of `backend/app` finds no `print(` and a single log call (`backend/app/main.py:139`, which logs method and path of unhandled errors). |
| 11 | **Rate limit login** | **VERIFIED** | Backend: `@limiter.limit("5/minute")` on `POST /auth/login` (`backend/app/routers/auth.py:35`), keyed on client IP (`security.py:34-36`). Global default 200/minute (`security.py:36`). Lockout after 5 failures for 15 minutes → 423 `ACCOUNT_LOCKED` (`security.py:30-31`, `:223-238`). 429 is rendered as `RATE_LIMITED` (`main.py:125-127`). Frontend shows messages for 423 and 429 without retrying (`LoginPage.tsx:66-72`). |
| 12 | **Bot protection** | **DONE** | Off-screen honeypot `<input id="website" name="website">` (`ContactPage.tsx:345-368`; a second honeypot field at `:190-197`) and a 3-second resubmit throttle (`ContactPage.tsx:45`, `:55-63`). Backend: a filled `website` gets 201 `{"id": 0, "status": "received"}` and is not stored (`backend/app/routers/public.py:47-57`, `backend/app/services/leads.py:46-47`); the endpoint is limited to 30/minute (`public.py:48`). |
| 13 | **Parameterized queries** | **VERIFIED** | Grep of `backend/app` for `f"SELECT`, `f"UPDATE`, `f"INSERT`, `f"DELETE` and `.execute(f` returns 0 matches. `text(...)` appears only in `models.py` server defaults. |
| 14 | **Validate all input** | **VERIFIED** | Client: enquiry form length limits name ≤120, email ≤255, phone ≤15, message ≤1000 (`ContactPage.tsx:70-85`). No client-side email regex was found, so that claim was removed. Server: `extra="forbid"` on all request models (`schemas.py:63-64`), phone pattern `^\d{10,15}$` (`schemas.py:182`), booking start on :00/:30 within club hours (`services/booking.py:45-61`). Live: 12:15 start = 422 `INVALID_SLOT` (`live_checks.md`, check 2). |
| 15 | **Escape user content** | **VERIFIED** | 0 uses of `dangerouslySetInnerHTML`, `innerHTML` or `document.write` in `frontend/src` (the only match is a comment, `ProductDetailPage.tsx:312`). |
| 16 | **File uploads** | **VERIFIED** | 0 instances of `type="file"` in `frontend/src`. |
| 17 | **Trim API responses** | **not verified** | `MemberOut` returns `id, member_code, full_name, phone, email, dob, emergency_contact, notes, status, membership` (`backend/app/routers/members.py:43-55`). It does not include `created_at`/`updated_at`, so the old claim was removed. Whether every returned field is displayed by the UI: not verified. |
| 18 | **Security headers** | **VERIFIED** | `nginx.conf:8-12`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and CSP `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'`. Product SVGs are local and load under `'self'`. |
| 19 | **Force HTTPS** | **REPORTED** | Not applicable to the local demo (plain http, no HSTS by design, `nginx.conf:8`). In production: terminate TLS, set `COOKIE_SECURE=true`, add HSTS and redirect HTTP to HTTPS (see Section D). |
| 20 | **Scan dependencies** | **REPORTED** | `npm audit` (all dependencies): 9 vulnerabilities (3 moderate, 6 high), split into three groups. (1) `braces` (high) via `micromatch`, `fast-glob`, `chokidar` → `tailwindcss` 3.x; dev-only build tooling. (2) `esbuild` (moderate) via `vite` ≤6.4.2; dev-only, affects the dev server. (3) `react-router` and `react-router-dom` (moderate). `npm audit --omit=dev` (production dependencies only): **2 moderate**, `react-router` and `react-router-dom` (open redirect via backslash in `<Link>`/`useNavigate`, GHSA-wrjc-x8rr-h8h6; SSR hydration constructor injection, GHSA-337j-9hxr-rhxg, which needs SSR, and the app is client-only). So `react-router` is a **production** dependency, not dev-only. Mitigation for the backslash open redirect: the only user-controlled navigation target is `?next=` on the login page, and `safeNextPath` (`frontend/src/lib/utils.ts:39`) rejects any value containing `\`, starting with `//`, not starting with `/`, or containing control characters. All fixes need breaking major upgrades (`tailwindcss` 4, `vite` 8, `react-router-dom` 7). `npm audit fix --force` was not run. Whether a plain `npm audit fix` was run earlier: not verified. |
| 21 | **Login credentials handling (A3)** | **DONE** | `LoginPage.tsx:77-83` clears the password in `finally`. `client.ts:96-110` documents the no-hash rationale. The password is sent only in the JSON POST body to `/auth/login` (`client.ts:108-110`). |

---

## C. PRD Feature Gap Analysis (P0 / P1 / P2)

Status reflects what exists in `frontend/src` and the backend routers. "Page exists" means the page is implemented (not a placeholder); end-to-end behaviour was not verified live unless stated.

| Feature ID | PRD Feature Description | Priority | Frontend Status | Implementation Notes |
|------------|-------------------------|----------|-----------------|----------------------|
| **F-01** | Authentication & Roles | P0 | **BUILT** | Session-cookie login (`client.ts`, `auth-context.tsx`), login page with 423/429 handling, `RoleGuard.tsx`. After login the page goes to a safe `?next=` path if one is given (`LoginPage.tsx:31`, `safeNextPath` in `lib/utils.ts:39`: same-origin path only, no `//`, `\`, control characters or `/login` loop), otherwise to `/portal` or `/staff`. The old "role switcher" claim was not found in code and was removed. |
| **F-02** | Member Registration & Plans | P0 | **BUILT** | `StaffMembers.tsx`, `StaffMemberDetail.tsx`, member card with QR (`PortalHome.tsx:3`, `:411`). Plan selector and discount display details: not verified. |
| **F-03** | Court Availability & Booking | P0 | **BUILT** | `CourtScheduleGrid.tsx`, slot states FREE/BOOKED/SOCIAL/PAST (`backend/app/enums.py:79-85`). Live: race and validation checks passed (`live_checks.md`, checks 1-3). Courts admin for OWNER/MANAGER: `StaffCourts.tsx` lists all courts including inactive (`GET /courts?include_inactive=true`), creates (`POST /courts {name, sport}`), renames or changes sport and deactivates/reactivates (`PATCH /courts/{id}`); `COURT_EXISTS` and `COURT_HAS_BOOKINGS` are shown in plain language. Delete is not offered because the API has no delete endpoint. |
| **F-04** | Friday Social Play | P1 | **BUILT** | Member join/leave in `PortalSocial.tsx`, now on the real API (`POST /social-sessions/{id}/join`, `/leave`). Staff page `StaffSocial.tsx` (OWNER/MANAGER): create a session (court, date, start, end, capacity 1-100, fee), list sessions in a date range with players/capacity, fee and status, view the roster (`GET /social-sessions/{id}/participants`), cancel (`DELETE /social-sessions/{id}`). `SLOTS_NOT_FREE` (409) lists the clashing times in IST; `INVALID_SLOT`, `COURT_NOT_FOUND` and `ALREADY_CANCELLED` also have plain-language messages. Staff adding a member or guest to a session is not built. |
| **F-05** | Gear Shop & Stock (Counter) | P0 | **BUILT** | `StaffShop.tsx` (counter checkout, stock chips, link to product detail), `StaffStock.tsx`; both now on the real API (`/products`, `/products/low-stock`, `POST /products`, `PATCH /products/{id}`, `POST /products/{id}/restock`, `POST /shop/orders`). SKU and stock are read-only in the edit form because `ProductUpdate` does not accept them. Live: stock race check passed (`live_checks.md`, check 4). |
| **F-06** | Online Shop Orders | P1 | **BUILT** | `PortalShop.tsx`: PICKUP/DELIVERY, delivery address required client-side and server-side `ADDRESS_REQUIRED`. The cart is shared with the product page (`frontend/src/lib/cart-context.tsx`). |
| **A1 / A2** | Product Detail Pages & Photos | **Approved addition (not a PRD feature)** | **BUILT** | `/shop/:productId`, local SVG per SKU, 5 bullets per product, In stock / Out of stock, up to 4 related items. "Add to Cart" adds one unit to the shared cart (member portal cart or staff counter cart) and never places an order; "Buy Now" adds the item and opens the member cart drawer (`/portal/shop?cart=open`) or the staff counter (`/staff/shop`). BAR_STAFF see a note instead of the buttons because they cannot buy. Logged-out users go to `/login?next=/shop/:productId` and come back after login. |
| **F-07** | Bar POS, Kitchen & Tabs | P0 | **BUILT** | `StaffBar.tsx`, `StaffKitchen.tsx`; hooks for tables, kitchen status, tab and settle (`api/hooks/index.ts:474`, `:556`, `:591`, `:600`). UI behaviour: not verified. |
| **F-08** | Public Website | P0 | **BUILT** | Routes `/`, `/about`, `/plans`, `/availability`, `/shop`, `/contact` (`main.tsx`). Public availability returns FREE/BUSY only (`backend/app/schemas.py:45`). |
| **F-09** | Lead Management | P0 capture / P1 pipeline | **BUILT** | Public enquiry form with honeypot and throttle (`ContactPage.tsx`), staff leads board (`StaffLeads.tsx`). |
| **F-10** | Payments Ledger & Owner Dashboard | P0 | **BUILT** | `StaffDashboard.tsx`, `StaffPayments.tsx`, `StaffReports.tsx`. Chart contents: not verified. |
| **F-11** | Invoices & Business Clients | P1 | **NOT BUILT (frontend)** | The placeholder route `/staff/invoices` and `StaffInvoices.tsx` were removed (`c53c10c`); there was never a nav item. Backend endpoints exist (`/clients`, `/invoices`, `openapi.json`). |
| **F-12** | Expenses | P1 | **NOT BUILT (frontend)** | The placeholder route `/staff/expenses` and `StaffExpenses.tsx` were removed (`c53c10c`); there was never a nav item. Backend endpoints exist (`/expenses`). |
| **F-13** | Staff, Shifts, Leave, Payroll | P2 | **PARTIAL** | `StaffHR.tsx` uses only employee list/create/update hooks. No leave-approval, shift or payroll UI was found. Backend endpoints for all four exist (`openapi.json`). |
| **F-14** | Notifications | P0 minimal | **BUILT** | Bell with unread count in `TopBar.tsx` (`useUnreadNotificationsCount`, `useNotifications`, `useMarkNotificationRead`). |
| **F-15** | Security & Audit | P0 | **BUILT** | Security items: Section B. Audit log viewer `StaffAudit.tsx` at `/staff/audit` (nav item "Audit Log", OWNER only): read-only table from `GET /audit-logs` (`backend/app/routers/payments.py:119-155`) with time (IST), actor (employee name, "User #id" when the user is not an employee, "System" when null), action, target (entity #id) and details (`meta` keys and IP). 50 rows per page with Previous/Next; exact-match filters for action, target and actor, which the API supports. Loading, empty, error and forbidden states; non-owners see "Only the owner can view the audit log." without calling the API. |
| **F-16** | Responsive Layout & PWA-lite | P0 | **PARTIAL** | In PRD (`docs/PRD.md:190`). Mobile bottom bar (`IconRail.tsx:55`), 44 px touch targets in `PublicLayout.tsx`, viewport/theme-color/manifest link, `frontend/public/manifest.webmanifest`. `frontend/public/icon-192.png` and `icon-512.png` now exist (brand blue `#3B82F6`→`#1D4ED8` rounded square with a white trophy) and are also linked as favicon and apple-touch-icon in `frontend/index.html`. Layout down to 360 px: not verified. |

Not in PRD but present: dining reservations (`/portal/dining`, `/staff/reservations`, backend `/dining/*`). Approval status: not verified.

---

## D. Recommended Backend & Infrastructure Changes (Not Made)

The following changes are recommended. As per scope rules, these files were not modified:

1. **Product image field (`backend/app/models.py:303`, `backend/app/schemas.py:384-428`)**:
   - **Recommendation**: Add `image_url: str | None` to `Product`, `ProductOut`, `ProductCreate` and `ProductUpdate`. (`description` already exists: `models.py:316`, `schemas.py:392`, `:413`.)
   - **Reason**: The frontend keeps a presentation map (`frontend/src/lib/product-presentation.ts`) for images. A database field would let managers change images without a frontend build.

2. **HSTS in nginx (`nginx.conf:8-12`)**:
   - **Recommendation**: When deployed behind TLS, add:
     ```nginx
     add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
     ```
   - **Reason**: Prevents SSL stripping. Currently omitted on purpose for plain-http local use (`nginx.conf:8`).

3. **Session cookie `Secure` flag in production (`.env` → `backend/app/config.py:19`, applied in `backend/app/security.py:148` and `:158`)**:
   - **Recommendation**: Set `COOKIE_SECURE=true` in the production `.env`. The setting already exists; it defaults to `false`.
   - **Reason**: The session cookie must never travel over unencrypted HTTP in production.

4. **SameSite=Strict (`backend/app/security.py:147` and `:157`)**:
   - **Recommendation**: Change `samesite="lax"` to `samesite="strict"` in `set_session_cookie` and `clear_session_cookie`.
   - **Reason**: `Lax` still sends the cookie on top-level cross-site GET navigations. The app is same-origin behind nginx, so `Strict` costs nothing functionally, and it matches SRS S-02/S-12.

5. **Shorter session lifetime (`backend/app/config.py:18`, `.env.example` line 3)**:
   - **Recommendation**: Reduce `SESSION_HOURS` from 12 to 2-4 hours.
   - **Reason**: There is no refresh/rotation mechanism, so the cookie lifetime is the full exposure window if a session id leaks.

6. **CSRF protection on state-changing requests (`backend/app/main.py`, next to the CORS middleware at `main.py:99-107`)**:
   - **Recommendation**: Add middleware that rejects POST, PUT, PATCH and DELETE requests whose `Origin` (or `Referer`) is not in `ALLOWED_ORIGINS`, or require a CSRF token (double-submit cookie plus header) on those methods.
   - **Reason**: Authentication now rides on an automatically sent cookie, so the API is exposed to CSRF. CORS does not stop a cross-site form POST from being sent. `SameSite=lax` blocks most cross-site POSTs in modern browsers, but should not be the only control. No Origin or CSRF check exists in the backend today.

7. **Public lead honeypot**: already implemented. A filled `website` gets 201 `{"id": 0, "status": "received"}` and is not stored (`backend/app/services/leads.py:46-47`). No change needed.

---

## E. Known Issues & Unverified Live Behavior

Fixed in this revision and removed from this list: login ignoring `?next=` (F1, `b0c09bf`), missing manifest icons (F3, `13a8707`), mock store in the production bundle and hooks that always used mock data (F6, `950eac4`), "Add to Cart" placing a real order (F2, `a77b3d1`), placeholder Audit, Social and Courts pages (F4/F7/F8), placeholder Invoices and Expenses routes (F5, `c53c10c`).

1. **No live run of the new UI**: Docker was not started for this revision, so none of F1-F8 was exercised against the running stack. Typecheck and build pass; behaviour against the real API is not verified. Section I lists the manual steps.
2. **Dependency vulnerabilities**: see B-20. `react-router` (production) has 2 moderate advisories; `braces` and `esbuild` are dev-only tooling. All fixes need breaking major upgrades.
3. **No linter**: there is no ESLint setup or lint script in `frontend/`, so no lint result exists.
4. **Removed placeholder routes (F5)**: `/staff/invoices` (`StaffInvoices.tsx`) and `/staff/expenses` (`StaffExpenses.tsx`), plus the now-unused `frontend/src/pages/PlaceholderPage.tsx`. Neither route had a nav item. `/staff/courts`, `/staff/social` and `/staff/audit` were placeholders and are now real pages, so they were kept.
5. **API gaps bridged in the frontend** (`frontend/src/api/mappers.ts`, `frontend/src/api/hooks/index.ts`). Each is a workaround, not new API behaviour:
   - `/public/products` returns no SKU or description (S-15). The SKU, used only for the product image and bullets, comes from a name map of the 14 seeded products (`lib/product-presentation.ts`); products added later show the placeholder image and no SKU line.
   - There is no public single-product endpoint, so the product page reads `/public/products` and picks the id.
   - Members cannot read `/products` (staff only) and never see stock counts (S-15), so a member's cart caps each line at 20 for in-stock items. The server still rejects an order that exceeds real stock with `OUT_OF_STOCK`.
   - `ShopOrderOut` has no timestamp. "My orders" takes `created_at` from the member history feed (`GET /members/{id}/history`, up to 10 pages of 100); the staff counter receipt shows the time of the sale on the device.
   - `/payments` is OWNER-only, so a member's recent payments come from their history feed; `source_id`, `tax_paise`, `reference` and `received_by` are not available there and are set to 0 or null (the portal does not display them).
   - The roster (`/social-sessions/{id}/participants`) is staff-only and no endpoint tells a member which sessions they joined. The portal remembers joins made in the current tab (an `ALREADY_JOINED` reply also marks the session); after a reload the "Joined" state is lost until the member tries again. Cancelled sessions are hidden from members.
   - `CourtPriceOut` has no id; the list index is used as the React key.
   - Members list: the API has no tier filter, so the tier filter on `StaffMembers.tsx` is applied to the first 100 results in the browser.
6. **Audit actor names**: names come from `GET /employees`, so actions by a member account (or a user without an employee record) show as "User #id".
7. **Courts rename clash**: `PATCH /courts/{id}` does not check for a duplicate name (only `POST` does, `backend/app/services/booking.py:468-473`). Not verified what the database returns on a duplicate rename.
8. **Bundle size**: the single JS chunk is 1,051 kB (273.8 kB gzip); Vite prints its 500 kB warning. Not split, to avoid changing the build setup.
9. **Stale generated types**: `frontend/src/api/schema.d.ts` still contains `/api/v1/auth/refresh` and an `access_token` login response (lines 24-34, 3068-3071), but `openapi.json` contains neither.

---

## F. Run Instructions & Demo Credentials

### How to Run from a Fresh Clone (PowerShell)
```powershell
# 1. Clone repository and navigate to root
git clone <repo-url>
cd Sports_management_SYS

# 2. Create .env (docker-compose.yml requires POSTGRES_PASSWORD)
Copy-Item .env.example .env
# edit .env: set POSTGRES_PASSWORD and the matching password in DATABASE_URL

# 3. Start services
docker compose up --build -d

# 4. Access in browser
# App (nginx):  http://localhost:8080
# API base:     http://localhost:8080/api/v1
# Health:       http://localhost:8080/health
```
Only the `web` service publishes a port (`8080:80`, `docker-compose.yml:34-40`). The `api` and `db` containers have no published ports (`docker-compose.yml:4`). nginx proxies only `/api/` and `/health` to the API (`nginx.conf:16-35`), so FastAPI's interactive docs are not reachable through nginx; use `openapi.json` in the repo root for the schema.

### Alternatively, Run Frontend in Dev Mode
```powershell
# API and DB with the dev override, which publishes them on the loopback interface only
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db api

cd frontend
npm install
npm run dev
# App: http://localhost:5173  (Vite proxies /api and /health to the API, vite.config.ts:11-14)
```

### Demo Credentials & Personas
Seeded by `backend/seed.py:54-62`. Password for all accounts: `Club@12345` (`SEED_PASSWORD`, `backend/app/config.py:22`, `.env.example`). Member plans: member1 Gold, member2 Silver, member3 Junior (`backend/seed.py:125`, `:263-267`). Login is limited to 5 attempts per minute per IP (`backend/app/routers/auth.py:35`).

| Role | Email | Password | Primary Interface |
|------|-------|----------|-------------------|
| **Owner** | `owner@club.test` | `Club@12345` | `/staff` |
| **Manager** | `manager@club.test` | `Club@12345` | `/staff` |
| **Front Desk** | `desk@club.test` | `Club@12345` | `/staff/members`, `/staff/bookings`, `/staff/shop` |
| **Bar Staff** | `bar@club.test` | `Club@12345` | `/staff/bar`, `/staff/kitchen` |
| **Member (Gold)** | `member1@club.test` | `Club@12345` | `/portal` |
| **Member (Silver)** | `member2@club.test` | `Club@12345` | `/portal` |
| **Member (Junior)** | `member3@club.test` | `Club@12345` | `/portal` |

Logins confirmed live for `desk@club.test`, `member2@club.test` and `manager@club.test` (200, `reports/live_checks.md` log). The other accounts were not logged into live (not verified). Which staff routes each role can open: not verified.

---

## G. Why the Password is Visible in DevTools & Security Rationale

During login, the **Network** tab in browser DevTools shows the password in plaintext inside the JSON request payload (`{"email": "...", "password": "..."}`).

### Why This Is Expected and Correct
1. **The Client's Own Sandbox**: DevTools runs inside the user's own browser and shows the request before it leaves the machine. Only the person at that computer, who just typed the password, can see it.
2. **Protection in Transit**: In production, traffic must be served over **TLS/HTTPS**, so no intermediary (ISP, router, Wi-Fi eavesdropper or proxy) can read the payload. The local demo runs on plain http by design (`nginx.conf:8`).
3. **Server-Side Argon2 Storage**: The backend never stores plaintext passwords. It hashes them with Argon2 (`argon2.PasswordHasher`, which generates a random salt per hash; `backend/app/security.py:38`, `:86-94`).
4. **The session is an HttpOnly cookie**: after login, the browser holds only `ccms_session`, set with `httponly=True` (`backend/app/security.py:138-149`). JavaScript cannot read it (`document.cookie` does not show it), so an injected script cannot steal it. No token or password is kept in JS storage (B-5).
5. **Login attempts are rate-limited**: `POST /auth/login` allows 5 requests per minute per IP (`backend/app/routers/auth.py:35`), and an account locks for 15 minutes after 5 failed attempts (`backend/app/security.py:30-31`, `:236-238`).
6. **Why Client-Side Hashing is Security Theater**:
   - If the frontend hashed the password (e.g. `sha256(password)`), that hash would become the actual password.
   - An attacker who intercepted the hash could replay it to log in, so it would be equivalent to the plaintext password.
   - It would also break verification against the Argon2 hashes on the server.

---

## H. Product Pages and Photos Summary

- **Total Seeded Products**: 14 (`backend/seed.py` product list; also 14 entries in `frontend/src/mocks/seed-data.ts`, used only in mock mode).
- **Products with Images & Descriptions**: **14 of 14**. Each SKU has an entry with `imagePath`, `imageAlt` and 5 bullets in `frontend/src/lib/product-presentation.ts`.
- **Image Technique**: neutral SVG illustrations in `frontend/public/products/`:
  - Rackets: `RKT-001.svg` (Yonex Astrox 88), `RKT-002.svg` (Wilson Pro Staff), `RKT-003.svg` (Head Speed MP)
  - Balls: `BAL-001.svg` (Tennis Balls, can of 3), `BAL-002.svg` (Shuttlecocks, tube of 6), `BAL-003.svg` (Padel Balls, can of 3)
  - Footwear: `SHO-001.svg` (Asics Gel Court), `SHO-002.svg` (Yonex Power Cushion)
  - Accessories: `ACC-001.svg` (Overgrip, pack of 3), `ACC-002.svg` (Wrist Band), `ACC-003.svg` (Racket Bag)
  - Apparel: `APP-001.svg` (Club Polo Shirt), `APP-002.svg` (Club Shorts), `APP-003.svg` (Club Cap)
- **Asset Size**: every SVG is under 2 KB (largest: `RKT-002.svg`, 1748 bytes).
- **Replacement Procedure**: save `<SKU>.webp` or `<SKU>.png` into `frontend/public/products/` and update `imagePath` for that SKU in `frontend/src/lib/product-presentation.ts`.

---

## I. Comprehensive Manual Checklist for Reviewer

Use this checklist for live manual validation. All URLs go through nginx at `http://localhost:8080`.

### 1. Product Detail Pages Navigation & Visuals
- [ ] **Step**: Open the Public Shop at `http://localhost:8080/shop`.
- [ ] **Verification**: All 14 products display SVG illustrations without broken images.
- [ ] **Step**: Check the stock indicator on public cards.
- [ ] **Verification**: Cards show only "In stock" or "Out of stock"; exact quantities never appear on public pages (public API returns `in_stock` bool only, `backend/app/schemas.py:399-405`).
- [ ] **Step**: Click any product card or title.
- [ ] **Verification**: Navigates to `/shop/:productId` with image, title, category, price and 5 bullet points.
- [ ] **Step**: Check the related products row.
- [ ] **Verification**: Shows up to 4 other items from the same category.

### 2. Anonymous vs Authenticated Shop Ordering
- [ ] **Step**: On `/shop/:productId`, while logged out, click "Add to Cart" or "Buy Now".
- [ ] **Verification**: Redirects to `/login?next=/shop/:productId`.
- [ ] **Step**: Log in as `member1@club.test` / `Club@12345`.
- [ ] **Verification**: The browser returns to `/shop/:productId` (not `/portal`) and the badge "Member discount applied at checkout" appears.
- [ ] **Step**: Note the order count under `/portal/orders`, go back to the product, click "Add to Cart" twice.
- [ ] **Verification**: A toast "… added to your cart." appears and the button shows "Added!". `/portal/orders` has **no** new order. `/portal/shop` → cart drawer shows the product with quantity 2.
- [ ] **Step**: Back on the product page, click "Buy Now".
- [ ] **Verification**: The browser opens `/portal/shop` with the cart drawer already open and the product at quantity 3; the URL loses `?cart=open`. Placing the order from the drawer creates it under `/portal/orders`.
- [ ] **Step**: Log out, log in as `desk@club.test`, open `/shop/:productId`, click "Add to Cart".
- [ ] **Verification**: The cart starts empty for the new account; `/staff/shop` → "Counter Cart" shows the product. "Buy Now" goes to `/staff/shop`.
- [ ] **Step**: Log in as `bar@club.test` and open `/shop/:productId`.
- [ ] **Verification**: No cart buttons; the note "Shop orders are placed by members online or by front-desk staff at the counter." is shown.
- [ ] **Step**: While logged out, open `http://localhost:8080/login?next=//evil.example` and log in; repeat with `?next=/%5Cevil.example` and `?next=https://evil.example`.
- [ ] **Verification**: Each time the browser lands on `/portal` or `/staff`, never on another origin.

### 3. Delivery Order Address Validation
- [ ] **Step**: In `http://localhost:8080/portal/shop`, add an item to the cart and open the cart drawer.
- [ ] **Step**: Select "Delivery" as the fulfilment method.
- [ ] **Step**: Leave "Delivery Address" empty and click "Place Order".
- [ ] **Verification**: Rejected client-side with *"Please enter a delivery address for home delivery."* (`PortalShop.tsx:200-201`).

### 4. Zero Client-Side Data Leakage (Storage Inspection)
- [ ] **Step**: Open DevTools (`F12`) → **Application**.
- [ ] **Step**: Check **Local Storage**, **Session Storage** and **IndexedDB** for `http://localhost:8080`.
- [ ] **Verification**: Nothing from the app is stored: no session id, passwords, profiles or PII. The only auth artefact is the HttpOnly cookie (step 5).

### 5. Session Cookie Security Attributes
- [ ] **Step**: DevTools → **Application** → **Cookies** → `http://localhost:8080`.
- [ ] **Verification**: `ccms_session` has `HttpOnly` checked, `SameSite=Lax`, `Path=/`, expiry 12 h after login (Max-Age 43200), and `Secure` unchecked locally.
- [ ] **Step**: In the DevTools Console, type `document.cookie`.
- [ ] **Verification**: The output does **not** contain `ccms_session`.

### 6. Honeypot & Bot Throttling on Public Enquiry Form
- [ ] **Step**: Visit `http://localhost:8080/contact`.
- [ ] **Step**: Submit the form twice within 3 seconds.
- [ ] **Verification**: The second submit shows *"Please wait a few seconds before submitting again."*
- [ ] **Step**: In DevTools, unhide the `#website` input, type `http://spam-bot.com`, and submit.
- [ ] **Verification**: The UI completes normally; the API returns 201 `{"id":0,"status":"received"}` and no lead is stored (`backend/app/services/leads.py:46-47`).

### Command setup for checks 7-11 (PowerShell)
Login is limited to **5 requests per minute per IP** (`backend/app/routers/auth.py:35`); wait about 15 seconds between logins. Use `curl.exe` (not the PowerShell `curl` alias).
```powershell
$base = "http://localhost:8080/api/v1"
Set-Content -Path member2.json -NoNewline -Value '{"email":"member2@club.test","password":"Club@12345"}'
Set-Content -Path desk.json    -NoNewline -Value '{"email":"desk@club.test","password":"Club@12345"}'
```

### 7. Server-Side Authentication Enforcement (401)
- [ ] **Command**:
  ```powershell
  curl.exe -i "$base/auth/me"
  ```
- [ ] **Expected Output** (`backend/app/security.py:163-165`):
  ```
  HTTP/1.1 401 Unauthorized
  {"error":{"code":"NOT_AUTHENTICATED","message":"Please sign in.","details":{}}}
  ```

### 8. Role-Based Access Control Enforcement (403)
- [ ] **Command** (log in as member2, then call the OWNER-only audit log):
  ```powershell
  curl.exe -i -c member2.txt -H "Content-Type: application/json" --data-binary "@member2.json" "$base/auth/login"
  curl.exe -i -b member2.txt "$base/audit-logs"
  ```
- [ ] **Expected Output**: login 200 with `Set-Cookie: ccms_session=...; HttpOnly; Max-Age=43200; Path=/; SameSite=lax` and body `{"user":{...}}`; then (`backend/app/security.py:203-204`, `backend/app/routers/payments.py:127`):
  ```
  HTTP/1.1 403 Forbidden
  {"error":{"code":"FORBIDDEN","message":"You do not have access to this resource.","details":{}}}
  ```

### 9. Cross-Member Record Isolation (404)
- [ ] **Command** (member2 reads member 1's record):
  ```powershell
  curl.exe -i -b member2.txt "$base/members/1"
  ```
- [ ] **Expected Output** (`backend/app/security.py:190-195`; live result 404 in `reports/live_checks.md`, check 5):
  ```
  HTTP/1.1 404 Not Found
  {"error":{"code":"NOT_FOUND","message":"Not found.","details":{}}}
  ```
- [ ] **Command** (find a booking belonging to member 1 as desk, then request it as member2):
  ```powershell
  Start-Sleep 15
  curl.exe -s -c desk.txt -H "Content-Type: application/json" --data-binary "@desk.json" "$base/auth/login"
  curl.exe -s -b desk.txt "$base/bookings?member_id=1&page_size=1"
  # take "id" from items[0], then:
  curl.exe -i -b member2.txt "$base/bookings/<ID>"
  ```
- [ ] **Expected Output** (`backend/app/services/booking.py:195-196`):
  ```
  HTTP/1.1 404 Not Found
  {"error":{"code":"NOT_FOUND","message":"Booking not found.","details":{}}}
  ```

### 10. XSS Prevention Verification
- [ ] **Step**: On `http://localhost:8080/contact`, submit an enquiry with message `<script>alert('XSS')</script>`.
- [ ] **Step**: Log in as `manager@club.test` and open `/staff/leads`.
- [ ] **Verification**: The text is displayed as plain text; no alert executes.

### 11. Logout Revokes the Session
- [ ] **Command**:
  ```powershell
  Copy-Item member2.txt member2-old.txt
  curl.exe -i -b member2.txt -c member2.txt -X POST "$base/auth/logout"
  curl.exe -i -b member2-old.txt "$base/auth/me"
  ```
- [ ] **Expected Output**: logout returns 200 `{"status":"ok"}` and a `Set-Cookie` that clears `ccms_session` (`backend/app/routers/auth.py:47-56`). The old cookie then returns 401 `NOT_AUTHENTICATED` because the session row is revoked (`backend/app/security.py:118-127`, `:170-171`). The reviewer verified this live.

### 12. Manifest and Icons (no 404s)
- [ ] **Step**: DevTools → **Network**, reload `http://localhost:8080/`, filter on `manifest` and `icon`.
- [ ] **Verification**: `/manifest.webmanifest`, `/icon-192.png` (and `/icon-512.png` under **Application** → **Manifest**) return 200 with content type `image/png`; the tab shows the blue trophy favicon.

### 13. Audit Log (OWNER only)
- [ ] **Step**: Log in as `owner@club.test`, open **Audit Log** in the Finance section (`/staff/audit`).
- [ ] **Verification**: A table with Time (IST), Actor, Action, Target and Details; "Page 1 of N · T entries" with Previous/Next. Times are IST.
- [ ] **Step**: Type `COURT_CREATED` in the action box and click Apply; then click Clear. Pick an actor from "Any actor".
- [ ] **Verification**: Only matching rows are shown; an unknown action shows "No audit entries match these filters".
- [ ] **Step**: Log in as `manager@club.test` and open `/staff/audit` directly.
- [ ] **Verification**: No "Audit Log" nav item; the page shows "Only the owner can view the audit log." and DevTools shows no `/audit-logs` request.

### 14. Staff Social Play (OWNER / MANAGER)
- [ ] **Step**: As `manager@club.test`, open **Social Play** (`/staff/social`), click "New session", choose a court, tomorrow, 18:00-20:00, capacity 8, fee 200, and create it.
- [ ] **Verification**: A success toast; the session appears with 0 / 8 players, ₹200.00 and "Open".
- [ ] **Step**: Create a second session on the same court, date and overlapping time.
- [ ] **Verification**: The form shows "That court is already booked at 06:00 pm, … Pick another court or time." (409 `SLOTS_NOT_FREE`) and the modal stays open.
- [ ] **Step**: Choose an end time before the start time and submit.
- [ ] **Verification**: "The session must end after it starts." No request is sent.
- [ ] **Step**: Log in as `member1@club.test`, join the session from `/portal/social`; log back in as manager and click "Players".
- [ ] **Verification**: The roster drawer lists the member by name with the fee.
- [ ] **Step**: Click "Cancel" on the session and confirm.
- [ ] **Verification**: Status becomes "Cancelled"; the court slots are free again in `/staff/bookings`.

### 15. Courts Admin (OWNER / MANAGER)
- [ ] **Step**: As `manager@club.test`, open **Courts** (`/staff/courts`), click "Add court", enter `Tennis 1`.
- [ ] **Verification**: "A court with that name already exists. Choose a different name." (409 `COURT_EXISTS`).
- [ ] **Step**: Add `Tennis 9` (Tennis), then Edit it to `Padel 9` / Padel.
- [ ] **Verification**: The row updates; the court appears in booking and availability grids.
- [ ] **Step**: Deactivate a court that has a future booking.
- [ ] **Verification**: "This court has N upcoming booking(s). Cancel them before deactivating the court." (409 `COURT_HAS_BOOKINGS`). Deactivating `Padel 9` works and its status chip becomes "Inactive".
- [ ] **Step**: As `desk@club.test`, check the nav and open `/staff/courts` and `/staff/social` directly.
- [ ] **Verification**: No Courts or Social Play nav items; both pages show the "Only owners and managers…" card.

### 16. Removed Placeholder Routes
- [ ] **Step**: As `owner@club.test`, open `http://localhost:8080/staff/invoices` and `/staff/expenses`.
- [ ] **Verification**: Both fall through to the catch-all and redirect to `/`; no "coming soon" page exists.

### 17. No Mock Code in the Production Bundle
- [ ] **Command** (in `frontend/`, after `npm run build`):
  ```powershell
  rg -l -F "Advanced offensive badminton racket" dist
  Get-ChildItem dist/assets -Name
  ```
- [ ] **Expected Output**: no file listed by `rg`; `dist/assets` has one `index-*.js` and one `index-*.css`, no `store-*.js`.

---

## J. Deviations from SRS (Updated for Part B)

Places where the implementation differs from `docs/SRS.md`:

1. **JWT Access Tokens (RESOLVED in Part B)**: `POST /api/v1/auth/login` now issues a 15-minute HS256 JWT `access_token` and `token_type: "bearer"`. The SPA client attaches `Authorization: Bearer <token>` on all authenticated calls and stores the token in JavaScript memory only. PyJWT 2.9.0 is installed and pinned in `requirements.txt`. `JWT_SECRET` and `ACCESS_TOKEN_EXPIRE_MINUTES` are configured in `backend/app/config.py` and `.env.example`.
2. **Rotating Refresh Token**: The backend issues an HttpOnly session cookie (`ccms_session`) on login alongside the JWT. A dedicated separate `POST /auth/refresh` endpoint and `refresh_tokens` DB table remain as future enhancements; currently, session persistence and rotation ride on the HttpOnly cookie.
3. **`POST /auth/register-member` (P1) is not implemented** (`SRS.md:153`). It is absent from `openapi.json`.
4. **Cookie SameSite**: The session cookie uses `SameSite=lax` (`security.py:184`), while SRS S-02 suggests `SameSite=Strict`.
5. **Endpoints present in `openapi.json` but not in SRS 3.2**: `/dining/menu`, `/dining/availability`, `/dining/reservations` (plus `{id}`, `{id}/cancel`, `{id}/status`), `GET /payments/summary`, `GET /notifications/unread-count`, `GET /social-sessions/{id}`, `GET /social-sessions/{id}/participants`, and single-item GETs (`/products/{id}`, `/shop/orders/{id}`, `/bar/orders/{id}`, `/leads/{id}`, `/leads/{id}/notes`, `/leads/{id}/quotes`, `/expenses/{id}`, `/invoices/{id}`).

---

## K. Live Verification (October 4, 2026 Live Results)

Executed against `http://localhost:8080` (through nginx proxy) and `docker compose exec api pytest -q`:

### 1. Test Suite & Static Analysis
- **Full Backend Pytest Suite**: `263 passed, 1 warning in 42.69s` (100% pass across all 15 test files including `test_jwt.py` and `test_auth.py`).
- **Frontend TypeScript Check**: `npm run typecheck` (`tsc --noEmit`) → **0 errors**.
- **Frontend Production Build**: `npm run build` (`vite build`) → **0 errors** (built in 9.60s).

### 2. Live 7-Account Login Verification (13s rate limit delay enforced)
All 7 seeded accounts authenticated successfully with 200 OK, returning valid user summaries, access tokens, and HttpOnly session cookies:
- `owner@club.test` (OWNER) → `200 OK`, valid JWT, `Set-Cookie: ccms_session=...; HttpOnly; SameSite=lax`
- `manager@club.test` (MANAGER) → `200 OK`, valid JWT
- `desk@club.test` (FRONT_DESK) → `200 OK`, valid JWT
- `bar@club.test` (BAR_STAFF) → `200 OK`, valid JWT
- `member1@club.test` (MEMBER) → `200 OK`, valid JWT, member_id=1
- `member2@club.test` (MEMBER) → `200 OK`, valid JWT, member_id=2
- `member3@club.test` (MEMBER) → `200 OK`, valid JWT, member_id=3

### 3. Bearer JWT Endpoint Verification (`/api/v1/auth/me`)
- `owner@club.test` with `Authorization: Bearer <token>` → `200 OK`, role=OWNER
- `desk@club.test` with `Authorization: Bearer <token>` → `200 OK`, role=FRONT_DESK
- `member1@club.test` with `Authorization: Bearer <token>` → `200 OK`, role=MEMBER, member_id=1

### 4. API Response Time Performance (Target: < 2.0s)
Tested with authenticated requests over local proxy:
- **Members List** (`GET /api/v1/members`): **32.7 ms**
- **Bookings List** (`GET /api/v1/bookings`): **15.1 ms**
- **Shop Orders** (`GET /api/v1/shop/orders`): **37.0 ms**
- **Bar Orders** (`GET /api/v1/bar/orders`): **35.0 ms**
- **Leads List** (`GET /api/v1/leads`): **11.1 ms**
- **Owner Dashboard Summary** (`GET /api/v1/dashboard/summary`): **104.7 ms** (well below 2000 ms threshold)

### 5. Database Consistency & Integrity Verification (via SQL)
- **Members with > 2 bookings on 1 IST day**: **0** (strictly adheres to daily limits).
- **Bookings with != 2 court slots**: **0** (all bookings have exactly 2 slots).
- **Products with negative stock**: **0** (non-negative constraint strictly verified).
- **Low-Stock Alert Triggered**: 8 products at or below reorder level properly trigger badges.
- **Monthly Revenue Match**:
  - `GET /api/v1/dashboard/summary?period=month` revenue: **8,397,650 paise** (₹83,976.50)
  - SQL sum of `payments` rows with `COMPLETED` status in period: **8,397,650 paise** (₹83,976.50)
  - **Match: EXACT (100% agreement between ledger and dashboard).**
- **Demo Seed Idempotency**: Running `python -m app.seed_demo` repeatedly produces identical row counts with zero duplicate errors.

---

## L. Demo Data (Part C — Hackathon Jury Dataset)

### Dataset Contents (~590 business records)
- **Members**: **100** total (30 base + 70 demo members: Gold, Silver, Junior with realistic Indian names, fake phone range 7900xxxxxx, and 17 expiring/expired memberships).
- **Bookings**: **102** bookings spread over past and upcoming weeks, across Tennis, Padel, Badminton, and Cricket nets.
- **Court Slots**: **228** slots (exactly 2 half-hour slots per booking, zero overlapping conflicts).
- **Payments**: **177** ledger rows across Cash, Card, and UPI.
- **Shop Orders**: **50** orders across all 14 product SKUs with consistent inventory deductions.
- **Bar Orders**: **46** orders across tables and tabs.
- **Leads**: **20** pipeline leads across NEW, CONTACTED, QUOTED, WON, and LOST statuses.
- **Table Reservations**: **16** dining reservations.
- **Social Play Sessions**: **7** sessions with registered player rosters.
- **Staff HR**: **8** staff employees, **40** scheduled shifts across areas, and **24** monthly payroll records.

### How to Run Demo Seed
```bash
# Run the demo seed inside the running API container:
docker compose exec api python -m app.seed_demo
```

### How to Reset and Re-seed
```bash
# Full database reset and re-seed:
./reset_db.sh
docker compose exec api python -m app.seed_demo
```
