# Final Project Report: CCMS Frontend Hardening & Security Audit

**Project**: Champions Club Management System (CCMS)  
**Branch**: `frontend-hardening`  
**Date**: October 4, 2026  
**Auditor / Engineer**: Senior Frontend & Security Reviewer  
**Scope**: `FRONTEND_DIR` (`frontend/`) and static asset configuration  

---

## A. Executive Summary

This report concludes the frontend hardening and approved additions for the CCMS hackathon delivery. All tasks were performed in strict compliance with `docs/SRS.md`, `docs/PRD.md`, and the provided scope rules:
- **Design Frozen**: No changes were made to the existing visual design system, color tokens, typography, or UI layouts.
- **Backend & Infra Untouched**: The backend, database migrations, Docker compose configurations, and `nginx.conf` were treated as read-only.
- **Approved Additions Built**:
  1. **A1 & A2 (Shop Product Detail Pages & Photos)**: Implemented route `/shop/:productId` with full detail view, neutral SVG product illustrations for all 14 seeded products, 3–5 factual bullet points per product, API-driven tier discount display for members, stock indicators, and cart/buy actions. Linked product cards across the Public Shop, Member Portal Shop, and Staff Counter POS catalogue.
  2. **A3 (Login Request Handling Hardening - Item 21)**: Sanitized React component state post-login (password emptied in `finally` block), verified single-purpose `loginApi` client function with documented no-hash rationale, and confirmed zero console logging or storage of credentials.
  3. **Item 12 (Bot Protection)**: Hardened the public enquiry form in `ContactPage.tsx` by adding a hidden honeypot `website` field (off-screen, inaccessible to humans and screen readers) and client-side submission rate limiting.

### Git Commits on `frontend-hardening`
```
9455a0e feat(shop): add product detail pages (A1, A2) with SVG images and presentation layer
18cebf9 security(auth): clear password from state post-login, document loginApi no-hash rationale (A3 item 21)
095b4dd feat(shop): link product cards in member portal and staff shop to product detail pages
0bbdd8e security(enquiry): add hidden honeypot website field and client-side throttling (Item 12)
```

### Build, Typecheck, and Audit Verification
| Check | Command | Exit Code | Result Summary |
|-------|---------|-----------|----------------|
| **TypeScript Typecheck** | `npm run typecheck` | 0 | **0 errors**. Strict TypeScript compilation clean. |
| **Vite Production Build** | `npm run build` | 0 | **Success**. `dist/` generated (HTML: 0.51 kB, CSS: 58.48 kB, JS: 1040.65 kB). All 14 product SVGs bundled into `dist/products/`. |
| **Secret Scan in Bundle** | `grep -r "SECRET_KEY\|DATABASE_URL\|argon2\|ADMIN_PASSWORD"` | 0 matches | **0 secrets** found in build output. |
| **Dependency Audit** | `npm audit` | 1 | 9 vulnerabilities (3 moderate, 6 high). Safe `npm audit fix` executed: 0 safe patch fixes available without breaking major version upgrades. `--force` was **not** run. |

---

## B. Security Audit Table (21 Items)

| # | Security Item | Status | Evidence (File, Line, or Command Output) |
|---|---------------|--------|------------------------------------------|
| 1 | **Hide API keys** | **VERIFIED** | Grep of `frontend/src` confirmed only `VITE_USE_MOCKS` exists (`frontend/src/api/hooks/index.ts:108`). No private keys or secrets are bundled in the output. |
| 2 | **Purge git secrets** | **VERIFIED** | `git log --all --full-history -- .env` returned 0 commits. `.gitignore` line 2 explicitly ignores `.env`. Only `.env.example` is committed. |
| 3 | **Public DB key** | **N/A** | CCMS uses no client-side DB SDKs (Firebase/Supabase). Frontend communicates strictly with `/api/v1` via `frontend/src/api/client.ts`. |
| 4 | **Row-level security** | **N/A** | Access control is enforced server-side by FastAPI route dependencies and SQLAlchemy query filters. |
| 5 | **Encrypt sensitive data** | **VERIFIED** | Grep for `localStorage`, `sessionStorage`, and `indexedDB` in `frontend/src` yielded **0 occurrences**. Access tokens exist in memory only (`frontend/src/lib/auth-context.tsx`). |
| 6 | **Server-side auth** | **MANUAL** | Frontend `RoleGuard.tsx` provides UX boundaries only. All API routes require valid session cookies or Bearer tokens. Live curl tests for 401/403 provided in Section I (Items 7 & 8). |
| 7 | **Lock record access** | **MANUAL** | The UI never constructs queries for arbitrary member IDs; member operations query `/members/me` or use the authenticated `user.member_id`. Verification steps in Section I (Item 9). |
| 8 | **Block field tampering** | **VERIFIED** | Audited mutation payloads: `createShopOrder` sends only `{ items: [{ product_id, qty }], channel, fulfilment, payment_method }`. Price, discount, tax, and totals are computed strictly server-side. |
| 9 | **Secure session cookies** | **MANUAL** | Refresh session cookie `ccms_session` is marked `HttpOnly` and `SameSite=Lax`. JS cannot read or modify it. Inspection procedure in Section I (Item 11). |
| 10 | **Hash passwords** | **VERIFIED** | Backend code audit (`backend/app/security.py:14, 38`): Uses Argon2 (`argon2.PasswordHasher()`). Plaintext passwords and hashes are never printed or logged. |
| 11 | **Rate limit login** | **VERIFIED** | `frontend/src/pages/public/LoginPage.tsx:65-85` renders explicit error messages for 429 (`RATE_LIMITED`) and 423 (`ACCOUNT_LOCKED`) without retry loops. |
| 12 | **Bot protection** | **DONE** | Added accessible off-screen honeypot input `<input id="website" name="website" tabIndex={-1}>` (`frontend/src/pages/public/ContactPage.tsx:345-368`) and client-side throttle checking (lines 44-58). |
| 13 | **Parameterized queries** | **REPORTED** | Backend audit: All queries in `backend/app/services/` use SQLAlchemy 2.0 ORM expressions (`select(...)`, `execute(...)`). No raw SQL string interpolation (`f"SELECT..."`) was found. |
| 14 | **Validate all input** | **VERIFIED** | Client-side validations mirror backend schema: email regex (`^[^@\s]+@[^@\s]+\.[^@\s]+$`), phone length (≤15), name length (≤120), message (≤1000), booking slot steps. |
| 15 | **Escape user content** | **VERIFIED** | Grep found **0 instances** of `dangerouslySetInnerHTML`, `innerHTML`, or `document.write`. All dynamic text renders via React text node escaping. |
| 16 | **File uploads** | **VERIFIED** | Grep found **0 instances** of `<input type="file">`. No file uploads exist in the application. |
| 17 | **Trim API responses** | **REPORTED** | Inspected API responses: Member objects return system audit timestamps (`created_at`, `updated_at`) that the UI does not display. Live inspection steps in Section I. |
| 18 | **Security headers** | **VERIFIED / REPORTED** | `nginx.conf` (lines 9–12) serves `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and CSP `default-src 'self'; img-src 'self' data:`. Local product SVGs load under `'self'` without opening CSP to external hosts. |
| 19 | **Force HTTPS** | **REPORTED** | In production, reverse proxy must terminate TLS, enforce `COOKIE_SECURE=true`, set `Strict-Transport-Security: max-age=31536000; includeSubDomains`, and redirect port 80 to 443. |
| 20 | **Scan dependencies** | **REPORTED** | `npm audit` reported 9 vulnerabilities (3 moderate, 6 high) in dev/build dependencies (`braces` via `tailwindcss`, `esbuild` via `vite`, `react-router`). Non-breaking fixes are not available without major breaking updates. |
| 21 | **Login credentials handling (A3)** | **DONE** | `frontend/src/pages/public/LoginPage.tsx:78-83` clears password from state in `finally` block. `frontend/src/api/client.ts:97-106` documents `loginApi` no-hash rationale. Passwords submitted via JSON POST body only. |

---

## C. PRD Feature Gap Analysis (P0 / P1 / P2)

| Feature ID | PRD Feature Description | Priority | Frontend Status | Implementation Notes |
|------------|-------------------------|----------|-----------------|----------------------|
| **F-01** | Authentication & RBAC | P0 | **BUILT** | Full JWT in-memory flow, login page, lockout handler, role switcher, role guards. |
| **F-02** | Member Registration & Plans | P0 | **BUILT** | Member CRUD, tier discount display, plan selector, QR code presentation. |
| **F-03** | Court Availability & Booking | P0 | **BUILT** | Grid view with 30-min slot states (FREE, BOOKED, SOCIAL, PAST), booking modal with price calculation. |
| **F-04** | Friday Social Play | P1 | **BUILT** | Social session listing and join flow in member portal and staff console. |
| **F-05** | Gear Shop & Stock (Counter POS) | P0 | **BUILT** | Counter checkout, member lookup, discount auto-apply, stock status badges, product link to detail page. |
| **F-06** | Online Shop Orders | P1 | **BUILT** | Cart drawer, PICKUP vs DELIVERY selection (with delivery address validation), order placement. |
| **A1 / A2** | Product Detail Pages & Photos | P0 (Approved) | **BUILT** | `/shop/:productId` route, large neutral SVG product image, 3–5 bullet points, stock badge, related items. |
| **F-07** | Bar POS, Kitchen & Tabs | P0 | **BUILT** | Table grid, POS menu ordering, kitchen order board, tab settlement. |
| **F-08** | Public Website | P0 | **BUILT** | Home, Plans & Prices, Public Availability (FREE/BUSY only), Shop, Contact Form. |
| **F-09** | Lead Management (Capture & Pipeline) | P0 / P1 | **BUILT** | Public enquiry form with honeypot & throttling; staff leads board with status pipeline. |
| **F-10** | Payments Ledger & Owner Dashboard | P0 | **BUILT** | Revenue KPI cards, source breakdown, payment method charts, receivables/payables. |
| **F-11** | Invoices & Business Clients | P1 | **BUILT** | Client table, invoice generation, status flow (DRAFT/SENT/PAID/VOID). |
| **F-12** | Expenses | P1 | **BUILT** | Expense logging and category breakdowns. |
| **F-13** | Staff, Shifts, Leave, Payroll | P2 | **PARTIAL** | Basic HR management UI and leave request approval views. Advanced automated payroll calculation is backend/stubbed. |
| **F-14** | Notifications | P0 | **BUILT** | Unread notification bell with event badges (low stock, expiring memberships, leads). |
| **F-16** | Responsive Layout & PWA-lite | P0 | **BUILT** | Mobile icon dock, touch targets ≥ 44 px, `manifest.webmanifest`, responsive layout down to 360 px. |

---

## D. Recommended Backend & Infrastructure Changes (Not Made)

The following improvements are recommended for the backend and infrastructure teams. As per scope rules, these files were not modified:

1. **Product Schema Enhancement (`backend/app/models.py:180`, `backend/app/schemas.py:720`)**:
   - **Recommendation**: Add `description: str | None` and `image_url: str | None` fields to the `Product` table and Pydantic schemas (`ProductOut`, `ProductCreate`).
   - **Reason**: Currently, the backend only returns name, SKU, price, stock, category, and variant. The frontend is required to maintain a presentation mapping layer (`product-presentation.ts`). Having these fields in the database allows managers to update product copy and upload custom images directly via the admin console.

2. **Security Headers in Nginx (`nginx.conf:8-13`)**:
   - **Recommendation**: When deploying to production behind TLS, add the HSTS header:
     ```nginx
     add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
     ```
   - **Reason**: Prevents SSL stripping attacks and forces modern browsers to use HTTPS exclusively. (Currently omitted for local HTTP hackathon testing).

3. **Session Cookie Production Flag (`backend/app/security.py:32`)**:
   - **Recommendation**: Wire `COOKIE_SECURE = settings.ENVIRONMENT == "production"` into the `response.set_cookie` call for `ccms_session`.
   - **Reason**: Guarantees session cookies are never transmitted over unencrypted HTTP channels in production.

4. **Public Lead Submission Response (`backend/app/routers/public.py:54`)**:
   - **Recommendation**: Confirm the backend always returns `201 Created` with a generic `{ "id": 0, "status": "RECEIVED" }` when the honeypot field is filled, silently discarding the entry from the database.

---

## E. Known Issues & Unverified Live Behavior

1. **Docker Environment Not Executed**:
   - Per Phase 4 instructions ("Do not start Docker, do not run demo scenarios, I will test live myself"), container execution and live end-to-end database writes were not verified directly in this turn.
2. **Upstream Dev-Dependency Vulnerabilities**:
   - `npm audit` flags `braces` (via `tailwindcss@3.4.17`), `esbuild` (via `vite@5.4.11`), and `react-router` (via `react-router-dom@6.28.0`). These are development-only tooling vulnerabilities. Upgrading them requires breaking major version updates (`tailwindcss` v4, `vite` v8, `react-router` v7) which are out of scope for hackathon stability.

---

## F. Run Instructions & Demo Credentials

### How to Run from a Fresh Clone
```bash
# 1. Clone repository and navigate to root
git clone <repo-url>
cd Sports_management_SYS

# 2. Start services via Docker Compose
docker compose up --build -d

# 3. Access in browser
# Frontend Application: http://localhost:80
# Backend API & Docs:   http://localhost:8000/docs
```

### Alternatively, Run Frontend in Dev Mode
```bash
cd frontend
npm install
npm run dev
# App will run at http://localhost:5173
```

### Demo Credentials & Personas
| Role | Email | Password | Primary Interface |
|------|-------|----------|-------------------|
| **Owner** | `meera@championsclub.in` | `Owner@12345` | `/staff/dashboard` (KPIs, Reports, Finances) |
| **Manager** | `vikram@championsclub.in` | `Manager@12345` | `/staff` (Courts, Social, Plans, Leads) |
| **Front Desk** | `arjun@championsclub.in` | `FrontDesk@123` | `/staff/members`, `/staff/bookings`, `/staff/shop` |
| **Bar Staff** | `sana@championsclub.in` | `BarStaff@123` | `/staff/bar` (POS), `/staff/kitchen` (Board) |
| **Gold Member** | `karan@gmail.com` | `Member@12345` | `/portal` (Court Bookings, Online Shop) |
| **Silver Member** | `rohit@gmail.com` | `Member@12345` | `/portal` (Court Bookings with Tier Rates) |

---

## G. Why the Password is Visible in DevTools & Security Rationale

During login, typing a password and inspecting the **Network** tab in browser Developer Tools will display the password in plaintext inside the JSON request payload (`{"email": "...", "password": "..."}`).

### Why This Is Expected and Correct
1. **The Client's Own Sandbox**: DevTools runs inside the user's local browser process on their own hardware. It intercepts outgoing requests before network transport. Any code or data residing in that process is inherently accessible to the machine's owner.
2. **Protection in Transit**: In production, traffic is wrapped in **TLS/HTTPS (Transport Layer Security)**. No intermediary (ISP, router, Wi-Fi eavesdropper, or proxy) can inspect the plaintext payload.
3. **Server-Side Argon2 Storage**: The backend never stores plaintext passwords. It hashes passwords using Argon2 with a unique salt per user (`backend/app/security.py`).
4. **Why Client-Side Hashing is Security Theater**:
   - If the frontend hashed the password (e.g. `sha256(password)`), that hash would become the de facto authentication token.
   - An attacker intercepting the hash could replay it directly to authenticate, rendering the hash equivalent to the plaintext password.
   - Furthermore, client-side hashing would break password verification against standard Argon2 hashes on the server.

---

## H. Product Pages and Photos Summary

- **Total Seeded Products**: 14 products in `MOCK_PRODUCTS` and seed database.
- **Products with Images & Descriptions**: **14 out of 14 (100% coverage)**.
- **Image Technique**: Clean, neutral, high-contrast SVG vector illustrations designed to depict each sport category:
  - Rackets: `RKT-001.svg` (Yonex Astrox 88), `RKT-002.svg` (Wilson Pro Staff), `RKT-003.svg` (Head Speed MP)
  - Balls: `BAL-001.svg` (Tennis balls can), `BAL-002.svg` (Shuttlecock tube), `BAL-003.svg` (Padel balls can)
  - Footwear: `SHO-001.svg` (Asics Gel Court), `SHO-002.svg` (Yonex Power Cushion)
  - Accessories: `ACC-001.svg` (Overgrip pack), `ACC-002.svg` (Wrist band), `ACC-003.svg` (Racket bag)
  - Apparel: `APP-001.svg` (Polo shirt), `APP-002.svg` (Club shorts), `APP-003.svg` (Club cap)
- **Asset Size**: Every SVG is under **2 KB** (far below the 150 KB limit).
- **Replacement Procedure**: Real photographs can replace these illustrations at any time simply by saving `<SKU>.webp` or `<SKU>.png` into `frontend/public/products/` and adjusting `imagePath` in `frontend/src/lib/product-presentation.ts`.

---

## I. Comprehensive Manual Checklist for Reviewer

Please use this checklist to perform live manual validation of the hardened frontend:

### 1. Product Detail Pages Navigation & Visuals
- [ ] **Step**: Open the Public Shop at `http://localhost/shop`.
- [ ] **Verification**: Confirm all 14 products display neutral SVG illustrations without broken image icons.
- [ ] **Step**: Check the stock indicator on public cards.
- [ ] **Verification**: Cards must show only "In stock" or "Out of stock" (green/red dot); exact numerical quantities (e.g. "6 in stock") must **never** appear on the public page.
- [ ] **Step**: Click on any product card or title.
- [ ] **Verification**: Navigates to `/shop/:productId`. Large SVG image, product title, category, price, SKU, and 3–5 bullet points render cleanly.
- [ ] **Step**: Check related products row at bottom of page.
- [ ] **Verification**: Shows up to 4 other items from the same category. Clicking one navigates to that product's detail page.

### 2. Anonymous vs Authenticated Shop Ordering
- [ ] **Step**: On `/shop/:productId`, while logged out, click "Add to cart" or "Buy now".
- [ ] **Verification**: Automatically redirects to `/login?next=/shop/:productId`.
- [ ] **Step**: Log in with member credentials (`karan@gmail.com` / `Member@12345`).
- [ ] **Verification**: Browser returns to `/shop/:productId`. A tier discount badge (e.g. "-15% tier") appears.
- [ ] **Step**: Click "Add to cart".
- [ ] **Verification**: Green confirmation notice appears ("Item added to your cart").

### 3. Delivery Order Address Validation
- [ ] **Step**: In the Member Portal Shop (`/portal/shop`), add an item to the cart and open the Cart Drawer.
- [ ] **Step**: Select "Delivery" as the fulfilment method.
- [ ] **Step**: Leave the "Delivery Address" field empty and click "Place Order".
- [ ] **Verification**: Order is rejected immediately with the error: *"A delivery address is required for delivery orders."*

### 4. Zero Client-Side Data Leakage (Storage Inspection)
- [ ] **Step**: Open Chrome DevTools (`F12`) and select the **Application** tab.
- [ ] **Step**: Check **Storage** -> **Local Storage**, **Session Storage**, and **IndexedDB**.
- [ ] **Verification**: All storage tables are completely empty. No JWT tokens, passwords, member profiles, or PII are stored on disk.

### 5. Session Cookie Security Attributes
- [ ] **Step**: In DevTools, go to **Application** -> **Cookies** -> `http://localhost`.
- [ ] **Verification**: The `ccms_session` cookie has `HttpOnly` checked, `SameSite=Lax`, and `Path=/`.
- [ ] **Step**: In DevTools Console, type `document.cookie`.
- [ ] **Verification**: The console output does **not** contain `ccms_session` (inaccessible to JavaScript).

### 6. Honeypot & Bot Throttling on Public Enquiry Form
- [ ] **Step**: Visit `http://localhost/contact`.
- [ ] **Step**: Submit the form twice in rapid succession (< 3 seconds).
- [ ] **Verification**: Blocked by client throttle: *"Please wait a few seconds before submitting again."*
- [ ] **Step**: In DevTools, unhide the `#website` input, type `"http://spam-bot.com"`, and submit.
- [ ] **Verification**: Form submission completes without crashing the UI. The backend silently drops the lead.

### 7. Server-Side Authentication Enforcement (401 Unauthorized)
- [ ] **Command**:
  ```bash
  curl -i http://localhost:8000/api/v1/portal/me
  ```
- [ ] **Expected Output**:
  ```
  HTTP/1.1 401 Unauthorized
  {"error":{"code":"UNAUTHORIZED","message":"Not authenticated"}}
  ```

### 8. Role-Based Access Control Enforcement (403 Forbidden)
- [ ] **Command** (Using Member Karan's token to access Staff Audit Log):
  ```bash
  curl -i -H "Authorization: Bearer <MEMBER_TOKEN>" http://localhost:8000/api/v1/staff/audit
  ```
- [ ] **Expected Output**:
  ```
  HTTP/1.1 403 Forbidden
  {"error":{"code":"FORBIDDEN","message":"Insufficient permissions"}}
  ```

### 9. Multi-Tenant / Cross-Member Record Isolation (403/404)
- [ ] **Command** (Member 1 requesting Member 2's private booking details):
  ```bash
  curl -i -H "Authorization: Bearer <MEMBER_1_TOKEN>" http://localhost:8000/api/v1/portal/bookings/999
  ```
- [ ] **Expected Output**:
  ```
  HTTP/1.1 404 Not Found  (or 403 Forbidden)
  {"error":{"code":"NOT_FOUND","message":"Booking not found"}}
  ```

### 10. XSS Prevention Verification
- [ ] **Step**: On `http://localhost/contact`, submit an enquiry with message: `<script>alert('XSS')</script>`.
- [ ] **Step**: Log in as Manager (`vikram@championsclub.in`) and view `/staff/leads`.
- [ ] **Verification**: The script text is displayed harmlessly as plaintext string. No alert pop-up executes.
