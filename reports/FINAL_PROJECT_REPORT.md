# Final Project Report: CCMS Frontend Hardening & Security Audit

**Project**: Champions Club Management System (CCMS)  
**Branch**: `frontend-hardening`  
**Date**: October 4, 2026  
**Auditor / Engineer**: Senior Frontend & Security Reviewer  
**Scope**: `FRONTEND_DIR` (`frontend/`) and static asset configuration  

> Correction note: this revision was checked against the code (backend seed, `backend/app/security.py`, `backend/app/routers/auth.py`, `backend/app/config.py`, `openapi.json`, `frontend/src`), `docs/SRS.md`, `docs/PRD.md` and `reports/live_checks.md`. Anything that could not be confirmed from those sources is marked **not verified**.

---

## A. Executive Summary

This report covers the frontend hardening and approved additions for the CCMS hackathon delivery.
- **Design Frozen**: No changes were made to the visual design system, colour tokens, typography or layouts (not verified line by line; the hardening commits only add the files listed below).
- **Backend & Infra Untouched**: `git diff --stat 50e8aae..HEAD` shows changes only under `frontend/` and `reports/`. No file in `backend/`, `db/`, `nginx.conf` or the compose files was modified by the hardening commits.
- **Approved additions (not PRD features)**:
  1. **A1 & A2 (Shop Product Detail Pages & Photos)**: route `/shop/:productId` (`frontend/src/main.tsx`, `ProductDetailPage.tsx`), one local SVG per seeded product (14 files in `frontend/public/products/`), 5 bullet points per product (`frontend/src/lib/product-presentation.ts`), "In stock / Out of stock" indicator, and links from the public shop, member portal shop and staff counter shop.
  2. **A3 (Login request handling, item 21)**: password cleared from component state in a `finally` block (`frontend/src/pages/public/LoginPage.tsx:77-83`); `loginApi` documents why the password is not hashed client-side (`frontend/src/api/client.ts:96-110`).
  3. **Item 12 (Bot protection)**: hidden honeypot `website` field and a 3-second client-side resubmit throttle on the public enquiry form (`frontend/src/pages/public/ContactPage.tsx:45-63`, `:345-368`).

### Authentication model (as implemented)
The backend uses a **server-side session cookie**, not JWT access/refresh tokens (`backend/app/security.py:1-6`: "There are no JWTs").
- `POST /api/v1/auth/login` verifies email and password (`backend/app/routers/auth.py:34-44`, `backend/app/security.py:213-245`), creates a `login_sessions` row that stores only the SHA-256 of a random session id (`security.py:100-115`), and sets the cookie `ccms_session` (`security.py:32`, `:138-149`).
- Cookie attributes in code: `HttpOnly`, `SameSite=lax`, `Path=/`, `Max-Age = session_hours * 3600` with `session_hours = 12` → 43200 s (`backend/app/config.py:18`), `Secure = COOKIE_SECURE`, which defaults to `false` (`config.py:19`) and is `false` in `.env`.
- The login response body is `{"user": {id, email, full_name, role, member_id}}` only (`backend/app/schemas.py:98-122`).
- Every protected request reads the cookie and looks up the session; missing, unknown or revoked → 401 `NOT_AUTHENTICATED`, expired → 401 `SESSION_EXPIRED` (`security.py:162-178`).
- `POST /api/v1/auth/logout` marks the session revoked and clears the cookie (`auth.py:47-56`, `security.py:118-127`, `:152-159`).
- Verified live by the reviewer (not recorded in `reports/live_checks.md`): login returned `Set-Cookie: ccms_session=...; HttpOnly; Max-Age=43200; Path=/; SameSite=lax` with no `Secure` flag, the body contained only `{user}`, and after logout the old cookie returned 401 `NOT_AUTHENTICATED`.
- The frontend keeps only the returned `user` object in React state (`frontend/src/lib/auth-context.tsx:28-66`) and restores it on reload via `GET /auth/me` (`auth-context.tsx:41-54`). All requests use `credentials: 'include'` (`client.ts:52-56`). There is no token in JavaScript, no `Authorization` header and no refresh call.

### Data source (mock mode)
- The frontend calls the real API unless `VITE_USE_MOCKS` is set to the string `"true"` at build time (`frontend/src/api/hooks/index.ts:108`).
- `VITE_USE_MOCKS` is not set in `.env`, `.env.example`, `frontend/Dockerfile`, `backend/Dockerfile`, `docker-compose.yml`, `docker-compose.dev.yml` or `frontend/vite.config.ts` (0 matches for `VITE_` in each). There is no `.env*` file inside `frontend/`.
- Mock data and mock functions in `frontend/src/mocks/` are only called when `USE_MOCKS` is true. The module is still imported statically by `hooks/index.ts:106` for the dev error-simulation toggle (`useErrorSimulation`, `hooks/index.ts:111-117`). That toggle only affects mock functions (`mocks/store.ts:69-85`), and its buttons render only when `import.meta.env.DEV` is true.
- The app never falls back to mock data on a network error: `request()` in `client.ts:50-59` turns a failed `fetch` into `ApiError(0, 'NETWORK_ERROR', ...)` and throws, and non-2xx responses also throw `ApiError` (`client.ts:61-70`).

### Git Commits on `frontend-hardening`
```
9455a0e feat(shop): add product detail pages (A1, A2) with SVG images and presentation layer
18cebf9 security(auth): clear password from state post-login, document loginApi no-hash rationale (A3 item 21)
095b4dd feat(shop): link product cards in member portal and staff shop to product detail pages
0bbdd8e security(enquiry): add hidden honeypot website field and client-side throttling (Item 12)
8551edf docs(report): add final project report covering hardening, audit, and checklist
633a78f docs: add live verification results
```

### Build, Typecheck, and Audit Verification
| Check | Command | Exit Code | Result Summary |
|-------|---------|-----------|----------------|
| **TypeScript Typecheck** | `npm run typecheck` | not verified | Not re-run for this correction. |
| **Vite Production Build** | `npm run build` | not verified | Not re-run for this correction. An existing `frontend/dist/` (built 2026-10-04 01:32) contains 14 SVGs in `dist/products/`. Bundle sizes: not verified. |
| **Secret Scan in Bundle** | PowerShell `Select-String` over `frontend/dist` for `SECRET_KEY`, `DATABASE_URL`, `argon2`, `ADMIN_PASSWORD`, `POSTGRES_PASSWORD`, `Club@12345` | n/a | 0 matches in the existing `dist/`. |
| **Dependency Audit (all)** | `npm audit` | 1 | 9 vulnerabilities (3 moderate, 6 high). See B-20. |
| **Dependency Audit (production)** | `npm audit --omit=dev` | 1 | 2 moderate (`react-router`, `react-router-dom`). See B-20. |

---

## B. Security Audit Table (21 Items)

| # | Security Item | Status | Evidence (File, Line, or Command Output) |
|---|---------------|--------|------------------------------------------|
| 1 | **Hide API keys** | **VERIFIED** | `import.meta.env` usages in `frontend/src`: `VITE_USE_MOCKS` (`api/hooks/index.ts:108`) and `DEV` (`main.tsx:136`, `pages/public/LoginPage.tsx:208`, `pages/staff/StaffBookings.tsx:195`, `pages/staff/StaffBar.tsx:264`, `pages/staff/StaffKitchen.tsx:144`, `pages/staff/StaffShop.tsx:163`). Neither is a secret. Existing `dist/` scan: 0 secret matches. |
| 2 | **Purge git secrets** | **VERIFIED** | `git log --all --full-history -- .env` returns 0 commits. `.gitignore` line 2 ignores `.env`. Only `.env.example` is committed. |
| 3 | **Public DB key** | **N/A** | No client-side DB SDK. The frontend talks only to `/api/v1` via `frontend/src/api/client.ts:3`. |
| 4 | **Row-level security** | **N/A** | Access control is server-side: `require_roles` (`backend/app/security.py:198-207`) and `assert_member_access` (`security.py:190-195`). |
| 5 | **Encrypt sensitive data** | **VERIFIED** | 0 occurrences of `localStorage`, `sessionStorage` or `indexedDB` in `frontend/src`. No token exists in JavaScript: the session id is only in the HttpOnly `ccms_session` cookie (`security.py:138-149`). React state holds only the `user` object (`lib/auth-context.tsx:29`, `:62-66`). |
| 6 | **Server-side auth** | **VERIFIED** | `RoleGuard.tsx` is UX only. Every non-public route depends on `get_current_user` (cookie session lookup, `security.py:162-178`) through `require_roles` (`security.py:198-207`). Live: desk → `POST /products` = 403 `FORBIDDEN`; member2 → `GET /members/1` = 404 (`reports/live_checks.md`, checks 5 and 6). 401 without a cookie: manual check in Section I-7 (not in `live_checks.md`). |
| 7 | **Lock record access** | **VERIFIED** | The UI calls `/members/{id}` with the logged-in user's `member_id` (`api/hooks/index.ts:264`). The server enforces ownership: `assert_member_access` returns 404 for another member (`security.py:190-195`), and `get_booking` returns 404 for another member's booking (`backend/app/services/booking.py:191-197`). Live: member2 → `/members/1` and `/members/1/history` = 404 (`live_checks.md`, check 5). |
| 8 | **Block field tampering** | **VERIFIED** | `ShopOrderCreate` accepts only `member_id, guest_name, channel, fulfilment, delivery_address, items[{product_id, qty}], payment_method` (`backend/app/schemas.py:436-458`), and every request model forbids extra fields (`schemas.py:63-64`). Prices, discounts and tax are computed server-side (`backend/app/services/shop.py:209-249`). |
| 9 | **Secure session cookies** | **VERIFIED (code) / live per reviewer** | `ccms_session` is set with `httponly=True`, `samesite="lax"`, `path="/"`, `max_age=session_hours*3600` (12 h = 43200 s), `secure=settings.cookie_secure` (`security.py:138-149`, `config.py:18-19`). `COOKIE_SECURE=false` locally, so there is no `Secure` flag on plain http. Logout revokes the session row and deletes the cookie (`security.py:118-127`, `:152-159`); a revoked session returns 401 `NOT_AUTHENTICATED` (`security.py:170-171`). The reviewer verified the attributes and post-logout 401 live (not recorded in `live_checks.md`). Procedure: Section I-5 and I-11. |
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
| 20 | **Scan dependencies** | **REPORTED** | `npm audit` (all dependencies): 9 vulnerabilities (3 moderate, 6 high), split into three groups. (1) `braces` (high) via `micromatch`, `fast-glob`, `chokidar` → `tailwindcss` 3.x; dev-only build tooling. (2) `esbuild` (moderate) via `vite` ≤6.4.2; dev-only, affects the dev server. (3) `react-router` and `react-router-dom` (moderate). `npm audit --omit=dev` (production dependencies only): **2 moderate**, `react-router` and `react-router-dom` (open redirect via backslash in `<Link>`/`useNavigate`, GHSA-wrjc-x8rr-h8h6; SSR hydration constructor injection, GHSA-337j-9hxr-rhxg, which needs SSR, and the app is client-only). So `react-router` is a **production** dependency, not dev-only. All fixes need breaking major upgrades (`tailwindcss` 4, `vite` 8, `react-router-dom` 7). `npm audit fix --force` was not run. Whether a plain `npm audit fix` was run earlier: not verified. |
| 21 | **Login credentials handling (A3)** | **DONE** | `LoginPage.tsx:77-83` clears the password in `finally`. `client.ts:96-110` documents the no-hash rationale. The password is sent only in the JSON POST body to `/auth/login` (`client.ts:108-110`). |

---

## C. PRD Feature Gap Analysis (P0 / P1 / P2)

Status reflects what exists in `frontend/src` and the backend routers. "Page exists" means the page is implemented (not a placeholder); end-to-end behaviour was not verified live unless stated.

| Feature ID | PRD Feature Description | Priority | Frontend Status | Implementation Notes |
|------------|-------------------------|----------|-----------------|----------------------|
| **F-01** | Authentication & Roles | P0 | **BUILT** | Session-cookie login (`client.ts`, `auth-context.tsx`), login page with 423/429 handling (`LoginPage.tsx:66-72`), role-based routing to `/portal` or `/staff` (`LoginPage.tsx:59-64`), `RoleGuard.tsx`. The old "role switcher" claim was not found in code and was removed. |
| **F-02** | Member Registration & Plans | P0 | **BUILT** | `StaffMembers.tsx`, `StaffMemberDetail.tsx`, member card with QR (`PortalHome.tsx:3`, `:411`). Plan selector and discount display details: not verified. |
| **F-03** | Court Availability & Booking | P0 | **BUILT** | `CourtScheduleGrid.tsx`, slot states FREE/BOOKED/SOCIAL/PAST (`backend/app/enums.py:79-85`). Live: race and validation checks passed (`live_checks.md`, checks 1-3). |
| **F-04** | Friday Social Play | P1 | **PARTIAL** | Member join/leave in `PortalSocial.tsx`. Staff page `StaffSocial.tsx` is a placeholder (`PlaceholderPage`). |
| **F-05** | Gear Shop & Stock (Counter) | P0 | **BUILT** | `StaffShop.tsx` (counter checkout, stock chips, link to product detail), `StaffStock.tsx`. Live: stock race check passed (`live_checks.md`, check 4). |
| **F-06** | Online Shop Orders | P1 | **BUILT** | `PortalShop.tsx`: PICKUP/DELIVERY, delivery address required client-side (`PortalShop.tsx:200-201`) and server-side `ADDRESS_REQUIRED` (`PortalShop.tsx:233-234`). |
| **A1 / A2** | Product Detail Pages & Photos | **Approved addition (not a PRD feature)** | **BUILT** | `/shop/:productId`, local SVG per SKU, 5 bullets per product, In stock / Out of stock, up to 4 related items (`ProductDetailPage.tsx:110-112`). |
| **F-07** | Bar POS, Kitchen & Tabs | P0 | **BUILT** | `StaffBar.tsx`, `StaffKitchen.tsx`; hooks for tables, kitchen status, tab and settle (`api/hooks/index.ts:474`, `:556`, `:591`, `:600`). UI behaviour: not verified. |
| **F-08** | Public Website | P0 | **BUILT** | Routes `/`, `/about`, `/plans`, `/availability`, `/shop`, `/contact` (`main.tsx`). Public availability returns FREE/BUSY only (`backend/app/schemas.py:45`). |
| **F-09** | Lead Management | P0 capture / P1 pipeline | **BUILT** | Public enquiry form with honeypot and throttle (`ContactPage.tsx`), staff leads board (`StaffLeads.tsx`). |
| **F-10** | Payments Ledger & Owner Dashboard | P0 | **BUILT** | `StaffDashboard.tsx`, `StaffPayments.tsx`, `StaffReports.tsx`. Chart contents: not verified. |
| **F-11** | Invoices & Business Clients | P1 | **NOT BUILT (frontend)** | `StaffInvoices.tsx` is a placeholder. Backend endpoints exist (`/clients`, `/invoices`, `openapi.json`). |
| **F-12** | Expenses | P1 | **NOT BUILT (frontend)** | `StaffExpenses.tsx` is a placeholder. Backend endpoints exist (`/expenses`). |
| **F-13** | Staff, Shifts, Leave, Payroll | P2 | **PARTIAL** | `StaffHR.tsx` uses only employee list/create/update hooks. No leave-approval, shift or payroll UI was found. Backend endpoints for all four exist (`openapi.json`). |
| **F-14** | Notifications | P0 minimal | **BUILT** | Bell with unread count in `TopBar.tsx` (`useUnreadNotificationsCount`, `useNotifications`, `useMarkNotificationRead`). |
| **F-15** | Security & Audit | P0 | **PARTIAL** | Security items: Section B. The audit-log viewer `StaffAudit.tsx` is a placeholder; backend `GET /audit-logs` (OWNER) exists (`backend/app/routers/payments.py:119-127`). |
| **F-16** | Responsive Layout & PWA-lite | P0 | **PARTIAL** | In PRD (`docs/PRD.md:190`). Mobile bottom bar (`IconRail.tsx:55`), 44 px touch targets in `PublicLayout.tsx`, viewport/theme-color/manifest link (`frontend/index.html:5-7`), `frontend/public/manifest.webmanifest`. The manifest references `/icon-192.png` and `/icon-512.png`, which do not exist in `frontend/public/`. Layout down to 360 px: not verified. |

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

1. **Live checks**: concurrency, validation, IDOR and RBAC checks were run against the stack (see Section K). Other end-to-end UI flows: not verified.
2. **Dependency vulnerabilities**: see B-20. `react-router` (production) has 2 moderate advisories; `braces` and `esbuild` are dev-only tooling. All fixes need breaking major upgrades.
3. **Login ignores `?next=`**: the product page sends logged-out users to `/login?next=/shop/:productId` (`ProductDetailPage.tsx:182`), but `LoginPage.tsx:59-64` always redirects to `/portal` or `/staff`.
4. **"Add to Cart" on the product page places a real order**: `handleAddToCart` posts an ONLINE / PICKUP order with `payment_method: 'ONLINE_MOCK'` (`ProductDetailPage.tsx:185-215`). It does not add to a cart.
5. **Placeholder staff pages**: `StaffCourts.tsx`, `StaffSocial.tsx`, `StaffInvoices.tsx`, `StaffExpenses.tsx`, `StaffAudit.tsx`.
6. **Missing PWA icons**: `manifest.webmanifest` references `/icon-192.png` and `/icon-512.png`, which are not in `frontend/public/`.
7. **Stale generated types**: `frontend/src/api/schema.d.ts` still contains `/api/v1/auth/refresh` and an `access_token` login response (lines 24-34, 3068-3071), but `openapi.json` contains neither.

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
- [ ] **Verification**: Known issue: the browser goes to `/portal`, not back to the product (`LoginPage.tsx:59-64` ignores `next`). Navigate back to `http://localhost:8080/shop/:productId` manually; the badge "Member discount applied at checkout" appears.
- [ ] **Step**: Click "Add to Cart".
- [ ] **Verification**: The button shows "Added!". Note: this places a real ONLINE / PICKUP order (`ProductDetailPage.tsx:185-200`); check it under `/portal/orders`.

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

---

## J. Deviations from SRS

Places where the implementation differs from `docs/SRS.md`:

1. **Session cookie instead of JWT access + refresh tokens.** SRS S-02 (`SRS.md:497`) specifies a 15-minute HS256 access JWT plus a 7-day hashed, rotated refresh token. The implementation uses one opaque random session id in the `ccms_session` cookie, stored hashed, valid 12 hours, with no rotation (`backend/app/security.py:1-6`, `:100-115`; `backend/app/config.py:18`).
2. **No `Authorization: Bearer` header.** SRS 3.2 (`SRS.md:141`) says all endpoints require `Authorization: Bearer <access_token>`. The implementation authenticates every request from the cookie (`security.py:162-178`).
3. **Login response body.** SRS (`SRS.md:157-164`) returns `{"access_token","token_type","expires_in","user"}`. The implementation returns only `{"user"}` (`backend/app/schemas.py:120-121`).
4. **`POST /auth/refresh` is not implemented** (`SRS.md:150`). It is absent from `openapi.json` and `backend/app/routers/auth.py`.
5. **`POST /auth/logout` semantics.** SRS: "revokes refresh token" (`SRS.md:151`). Implementation: revokes the session row and clears the cookie (`auth.py:47-56`).
6. **`POST /auth/register-member` (P1) is not implemented** (`SRS.md:153`). It is absent from `openapi.json`.
7. **Cookie SameSite.** SRS S-02/S-12 require `SameSite=Strict` (`SRS.md:497`, `:507`). The implementation uses `SameSite=lax` (`security.py:147`).
8. **CSRF model.** SRS S-12 (`SRS.md:507`) relies on the Bearer header for the API, with only `/auth/refresh` reading a cookie. In the implementation every endpoint reads the cookie, and there is no Origin or CSRF-token check (see D-6).
9. **Expiry error code and client behaviour.** SRS (`SRS.md:554`): 401 `TOKEN_EXPIRED`, after which the frontend refreshes once and retries. Implementation: 401 `SESSION_EXPIRED` (`security.py:172-173`), after which the frontend drops to signed-out with no retry (`frontend/src/lib/auth-context.tsx:36-39`, `frontend/src/api/client.ts:66-68`).
10. **Token storage table.** SRS defines `refresh_tokens` (`SRS.md:600-602`). The implementation uses `login_sessions` (`backend/app/models.py:63-66`).
11. **Dependencies and config.** SRS lists PyJWT (`SRS.md:28`) and `JWT_SECRET` / `ACCESS_TOKEN_MINUTES` (`SRS.md:775-776`). `backend/requirements.txt` has no PyJWT; config uses `SESSION_HOURS` and `COOKIE_SECURE` (`backend/app/config.py:18-19`, `.env.example`).
12. **Endpoints present in `openapi.json` but not in SRS 3.2:** `/dining/menu`, `/dining/availability`, `/dining/reservations` (plus `{id}`, `{id}/cancel`, `{id}/status`), `GET /payments/summary`, `GET /notifications/unread-count`, `GET /social-sessions/{id}`, `GET /social-sessions/{id}/participants`, and single-item GETs (`/products/{id}`, `/shop/orders/{id}`, `/bar/orders/{id}`, `/leads/{id}`, `/leads/{id}/notes`, `/leads/{id}/quotes`, `/expenses/{id}`, `/invoices/{id}`).
13. **Generated frontend types are out of sync** (SRS NFR-010, `SRS.md:466`): `frontend/src/api/schema.d.ts` still describes `/auth/refresh` and an `access_token` response, which `openapi.json` does not contain.

---

## K. Live Verification

Source: `reports/live_checks.md` (no other live results are included here).

- **Target**: `http://localhost:8080/api/v1`
- **Run**: id 435, started 2026-10-04 01:54:46 IST
- **Script**: httpx async script in a temp folder outside the repo (`%TEMP%\ccms_live\live_checks.py`)
- **Logins**: `desk@club.test` 200, `member2@club.test` 200, `manager@club.test` 200

| check | result | status codes | key value |
|---|---|---|---|
| 1. 20 concurrent bookings, same slot | PASS | 201x1, 409x19 | court 1 @ 2026-10-05T00:30:00Z; 409 codes={'SLOT_TAKEN': 19}; booking_id=[497] |
| 1b. DB: court_slots rows for winning booking | PASS | psql exit 0 | rows by booking_id=2, rows in court/hour window=2 |
| 2. Booking at 12:15 start | PASS | 422 | start_at=2026-10-05T12:15:00+05:30; error=INVALID_SLOT |
| 3. Member 3rd booking same IST day | PASS | [201, 201, 409]; cancels [200, 200] | day 2026-10-06; 3rd error=DAILY_LIMIT_REACHED; created+cancelled ids=[517, 518] |
| 4. Two concurrent orders, stock 1 | PASS | product 201; orders [201, 409]; GET product 200 | product 170 (TMP-435-59116); 409 error=['OUT_OF_STOCK']; stock api=0, db=0 |
| 5. member2 reads another member | PASS | me 200; member 404; history 404 | own member_id=2, requested=1; error=NOT_FOUND |
| 6. desk calls POST /products | PASS | 403 | error=FORBIDDEN |

**Totals:** PASS 7, FAIL 0, BLOCKED 0

After the run the database was reset. `./reset_db.sh` could not be executed because no `bash` was available on the machine (no Git Bash; the only WSL distro was `docker-desktop`), so the same steps were run from PowerShell: stop `api`, drop and recreate `ccms`, grant `ccms_app`, start `api`, wait for `/health`.
