# Software Requirements Specification (SRS)
# Project: Champions Club Management System (CCMS)
# Version: 1.1 (local-only, responsive web app + PWA-lite)
# Date: 2026-10-03

> **This document is the single source of truth.** If code and SRS disagree, fix the code (or amend the SRS first, then the code). AI assistants must not invent endpoints, fields, enums or libraries that are not listed here.

---

## 1. Introduction

### 1.1 Purpose
Specifies the architecture, data model, API, business logic, security and tests for CCMS.

### 1.2 Scope
One club, one branch. **One responsive web app** (public site + member portal + staff console, installable to a phone home screen as a PWA-lite) and a REST API. **Hosted locally only** via Docker Compose; no cloud services. Payments are simulated.

### 1.3 Tech Stack
| Component | Technology | Known-good minimum (pin actual in lockfile at H0) |
|-----------|------------|---------|
| Language (backend) | Python | 3.12 |
| API framework | FastAPI + Uvicorn | 0.115+ |
| ORM | SQLAlchemy **sync** | 2.0 |
| Validation | Pydantic | v2 |
| DB | PostgreSQL | 16 |
| DB driver | psycopg | 3 (`psycopg[binary]`) |
| Password hashing | argon2-cffi | 23+ |
| JWT | PyJWT | 2.8+ |
| Rate limiting | slowapi | 0.1.9+ |
| Tests | pytest + httpx (TestClient) | latest |
| Frontend | React + Vite + TypeScript | 18 / 5 / 5 |
| Styling | Tailwind CSS | **3.4** (not v4) |
| Data fetching | @tanstack/react-query | v5 |
| Routing | react-router-dom | v6 |
| Charts | recharts | 2.x |
| QR | qrcode.react | 3.x |
| Icons | lucide-react | latest |
| API types | openapi-typescript | 7.x |
| Container | Docker Compose (db, api, web) | latest |
| Web server (demo) | nginx (serves built frontend, proxies `/api`) | alpine |
| PWA | Static `manifest.webmanifest` + icons (no service worker, no `vite-plugin-pwa`) | n/a |

**Rule**: no other libraries without team agreement. No Redux, no ORM besides SQLAlchemy, no UI kit.

### 1.4 Conventions (apply everywhere)
| Topic | Rule |
|-------|------|
| Money | **Integer paise** (`BIGINT`). Never float/decimal. Frontend formats `₹{(p/100).toFixed(2)}`. |
| Time | Stored `TIMESTAMPTZ` UTC. Club timezone `Asia/Kolkata`. "Day" for limits/reports = IST calendar day. |
| IDs | Integer PKs. Public member identifier = `member_code`. |
| Enums | Python `str, Enum` classes in `app/enums.py`, stored as `VARCHAR` + CHECK. Frontend uses generated types. |
| JSON | `snake_case` keys. ISO-8601 datetimes with `Z`. |
| Errors | Uniform envelope §6. |
| Pagination | `?page=1&page_size=20` (max 100) → `{items, total, page, page_size}`. |
| Soft delete | `is_active=false` for users/products/courts/menu items. No hard deletes of financial rows. |
| Rounding | `discount = round(subtotal × pct / 100)` using integer arithmetic (`(subtotal*pct + 50)//100`). `tax = (total × rate + (100+rate)//2) // (100+rate)`. |

---

## 2. System Overview

### 2.1 Architecture
```
Browser (React SPA, 3 areas: /public, /portal, /staff)
        │  plain HTTP on local Wi-Fi/LAN. Same origin: nginx (demo) or Vite dev proxy forwards /api → API
        │  (forwards X-Forwarded-For; only the web port is published)
        ▼
FastAPI app
  ├─ routers/   (thin: parse → call service → return)
  ├─ services/  (ALL business logic, transactions)
  ├─ models.py  (SQLAlchemy)   schemas.py (Pydantic)
  ├─ security.py (hash, JWT, RBAC deps, rate limit)
  └─ audit.py
        ▼
PostgreSQL 16 (UNIQUE/CHECK constraints enforce critical invariants)
```

### 2.2 Repo Layout
```
ccms/
  docker-compose.yml  .env.example  README.md  reset_db.sh  nginx.conf
  backend/  app/{main.py,config.py,db.py,enums.py,models.py,schemas.py,security.py,audit.py,
                 routers/{auth,members,plans,courts,bookings,social,shop,bar,payments,
                          dashboard,leads,invoices,expenses,hr,public,notifications}.py,
                 services/{pricing.py,booking.py,shop.py,bar.py,payments.py,membership.py,reports.py}.py}
            seed.py  tests/  requirements.txt
  frontend/ public/{manifest.webmanifest,icon-192.png,icon-512.png}
            src/{api/,pages/{public,portal,staff}/,components/,hooks/,lib/}  package.json
```

### 2.3 Device & Delivery Model
| Item | Decision |
|------|----------|
| Deliverable | One responsive web app; no native app, no separate marketing site |
| Hosting | Local laptop, Docker Compose; no internet needed at runtime |
| Access from phones | `http://<laptop-LAN-IP>:8080` (demo build) or `:5173` (Vite dev with `--host 0.0.0.0`) on the same Wi-Fi; OS firewall must allow the port |
| Responsive breakpoints | Tailwind `sm` 640 / `lg` 1024. Public + portal designed mobile-first; staff console desktop-first with drawer sidebar < 1024 px; bar/kitchen tablet-first |
| PWA-lite | Manifest + icons + `theme-color` + viewport meta. "Add to Home Screen" creates a shortcut. No service worker / offline |
| Not supported | Camera QR scanning, push notifications, offline mode (plain-http origins block or make these brittle) |
| Optional upgrade | `mkcert` local HTTPS → enables camera scanning and full PWA install. Only if all P0 is done |

### 2.4 Frontend Routes
| Area | Routes |
|------|--------|
| Public | `/`, `/plans`, `/availability`, `/shop`, `/contact`, `/login` |
| Member portal | `/portal`, `/portal/book`, `/portal/bookings`, `/portal/shop`, `/portal/orders`, `/portal/social` |
| Staff | `/staff` (dashboard), `/staff/members`, `/staff/members/:id`, `/staff/bookings`, `/staff/courts`, `/staff/social`, `/staff/shop`, `/staff/stock`, `/staff/bar`, `/staff/kitchen`, `/staff/leads`, `/staff/invoices`, `/staff/expenses`, `/staff/hr`, `/staff/reports`, `/staff/audit` |

---

## 3. Functional Requirements

### 3.1 RBAC Matrix
`R`=read, `W`=write/create/update, `—`=none, `own`=own records only.

| Resource | OWNER | MANAGER | FRONT_DESK | BAR_STAFF | MEMBER |
|----------|-------|---------|-----------|-----------|--------|
| Users/roles | W | R | — | — | — |
| Plans, court prices | W | W | R | R | R |
| Members | W | W | W | R (name/plan/code only) | own |
| Bookings | W | W | W | — | own W |
| Social sessions | W | W | R + join for others | — | R + join self |
| Products/stock | W | W | R + sell | — | R (catalogue) |
| Shop orders | W | W | W | — | own W |
| Menu | W | W | R | R | — |
| Bar orders/tables | W | W | R | W | — |
| Payments (ledger) | R | R | W (create only) | W (create only) | own R |
| Refund | W | W | W (only inside rule BRL-07) | — | — |
| Dashboard/reports/exports | R | R | — | own-shift bar report | — |
| Leads/quotes | W | W | W | — | — |
| Invoices/clients | W | W | R | — | own R |
| Expenses | W | W | — | — | — |
| Employees/shifts/payroll | W | W (no payroll pay) | — | — | — |
| Leave | approve | approve | request own | request own | — |
| Audit log | R | — | — | — | — |

Implementation: one dependency `require_roles(*roles)`. Row-level ownership checks in services (members: `member.user_id == current_user.id`).

### 3.2 API Endpoints

Base: `/api/v1`. All endpoints require `Authorization: Bearer <access_token>` unless marked **(public)**.

#### Health
- `GET /health` **(public)** → `{"status":"healthy","version":"1.0.0"}`

#### 3.2.1 Auth
| Method | Path | Notes |
|--------|------|-------|
| POST | `/auth/login` **(public)** | rate limit 5/min/IP; lockout |
| POST | `/auth/refresh` **(public, cookie)** | rotates refresh token |
| POST | `/auth/logout` | revokes refresh token |
| GET | `/auth/me` | current user + role + member_id |
| POST | `/auth/register-member` **(public)** | P1; creates MEMBER user only if a member record with that email exists and has no user |
| POST | `/users` | OWNER; create staff user |
| PATCH | `/users/{id}` | OWNER; role/is_active (audit-logged) |

`POST /auth/login`
```json
// request
{"email":"arjun@club.test","password":"..."}
// 200  (refresh token set as HttpOnly, SameSite=Strict cookie)
{"access_token":"<jwt>","token_type":"bearer","expires_in":900,
 "user":{"id":3,"email":"arjun@club.test","full_name":"Arjun","role":"FRONT_DESK","member_id":null}}
```
Errors: 401 `INVALID_CREDENTIALS`, 423 `ACCOUNT_LOCKED`, 429 `RATE_LIMITED`.

#### 3.2.2 Plans & Pricing
| Method | Path | Role |
|--------|------|------|
| GET | `/plans` **(public)** | list active plans with entitlements |
| PATCH | `/plans/{id}` | OWNER/MANAGER (audit) |
| GET | `/court-prices` **(public)** | `[{sport,tier,price_per_hour_paise}]` |
| PUT | `/court-prices` | OWNER/MANAGER; body list upsert (audit) |

#### 3.2.3 Members
| Method | Path | Notes |
|--------|------|-------|
| POST | `/members` | creates member + first membership + payment (optional) |
| GET | `/members?q=&status=&page=` | q matches name/phone/member_code (ILIKE, parameterised) |
| GET | `/members/{id}` | profile + current plan + status + expiry |
| GET | `/members/by-code/{code}` | lookup by typed/pasted member code (QR on profile encodes the same code; hardware barcode scanners act as keyboards) |
| PATCH | `/members/{id}` | edit details |
| POST | `/members/{id}/renew` | `{plan_id, payment_method}` → new membership, payment |
| GET | `/members/{id}/history` | combined timeline: bookings, shop, bar, payments (paginated) |
| GET | `/members/expiring?days=7` | |

`POST /members`
```json
{"full_name":"Karan Shah","phone":"9876543210","email":"karan@x.com","dob":"1990-04-12",
 "emergency_contact":"9000000000","plan_id":2,"payment_method":"UPI"}
```
`201`:
```json
{"id":11,"member_code":"CC-000011","full_name":"Karan Shah",
 "membership":{"id":11,"plan_code":"SILVER","start_date":"2026-10-03","end_date":"2026-11-02","status":"ACTIVE"},
 "payment_id":57}
```
Errors: 409 `PHONE_EXISTS`, 422 `JUNIOR_AGE_INVALID`, 422 validation.

Member status: `ACTIVE` (end_date ≥ today+8), `EXPIRING` (today ≤ end_date ≤ today+7), `EXPIRED` (end_date < today), `NONE`.

#### 3.2.4 Courts & Availability
| Method | Path | Notes |
|--------|------|-------|
| GET | `/courts` | list (staff/member) |
| POST/PATCH | `/courts`, `/courts/{id}` | OWNER/MANAGER |
| GET | `/courts/availability?date=YYYY-MM-DD&sport=` | full detail for logged-in users |
| GET | `/public/availability?from=YYYY-MM-DD&days=7&sport=` **(public)** | FREE/BUSY only, `days` ≤ 7 |

`GET /courts/availability?date=2026-10-09&sport=TENNIS` → 200
```json
{"date":"2026-10-09","slot_minutes":30,"courts":[
 {"court_id":1,"name":"Tennis 1","sport":"TENNIS","slots":[
   {"start_at":"2026-10-09T00:30:00Z","state":"FREE","bookable_1h":true,"price_paise":40000},
   {"start_at":"2026-10-09T01:00:00Z","state":"BOOKED","bookable_1h":false,"price_paise":null},
   {"start_at":"2026-10-09T12:30:00Z","state":"SOCIAL","bookable_1h":false,"price_paise":null}]}]}
```
(`price_paise` is computed for the requesting user's tier; `WALKIN` tier for staff view unless `member_id` query param is given.)

#### 3.2.5 Bookings
| Method | Path | Notes |
|--------|------|-------|
| POST | `/bookings` | create |
| GET | `/bookings?date=&court_id=&member_id=&status=` | staff; members only see own |
| GET | `/bookings/{id}` | |
| POST | `/bookings/{id}/cancel` | `{reason}` |
| POST | `/bookings/{id}/status` | staff: `COMPLETED` / `NO_SHOW` |
| POST | `/bookings/{id}/pay` | staff records payment for UNPAID booking |

`POST /bookings`
```json
{"court_id":1,"start_at":"2026-10-09T12:30:00Z",
 "member_id":11,            // staff only; for MEMBER role ignored and derived from token
 "guest_name":null,"guest_phone":null,   // required if member_id is null (walk-in)
 "source":"FRONT_DESK",     // FRONT_DESK | PHONE | WEB ; WEB forced for MEMBER role
 "payment_method":"CASH"}   // CASH|CARD|UPI|ONLINE_MOCK|null (null → UNPAID/pay at desk). Ignored if price is 0
```
`201`:
```json
{"id":201,"court_id":1,"start_at":"2026-10-09T12:30:00Z","end_at":"2026-10-09T13:30:00Z",
 "status":"CONFIRMED","tier_applied":"SILVER","price_paise":40000,"payment_status":"PAID","source":"FRONT_DESK"}
```
Errors: 409 `SLOT_TAKEN`, 409 `DAILY_LIMIT_REACHED`, 422 `INVALID_SLOT` (off-grid / outside hours / past), 422 `GUEST_REQUIRED`, 404 `COURT_NOT_FOUND`, 403.

`POST /bookings/{id}/cancel` → 200
```json
{"id":201,"status":"CANCELLED","refunded":true,"refund_paise":40000}
```
Errors: 409 `ALREADY_CANCELLED`, 409 `BOOKING_STARTED`, 403 (member cancelling another's).

#### 3.2.6 Social Play (P1)
| Method | Path | Notes |
|--------|------|-------|
| POST | `/social-sessions` | MANAGER: `{court_id,title,start_at,end_at,capacity,fee_paise}`; 409 `SLOTS_NOT_FREE` w/ conflicts |
| GET | `/social-sessions?from=&to=` | with `joined_count`, `capacity` |
| POST | `/social-sessions/{id}/join` | member self; staff may pass `member_id` or guest |
| POST | `/social-sessions/{id}/leave` | |
| DELETE | `/social-sessions/{id}` | MANAGER; frees slots; refunds participants |

Errors: 409 `SESSION_FULL`, 409 `ALREADY_JOINED`.

#### 3.2.7 Shop
| Method | Path | Notes |
|--------|------|-------|
| GET | `/public/products?category=` **(public)** | name, price, in_stock bool (not exact qty) |
| GET/POST/PATCH | `/products`, `/products/{id}` | staff; MANAGER/OWNER write |
| POST | `/products/{id}/restock` | `{qty, note}` MANAGER |
| GET | `/products/low-stock` | stock ≤ reorder_level |
| POST | `/shop/orders` | counter or online |
| GET | `/shop/orders?status=&member_id=` | members: own |
| POST | `/shop/orders/{id}/status` | staff |
| POST | `/shop/orders/{id}/cancel` | restores stock; refunds if paid |
| POST | `/shop/orders/{id}/pay` | for pay-at-pickup |

`POST /shop/orders`
```json
{"member_id":11,"guest_name":null,"channel":"COUNTER","fulfilment":"INSTORE",
 "delivery_address":null,
 "items":[{"product_id":4,"qty":1},{"product_id":9,"qty":2}],
 "payment_method":"CARD"}
```
`201`:
```json
{"id":88,"status":"COMPLETED","subtotal_paise":650000,"discount_paise":32500,"total_paise":617500,
 "tax_paise":94195,"payment_status":"PAID",
 "items":[{"product_id":4,"name":"Yonex Astrox","qty":1,"unit_price_paise":450000,"line_total_paise":450000}]}
```
Rules: `channel=ONLINE` → role must be MEMBER, `fulfilment` ∈ PICKUP/DELIVERY, status starts `PLACED`; `COUNTER` + paid → `COMPLETED`. Errors: 409 `OUT_OF_STOCK` `{product_id, available}`, 422 `ADDRESS_REQUIRED`, 422 `EMPTY_CART`.

#### 3.2.8 Bar
| Method | Path | Notes |
|--------|------|-------|
| GET/POST/PATCH | `/menu-items`, `/menu-items/{id}` | MANAGER write |
| GET | `/bar/tables` | each table + open order total or null |
| POST/PATCH | `/bar/tables`, `/bar/tables/{id}` | MANAGER |
| POST | `/bar/orders` | `{table_id?, member_id?, guest_name?, items:[{menu_item_id,qty,note}]}` → kitchen_status `NEW` |
| POST | `/bar/orders/{id}/items` | add items (only if kitchen_status ≠ SERVED & unpaid) |
| GET | `/bar/orders?kitchen_status=&payment_status=&table_id=` | |
| POST | `/bar/orders/{id}/kitchen-status` | `{status}` NEW→PREPARING→READY→SERVED (forward only) |
| POST | `/bar/orders/{id}/pay` | `{method: CASH\|CARD\|UPI}` |
| POST | `/bar/orders/{id}/tab` | member required; marks `is_tab=true` (stays UNPAID) |
| POST | `/bar/tabs/settle` | `{member_id, order_ids:[...], method}` → one payment per order, atomic |
| GET | `/bar/reports/daily?date=` | OWNER/MANAGER; BAR_STAFF own only |

`GET /bar/reports/daily?date=2026-10-09` → 200
```json
{"date":"2026-10-09","orders":42,"revenue_paise":812000,"tax_paise":38666,
 "by_method":{"CASH":300000,"CARD":200000,"UPI":312000},
 "by_staff":[{"user_id":5,"name":"Sana","revenue_paise":812000}],
 "outstanding_tabs_paise":45000}
```
Errors: 409 `ORDER_ALREADY_PAID`, 409 `INVALID_TRANSITION`, 422 `MEMBER_REQUIRED_FOR_TAB`.

#### 3.2.9 Payments & Finance
| Method | Path | Notes |
|--------|------|-------|
| GET | `/payments?from=&to=&source_type=&method=` | OWNER/MANAGER |
| GET | `/payments/mine` | MEMBER |
| POST | `/payments/{id}/refund` | OWNER/MANAGER (audit) |
| GET | `/dashboard/summary?period=today\|week\|month` | OWNER/MANAGER |
| GET | `/dashboard/revenue-series?period=` | per-day totals by source |
| GET | `/reports/payments.csv?from=&to=` | OWNER/MANAGER (audit) |
| GET | `/reports/tax-summary?month=YYYY-MM` | P2 |

`GET /dashboard/summary?period=today` → 200
```json
{"period":"today","from":"2026-10-08T18:30:00Z","to":"2026-10-09T18:30:00Z",
 "revenue":{"total_paise":2450000,
   "by_source":{"BOOKING":600000,"SOCIAL":0,"SHOP_ORDER":900000,"BAR_ORDER":812000,"MEMBERSHIP":138000,"INVOICE":0},
   "by_method":{"CASH":900000,"CARD":700000,"UPI":600000,"ONLINE_MOCK":250000}},
 "receivables":{"unpaid_tabs_paise":45000,"unpaid_invoices_paise":0},
 "payables":{"unpaid_expenses_paise":120000,"pending_payroll_paise":0},
 "bookings":{"count":28,"utilization_pct":46.7},
 "members":{"new":3,"expiring_7d":5},
 "leads":{"new":2},
 "low_stock":[{"product_id":4,"name":"Yonex Astrox","stock_qty":2,"reorder_level":3}]}
```

#### 3.2.10 Leads (public form P0; rest P1)
| Method | Path | Notes |
|--------|------|-------|
| POST | `/public/enquiries` **(public)** | rate limit 30/min/IP; honeypot field `website` must be empty |
| GET | `/leads?status=` | STAFF (OWNER/MANAGER/FRONT_DESK) |
| PATCH | `/leads/{id}` | status, assignee |
| POST | `/leads/{id}/notes` | |
| POST | `/leads/{id}/quotes` | `{amount_paise, description, valid_until}` |
| POST | `/leads/{id}/convert` | returns `{member_prefill:{...}}`; marks WON after member created (`POST /members` with `lead_id`) |

`POST /public/enquiries`
```json
{"name":"Isha Rao","email":"isha@x.com","phone":"9811111111","interest":"TRIAL",
 "preferred_plan_id":2,"message":"Saturday morning?","website":""}
```
`201`: `{"id":14,"status":"received"}` (never echo internal data).

#### 3.2.11 Invoices, Clients, Expenses (P1) · HR (P2) · Notifications · Audit
Standard CRUD, `OWNER/MANAGER` write unless the matrix says otherwise:
`/clients`, `/invoices` (+ `POST /invoices/{id}/mark-paid` `{method}` → payment row; `GET /invoices/{id}/print`), `/expenses` (+ `POST /expenses/{id}/mark-paid`), `/employees`, `/shifts?week=`, `/leave-requests` (+ `POST /leave-requests/{id}/decide` `{decision}`), `/payroll?month=` (+ `POST /payroll/run {month}`, `POST /payroll/{id}/mark-paid`), `GET /notifications` (own role/user), `POST /notifications/{id}/read`, `GET /audit-logs?page=` (OWNER).

---

## 4. Business Logic Specifications

### 4.1 Pricing (`services/pricing.py`)
```
tier_for(member, at):                         # at = booking start or order time
    m = membership where member_id and status ACTIVE and start_date <= local(at).date <= end_date
    return m.plan.code if m else "WALKIN"
court_price(sport, tier) = court_prices[sport][tier].price_per_hour_paise   # booking = 1h
if price == 0 → payment_status = WAIVED, no payments row
discount_pct(member, kind in {SHOP,BAR}) = plan.shop_discount_pct / bar_discount_pct if active else 0
```

### 4.2 Booking transaction (`services/booking.py`) — the critical algorithm
```
validate(start_at): minute in {0,30}, second==0; local time in [06:00, 21:00]; start_at > now; within advance_booking_days (default 14)
BEGIN
  if member_id: SELECT id FROM members WHERE id=:id FOR UPDATE      # serialises the daily-limit check per member
     count = COUNT(bookings WHERE member_id AND status IN (CONFIRMED,COMPLETED) AND local_date(start_at)=:d)
     if count >= plan.max_bookings_per_day (default 2; WALKIN-tier members use 2): raise 409 DAILY_LIMIT_REACHED
  tier = tier_for(...); price = court_price(...)
  INSERT bookings(...) RETURNING id
  INSERT court_slots(court_id, slot_start, booking_id) VALUES (start), (start+30min)
     → IntegrityError on UNIQUE(court_id, slot_start) → ROLLBACK → raise 409 SLOT_TAKEN
  if price>0 and payment_method: INSERT payments(source_type=BOOKING,...)  and set payment_status=PAID
COMMIT
```
Note: A 1-hour booking at 12:30 holds slots 12:30 and 13:00. A booking at 13:00 would collide on 13:00. This is exactly how overlap is prevented without any date-range logic.

### 4.3 Cancellation
```
if status != CONFIRMED → 409
if now >= start_at → 409 BOOKING_STARTED
DELETE FROM court_slots WHERE booking_id = :id
status = CANCELLED; cancelled_at = now
if payment_status == PAID and (start_at - now) >= 2h → mark payment REFUNDED; booking.payment_status = REFUNDED
else (late) → no refund (staff OWNER/MANAGER may override with refund=true)
```

### 4.4 Social sessions
Creating a session inserts one `court_slots` row per 30-min slot in the window with `social_session_id`; any collision → 409 `SLOTS_NOT_FREE`. Join: `SELECT ... FROM social_sessions WHERE id=:id FOR UPDATE`, count JOINED participants, reject at capacity, insert participant, create payment if fee > 0 and not Gold.

### 4.5 Stock (`services/shop.py`)
```
for item in items (sorted by product_id to avoid deadlocks):
    UPDATE products SET stock_qty = stock_qty - :q WHERE id=:id AND is_active AND stock_qty >= :q
    if rowcount == 0 → ROLLBACK, 409 OUT_OF_STOCK
    INSERT stock_movements(delta=-q, reason=SALE, ref_type=SHOP_ORDER, ref_id)
after commit: if stock_qty <= reorder_level → create notification LOW_STOCK (once per crossing)
cancel: UPDATE stock_qty += q ; movement reason=CANCEL
```

### 4.6 Totals (shop, bar)
```
subtotal = Σ qty × unit_price_snapshot
discount = (subtotal × pct + 50) // 100
total    = subtotal − discount
tax      = (total × rate + (100+rate)//2) // (100+rate)      # tax-inclusive
```
Rates from `config.py`: `TAX_COURT=18, TAX_SHOP=18, TAX_BAR=5, TAX_MEMBERSHIP=18` (placeholders).

### 4.7 Payments service
Single function `record_payment(source_type, source_id, amount, method, member_id, user_id)` is the **only** place that inserts into `payments`. It computes `tax_paise` by source. Refund = set status `REFUNDED` (+ audit row).

### 4.8 Dashboard queries
All periods computed in IST then converted to UTC bounds. `revenue = SUM(amount_paise) FROM payments WHERE status='COMPLETED' AND created_at ∈ [from,to)` grouped by `source_type` and `method`. Utilisation = booked 30-min slots ÷ (courts × slots per day × days). Receivables/payables per BRL-13.

### 4.9 Notifications
`notify(role|user_id, type, title, body, link)`. Types: `NEW_LEAD`, `LOW_STOCK`, `MEMBERSHIP_EXPIRING`, `ONLINE_ORDER`, `LEAVE_REQUEST`. Expiry notifications generated lazily when the dashboard or members page is loaded (idempotent per member per expiry date).

---

## 5. Non-Functional Requirements

### 5.1 Performance
- **NFR-001**: Non-report endpoints p95 < 300 ms on seeded data (≈ 200 members, 2k bookings).
- **NFR-002**: Availability endpoint < 500 ms (single query with joins, no N+1).
- **NFR-003**: Handle 50 concurrent users on a laptop.
- Indexes per §7 DDL.

### 5.2 Reliability
- **NFR-004**: No raw 500 stack traces; global exception handler returns envelope.
- **NFR-005**: Critical writes are transactional (all-or-nothing).
- **NFR-006**: `reset_db.sh` restores demo data in < 30 s.

### 5.3 Usability
- **NFR-007**: Staff screens usable on 1280×720 and tablet (≥ 768 px); public site and member portal responsive down to 360 px with no horizontal scroll; touch targets ≥ 44 px.
- **NFR-011**: Frontend ships a valid web manifest (name, icons 192/512, `display: standalone`, theme colour) so phones can add it to the home screen.
- **NFR-012**: App must work with no internet access (no CDN fonts/scripts/maps; all assets bundled).
- **NFR-008**: Loading, empty and error states on every list/form.

### 5.4 Maintainability
- **NFR-009**: Business logic only in `services/`. Routers contain no queries.
- **NFR-010**: `GET /openapi.json` always current; frontend types regenerated by `npm run gen:api`.

---

## 6. Error Handling Standard

Envelope for every error:
```json
{"error":{"code":"SLOT_TAKEN","message":"That slot was just booked. Please pick another.","details":{}}}
```
| HTTP | When |
|------|------|
| 200/201 | Success / created |
| 400 | Malformed request not caught by Pydantic |
| 401 | Missing/invalid/expired token (`TOKEN_EXPIRED`) |
| 403 | Role not allowed / not owner of resource |
| 404 | Not found (also used to hide others' resources from members) |
| 409 | Conflict: `SLOT_TAKEN`, `DAILY_LIMIT_REACHED`, `OUT_OF_STOCK`, `SESSION_FULL`, `PHONE_EXISTS`, `INVALID_TRANSITION`, … |
| 422 | Validation (Pydantic) or business-validation (`INVALID_SLOT`, `JUNIOR_AGE_INVALID`) |
| 423 | Account locked |
| 429 | Rate limited |
| 500 | Unexpected (generic message, details only in server log) |
| 503 | DB unavailable |

---

## 7. Security Requirements & Checklist

| # | Control | Implementation | Done |
|---|---------|----------------|------|
| S-01 | Password hashing | argon2-cffi; min 10 chars, upper/lower/digit | ☐ |
| S-02 | Auth tokens | Access JWT 15 min (HS256, secret from env, ≥ 32 bytes); refresh token random 256-bit, stored **hashed**, 7 days, rotated on use, HttpOnly + SameSite=Strict cookie; `Secure` flag controlled by `COOKIE_SECURE` (**false locally** on plain http, **true** behind HTTPS) | ☐ |
| S-03 | RBAC on every route | `require_roles()` dependency; test that each role hits 403 where expected | ☐ |
| S-04 | Object-level authz (IDOR) | Members limited to own member_id in services; 404 for others | ☐ |
| S-05 | Login brute-force protection | 5 failures → 15 min lock; slowapi 5/min/IP | ☐ |
| S-06 | Rate limiting | Public endpoints 30/min/IP; global 200/min/IP | ☐ |
| S-07 | Input validation | Pydantic v2 with length/regex/enum limits on every body; `extra="forbid"` | ☐ |
| S-08 | SQL injection | SQLAlchemy parameterised only; **no f-string SQL** | ☐ |
| S-09 | XSS | React escaping; never `dangerouslySetInnerHTML`; strip control chars on free text; CSP header | ☐ |
| S-10 | Security headers | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Content-Security-Policy` (self) set by nginx and/or API middleware. **No HSTS locally** (plain http); add only if HTTPS is ever used | ☐ |
| S-11 | CORS | Same-origin proxy means browsers rarely make cross-origin calls. Still keep an explicit allow-list from env (`ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8080,http://<LAN-IP>:8080`); no `*` with credentials | ☐ |
| S-12 | CSRF | Bearer header for API; refresh cookie SameSite=Strict + only `/auth/refresh` reads it | ☐ |
| S-13 | Secrets | `.env` git-ignored; `.env.example` committed; no secrets in code/logs | ☐ |
| S-14 | Audit log | Refunds, price/plan changes, role changes, exports, payroll, deletes → `audit_logs` (actor, action, entity, before/after, ip) | ☐ |
| S-15 | PII minimisation | Public endpoints never return names/phones; logs mask phone/email | ☐ |
| S-16 | Payment data | No card numbers stored/accepted anywhere (simulated) | ☐ |
| S-17 | Spam/abuse on public form | Honeypot + rate limit + max lengths | ☐ |
| S-18 | Error hygiene | Generic 500 message; no stack traces to client | ☐ |
| S-19 | Dependency hygiene | Lockfiles committed; run `pip-audit` / `npm audit` once at H21 and note results in README | ☐ |
| S-20 | DB least privilege | App uses non-superuser DB role; DB port not exposed in compose | ☐ |
| S-21 | Data integrity | CHECK constraints (stock ≥ 0, amounts ≥ 0), UNIQUE slots | ☐ |
| S-22 | Local network exposure | Publish **only** the web port to the LAN. `db` and `api` stay on the internal Docker network (no `ports:` mapping in the demo profile). Demo passwords changed via `.env`; OS firewall limited to the demo port. Use a trusted Wi-Fi/hotspot for demo | ☐ |
| S-23 | Client IP integrity | Proxy sets `X-Forwarded-For`; uvicorn started with `--proxy-headers`; rate limiter and lockout key on the real client IP (otherwise every user shares one limit) | ☐ |

---

## 8. Edge Cases

### Booking
- Two users click the same slot simultaneously → 1 success, others 409 `SLOT_TAKEN`; UI refreshes grid.
- Adjacent bookings (12:30 and 13:30) → allowed. (12:30 and 13:00) → 409 on the 13:00 slot.
- Booking at 21:30 or 05:30 → 422 `INVALID_SLOT`. Start in the past → 422.
- DST not applicable (IST); still convert via `zoneinfo`, never hard-code +5:30 in logic.
- Member with expired plan books → booked at WALKIN price; UI banner "Membership expired. Renew for member rates."
- Member plan changed after booking → booking price unchanged (snapshot).
- Cancel after start → 409. Cancel twice → 409 `ALREADY_CANCELLED`.
- Third booking in a day where one earlier booking was cancelled → allowed (cancelled not counted).
- Walk-in without name/phone → 422 `GUEST_REQUIRED`.
- Court deactivated with future bookings → block with 409 listing the bookings.
- Social session overlaps an existing booking → 409; booking inside a social window → 409 (`SLOT_TAKEN`, state SOCIAL).

### Shop
- Two orders for the last unit → one 409 `OUT_OF_STOCK`.
- Cancel an online order twice → second is 409; stock restored once only.
- Price change after order → past orders unaffected (unit price snapshot).
- Delivery order without address → 422.
- Discount rounding produces 0.5 paise → rounded up per formula; test.

### Bar
- Add item to a paid order → 409 `ORDER_ALREADY_PAID`.
- Kitchen status backwards (READY→NEW) → 409 `INVALID_TRANSITION`.
- Tab for a guest (no member) → 422 `MEMBER_REQUIRED_FOR_TAB`.
- Settle tab with an order belonging to another member → 404.
- Two staff pay the same order → second gets 409; exactly one payment row (row lock).
- Table closed while items still PREPARING → allowed only after pay; kitchen continues until SERVED.

### Members / Auth
- Duplicate phone → 409. Junior ≥ 18 → 422. Junior turns 18 later → dashboard flag (P2).
- Expired access token → 401 `TOKEN_EXPIRED` → frontend refreshes once, then retries; refresh failure → login page.
- Locked account → 423 even with correct password until lock expires.
- Member tries `/members/12` where 12 ≠ own → 404.

### Finance
- Refunded payment excluded from revenue; refund twice → 409.
- Free (Gold, ₹0) bookings never create payment rows, so dashboard "bookings count" uses `bookings`, revenue uses `payments`.
- Period boundaries: week = Monday 00:00 IST → next Monday; month = 1st 00:00 IST.

### Database
- Connection failure → 503. Unique violation → mapped to 409. Deadlock → retry once (shop stock sorted by product_id to prevent).

---

## 9. Test Plan (minimum 10 automated tests; these are the ones that matter)

| # | Test | Expected |
|---|------|----------|
| T-01 | 50 parallel `POST /bookings` same court+start | exactly 1×201, 49×409 `SLOT_TAKEN` |
| T-02 | Booking 12:30 then 13:00 same court | second 409 |
| T-03 | Member creates 3 bookings same day | 3rd → 409 `DAILY_LIMIT_REACHED`; cancel one → allowed again |
| T-04 | Price by tier (Gold 0, Silver 40000, Junior 25000, Walk-in 60000) | matches seed |
| T-05 | Stock 1, two parallel orders | one 201, one 409; stock = 0 never negative |
| T-06 | Discount/tax rounding (table of cases) | integer results match formula |
| T-07 | RBAC: MEMBER calls staff endpoints; BAR_STAFF calls `/dashboard/summary` | 403 |
| T-08 | IDOR: member A GET member B booking/profile | 404 |
| T-09 | Login lockout after 5 bad attempts | 423 |
| T-10 | Dashboard total == SUM(payments COMPLETED) in period; refunded excluded | equal |
| T-11 | Social session capacity (cap 2, 3 joins) | 3rd 409 |
| T-12 | Tab settle atomic (one bad order id) | nothing paid |

Frontend: manual smoke list = the 7 demo scenarios (PRD §5). No frontend unit tests.

---

## 10. Database Schema (PostgreSQL 16)

Created with `Base.metadata.create_all()`; DDL below is the intent. All money columns `BIGINT NOT NULL CHECK (>= 0)` unless noted. All tables have `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.

```sql
-- Identity
CREATE TABLE users (
  id SERIAL PRIMARY KEY, email VARCHAR(255) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('OWNER','MANAGER','FRONT_DESK','BAR_STAFF','MEMBER')),
  is_active BOOLEAN NOT NULL DEFAULT true, failed_attempts INT NOT NULL DEFAULT 0, locked_until TIMESTAMPTZ);
CREATE TABLE refresh_tokens (
  id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id), token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ);

-- Membership
CREATE TABLE plans (
  id SERIAL PRIMARY KEY, code VARCHAR(10) NOT NULL UNIQUE CHECK (code IN ('GOLD','SILVER','JUNIOR')),
  name VARCHAR(50) NOT NULL, fee_paise BIGINT NOT NULL, duration_days INT NOT NULL DEFAULT 30,
  shop_discount_pct INT NOT NULL CHECK (shop_discount_pct BETWEEN 0 AND 100),
  bar_discount_pct INT NOT NULL CHECK (bar_discount_pct BETWEEN 0 AND 100),
  max_bookings_per_day INT NOT NULL DEFAULT 2, advance_booking_days INT NOT NULL DEFAULT 14, is_active BOOLEAN NOT NULL DEFAULT true);
CREATE TABLE members (
  id SERIAL PRIMARY KEY, member_code VARCHAR(12) NOT NULL UNIQUE, user_id INT UNIQUE REFERENCES users(id),
  full_name VARCHAR(120) NOT NULL, phone VARCHAR(15) NOT NULL UNIQUE, email VARCHAR(255),
  dob DATE, emergency_contact VARCHAR(60), notes TEXT, lead_id INT);
CREATE INDEX ix_members_name ON members (lower(full_name));
CREATE TABLE memberships (
  id SERIAL PRIMARY KEY, member_id INT NOT NULL REFERENCES members(id), plan_id INT NOT NULL REFERENCES plans(id),
  start_date DATE NOT NULL, end_date DATE NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CANCELLED')),  -- EXPIRED is derived from end_date
  created_by INT REFERENCES users(id), CHECK (end_date >= start_date));
CREATE INDEX ix_memberships_member ON memberships(member_id, end_date DESC);

-- Courts & bookings
CREATE TABLE courts (id SERIAL PRIMARY KEY, name VARCHAR(50) NOT NULL UNIQUE,
  sport VARCHAR(20) NOT NULL CHECK (sport IN ('TENNIS','PADEL','BADMINTON','CRICKET_NET')), is_active BOOLEAN NOT NULL DEFAULT true);
CREATE TABLE court_prices (id SERIAL PRIMARY KEY, sport VARCHAR(20) NOT NULL,
  tier VARCHAR(10) NOT NULL CHECK (tier IN ('GOLD','SILVER','JUNIOR','WALKIN')),
  price_per_hour_paise BIGINT NOT NULL CHECK (price_per_hour_paise >= 0), UNIQUE (sport, tier));
CREATE TABLE bookings (
  id SERIAL PRIMARY KEY, court_id INT NOT NULL REFERENCES courts(id), member_id INT REFERENCES members(id),
  guest_name VARCHAR(120), guest_phone VARCHAR(15),
  start_at TIMESTAMPTZ NOT NULL, end_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED','CANCELLED','COMPLETED','NO_SHOW')),
  tier_applied VARCHAR(10) NOT NULL, price_paise BIGINT NOT NULL CHECK (price_paise >= 0),
  payment_status VARCHAR(10) NOT NULL CHECK (payment_status IN ('PAID','UNPAID','WAIVED','REFUNDED')),
  source VARCHAR(12) NOT NULL CHECK (source IN ('WEB','FRONT_DESK','PHONE')),
  created_by INT REFERENCES users(id), cancelled_at TIMESTAMPTZ, cancel_reason VARCHAR(200),
  CHECK (member_id IS NOT NULL OR guest_name IS NOT NULL));
CREATE INDEX ix_bookings_member_day ON bookings(member_id, start_at);
CREATE INDEX ix_bookings_start ON bookings(start_at);
CREATE TABLE social_sessions (
  id SERIAL PRIMARY KEY, court_id INT NOT NULL REFERENCES courts(id), title VARCHAR(100) NOT NULL,
  start_at TIMESTAMPTZ NOT NULL, end_at TIMESTAMPTZ NOT NULL, capacity INT NOT NULL CHECK (capacity > 0),
  fee_paise BIGINT NOT NULL DEFAULT 0, status VARCHAR(10) NOT NULL DEFAULT 'OPEN', created_by INT REFERENCES users(id));
CREATE TABLE social_participants (
  id SERIAL PRIMARY KEY, session_id INT NOT NULL REFERENCES social_sessions(id), member_id INT REFERENCES members(id),
  guest_name VARCHAR(120), fee_paise BIGINT NOT NULL DEFAULT 0, status VARCHAR(10) NOT NULL DEFAULT 'JOINED');
CREATE UNIQUE INDEX ux_social_member ON social_participants(session_id, member_id) WHERE member_id IS NOT NULL AND status='JOINED';
-- *** the double-booking guard ***
CREATE TABLE court_slots (
  id SERIAL PRIMARY KEY, court_id INT NOT NULL REFERENCES courts(id), slot_start TIMESTAMPTZ NOT NULL,
  booking_id INT REFERENCES bookings(id) ON DELETE CASCADE, social_session_id INT REFERENCES social_sessions(id) ON DELETE CASCADE,
  UNIQUE (court_id, slot_start),
  CHECK ((booking_id IS NOT NULL)::int + (social_session_id IS NOT NULL)::int = 1));

-- Shop
CREATE TABLE products (
  id SERIAL PRIMARY KEY, sku VARCHAR(30) NOT NULL UNIQUE, name VARCHAR(120) NOT NULL,
  category VARCHAR(12) NOT NULL CHECK (category IN ('RACKET','BALL','SHOE','ACCESSORY','APPAREL')),
  variant VARCHAR(40), description TEXT, price_paise BIGINT NOT NULL CHECK (price_paise >= 0),
  stock_qty INT NOT NULL CHECK (stock_qty >= 0), reorder_level INT NOT NULL DEFAULT 3, is_active BOOLEAN NOT NULL DEFAULT true);
CREATE TABLE shop_orders (
  id SERIAL PRIMARY KEY, member_id INT REFERENCES members(id), guest_name VARCHAR(120),
  channel VARCHAR(8) NOT NULL CHECK (channel IN ('COUNTER','ONLINE')),
  fulfilment VARCHAR(10) NOT NULL CHECK (fulfilment IN ('INSTORE','PICKUP','DELIVERY')), delivery_address VARCHAR(300),
  status VARCHAR(18) NOT NULL CHECK (status IN ('PLACED','READY','OUT_FOR_DELIVERY','COMPLETED','CANCELLED')),
  subtotal_paise BIGINT NOT NULL, discount_paise BIGINT NOT NULL, total_paise BIGINT NOT NULL, tax_paise BIGINT NOT NULL,
  payment_status VARCHAR(10) NOT NULL CHECK (payment_status IN ('PAID','UNPAID','REFUNDED')), created_by INT REFERENCES users(id));
CREATE TABLE shop_order_items (
  id SERIAL PRIMARY KEY, order_id INT NOT NULL REFERENCES shop_orders(id), product_id INT NOT NULL REFERENCES products(id),
  qty INT NOT NULL CHECK (qty > 0), unit_price_paise BIGINT NOT NULL, line_total_paise BIGINT NOT NULL);
CREATE TABLE stock_movements (
  id SERIAL PRIMARY KEY, product_id INT NOT NULL REFERENCES products(id), delta INT NOT NULL,
  reason VARCHAR(10) NOT NULL CHECK (reason IN ('SALE','RESTOCK','CANCEL','ADJUST')),
  ref_type VARCHAR(20), ref_id INT, note VARCHAR(200), created_by INT REFERENCES users(id));

-- Bar
CREATE TABLE menu_items (id SERIAL PRIMARY KEY, name VARCHAR(80) NOT NULL, category VARCHAR(10) NOT NULL CHECK (category IN ('FOOD','DRINK','SNACK')),
  price_paise BIGINT NOT NULL, is_available BOOLEAN NOT NULL DEFAULT true);
CREATE TABLE bar_tables (id SERIAL PRIMARY KEY, label VARCHAR(20) NOT NULL UNIQUE, seats INT NOT NULL DEFAULT 4);
CREATE TABLE bar_orders (
  id SERIAL PRIMARY KEY, table_id INT REFERENCES bar_tables(id), member_id INT REFERENCES members(id), guest_name VARCHAR(120),
  kitchen_status VARCHAR(10) NOT NULL DEFAULT 'NEW' CHECK (kitchen_status IN ('NEW','PREPARING','READY','SERVED','CANCELLED')),
  payment_status VARCHAR(10) NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID','PAID')),
  is_tab BOOLEAN NOT NULL DEFAULT false,
  subtotal_paise BIGINT NOT NULL DEFAULT 0, discount_paise BIGINT NOT NULL DEFAULT 0, total_paise BIGINT NOT NULL DEFAULT 0, tax_paise BIGINT NOT NULL DEFAULT 0,
  created_by INT REFERENCES users(id), paid_at TIMESTAMPTZ);
CREATE INDEX ix_bar_orders_open ON bar_orders(payment_status, kitchen_status);
CREATE TABLE bar_order_items (id SERIAL PRIMARY KEY, order_id INT NOT NULL REFERENCES bar_orders(id), menu_item_id INT NOT NULL REFERENCES menu_items(id),
  qty INT NOT NULL CHECK (qty > 0), unit_price_paise BIGINT NOT NULL, line_total_paise BIGINT NOT NULL, note VARCHAR(100));

-- Ledger (single source of revenue truth)
CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  source_type VARCHAR(12) NOT NULL CHECK (source_type IN ('BOOKING','SOCIAL','SHOP_ORDER','BAR_ORDER','MEMBERSHIP','INVOICE')),
  source_id INT NOT NULL, member_id INT REFERENCES members(id),
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0), tax_paise BIGINT NOT NULL DEFAULT 0,
  method VARCHAR(12) NOT NULL CHECK (method IN ('CASH','CARD','UPI','ONLINE_MOCK')),
  status VARCHAR(10) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED','REFUNDED')),
  reference VARCHAR(60), received_by INT REFERENCES users(id));
CREATE INDEX ix_payments_created ON payments(created_at);
CREATE INDEX ix_payments_source ON payments(source_type, source_id);

-- Leads
CREATE TABLE leads (id SERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL, email VARCHAR(255), phone VARCHAR(15),
  interest VARCHAR(12) NOT NULL CHECK (interest IN ('TRIAL','MEMBERSHIP','CORPORATE','OTHER')),
  preferred_plan_id INT REFERENCES plans(id), message VARCHAR(1000),
  status VARCHAR(10) NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','CONTACTED','QUOTED','WON','LOST')), assigned_to INT REFERENCES users(id));
CREATE TABLE lead_notes (id SERIAL PRIMARY KEY, lead_id INT NOT NULL REFERENCES leads(id), author_id INT REFERENCES users(id), body VARCHAR(1000) NOT NULL);
CREATE TABLE quotes (id SERIAL PRIMARY KEY, lead_id INT NOT NULL REFERENCES leads(id), amount_paise BIGINT NOT NULL,
  description VARCHAR(500), valid_until DATE, status VARCHAR(10) NOT NULL DEFAULT 'SENT');

-- Billing / finance (P1)
CREATE TABLE clients (id SERIAL PRIMARY KEY, company_name VARCHAR(150) NOT NULL, contact_name VARCHAR(120), email VARCHAR(255), phone VARCHAR(15), gstin VARCHAR(20));
CREATE TABLE invoices (id SERIAL PRIMARY KEY, number VARCHAR(20) NOT NULL UNIQUE, kind VARCHAR(10) NOT NULL CHECK (kind IN ('MEMBERSHIP','CORPORATE')),
  member_id INT REFERENCES members(id), client_id INT REFERENCES clients(id),
  status VARCHAR(8) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SENT','PAID','VOID')),
  issue_date DATE NOT NULL, due_date DATE NOT NULL, subtotal_paise BIGINT NOT NULL, tax_paise BIGINT NOT NULL, total_paise BIGINT NOT NULL, notes VARCHAR(500));
CREATE TABLE invoice_lines (id SERIAL PRIMARY KEY, invoice_id INT NOT NULL REFERENCES invoices(id), description VARCHAR(200) NOT NULL,
  qty INT NOT NULL, unit_price_paise BIGINT NOT NULL, line_total_paise BIGINT NOT NULL);
CREATE TABLE expenses (id SERIAL PRIMARY KEY, category VARCHAR(30) NOT NULL, vendor VARCHAR(120), description VARCHAR(200),
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0), status VARCHAR(8) NOT NULL DEFAULT 'UNPAID' CHECK (status IN ('PAID','UNPAID')),
  due_date DATE, paid_at TIMESTAMPTZ, created_by INT REFERENCES users(id));

-- HR (P2)
CREATE TABLE employees (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id), full_name VARCHAR(120) NOT NULL, title VARCHAR(60),
  monthly_salary_paise BIGINT NOT NULL, is_active BOOLEAN NOT NULL DEFAULT true);
CREATE TABLE shifts (id SERIAL PRIMARY KEY, employee_id INT NOT NULL REFERENCES employees(id), shift_date DATE NOT NULL,
  start_time TIME NOT NULL, end_time TIME NOT NULL, area VARCHAR(12) NOT NULL CHECK (area IN ('FRONT_DESK','BAR','SHOP','COURTS')));
CREATE TABLE leave_requests (id SERIAL PRIMARY KEY, employee_id INT NOT NULL REFERENCES employees(id), from_date DATE NOT NULL, to_date DATE NOT NULL,
  reason VARCHAR(300), status VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')), decided_by INT REFERENCES users(id));
CREATE TABLE payroll (id SERIAL PRIMARY KEY, month CHAR(7) NOT NULL, employee_id INT NOT NULL REFERENCES employees(id),
  base_paise BIGINT NOT NULL, deductions_paise BIGINT NOT NULL DEFAULT 0, net_paise BIGINT NOT NULL,
  status VARCHAR(8) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PAID')), UNIQUE (month, employee_id));

-- Cross-cutting
CREATE TABLE notifications (id SERIAL PRIMARY KEY, target_role VARCHAR(20), target_user_id INT REFERENCES users(id),
  type VARCHAR(24) NOT NULL, title VARCHAR(120) NOT NULL, body VARCHAR(300), link VARCHAR(120), read_at TIMESTAMPTZ, dedupe_key VARCHAR(80) UNIQUE);
CREATE TABLE audit_logs (id SERIAL PRIMARY KEY, actor_id INT REFERENCES users(id), action VARCHAR(40) NOT NULL, entity VARCHAR(30), entity_id INT,
  meta JSONB, ip VARCHAR(45));
```

### 10.1 Seed Data (`seed.py`, deterministic)
- Users (all password `Club@12345`, **demo only; shown in README, must be changed via env in any real deployment**): owner@club.test, manager@club.test, desk@club.test, bar@club.test, member1@club.test (Gold), member2@club.test (Silver), member3@club.test (Junior).
- Plans: GOLD 3000/mo shop 15 bar 15; SILVER 1500 shop 5 bar 5; JUNIOR 800 shop 10 bar 10.
- Courts: Tennis 1–2, Padel 1, Badminton 1–2, Cricket Net 1.
- Court prices (₹/h): Tennis 0/400/250/600, Padel 0/700/450/1000, Badminton 0/200/120/300, Cricket Net 0/500/300/800 (Gold/Silver/Junior/Walk-in).
- 30 members (mixed plans, 5 expiring within 7 days, 3 expired), 14 products (3 below reorder level), 15 menu items, 8 tables, 60 historical bookings/orders/payments across last 30 days so the dashboard has data, 4 leads, one Friday social session.

---

## 11. Deployment (Local Only)

No cloud, no domain, no HTTPS, no external services. Everything runs on one laptop.

### 11.1 Compose services
| Service | Image / build | Ports | Notes |
|---------|---------------|-------|-------|
| `db` | `postgres:16` | **none published** (internal network only) | Named volume `pgdata`; non-superuser app role created via init script |
| `api` | `backend/Dockerfile` (python:3.12-slim) | **none published in demo mode** (publish `8000:8000` only in dev override for `/docs`) | `uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips="*"`; on start runs `create_all()` and, if `SEED=true`, `seed.py` |
| `web` | multi-stage: node build → `nginx:alpine` | `8080:80` (the only LAN-visible port) | Serves static bundle, SPA fallback to `index.html`, proxies `/api/` → `http://api:8000/`, sets `X-Forwarded-For`, adds security headers |

`docker-compose.dev.yml` override (optional): publishes `5432` and `8000` on `127.0.0.1` only, for local tooling.

### 11.2 Two run modes
| Mode | Command | Use |
|------|---------|-----|
| **Dev (hot reload)** | `docker compose up db api` + in `frontend/`: `npm run dev -- --host 0.0.0.0` | Daily development. Vite proxies `/api` → `http://localhost:8000` (`xfwd: true`). Phones use `http://<LAN-IP>:5173` |
| **Demo / final** | `docker compose up --build` | Judging and submission. Phones use `http://<LAN-IP>:8080` |

### 11.3 `.env.example`
```
DATABASE_URL=postgresql+psycopg://ccms_app:change_me@db:5432/ccms
POSTGRES_PASSWORD=change_me
JWT_SECRET=change-me-to-at-least-32-random-bytes
ACCESS_TOKEN_MINUTES=15
COOKIE_SECURE=false            # plain http on LAN. Must be true behind HTTPS
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8080,http://192.168.1.50:8080   # replace with your LAN IP
SEED=true
SEED_PASSWORD=Club@12345       # demo only; change for any real use
TAX_COURT=18
TAX_SHOP=18
TAX_BAR=5
TAX_MEMBERSHIP=18
```

### 11.4 Phone access checklist
1. Laptop and phones on the **same Wi-Fi** (not a guest/isolated network). A phone hotspot or small travel router is a good backup.
2. Find the laptop's LAN IP (`ipconfig` / `ifconfig` / `ip a`) and add it to `ALLOWED_ORIGINS`.
3. Allow inbound TCP 8080 (and 5173 for dev) in the OS firewall for the private network profile only.
4. Open `http://<LAN-IP>:8080` on the phone → log in → "Add to Home Screen".
5. Expect browser "not secure" labels; this is normal on plain http.

### 11.5 Reset & backup
- `reset_db.sh`: stop `api`, drop/recreate database, restart (re-seeds). Target < 30 s.
- `docker compose down -v` wipes everything including the volume.
- Before the demo: `pg_dump` the seeded DB to `backup/ccms_seed.sql` so a corrupted demo state can be restored in one command.

### 11.6 Optional: local HTTPS (only if all P0 is done)
Install `mkcert`, generate a cert for `localhost` and the LAN IP, mount it in nginx, set `COOKIE_SECURE=true`, install the mkcert root CA on the demo phone. Benefits: camera QR scanning and full PWA install. Risk: certificate trust issues cost time. Default is **skip**.
