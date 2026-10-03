# Deep dive — architecture, domains, and code walkthroughs

This section is the narrative companion to the per-file catalog below. It explains **how the whole system fits together** and walks through **critical modules line-by-line** where a reader needs the most hand-holding.

---

## 1. Folder map (entire repository)

| Path | Role |
|------|------|
| `/` | Docker Compose, nginx, env template, README, reset script — **runtime shell** around backend + frontend. |
| `backend/` | Python 3.12 FastAPI application, pytest suite, demo seed. |
| `backend/app/` | Application package: models, schemas, routers, services, security. |
| `backend/tests/` | Integration tests against Postgres in Docker. |
| `frontend/` | React 18 + Vite + Tailwind SPA (public site, member portal, staff console). |
| `db/init/` | Postgres first-boot SQL shell scripts (app DB role). |
| `docs/` | SRS, PRD, BRD, playbooks — **specifications** (behaviour authority). |
| `reports/` | Build prompts, progress, verification reports from development. |
| `rules/` | Cursor rule file `ccms.mdc` (AI/editor conventions). |

Nothing in this repo is a microservice: **one API process**, **one database**, **one nginx** serving static UI and proxying `/api`.

---

## 2. Request lifecycle (one HTTP call)

1. Browser hits `http://host:8080/api/v1/...` (demo) or Vite dev proxy to the same path.
2. **nginx** (`nginx.conf`) forwards to `api:8000` **without stripping** `/api`.
3. **Uvicorn** runs `app.main:app` with `--proxy-headers` so `request.client.host` reflects `X-Forwarded-For` (S-23).
4. **SlowAPI** middleware may rate-limit (login, public enquiry, etc.).
5. **CORS** checks `ALLOWED_ORIGINS` from `.env`.
6. Matched **router** endpoint runs FastAPI dependencies: `get_session`, `get_current_user`, `require_roles(...)`.
7. Router validates body/query with **Pydantic** schemas (`extra="forbid"` on request bodies).
8. Router calls **service** function; service uses SQLAlchemy `select()` / `update()`, commits, may call `payments.record_payment()` or `audit.log()`.
9. Success → response model serialised to JSON. Failure → `AppError` or validation → **SRS §6 envelope** via handlers in `main.py`.

---

## 3. `backend/app/main.py` — line-by-line

| Line(s) | Code / behaviour |
|---------|------------------|
| 1–12 | Standard library and FastAPI imports; Starlette HTTP exceptions; SlowAPI rate-limit types. |
| 14 | `import models` side effect: all ORM classes register on `Base.metadata` before `create_all`. |
| 15–16 | `settings` (env) and SQLAlchemy `engine` / `SessionLocal`. |
| 17–34 | Import all router modules (auth, plans, members, … notifications). |
| 37–55 | `_ROUTERS` tuple: single place routers are mounted — add a module here once. |
| 57 | `API_VERSION` exposed on `/health`. |
| 59 | Logger name `ccms` for unhandled exceptions (S-18: no traceback to client). |
| 61–68 | Map generic HTTP status codes to stable `error.code` strings. |
| 71–78 | `envelope()`: builds `{"error": {code, message, details}}` JSONResponse — **every** error path uses this. |
| 81–89 | **Lifespan**: on startup, `Base.metadata.create_all(bind=engine)`; if `SEED=true`, import `seed.run_seed` and populate demo data. |
| 92 | FastAPI app instance with lifespan hook. |
| 94–95 | Attach SlowAPI limiter to `app.state` and add middleware. |
| 97–105 | CORS: origins from env list; credentials allowed; never `*` with credentials (S-11). |
| 108–110 | `AppError` handler → envelope with service-provided code/status. |
| 113–120 | Pydantic validation → 422 `VALIDATION_ERROR` + `details.errors`. |
| 123–125 | Rate limit → 429 `RATE_LIMITED`. |
| 128–131 | Starlette HTTPException → mapped code or `HTTP_ERROR`. |
| 134–138 | Catch-all: log server-side, return 500 `INTERNAL_ERROR` without leaking internals. |
| 141–142 | Loop `include_router` for every module in `_ROUTERS`. |
| 145–147 | `GET /health` — no auth; returns `{status, version}` (not under `/api/v1`). |

---

## 4. Configuration & time (`config.py`, `db.py`)

**`config.py`**

- `Settings` (Pydantic Settings): reads `.env` — `database_url`, `jwt_secret`, token TTL, `allowed_origins`, `seed`, `seed_password`, tax rates for court/shop/bar/membership.
- `allowed_origins_list`: splits comma-separated origins for CORS.
- `CLUB_TZ = ZoneInfo("Asia/Kolkata")`: all “which calendar day?” logic uses this.
- `local_date(utc_moment)`: IST date for limits and dashboards.
- `day_bounds_utc(day)`: UTC `[start, end)` for one IST day — used in booking daily limits and reports.

**`db.py`**

- `create_engine(..., pool_pre_ping=True, future=True)`: resilient Postgres pool, SQLAlchemy 2.0 style.
- `SessionLocal`: sessions with `autoflush=False`, `expire_on_commit=False` (explicit refresh after commit in services).
- `Base`: declarative base for all models.
- `get_session()`: FastAPI dependency yielding a session per request.

---

## 5. Security module (`security.py`) — responsibilities

Although long (~370 lines), it is a **single module** by SRS design (no separate `services/auth.py`).

| Area | Lines (approx.) | Purpose |
|------|-----------------|--------|
| Constants | 32–44 | JWT HS256, lockout 5× / 15 min, refresh 7 days, cookie name/path, SlowAPI limiter on client IP. |
| `AppError` | 47–61 | Domain errors with code + HTTP status + details. |
| Passwords | 71–100 | Policy validation, argon2 hash/verify. |
| Access JWT | 106–125 | Create/decode; map expiry to `TOKEN_EXPIRED`. |
| Refresh tokens | (following) | Random token, SHA-256 stored hash, rotation, reuse detection, HttpOnly cookie helpers. |
| `get_current_user` | | Bearer token → User row or 401. |
| `require_roles(*roles)` | | Dependency factory; 403 `FORBIDDEN` if role not in list. |
| `authenticate` / lockout | | Login: verify password, increment failures, lock account. |
| Staff user CRUD | | `create_staff_user`, `update_user` with audit on role change. |
| `current_member_id` | | Resolve members.id for MEMBER role users. |

Routers must not re-implement any of this — they only declare dependencies.

---

## 6. Audit (`audit.py`) — line-by-line

| Line | Meaning |
|------|--------|
| 1–5 | Module docstring: audit rows commit with the caller’s transaction. |
| 17–33 | `_jsonable`: recursively coerce meta dict for JSONB (Enum, datetime→Z, Decimal→int). |
| 36–54 | `log(...)`: append `AuditLog` row; **does not commit** — service commits once. |

Used for refunds, exports, payroll, plan/court price changes, role changes, etc.

---

## 7. Enumerations (`enums.py`)

All domain string values used in CHECK constraints and API:

- **Identity:** `Role` (OWNER, MANAGER, FRONT_DESK, BAR_STAFF, MEMBER).
- **Membership:** `PlanCode`, `Tier`, `MembershipStatus`, `MemberStatus` (derived, not stored).
- **Courts:** `Sport`, `BookingStatus`, `BookingPaymentStatus`, `BookingSource`, `SlotState` (derived).
- **Social:** `SocialSessionStatus`, `SocialParticipantStatus`.
- **Shop:** `ProductCategory`, `ShopChannel`, `Fulfilment`, `ShopOrderStatus`, `OrderPaymentStatus`, `StockReason`.
- **Bar:** `MenuCategory`, `KitchenStatus`, `BarPaymentStatus`.
- **Payments:** `SourceType`, `PaymentMethod`, `PaymentStatus`.
- **CRM:** `LeadInterest`, `LeadStatus`, `QuoteStatus`.
- **Billing:** `InvoiceKind`, `InvoiceStatus`, `ExpenseStatus`.
- **HR:** `ShiftArea`, `LeaveStatus`, `PayrollStatus`.
- **UI:** `NotificationType`.

Helper `values(enum_cls)` builds SQL `IN (...)` lists for `_check()` in models.

---

## 8. Database models (`models.py`) — all 33 tables

Each class maps 1:1 to a PostgreSQL table. Money = `BigInteger` paise. Widespread pattern: `_created_at()` server default `now()`, `_check(column, Enum)` for CHECK constraints.

| Class | Table | Purpose |
|-------|-------|--------|
| `User` | `users` | Login identity, role, lockout counters. |
| `RefreshToken` | `refresh_tokens` | Hashed refresh token storage, revocation. |
| `AuditLog` | `audit_logs` | Immutable action trail (JSONB meta). |
| `Plan` | `plans` | Membership products, discounts, booking limits. |
| `Member` | `members` | Club member profile; optional link to `users`. |
| `Membership` | `memberships` | Active/historic plan enrolment date range. |
| `Court` | `courts` | Bookable court, sport type. |
| `CourtPrice` | `court_prices` | Price per sport × tier (walk-in, junior, silver, gold). |
| `Booking` | `bookings` | 1-hour reservation; member or guest. |
| `CourtSlot` | `court_slots` | **30-min grid cells**; UNIQUE(court_id, slot_start) prevents double booking. |
| `SocialSession` | `social_sessions` | Organised play session on a court. |
| `SocialParticipant` | `social_participants` | Join/leave, fee, refund state. |
| `Product` | `products` | Shop SKU, stock_qty, reorder_level. |
| `ShopOrder` | `shop_orders` | Counter or online order header. |
| `ShopOrderItem` | `shop_order_items` | Line items. |
| `StockMovement` | `stock_movements` | Audit of stock in/out. |
| `MenuItem` | `menu_items` | Bar/kitchen catalogue. |
| `BarTable` | `bar_tables` | Physical table numbers. |
| `BarOrder` | `bar_orders` | Tab order, kitchen pipeline, payment. |
| `BarOrderItem` | `bar_order_items` | Line items. |
| `Payment` | `payments` | **Single revenue ledger** — only inserted via `record_payment()`. |
| `Lead` | `leads` | CRM enquiry pipeline. |
| `LeadNote` | `lead_notes` | Staff notes on leads. |
| `Quote` | `quotes` | Formal quotes for corporate leads. |
| `Client` | `clients` | B2B billing entity. |
| `Invoice` | `invoices` | Tax-inclusive invoices to member or client. |
| `InvoiceLine` | `invoice_lines` | Invoice line items. |
| `Expense` | `expenses` | Payables (including payroll payout). |
| `Employee` | `employees` | HR record, link to user optional. |
| `Shift` | `shifts` | Roster by week/area. |
| `LeaveRequest` | `leave_requests` | Leave workflow. |
| `Payroll` | `payroll` | Monthly payroll run rows. |
| `Notification` | `notifications` | In-app notifications (e.g. new lead). |

**Critical constraints (behavioural):**

- `court_slots`: unique slot → concurrent booking attempts → one wins, others get `SLOT_TAKEN`.
- `bookings`: CHECK ensures member **or** guest identity.
- Payments: status includes REFUNDED; reports exclude refunded amounts from revenue.

For **column-level detail**, open `models.py` at the class line numbers listed in the per-file outline below (e.g. `User` at line 44).

---

## 9. Pydantic schemas (`schemas.py`)

~770 lines: request/response DTOs for every endpoint.

Patterns:

- Base request class with `model_config = ConfigDict(extra="forbid")` — unknown JSON fields rejected (S-05).
- `Page`, `PageSize` constrained query types; responses use `PageOut` with `{items, total, page, page_size}`.
- Money fields named `*_paise` as `int`.
- Datetimes serialised with `Z` suffix where applicable.
- Separate “Out” models for responses; “Create/Update” for writes.

The per-file section lists every class/function boundary with line numbers — use your editor’s outline view alongside it.

---

## 10. Service layer (`backend/app/services/`)

| Module | Domain | Key algorithms |
|--------|--------|----------------|
| `pricing.py` | Tiers & court prices | `tier_for`, `active_plan`, `discount_pct`, `court_price`, `booking_limits`. |
| `membership.py` | Members & plans | Member codes, renewals, history, plan listing. |
| `booking.py` | Courts & bookings | 30-min grid, 2 slots per booking, daily limit with `FOR UPDATE`, cancel/refund window, availability APIs. |
| `shop.py` | Pro shop | Conditional stock decrement (race-safe), order lifecycle, tax/discount totals. |
| `bar.py` | Bar & kitchen | Kitchen status order, tabs, `settle_tabs` all-or-nothing, daily report from payments. |
| `payments.py` | Ledger | **`record_payment()` only insert path**; `refund_payment`, lookups. |
| `reports.py` | Dashboard & exports | IST period bounds, revenue/receivables/payables, CSV with formula injection guard. |
| `leads.py` | CRM | Honeypot enquiry, status machine, convert/won, sanitise HTML. |
| `social.py` | Social sessions | Multi-slot occupancy, join capacity lock, Gold fee waiver. |
| `billing.py` | Invoices & expenses | Invoice numbers, HTML print view, expense mark-paid. |
| `hr.py` | HR | Shifts, leave, idempotent payroll run, mark-paid → expense. |
| `notifications.py` | In-app alerts | Create/list/mark read for staff/members. |

**No SQL in routers** — if you see `select(` in `routers/`, that is a defect (except trivial audit-log listing in payments router).

---

## 11. HTTP routers (`backend/app/routers/`)

Each file exports `router = APIRouter(prefix="/api/v1", tags=[...])`.

| File | Endpoints (count) | Notes |
|------|-------------------|--------|
| `auth.py` | 6 | login, logout, refresh, me, users CRUD (owner). |
| `plans.py` | 4 | Public list; staff patch prices. |
| `members.py` | 8 | CRUD, renew, expiring, by-code, history. |
| `courts.py` | 4 | CRUD, availability grid. |
| `bookings.py` | 6 | List/create/get/cancel/pay/status. |
| `social.py` | 7 | Sessions CRUD, join/leave, participants. |
| `shop.py` | 12 | Products, orders, pay, status. |
| `bar.py` | 15 | Menu, tables, orders, kitchen, tabs, daily report. |
| `payments.py` | 6 | Ledger, mine, refund, **audit-logs** (owner). |
| `dashboard.py` | 2 | summary, revenue-series. |
| `leads.py` | 8 | Pipeline, notes, quotes, convert. |
| `invoices.py` | 9 | Clients, invoices, print, mark-paid. |
| `expenses.py` | 4 | Expense CRUD + mark-paid. |
| `hr.py` | 10 | Employees, shifts, leave, payroll. |
| `public.py` | 3 | Availability, products, enquiries (rate limited). |
| `notifications.py` | 3 | List, unread count, mark read. |

Exact paths and roles: see `reports/backend_report.md` §5 or `openapi.json`.

---

## 12. Demo seed (`backend/seed.py`)

Runs when `SEED=true` on API startup (after `create_all`).

Sections (each idempotent on its own tables):

1. `_seed_users` — owner, manager, desk, bar, member1..3.
2. `_seed_plans`, `_seed_courts`, `_seed_court_prices`, `_seed_products`, `_seed_menu`, `_seed_bar_tables`.
3. `_seed_members` — 30 members with rotating GOLD/SILVER/JUNIOR memberships.
4. `_seed_history` — **only if `payments` count is 0**: ~30 past bookings, shop/bar orders, 4 leads, Friday social; uses real services then shifts rows back by whole days.

---

## 13. Tests (`backend/tests/`)

| File | Focus |
|------|--------|
| `conftest.py` | API base path, test prefixes, autouse limiter disable, DB cleanup order, fixtures `make_user`, `make_court`. |
| `test_auth.py` | Login, refresh rotation, lockout, rate limit. |
| `test_foundation.py` | Schema, seed shape, enums. |
| `test_members.py` | Membership lifecycle. |
| `test_bookings.py` | Grid, limits, T-01 concurrency, refunds. |
| `test_shop.py` | Stock race T-05, discounts. |
| `test_bar.py` | Kitchen, tabs T-12. |
| `test_payments.py` | Dashboard T-10, CSV, refunds. |
| `test_leads.py` | Honeypot, pipeline. |
| `test_social_billing.py` | Social T-11, invoices, expenses. |
| `test_hr.py` | Payroll idempotency, manager vs owner pay. |
| `test_security.py` | T-07 RBAC matrix, T-08 IDOR, S-checks. |

Run: `docker compose exec api pytest -q` (image must be rebuilt after code edits).

---

## 14. Frontend (`frontend/`)

**Stack:** React 18, TypeScript, Vite, Tailwind, TanStack Query, React Router 6.

| Area | Files | Purpose |
|------|-------|--------|
| Entry | `src/main.tsx` | Routes for public `/`, member `/portal/*`, staff `/staff/*`, dev `/dev/design`. |
| API | `src/api/client.ts` | Fetch + in-memory access token + refresh cookie; `ApiError` matches SRS envelope. |
| API | `src/api/hooks/index.ts` | React Query hooks wrapping endpoints. |
| API | `src/api/types.ts`, `schema.d.ts` | TS types (schema.d.ts from OpenAPI). |
| Auth | `src/lib/auth-context.tsx`, `hooks/useAuth.ts` | Session state, login/logout. |
| Layout | `components/layout/*` | `PublicLayout`, `AppShell`, `RoleGuard`, nav rails. |
| UI | `components/ui/*` | Design system: Button, Card, Modal, DataTable, Toast, etc. |
| Features | `components/features/CourtScheduleGrid.tsx` | Shared booking grid UI. |
| Pages | `pages/public/*` | Marketing site, login. |
| Pages | `pages/portal/*` | Member self-service. |
| Pages | `pages/staff/*` | Operational console per domain. |
| Mocks | `src/mocks/*` | Local mock store/seed for offline UI dev (not used when API live). |

**Build:** `frontend/Dockerfile` multi-stage → static files into nginx image at repo root build context.

**Dev:** `vite.config.ts` proxies `/api` to backend; access token never stored in localStorage (SRS S-02).

---

## 15. Infrastructure files (root)

| File | Line-by-line summary |
|------|----------------------|
| `docker-compose.yml` | `db` postgres:16 + init volume; `api` build `./backend`; `web` build frontend+nginx, **only** port 8080 published. |
| `docker-compose.dev.yml` | Publishes 127.0.0.1:5432 and :8000 for local dev. |
| `nginx.conf` | Security headers; `/api/` proxy; `/health`; SPA fallback `try_files`. |
| `reset_db.sh` | Stop api → DROP/CREATE db → grant ccms_app → start api (re-seed). |
| `.env.example` | Documents required secrets and `SEED`, `ALLOWED_ORIGINS`. |
| `.gitattributes` | Forces LF on `*.sh` for Linux containers. |

---

## 16. Documentation & reports

| File | Contents |
|------|----------|
| `docs/SRS.md` | Full software requirements — **authority** for behaviour. |
| `docs/PRD.md` | Feature list (F-01 …). |
| `docs/BRD.md` | Business context. |
| `docs/AI_BUILD_PLAYBOOK.md` | Staged build instructions for AI/human builders. |
| `docs/DOCUMENTATION_CONTEXT.md` | How docs relate. |
| `reports/backend_report.md` | Final backend delivery report (tests, S-01..S-23, endpoints). |
| `reports/backend_progress.md` | Stage table, DECISIONS, KNOWN_ISSUES. |
| `reports/prompt*.md` | Original build prompts. |
| `tasks.md` | Task checklist at repo root. |

---

## 17. Generated / large artifacts (not line-documented here)

| File | Why skipped for line-by-line |
|------|------------------------------|
| `openapi.json` | ~11k lines; generate from running API `/openapi.json`. |
| `frontend/src/api/schema.d.ts` | Generated TypeScript from OpenAPI. |
| `frontend/package-lock.json` | npm lockfile — dependency resolution only. |
| `docs/Sports_Club_Management_System.pdf` | Binary PDF export of specs. |

Regenerate OpenAPI typings when the backend changes materially.

---

## 18. How to extend this reference

1. Open `docs/PROJECT_COMPLETE_CODE_REFERENCE.md` (this file + per-file catalog).
2. For any path, jump to `## \`path/to/file\`` in Part 2.
3. Use **Structure outline** line ranges to navigate large Python/TS files in the IDE.
4. For behaviour rules, always cross-check `docs/SRS.md`.

*Deep-dive section ends; per-file catalog follows.*
