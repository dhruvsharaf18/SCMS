# CCMS — Complete Project File & Code Reference

This document describes **every file and folder** in the Champions Club Management System (CCMS) repository as of the stopped-development snapshot. It explains **why each file exists**, how it fits the architecture, and provides **line-level detail** for smaller files plus **symbol-by-symbol maps** for larger modules.

## How to read this document

- **Line-by-line tables** appear for source files with ≤ 200 lines (config, Docker, shell, small modules).
- **Large files** (e.g. `schemas.py`, `models.py`, staff pages) use an **outline** (classes, functions, exports with line ranges) plus narrative; open the source file alongside the line numbers cited here.
- **Generated artifacts** (`openapi.json`, `frontend/src/api/schema.d.ts`, `package-lock.json`) are documented by role, not reproduced line-by-line.
- **SRS** remains authoritative for behaviour; this file describes **what the code does**.


## Repository statistics

- **Tracked files documented:** 168

- Python files: 53; TypeScript/TSX: 68


## Architecture (high level)

```
Browser → nginx (web:8080) → /api/* → FastAPI (api:8000) → PostgreSQL (db)
                └→ static React SPA (frontend build)
```
Business rules live in `backend/app/services/`. Routers in `backend/app/routers/` only parse HTTP, enforce `require_roles`, and call services. Money is integer paise; timestamps UTC; calendar-day logic uses `Asia/Kolkata` via `config.CLUB_TZ`.


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



---

# Top-level: `backend/`


## `backend/.dockerignore`

- **Lines:** 5

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `__pycache__/` |
| 2 | `*.py[cod]` |
| 3 | `.pytest_cache/` |
| 4 | `.venv/` |
| 5 | `.env` |


## `backend/Dockerfile`

- **Lines:** 16

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `FROM python:3.12-slim` |
| 2 | `` |
| 3 | `ENV PYTHONDONTWRITEBYTECODE=1 \` |
| 4 | `    PYTHONUNBUFFERED=1` |
| 5 | `` |
| 6 | `WORKDIR /app` |
| 7 | `` |
| 8 | `COPY requirements.txt ./` |
| 9 | `RUN pip install --no-cache-dir -r requirements.txt` |
| 10 | `` |
| 11 | `COPY . .` |
| 12 | `` |
| 13 | `EXPOSE 8000` |
| 14 | `` |
| 15 | `CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \` |
| 16 | `     "--proxy-headers", "--forwarded-allow-ips=*"]` |


## `backend/app/__init__.py`

- **Lines:** 0

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|


## `backend/app/audit.py`

- **Lines:** 54

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `"""S-14 audit trail.` |
| 2 | `` |
| 3 | ``log` only adds the row to the caller's session; the caller commits, so the audit row` |
| 4 | `lands in the same transaction as the change it describes.` |
| 5 | `"""` |
| 6 | `` |
| 7 | `from datetime import date, datetime` |
| 8 | `from decimal import Decimal` |
| 9 | `from enum import Enum` |
| 10 | `from typing import Any` |
| 11 | `` |
| 12 | `from sqlalchemy.orm import Session` |
| 13 | `` |
| 14 | `from .models import AuditLog` |
| 15 | `` |
| 16 | `` |
| 17 | `def _jsonable(value: Any) -> Any:` |
| 18 | `    """Audit meta is whatever the caller passed, so dates and enums are coerced here."""` |
| 19 | `    if isinstance(value, dict):` |
| 20 | `        return {str(key): _jsonable(item) for key, item in value.items()}` |
| 21 | `    if isinstance(value, (list, tuple, set)):` |
| 22 | `        return [_jsonable(item) for item in value]` |
| 23 | `    if isinstance(value, Enum):` |
| 24 | `        return _jsonable(value.value)` |
| 25 | `    if isinstance(value, datetime):` |
| 26 | `        return value.isoformat().replace("+00:00", "Z")` |
| 27 | `    if isinstance(value, date):` |
| 28 | `        return value.isoformat()` |
| 29 | `    if isinstance(value, Decimal):` |
| 30 | `        return int(value)` |
| 31 | `    if value is None or isinstance(value, (str, int, float, bool)):` |
| 32 | `        return value` |
| 33 | `    return str(value)` |
| 34 | `` |
| 35 | `` |
| 36 | `def log(` |
| 37 | `    session: Session,` |
| 38 | `    actor_id: int \| None,` |
| 39 | `    action: str,` |
| 40 | `    entity: str \| None = None,` |
| 41 | `    entity_id: int \| None = None,` |
| 42 | `    meta: dict[str, Any] \| None = None,` |
| 43 | `    ip: str \| None = None,` |
| 44 | `) -> None:` |
| 45 | `    session.add(` |
| 46 | `        AuditLog(` |
| 47 | `            actor_id=actor_id,` |
| 48 | `            action=action,` |
| 49 | `            entity=entity,` |
| 50 | `            entity_id=entity_id,` |
| 51 | `            meta=_jsonable(meta),` |
| 52 | `            ip=ip,` |
| 53 | `        )` |
| 54 | `    )` |


## `backend/app/config.py`

- **Lines:** 51

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `from datetime import date, datetime, time, timedelta, timezone` |
| 2 | `from zoneinfo import ZoneInfo` |
| 3 | `` |
| 4 | `from pydantic_settings import BaseSettings, SettingsConfigDict` |
| 5 | `` |
| 6 | `` |
| 7 | `class Settings(BaseSettings):` |
| 8 | `    """Runtime configuration, read from the environment (see .env.example, SRS 11.3)."""` |
| 9 | `` |
| 10 | `    model_config = SettingsConfigDict(` |
| 11 | `        env_file=".env",` |
| 12 | `        env_file_encoding="utf-8",` |
| 13 | `        case_sensitive=False,` |
| 14 | `        extra="ignore",` |
| 15 | `    )` |
| 16 | `` |
| 17 | `    database_url: str` |
| 18 | `    jwt_secret: str` |
| 19 | `    access_token_minutes: int = 15` |
| 20 | `    cookie_secure: bool = False` |
| 21 | `    allowed_origins: str = "http://localhost:5173,http://localhost:8080"` |
| 22 | `    seed: bool = False` |
| 23 | `    seed_password: str = "Club@12345"` |
| 24 | `` |
| 25 | `    # Tax-inclusive rates in percent (SRS 4.6).` |
| 26 | `    tax_court: int = 18` |
| 27 | `    tax_shop: int = 18` |
| 28 | `    tax_bar: int = 5` |
| 29 | `    tax_membership: int = 18` |
| 30 | `` |
| 31 | `    @property` |
| 32 | `    def allowed_origins_list(self) -> list[str]:` |
| 33 | `        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]` |
| 34 | `` |
| 35 | `` |
| 36 | `settings = Settings()` |
| 37 | `` |
| 38 | `# SRS 1.4: stored time is UTC; "day" for limits and reports is the IST calendar day.` |
| 39 | `# Never hard-code +05:30 (SRS 8).` |
| 40 | `CLUB_TZ = ZoneInfo("Asia/Kolkata")` |
| 41 | `` |
| 42 | `` |
| 43 | `def local_date(moment: datetime) -> date:` |
| 44 | `    """The club-local calendar date a UTC instant falls on."""` |
| 45 | `    return moment.astimezone(CLUB_TZ).date()` |
| 46 | `` |
| 47 | `` |
| 48 | `def day_bounds_utc(day: date) -> tuple[datetime, datetime]:` |
| 49 | `    """[start, end) UTC bounds of one IST calendar day."""` |
| 50 | `    start = datetime.combine(day, time.min, tzinfo=CLUB_TZ)` |
| 51 | `    return start.astimezone(timezone.utc), (start + timedelta(days=1)).astimezone(timezone.utc)` |


## `backend/app/db.py`

- **Lines:** 19

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `from collections.abc import Generator` |
| 2 | `` |
| 3 | `from sqlalchemy import create_engine` |
| 4 | `from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker` |
| 5 | `` |
| 6 | `from .config import settings` |
| 7 | `` |
| 8 | `engine = create_engine(settings.database_url, pool_pre_ping=True, future=True)` |
| 9 | `` |
| 10 | `SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)` |
| 11 | `` |
| 12 | `` |
| 13 | `class Base(DeclarativeBase):` |
| 14 | `    pass` |
| 15 | `` |
| 16 | `` |
| 17 | `def get_session() -> Generator[Session, None, None]:` |
| 18 | `    with SessionLocal() as session:` |
| 19 | `        yield session` |


## `backend/app/enums.py`

- **Lines:** 244

- **Purpose:** String enums mirroring SRS domain values.


### Structure outline


- `class _Str` — lines **9–11**
- `class Role` — lines **14–19**
- `class PlanCode` — lines **25–28**
- `class Tier` — lines **31–35**
- `class MembershipStatus` — lines **38–40**
- `class MemberStatus` — lines **43–49**: Derived on read (SRS 3.2.3), never stored.
- `class Sport` — lines **52–56**
- `class BookingStatus` — lines **59–63**
- `class BookingPaymentStatus` — lines **66–70**
- `class BookingSource` — lines **73–76**
- `class SlotState` — lines **79–85**: Availability grid states (SRS 3.2.4), never stored.
- `class SocialSessionStatus` — lines **88–90**
- `class SocialParticipantStatus` — lines **93–95**
- `class ProductCategory` — lines **98–103**
- `class ShopChannel` — lines **106–108**
- `class Fulfilment` — lines **111–114**
- `class ShopOrderStatus` — lines **117–122**
- `class OrderPaymentStatus` — lines **125–128**
- `class StockReason` — lines **131–135**
- `class MenuCategory` — lines **138–141**
- `class KitchenStatus` — lines **144–149**
- `class BarPaymentStatus` — lines **152–154**
- `class SourceType` — lines **157–163**
- `class PaymentMethod` — lines **166–170**
- `class PaymentStatus` — lines **173–175**
- `class LeadInterest` — lines **178–182**
- `class LeadStatus` — lines **185–190**
- `class QuoteStatus` — lines **193–196**
- `class InvoiceKind` — lines **199–201**
- `class InvoiceStatus` — lines **204–208**
- `class ExpenseStatus` — lines **211–213**
- `class ShiftArea` — lines **216–220**
- `class LeaveStatus` — lines **223–226**
- `class PayrollStatus` — lines **229–231**
- `class NotificationType` — lines **234–239**
- `def values` — lines **242–244**: Render an enum as a SQL CHECK value list.



## `backend/app/main.py`

- **Lines:** 147

- **Purpose:** FastAPI app factory: lifespan, CORS, rate limit, error envelope, router mount, /health.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import logging` |
| 2 | `from contextlib import asynccontextmanager` |
| 3 | `from typing import Any` |
| 4 | `` |
| 5 | `from fastapi import FastAPI, Request` |
| 6 | `from fastapi.encoders import jsonable_encoder` |
| 7 | `from fastapi.exceptions import RequestValidationError` |
| 8 | `from fastapi.middleware.cors import CORSMiddleware` |
| 9 | `from fastapi.responses import JSONResponse` |
| 10 | `from slowapi.errors import RateLimitExceeded` |
| 11 | `from slowapi.middleware import SlowAPIMiddleware` |
| 12 | `from starlette.exceptions import HTTPException as StarletteHTTPException` |
| 13 | `` |
| 14 | `from . import models  # noqa: F401  -- registers the tables before create_all()` |
| 15 | `from .config import settings` |
| 16 | `from .db import Base, SessionLocal, engine` |
| 17 | `from .routers import (` |
| 18 | `    auth,` |
| 19 | `    bar,` |
| 20 | `    bookings,` |
| 21 | `    courts,` |
| 22 | `    dashboard,` |
| 23 | `    expenses,` |
| 24 | `    hr,` |
| 25 | `    invoices,` |
| 26 | `    leads,` |
| 27 | `    members,` |
| 28 | `    notifications,` |
| 29 | `    payments,` |
| 30 | `    plans,` |
| 31 | `    public,` |
| 32 | `    shop,` |
| 33 | `    social,` |
| 34 | `)` |
| 35 | `from .security import AppError, limiter` |
| 36 | `` |
| 37 | `# Registered once, so main.py does not need editing again as modules fill in.` |
| 38 | `_ROUTERS = (` |
| 39 | `    auth,` |
| 40 | `    plans,` |
| 41 | `    members,` |
| 42 | `    courts,` |
| 43 | `    bookings,` |
| 44 | `    social,` |
| 45 | `    shop,` |
| 46 | `    bar,` |
| 47 | `    payments,` |
| 48 | `    dashboard,` |
| 49 | `    leads,` |
| 50 | `    invoices,` |
| 51 | `    expenses,` |
| 52 | `    hr,` |
| 53 | `    public,` |
| 54 | `    notifications,` |
| 55 | `)` |
| 56 | `` |
| 57 | `API_VERSION = "1.0.0"` |
| 58 | `` |
| 59 | `logger = logging.getLogger("ccms")` |
| 60 | `` |
| 61 | `_STATUS_CODES = {` |
| 62 | `    400: "BAD_REQUEST",` |
| 63 | `    401: "INVALID_TOKEN",` |
| 64 | `    403: "FORBIDDEN",` |
| 65 | `    404: "NOT_FOUND",` |
| 66 | `    405: "METHOD_NOT_ALLOWED",` |
| 67 | `    429: "RATE_LIMITED",` |
| 68 | `}` |
| 69 | `` |
| 70 | `` |
| 71 | `def envelope(` |
| 72 | `    status: int, code: str, message: str, details: dict[str, Any] \| None = None` |
| 73 | `) -> JSONResponse:` |
| 74 | `    """SRS 6: every error has the same shape."""` |
| 75 | `    return JSONResponse(` |
| 76 | `        status_code=status,` |
| 77 | `        content={"error": {"code": code, "message": message, "details": details or {}}},` |
| 78 | `    )` |
| 79 | `` |
| 80 | `` |
| 81 | `@asynccontextmanager` |
| 82 | `async def lifespan(app: FastAPI):` |
| 83 | `    Base.metadata.create_all(bind=engine)` |
| 84 | `    if settings.seed:` |
| 85 | `        from seed import run_seed` |
| 86 | `` |
| 87 | `        with SessionLocal() as session:` |
| 88 | `            run_seed(session)` |
| 89 | `    yield` |
| 90 | `` |
| 91 | `` |
| 92 | `app = FastAPI(title="CCMS API", version=API_VERSION, lifespan=lifespan)` |
| 93 | `` |
| 94 | `app.state.limiter = limiter` |
| 95 | `app.add_middleware(SlowAPIMiddleware)` |
| 96 | `` |
| 97 | `# S-11: explicit allow-list from env, never "*" alongside credentials.` |
| 98 | `_origins = [o for o in settings.allowed_origins_list if o != "*"]` |
| 99 | `app.add_middleware(` |
| 100 | `    CORSMiddleware,` |
| 101 | `    allow_origins=_origins,` |
| 102 | `    allow_credentials=True,` |
| 103 | `    allow_methods=["*"],` |
| 104 | `    allow_headers=["*"],` |
| 105 | `)` |
| 106 | `` |
| 107 | `` |
| 108 | `@app.exception_handler(AppError)` |
| 109 | `async def _app_error_handler(request: Request, exc: AppError) -> JSONResponse:` |
| 110 | `    return envelope(exc.status, exc.code, exc.message, exc.details)` |
| 111 | `` |
| 112 | `` |
| 113 | `@app.exception_handler(RequestValidationError)` |
| 114 | `async def _validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:` |
| 115 | `    return envelope(` |
| 116 | `        422,` |
| 117 | `        "VALIDATION_ERROR",` |
| 118 | `        "The request body failed validation.",` |
| 119 | `        {"errors": jsonable_encoder(exc.errors())},` |
| 120 | `    )` |
| 121 | `` |
| 122 | `` |
| 123 | `@app.exception_handler(RateLimitExceeded)` |
| 124 | `async def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:` |
| 125 | `    return envelope(429, "RATE_LIMITED", "Too many requests. Please slow down.", {})` |
| 126 | `` |
| 127 | `` |
| 128 | `@app.exception_handler(StarletteHTTPException)` |
| 129 | `async def _http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:` |
| 130 | `    code = _STATUS_CODES.get(exc.status_code, "HTTP_ERROR")` |
| 131 | `    return envelope(exc.status_code, code, str(exc.detail))` |
| 132 | `` |
| 133 | `` |
| 134 | `@app.exception_handler(Exception)` |
| 135 | `async def _unhandled_handler(request: Request, exc: Exception) -> JSONResponse:` |
| 136 | `    # S-18: details stay in the server log, never in the response.` |
| 137 | `    logger.exception("Unhandled error on %s %s", request.method, request.url.path)` |
| 138 | `    return envelope(500, "INTERNAL_ERROR", "Something went wrong. Please try again.")` |
| 139 | `` |
| 140 | `` |
| 141 | `for _module in _ROUTERS:` |
| 142 | `    app.include_router(_module.router)` |
| 143 | `` |
| 144 | `` |
| 145 | `@app.get("/health")` |
| 146 | `def health() -> dict[str, str]:` |
| 147 | `    return {"status": "healthy", "version": API_VERSION}` |


## `backend/app/models.py`

- **Lines:** 692

- **Purpose:** SQLAlchemy 2.0 declarative models for all 33 PostgreSQL tables.


### Structure outline


- `def _created_at` — lines **33–34**
- `def _check` — lines **37–38**
- `class User` — lines **44–60**
- `class RefreshToken` — lines **63–71**
- `class AuditLog` — lines **74–84**
- `class Plan` — lines **90–118**
- `class Member` — lines **121–134**
- `class Membership` — lines **140–156**
- `class Court` — lines **165–175**
- `class CourtPrice` — lines **178–190**
- `class Booking` — lines **193–222**
- `class SocialSession` — lines **229–246**
- `class SocialParticipant` — lines **249–262**
- `class CourtSlot` — lines **274–295**: *** the double-booking guard *** (SRS 4.2). Never replace with app-only checks.
- `class Product` — lines **301–323**
- `class ShopOrder` — lines **326–348**
- `class ShopOrderItem` — lines **351–361**
- `class StockMovement` — lines **364–376**
- `class MenuItem` — lines **382–393**
- `class BarTable` — lines **396–404**
- `class BarOrder` — lines **407–441**
- `class BarOrderItem` — lines **447–458**
- `class Payment` — lines **464–489**: Single source of revenue truth. Written ONLY by services/payments.record_payment.
- `class Lead` — lines **499–514**
- `class LeadNote` — lines **517–524**
- `class Quote` — lines **527–538**
- `class Client` — lines **544–553**
- `class Invoice` — lines **556–574**
- `class InvoiceLine` — lines **577–586**
- `class Expense` — lines **589–607**
- `class Employee` — lines **613–624**
- `class Shift` — lines **627–637**
- `class LeaveRequest` — lines **640–653**
- `class Payroll` — lines **656–674**
- `class Notification` — lines **680–692**



## `backend/app/routers/__init__.py`

- **Lines:** 0

- **Purpose:** HTTP router (thin): validates input, calls `services/`, maps to Pydantic responses. File `backend/app/routers/__init__.py`.


### Line-by-line


| Ln | Code |
|----|------|


## `backend/app/routers/auth.py`

- **Lines:** 110

- **Purpose:** HTTP router (thin): validates input, calls `services/`, maps to Pydantic responses. File `backend/app/routers/auth.py`.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `from fastapi import APIRouter, Depends, Request, Response, status` |
| 2 | `from sqlalchemy.orm import Session` |
| 3 | `` |
| 4 | `from ..db import get_session` |
| 5 | `from ..enums import Role` |
| 6 | `from ..schemas import LoginRequest, TokenResponse, UserCreate, UserOut, UserSummary, UserUpdate` |
| 7 | `from ..security import (` |
| 8 | `    REFRESH_COOKIE_NAME,` |
| 9 | `    authenticate,` |
| 10 | `    clear_refresh_cookie,` |
| 11 | `    client_ip,` |
| 12 | `    create_access_token,` |
| 13 | `    current_member_id,` |
| 14 | `    create_staff_user,` |
| 15 | `    get_current_user,` |
| 16 | `    issue_refresh_token,` |
| 17 | `    limiter,` |
| 18 | `    require_roles,` |
| 19 | `    revoke_refresh_token,` |
| 20 | `    rotate_refresh_token,` |
| 21 | `    set_refresh_cookie,` |
| 22 | `    update_user,` |
| 23 | `)` |
| 24 | `from ..models import User` |
| 25 | `` |
| 26 | `router = APIRouter(prefix="/api/v1", tags=["auth"])` |
| 27 | `` |
| 28 | `` |
| 29 | `def _summary(session: Session, user: User) -> UserSummary:` |
| 30 | `    summary = UserSummary.model_validate(user)` |
| 31 | `    if user.role == Role.MEMBER.value:` |
| 32 | `        summary.member_id = current_member_id(session, user)` |
| 33 | `    return summary` |
| 34 | `` |
| 35 | `` |
| 36 | `def _token_response(session: Session, user: User) -> TokenResponse:` |
| 37 | `    access_token, expires_in = create_access_token(user)` |
| 38 | `    return TokenResponse(` |
| 39 | `        access_token=access_token,` |
| 40 | `        token_type="bearer",` |
| 41 | `        expires_in=expires_in,` |
| 42 | `        user=_summary(session, user),` |
| 43 | `    )` |
| 44 | `` |
| 45 | `` |
| 46 | `@router.post("/auth/login", response_model=TokenResponse)` |
| 47 | `@limiter.limit("5/minute")` |
| 48 | `def login(` |
| 49 | `    request: Request,` |
| 50 | `    response: Response,` |
| 51 | `    payload: LoginRequest,` |
| 52 | `    session: Session = Depends(get_session),` |
| 53 | `) -> TokenResponse:` |
| 54 | `    user = authenticate(session, payload.email, payload.password)` |
| 55 | `    set_refresh_cookie(response, issue_refresh_token(session, user))` |
| 56 | `    return _token_response(session, user)` |
| 57 | `` |
| 58 | `` |
| 59 | `@router.post("/auth/refresh", response_model=TokenResponse)` |
| 60 | `def refresh(` |
| 61 | `    request: Request,` |
| 62 | `    response: Response,` |
| 63 | `    session: Session = Depends(get_session),` |
| 64 | `) -> TokenResponse:` |
| 65 | `    user, new_raw = rotate_refresh_token(session, request.cookies.get(REFRESH_COOKIE_NAME))` |
| 66 | `    set_refresh_cookie(response, new_raw)` |
| 67 | `    return _token_response(session, user)` |
| 68 | `` |
| 69 | `` |
| 70 | `@router.post("/auth/logout")` |
| 71 | `def logout(` |
| 72 | `    request: Request,` |
| 73 | `    response: Response,` |
| 74 | `    session: Session = Depends(get_session),` |
| 75 | `    _: User = Depends(get_current_user),` |
| 76 | `) -> dict[str, str]:` |
| 77 | `    revoke_refresh_token(session, request.cookies.get(REFRESH_COOKIE_NAME))` |
| 78 | `    clear_refresh_cookie(response)` |
| 79 | `    return {"status": "ok"}` |
| 80 | `` |
| 81 | `` |
| 82 | `@router.get("/auth/me", response_model=UserSummary)` |
| 83 | `def me(` |
| 84 | `    session: Session = Depends(get_session),` |
| 85 | `    user: User = Depends(get_current_user),` |
| 86 | `) -> UserSummary:` |
| 87 | `    return _summary(session, user)` |
| 88 | `` |
| 89 | `` |
| 90 | `@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)` |
| 91 | `def create_user(` |
| 92 | `    request: Request,` |
| 93 | `    payload: UserCreate,` |
| 94 | `    session: Session = Depends(get_session),` |
| 95 | `    actor: User = Depends(require_roles(Role.OWNER)),` |
| 96 | `) -> UserOut:` |
| 97 | `    user = create_staff_user(session, actor, payload, client_ip(request))` |
| 98 | `    return UserOut.model_validate(user)` |
| 99 | `` |
| 100 | `` |
| 101 | `@router.patch("/users/{user_id}", response_model=UserOut)` |
| 102 | `def patch_user(` |
| 103 | `    user_id: int,` |
| 104 | `    request: Request,` |
| 105 | `    payload: UserUpdate,` |
| 106 | `    session: Session = Depends(get_session),` |
| 107 | `    actor: User = Depends(require_roles(Role.OWNER)),` |
| 108 | `) -> UserOut:` |
| 109 | `    user = update_user(session, actor, user_id, payload, client_ip(request))` |
| 110 | `    return UserOut.model_validate(user)` |


## `backend/app/routers/bar.py`

- **Lines:** 229

- **Purpose:** HTTP router (thin): validates input, calls `services/`, maps to Pydantic responses. File `backend/app/routers/bar.py`.


### Structure outline


- constant `_ADMIN` — line **34**
- constant `_BAR` — line **35**
- constant `_READERS` — line **36**
- `def _out` — lines **39–42**
- `def list_menu_items` — lines **49–56**
- `def create_menu_item` — lines **60–67**
- `def update_menu_item` — lines **71–81**
- `def list_tables` — lines **88–92**
- `def create_table` — lines **96–105**
- `def update_table` — lines **109–119**
- `def create_order` — lines **126–134**
- `def list_orders` — lines **138–156**
- `def daily_report` — lines **160–166**: BAR_STAFF see only what they took themselves; managers see the whole bar (SRS 3.2.8).
- `def get_order` — lines **170–175**
- `def add_items` — lines **179–186**
- `def set_kitchen_status` — lines **190–196**
- `def pay_order` — lines **200–207**
- `def open_tab` — lines **211–216**
- `def settle_tabs` — lines **220–229**



## `backend/app/routers/bookings.py`

- **Lines:** 138

- **Purpose:** HTTP router (thin): validates input, calls `services/`, maps to Pydantic responses. File `backend/app/routers/bookings.py`.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `from datetime import date` |
| 2 | `` |
| 3 | `from fastapi import APIRouter, Depends, Query, Request, status` |
| 4 | `from sqlalchemy import select` |
| 5 | `from sqlalchemy.orm import Session` |
| 6 | `` |
| 7 | `from ..db import get_session` |
| 8 | `from ..enums import BookingStatus, Role` |
| 9 | `from ..models import Member, User` |
| 10 | `from ..schemas import (` |
| 11 | `    BookingCancel,` |
| 12 | `    BookingCancelled,` |
| 13 | `    BookingCreate,` |
| 14 | `    BookingOut,` |
| 15 | `    BookingPay,` |
| 16 | `    BookingStatusUpdate,` |
| 17 | `    Page,` |
| 18 | `    PageOut,` |
| 19 | `    PageSize,` |
| 20 | `)` |
| 21 | `from ..security import client_ip, require_roles` |
| 22 | `from ..services import booking as svc` |
| 23 | `` |
| 24 | `# Paths are written in full so they match SRS 3.2 exactly (see DECISIONS).` |
| 25 | `router = APIRouter(prefix="/api/v1", tags=["bookings"])` |
| 26 | `` |
| 27 | `_BOOKERS = (Role.OWNER, Role.MANAGER, Role.FRONT_DESK, Role.MEMBER)` |
| 28 | `_STAFF = (Role.OWNER, Role.MANAGER, Role.FRONT_DESK)` |
| 29 | `` |
| 30 | `` |
| 31 | `def _enrich_booking_out(session: Session, user: User, booking: svc.Booking) -> BookingOut:` |
| 32 | `    out = BookingOut.model_validate(booking)` |
| 33 | `    if user.role in (Role.OWNER.value, Role.MANAGER.value, Role.FRONT_DESK.value):` |
| 34 | `        if booking.member_id:` |
| 35 | `            member = session.get(Member, booking.member_id)` |
| 36 | `            if member:` |
| 37 | `                out.member_name = member.full_name` |
| 38 | `                out.member_code = member.member_code` |
| 39 | `    return out` |
| 40 | `` |
| 41 | `` |
| 42 | `@router.post("/bookings", response_model=BookingOut, status_code=status.HTTP_201_CREATED)` |
| 43 | `def create_booking(` |
| 44 | `    payload: BookingCreate,` |
| 45 | `    request: Request,` |
| 46 | `    session: Session = Depends(get_session),` |
| 47 | `    user: User = Depends(require_roles(*_BOOKERS)),` |
| 48 | `) -> BookingOut:` |
| 49 | `    booking = svc.create_booking(session, user, payload.model_dump(), client_ip(request))` |
| 50 | `    return _enrich_booking_out(session, user, booking)` |
| 51 | `` |
| 52 | `` |
| 53 | `@router.get("/bookings", response_model=PageOut)` |
| 54 | `def list_bookings(` |
| 55 | `    date_: date \| None = Query(default=None, alias="date"),` |
| 56 | `    court_id: int \| None = None,` |
| 57 | `    member_id: int \| None = None,` |
| 58 | `    booking_status: BookingStatus \| None = Query(default=None, alias="status"),` |
| 59 | `    page: Page = 1,` |
| 60 | `    page_size: PageSize = 50,` |
| 61 | `    session: Session = Depends(get_session),` |
| 62 | `    user: User = Depends(require_roles(*_BOOKERS)),` |
| 63 | `) -> PageOut:` |
| 64 | `    rows, total = svc.list_bookings(` |
| 65 | `        session, user, date_, court_id, member_id, booking_status, page, page_size` |
| 66 | `    )` |
| 67 | `    is_staff = user.role in (Role.OWNER.value, Role.MANAGER.value, Role.FRONT_DESK.value)` |
| 68 | `    members_map: dict[int, tuple[str, str]] = {}` |
| 69 | `    if is_staff:` |
| 70 | `        member_ids = {row.member_id for row in rows if row.member_id is not None}` |
| 71 | `        if member_ids:` |
| 72 | `            members = session.execute(` |
| 73 | `                select(Member.id, Member.full_name, Member.member_code).where(Member.id.in_(membe...` |
| 74 | `            ).all()` |
| 75 | `            members_map = {m.id: (m.full_name, m.member_code) for m in members}` |
| 76 | `` |
| 77 | `    items = []` |
| 78 | `    for row in rows:` |
| 79 | `        out = BookingOut.model_validate(row)` |
| 80 | `        if is_staff and row.member_id and row.member_id in members_map:` |
| 81 | `            out.member_name, out.member_code = members_map[row.member_id]` |
| 82 | `        items.append(out)` |
| 83 | `` |
| 84 | `    return PageOut(` |
| 85 | `        items=items,` |
| 86 | `        total=total,` |
| 87 | `        page=page,` |
| 88 | `        page_size=page_size,` |
| 89 | `    )` |
| 90 | `` |
| 91 | `` |
| 92 | `@router.get("/bookings/{booking_id}", response_model=BookingOut)` |
| 93 | `def get_booking(` |
| 94 | `    booking_id: int,` |
| 95 | `    session: Session = Depends(get_session),` |
| 96 | `    user: User = Depends(require_roles(*_BOOKERS)),` |
| 97 | `) -> BookingOut:` |
| 98 | `    return _enrich_booking_out(session, user, svc.get_booking(session, booking_id, user))` |
| 99 | `` |
| 100 | `` |
| 101 | `@router.post("/bookings/{booking_id}/cancel", response_model=BookingCancelled)` |
| 102 | `def cancel_booking(` |
| 103 | `    booking_id: int,` |
| 104 | `    payload: BookingCancel,` |
| 105 | `    request: Request,` |
| 106 | `    session: Session = Depends(get_session),` |
| 107 | `    user: User = Depends(require_roles(*_BOOKERS)),` |
| 108 | `) -> BookingCancelled:` |
| 109 | `    booking, refunded, refund_paise = svc.cancel_booking(` |
| 110 | `        session, user, booking_id, payload.reason, payload.refund, client_ip(request)` |
| 111 | `    )` |
| 112 | `    return BookingCancelled(` |
| 113 | `        id=booking.id,` |
| 114 | `        status=BookingStatus(booking.status),` |
| 115 | `        refunded=refunded,` |
| 116 | `        refund_paise=refund_paise,` |
| 117 | `    )` |
| 118 | `` |
| 119 | `` |
| 120 | `@router.post("/bookings/{booking_id}/status", response_model=BookingOut)` |
| 121 | `def set_status(` |
| 122 | `    booking_id: int,` |
| 123 | `    payload: BookingStatusUpdate,` |
| 124 | `    session: Session = Depends(get_session),` |
| 125 | `    user: User = Depends(require_roles(*_STAFF)),` |
| 126 | `) -> BookingOut:` |
| 127 | `    return _enrich_booking_out(session, user, svc.set_status(session, user, booking_id, payload.s...` |
| 128 | `` |
| 129 | `` |
| 130 | `@router.post("/bookings/{booking_id}/pay", response_model=BookingOut)` |
| 131 | `def pay_booking(` |
| 132 | `    booking_id: int,` |
| 133 | `    payload: BookingPay,` |
| 134 | `    session: Session = Depends(get_session),` |
| 135 | `    user: User = Depends(require_roles(*_STAFF)),` |
| 136 | `) -> BookingOut:` |
| 137 | `    booking = svc.pay_booking(session, user, booking_id, payload.payment_method)` |
| 138 | `    return _enrich_booking_out(session, user, booking)` |


## `backend/app/routers/courts.py`

- **Lines:** 66

- **Purpose:** HTTP router (thin): validates input, calls `services/`, maps to Pydantic responses. File `backend/app/routers/courts.py`.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `﻿from datetime import date` |
| 2 | `` |
| 3 | `from fastapi import APIRouter, Depends, Query, Request, status` |
| 4 | `from sqlalchemy.orm import Session` |
| 5 | `` |
| 6 | `from ..db import get_session` |
| 7 | `from ..enums import Role, Sport` |
| 8 | `from ..models import User` |
| 9 | `from ..schemas import AvailabilityOut, CourtCreate, CourtOut, CourtUpdate` |
| 10 | `from ..security import client_ip, current_member_id, require_roles` |
| 11 | `from ..services import booking as svc` |
| 12 | `` |
| 13 | `# Paths are written in full so they match SRS 3.2 exactly (see DECISIONS).` |
| 14 | `router = APIRouter(prefix="/api/v1", tags=["courts"])` |
| 15 | `` |
| 16 | `_ALL = (Role.OWNER, Role.MANAGER, Role.FRONT_DESK, Role.BAR_STAFF, Role.MEMBER)` |
| 17 | `_ADMIN = (Role.OWNER, Role.MANAGER)` |
| 18 | `` |
| 19 | `` |
| 20 | `@router.get("/courts", response_model=list[CourtOut])` |
| 21 | `def list_courts(` |
| 22 | `    sport: Sport \| None = None,` |
| 23 | `    include_inactive: bool = False,` |
| 24 | `    session: Session = Depends(get_session),` |
| 25 | `    user: User = Depends(require_roles(*_ALL)),` |
| 26 | `) -> list[CourtOut]:` |
| 27 | `    courts = svc.list_courts(session, sport, active_only=not include_inactive)` |
| 28 | `    return [CourtOut.model_validate(court) for court in courts]` |
| 29 | `` |
| 30 | `` |
| 31 | `@router.post("/courts", response_model=CourtOut, status_code=status.HTTP_201_CREATED)` |
| 32 | `def create_court(` |
| 33 | `    payload: CourtCreate,` |
| 34 | `    request: Request,` |
| 35 | `    session: Session = Depends(get_session),` |
| 36 | `    user: User = Depends(require_roles(*_ADMIN)),` |
| 37 | `) -> CourtOut:` |
| 38 | `    court = svc.create_court(session, user, payload.model_dump(), client_ip(request))` |
| 39 | `    return CourtOut.model_validate(court)` |
| 40 | `` |
| 41 | `` |
| 42 | `@router.patch("/courts/{court_id}", response_model=CourtOut)` |
| 43 | `def update_court(` |
| 44 | `    court_id: int,` |
| 45 | `    payload: CourtUpdate,` |
| 46 | `    request: Request,` |
| 47 | `    session: Session = Depends(get_session),` |
| 48 | `    user: User = Depends(require_roles(*_ADMIN)),` |
| 49 | `) -> CourtOut:` |
| 50 | `    data = payload.model_dump(exclude_unset=True)` |
| 51 | `    court = svc.update_court(session, user, court_id, data, client_ip(request))` |
| 52 | `    return CourtOut.model_validate(court)` |
| 53 | `` |
| 54 | `` |
| 55 | `@router.get("/courts/availability", response_model=AvailabilityOut)` |
| 56 | `def availability(` |
| 57 | `    date_: date = Query(alias="date"),` |
| 58 | `    sport: Sport \| None = None,` |
| 59 | `    member_id: int \| None = Query(default=None),` |
| 60 | `    session: Session = Depends(get_session),` |
| 61 | `    user: User = Depends(require_roles(*_ALL)),` |
| 62 | `) -> AvailabilityOut:` |
| 63 | `    """Staff see walk-in prices unless they name a member; members always see their own."""` |
| 64 | `    if user.role == Role.MEMBER.value:` |
| 65 | `        member_id = current_member_id(session, user)` |
| 66 | `    return AvailabilityOut.model_validate(svc.availability(session, date_, sport, member_id))` |


## `backend/app/routers/dashboard.py`

- **Lines:** 36

- **Purpose:** HTTP router (thin): validates input, calls `services/`, maps to Pydantic responses. File `backend/app/routers/dashboard.py`.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `﻿from fastapi import APIRouter, Depends` |
| 2 | `from sqlalchemy.orm import Session` |
| 3 | `` |
| 4 | `from ..db import get_session` |
| 5 | `from ..enums import Role` |
| 6 | `from ..models import User` |
| 7 | `from ..schemas import DashboardSummary, RevenueSeries` |
| 8 | `from ..security import require_roles` |
| 9 | `from ..services import membership as membership_svc` |
| 10 | `from ..services import reports as svc` |
| 11 | `` |
| 12 | `# Paths are written in full so they match SRS 3.2 exactly (see DECISIONS).` |
| 13 | `router = APIRouter(prefix="/api/v1", tags=["dashboard"])` |
| 14 | `` |
| 15 | `_FINANCE = (Role.OWNER, Role.MANAGER)` |
| 16 | `` |
| 17 | `` |
| 18 | `@router.get("/dashboard/summary", response_model=DashboardSummary, response_model_by_alias=True)` |
| 19 | `def summary(` |
| 20 | `    period: str = "today",` |
| 21 | `    session: Session = Depends(get_session),` |
| 22 | `    user: User = Depends(require_roles(*_FINANCE)),` |
| 23 | `) -> DashboardSummary:` |
| 24 | `    """Loading the dashboard is what generates expiry notifications (SRS 4.9)."""` |
| 25 | `    body = svc.summary(session, period)` |
| 26 | `    membership_svc.notify_expiring(session)` |
| 27 | `    return DashboardSummary(**{**body, "from_": body["from"]})` |
| 28 | `` |
| 29 | `` |
| 30 | `@router.get("/dashboard/revenue-series", response_model=RevenueSeries)` |
| 31 | `def revenue_series(` |
| 32 | `    period: str = "week",` |
| 33 | `    session: Session = Depends(get_session),` |
| 34 | `    user: User = Depends(require_roles(*_FINANCE)),` |
| 35 | `) -> RevenueSeries:` |
| 36 | `    return RevenueSeries.model_validate(svc.revenue_series(session, period))` |


## `backend/app/routers/expenses.py`

- **Lines:** 62

- **Purpose:** HTTP router (thin): validates input, calls `services/`, maps to Pydantic responses. File `backend/app/routers/expenses.py`.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `﻿from fastapi import APIRouter, Depends, Query, Request, status` |
| 2 | `from sqlalchemy.orm import Session` |
| 3 | `` |
| 4 | `from ..db import get_session` |
| 5 | `from ..enums import ExpenseStatus, Role` |
| 6 | `from ..models import User` |
| 7 | `from ..schemas import ExpenseCreate, ExpenseOut, Page, PageOut, PageSize` |
| 8 | `from ..security import client_ip, require_roles` |
| 9 | `from ..services import billing as svc` |
| 10 | `` |
| 11 | `# Paths are written in full so they match SRS 3.2 exactly (see DECISIONS).` |
| 12 | `router = APIRouter(prefix="/api/v1", tags=["expenses"])` |
| 13 | `` |
| 14 | `_FINANCE = (Role.OWNER, Role.MANAGER)` |
| 15 | `` |
| 16 | `` |
| 17 | `@router.get("/expenses", response_model=PageOut)` |
| 18 | `def list_expenses(` |
| 19 | `    expense_status: ExpenseStatus \| None = Query(default=None, alias="status"),` |
| 20 | `    page: Page = 1,` |
| 21 | `    page_size: PageSize = 50,` |
| 22 | `    session: Session = Depends(get_session),` |
| 23 | `    user: User = Depends(require_roles(*_FINANCE)),` |
| 24 | `) -> PageOut:` |
| 25 | `    rows, total = svc.list_expenses(session, expense_status, page, page_size)` |
| 26 | `    return PageOut(` |
| 27 | `        items=[ExpenseOut.model_validate(row) for row in rows],` |
| 28 | `        total=total,` |
| 29 | `        page=page,` |
| 30 | `        page_size=page_size,` |
| 31 | `    )` |
| 32 | `` |
| 33 | `` |
| 34 | `@router.post("/expenses", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)` |
| 35 | `def create_expense(` |
| 36 | `    payload: ExpenseCreate,` |
| 37 | `    request: Request,` |
| 38 | `    session: Session = Depends(get_session),` |
| 39 | `    user: User = Depends(require_roles(*_FINANCE)),` |
| 40 | `) -> ExpenseOut:` |
| 41 | `    expense = svc.create_expense(session, user, payload.model_dump(), client_ip(request))` |
| 42 | `    return ExpenseOut.model_validate(expense)` |
| 43 | `` |
| 44 | `` |
| 45 | `@router.get("/expenses/{expense_id}", response_model=ExpenseOut)` |
| 46 | `def get_expense(` |
| 47 | `    expense_id: int,` |
| 48 | `    session: Session = Depends(get_session),` |
| 49 | `    user: User = Depends(require_roles(*_FINANCE)),` |
| 50 | `) -> ExpenseOut:` |
| 51 | `    return ExpenseOut.model_validate(svc.get_expense(session, expense_id))` |
| 52 | `` |
| 53 | `` |
| 54 | `@router.post("/expenses/{expense_id}/mark-paid", response_model=ExpenseOut)` |
| 55 | `def mark_paid(` |
| 56 | `    expense_id: int,` |
| 57 | `    request: Request,` |
| 58 | `    session: Session = Depends(get_session),` |
| 59 | `    user: User = Depends(require_roles(*_FINANCE)),` |
| 60 | `) -> ExpenseOut:` |
| 61 | `    expense = svc.mark_expense_paid(session, user, expense_id, client_ip(request))` |
| 62 | `    return ExpenseOut.model_validate(expense)` |


## `backend/app/routers/hr.py`

- **Lines:** 153

- **Purpose:** HTTP router (thin): validates input, calls `services/`, maps to Pydantic responses. File `backend/app/routers/hr.py`.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `﻿from datetime import date` |
| 2 | `` |
| 3 | `from fastapi import APIRouter, Depends, Query, Request, status` |
| 4 | `from sqlalchemy.orm import Session` |
| 5 | `` |
| 6 | `from ..db import get_session` |
| 7 | `from ..enums import LeaveStatus, Role` |
| 8 | `from ..models import User` |
| 9 | `from ..schemas import (` |
| 10 | `    EmployeeCreate,` |
| 11 | `    EmployeeOut,` |
| 12 | `    LeaveDecision,` |
| 13 | `    LeaveRequestCreate,` |
| 14 | `    LeaveRequestOut,` |
| 15 | `    PayrollOut,` |
| 16 | `    PayrollRun,` |
| 17 | `    ShiftCreate,` |
| 18 | `    ShiftOut,` |
| 19 | `)` |
| 20 | `from ..security import client_ip, require_roles` |
| 21 | `from ..services import hr as svc` |
| 22 | `` |
| 23 | `# Paths are written in full so they match SRS 3.2 exactly (see DECISIONS).` |
| 24 | `router = APIRouter(prefix="/api/v1", tags=["hr"])` |
| 25 | `` |
| 26 | `_ADMIN = (Role.OWNER, Role.MANAGER)` |
| 27 | `_STAFF = (Role.OWNER, Role.MANAGER, Role.FRONT_DESK, Role.BAR_STAFF)` |
| 28 | `` |
| 29 | `` |
| 30 | `# ---------------------------------------------------------------------------- employees` |
| 31 | `` |
| 32 | `` |
| 33 | `@router.get("/employees", response_model=list[EmployeeOut])` |
| 34 | `def list_employees(` |
| 35 | `    include_inactive: bool = False,` |
| 36 | `    session: Session = Depends(get_session),` |
| 37 | `    user: User = Depends(require_roles(*_ADMIN)),` |
| 38 | `) -> list[EmployeeOut]:` |
| 39 | `    rows = svc.list_employees(session, active_only=not include_inactive)` |
| 40 | `    return [EmployeeOut.model_validate(row) for row in rows]` |
| 41 | `` |
| 42 | `` |
| 43 | `@router.post("/employees", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)` |
| 44 | `def create_employee(` |
| 45 | `    payload: EmployeeCreate,` |
| 46 | `    request: Request,` |
| 47 | `    session: Session = Depends(get_session),` |
| 48 | `    user: User = Depends(require_roles(*_ADMIN)),` |
| 49 | `) -> EmployeeOut:` |
| 50 | `    employee = svc.create_employee(session, user, payload.model_dump(), client_ip(request))` |
| 51 | `    return EmployeeOut.model_validate(employee)` |
| 52 | `` |
| 53 | `` |
| 54 | `# ------------------------------------------------------------------------------- shifts` |
| 55 | `` |
| 56 | `` |
| 57 | `@router.get("/shifts", response_model=list[ShiftOut])` |
| 58 | `def list_shifts(` |
| 59 | `    week: date \| None = None,` |
| 60 | `    employee_id: int \| None = None,` |
| 61 | `    session: Session = Depends(get_session),` |
| 62 | `    user: User = Depends(require_roles(*_STAFF)),` |
| 63 | `) -> list[ShiftOut]:` |
| 64 | `    """Any date inside the week works; the roster runs Monday to Sunday."""` |
| 65 | `    return [ShiftOut.model_validate(row) for row in svc.list_shifts(session, week, employee_id)]` |
| 66 | `` |
| 67 | `` |
| 68 | `@router.post("/shifts", response_model=ShiftOut, status_code=status.HTTP_201_CREATED)` |
| 69 | `def create_shift(` |
| 70 | `    payload: ShiftCreate,` |
| 71 | `    request: Request,` |
| 72 | `    session: Session = Depends(get_session),` |
| 73 | `    user: User = Depends(require_roles(*_ADMIN)),` |
| 74 | `) -> ShiftOut:` |
| 75 | `    shift = svc.create_shift(session, user, payload.model_dump(), client_ip(request))` |
| 76 | `    return ShiftOut.model_validate(shift)` |
| 77 | `` |
| 78 | `` |
| 79 | `# ----------------------------------------------------------------------- leave requests` |
| 80 | `` |
| 81 | `` |
| 82 | `@router.get("/leave-requests", response_model=list[LeaveRequestOut])` |
| 83 | `def list_leave_requests(` |
| 84 | `    leave_status: LeaveStatus \| None = Query(default=None, alias="status"),` |
| 85 | `    session: Session = Depends(get_session),` |
| 86 | `    user: User = Depends(require_roles(*_STAFF)),` |
| 87 | `) -> list[LeaveRequestOut]:` |
| 88 | `    """Staff see their own requests; managers see everyone's."""` |
| 89 | `    employee_id = None` |
| 90 | `    if user.role not in (Role.OWNER.value, Role.MANAGER.value):` |
| 91 | `        employee_id = svc.own_employee_id(session, user)` |
| 92 | `        if employee_id is None:` |
| 93 | `            return []` |
| 94 | `    rows = svc.list_leave_requests(session, leave_status, employee_id)` |
| 95 | `    return [LeaveRequestOut.model_validate(row) for row in rows]` |
| 96 | `` |
| 97 | `` |
| 98 | `@router.post("/leave-requests", response_model=LeaveRequestOut, status_code=status.HTTP_201_CREATED)` |
| 99 | `def create_leave_request(` |
| 100 | `    payload: LeaveRequestCreate,` |
| 101 | `    request: Request,` |
| 102 | `    session: Session = Depends(get_session),` |
| 103 | `    user: User = Depends(require_roles(*_STAFF)),` |
| 104 | `) -> LeaveRequestOut:` |
| 105 | `    row = svc.create_leave_request(session, user, payload.model_dump(), client_ip(request))` |
| 106 | `    return LeaveRequestOut.model_validate(row)` |
| 107 | `` |
| 108 | `` |
| 109 | `@router.post("/leave-requests/{request_id}/decide", response_model=LeaveRequestOut)` |
| 110 | `def decide_leave(` |
| 111 | `    request_id: int,` |
| 112 | `    payload: LeaveDecision,` |
| 113 | `    request: Request,` |
| 114 | `    session: Session = Depends(get_session),` |
| 115 | `    user: User = Depends(require_roles(*_ADMIN)),` |
| 116 | `) -> LeaveRequestOut:` |
| 117 | `    row = svc.decide_leave(session, user, request_id, payload.decision, client_ip(request))` |
| 118 | `    return LeaveRequestOut.model_validate(row)` |
| 119 | `` |
| 120 | `` |
| 121 | `# ------------------------------------------------------------------------------ payroll` |
| 122 | `` |
| 123 | `` |
| 124 | `@router.get("/payroll", response_model=list[PayrollOut])` |
| 125 | `def list_payroll(` |
| 126 | `    month: str \| None = None,` |
| 127 | `    session: Session = Depends(get_session),` |
| 128 | `    user: User = Depends(require_roles(*_ADMIN)),` |
| 129 | `) -> list[PayrollOut]:` |
| 130 | `    return [PayrollOut.model_validate(row) for row in svc.list_payroll(session, month)]` |
| 131 | `` |
| 132 | `` |
| 133 | `@router.post("/payroll/run", response_model=list[PayrollOut], status_code=status.HTTP_201_CREATED)` |
| 134 | `def run_payroll(` |
| 135 | `    payload: PayrollRun,` |
| 136 | `    request: Request,` |
| 137 | `    session: Session = Depends(get_session),` |
| 138 | `    user: User = Depends(require_roles(*_ADMIN)),` |
| 139 | `) -> list[PayrollOut]:` |
| 140 | `    """Idempotent: rerunning a month only adds employees that have no row yet."""` |
| 141 | `    rows = svc.run_payroll(session, user, payload.month, client_ip(request))` |
| 142 | `    return [PayrollOut.model_validate(row) for row in rows]` |
| 143 | `` |
| 144 | `` |
| 145 | `@router.post("/payroll/{payroll_id}/mark-paid", response_model=PayrollOut)` |
| 146 | `def mark_payroll_paid(` |
| 147 | `    payroll_id: int,` |
| 148 | `    request: Request,` |
| 149 | `    session: Session = Depends(get_session),` |
| 150 | `    user: User = Depends(require_roles(Role.OWNER)),` |
| 151 | `) -> PayrollOut:` |
| 152 | `    row = svc.mark_payroll_paid(session, user, payroll_id, client_ip(request))` |
| 153 | `    return PayrollOut.model_validate(row)` |


## `backend/app/routers/invoices.py`

- **Lines:** 149

- **Purpose:** HTTP router (thin): validates input, calls `services/`, maps to Pydantic responses. File `backend/app/routers/invoices.py`.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `from fastapi import APIRouter, Depends, Query, Request, Response, status` |
| 2 | `from sqlalchemy.orm import Session` |
| 3 | `` |
| 4 | `from ..db import get_session` |
| 5 | `from ..enums import InvoiceStatus, Role` |
| 6 | `from ..models import User` |
| 7 | `from ..schemas import (` |
| 8 | `    ClientCreate,` |
| 9 | `    ClientOut,` |
| 10 | `    ClientUpdate,` |
| 11 | `    InvoiceCreate,` |
| 12 | `    InvoiceLineOut,` |
| 13 | `    InvoiceOut,` |
| 14 | `    InvoiceStatusUpdate,` |
| 15 | `    MarkPaid,` |
| 16 | `    Page,` |
| 17 | `    PageOut,` |
| 18 | `    PageSize,` |
| 19 | `)` |
| 20 | `from ..security import client_ip, require_roles` |
| 21 | `from ..services import billing as svc` |
| 22 | `` |
| 23 | `# Paths are written in full so they match SRS 3.2 exactly (see DECISIONS).` |
| 24 | `router = APIRouter(prefix="/api/v1", tags=["invoices"])` |
| 25 | `` |
| 26 | `_FINANCE = (Role.OWNER, Role.MANAGER)` |
| 27 | `# SRS 3.1 gives the front desk read-only sight of invoices and clients.` |
| 28 | `_READERS = (Role.OWNER, Role.MANAGER, Role.FRONT_DESK)` |
| 29 | `` |
| 30 | `` |
| 31 | `def _out(session: Session, invoice) -> InvoiceOut:` |
| 32 | `    body = InvoiceOut.model_validate(invoice)` |
| 33 | `    body.lines = [` |
| 34 | `        InvoiceLineOut.model_validate(line) for line in svc.invoice_lines(session, invoice.id)` |
| 35 | `    ]` |
| 36 | `    return body` |
| 37 | `` |
| 38 | `` |
| 39 | `# ----------------------------------------------------------------------------- clients` |
| 40 | `` |
| 41 | `` |
| 42 | `@router.get("/clients", response_model=list[ClientOut])` |
| 43 | `def list_clients(` |
| 44 | `    session: Session = Depends(get_session),` |
| 45 | `    user: User = Depends(require_roles(*_READERS)),` |
| 46 | `) -> list[ClientOut]:` |
| 47 | `    return [ClientOut.model_validate(client) for client in svc.list_clients(session)]` |
| 48 | `` |
| 49 | `` |
| 50 | `@router.post("/clients", response_model=ClientOut, status_code=status.HTTP_201_CREATED)` |
| 51 | `def create_client(` |
| 52 | `    payload: ClientCreate,` |
| 53 | `    request: Request,` |
| 54 | `    session: Session = Depends(get_session),` |
| 55 | `    user: User = Depends(require_roles(*_FINANCE)),` |
| 56 | `) -> ClientOut:` |
| 57 | `    client = svc.create_client(session, user, payload.model_dump(), client_ip(request))` |
| 58 | `    return ClientOut.model_validate(client)` |
| 59 | `` |
| 60 | `` |
| 61 | `@router.patch("/clients/{client_id}", response_model=ClientOut)` |
| 62 | `def update_client(` |
| 63 | `    client_id: int,` |
| 64 | `    payload: ClientUpdate,` |
| 65 | `    request: Request,` |
| 66 | `    session: Session = Depends(get_session),` |
| 67 | `    user: User = Depends(require_roles(*_FINANCE)),` |
| 68 | `) -> ClientOut:` |
| 69 | `    data = payload.model_dump(exclude_unset=True)` |
| 70 | `    return ClientOut.model_validate(` |
| 71 | `        svc.update_client(session, user, client_id, data, client_ip(request))` |
| 72 | `    )` |
| 73 | `` |
| 74 | `` |
| 75 | `# ---------------------------------------------------------------------------- invoices` |
| 76 | `` |
| 77 | `` |
| 78 | `@router.get("/invoices", response_model=PageOut)` |
| 79 | `def list_invoices(` |
| 80 | `    invoice_status: InvoiceStatus \| None = Query(default=None, alias="status"),` |
| 81 | `    member_id: int \| None = None,` |
| 82 | `    client_id: int \| None = None,` |
| 83 | `    page: Page = 1,` |
| 84 | `    page_size: PageSize = 50,` |
| 85 | `    session: Session = Depends(get_session),` |
| 86 | `    user: User = Depends(require_roles(*_READERS)),` |
| 87 | `) -> PageOut:` |
| 88 | `    rows, total = svc.list_invoices(session, invoice_status, member_id, client_id, page, page_size)` |
| 89 | `    return PageOut(` |
| 90 | `        items=[_out(session, row) for row in rows],` |
| 91 | `        total=total,` |
| 92 | `        page=page,` |
| 93 | `        page_size=page_size,` |
| 94 | `    )` |
| 95 | `` |
| 96 | `` |
| 97 | `@router.post("/invoices", response_model=InvoiceOut, status_code=status.HTTP_201_CREATED)` |
| 98 | `def create_invoice(` |
| 99 | `    payload: InvoiceCreate,` |
| 100 | `    request: Request,` |
| 101 | `    session: Session = Depends(get_session),` |
| 102 | `    user: User = Depends(require_roles(*_FINANCE)),` |
| 103 | `) -> InvoiceOut:` |
| 104 | `    data = payload.model_dump()` |
| 105 | `    data["lines"] = [dict(line) for line in data["lines"]]` |
| 106 | `    return _out(session, svc.create_invoice(session, user, data, client_ip(request)))` |
| 107 | `` |
| 108 | `` |
| 109 | `@router.get("/invoices/{invoice_id}", response_model=InvoiceOut)` |
| 110 | `def get_invoice(` |
| 111 | `    invoice_id: int,` |
| 112 | `    session: Session = Depends(get_session),` |
| 113 | `    user: User = Depends(require_roles(*_READERS)),` |
| 114 | `) -> InvoiceOut:` |
| 115 | `    return _out(session, svc.get_invoice(session, invoice_id))` |
| 116 | `` |
| 117 | `` |
| 118 | `@router.get("/invoices/{invoice_id}/print")` |
| 119 | `def print_invoice(` |
| 120 | `    invoice_id: int,` |
| 121 | `    session: Session = Depends(get_session),` |
| 122 | `    user: User = Depends(require_roles(*_FINANCE)),` |
| 123 | `) -> Response:` |
| 124 | `    """Server-rendered HTML with every field escaped (S-16)."""` |
| 125 | `    return Response(content=svc.invoice_html(session, invoice_id), media_type="text/html")` |
| 126 | `` |
| 127 | `` |
| 128 | `@router.post("/invoices/{invoice_id}/status", response_model=InvoiceOut)` |
| 129 | `def set_status(` |
| 130 | `    invoice_id: int,` |
| 131 | `    payload: InvoiceStatusUpdate,` |
| 132 | `    request: Request,` |
| 133 | `    session: Session = Depends(get_session),` |
| 134 | `    user: User = Depends(require_roles(*_FINANCE)),` |
| 135 | `) -> InvoiceOut:` |
| 136 | `    invoice = svc.set_invoice_status(session, user, invoice_id, payload.status, client_ip(request))` |
| 137 | `    return _out(session, invoice)` |
| 138 | `` |
| 139 | `` |
| 140 | `@router.post("/invoices/{invoice_id}/mark-paid", response_model=InvoiceOut)` |
| 141 | `def mark_paid(` |
| 142 | `    invoice_id: int,` |
| 143 | `    payload: MarkPaid,` |
| 144 | `    request: Request,` |
| 145 | `    session: Session = Depends(get_session),` |
| 146 | `    user: User = Depends(require_roles(*_FINANCE)),` |
| 147 | `) -> InvoiceOut:` |
| 148 | `    invoice = svc.mark_invoice_paid(session, user, invoice_id, payload.method, client_ip(request))` |
| 149 | `    return _out(session, invoice)` |


## `backend/app/routers/leads.py`

- **Lines:** 114

- **Purpose:** HTTP router (thin): validates input, calls `services/`, maps to Pydantic responses. File `backend/app/routers/leads.py`.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `﻿from fastapi import APIRouter, Depends, Query, Request, status` |
| 2 | `from sqlalchemy.orm import Session` |
| 3 | `` |
| 4 | `from ..db import get_session` |
| 5 | `from ..enums import LeadStatus, Role` |
| 6 | `from ..models import User` |
| 7 | `from ..schemas import (` |
| 8 | `    LeadConverted,` |
| 9 | `    LeadNoteCreate,` |
| 10 | `    LeadNoteOut,` |
| 11 | `    LeadOut,` |
| 12 | `    LeadUpdate,` |
| 13 | `    Page,` |
| 14 | `    PageOut,` |
| 15 | `    PageSize,` |
| 16 | `    QuoteCreate,` |
| 17 | `    QuoteOut,` |
| 18 | `)` |
| 19 | `from ..security import client_ip, require_roles` |
| 20 | `from ..services import leads as svc` |
| 21 | `` |
| 22 | `# Paths are written in full so they match SRS 3.2 exactly (see DECISIONS).` |
| 23 | `router = APIRouter(prefix="/api/v1", tags=["leads"])` |
| 24 | `` |
| 25 | `_STAFF = (Role.OWNER, Role.MANAGER, Role.FRONT_DESK)` |
| 26 | `` |
| 27 | `` |
| 28 | `@router.get("/leads", response_model=PageOut)` |
| 29 | `def list_leads(` |
| 30 | `    lead_status: LeadStatus \| None = Query(default=None, alias="status"),` |
| 31 | `    assigned_to: int \| None = None,` |
| 32 | `    page: Page = 1,` |
| 33 | `    page_size: PageSize = 50,` |
| 34 | `    session: Session = Depends(get_session),` |
| 35 | `    user: User = Depends(require_roles(*_STAFF)),` |
| 36 | `) -> PageOut:` |
| 37 | `    rows, total = svc.list_leads(session, lead_status, assigned_to, page, page_size)` |
| 38 | `    return PageOut(` |
| 39 | `        items=[LeadOut.model_validate(row) for row in rows],` |
| 40 | `        total=total,` |
| 41 | `        page=page,` |
| 42 | `        page_size=page_size,` |
| 43 | `    )` |
| 44 | `` |
| 45 | `` |
| 46 | `@router.get("/leads/{lead_id}", response_model=LeadOut)` |
| 47 | `def get_lead(` |
| 48 | `    lead_id: int,` |
| 49 | `    session: Session = Depends(get_session),` |
| 50 | `    user: User = Depends(require_roles(*_STAFF)),` |
| 51 | `) -> LeadOut:` |
| 52 | `    return LeadOut.model_validate(svc.get_lead(session, lead_id))` |
| 53 | `` |
| 54 | `` |
| 55 | `@router.patch("/leads/{lead_id}", response_model=LeadOut)` |
| 56 | `def update_lead(` |
| 57 | `    lead_id: int,` |
| 58 | `    payload: LeadUpdate,` |
| 59 | `    request: Request,` |
| 60 | `    session: Session = Depends(get_session),` |
| 61 | `    user: User = Depends(require_roles(*_STAFF)),` |
| 62 | `) -> LeadOut:` |
| 63 | `    data = payload.model_dump(exclude_unset=True)` |
| 64 | `    return LeadOut.model_validate(svc.update_lead(session, user, lead_id, data, client_ip(request)))` |
| 65 | `` |
| 66 | `` |
| 67 | `@router.get("/leads/{lead_id}/notes", response_model=list[LeadNoteOut])` |
| 68 | `def list_notes(` |
| 69 | `    lead_id: int,` |
| 70 | `    session: Session = Depends(get_session),` |
| 71 | `    user: User = Depends(require_roles(*_STAFF)),` |
| 72 | `) -> list[LeadNoteOut]:` |
| 73 | `    return [LeadNoteOut.model_validate(note) for note in svc.list_notes(session, lead_id)]` |
| 74 | `` |
| 75 | `` |
| 76 | `@router.post("/leads/{lead_id}/notes", response_model=LeadNoteOut, status_code=status.HTTP_201_CR...` |
| 77 | `def add_note(` |
| 78 | `    lead_id: int,` |
| 79 | `    payload: LeadNoteCreate,` |
| 80 | `    session: Session = Depends(get_session),` |
| 81 | `    user: User = Depends(require_roles(*_STAFF)),` |
| 82 | `) -> LeadNoteOut:` |
| 83 | `    return LeadNoteOut.model_validate(svc.add_note(session, user, lead_id, payload.body))` |
| 84 | `` |
| 85 | `` |
| 86 | `@router.get("/leads/{lead_id}/quotes", response_model=list[QuoteOut])` |
| 87 | `def list_quotes(` |
| 88 | `    lead_id: int,` |
| 89 | `    session: Session = Depends(get_session),` |
| 90 | `    user: User = Depends(require_roles(*_STAFF)),` |
| 91 | `) -> list[QuoteOut]:` |
| 92 | `    return [QuoteOut.model_validate(quote) for quote in svc.list_quotes(session, lead_id)]` |
| 93 | `` |
| 94 | `` |
| 95 | `@router.post("/leads/{lead_id}/quotes", response_model=QuoteOut, status_code=status.HTTP_201_CREA...` |
| 96 | `def add_quote(` |
| 97 | `    lead_id: int,` |
| 98 | `    payload: QuoteCreate,` |
| 99 | `    request: Request,` |
| 100 | `    session: Session = Depends(get_session),` |
| 101 | `    user: User = Depends(require_roles(*_STAFF)),` |
| 102 | `) -> QuoteOut:` |
| 103 | `    quote = svc.add_quote(session, user, lead_id, payload.model_dump(), client_ip(request))` |
| 104 | `    return QuoteOut.model_validate(quote)` |
| 105 | `` |
| 106 | `` |
| 107 | `@router.post("/leads/{lead_id}/convert", response_model=LeadConverted)` |
| 108 | `def convert(` |
| 109 | `    lead_id: int,` |
| 110 | `    session: Session = Depends(get_session),` |
| 111 | `    user: User = Depends(require_roles(*_STAFF)),` |
| 112 | `) -> LeadConverted:` |
| 113 | `    """Returns a prefill; the lead only becomes WON once POST /members carries its id."""` |
| 114 | `    return LeadConverted.model_validate(svc.convert(session, user, lead_id))` |


## `backend/app/routers/members.py`

- **Lines:** 221

- **Purpose:** HTTP router (thin): validates input, calls `services/`, maps to Pydantic responses. File `backend/app/routers/members.py`.


### Structure outline


*(Could not parse Python: invalid non-printable character U+FEFF (<unknown>, line 1))*



## `backend/app/routers/notifications.py`

- **Lines:** 49

- **Purpose:** HTTP router (thin): validates input, calls `services/`, maps to Pydantic responses. File `backend/app/routers/notifications.py`.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `﻿from fastapi import APIRouter, Depends` |
| 2 | `from sqlalchemy.orm import Session` |
| 3 | `` |
| 4 | `from ..db import get_session` |
| 5 | `from ..enums import Role` |
| 6 | `from ..models import User` |
| 7 | `from ..schemas import NotificationOut, Page, PageOut, PageSize, UnreadCount` |
| 8 | `from ..security import require_roles` |
| 9 | `from ..services import leads as svc` |
| 10 | `` |
| 11 | `# Paths are written in full so they match SRS 3.2 exactly (see DECISIONS).` |
| 12 | `router = APIRouter(prefix="/api/v1", tags=["notifications"])` |
| 13 | `` |
| 14 | `_ALL = (Role.OWNER, Role.MANAGER, Role.FRONT_DESK, Role.BAR_STAFF, Role.MEMBER)` |
| 15 | `` |
| 16 | `` |
| 17 | `@router.get("/notifications", response_model=PageOut)` |
| 18 | `def list_notifications(` |
| 19 | `    unread_only: bool = False,` |
| 20 | `    page: Page = 1,` |
| 21 | `    page_size: PageSize = 50,` |
| 22 | `    session: Session = Depends(get_session),` |
| 23 | `    user: User = Depends(require_roles(*_ALL)),` |
| 24 | `) -> PageOut:` |
| 25 | `    """Own notifications only: those addressed to this user or to this user's role."""` |
| 26 | `    rows, total = svc.list_notifications(session, user, unread_only, page, page_size)` |
| 27 | `    return PageOut(` |
| 28 | `        items=[NotificationOut.model_validate(row) for row in rows],` |
| 29 | `        total=total,` |
| 30 | `        page=page,` |
| 31 | `        page_size=page_size,` |
| 32 | `    )` |
| 33 | `` |
| 34 | `` |
| 35 | `@router.get("/notifications/unread-count", response_model=UnreadCount)` |
| 36 | `def unread_count(` |
| 37 | `    session: Session = Depends(get_session),` |
| 38 | `    user: User = Depends(require_roles(*_ALL)),` |
| 39 | `) -> UnreadCount:` |
| 40 | `    return UnreadCount(unread=svc.unread_count(session, user))` |
| 41 | `` |
| 42 | `` |
| 43 | `@router.post("/notifications/{notification_id}/read", response_model=NotificationOut)` |
| 44 | `def mark_read(` |
| 45 | `    notification_id: int,` |
| 46 | `    session: Session = Depends(get_session),` |
| 47 | `    user: User = Depends(require_roles(*_ALL)),` |
| 48 | `) -> NotificationOut:` |
| 49 | `    return NotificationOut.model_validate(svc.mark_read(session, user, notification_id))` |


## `backend/app/routers/payments.py`

- **Lines:** 142

- **Purpose:** HTTP router (thin): validates input, calls `services/`, maps to Pydantic responses. File `backend/app/routers/payments.py`.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `from datetime import date` |
| 2 | `` |
| 3 | `from fastapi import APIRouter, Depends, Query, Request, Response` |
| 4 | `from sqlalchemy import func, select` |
| 5 | `from sqlalchemy.orm import Session` |
| 6 | `` |
| 7 | `from ..db import get_session` |
| 8 | `from ..enums import PaymentMethod, Role, SourceType` |
| 9 | `from ..models import AuditLog, User` |
| 10 | `from ..schemas import (` |
| 11 | `    AuditLogOut,` |
| 12 | `    Page,` |
| 13 | `    PageOut,` |
| 14 | `    PageSize,` |
| 15 | `    PaymentOut,` |
| 16 | `    RefundRequest,` |
| 17 | `    TaxSummary,` |
| 18 | `)` |
| 19 | `from ..security import client_ip, require_roles` |
| 20 | `from ..services import reports as svc` |
| 21 | `` |
| 22 | `# Paths are written in full so they match SRS 3.2 exactly (see DECISIONS).` |
| 23 | `router = APIRouter(prefix="/api/v1", tags=["payments"])` |
| 24 | `` |
| 25 | `_FINANCE = (Role.OWNER, Role.MANAGER)` |
| 26 | `` |
| 27 | `` |
| 28 | `@router.get("/payments", response_model=PageOut)` |
| 29 | `def list_payments(` |
| 30 | `    from_: date \| None = Query(default=None, alias="from"),` |
| 31 | `    to: date \| None = None,` |
| 32 | `    source_type: SourceType \| None = None,` |
| 33 | `    method: PaymentMethod \| None = None,` |
| 34 | `    page: Page = 1,` |
| 35 | `    page_size: PageSize = 50,` |
| 36 | `    session: Session = Depends(get_session),` |
| 37 | `    user: User = Depends(require_roles(*_FINANCE)),` |
| 38 | `) -> PageOut:` |
| 39 | `    rows, total = svc.list_payments(` |
| 40 | `        session, from_, to, source_type, method, page=page, page_size=page_size` |
| 41 | `    )` |
| 42 | `    return PageOut(` |
| 43 | `        items=[PaymentOut.model_validate(row) for row in rows],` |
| 44 | `        total=total,` |
| 45 | `        page=page,` |
| 46 | `        page_size=page_size,` |
| 47 | `    )` |
| 48 | `` |
| 49 | `` |
| 50 | `@router.get("/payments/mine", response_model=PageOut)` |
| 51 | `def my_payments(` |
| 52 | `    page: Page = 1,` |
| 53 | `    page_size: PageSize = 50,` |
| 54 | `    session: Session = Depends(get_session),` |
| 55 | `    user: User = Depends(require_roles(Role.MEMBER)),` |
| 56 | `) -> PageOut:` |
| 57 | `    member_id = svc.own_member_id(session, user)` |
| 58 | `    rows, total = svc.list_payments(` |
| 59 | `        session, member_id=member_id, page=page, page_size=page_size` |
| 60 | `    )` |
| 61 | `    return PageOut(` |
| 62 | `        items=[PaymentOut.model_validate(row) for row in rows],` |
| 63 | `        total=total,` |
| 64 | `        page=page,` |
| 65 | `        page_size=page_size,` |
| 66 | `    )` |
| 67 | `` |
| 68 | `` |
| 69 | `@router.post("/payments/{payment_id}/refund", response_model=PaymentOut)` |
| 70 | `def refund(` |
| 71 | `    payment_id: int,` |
| 72 | `    payload: RefundRequest,` |
| 73 | `    request: Request,` |
| 74 | `    session: Session = Depends(get_session),` |
| 75 | `    user: User = Depends(require_roles(*_FINANCE)),` |
| 76 | `) -> PaymentOut:` |
| 77 | `    payment = svc.refund(session, user, payment_id, payload.reason, client_ip(request))` |
| 78 | `    return PaymentOut.model_validate(payment)` |
| 79 | `` |
| 80 | `` |
| 81 | `@router.get("/reports/payments.csv")` |
| 82 | `def payments_csv(` |
| 83 | `    request: Request,` |
| 84 | `    from_: date \| None = Query(default=None, alias="from"),` |
| 85 | `    to: date \| None = None,` |
| 86 | `    session: Session = Depends(get_session),` |
| 87 | `    user: User = Depends(require_roles(*_FINANCE)),` |
| 88 | `) -> Response:` |
| 89 | `    body = svc.payments_csv(session, user, from_, to, client_ip(request))` |
| 90 | `    return Response(` |
| 91 | `        content=body,` |
| 92 | `        media_type="text/csv",` |
| 93 | `        headers={"Content-Disposition": 'attachment; filename="payments.csv"'},` |
| 94 | `    )` |
| 95 | `` |
| 96 | `` |
| 97 | `@router.get("/reports/tax-summary", response_model=TaxSummary)` |
| 98 | `def tax_summary(` |
| 99 | `    month: str,` |
| 100 | `    session: Session = Depends(get_session),` |
| 101 | `    user: User = Depends(require_roles(*_FINANCE)),` |
| 102 | `) -> TaxSummary:` |
| 103 | `    return TaxSummary.model_validate(svc.tax_summary(session, month))` |
| 104 | `` |
| 105 | `` |
| 106 | `@router.get("/audit-logs", response_model=PageOut)` |
| 107 | `def list_audit_logs(` |
| 108 | `    action: str \| None = None,` |
| 109 | `    entity: str \| None = None,` |
| 110 | `    actor_id: int \| None = None,` |
| 111 | `    page: Page = 1,` |
| 112 | `    page_size: PageSize = 50,` |
| 113 | `    session: Session = Depends(get_session),` |
| 114 | `    user: User = Depends(require_roles(Role.OWNER)),` |
| 115 | `) -> PageOut:` |
| 116 | `    """SRS 3.1 gives the audit trail to the OWNER alone, read-only. It is never written here."""` |
| 117 | `    filters = []` |
| 118 | `    if action is not None:` |
| 119 | `        filters.append(AuditLog.action == action)` |
| 120 | `    if entity is not None:` |
| 121 | `        filters.append(AuditLog.entity == entity)` |
| 122 | `    if actor_id is not None:` |
| 123 | `        filters.append(AuditLog.actor_id == actor_id)` |
| 124 | `` |
| 125 | `    total = session.execute(select(func.count(AuditLog.id)).where(*filters)).scalar_one()` |
| 126 | `    rows = (` |
| 127 | `        session.execute(` |
| 128 | `            select(AuditLog)` |
| 129 | `            .where(*filters)` |
| 130 | `            .order_by(AuditLog.id.desc())` |
| 131 | `            .offset((page - 1) * page_size)` |
| 132 | `            .limit(page_size)` |
| 133 | `        )` |
| 134 | `        .scalars()` |
| 135 | `        .all()` |
| 136 | `    )` |
| 137 | `    return PageOut(` |
| 138 | `        items=[AuditLogOut.model_validate(row) for row in rows],` |
| 139 | `        total=int(total),` |
| 140 | `        page=page,` |
| 141 | `        page_size=page_size,` |
| 142 | `    )` |


## `backend/app/routers/plans.py`

- **Lines:** 52

- **Purpose:** HTTP router (thin): validates input, calls `services/`, maps to Pydantic responses. File `backend/app/routers/plans.py`.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `﻿from fastapi import APIRouter, Depends, Request` |
| 2 | `from sqlalchemy.orm import Session` |
| 3 | `` |
| 4 | `from ..db import get_session` |
| 5 | `from ..enums import Role` |
| 6 | `from ..models import User` |
| 7 | `from ..schemas import CourtPriceIn, CourtPriceOut, PlanOut, PlanUpdate` |
| 8 | `from ..security import client_ip, get_current_user, require_roles` |
| 9 | `from ..services import membership as svc` |
| 10 | `` |
| 11 | `# Paths are written in full so they match SRS 3.2 exactly (see DECISIONS).` |
| 12 | `router = APIRouter(prefix="/api/v1", tags=["plans"])` |
| 13 | `` |
| 14 | `` |
| 15 | `@router.get("/plans", response_model=list[PlanOut])` |
| 16 | `def list_plans(session: Session = Depends(get_session)) -> list[PlanOut]:` |
| 17 | `    """(public) SRS 3.2.2."""` |
| 18 | `    return [PlanOut.model_validate(p) for p in svc.list_plans(session)]` |
| 19 | `` |
| 20 | `` |
| 21 | `@router.patch("/plans/{plan_id}", response_model=PlanOut)` |
| 22 | `def patch_plan(` |
| 23 | `    plan_id: int,` |
| 24 | `    payload: PlanUpdate,` |
| 25 | `    request: Request,` |
| 26 | `    session: Session = Depends(get_session),` |
| 27 | `    actor: User = Depends(require_roles(Role.OWNER, Role.MANAGER)),` |
| 28 | `) -> PlanOut:` |
| 29 | `    changes = payload.model_dump(exclude_unset=True)` |
| 30 | `    return PlanOut.model_validate(` |
| 31 | `        svc.update_plan(session, actor, plan_id, changes, client_ip(request))` |
| 32 | `    )` |
| 33 | `` |
| 34 | `` |
| 35 | `@router.get("/court-prices", response_model=list[CourtPriceOut])` |
| 36 | `def list_court_prices(session: Session = Depends(get_session)) -> list[CourtPriceOut]:` |
| 37 | `    """(public) SRS 3.2.2."""` |
| 38 | `    return [CourtPriceOut.model_validate(p) for p in svc.list_court_prices(session)]` |
| 39 | `` |
| 40 | `` |
| 41 | `@router.put("/court-prices", response_model=list[CourtPriceOut])` |
| 42 | `def put_court_prices(` |
| 43 | `    payload: list[CourtPriceIn],` |
| 44 | `    request: Request,` |
| 45 | `    session: Session = Depends(get_session),` |
| 46 | `    actor: User = Depends(require_roles(Role.OWNER, Role.MANAGER)),` |
| 47 | `) -> list[CourtPriceOut]:` |
| 48 | `    rows = [item.model_dump() for item in payload]` |
| 49 | `    return [` |
| 50 | `        CourtPriceOut.model_validate(p)` |
| 51 | `        for p in svc.upsert_court_prices(session, actor, rows, client_ip(request))` |
| 52 | `    ]` |


## `backend/app/routers/public.py`

- **Lines:** 57

- **Purpose:** HTTP router (thin): validates input, calls `services/`, maps to Pydantic responses. File `backend/app/routers/public.py`.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `﻿from datetime import date` |
| 2 | `` |
| 3 | `from fastapi import APIRouter, Depends, Query, Request` |
| 4 | `from sqlalchemy.orm import Session` |
| 5 | `` |
| 6 | `from ..db import get_session` |
| 7 | `from ..enums import ProductCategory, Sport` |
| 8 | `from ..schemas import EnquiryAccepted, EnquiryCreate, PublicAvailabilityOut, PublicProductOut` |
| 9 | `from ..security import client_ip, limiter` |
| 10 | `from ..services import booking as svc` |
| 11 | `from ..services import leads as leads_svc` |
| 12 | `from ..services import shop as shop_svc` |
| 13 | `` |
| 14 | `# Paths are written in full so they match SRS 3.2 exactly (see DECISIONS).` |
| 15 | `router = APIRouter(prefix="/api/v1", tags=["public"])` |
| 16 | `` |
| 17 | `` |
| 18 | `@router.get("/public/availability", response_model=PublicAvailabilityOut)` |
| 19 | `@limiter.limit("30/minute")` |
| 20 | `def public_availability(` |
| 21 | `    request: Request,` |
| 22 | `    from_: date = Query(alias="from"),` |
| 23 | `    days: int = Query(default=7, ge=1, le=7),` |
| 24 | `    sport: Sport \| None = None,` |
| 25 | `    session: Session = Depends(get_session),` |
| 26 | `) -> PublicAvailabilityOut:` |
| 27 | `    """Anonymous grid. FREE / BUSY only — never a name, a phone or a price (S-13)."""` |
| 28 | `    return PublicAvailabilityOut.model_validate(` |
| 29 | `        svc.public_availability(session, from_, days, sport)` |
| 30 | `    )` |
| 31 | `` |
| 32 | `` |
| 33 | `@router.get("/public/products", response_model=list[PublicProductOut])` |
| 34 | `@limiter.limit("30/minute")` |
| 35 | `def public_products(` |
| 36 | `    request: Request,` |
| 37 | `    category: ProductCategory \| None = None,` |
| 38 | `    session: Session = Depends(get_session),` |
| 39 | `) -> list[PublicProductOut]:` |
| 40 | `    """`in_stock` is a boolean on purpose: the exact quantity is never public (SRS 3.2.7)."""` |
| 41 | `    return [` |
| 42 | `        PublicProductOut.model_validate(product)` |
| 43 | `        for product in shop_svc.public_products(session, category)` |
| 44 | `    ]` |
| 45 | `` |
| 46 | `` |
| 47 | `@router.post("/public/enquiries", response_model=EnquiryAccepted, status_code=201)` |
| 48 | `@limiter.limit("30/minute")` |
| 49 | `def create_enquiry(` |
| 50 | `    request: Request,` |
| 51 | `    payload: EnquiryCreate,` |
| 52 | `    session: Session = Depends(get_session),` |
| 53 | `) -> EnquiryAccepted:` |
| 54 | `    """Honeypot first: a filled `website` gets the same 201 and is never stored (S-17)."""` |
| 55 | `    return EnquiryAccepted.model_validate(` |
| 56 | `        leads_svc.record_enquiry(session, payload.model_dump(), client_ip(request))` |
| 57 | `    )` |


## `backend/app/routers/shop.py`

- **Lines:** 189

- **Purpose:** HTTP router (thin): validates input, calls `services/`, maps to Pydantic responses. File `backend/app/routers/shop.py`.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `from fastapi import APIRouter, Depends, Query, Request, status` |
| 2 | `from sqlalchemy.orm import Session` |
| 3 | `` |
| 4 | `from ..db import get_session` |
| 5 | `from ..enums import ProductCategory, Role, ShopOrderStatus` |
| 6 | `from ..models import User` |
| 7 | `from ..schemas import (` |
| 8 | `    OrderCancel,` |
| 9 | `    OrderLineOut,` |
| 10 | `    OrderPay,` |
| 11 | `    Page,` |
| 12 | `    PageOut,` |
| 13 | `    PageSize,` |
| 14 | `    ProductCreate,` |
| 15 | `    ProductOut,` |
| 16 | `    ProductUpdate,` |
| 17 | `    RestockRequest,` |
| 18 | `    ShopOrderCancelled,` |
| 19 | `    ShopOrderCreate,` |
| 20 | `    ShopOrderOut,` |
| 21 | `    ShopOrderStatusUpdate,` |
| 22 | `)` |
| 23 | `from ..security import client_ip, require_roles` |
| 24 | `from ..services import shop as svc` |
| 25 | `` |
| 26 | `# Paths are written in full so they match SRS 3.2 exactly (see DECISIONS).` |
| 27 | `router = APIRouter(prefix="/api/v1", tags=["shop"])` |
| 28 | `` |
| 29 | `_STAFF = (Role.OWNER, Role.MANAGER, Role.FRONT_DESK)` |
| 30 | `_ADMIN = (Role.OWNER, Role.MANAGER)` |
| 31 | `_BUYERS = (Role.OWNER, Role.MANAGER, Role.FRONT_DESK, Role.MEMBER)` |
| 32 | `` |
| 33 | `` |
| 34 | `# ------------------------------------------------------------------------------ products` |
| 35 | `` |
| 36 | `` |
| 37 | `@router.get("/products", response_model=list[ProductOut])` |
| 38 | `def list_products(` |
| 39 | `    category: ProductCategory \| None = None,` |
| 40 | `    q: str \| None = None,` |
| 41 | `    include_inactive: bool = False,` |
| 42 | `    session: Session = Depends(get_session),` |
| 43 | `    user: User = Depends(require_roles(*_STAFF)),` |
| 44 | `) -> list[ProductOut]:` |
| 45 | `    products = svc.list_products(session, category, q, active_only=not include_inactive)` |
| 46 | `    return [ProductOut.model_validate(product) for product in products]` |
| 47 | `` |
| 48 | `` |
| 49 | `@router.get("/products/low-stock", response_model=list[ProductOut])` |
| 50 | `def low_stock(` |
| 51 | `    session: Session = Depends(get_session),` |
| 52 | `    user: User = Depends(require_roles(*_STAFF)),` |
| 53 | `) -> list[ProductOut]:` |
| 54 | `    return [ProductOut.model_validate(product) for product in svc.low_stock(session)]` |
| 55 | `` |
| 56 | `` |
| 57 | `@router.post("/products", response_model=ProductOut, status_code=status.HTTP_201_CREATED)` |
| 58 | `def create_product(` |
| 59 | `    payload: ProductCreate,` |
| 60 | `    request: Request,` |
| 61 | `    session: Session = Depends(get_session),` |
| 62 | `    user: User = Depends(require_roles(*_ADMIN)),` |
| 63 | `) -> ProductOut:` |
| 64 | `    product = svc.create_product(session, user, payload.model_dump(), client_ip(request))` |
| 65 | `    return ProductOut.model_validate(product)` |
| 66 | `` |
| 67 | `` |
| 68 | `@router.get("/products/{product_id}", response_model=ProductOut)` |
| 69 | `def get_product(` |
| 70 | `    product_id: int,` |
| 71 | `    session: Session = Depends(get_session),` |
| 72 | `    user: User = Depends(require_roles(*_STAFF)),` |
| 73 | `) -> ProductOut:` |
| 74 | `    return ProductOut.model_validate(svc.get_product(session, product_id))` |
| 75 | `` |
| 76 | `` |
| 77 | `@router.patch("/products/{product_id}", response_model=ProductOut)` |
| 78 | `def update_product(` |
| 79 | `    product_id: int,` |
| 80 | `    payload: ProductUpdate,` |
| 81 | `    request: Request,` |
| 82 | `    session: Session = Depends(get_session),` |
| 83 | `    user: User = Depends(require_roles(*_ADMIN)),` |
| 84 | `) -> ProductOut:` |
| 85 | `    data = payload.model_dump(exclude_unset=True)` |
| 86 | `    return ProductOut.model_validate(` |
| 87 | `        svc.update_product(session, user, product_id, data, client_ip(request))` |
| 88 | `    )` |
| 89 | `` |
| 90 | `` |
| 91 | `@router.post("/products/{product_id}/restock", response_model=ProductOut)` |
| 92 | `def restock(` |
| 93 | `    product_id: int,` |
| 94 | `    payload: RestockRequest,` |
| 95 | `    request: Request,` |
| 96 | `    session: Session = Depends(get_session),` |
| 97 | `    user: User = Depends(require_roles(*_ADMIN)),` |
| 98 | `) -> ProductOut:` |
| 99 | `    product = svc.restock(` |
| 100 | `        session, user, product_id, payload.qty, payload.note, client_ip(request)` |
| 101 | `    )` |
| 102 | `    return ProductOut.model_validate(product)` |
| 103 | `` |
| 104 | `` |
| 105 | `# -------------------------------------------------------------------------------- orders` |
| 106 | `` |
| 107 | `` |
| 108 | `def _out(session: Session, order) -> ShopOrderOut:` |
| 109 | `    body = ShopOrderOut.model_validate(order)` |
| 110 | `    body.items = [OrderLineOut(**line) for line in svc.order_items(session, order.id)]` |
| 111 | `    return body` |
| 112 | `` |
| 113 | `` |
| 114 | `@router.post("/shop/orders", response_model=ShopOrderOut, status_code=status.HTTP_201_CREATED)` |
| 115 | `def create_order(` |
| 116 | `    payload: ShopOrderCreate,` |
| 117 | `    request: Request,` |
| 118 | `    session: Session = Depends(get_session),` |
| 119 | `    user: User = Depends(require_roles(*_BUYERS)),` |
| 120 | `) -> ShopOrderOut:` |
| 121 | `    data = payload.model_dump()` |
| 122 | `    data["items"] = [dict(item) for item in data["items"]]` |
| 123 | `    return _out(session, svc.create_order(session, user, data, client_ip(request)))` |
| 124 | `` |
| 125 | `` |
| 126 | `@router.get("/shop/orders", response_model=PageOut)` |
| 127 | `def list_orders(` |
| 128 | `    order_status: ShopOrderStatus \| None = Query(default=None, alias="status"),` |
| 129 | `    member_id: int \| None = None,` |
| 130 | `    page: Page = 1,` |
| 131 | `    page_size: PageSize = 50,` |
| 132 | `    session: Session = Depends(get_session),` |
| 133 | `    user: User = Depends(require_roles(*_BUYERS)),` |
| 134 | `) -> PageOut:` |
| 135 | `    rows, total = svc.list_orders(session, user, order_status, member_id, page, page_size)` |
| 136 | `    return PageOut(` |
| 137 | `        items=[_out(session, row) for row in rows],` |
| 138 | `        total=total,` |
| 139 | `        page=page,` |
| 140 | `        page_size=page_size,` |
| 141 | `    )` |
| 142 | `` |
| 143 | `` |
| 144 | `@router.get("/shop/orders/{order_id}", response_model=ShopOrderOut)` |
| 145 | `def get_order(` |
| 146 | `    order_id: int,` |
| 147 | `    session: Session = Depends(get_session),` |
| 148 | `    user: User = Depends(require_roles(*_BUYERS)),` |
| 149 | `) -> ShopOrderOut:` |
| 150 | `    return _out(session, svc.get_order(session, order_id, user))` |
| 151 | `` |
| 152 | `` |
| 153 | `@router.post("/shop/orders/{order_id}/status", response_model=ShopOrderOut)` |
| 154 | `def set_status(` |
| 155 | `    order_id: int,` |
| 156 | `    payload: ShopOrderStatusUpdate,` |
| 157 | `    session: Session = Depends(get_session),` |
| 158 | `    user: User = Depends(require_roles(*_STAFF)),` |
| 159 | `) -> ShopOrderOut:` |
| 160 | `    return _out(session, svc.set_status(session, user, order_id, payload.status))` |
| 161 | `` |
| 162 | `` |
| 163 | `@router.post("/shop/orders/{order_id}/pay", response_model=ShopOrderOut)` |
| 164 | `def pay_order(` |
| 165 | `    order_id: int,` |
| 166 | `    payload: OrderPay,` |
| 167 | `    session: Session = Depends(get_session),` |
| 168 | `    user: User = Depends(require_roles(*_STAFF)),` |
| 169 | `) -> ShopOrderOut:` |
| 170 | `    return _out(session, svc.pay_order(session, user, order_id, payload.payment_method))` |
| 171 | `` |
| 172 | `` |
| 173 | `@router.post("/shop/orders/{order_id}/cancel", response_model=ShopOrderCancelled)` |
| 174 | `def cancel_order(` |
| 175 | `    order_id: int,` |
| 176 | `    payload: OrderCancel,` |
| 177 | `    request: Request,` |
| 178 | `    session: Session = Depends(get_session),` |
| 179 | `    user: User = Depends(require_roles(*_BUYERS)),` |
| 180 | `) -> ShopOrderCancelled:` |
| 181 | `    order, refunded, refund_paise = svc.cancel_order(` |
| 182 | `        session, user, order_id, payload.reason, client_ip(request)` |
| 183 | `    )` |
| 184 | `    return ShopOrderCancelled(` |
| 185 | `        id=order.id,` |
| 186 | `        status=ShopOrderStatus(order.status),` |
| 187 | `        refunded=refunded,` |
| 188 | `        refund_paise=refund_paise,` |
| 189 | `    )` |


## `backend/app/routers/social.py`

- **Lines:** 114

- **Purpose:** HTTP router (thin): validates input, calls `services/`, maps to Pydantic responses. File `backend/app/routers/social.py`.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `﻿from datetime import date` |
| 2 | `` |
| 3 | `from fastapi import APIRouter, Depends, Query, Request, status` |
| 4 | `from sqlalchemy.orm import Session` |
| 5 | `` |
| 6 | `from ..db import get_session` |
| 7 | `from ..enums import Role` |
| 8 | `from ..models import User` |
| 9 | `from ..schemas import (` |
| 10 | `    SocialJoin,` |
| 11 | `    SocialLeave,` |
| 12 | `    SocialParticipantOut,` |
| 13 | `    SocialSessionCreate,` |
| 14 | `    SocialSessionOut,` |
| 15 | `)` |
| 16 | `from ..security import client_ip, require_roles` |
| 17 | `from ..services import social as svc` |
| 18 | `` |
| 19 | `# Paths are written in full so they match SRS 3.2 exactly (see DECISIONS).` |
| 20 | `router = APIRouter(prefix="/api/v1", tags=["social"])` |
| 21 | `` |
| 22 | `_ADMIN = (Role.OWNER, Role.MANAGER)` |
| 23 | `_STAFF = (Role.OWNER, Role.MANAGER, Role.FRONT_DESK)` |
| 24 | `_ALL = (Role.OWNER, Role.MANAGER, Role.FRONT_DESK, Role.BAR_STAFF, Role.MEMBER)` |
| 25 | `` |
| 26 | `` |
| 27 | `def _out(social, joined: int) -> SocialSessionOut:` |
| 28 | `    return SocialSessionOut(` |
| 29 | `        id=social.id,` |
| 30 | `        court_id=social.court_id,` |
| 31 | `        title=social.title,` |
| 32 | `        start_at=social.start_at,` |
| 33 | `        end_at=social.end_at,` |
| 34 | `        capacity=social.capacity,` |
| 35 | `        joined_count=joined,` |
| 36 | `        fee_paise=int(social.fee_paise),` |
| 37 | `        status=social.status,` |
| 38 | `    )` |
| 39 | `` |
| 40 | `` |
| 41 | `@router.get("/social-sessions", response_model=list[SocialSessionOut])` |
| 42 | `def list_sessions(` |
| 43 | `    from_: date \| None = Query(default=None, alias="from"),` |
| 44 | `    to: date \| None = None,` |
| 45 | `    session: Session = Depends(get_session),` |
| 46 | `    user: User = Depends(require_roles(*_ALL)),` |
| 47 | `) -> list[SocialSessionOut]:` |
| 48 | `    return [_out(social, joined) for social, joined in svc.list_sessions(session, from_, to)]` |
| 49 | `` |
| 50 | `` |
| 51 | `@router.post("/social-sessions", response_model=SocialSessionOut, status_code=status.HTTP_201_CRE...` |
| 52 | `def create_session(` |
| 53 | `    payload: SocialSessionCreate,` |
| 54 | `    request: Request,` |
| 55 | `    session: Session = Depends(get_session),` |
| 56 | `    user: User = Depends(require_roles(*_ADMIN)),` |
| 57 | `) -> SocialSessionOut:` |
| 58 | `    social = svc.create_session(session, user, payload.model_dump(), client_ip(request))` |
| 59 | `    return _out(social, 0)` |
| 60 | `` |
| 61 | `` |
| 62 | `@router.get("/social-sessions/{session_id}", response_model=SocialSessionOut)` |
| 63 | `def get_session_row(` |
| 64 | `    session_id: int,` |
| 65 | `    session: Session = Depends(get_session),` |
| 66 | `    user: User = Depends(require_roles(*_ALL)),` |
| 67 | `) -> SocialSessionOut:` |
| 68 | `    social = svc.get_session_row(session, session_id)` |
| 69 | `    return _out(social, svc.joined_count(session, social.id))` |
| 70 | `` |
| 71 | `` |
| 72 | `@router.get("/social-sessions/{session_id}/participants", response_model=list[SocialParticipantOut])` |
| 73 | `def participants(` |
| 74 | `    session_id: int,` |
| 75 | `    session: Session = Depends(get_session),` |
| 76 | `    user: User = Depends(require_roles(*_STAFF)),` |
| 77 | `) -> list[SocialParticipantOut]:` |
| 78 | `    """Staff only: the roster names other members (SRS 3.2.6, S-15)."""` |
| 79 | `    return [SocialParticipantOut.model_validate(row) for row in svc.participants(session, session...` |
| 80 | `` |
| 81 | `` |
| 82 | `@router.post("/social-sessions/{session_id}/join", response_model=SocialParticipantOut, status_co...` |
| 83 | `def join(` |
| 84 | `    session_id: int,` |
| 85 | `    payload: SocialJoin,` |
| 86 | `    request: Request,` |
| 87 | `    session: Session = Depends(get_session),` |
| 88 | `    user: User = Depends(require_roles(*_STAFF, Role.MEMBER)),` |
| 89 | `) -> SocialParticipantOut:` |
| 90 | `    participant = svc.join(` |
| 91 | `        session, user, session_id, payload.member_id, payload.guest_name, client_ip(request)` |
| 92 | `    )` |
| 93 | `    return SocialParticipantOut.model_validate(participant)` |
| 94 | `` |
| 95 | `` |
| 96 | `@router.post("/social-sessions/{session_id}/leave", status_code=status.HTTP_204_NO_CONTENT)` |
| 97 | `def leave(` |
| 98 | `    session_id: int,` |
| 99 | `    payload: SocialLeave,` |
| 100 | `    session: Session = Depends(get_session),` |
| 101 | `    user: User = Depends(require_roles(*_STAFF, Role.MEMBER)),` |
| 102 | `) -> None:` |
| 103 | `    svc.leave(session, user, session_id, payload.member_id)` |
| 104 | `` |
| 105 | `` |
| 106 | `@router.delete("/social-sessions/{session_id}", response_model=SocialSessionOut)` |
| 107 | `def cancel_session(` |
| 108 | `    session_id: int,` |
| 109 | `    request: Request,` |
| 110 | `    session: Session = Depends(get_session),` |
| 111 | `    user: User = Depends(require_roles(*_ADMIN)),` |
| 112 | `) -> SocialSessionOut:` |
| 113 | `    social = svc.cancel_session(session, user, session_id, client_ip(request))` |
| 114 | `    return _out(social, 0)` |


## `backend/app/schemas.py`

- **Lines:** 1062

- **Purpose:** Pydantic v2 request/response DTOs with extra=forbid on bodies.


### Structure outline


- `class _Request` — lines **62–63**
- `class LoginRequest` — lines **66–68**
- `class UserCreate` — lines **71–82**
- `class UserUpdate` — lines **85–94**
- `class UserSummary` — lines **97–106**: The `user` object embedded in the login response (SRS 3.2.1).
- `class UserOut` — lines **109–116**
- `class TokenResponse` — lines **119–123**
- `class PageOut` — lines **132–136**
- `class PlanOut` — lines **142–154**
- `class PlanUpdate` — lines **157–165**
- `class CourtPriceOut` — lines **168–173**
- `class CourtPriceIn` — lines **176–179**
- `class MemberCreate` — lines **187–196**
- `class MemberUpdate` — lines **199–205**
- `class MemberRenew` — lines **208–210**
- `class MembershipOut` — lines **213–218**
- `class MemberOut` — lines **221–233**: Full profile. BAR_STAFF gets MemberBrief instead (SRS 3.1).
- `class MemberBrief` — lines **236–242**: What BAR_STAFF may see: name, plan and code only (SRS 3.1).
- `class MemberCreated` — lines **245–250**
- `class HistoryEvent` — lines **253–258**
- `class CourtOut` — lines **264–270**
- `class CourtCreate` — lines **273–275**
- `class CourtUpdate` — lines **278–283**
- `class SlotOut` — lines **286–290**
- `class CourtSlotsOut` — lines **293–297**
- `class AvailabilityOut` — lines **300–303**
- `class PublicSlotOut` — lines **306–308**
- `class PublicCourtOut` — lines **311–315**
- `class PublicDayOut` — lines **318–320**
- `class PublicAvailabilityOut` — lines **323–325**
- `class BookingCreate` — lines **331–340**
- `class BookingCancel` — lines **343–347**
- `class BookingStatusUpdate` — lines **350–351**
- `class BookingPay` — lines **354–355**
- `class BookingOut` — lines **358–373**
- `class BookingCancelled` — lines **376–380**
- `class ProductOut` — lines **386–398**
- `class PublicProductOut` — lines **401–407**
- `class ProductCreate` — lines **410–418**
- `class ProductUpdate` — lines **421–430**
- `class RestockRequest` — lines **433–435**
- `class OrderLineIn` — lines **438–440**
- `class OrderLineOut` — lines **443–448**
- `class ShopOrderCreate` — lines **451–460**
- `class ShopOrderStatusUpdate` — lines **463–464**
- `class OrderPay` — lines **467–468**
- `class OrderCancel` — lines **471–472**
- `class ShopOrderOut` — lines **475–490**
- `class ShopOrderCancelled` — lines **493–497**
- `class MenuItemOut` — lines **503–510**
- `class MenuItemCreate` — lines **513–517**
- `class MenuItemUpdate` — lines **520–526**
- `class BarTableOut` — lines **529–534**
- `class BarTableCreate` — lines **537–539**
- `class BarTableUpdate` — lines **542–546**
- `class BarLineIn` — lines **549–552**
- `class BarLineOut` — lines **555–561**
- `class BarOrderCreate` — lines **564–570**
- `class BarItemsAdd` — lines **573–574**
- `class KitchenStatusUpdate` — lines **577–578**
- `class BarPay` — lines **581–582**
- `class TabSettle` — lines **585–588**
- `class BarOrderOut` — lines **591–606**
- `class StaffRevenue` — lines **609–612**
- `class BarDailyReport` — lines **615–622**
- `class PaymentOut` — lines **628–641**
- `class RefundRequest` — lines **644–645**
- `class RevenueBreakdown` — lines **648–651**
- `class Receivables` — lines **654–656**
- `class Payables` — lines **659–661**
- `class BookingStats` — lines **664–666**
- `class MemberStats` — lines **669–671**
- `class LeadStats` — lines **674–675**
- `class LowStockRow` — lines **678–682**
- `class DashboardSummary` — lines **685–697**
- `class RevenueDay` — lines **700–703**
- `class RevenueSeries` — lines **706–708**
- `class TaxSummary` — lines **711–715**
- `class EnquiryCreate` — lines **721–729**
- `class EnquiryAccepted` — lines **732–736**: Deliberately tiny: a public caller learns nothing but that we got it (S-15).
- `class LeadOut` — lines **739–751**
- `class LeadUpdate` — lines **754–756**
- `class LeadNoteCreate` — lines **759–760**
- `class LeadNoteOut` — lines **763–770**
- `class QuoteCreate` — lines **773–776**
- `class QuoteOut` — lines **779–787**
- `class MemberPrefill` — lines **790–795**
- `class LeadConverted` — lines **798–800**
- `class NotificationOut` — lines **803–812**
- `class UnreadCount` — lines **815–816**
- `class SocialSessionCreate` — lines **822–828**
- `class SocialJoin` — lines **831–835**
- `class SocialLeave` — lines **838–839**
- `class SocialSessionOut` — lines **842–851**
- `class SocialParticipantOut` — lines **854–862**
- `class ClientOut` — lines **868–876**
- `class ClientCreate` — lines **879–886**
- `class ClientUpdate` — lines **889–896**
- `class InvoiceLineIn` — lines **899–902**
- `class InvoiceLineOut` — lines **905–912**
- `class InvoiceCreate` — lines **915–922**
- `class InvoiceStatusUpdate` — lines **925–926**
- `class MarkPaid` — lines **929–930**
- `class InvoiceOut` — lines **933–948**
- `class ExpenseCreate` — lines **951–956**
- `class ExpenseOut` — lines **959–969**
- `class EmployeeCreate` — lines **975–980**
- `class EmployeeOut` — lines **983–991**
- `class ShiftCreate` — lines **994–999**
- `class ShiftOut` — lines **1002–1010**
- `class LeaveRequestCreate` — lines **1013–1017**
- `class LeaveDecision` — lines **1020–1021**
- `class LeaveRequestOut` — lines **1024–1033**
- `class PayrollRun` — lines **1036–1037**
- `class PayrollOut` — lines **1040–1049**
- `class AuditLogOut` — lines **1052–1062**



## `backend/app/security.py`

- **Lines:** 366

- **Purpose:** Passwords, JWT, RBAC deps, login/refresh, rate limiter.


### Structure outline


- constant `JWT_ALGORITHM` — line **32**
- constant `LOCKOUT_THRESHOLD` — line **33**
- constant `LOCKOUT_MINUTES` — line **34**
- constant `REFRESH_TOKEN_DAYS` — line **35**
- constant `REFRESH_COOKIE_NAME` — line **36**
- constant `REFRESH_COOKIE_PATH` — line **37**
- `class AppError` — lines **47–61**: Raised anywhere; rendered as the SRS 6 envelope by the handlers in main.py.
- `def utcnow` — lines **64–65**
- constant `_PASSWORD_CLASSES` — line **71**
- `def validate_password_policy` — lines **78–89**: S-01: min 10 chars, upper, lower and digit.
- `def hash_password` — lines **92–93**
- `def verify_password` — lines **96–100**
- `def create_access_token` — lines **106–113**
- `def decode_access_token` — lines **116–122**
- `def get_current_user` — lines **125–139**
- `def current_member_id` — lines **142–148**: The members row linked to this user, if any (SRS 10: members.user_id UNIQUE).
- `def assert_member_access` — lines **151–156**: S-04 IDOR guard. A MEMBER reaching another member's row gets 404, not 403.
- `def require_roles` — lines **159–168**: S-03: RBAC dependency used on every non-public endpoint.
- `def authenticate` — lines **174–206**: S-05 lockout. The lock is checked before the password is ever verified.
- `def _hash_refresh_token` — lines **212–213**
- `def issue_refresh_token` — lines **216–227**: S-02: only the SHA-256 hex of the token is stored.
- `def rotate_refresh_token` — lines **230–256**
- `def revoke_refresh_token` — lines **259–268**: Idempotent: an unknown or already-revoked token is not an error.
- `def revoke_user_refresh_tokens` — lines **271–276**
- `def set_refresh_cookie` — lines **279–288**
- `def clear_refresh_cookie` — lines **291–298**
- `def client_ip` — lines **304–305**
- `def create_staff_user` — lines **308–336**
- `def update_user` — lines **339–366**



## `backend/app/services/__init__.py`

- **Lines:** 0

- **Purpose:** Business logic layer: SQLAlchemy queries, transactions, domain rules. File `backend/app/services/__init__.py`.


### Line-by-line


| Ln | Code |
|----|------|


## `backend/app/services/bar.py`

- **Lines:** 518

- **Purpose:** Business logic layer: SQLAlchemy queries, transactions, domain rules. File `backend/app/services/bar.py`.


### Structure outline


- constant `MAX_LINE_QTY` — line **37**
- constant `_KITCHEN_ORDER` — line **40**
- `def list_menu_items` — lines **51–61**
- `def create_menu_item` — lines **64–71**
- `def update_menu_item` — lines **74–85**
- `def list_tables` — lines **91–121**: Each table with the running total of its open (unpaid, uncancelled) order, or null.
- `def create_table` — lines **124–136**
- `def update_table` — lines **139–150**
- `def _price_lines` — lines **156–176**
- `def _retotal` — lines **179–196**: Recomputed from the stored line snapshots, so adding items stays consistent.
- `def create_order` — lines **199–221**
- `def _add_lines` — lines **224–236**
- `def add_items` — lines **239–250**
- `def get_order` — lines **253–263**
- `def order_items` — lines **266–283**
- `def list_orders` — lines **286–323**
- `def set_kitchen_status` — lines **326–346**
- `def pay_order` — lines **349–378**: Row-locked so two staff cannot both write a payment (SRS 8 Bar).
- `def open_tab` — lines **381–391**: A tab is money owed by a known member, so a guest can never open one.
- `def settle_tabs` — lines **394–459**: All or nothing (T-12): one bad id and not a single payment row is written.
- `def daily_report` — lines **465–514**: Revenue is read from the payments ledger, never from the order rows (SRS 4.7).
- `def today` — lines **517–518**



## `backend/app/services/billing.py`

- **Lines:** 329

- **Purpose:** Business logic layer: SQLAlchemy queries, transactions, domain rules. File `backend/app/services/billing.py`.


### Structure outline


- constant `INVOICE_DUE_DAYS` — line **27**
- `def list_clients` — lines **33–34**
- `def get_client` — lines **37–41**
- `def create_client` — lines **44–51**
- `def update_client` — lines **54–63**
- `def next_invoice_number` — lines **69–76**: INV-YYYY-NNNN, restarting each calendar year. UNIQUE(number) is the real guard.
- `def create_invoice` — lines **79–126**
- `def get_invoice` — lines **129–133**
- `def invoice_lines` — lines **136–143**
- `def list_invoices` — lines **146–174**
- `def set_invoice_status` — lines **177–196**
- `def mark_invoice_paid` — lines **199–227**: Row-locked so two clerks produce exactly one payment row.
- `def invoice_html` — lines **230–264**: Server-rendered and fully escaped; no user text ever reaches the page unescaped (S-16).
- `def _rupees` — lines **267–268**
- `def list_expenses` — lines **274–296**
- `def create_expense` — lines **299–306**
- `def get_expense` — lines **309–313**
- `def mark_expense_paid` — lines **316–329**: Expenses are money out, so no `payments` row is written — that table is revenue only.



## `backend/app/services/booking.py`

- **Lines:** 527

- **Purpose:** Business logic layer: SQLAlchemy queries, transactions, domain rules. File `backend/app/services/booking.py`.


### Structure outline


- constant `SLOT_MINUTES` — line **33**
- constant `BOOKING_MINUTES` — line **34**
- constant `OPEN_TIME` — line **35**
- constant `LAST_START_TIME` — line **36**
- constant `REFUND_WINDOW` — line **37**
- constant `_COUNTED_STATUSES` — line **39**
- `def validate_start` — lines **45–61**: Off-grid, outside club hours, in the past, or too far ahead are all INVALID_SLOT.
- `def _court` — lines **64–68**
- `def _slot_starts` — lines **71–72**
- `def _assert_daily_limit` — lines **78–96**: Locks the member row first so two concurrent requests cannot both see count = 1.
- `def create_booking` — lines **99–176**: One transaction: limit check, booking row, two slot rows, optional payment.
- `def _own_member_id` — lines **179–185**
- `def get_booking` — lines **191–197**
- `def list_bookings` — lines **200–236**
- `def cancel_booking` — lines **242–293**: Returns (booking, refunded, refund_paise). Slots are freed either way (SRS 4.3).
- `def set_status` — lines **296–308**
- `def pay_booking` — lines **311–329**
- `def _grid` — lines **335–343**: Bookable start times for one IST day, 06:00 to 21:00 inclusive.
- `def _occupancy` — lines **346–363**: One query for the whole grid: which slots are held, and by a booking or a session.
- `def _courts` — lines **366–372**
- `def availability` — lines **375–418**: Full detail for logged-in users. Prices are for the requester's tier (SRS 3.2.4).
- `def public_availability` — lines **421–451**: FREE / BUSY only. No member names, no phones, no prices (SRS 3.2.4, S-13).
- `def list_courts` — lines **457–465**
- `def create_court` — lines **468–480**
- `def update_court` — lines **483–516**
- `def social_window` — lines **519–527**: Used by the availability grid's SOCIAL state; social CRUD itself is Stage 8.



## `backend/app/services/hr.py`

- **Lines:** 280

- **Purpose:** Business logic layer: SQLAlchemy queries, transactions, domain rules. File `backend/app/services/hr.py`.


### Structure outline


- `def list_employees` — lines **24–28**
- `def get_employee` — lines **31–35**
- `def create_employee` — lines **38–51**
- `def own_employee_id` — lines **54–57**
- `def list_shifts` — lines **63–79**: `week` is any date inside the week; the roster runs Monday to Sunday.
- `def create_shift` — lines **82–93**
- `def list_leave_requests` — lines **99–113**
- `def create_leave_request` — lines **116–159**: Staff raise their own; a manager may raise one on someone's behalf.
- `def decide_leave` — lines **162–180**
- `def _valid_month` — lines **186–192**
- `def list_payroll` — lines **195–203**
- `def run_payroll` — lines **206–240**: Idempotent: UNIQUE(month, employee_id) means a second run adds only new employees.
- `def mark_payroll_paid` — lines **243–270**
- `def payroll_totals` — lines **273–280**



## `backend/app/services/leads.py`

- **Lines:** 282

- **Purpose:** Business logic layer: SQLAlchemy queries, transactions, domain rules. File `backend/app/services/leads.py`.


### Structure outline


- constant `_NEXT_STATUS` — line **20**
- `def sanitise` — lines **29–38**: Drop control characters (except newlines in messages) and clip to the column width.
- `def record_enquiry` — lines **44–76**: A filled honeypot returns the same 201 shape but stores nothing (S-17).
- `def get_lead` — lines **82–86**
- `def list_leads` — lines **89–114**
- `def update_lead` — lines **117–144**
- `def add_note` — lines **147–153**
- `def list_notes` — lines **156–164**
- `def add_quote` — lines **167–185**
- `def list_quotes` — lines **188–194**
- `def convert` — lines **197–214**: Returns the prefill only. The lead becomes WON when POST /members carries its id.
- `def mark_won` — lines **217–224**: Called by the members service once the member row exists. Caller commits.
- `def _visible_to` — lines **230–234**
- `def list_notifications` — lines **237–256**
- `def unread_count` — lines **259–266**
- `def mark_read` — lines **269–282**: A role-targeted notification is marked read by whoever acts on it first.



## `backend/app/services/membership.py`

- **Lines:** 492

- **Purpose:** Business logic layer: SQLAlchemy queries, transactions, domain rules. File `backend/app/services/membership.py`.


### Structure outline


- constant `JUNIOR_MAX_AGE` — line **36**
- constant `EXPIRING_WINDOW_DAYS` — line **37**
- `def list_plans` — lines **43–47**
- `def update_plan` — lines **50–73**
- `def list_court_prices` — lines **79–82**
- `def upsert_court_prices` — lines **85–117**
- `def membership_for` — lines **123–136**: The ACTIVE membership covering `on` (SRS 4.1).
- `def latest_membership` — lines **139–148**
- `def session_plan` — lines **151–152**
- `def member_status` — lines **155–163**: SRS 3.2.3: ACTIVE >= today+8, EXPIRING today..today+7, EXPIRED < today.
- `def next_member_code` — lines **172–178**: The UNIQUE index on member_code is the real race guard; the router retries once.
- `def _check_junior_age` — lines **181–190**
- `def create_member` — lines **193–272**
- `def renew_member` — lines **275–325**
- `def update_member` — lines **328–346**
- `def get_member` — lines **349–353**
- `def get_member_by_code` — lines **356–362**
- `def search_members` — lines **365–390**
- `def _end_date` — lines **393–395**
- `def expiring_members` — lines **398–409**
- `def notify_expiring` — lines **412–428**: SRS 4.9: generated lazily, idempotent per member per expiry date.
- `def member_history` — lines **434–492**: Combined timeline: bookings, shop orders, bar orders, payments (SRS 3.2.3).



## `backend/app/services/notifications.py`

- **Lines:** 41

- **Purpose:** Business logic layer: SQLAlchemy queries, transactions, domain rules. File `backend/app/services/notifications.py`.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `"""SRS 4.9 notifications. Idempotent on dedupe_key."""` |
| 2 | `` |
| 3 | `from sqlalchemy import select` |
| 4 | `from sqlalchemy.orm import Session` |
| 5 | `` |
| 6 | `from ..enums import NotificationType, Role` |
| 7 | `from ..models import Notification` |
| 8 | `` |
| 9 | `` |
| 10 | `def notify(` |
| 11 | `    session: Session,` |
| 12 | `    role_or_user: Role \| str \| int,` |
| 13 | `    type: NotificationType,` |
| 14 | `    title: str,` |
| 15 | `    body: str \| None = None,` |
| 16 | `    link: str \| None = None,` |
| 17 | `    dedupe_key: str \| None = None,` |
| 18 | `) -> Notification \| None:` |
| 19 | `    """Create one notification. Returns None when dedupe_key already exists."""` |
| 20 | `    if dedupe_key is not None:` |
| 21 | `        existing = session.execute(` |
| 22 | `            select(Notification.id).where(Notification.dedupe_key == dedupe_key)` |
| 23 | `        ).first()` |
| 24 | `        if existing is not None:` |
| 25 | `            return None` |
| 26 | `` |
| 27 | `    target_user_id = role_or_user if isinstance(role_or_user, int) else None` |
| 28 | `    target_role = None if isinstance(role_or_user, int) else Role(role_or_user).value` |
| 29 | `` |
| 30 | `    notification = Notification(` |
| 31 | `        target_role=target_role,` |
| 32 | `        target_user_id=target_user_id,` |
| 33 | `        type=NotificationType(type).value,` |
| 34 | `        title=title,` |
| 35 | `        body=body,` |
| 36 | `        link=link,` |
| 37 | `        dedupe_key=dedupe_key,` |
| 38 | `    )` |
| 39 | `    session.add(notification)` |
| 40 | `    session.flush()` |
| 41 | `    return notification` |


## `backend/app/services/payments.py`

- **Lines:** 89

- **Purpose:** Business logic layer: SQLAlchemy queries, transactions, domain rules. File `backend/app/services/payments.py`.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `"""The ONLY writer to the payments table (SRS 4.7).` |
| 2 | `` |
| 3 | `Also holds the two integer money formulas from SRS 1.4 / 4.6 so every module rounds` |
| 4 | `identically. Money is integer paise everywhere; never float.` |
| 5 | `"""` |
| 6 | `` |
| 7 | `from sqlalchemy import select` |
| 8 | `from sqlalchemy.orm import Session` |
| 9 | `` |
| 10 | `from ..config import settings` |
| 11 | `from ..security import AppError` |
| 12 | `from ..enums import PaymentMethod, PaymentStatus, SourceType` |
| 13 | `from ..models import Payment` |
| 14 | `` |
| 15 | `# Tax-inclusive rates per revenue source (SRS 4.6).` |
| 16 | `_TAX_BY_SOURCE = {` |
| 17 | `    SourceType.BOOKING: "tax_court",` |
| 18 | `    SourceType.SOCIAL: "tax_court",` |
| 19 | `    SourceType.SHOP_ORDER: "tax_shop",` |
| 20 | `    SourceType.BAR_ORDER: "tax_bar",` |
| 21 | `    SourceType.MEMBERSHIP: "tax_membership",` |
| 22 | `    SourceType.INVOICE: "tax_membership",` |
| 23 | `}` |
| 24 | `` |
| 25 | `` |
| 26 | `def apply_discount(subtotal_paise: int, pct: int) -> int:` |
| 27 | `    """SRS 1.4: discount = (subtotal * pct + 50) // 100."""` |
| 28 | `    if pct <= 0 or subtotal_paise <= 0:` |
| 29 | `        return 0` |
| 30 | `    return (subtotal_paise * pct + 50) // 100` |
| 31 | `` |
| 32 | `` |
| 33 | `def tax_inclusive(total_paise: int, rate_pct: int) -> int:` |
| 34 | `    """SRS 1.4: tax = (total * rate + (100 + rate) // 2) // (100 + rate)."""` |
| 35 | `    if rate_pct <= 0 or total_paise <= 0:` |
| 36 | `        return 0` |
| 37 | `    return (total_paise * rate_pct + (100 + rate_pct) // 2) // (100 + rate_pct)` |
| 38 | `` |
| 39 | `` |
| 40 | `def tax_rate_for(source_type: SourceType) -> int:` |
| 41 | `    return int(getattr(settings, _TAX_BY_SOURCE[SourceType(source_type)]))` |
| 42 | `` |
| 43 | `` |
| 44 | `def record_payment(` |
| 45 | `    session: Session,` |
| 46 | `    source_type: SourceType,` |
| 47 | `    source_id: int,` |
| 48 | `    amount_paise: int,` |
| 49 | `    method: PaymentMethod,` |
| 50 | `    member_id: int \| None = None,` |
| 51 | `    user_id: int \| None = None,` |
| 52 | `    reference: str \| None = None,` |
| 53 | `) -> Payment:` |
| 54 | `    """Insert the single ledger row for a completed payment. Caller commits."""` |
| 55 | `    source_type = SourceType(source_type)` |
| 56 | `    payment = Payment(` |
| 57 | `        source_type=source_type.value,` |
| 58 | `        source_id=source_id,` |
| 59 | `        member_id=member_id,` |
| 60 | `        amount_paise=amount_paise,` |
| 61 | `        tax_paise=tax_inclusive(amount_paise, tax_rate_for(source_type)),` |
| 62 | `        method=PaymentMethod(method).value,` |
| 63 | `        status=PaymentStatus.COMPLETED.value,` |
| 64 | `        reference=reference,` |
| 65 | `        received_by=user_id,` |
| 66 | `    )` |
| 67 | `    session.add(payment)` |
| 68 | `    session.flush()` |
| 69 | `    return payment` |
| 70 | `` |
| 71 | `` |
| 72 | `def payment_for(session: Session, source_type: SourceType, source_id: int) -> Payment \| None:` |
| 73 | `    """The completed ledger row behind a booking / order, if one was taken."""` |
| 74 | `    return session.execute(` |
| 75 | `        select(Payment).where(` |
| 76 | `            Payment.source_type == SourceType(source_type).value,` |
| 77 | `            Payment.source_id == source_id,` |
| 78 | `            Payment.status == PaymentStatus.COMPLETED.value,` |
| 79 | `        )` |
| 80 | `    ).scalar_one_or_none()` |
| 81 | `` |
| 82 | `` |
| 83 | `def refund_payment(session: Session, payment: Payment) -> Payment:` |
| 84 | `    """Flip a row to REFUNDED. Financial rows are never deleted (SRS 4.7); reports skip these."""` |
| 85 | `    if payment.status == PaymentStatus.REFUNDED.value:` |
| 86 | `        raise AppError("ALREADY_REFUNDED", "This payment is already refunded.", 409)` |
| 87 | `    payment.status = PaymentStatus.REFUNDED.value` |
| 88 | `    session.flush()` |
| 89 | `    return payment` |


## `backend/app/services/pricing.py`

- **Lines:** 64

- **Purpose:** Business logic layer: SQLAlchemy queries, transactions, domain rules. File `backend/app/services/pricing.py`.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `"""SRS 4.1 — the only place a price or a discount percentage is decided.` |
| 2 | `` |
| 3 | `A booking is always one hour, so the court price is the hourly price verbatim. Prices are` |
| 4 | `snapshotted onto the booking row, so a later plan or price change never repriced history.` |
| 5 | `"""` |
| 6 | `` |
| 7 | `from datetime import date` |
| 8 | `` |
| 9 | `from sqlalchemy import select` |
| 10 | `from sqlalchemy.orm import Session` |
| 11 | `` |
| 12 | `from ..enums import Sport, Tier` |
| 13 | `from ..models import CourtPrice, Plan` |
| 14 | `from ..security import AppError` |
| 15 | `from .membership import membership_for` |
| 16 | `` |
| 17 | `DEFAULT_MAX_BOOKINGS_PER_DAY = 2` |
| 18 | `DEFAULT_ADVANCE_BOOKING_DAYS = 14` |
| 19 | `` |
| 20 | `` |
| 21 | `def tier_for(session: Session, member_id: int \| None, at: date \| None = None) -> Tier:` |
| 22 | `    """No member, or no active membership covering `at`, means walk-in pricing."""` |
| 23 | `    if member_id is None:` |
| 24 | `        return Tier.WALKIN` |
| 25 | `    membership = membership_for(session, member_id, at)` |
| 26 | `    if membership is None:` |
| 27 | `        return Tier.WALKIN` |
| 28 | `    plan = session.get(Plan, membership.plan_id)` |
| 29 | `    return Tier(plan.code) if plan else Tier.WALKIN` |
| 30 | `` |
| 31 | `` |
| 32 | `def active_plan(session: Session, member_id: int \| None, at: date \| None = None) -> Plan \| None:` |
| 33 | `    if member_id is None:` |
| 34 | `        return None` |
| 35 | `    membership = membership_for(session, member_id, at)` |
| 36 | `    return session.get(Plan, membership.plan_id) if membership else None` |
| 37 | `` |
| 38 | `` |
| 39 | `def discount_pct(session: Session, member_id: int \| None, kind: str) -> int:` |
| 40 | `    """kind is SHOP or BAR."""` |
| 41 | `    plan = active_plan(session, member_id)` |
| 42 | `    if plan is None:` |
| 43 | `        return 0` |
| 44 | `    return plan.shop_discount_pct if kind == "SHOP" else plan.bar_discount_pct` |
| 45 | `` |
| 46 | `` |
| 47 | `def court_price(session: Session, sport: Sport \| str, tier: Tier \| str) -> int:` |
| 48 | `    """Hourly price in paise. A missing row is a seeding error, not a client error."""` |
| 49 | `    price = session.execute(` |
| 50 | `        select(CourtPrice.price_per_hour_paise).where(` |
| 51 | `            CourtPrice.sport == Sport(sport).value, CourtPrice.tier == Tier(tier).value` |
| 52 | `        )` |
| 53 | `    ).scalar_one_or_none()` |
| 54 | `    if price is None:` |
| 55 | `        raise AppError("PRICE_NOT_CONFIGURED", "No price configured for this sport and tier.", 409)` |
| 56 | `    return int(price)` |
| 57 | `` |
| 58 | `` |
| 59 | `def booking_limits(session: Session, member_id: int \| None) -> tuple[int, int]:` |
| 60 | `    """(max_bookings_per_day, advance_booking_days) for a member; defaults at walk-in tier."""` |
| 61 | `    plan = active_plan(session, member_id)` |
| 62 | `    if plan is None:` |
| 63 | `        return DEFAULT_MAX_BOOKINGS_PER_DAY, DEFAULT_ADVANCE_BOOKING_DAYS` |
| 64 | `    return int(plan.max_bookings_per_day), int(plan.advance_booking_days)` |


## `backend/app/services/reports.py`

- **Lines:** 447

- **Purpose:** Business logic layer: SQLAlchemy queries, transactions, domain rules. File `backend/app/services/reports.py`.


### Structure outline


- constant `PERIODS` — line **48**
- constant `SLOTS_PER_COURT_PER_DAY` — line **50**
- `def period_bounds` — lines **56–71**: IST-anchored: week starts Monday 00:00, month starts the 1st 00:00.
- `def period_days` — lines **74–77**
- `def list_payments` — lines **83–107**
- `def _payment_filters` — lines **110–131**
- `def refund` — lines **134–164**: Row-locked, audited, and idempotent only in the sense that a second attempt is a 409.
- `def _mark_source_refunded` — lines **167–179**: Keep the owning document in step with the ledger.
- `def _revenue` — lines **186–204**
- `def _receivables` — lines **207–220**
- `def _payables` — lines **223–234**
- `def _bookings` — lines **237–252**
- `def _members` — lines **255–268**
- `def summary` — lines **271–307**
- `def revenue_series` — lines **310–335**: One row per IST day in the period, totals split by source.
- constant `CSV_COLUMNS` — line **341**
- `def payments_csv` — lines **356–393**: An export is a sensitive action, so it is audited before the bytes leave (SRS 7).
- `def _csv_safe` — lines **396–398**
- `def tax_summary` — lines **401–436**: P2: tax collected per source for one IST calendar month (YYYY-MM).
- `def own_member_id` — lines **439–447**



## `backend/app/services/shop.py`

- **Lines:** 534

- **Purpose:** Business logic layer: SQLAlchemy queries, transactions, domain rules. File `backend/app/services/shop.py`.


### Structure outline


- constant `MAX_LINE_QTY` — line **29**
- constant `_NEXT_STATUS` — line **32**
- `def list_products` — lines **44–59**
- `def get_product` — lines **62–66**
- `def create_product` — lines **69–85**
- `def update_product` — lines **88–98**: Price changes are audited; stock is only ever moved through restock / orders.
- `def deactivate_product` — lines **101–110**: Soft delete only — stock history and past order lines must stay readable.
- `def low_stock` — lines **113–122**
- `def restock` — lines **125–136**
- `def _movement` — lines **139–159**
- `def _take_stock` — lines **165–185**: The whole race guard: a conditional UPDATE that simply does not match when short.
- `def _notify_low_stock` — lines **188–203**: Once per crossing: the dedupe key carries the level the product dropped to.
- `def _price_lines` — lines **209–235**: Snapshot unit prices so a later price change never rewrites an order.
- `def _totals` — lines **238–249**
- `def create_order` — lines **252–354**
- `def _own_member_id` — lines **357–363**
- `def get_order` — lines **366–372**
- `def order_items` — lines **375–391**
- `def list_orders` — lines **394–423**
- `def set_status` — lines **426–441**
- `def pay_order` — lines **444–465**
- `def cancel_order` — lines **468–516**: Stock goes back exactly once; a paid order is refunded, never deleted.
- `def public_products` — lines **522–534**: Never the exact quantity — a competitor should not be able to read our stock (SRS 3.2.7).



## `backend/app/services/social.py`

- **Lines:** 294

- **Purpose:** Business logic layer: SQLAlchemy queries, transactions, domain rules. File `backend/app/services/social.py`.


### Structure outline


- `def _slot_starts` — lines **31–38**
- `def create_session` — lines **41–96**
- `def get_session_row` — lines **99–103**
- `def joined_count` — lines **106–114**
- `def list_sessions` — lines **117–131**
- `def join` — lines **134–208**: Locks the session row so the capacity check and the insert cannot interleave (SRS 4.4).
- `def leave` — lines **211–229**
- `def participants` — lines **232–242**
- `def _refund_participant` — lines **245–265**: Social payments share one source_id, so the right row is found by member and amount.
- `def cancel_session` — lines **268–294**: Frees every slot and refunds everyone who paid. The session row itself is kept.



## `backend/requirements.txt`

- **Lines:** 11

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `fastapi==0.115.6` |
| 2 | `uvicorn==0.34.0` |
| 3 | `sqlalchemy==2.0.36` |
| 4 | `psycopg[binary]==3.2.3` |
| 5 | `pydantic==2.10.4` |
| 6 | `pydantic-settings==2.7.0` |
| 7 | `argon2-cffi==23.1.0` |
| 8 | `pyjwt==2.10.1` |
| 9 | `slowapi==0.1.9` |
| 10 | `pytest==8.3.4` |
| 11 | `httpx==0.28.1` |


## `backend/seed.py`

- **Lines:** 562

- **Purpose:** Idempotent demo seed: users, plans, courts, members, 30-day history via services.


### Structure outline


- constant `_TIER_ORDER` — line **84**
- constant `MEMBER_COUNT` — line **121**
- constant `_PLAN_ROTATION` — line **123**
- constant `_EXPIRING_SOON` — line **125**
- constant `_EXPIRED` — line **126**
- `def _today_ist` — lines **129–130**
- `def _seed_users` — lines **133–151**
- `def _seed_plans` — lines **154–170**
- `def _seed_courts` — lines **173–182**
- `def _seed_court_prices` — lines **185–197**
- `def _seed_products` — lines **200–216**
- `def _seed_menu` — lines **219–228**
- `def _seed_bar_tables` — lines **231–240**
- `def _seed_members` — lines **243–297**
- constant `HISTORY_DAYS` — line **300**
- constant `_METHODS` — line **301**
- `def _shift` — lines **313–318**: Move a service-created row back in time so the demo has a 30-day history.
- `def _next_weekday` — lines **321–322**
- `def _seed_history` — lines **325–550**: Demo bookings / orders / payments / leads, all created through the services.
- `def run_seed` — lines **553–562**



## `backend/tests/__init__.py`

- **Lines:** 0

- **Purpose:** Pytest module exercising API/services against a real Postgres in Docker.


### Line-by-line


| Ln | Code |
|----|------|


## `backend/tests/conftest.py`

- **Lines:** 300

- **Purpose:** Pytest module exercising API/services against a real Postgres in Docker.


### Structure outline


- constant `API` — line **47**
- constant `TEST_EMAIL_PREFIX` — line **48**
- constant `TEST_EMAIL_DOMAIN` — line **49**
- constant `GOOD_PASSWORD` — line **50**
- constant `TEST_PHONE_PREFIX` — line **51**
- constant `TEST_COURT_PREFIX` — line **53**
- constant `TEST_SKU_PREFIX` — line **54**
- constant `TEST_MENU_PREFIX` — line **55**
- constant `TEST_TABLE_PREFIX` — line **56**
- constant `TEST_LEAD_PREFIX` — line **57**
- constant `TEST_EMPLOYEE_PREFIX` — line **58**
- `def _limiter_disabled` — lines **62–66**: Only the rate-limit test turns this on, and it restores it afterwards.
- `def client` — lines **70–72**
- `def session` — lines **76–78**
- `def make_user` — lines **82–102**: Throwaway users only. Seeded accounts are never touched.
- `def make_court` — lines **106–114**
- `def _cleanup_test_rows` — lines **118–300**: Remove everything the suite created, in foreign-key order. Seed rows stay.



## `backend/tests/test_auth.py`

- **Lines:** 193

- **Purpose:** Pytest module exercising API/services against a real Postgres in Docker.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import uuid` |
| 2 | `` |
| 3 | `from fastapi.testclient import TestClient` |
| 4 | `from sqlalchemy import select` |
| 5 | `from sqlalchemy.orm import Session` |
| 6 | `` |
| 7 | `from app.enums import Role` |
| 8 | `from app.models import AuditLog, User` |
| 9 | `from app.security import limiter` |
| 10 | `` |
| 11 | `from .conftest import API, GOOD_PASSWORD` |
| 12 | `` |
| 13 | `WRONG_PASSWORD = "Wr0ngPassword"` |
| 14 | `` |
| 15 | `` |
| 16 | `def _login(client: TestClient, email: str, password: str = GOOD_PASSWORD):` |
| 17 | `    return client.post(f"{API}/auth/login", json={"email": email, "password": password})` |
| 18 | `` |
| 19 | `` |
| 20 | `def _token(client: TestClient, user: User) -> str:` |
| 21 | `    response = _login(client, user.email)` |
| 22 | `    assert response.status_code == 200, response.text` |
| 23 | `    return response.json()["access_token"]` |
| 24 | `` |
| 25 | `` |
| 26 | `def _auth(token: str) -> dict[str, str]:` |
| 27 | `    return {"Authorization": f"Bearer {token}"}` |
| 28 | `` |
| 29 | `` |
| 30 | `def _new_user_payload(role: str = "FRONT_DESK", password: str = GOOD_PASSWORD) -> dict:` |
| 31 | `    return {` |
| 32 | `        "email": f"test-{uuid.uuid4().hex[:12]}@test.local",` |
| 33 | `        "full_name": "Created User",` |
| 34 | `        "password": password,` |
| 35 | `        "role": role,` |
| 36 | `    }` |
| 37 | `` |
| 38 | `` |
| 39 | `def test_login_returns_srs_shape_and_me_agrees(client: TestClient, make_user) -> None:` |
| 40 | `    user = make_user(Role.MANAGER)` |
| 41 | `    response = _login(client, user.email)` |
| 42 | `    assert response.status_code == 200, response.text` |
| 43 | `` |
| 44 | `    body = response.json()` |
| 45 | `    assert body["token_type"] == "bearer"` |
| 46 | `    assert body["expires_in"] == 900` |
| 47 | `    assert body["user"] == {` |
| 48 | `        "id": user.id,` |
| 49 | `        "email": user.email,` |
| 50 | `        "full_name": user.full_name,` |
| 51 | `        "role": "MANAGER",` |
| 52 | `        "member_id": None,` |
| 53 | `    }` |
| 54 | `` |
| 55 | `    me = client.get(f"{API}/auth/me", headers=_auth(body["access_token"]))` |
| 56 | `    assert me.status_code == 200` |
| 57 | `    assert me.json() == body["user"]` |
| 58 | `` |
| 59 | `` |
| 60 | `def test_lockout_after_five_failed_logins(client: TestClient, make_user) -> None:` |
| 61 | `    """T-09: 5 bad logins -> 6th is 423, and 423 again even with the right password."""` |
| 62 | `    user = make_user()` |
| 63 | `` |
| 64 | `    for attempt in range(5):` |
| 65 | `        response = _login(client, user.email, WRONG_PASSWORD)` |
| 66 | `        assert response.status_code == 401, f"attempt {attempt + 1}: {response.text}"` |
| 67 | `        assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"` |
| 68 | `` |
| 69 | `    locked = _login(client, user.email, WRONG_PASSWORD)` |
| 70 | `    assert locked.status_code == 423` |
| 71 | `    assert locked.json()["error"]["code"] == "ACCOUNT_LOCKED"` |
| 72 | `` |
| 73 | `    still_locked = _login(client, user.email, GOOD_PASSWORD)` |
| 74 | `    assert still_locked.status_code == 423` |
| 75 | `    assert still_locked.json()["error"]["code"] == "ACCOUNT_LOCKED"` |
| 76 | `` |
| 77 | `` |
| 78 | `def test_unknown_email_counts_nothing(client: TestClient) -> None:` |
| 79 | `    for _ in range(6):` |
| 80 | `        response = _login(client, f"test-{uuid.uuid4().hex[:12]}@test.local", WRONG_PASSWORD)` |
| 81 | `        assert response.status_code == 401` |
| 82 | `        assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"` |
| 83 | `` |
| 84 | `` |
| 85 | `def test_refresh_rotates_and_old_token_is_rejected(client: TestClient, make_user) -> None:` |
| 86 | `    user = make_user()` |
| 87 | `    assert _login(client, user.email).status_code == 200` |
| 88 | `` |
| 89 | `    old_cookie = client.cookies.get("refresh_token")` |
| 90 | `    assert old_cookie` |
| 91 | `` |
| 92 | `    rotated = client.post(f"{API}/auth/refresh")` |
| 93 | `    assert rotated.status_code == 200, rotated.text` |
| 94 | `    new_cookie = client.cookies.get("refresh_token")` |
| 95 | `    assert new_cookie and new_cookie != old_cookie` |
| 96 | `    assert rotated.json()["user"]["id"] == user.id` |
| 97 | `` |
| 98 | `    client.cookies.clear()` |
| 99 | `    client.cookies.set("refresh_token", old_cookie)` |
| 100 | `    reused = client.post(f"{API}/auth/refresh")` |
| 101 | `    assert reused.status_code == 401` |
| 102 | `    assert reused.json()["error"]["code"] == "INVALID_TOKEN"` |
| 103 | `` |
| 104 | `` |
| 105 | `def test_logout_revokes_the_refresh_token(client: TestClient, make_user) -> None:` |
| 106 | `    user = make_user()` |
| 107 | `    token = _token(client, user)` |
| 108 | `` |
| 109 | `    assert client.post(f"{API}/auth/logout", headers=_auth(token)).status_code == 200` |
| 110 | `    assert client.post(f"{API}/auth/refresh").status_code == 401` |
| 111 | `` |
| 112 | `` |
| 113 | `def test_front_desk_cannot_create_users(client: TestClient, make_user) -> None:` |
| 114 | `    token = _token(client, make_user(Role.FRONT_DESK))` |
| 115 | `    response = client.post(f"{API}/users", json=_new_user_payload(), headers=_auth(token))` |
| 116 | `    assert response.status_code == 403` |
| 117 | `    assert response.json()["error"]["code"] == "FORBIDDEN"` |
| 118 | `` |
| 119 | `` |
| 120 | `def test_create_user_without_a_token_is_401(client: TestClient) -> None:` |
| 121 | `    response = client.post(f"{API}/users", json=_new_user_payload())` |
| 122 | `    assert response.status_code == 401` |
| 123 | `    assert response.json()["error"]["code"] == "INVALID_TOKEN"` |
| 124 | `` |
| 125 | `` |
| 126 | `def test_weak_password_is_rejected(client: TestClient, make_user) -> None:` |
| 127 | `    token = _token(client, make_user(Role.OWNER))` |
| 128 | `    response = client.post(` |
| 129 | `        f"{API}/users", json=_new_user_payload(password="short1a"), headers=_auth(token)` |
| 130 | `    )` |
| 131 | `    assert response.status_code == 422` |
| 132 | `    body = response.json()` |
| 133 | `    assert body["error"]["code"] == "VALIDATION_ERROR"` |
| 134 | `    assert set(body["error"]) == {"code", "message", "details"}` |
| 135 | `` |
| 136 | `` |
| 137 | `def test_member_role_is_rejected_on_user_create(client: TestClient, make_user) -> None:` |
| 138 | `    token = _token(client, make_user(Role.OWNER))` |
| 139 | `    response = client.post(` |
| 140 | `        f"{API}/users", json=_new_user_payload(role="MEMBER"), headers=_auth(token)` |
| 141 | `    )` |
| 142 | `    assert response.status_code == 422` |
| 143 | `    assert response.json()["error"]["code"] == "VALIDATION_ERROR"` |
| 144 | `` |
| 145 | `` |
| 146 | `def test_duplicate_email_is_409(client: TestClient, make_user) -> None:` |
| 147 | `    token = _token(client, make_user(Role.OWNER))` |
| 148 | `    payload = _new_user_payload()` |
| 149 | `    assert client.post(f"{API}/users", json=payload, headers=_auth(token)).status_code == 201` |
| 150 | `` |
| 151 | `    duplicate = client.post(f"{API}/users", json=payload, headers=_auth(token))` |
| 152 | `    assert duplicate.status_code == 409` |
| 153 | `    assert duplicate.json()["error"]["code"] == "EMAIL_EXISTS"` |
| 154 | `` |
| 155 | `` |
| 156 | `def test_user_changes_are_audited(client: TestClient, make_user, session: Session) -> None:` |
| 157 | `    owner = make_user(Role.OWNER)` |
| 158 | `    token = _token(client, owner)` |
| 159 | `` |
| 160 | `    created = client.post(f"{API}/users", json=_new_user_payload(), headers=_auth(token))` |
| 161 | `    assert created.status_code == 201, created.text` |
| 162 | `    new_id = created.json()["id"]` |
| 163 | `` |
| 164 | `    patched = client.patch(` |
| 165 | `        f"{API}/users/{new_id}", json={"is_active": False}, headers=_auth(token)` |
| 166 | `    )` |
| 167 | `    assert patched.status_code == 200` |
| 168 | `    assert patched.json()["is_active"] is False` |
| 169 | `` |
| 170 | `    actions = session.execute(` |
| 171 | `        select(AuditLog.action, AuditLog.meta)` |
| 172 | `        .where(AuditLog.entity == "user", AuditLog.entity_id == new_id)` |
| 173 | `        .order_by(AuditLog.id)` |
| 174 | `    ).all()` |
| 175 | `    assert [row.action for row in actions] == ["USER_CREATED", "USER_UPDATED"]` |
| 176 | `    assert actions[1].meta["before"]["is_active"] is True` |
| 177 | `    assert actions[1].meta["after"]["is_active"] is False` |
| 178 | `` |
| 179 | `` |
| 180 | `def test_sixth_login_in_a_minute_is_rate_limited(client: TestClient, make_user) -> None:` |
| 181 | `    user = make_user()` |
| 182 | `    limiter.enabled = True` |
| 183 | `    try:` |
| 184 | `        statuses = [` |
| 185 | `            _login(client, user.email, WRONG_PASSWORD).status_code for _ in range(5)` |
| 186 | `        ]` |
| 187 | `        sixth = _login(client, user.email, WRONG_PASSWORD)` |
| 188 | `    finally:` |
| 189 | `        limiter.enabled = False` |
| 190 | `` |
| 191 | `    assert statuses == [401, 401, 401, 401, 401]` |
| 192 | `    assert sixth.status_code == 429` |
| 193 | `    assert sixth.json()["error"]["code"] == "RATE_LIMITED"` |


## `backend/tests/test_bar.py`

- **Lines:** 500

- **Purpose:** Pytest module exercising API/services against a real Postgres in Docker.


### Structure outline


- `def _token` — lines **20–23**
- `def _auth` — lines **26–27**
- `def make_menu_item` — lines **31–43**
- `def silver_member` — lines **47–69**
- `def _order` — lines **72–79**
- `def test_new_order_starts_in_the_kitchen_unpaid` — lines **85–96**
- `def test_member_bar_discount_comes_from_the_plan` — lines **99–108**
- `def test_adding_items_retotals` — lines **111–123**
- `def test_cannot_add_items_to_a_paid_order` — lines **126–138**
- `def test_kitchen_moves_forward_only` — lines **144–164**
- `def test_kitchen_may_skip_forward_but_not_repeat` — lines **167–184**
- `def test_served_order_cannot_be_cancelled` — lines **187–201**
- `def test_pay_once_then_409` — lines **207–231**
- `def test_guest_cannot_open_a_tab` — lines **237–244**
- `def test_tab_stays_unpaid_until_settled` — lines **247–265**
- `def test_t12_settle_is_atomic` — lines **268–325**: One bad order id in the list and not a single payment row is written.
- `def test_settling_an_already_paid_order_pays_nothing` — lines **328–346**
- `def test_tables_show_running_totals` — lines **352–369**
- `def test_paid_orders_leave_the_table_total` — lines **372–386**
- `def test_daily_report_equals_the_days_bar_payments` — lines **392–426**
- `def test_manager_report_covers_the_whole_bar` — lines **429–443**
- `def test_outstanding_tabs_are_reported` — lines **446–458**
- `def test_front_desk_cannot_take_bar_orders` — lines **464–472**
- `def test_bar_staff_cannot_edit_the_menu` — lines **475–481**
- `def test_members_cannot_read_bar_orders` — lines **484–500**



## `backend/tests/test_bookings.py`

- **Lines:** 810

- **Purpose:** Pytest module exercising API/services against a real Postgres in Docker.


### Structure outline


- `def _token` — lines **23–26**
- `def _auth` — lines **29–30**
- `def _slot` — lines **33–36**: A future IST slot, returned in UTC the way the API expects it.
- `def _iso` — lines **39–40**
- `def member` — lines **44–55**: A throwaway member on no plan; tests add a membership when they need a tier.
- `def _give_plan` — lines **58–69**
- `def test_t01_fifty_threads_one_winner` — lines **75–111**: 50 concurrent bookings on one slot: exactly 1 CONFIRMED, 49 SLOT_TAKEN.
- `def test_t01_api_smoke` — lines **114–127**
- `def test_t02_overlapping_half_hour_collides` — lines **133–160**: 12:30 holds 12:30 and 13:00, so a 13:00 booking must collide.
- `def test_t03_daily_limit_and_cancel_frees_it` — lines **166–205**
- `def test_t03_limit_is_per_ist_day_not_utc_day` — lines **208–237**: 20:00 and 20:30 IST are the next UTC day; both must still count as one IST day.
- `def test_walk_ins_are_not_limited` — lines **240–254**
- `def test_t04_price_by_tier` — lines **260–319**: Gold 0 (waived, no payment row), Silver 40000, Junior 25000, walk-in 60000.
- `def test_plan_change_never_reprices_an_existing_booking` — lines **322–342**
- `def test_invalid_slots_are_422` — lines **352–368**
- `def test_past_slot_is_422` — lines **371–385**
- `def test_walk_in_without_contact_is_422` — lines **388–397**
- `def _book_paid` — lines **403–418**
- `def test_cancel_refunds_outside_the_two_hour_window` — lines **421–436**
- `def test_cancel_inside_two_hours_keeps_the_money` — lines **439–453**: Booked just over 2h out, then the clock is moved so only 1h remains.
- `def test_owner_may_override_a_late_refund` — lines **456–467**
- `def test_cancelling_twice_is_409` — lines **470–489**
- `def test_cancel_after_start_is_409` — lines **492–501**
- `def test_cancel_frees_the_slots` — lines **504–519**
- `def test_unpaid_booking_can_be_paid_then_not_paid_again` — lines **525–556**
- `def test_status_transitions` — lines **559–582**
- `def test_availability_grid_shape_and_prices` — lines **588–603**
- `def test_availability_marks_booked_and_blocks_the_overlap` — lines **606–639**
- `def test_public_availability_leaks_nothing` — lines **642–671**
- `def test_public_availability_rejects_more_than_seven_days` — lines **674–678**
- `def test_public_availability_needs_no_token` — lines **681–685**
- `def test_member_booking_is_forced_to_own_id_and_web_source` — lines **691–725**
- `def test_member_cannot_read_another_members_booking` — lines **728–755**
- `def test_bar_staff_cannot_book` — lines **758–771**
- `def test_only_admins_manage_courts` — lines **774–786**
- `def test_deactivating_a_court_with_future_bookings_is_409` — lines **789–810**



## `backend/tests/test_foundation.py`

- **Lines:** 167

- **Purpose:** Pytest module exercising API/services against a real Postgres in Docker.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `"""Stage 1: schema, constraints, seed idempotency and the SRS 1.4 money formulas."""` |
| 2 | `` |
| 3 | `import pytest` |
| 4 | `from sqlalchemy import func, select, text` |
| 5 | `from sqlalchemy.exc import IntegrityError` |
| 6 | `from sqlalchemy.orm import Session` |
| 7 | `` |
| 8 | `from app.db import Base, SessionLocal` |
| 9 | `from app.enums import BookingPaymentStatus, BookingSource, BookingStatus, Sport, Tier` |
| 10 | `from app.models import Booking, Court, CourtPrice, CourtSlot, MenuItem, Member, Plan, Product` |
| 11 | `from app.services.payments import apply_discount, tax_inclusive` |
| 12 | `` |
| 13 | `from .conftest import (` |
| 14 | `    TEST_COURT_PREFIX,` |
| 15 | `    TEST_MENU_PREFIX,` |
| 16 | `    TEST_PHONE_PREFIX,` |
| 17 | `    TEST_SKU_PREFIX,` |
| 18 | `)` |
| 19 | `` |
| 20 | `EXPECTED_TABLE_COUNT = 33` |
| 21 | `` |
| 22 | `` |
| 23 | `def test_every_srs_table_exists(session: Session) -> None:` |
| 24 | `    present = set(` |
| 25 | `        session.execute(` |
| 26 | `            text(` |
| 27 | `                "SELECT table_name FROM information_schema.tables "` |
| 28 | `                "WHERE table_schema='public' AND table_type='BASE TABLE'"` |
| 29 | `            )` |
| 30 | `        ).scalars()` |
| 31 | `    )` |
| 32 | `    declared = set(Base.metadata.tables)` |
| 33 | `    assert declared <= present, f"missing in DB: {sorted(declared - present)}"` |
| 34 | `    assert len(declared) == EXPECTED_TABLE_COUNT, sorted(declared)` |
| 35 | `` |
| 36 | `` |
| 37 | `def test_every_table_has_created_at() -> None:` |
| 38 | `    missing = [name for name, table in Base.metadata.tables.items() if "created_at" not in table.c]` |
| 39 | `    assert missing == []` |
| 40 | `` |
| 41 | `` |
| 42 | `def test_duplicate_court_slot_raises_integrity_error(session: Session) -> None:` |
| 43 | `    court = session.execute(select(Court).limit(1)).scalar_one()` |
| 44 | `    start = text("now() + interval '400 days'")` |
| 45 | `    slot_start = session.execute(select(start)).scalar_one()` |
| 46 | `` |
| 47 | `    booking = Booking(` |
| 48 | `        court_id=court.id,` |
| 49 | `        guest_name="Slot Guard",` |
| 50 | `        guest_phone="9000000000",` |
| 51 | `        start_at=slot_start,` |
| 52 | `        end_at=slot_start,` |
| 53 | `        status=BookingStatus.CONFIRMED.value,` |
| 54 | `        tier_applied=Tier.WALKIN.value,` |
| 55 | `        price_paise=0,` |
| 56 | `        payment_status=BookingPaymentStatus.WAIVED.value,` |
| 57 | `        source=BookingSource.FRONT_DESK.value,` |
| 58 | `    )` |
| 59 | `    session.add(booking)` |
| 60 | `    session.flush()` |
| 61 | `    session.add(CourtSlot(court_id=court.id, slot_start=slot_start, booking_id=booking.id))` |
| 62 | `    session.flush()` |
| 63 | `` |
| 64 | `    session.add(CourtSlot(court_id=court.id, slot_start=slot_start, booking_id=booking.id))` |
| 65 | `    with pytest.raises(IntegrityError):` |
| 66 | `        session.flush()` |
| 67 | `    session.rollback()` |
| 68 | `` |
| 69 | `` |
| 70 | `def test_court_slot_requires_exactly_one_owner(session: Session) -> None:` |
| 71 | `    court = session.execute(select(Court).limit(1)).scalar_one()` |
| 72 | `    slot_start = session.execute(select(text("now() + interval '500 days'"))).scalar_one()` |
| 73 | `    session.add(CourtSlot(court_id=court.id, slot_start=slot_start))` |
| 74 | `    with pytest.raises(IntegrityError):` |
| 75 | `        session.flush()` |
| 76 | `    session.rollback()` |
| 77 | `` |
| 78 | `` |
| 79 | `def test_seed_is_idempotent() -> None:` |
| 80 | `    from seed import run_seed` |
| 81 | `` |
| 82 | `    def counts(db: Session) -> dict[str, int]:` |
| 83 | `        return {` |
| 84 | `            model.__name__: db.execute(select(func.count()).select_from(model)).scalar_one()` |
| 85 | `            for model in (Plan, Court, CourtPrice, Product, MenuItem, Member)` |
| 86 | `        }` |
| 87 | `` |
| 88 | `    with SessionLocal() as db:` |
| 89 | `        before = counts(db)` |
| 90 | `        run_seed(db)` |
| 91 | `        after = counts(db)` |
| 92 | `    assert before == after` |
| 93 | `` |
| 94 | `` |
| 95 | `def test_seed_shapes() -> None:` |
| 96 | `    with SessionLocal() as db:` |
| 97 | `        assert db.execute(select(func.count()).select_from(Plan)).scalar_one() == 3` |
| 98 | `        # Other test modules add their own courts and members, so count the seeded ones.` |
| 99 | `        assert db.execute(` |
| 100 | `            select(func.count())` |
| 101 | `            .select_from(Court)` |
| 102 | `            .where(Court.name.not_like(f"{TEST_COURT_PREFIX}%"))` |
| 103 | `        ).scalar_one() == 6` |
| 104 | `        assert db.execute(select(func.count()).select_from(CourtPrice)).scalar_one() == 16` |
| 105 | `        assert db.execute(` |
| 106 | `            select(func.count())` |
| 107 | `            .select_from(Product)` |
| 108 | `            .where(Product.sku.not_like(f"{TEST_SKU_PREFIX}%"))` |
| 109 | `        ).scalar_one() == 14` |
| 110 | `        assert db.execute(` |
| 111 | `            select(func.count())` |
| 112 | `            .select_from(MenuItem)` |
| 113 | `            .where(MenuItem.name.not_like(f"{TEST_MENU_PREFIX}%"))` |
| 114 | `        ).scalar_one() == 15` |
| 115 | `        assert db.execute(` |
| 116 | `            select(func.count())` |
| 117 | `            .select_from(Member)` |
| 118 | `            .where(Member.phone.not_like(f"{TEST_PHONE_PREFIX}%"))` |
| 119 | `        ).scalar_one() == 30` |
| 120 | `` |
| 121 | `        below = db.execute(` |
| 122 | `            select(func.count())` |
| 123 | `            .select_from(Product)` |
| 124 | `            .where(` |
| 125 | `                Product.stock_qty <= Product.reorder_level,` |
| 126 | `                Product.sku.not_like(f"{TEST_SKU_PREFIX}%"),` |
| 127 | `            )` |
| 128 | `        ).scalar_one()` |
| 129 | `        # SRS 10.1 asks for three low-stock products; the seeded sales history draws a few more` |
| 130 | `        # down, so the demo guarantee is "at least three", never fewer.` |
| 131 | `        assert below >= 3` |
| 132 | `` |
| 133 | `        tennis_walkin = db.execute(` |
| 134 | `            select(CourtPrice.price_per_hour_paise).where(` |
| 135 | `                CourtPrice.sport == Sport.TENNIS.value, CourtPrice.tier == Tier.WALKIN.value` |
| 136 | `            )` |
| 137 | `        ).scalar_one()` |
| 138 | `        assert tennis_walkin == 60000` |
| 139 | `` |
| 140 | `` |
| 141 | `@pytest.mark.parametrize(` |
| 142 | `    ("subtotal", "pct", "expected"),` |
| 143 | `    [` |
| 144 | `        (0, 15, 0),` |
| 145 | `        (650000, 5, 32500),` |
| 146 | `        (100, 5, 5),` |
| 147 | `        (10, 5, 1),  # 0.5 paise rounds up (SRS 8 Shop)` |
| 148 | `        (999, 10, 100),` |
| 149 | `        (450000, 15, 67500),` |
| 150 | `    ],` |
| 151 | `)` |
| 152 | `def test_discount_rounding(subtotal: int, pct: int, expected: int) -> None:` |
| 153 | `    assert apply_discount(subtotal, pct) == expected` |
| 154 | `` |
| 155 | `` |
| 156 | `@pytest.mark.parametrize(` |
| 157 | `    ("total", "rate", "expected"),` |
| 158 | `    [` |
| 159 | `        (0, 18, 0),` |
| 160 | `        (617500, 18, 94195),  # SRS 3.2.7 worked example` |
| 161 | `        (118, 18, 18),` |
| 162 | `        (105, 5, 5),` |
| 163 | `        (40000, 18, 6102),` |
| 164 | `    ],` |
| 165 | `)` |
| 166 | `def test_tax_inclusive_rounding(total: int, rate: int, expected: int) -> None:` |
| 167 | `    assert tax_inclusive(total, rate) == expected` |


## `backend/tests/test_hr.py`

- **Lines:** 248

- **Purpose:** Pytest module exercising API/services against a real Postgres in Docker.


### Structure outline


- `def _token` — lines **19–22**
- `def _auth` — lines **25–26**
- `def employee` — lines **30–42**
- `def test_employee_create_and_list` — lines **45–50**
- `def test_shift_roster_is_a_monday_to_sunday_week` — lines **53–84**
- `def test_shift_must_end_after_it_starts` — lines **87–100**
- `def test_leave_request_then_decision` — lines **103–148**
- `def test_staff_see_only_their_own_leave` — lines **151–168**
- `def test_payroll_run_is_idempotent_and_pay_creates_an_expense` — lines **171–214**
- `def test_bad_payroll_month_is_422` — lines **217–224**
- `def test_hr_admin_routes_are_closed` — lines **228–234**
- `def test_a_manager_runs_payroll_but_cannot_pay_it` — lines **237–248**: SRS 3.1: MANAGER has W on payroll "(no payroll pay)".



## `backend/tests/test_leads.py`

- **Lines:** 314

- **Purpose:** Pytest module exercising API/services against a real Postgres in Docker.


### Structure outline


- constant `LEAD_MARKER` — line **17**
- `def _token` — lines **20–23**
- `def _auth` — lines **26–27**
- `def _enquiry` — lines **30–40**
- `def _post_enquiry` — lines **43–46**
- `def test_enquiry_creates_a_lead_and_notifies_staff` — lines **52–69**
- `def test_honeypot_stores_nothing` — lines **72–78**
- `def test_enquiry_needs_no_token_and_rejects_unknown_fields` — lines **81–84**
- `def test_control_characters_are_stripped` — lines **87–92**
- `def test_over_long_message_is_rejected` — lines **95–97**
- `def test_unknown_plan_is_ignored_not_404` — lines **100–103**: A 404 here would tell an anonymous caller which plan ids exist.
- `def test_public_enquiry_rate_limit_is_429` — lines **106–125**: The only test that turns the limiter on; it clears its own rows afterwards.
- `def test_status_flows_forward_only` — lines **131–142**
- `def test_assignment_must_be_a_staff_user` — lines **145–160**
- `def test_notes_and_quotes` — lines **163–183**
- `def test_convert_prefills_then_member_creation_marks_won` — lines **186–211**
- `def test_converting_twice_is_409` — lines **214–222**
- `def test_lost_lead_cannot_be_converted` — lines **225–231**
- `def test_leads_filter_by_status` — lines **234–239**
- `def test_leads_are_staff_only` — lines **246–254**
- `def test_leads_need_a_token` — lines **257–258**
- `def test_notifications_are_scoped_to_role` — lines **264–274**
- `def test_unread_count_drops_when_read` — lines **277–293**
- `def test_cannot_read_someone_elses_notification` — lines **296–302**
- `def test_member_sees_only_their_own_notifications` — lines **305–314**



## `backend/tests/test_members.py`

- **Lines:** 277

- **Purpose:** Pytest module exercising API/services against a real Postgres in Docker.


### Structure outline


- `def _token` — lines **18–21**
- `def _auth` — lines **24–25**
- `def _phone` — lines **28–29**
- `def _plan_id` — lines **32–33**
- `def test_plans_and_court_prices_are_public` — lines **36–43**
- `def test_junior_plan_rejects_an_adult` — lines **46–60**
- `def test_duplicate_phone_is_409` — lines **63–76**
- `def test_member_create_with_plan_records_one_membership_payment` — lines **79–103**
- `def test_status_boundaries_at_plus_seven_and_plus_eight` — lines **106–114**
- `def test_member_cannot_read_another_member` — lines **117–144**: T-08 part: IDOR returns 404, not 403.
- `def test_login_returns_real_member_id_for_members` — lines **147–164**
- `def test_staff_login_has_no_member_id` — lines **167–172**
- `def test_search_by_code_and_phone` — lines **175–184**
- `def test_bar_staff_sees_only_name_plan_code` — lines **187–191**
- `def test_expiring_list_and_idempotent_notifications` — lines **194–216**
- `def test_renew_extends_membership` — lines **219–239**
- `def test_court_price_update_is_audited` — lines **242–268**
- `def test_member_cannot_create_members` — lines **271–277**



## `backend/tests/test_payments.py`

- **Lines:** 414

- **Purpose:** Pytest module exercising API/services against a real Postgres in Docker.


### Structure outline


- `def _token` — lines **20–23**
- `def _auth` — lines **26–27**
- `def product` — lines **31–43**
- `def _sell` — lines **46–58**
- `def test_t10_dashboard_total_matches_the_ledger` — lines **64–121**: Dashboard revenue == SUM(payments COMPLETED) in the period, refunds excluded.
- `def test_refund_twice_is_409` — lines **124–144**
- `def test_refund_is_audited_and_updates_the_source` — lines **147–168**
- `def test_bar_staff_cannot_see_the_dashboard` — lines **174–178**
- `def test_only_finance_roles_reach_payments` — lines **182–185**
- `def test_payments_mine_is_scoped_to_the_caller` — lines **188–203**
- `def test_period_bounds_are_ist_anchored` — lines **209–222**
- `def test_unknown_period_is_422` — lines **225–231**
- `def test_summary_has_every_srs_key` — lines **237–255**
- `def test_revenue_split_by_source_and_method` — lines **258–270**
- `def test_low_stock_appears_on_the_dashboard` — lines **273–296**
- `def test_utilisation_is_a_percentage` — lines **299–304**
- `def test_revenue_series_covers_every_day_of_the_period` — lines **310–326**
- `def test_csv_export_is_audited_and_escaped` — lines **332–365**
- `def test_payments_filters` — lines **368–387**
- `def test_tax_summary_for_this_month` — lines **393–406**
- `def test_bad_month_is_422` — lines **409–414**



## `backend/tests/test_security.py`

- **Lines:** 362

- **Purpose:** Pytest module exercising API/services against a real Postgres in Docker.


### Structure outline


- constant `SEED_PASSWORD` — line **24**
- `def _token` — lines **27–30**
- `def _auth` — lines **33–34**
- `def _slot` — lines **37–43**
- constant `RBAC_MATRIX` — line **50**
- `def _body` — lines **75–99**
- `def test_t07_rbac_matrix` — lines **107–127**
- `def test_t07_every_non_public_route_has_a_role_guard` — lines **130–153**: A route added without `require_roles` fails here rather than in production.
- `def test_every_request_body_forbids_unknown_fields` — lines **156–168**: S-05: a typo'd or injected field must never be silently ignored.
- `def two_members` — lines **175–184**: member1 and member2 are seeded accounts; the test only reads through them.
- `def test_t08_member_cannot_read_another_members_profile` — lines **187–189**
- `def test_t08_idor_across_profile_booking_and_order` — lines **192–254**
- `def test_t08_list_endpoints_are_scoped_not_filtered_client_side` — lines **257–272**: Passing someone else's member_id must not widen what a member sees.
- `def test_t08_member_cannot_mutate_another_members_booking` — lines **275–294**
- `def test_s02_password_hash_never_leaves_the_api` — lines **300–306**
- `def test_s11_unauthenticated_calls_are_401_not_500` — lines **309–313**
- `def test_s12_a_tampered_token_is_rejected` — lines **316–321**
- `def test_s15_public_endpoints_return_no_personal_data` — lines **324–346**
- `def test_s18_errors_use_the_srs_envelope` — lines **349–354**
- `def test_s20_health_needs_no_auth_and_leaks_nothing` — lines **357–362**



## `backend/tests/test_shop.py`

- **Lines:** 584

- **Purpose:** Pytest module exercising API/services against a real Postgres in Docker.


### Structure outline


- `def _token` — lines **24–27**
- `def _auth` — lines **30–31**
- `def make_product` — lines **35–50**
- `def silver_member` — lines **54–76**
- `def test_t05_two_parallel_orders_for_the_last_unit` — lines **82–117**: Stock 1, two concurrent orders: one 201, one OUT_OF_STOCK, stock never negative.
- `def test_t05_fifty_threads_never_oversell` — lines **120–148**
- `def test_qty_above_stock_saves_nothing` — lines **151–184**
- `def test_srs_example_totals` — lines **190–227**: The SRS 3.2.7 sample: subtotal 650000, discount 32500 at 5%, total 617500, tax 94195.
- `def test_unit_price_is_snapshotted` — lines **230–252**
- `def test_cancel_restores_stock_once_and_refunds` — lines **258–303**
- `def test_restock_adds_a_movement` — lines **306–326**
- `def test_low_stock_list_and_notification` — lines **329–356**
- `def _member_login` — lines **362–369**
- `def test_online_delivery_needs_an_address` — lines **372–386**
- `def test_online_pickup_is_placed_and_reserves_stock` — lines **389–411**
- `def test_staff_cannot_place_an_online_order` — lines **414–426**
- `def test_pay_at_pickup_then_complete` — lines **429–473**
- `def test_status_cannot_go_backwards` — lines **476–497**
- `def test_empty_cart_is_422` — lines **503–511**
- `def test_unknown_field_is_rejected` — lines **514–528**
- `def test_front_desk_cannot_write_products` — lines **534–542**
- `def test_member_sees_only_own_orders` — lines **545–567**
- `def test_public_products_hide_the_quantity` — lines **573–580**
- `def test_public_products_need_no_token` — lines **583–584**



## `backend/tests/test_social_billing.py`

- **Lines:** 606

- **Purpose:** Pytest module exercising API/services against a real Postgres in Docker.


### Structure outline


- `def _token` — lines **21–24**
- `def _auth` — lines **27–28**
- `def _slot` — lines **31–34**
- `def make_member` — lines **38–64**
- `def _session_body` — lines **67–77**
- `def test_creating_a_session_holds_the_slots` — lines **83–100**
- `def test_social_slots_block_bookings_and_show_as_social` — lines **103–134**
- `def test_a_booking_blocks_a_social_session` — lines **137–158**
- `def test_t11_capacity_two_rejects_the_third_join` — lines **164–197**
- `def test_joining_twice_is_409` — lines **200–221**
- `def test_gold_plays_free_others_pay` — lines **224–255**
- `def test_leaving_refunds_the_fee` — lines **258–294**
- `def test_cancelling_frees_slots_and_refunds` — lines **297–336**
- `def test_member_joins_itself_and_roster_is_staff_only` — lines **339–369**
- `def test_only_managers_create_sessions` — lines **372–378**
- `def test_expense_lifecycle_feeds_payables` — lines **384–416**
- `def test_front_desk_cannot_see_expenses` — lines **419–421**
- `def _client_row` — lines **427–432**
- `def test_invoice_numbering_and_totals` — lines **435–472**
- `def test_mark_paid_creates_exactly_one_payment` — lines **475–520**
- `def test_invoice_must_bill_exactly_one_party` — lines **523–543**
- `def test_invoice_print_escapes_user_text` — lines **546–569**
- `def test_paid_invoice_cannot_be_voided` — lines **572–591**
- `def test_front_desk_reads_invoices_but_cannot_write_them` — lines **594–606**: SRS 3.1 gives FRONT_DESK R on invoices and clients, and nothing more.



---

# Top-level: `docs/`


## `docs/AI_BUILD_PLAYBOOK.md`

- **Lines:** 216

- **Purpose:** Project specification or build documentation.


### Structure outline


File has **216** lines. First lines set context; see repository copy for full text.

**First 15 lines:**

```
# AI Build Playbook: 24-Hour Hackathon Plan
# Project: Champions Club Management System (CCMS)

Companion to `BRD.md`, `PRD.md`, `SRS.md`. Assumes a team of **3** using AI coding assistants. For a team of 2, move all P1 items to "only if ahead of schedule". For a team of 4, add a dedicated QA/security/demo person.

---

## 0. What We Are Delivering

**One responsive web app, hosted locally, installable to a phone home screen (PWA-lite).** Not a separate website, not a native app, not a cloud deployment.

| Question | Answer |
|----------|--------|
| Product form | Single React web app with 3 areas: public site, member portal, staff console |
| Phones | Same app in the phone browser, phone-first layouts for public + member areas, "Add to Home Screen" via manifest |
```


## `docs/BRD.md`

- **Lines:** 245

- **Purpose:** Project specification or build documentation.


### Structure outline


File has **245** lines. First lines set context; see repository copy for full text.

**First 15 lines:**

```
# Business Requirements Document (BRD)
# Project: Champions Club Management System (CCMS)
# Version: 1.1 (local-only, responsive web app + PWA-lite)
# Date: 2026-10-03

---

## 1. Executive Summary

### 1.1 Project Overview
The Champions Club is a growing sports club (tennis, padel, badminton, cricket nets) with a gear shop and a bar/cafeteria. Today it runs on WhatsApp, Excel and paper. CCMS is one web platform that replaces all of it: members, court booking, shop, bar, public website with lead capture, and an owner finance view.

**Deliverable**: a single responsive web application (not separate website/app products) with three areas: a public site, a member portal and a staff console. It works in any modern phone, tablet or desktop browser, can be added to a phone's home screen, and is **hosted entirely locally** (Docker Compose + PostgreSQL) for the hackathon, with phones connecting over the local Wi-Fi.

### 1.2 Business Problem
```


## `docs/DOCUMENTATION_CONTEXT.md`

- **Lines:** 70

- **Purpose:** Project specification or build documentation.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `# Documentation Context: Sports Club Management System ("Champions Club")` |
| 2 | `` |
| 3 | `## Project Overview` |
| 4 | `- **Name**: Champions Club Management System (CCMS)` |
| 5 | `- **Description**: One platform for courts, members, gear shop, bar/cafeteria, public website + l...` |
| 6 | `- **Started**: 2026-10-03` |
| 7 | `- **Constraint**: 24-hour hackathon, AI-assisted coding, security features required, "complete de...` |
| 8 | `- **Deliverable**: ONE responsive web app (public site + member portal + staff console) that can ...` |
| 9 | `- **Status**: Documents complete (revision 2: local-only, responsive web app + PWA-lite), ready f...` |
| 10 | `` |
| 11 | `## Research Notes` |
| 12 | `- Web research skipped on purpose (time-boxed). Stack chosen from mainstream, well-documented too...` |
| 13 | `- Library versions in SRS §1.3 are known-good minimums. **Pin to whatever `pip install` / `npm in...` |
| 14 | `- GST rates in seed data are placeholders. Verify with an accountant before any real use.` |
| 15 | `` |
| 16 | `## Source Document Issues Found` |
| 17 | `1. Title says "tennis, padel and badminton"; club description says "tennis and cricket courts". →...` |
| 18 | `2. "Sessions last an hour, slot opens every half hour" → 1-hour bookings that may start at :00 or...` |
| 19 | `3. "Members pay less than walk-ins, or nothing at all" → exact prices not given. Assumed (see A-05).` |
| 20 | `4. "Share the numbers" → implemented as CSV export + print-friendly report, not live share links.` |
| 21 | `` |
| 22 | `## Assumptions (overrule any of these before build starts)` |
| 23 | `\| ID \| Assumption \|` |
| 24 | `\|----\|-----------\|` |
| 25 | `\| A-01 \| Single club, single branch, single currency (INR). Money stored as integer paise. \|` |
| 26 | `\| A-02 \| Timezone Asia/Kolkata. Stored UTC, displayed IST. Club hours 06:00–22:00, last start 2...` |
| 27 | `\| A-03 \| Roles: OWNER, MANAGER, FRONT_DESK, BAR_STAFF, MEMBER. Shop counter sales are done by F...` |
| 28 | `\| A-04 \| Gold = free courts; Silver and Junior = discounted court rates; walk-ins pay full rate...` |
| 29 | `\| A-05 \| Seed pricing (INR/hour, tennis): Walk-in 600, Silver 400, Junior 250, Gold 0. Shop/bar...` |
| 30 | `\| A-06 \| "Max twice a day" applies to **members' exclusive bookings** per calendar day (IST). C...` |
| 31 | `\| A-07 \| Free cancellation up to 2 hours before start (paid bookings refunded). Later cancellat...` |
| 32 | `\| A-08 \| Social play: Friday 18:00–22:00 on designated courts, capacity per session (default 8)...` |
| 33 | `\| A-09 \| Payments are **simulated**. Cash/Card/UPI are recorded by staff; "online" = mock check...` |
| 34 | `\| A-10 \| No real email/SMS. Notifications are in-app (bell icon) + server log line. \|` |
| 35 | `\| A-11 \| Membership expiry is computed on read (no cron). Expiring-soon = within 7 days. \|` |
| 36 | `\| A-12 \| Prices are tax-inclusive. Tax = amount × rate / (100 + rate). Seed rates: courts 18%, ...` |
| 37 | `\| A-13 \| Invoices are printable HTML pages (browser Print → PDF). No server-side PDF generation...` |
| 38 | `\| A-14 \| Payroll = monthly record per employee (base − manual deductions). No statutory complia...` |
| 39 | `\| A-15 \| Online shop orders require a logged-in member. Delivery = address captured + status up...` |
| 40 | `\| A-16 \| **Deliverable = one responsive web app.** Phone-first layout for public site and membe...` |
| 41 | `\| A-17 \| **Everything runs locally**: `docker compose up` (PostgreSQL + API + web). No cloud, n...` |
| 42 | `\| A-18 \| **No camera QR scanning.** Member QR is displayed on the profile; staff look members u...` |
| 43 | `` |
| 44 | `## Tech Stack Decisions` |
| 45 | `- **Backend**: FastAPI + SQLAlchemy 2.0 (**sync**, not async: fewer subtle bugs for AI-generated ...` |
| 46 | `- **Frontend**: React 18 + Vite + TypeScript + Tailwind 3.4 (not v4, avoids config churn) + TanSt...` |
| 47 | `- **Contract**: FastAPI OpenAPI → `openapi-typescript` generates frontend types, so backend/front...` |
| 48 | `- **No Alembic**: `create_all()` + `seed.py` + `reset_db.sh`. Migrations are a time sink in 24h.` |
| 49 | `- **IDs**: integer PKs (not UUID) for simplicity; every endpoint enforces ownership checks anyway.` |
| 50 | `- **Double-booking prevention**: DB-level `UNIQUE(court_id, slot_start)` on a `court_slots` table...` |
| 51 | `- **Hosting**: local only. Dev: `docker compose up db api` + Vite dev server (hot reload). Demo: ...` |
| 52 | `- **Same-origin by design**: phones load the app and call `/api` through the same origin (nginx/V...` |
| 53 | `- **Client IP behind the proxy**: nginx/Vite forward `X-Forwarded-For`; uvicorn runs with `--prox...` |
| 54 | `- **PWA-lite**: `manifest.webmanifest` + icons + theme colour only. Skip service workers (common ...` |
| 55 | `- **Cookie flag**: `COOKIE_SECURE=false` locally (plain http); must be `true` if ever deployed be...` |
| 56 | `` |
| 57 | `## Document Status` |
| 58 | `- [x] BRD: docs/BRD.md` |
| 59 | `- [x] PRD: docs/PRD.md` |
| 60 | `- [x] SRS: docs/SRS.md` |
| 61 | `- [x] AI Build Playbook: docs/AI_BUILD_PLAYBOOK.md (extra: timeline, scope tiers, anti-loop rules)` |
| 62 | `` |
| 63 | `## Next Steps` |
| 64 | `→ cto-architect / orchestrator-master: confirm assumptions A-01…A-18, then start at Playbook Hour 0.` |
| 65 | `` |
| 66 | `## Changelog` |
| 67 | `\| Date \| Change \|` |
| 68 | `\|------\|--------\|` |
| 69 | `\| 2026-10-03 \| Initial analysis, BRD/PRD/SRS/Playbook generated \|` |
| 70 | `\| 2026-10-03 \| Revision 2: deliverable defined (responsive web app + PWA-lite), local-only host...` |


## `docs/PRD.md`

- **Lines:** 251

- **Purpose:** Project specification or build documentation.


### Structure outline


File has **251** lines. First lines set context; see repository copy for full text.

**First 15 lines:**

```
# Product Requirements Document (PRD)
# Project: Champions Club Management System (CCMS)
# Version: 1.1 (local-only, responsive web app + PWA-lite)
# Date: 2026-10-03

---

## 1. Product Vision

### 1.1 Problem Statement
Club staff and members lose time and money because bookings, members, stock, bar bills and revenue live in WhatsApp, Excel and paper. Nothing connects, so double bookings happen, tabs are lost, enquiries vanish, and the owner is blind.

### 1.2 Solution Overview
**One responsive web app** (single codebase, single backend) with three faces. It runs locally via Docker Compose; phones, tablets and laptops open it in a browser on the same Wi-Fi, and phones can add it to the home screen.

```


## `docs/SRS.md`

- **Lines:** 800

- **Purpose:** Project specification or build documentation.


### Structure outline


File has **800** lines. First lines set context; see repository copy for full text.

**First 15 lines:**

```
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
```


## `docs/_reference_deep_dive.md`

- **Lines:** 360

- **Purpose:** Project specification or build documentation.


### Structure outline


File has **360** lines. First lines set context; see repository copy for full text.

**First 15 lines:**

```
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
```


---

# Top-level: `frontend/`


## `frontend/Dockerfile`

- **Lines:** 12

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `# Build context is the repo root (nginx.conf lives there, per SRS 2.2).` |
| 2 | `FROM node:20-alpine AS build` |
| 3 | `WORKDIR /app` |
| 4 | `COPY frontend/package.json frontend/package-lock.json ./` |
| 5 | `RUN npm ci` |
| 6 | `COPY frontend/ ./` |
| 7 | `RUN npm run build` |
| 8 | `` |
| 9 | `FROM nginx:alpine` |
| 10 | `COPY nginx.conf /etc/nginx/conf.d/default.conf` |
| 11 | `COPY --from=build /app/dist /usr/share/nginx/html` |
| 12 | `EXPOSE 80` |


## `frontend/index.html`

- **Lines:** 14

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `<!doctype html>` |
| 2 | `<html lang="en">` |
| 3 | `  <head>` |
| 4 | `    <meta charset="UTF-8" />` |
| 5 | `    <meta name="viewport" content="width=device-width, initial-scale=1.0" />` |
| 6 | `    <meta name="theme-color" content="#0f172a" />` |
| 7 | `    <link rel="manifest" href="/manifest.webmanifest" />` |
| 8 | `    <title>Champions Club</title>` |
| 9 | `  </head>` |
| 10 | `  <body>` |
| 11 | `    <div id="root"></div>` |
| 12 | `    <script type="module" src="/src/main.tsx"></script>` |
| 13 | `  </body>` |
| 14 | `</html>` |


## `frontend/package.json`

- **Lines:** 34

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `{` |
| 2 | `  "name": "ccms-frontend",` |
| 3 | `  "private": true,` |
| 4 | `  "version": "1.0.0",` |
| 5 | `  "type": "module",` |
| 6 | `  "scripts": {` |
| 7 | `    "dev": "vite",` |
| 8 | `    "build": "vite build",` |
| 9 | `    "preview": "vite preview",` |
| 10 | `    "typecheck": "tsc --noEmit",` |
| 11 | `    "gen:api": "openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.d.ts"` |
| 12 | `  },` |
| 13 | `  "dependencies": {` |
| 14 | `    "@tanstack/react-query": "^5.62.0",` |
| 15 | `    "clsx": "^2.1.1",` |
| 16 | `    "lucide-react": "^0.468.0",` |
| 17 | `    "qrcode.react": "^3.2.0",` |
| 18 | `    "react": "^18.3.1",` |
| 19 | `    "react-dom": "^18.3.1",` |
| 20 | `    "react-router-dom": "^6.28.0",` |
| 21 | `    "recharts": "^2.14.0"` |
| 22 | `  },` |
| 23 | `  "devDependencies": {` |
| 24 | `    "@types/react": "^18.3.12",` |
| 25 | `    "@types/react-dom": "^18.3.1",` |
| 26 | `    "@vitejs/plugin-react": "^4.3.4",` |
| 27 | `    "autoprefixer": "^10.4.20",` |
| 28 | `    "openapi-typescript": "^7.4.4",` |
| 29 | `    "postcss": "^8.4.49",` |
| 30 | `    "tailwindcss": "^3.4.17",` |
| 31 | `    "typescript": "^5.6.3",` |
| 32 | `    "vite": "^5.4.11"` |
| 33 | `  }` |
| 34 | `}` |


## `frontend/postcss.config.js`

- **Lines:** 6

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `export default {` |
| 2 | `  plugins: {` |
| 3 | `    tailwindcss: {},` |
| 4 | `    autoprefixer: {},` |
| 5 | `  },` |
| 6 | `}` |


## `frontend/public/manifest.webmanifest`

- **Lines:** 12

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `{` |
| 2 | `  "name": "Champions Club Management System",` |
| 3 | `  "short_name": "Champions Club",` |
| 4 | `  "start_url": "/",` |
| 5 | `  "display": "standalone",` |
| 6 | `  "background_color": "#ffffff",` |
| 7 | `  "theme_color": "#0f172a",` |
| 8 | `  "icons": [` |
| 9 | `    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },` |
| 10 | `    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }` |
| 11 | `  ]` |
| 12 | `}` |


## `frontend/src/api/.gitkeep`

- **Lines:** 0

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|


## `frontend/src/api/client.ts`

- **Lines:** 182

- **Purpose:** Fetch wrapper: in-memory access token, refresh-on-401, ApiError envelope.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import type { AuthUser, TokenResponse } from './types'` |
| 2 | `` |
| 3 | `const API_BASE = '/api/v1'` |
| 4 | `` |
| 5 | `/**` |
| 6 | ` * In-memory access token storage (SRS §7, S-02).` |
| 7 | ` * NEVER persisted to localStorage or sessionStorage.` |
| 8 | ` */` |
| 9 | `let inMemoryAccessToken: string \| null = null` |
| 10 | `let onAuthFailureCallback: (() => void) \| null = null` |
| 11 | `` |
| 12 | `export function getAccessToken(): string \| null {` |
| 13 | `  return inMemoryAccessToken` |
| 14 | `}` |
| 15 | `` |
| 16 | `export function setAccessToken(token: string \| null) {` |
| 17 | `  inMemoryAccessToken = token` |
| 18 | `}` |
| 19 | `` |
| 20 | `export function setOnAuthFailure(callback: () => void) {` |
| 21 | `  onAuthFailureCallback = callback` |
| 22 | `}` |
| 23 | `` |
| 24 | `/**` |
| 25 | ` * Typed API Error matching SRS §6 envelope:` |
| 26 | ` * { "error": { "code": "...", "message": "...", "details": {...} } }` |
| 27 | ` */` |
| 28 | `export class ApiError extends Error {` |
| 29 | `  constructor(` |
| 30 | `    public status: number,` |
| 31 | `    public code: string,` |
| 32 | `    message: string,` |
| 33 | `    public details?: Record<string, unknown>,` |
| 34 | `  ) {` |
| 35 | `    super(message)` |
| 36 | `    this.name = 'ApiError'` |
| 37 | `  }` |
| 38 | `}` |
| 39 | `` |
| 40 | `/**` |
| 41 | ` * Single in-flight refresh promise so parallel requests share one refresh cycle.` |
| 42 | ` */` |
| 43 | `let refreshPromise: Promise<TokenResponse \| null> \| null = null` |
| 44 | `` |
| 45 | `export async function refreshSession(): Promise<TokenResponse \| null> {` |
| 46 | `  if (!refreshPromise) {` |
| 47 | `    refreshPromise = (async () => {` |
| 48 | `      try {` |
| 49 | `        const res = await fetch(`${API_BASE}/auth/refresh`, {` |
| 50 | `          method: 'POST',` |
| 51 | `          headers: { 'Content-Type': 'application/json' },` |
| 52 | `          credentials: 'include',` |
| 53 | `        })` |
| 54 | `` |
| 55 | `        if (!res.ok) {` |
| 56 | `          setAccessToken(null)` |
| 57 | `          return null` |
| 58 | `        }` |
| 59 | `` |
| 60 | `        const data: TokenResponse = await res.json()` |
| 61 | `        setAccessToken(data.access_token)` |
| 62 | `        return data` |
| 63 | `      } catch {` |
| 64 | `        setAccessToken(null)` |
| 65 | `        return null` |
| 66 | `      } finally {` |
| 67 | `        refreshPromise = null` |
| 68 | `      }` |
| 69 | `    })()` |
| 70 | `  }` |
| 71 | `` |
| 72 | `  return refreshPromise` |
| 73 | `}` |
| 74 | `` |
| 75 | `/**` |
| 76 | ` * Core HTTP request handler.` |
| 77 | ` * - Same-origin baseUrl: /api/v1 (forwarded by Vite dev proxy / nginx)` |
| 78 | ` * - Credentials: 'include' for HttpOnly refresh cookie` |
| 79 | ` * - In-memory access token attached via Authorization header` |
| 80 | ` * - Automatic 401 TOKEN_EXPIRED refresh & retry (single retry, no loops)` |
| 81 | ` */` |
| 82 | `async function request<T>(path: string, options: RequestInit = {}, isRetry = false): Promise<T> {` |
| 83 | `  const url = `${API_BASE}${path}`` |
| 84 | `  const headers = new Headers(options.headers)` |
| 85 | `` |
| 86 | `  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {` |
| 87 | `    headers.set('Content-Type', 'application/json')` |
| 88 | `  }` |
| 89 | `` |
| 90 | `  // Attach in-memory JWT if available` |
| 91 | `  const token = getAccessToken()` |
| 92 | `  if (token && !headers.has('Authorization')) {` |
| 93 | `    headers.set('Authorization', `Bearer ${token}`)` |
| 94 | `  }` |
| 95 | `` |
| 96 | `  let res: Response` |
| 97 | `  try {` |
| 98 | `    res = await fetch(url, {` |
| 99 | `      ...options,` |
| 100 | `      headers,` |
| 101 | `      credentials: 'include',` |
| 102 | `    })` |
| 103 | `  } catch (netErr: any) {` |
| 104 | `    throw new ApiError(0, 'NETWORK_ERROR', netErr?.message \|\| 'Network connection error')` |
| 105 | `  }` |
| 106 | `` |
| 107 | `  // Handle 401 TOKEN_EXPIRED with single refresh & retry` |
| 108 | `  if (res.status === 401 && !isRetry && !path.startsWith('/auth/login') && !path.startsWith('/aut...` |
| 109 | `    const refreshed = await refreshSession()` |
| 110 | `    if (refreshed) {` |
| 111 | `      return request<T>(path, options, true)` |
| 112 | `    } else {` |
| 113 | `      onAuthFailureCallback?.()` |
| 114 | `      throw new ApiError(401, 'TOKEN_EXPIRED', 'Your session has expired. Please sign in again.')` |
| 115 | `    }` |
| 116 | `  }` |
| 117 | `` |
| 118 | `  if (!res.ok) {` |
| 119 | `    const body = await res.json().catch(() => null)` |
| 120 | `    const code = body?.error?.code ?? `HTTP_${res.status}`` |
| 121 | `    const message = body?.error?.message ?? res.statusText` |
| 122 | `    const details = body?.error?.details` |
| 123 | `    throw new ApiError(res.status, code, message, details)` |
| 124 | `  }` |
| 125 | `` |
| 126 | `  // 204 No Content` |
| 127 | `  if (res.status === 204) return undefined as T` |
| 128 | `` |
| 129 | `  return res.json()` |
| 130 | `}` |
| 131 | `` |
| 132 | `// ── Generic HTTP Methods ───────────────────────────────────────────────────` |
| 133 | `export const api = {` |
| 134 | `  get: <T>(path: string, options?: RequestInit) => request<T>(path, { ...options, method: 'GET' }),` |
| 135 | `  post: <T>(path: string, body?: unknown, options?: RequestInit) =>` |
| 136 | `    request<T>(path, {` |
| 137 | `      ...options,` |
| 138 | `      method: 'POST',` |
| 139 | `      body: body !== undefined ? JSON.stringify(body) : undefined,` |
| 140 | `    }),` |
| 141 | `  patch: <T>(path: string, body: unknown, options?: RequestInit) =>` |
| 142 | `    request<T>(path, { ...options, method: 'PATCH', body: JSON.stringify(body) }),` |
| 143 | `  put: <T>(path: string, body: unknown, options?: RequestInit) =>` |
| 144 | `    request<T>(path, { ...options, method: 'PUT', body: JSON.stringify(body) }),` |
| 145 | `  delete: <T>(path: string, options?: RequestInit) =>` |
| 146 | `    request<T>(path, { ...options, method: 'DELETE' }),` |
| 147 | `}` |
| 148 | `` |
| 149 | `// ── Real Auth API Endpoints (SRS §3.2.1) ────────────────────────────────────` |
| 150 | `export async function loginApi(email: string, password: string): Promise<TokenResponse> {` |
| 151 | `  return api.post<TokenResponse>('/auth/login', { email, password })` |
| 152 | `}` |
| 153 | `` |
| 154 | `export async function refreshApi(): Promise<TokenResponse> {` |
| 155 | `  return api.post<TokenResponse>('/auth/refresh')` |
| 156 | `}` |
| 157 | `` |
| 158 | `export async function logoutApi(): Promise<{ status: string }> {` |
| 159 | `  return api.post<{ status: string }>('/auth/logout')` |
| 160 | `}` |
| 161 | `` |
| 162 | `export async function getMeApi(): Promise<AuthUser> {` |
| 163 | `  return api.get<AuthUser>('/auth/me')` |
| 164 | `}` |
| 165 | `` |
| 166 | `export async function downloadPaymentsCsvApi(from?: string, to?: string): Promise<Blob> {` |
| 167 | `  const params = new URLSearchParams()` |
| 168 | `  if (from) params.set('from', from)` |
| 169 | `  if (to) params.set('to', to)` |
| 170 | `  const path = `/reports/payments.csv${params.toString() ? `?${params.toString()}` : ''}`` |
| 171 | `  const url = `${API_BASE}${path}`` |
| 172 | `  const token = getAccessToken()` |
| 173 | `  const headers = new Headers()` |
| 174 | `  if (token) headers.set('Authorization', `Bearer ${token}`)` |
| 175 | `` |
| 176 | `  const res = await fetch(url, { headers, credentials: 'include' })` |
| 177 | `  if (!res.ok) {` |
| 178 | `    const body = await res.json().catch(() => null)` |
| 179 | `    throw new ApiError(res.status, body?.error?.code ?? `HTTP_${res.status}`, body?.error?.messag...` |
| 180 | `  }` |
| 181 | `  return res.blob()` |
| 182 | `}` |


## `frontend/src/api/hooks/index.ts`

- **Lines:** 920

- **Purpose:** Project asset; see contents and parent folder context below.


### Structure outline


- const `USE_MOCKS` — line **97**
- export function `useErrorSimulation` — line **100**
- export function `useCourts` — line **109**
- export function `useCourtAvailability` — line **122**
- const `params` — line **130**
- export function `useBookings` — line **140**
- const `params` — line **148**
- const `res` — line **154**
- export function `useCreateBooking` — line **162**
- const `qc` — line **163**
- export function `useCancelBooking` — line **180**
- const `qc` — line **181**
- export function `useUpdateBookingStatus` — line **198**
- const `qc` — line **199**
- export const `useSetBookingStatus` — line **215**
- export function `usePayBooking` — line **217**
- const `qc` — line **218**
- export function `useMembers` — line **235**
- export function `useMember` — line **245**
- export function `useMemberByCode` — line **256**
- export function `useCreateMember` — line **268**
- const `qc` — line **269**
- export function `useProducts` — line **283**
- export function `useLowStockProducts` — line **293**
- export function `useCreateShopOrder` — line **303**
- const `qc` — line **304**
- export function `useCancelShopOrder` — line **319**
- const `qc` — line **320**
- export function `useRestockProduct` — line **335**
- const `qc` — line **336**
- export function `useCreateProduct` — line **349**
- const `qc` — line **350**
- export function `useUpdateProduct` — line **363**
- const `qc` — line **364**
- export function `useMenuItems` — line **378**
- export function `useBarTables` — line **391**
- export function `useBarOrders` — line **404**
- const `params` — line **416**
- const `page` — line **424**
- export function `useCreateBarOrder` — line **430**
- const `qc` — line **431**
- export function `useAddBarOrderItems` — line **448**
- const `qc` — line **449**
- export function `useSetKitchenStatus` — line **465**
- const `qc` — line **466**
- export function `usePayBarOrder` — line **481**
- const `qc` — line **482**
- export function `usePutOnTab` — line **500**
- const `qc` — line **501**
- export function `useSettleTabs` — line **517**
- *(more symbols omitted)*



## `frontend/src/api/schema.d.ts`

- **Lines:** 6589

- **Purpose:** Project asset; see contents and parent folder context below.


### Structure outline


- export interface `paths` — line **6**
- export type `webhooks` — line **1540**
- export interface `components` — line **1541**
- export interface `operations` — line **3143**



## `frontend/src/api/types.ts`

- **Lines:** 610

- **Purpose:** Project asset; see contents and parent folder context below.


### Structure outline


- export type `Role` — line **12**
- export interface `AuthUser` — line **15**
- export interface `TokenResponse` — line **23**
- export interface `LoginRequest` — line **30**
- export type `Sport` — line **35**
- export type `Tier` — line **37**
- export type `PlanCode` — line **39**
- export type `MemberStatus` — line **41**
- export type `MembershipStatus` — line **43**
- export type `BookingStatus` — line **45**
- export type `BookingSource` — line **47**
- export type `PaymentStatus` — line **49**
- export type `PaymentMethod` — line **51**
- export type `ProductCategory` — line **53**
- export type `ShopChannel` — line **55**
- export type `ShopFulfilment` — line **57**
- export type `ShopOrderStatus` — line **59**
- export type `MenuCategory` — line **61**
- export type `KitchenStatus` — line **63**
- export type `SourceType` — line **65**
- export interface `Plan` — line **68**
- export interface `CourtPrice` — line **78**
- export interface `Court` — line **86**
- export type `SlotState` — line **93**
- export interface `CourtSlotAvailability` — line **95**
- export interface `CourtAvailability` — line **106**
- export interface `CourtAvailabilityResponse` — line **113**
- export type `PublicSlotState` — line **120**
- export interface `PublicCourtSlot` — line **122**
- export interface `PublicCourtAvailability` — line **127**
- export interface `PublicAvailabilityResponse` — line **134**
- export interface `PublicProduct` — line **142**
- export type `LeadInterest` — line **154**
- export interface `PublicEnquiryInput` — line **156**
- export interface `PublicEnquiryResponse` — line **166**
- export interface `Booking` — line **172**
- export interface `BookingCreateInput` — line **188**
- export interface `BookingCancelResponse` — line **198**
- export interface `SocialSessionParticipant` — line **206**
- export interface `SocialSession` — line **212**
- export interface `SocialSessionJoinInput` — line **227**
- export interface `Membership` — line **234**
- export interface `Member` — line **243**
- export interface `MemberCreateInput` — line **257**
- export type `LeadStatus` — line **269**
- export interface `Lead` — line **271**
- export interface `PaginatedLeads` — line **284**
- export interface `LeadUpdateInput` — line **291**
- export interface `LeadNote` — line **296**
- export interface `Quote` — line **304**
- *(more symbols omitted)*



## `frontend/src/components/.gitkeep`

- **Lines:** 0

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|


## `frontend/src/components/features/CourtScheduleGrid.tsx`

- **Lines:** 350

- **Purpose:** Reusable UI or layout component.


### Structure outline


- export interface `CourtScheduleGridProps` — line **10**
- export function `CourtScheduleGrid` — line **17**
- const `activeSport` — line **26**
- const `sevenDays` — line **31**
- const `list` — line **32**
- const `dt` — line **35**
- const `todayStr` — line **41**
- const `isToday` — line **42**
- const `currentNowSlotIndex` — line **45**
- const `now` — line **47**
- const `istHours` — line **49**
- const `istMinutes` — line **50**
- const `totalHalfHours` — line **52**
- const `timeHeaders` — line **57**
- const `list` — line **58**
- const `hh` — line **60**
- const `isPast` — line **198**
- const `isNowSlot` — line **199**
- const `isDayToday` — line **281**
- const `dateObj` — line **282**
- const `dayName` — line **283**
- const `dayNum` — line **284**
- const `slotIso` — line **299**
- const `booking` — line **300**
- const `c` — line **329**



## `frontend/src/components/layout/AppShell.tsx`

- **Lines:** 56

- **Purpose:** Reusable UI or layout component.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import { Outlet } from 'react-router-dom'` |
| 2 | `import { IconRail, BottomTabBar } from './IconRail'` |
| 3 | `import { TopBar } from './TopBar'` |
| 4 | `` |
| 5 | `/**` |
| 6 | ` * AppShell: the main layout container.` |
| 7 | ` *` |
| 8 | ` * Desktop (≥768px):` |
| 9 | ` *   ┌──────────────────────────────────────────────────┐` |
| 10 | ` *   │  canvas (cool grey-blue background)              │` |
| 11 | ` *   │ ┌──┐ ┌─────────────────────────────────────────┐ │` |
| 12 | ` *   │ │  │ │ rounded-[32px] main container            │ │` |
| 13 | ` *   │ │  │ │ ┌──── TopBar ────────────────────────┐  │ │` |
| 14 | ` *   │ │Ic│ │ │  [pill tabs]        [🔍] [🔔] [👤] │  │ │` |
| 15 | ` *   │ │on│ │ └────────────────────────────────────┘  │ │` |
| 16 | ` *   │ │  │ │                                         │ │` |
| 17 | ` *   │ │Ra│ │  ┌─── Content (Outlet) ──────────────┐  │ │` |
| 18 | ` *   │ │il│ │  │                                    │  │ │` |
| 19 | ` *   │ │  │ │  └────────────────────────────────────┘  │ │` |
| 20 | ` *   │ └──┘ └─────────────────────────────────────────┘ │` |
| 21 | ` *   └──────────────────────────────────────────────────┘` |
| 22 | ` *` |
| 23 | ` * Mobile (<768px):` |
| 24 | ` *   ┌────────────────────────┐` |
| 25 | ` *   │ [☰]  Page Title  [🔔]👤│  ← TopBar` |
| 26 | ` *   │                        │` |
| 27 | ` *   │  Content (Outlet)      │` |
| 28 | ` *   │                        │` |
| 29 | ` *   │ [🏠] [👥] [📅] [🛒] [👤] │  ← BottomTabBar` |
| 30 | ` *   └────────────────────────┘` |
| 31 | ` */` |
| 32 | `export function AppShell() {` |
| 33 | `  return (` |
| 34 | `    <div className="min-h-screen bg-canvas p-2 md:p-4 lg:p-5">` |
| 35 | `      <div className="flex gap-3 h-full min-h-[calc(100vh-2.5rem)]">` |
| 36 | `        {/* Desktop icon rail */}` |
| 37 | `        <div className="hidden md:flex flex-col sticky top-4 self-start">` |
| 38 | `          <IconRail />` |
| 39 | `        </div>` |
| 40 | `` |
| 41 | `        {/* Main container */}` |
| 42 | `        <div className="flex-1 bg-surface/40 rounded-shell border border-border-light/40 flex fle...` |
| 43 | `          <TopBar />` |
| 44 | `` |
| 45 | `          {/* Content area */}` |
| 46 | `          <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-bottombar md:pb-6">` |
| 47 | `            <Outlet />` |
| 48 | `          </main>` |
| 49 | `        </div>` |
| 50 | `      </div>` |
| 51 | `` |
| 52 | `      {/* Mobile bottom tab bar */}` |
| 53 | `      <BottomTabBar />` |
| 54 | `    </div>` |
| 55 | `  )` |
| 56 | `}` |


## `frontend/src/components/layout/IconRail.tsx`

- **Lines:** 86

- **Purpose:** Reusable UI or layout component.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import { useLocation, useNavigate } from 'react-router-dom'` |
| 2 | `import { useAuth } from '../../hooks/useAuth'` |
| 3 | `import { getNavItems, type NavItem } from '../../lib/nav-config'` |
| 4 | `import { IconRailItem } from '../ui/IconRailItem'` |
| 5 | `import { cn } from '../../lib/utils'` |
| 6 | `` |
| 7 | `// ── Desktop: Floating pill icon rail on the left ───────────────────────────` |
| 8 | `export function IconRail() {` |
| 9 | `  const { user } = useAuth()` |
| 10 | `  const location = useLocation()` |
| 11 | `  const navigate = useNavigate()` |
| 12 | `` |
| 13 | `  const navItems = getNavItems(user?.role)` |
| 14 | `` |
| 15 | `  return (` |
| 16 | `    <nav` |
| 17 | `      aria-label="Main navigation"` |
| 18 | `      className="hidden md:flex flex-col items-center gap-1 w-rail py-4 bg-surface rounded-full s...` |
| 19 | `    >` |
| 20 | `      {/* Logo / home */}` |
| 21 | `      <button` |
| 22 | `        onClick={() => navigate(user?.role === 'MEMBER' ? '/portal' : '/staff')}` |
| 23 | `        className="flex items-center justify-center w-10 h-10 rounded-xl mb-2 bg-primary-500 text...` |
| 24 | `        aria-label="Home"` |
| 25 | `      >` |
| 26 | `        CC` |
| 27 | `      </button>` |
| 28 | `` |
| 29 | `      <div className="flex-1 flex flex-col items-center gap-0.5 overflow-y-auto scrollbar-hide py...` |
| 30 | `        {navItems.map((item) => (` |
| 31 | `          <IconRailItem` |
| 32 | `            key={item.id}` |
| 33 | `            icon={item.icon}` |
| 34 | `            label={item.label}` |
| 35 | `            active={isActive(item.path, location.pathname)}` |
| 36 | `            onClick={() => navigate(item.path)}` |
| 37 | `          />` |
| 38 | `        ))}` |
| 39 | `      </div>` |
| 40 | `    </nav>` |
| 41 | `  )` |
| 42 | `}` |
| 43 | `` |
| 44 | `// ── Mobile: Bottom tab bar ─────────────────────────────────────────────────` |
| 45 | `export function BottomTabBar() {` |
| 46 | `  const { user } = useAuth()` |
| 47 | `  const location = useLocation()` |
| 48 | `  const navigate = useNavigate()` |
| 49 | `` |
| 50 | `  const navItems = getNavItems(user?.role).filter((i) => i.mobileBar)` |
| 51 | `` |
| 52 | `  return (` |
| 53 | `    <nav` |
| 54 | `      aria-label="Main navigation"` |
| 55 | `      className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around bg...` |
| 56 | `    >` |
| 57 | `      {navItems.slice(0, 5).map((item) => {` |
| 58 | `        const active = isActive(item.path, location.pathname)` |
| 59 | `        const Icon = item.icon` |
| 60 | `        return (` |
| 61 | `          <button` |
| 62 | `            key={item.id}` |
| 63 | `            onClick={() => navigate(item.path)}` |
| 64 | `            className={cn(` |
| 65 | `              'flex flex-col items-center justify-center gap-0.5 flex-1 py-1 touch-target transit...` |
| 66 | `              active ? 'text-primary-500' : 'text-text-tertiary',` |
| 67 | `            )}` |
| 68 | `          >` |
| 69 | `            <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />` |
| 70 | `            <span className="text-[10px] font-medium leading-tight">{item.label}</span>` |
| 71 | `          </button>` |
| 72 | `        )` |
| 73 | `      })}` |
| 74 | `    </nav>` |
| 75 | `  )` |
| 76 | `}` |
| 77 | `` |
| 78 | `// ── Helpers ─────────────────────────────────────────────────────────────────` |
| 79 | `function isActive(itemPath: string, currentPath: string): boolean {` |
| 80 | `  // Exact match for index routes, prefix for sub-routes` |
| 81 | `  if (itemPath === '/staff' \|\| itemPath === '/portal') {` |
| 82 | `    return currentPath === itemPath` |
| 83 | `  }` |
| 84 | `  return currentPath.startsWith(itemPath)` |
| 85 | `}` |
| 86 | `` |


## `frontend/src/components/layout/PublicLayout.tsx`

- **Lines:** 264

- **Purpose:** Reusable UI or layout component.


### Structure outline


- const `NAV_ITEMS` — line **27**
- export function `PublicLayout` — line **35**
- const `location` — line **37**
- const `isActive` — line **66**
- const `isActive` — line **124**



## `frontend/src/components/layout/RoleGuard.tsx`

- **Lines:** 31

- **Purpose:** Reusable UI or layout component.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import type { ReactNode } from 'react'` |
| 2 | `import { Navigate } from 'react-router-dom'` |
| 3 | `import { useAuth } from '../../hooks/useAuth'` |
| 4 | `import type { Role } from '../../lib/auth-context'` |
| 5 | `` |
| 6 | `export interface RoleGuardProps {` |
| 7 | `  /** Allowed roles. If empty, any authenticated user is allowed. */` |
| 8 | `  allowed?: Role[]` |
| 9 | `  children: ReactNode` |
| 10 | `}` |
| 11 | `` |
| 12 | `/**` |
| 13 | ` * Guards a route tree by role.` |
| 14 | ` * - Not authenticated → redirect to /login` |
| 15 | ` * - Authenticated but wrong role → redirect to home for that role` |
| 16 | ` */` |
| 17 | `export function RoleGuard({ allowed, children }: RoleGuardProps) {` |
| 18 | `  const { user, isAuthenticated } = useAuth()` |
| 19 | `` |
| 20 | `  if (!isAuthenticated \|\| !user) {` |
| 21 | `    return <Navigate to="/login" replace />` |
| 22 | `  }` |
| 23 | `` |
| 24 | `  if (allowed && allowed.length > 0 && !allowed.includes(user.role)) {` |
| 25 | `    // Send to the appropriate home for their role` |
| 26 | `    const home = user.role === 'MEMBER' ? '/portal' : '/staff'` |
| 27 | `    return <Navigate to={home} replace />` |
| 28 | `  }` |
| 29 | `` |
| 30 | `  return <>{children}</>` |
| 31 | `}` |


## `frontend/src/components/layout/TopBar.tsx`

- **Lines:** 319

- **Purpose:** Reusable UI or layout component.


### Structure outline


- export interface `TopBarProps` — line **13**
- const `ROLE_LABELS` — line **17**
- const `ALL_ROLES` — line **25**
- export function `TopBar` — line **27**
- const `navigate` — line **29**
- const `location` — line **30**
- const `markReadMutation` — line **48**
- const `isForbiddenOrNotFound` — line **50**
- const `unreadCount` — line **54**
- const `notifications` — line **55**
- const `navItems` — line **57**
- const `tabs` — line **58**
- const `activeTab` — line **59**
- const `NotifIcon` — line **61**
- const `handleNotificationClick` — line **63**
- const `item` — line **97**
- const `isUnread` — line **157**
- function `MobileNavList` — line **270**
- const `navigate` — line **272**
- const `location` — line **273**
- const `sections` — line **276**
- function `NavButton` — line **298**
- const `active` — line **299**
- const `Icon` — line **300**
- function `isActive` — line **315**



## `frontend/src/components/ui/Avatar.tsx`

- **Lines:** 63

- **Purpose:** Reusable UI or layout component.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import { cn, getInitials } from '../../lib/utils'` |
| 2 | `` |
| 3 | `export interface AvatarProps {` |
| 4 | `  name: string` |
| 5 | `  src?: string \| null` |
| 6 | `  size?: 'xs' \| 'sm' \| 'md' \| 'lg'` |
| 7 | `  className?: string` |
| 8 | `}` |
| 9 | `` |
| 10 | `const sizeMap = {` |
| 11 | `  xs: 'w-6 h-6 text-[10px]',` |
| 12 | `  sm: 'w-8 h-8 text-xs',` |
| 13 | `  md: 'w-10 h-10 text-sm',` |
| 14 | `  lg: 'w-14 h-14 text-lg',` |
| 15 | `}` |
| 16 | `` |
| 17 | `const colorPairs = [` |
| 18 | `  ['bg-primary-100', 'text-primary-700'],` |
| 19 | `  ['bg-purple-100', 'text-purple-700'],` |
| 20 | `  ['bg-emerald-100', 'text-emerald-700'],` |
| 21 | `  ['bg-amber-100', 'text-amber-700'],` |
| 22 | `  ['bg-rose-100', 'text-rose-700'],` |
| 23 | `  ['bg-teal-100', 'text-teal-700'],` |
| 24 | `  ['bg-indigo-100', 'text-indigo-700'],` |
| 25 | `]` |
| 26 | `` |
| 27 | `function colorFor(name: string) {` |
| 28 | `  let hash = 0` |
| 29 | `  for (let i = 0; i < name.length; i++) {` |
| 30 | `    hash = name.charCodeAt(i) + ((hash << 5) - hash)` |
| 31 | `  }` |
| 32 | `  return colorPairs[Math.abs(hash) % colorPairs.length]` |
| 33 | `}` |
| 34 | `` |
| 35 | `export function Avatar({ name, src, size = 'md', className }: AvatarProps) {` |
| 36 | `  const initials = getInitials(name)` |
| 37 | `  const [bg, fg] = colorFor(name)` |
| 38 | `` |
| 39 | `  if (src) {` |
| 40 | `    return (` |
| 41 | `      <img` |
| 42 | `        src={src}` |
| 43 | `        alt={name}` |
| 44 | `        className={cn('rounded-full object-cover', sizeMap[size], className)}` |
| 45 | `      />` |
| 46 | `    )` |
| 47 | `  }` |
| 48 | `` |
| 49 | `  return (` |
| 50 | `    <span` |
| 51 | `      aria-label={name}` |
| 52 | `      className={cn(` |
| 53 | `        'inline-flex items-center justify-center rounded-full font-semibold select-none',` |
| 54 | `        sizeMap[size],` |
| 55 | `        bg,` |
| 56 | `        fg,` |
| 57 | `        className,` |
| 58 | `      )}` |
| 59 | `    >` |
| 60 | `      {initials}` |
| 61 | `    </span>` |
| 62 | `  )` |
| 63 | `}` |


## `frontend/src/components/ui/AvatarStack.tsx`

- **Lines:** 38

- **Purpose:** Reusable UI or layout component.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import { cn } from '../../lib/utils'` |
| 2 | `import { Avatar, type AvatarProps } from './Avatar'` |
| 3 | `` |
| 4 | `export interface AvatarStackProps {` |
| 5 | `  users: Pick<AvatarProps, 'name' \| 'src'>[]` |
| 6 | `  /** Max visible avatars before showing +N */` |
| 7 | `  max?: number` |
| 8 | `  size?: AvatarProps['size']` |
| 9 | `  className?: string` |
| 10 | `}` |
| 11 | `` |
| 12 | `export function AvatarStack({ users, max = 3, size = 'sm', className }: AvatarStackProps) {` |
| 13 | `  const visible = users.slice(0, max)` |
| 14 | `  const overflow = users.length - max` |
| 15 | `` |
| 16 | `  return (` |
| 17 | `    <div className={cn('flex items-center -space-x-2', className)}>` |
| 18 | `      {visible.map((user, i) => (` |
| 19 | `        <div` |
| 20 | `          key={i}` |
| 21 | `          className="ring-2 ring-surface rounded-full"` |
| 22 | `        >` |
| 23 | `          <Avatar name={user.name} src={user.src} size={size} />` |
| 24 | `        </div>` |
| 25 | `      ))}` |
| 26 | `      {overflow > 0 && (` |
| 27 | `        <span` |
| 28 | `          className={cn(` |
| 29 | `            'inline-flex items-center justify-center rounded-full bg-canvas text-text-secondary f...` |
| 30 | `            size === 'xs' ? 'w-6 h-6 text-[9px]' : size === 'sm' ? 'w-8 h-8 text-[10px]' : 'w-10 ...` |
| 31 | `          )}` |
| 32 | `        >` |
| 33 | `          +{overflow}` |
| 34 | `        </span>` |
| 35 | `      )}` |
| 36 | `    </div>` |
| 37 | `  )` |
| 38 | `}` |


## `frontend/src/components/ui/Button.tsx`

- **Lines:** 87

- **Purpose:** Reusable UI or layout component.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'` |
| 2 | `import type { LucideIcon } from 'lucide-react'` |
| 3 | `import { cn } from '../../lib/utils'` |
| 4 | `` |
| 5 | `export type ButtonVariant = 'primary' \| 'secondary' \| 'ghost' \| 'danger'` |
| 6 | `export type ButtonSize = 'sm' \| 'md' \| 'lg'` |
| 7 | `` |
| 8 | `export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {` |
| 9 | `  variant?: ButtonVariant` |
| 10 | `  size?: ButtonSize` |
| 11 | `  /** Render as a rounded-full pill */` |
| 12 | `  pill?: boolean` |
| 13 | `  icon?: LucideIcon` |
| 14 | `  iconRight?: LucideIcon` |
| 15 | `  loading?: boolean` |
| 16 | `  children?: ReactNode` |
| 17 | `}` |
| 18 | `` |
| 19 | `const variantStyles: Record<ButtonVariant, string> = {` |
| 20 | `  primary:` |
| 21 | `    'bg-primary-500 text-white hover:bg-primary-600 active:bg-primary-700 shadow-pill',` |
| 22 | `  secondary:` |
| 23 | `    'bg-surface text-text-primary border border-border-light hover:bg-canvas active:bg-border-lig...` |
| 24 | `  ghost:` |
| 25 | `    'text-text-secondary hover:text-text-primary hover:bg-canvas active:bg-border-light',` |
| 26 | `  danger:` |
| 27 | `    'bg-accent-red text-white hover:bg-red-600 active:bg-red-700 shadow-pill',` |
| 28 | `}` |
| 29 | `` |
| 30 | `const sizeStyles: Record<ButtonSize, string> = {` |
| 31 | `  sm: 'h-8 px-3 text-xs gap-1.5',` |
| 32 | `  md: 'h-10 px-4 text-sm gap-2',` |
| 33 | `  lg: 'h-12 px-6 text-base gap-2.5',` |
| 34 | `}` |
| 35 | `` |
| 36 | `export const Button = forwardRef<HTMLButtonElement, ButtonProps>(` |
| 37 | `  (` |
| 38 | `    {` |
| 39 | `      variant = 'primary',` |
| 40 | `      size = 'md',` |
| 41 | `      pill = false,` |
| 42 | `      icon: Icon,` |
| 43 | `      iconRight: IconRight,` |
| 44 | `      loading,` |
| 45 | `      disabled,` |
| 46 | `      className,` |
| 47 | `      children,` |
| 48 | `      ...rest` |
| 49 | `    },` |
| 50 | `    ref,` |
| 51 | `  ) => {` |
| 52 | `    return (` |
| 53 | `      <button` |
| 54 | `        ref={ref}` |
| 55 | `        disabled={disabled \|\| loading}` |
| 56 | `        className={cn(` |
| 57 | `          'inline-flex items-center justify-center font-medium transition-all duration-200',` |
| 58 | `          'disabled:opacity-50 disabled:cursor-not-allowed',` |
| 59 | `          pill ? 'rounded-full' : 'rounded-xl',` |
| 60 | `          variantStyles[variant],` |
| 61 | `          sizeStyles[size],` |
| 62 | `          className,` |
| 63 | `        )}` |
| 64 | `        {...rest}` |
| 65 | `      >` |
| 66 | `        {loading ? (` |
| 67 | `          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">` |
| 68 | `            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWid...` |
| 69 | `            <path` |
| 70 | `              className="opacity-75"` |
| 71 | `              fill="currentColor"` |
| 72 | `              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"` |
| 73 | `            />` |
| 74 | `          </svg>` |
| 75 | `        ) : (` |
| 76 | `          Icon && <Icon size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />` |
| 77 | `        )}` |
| 78 | `        {children}` |
| 79 | `        {IconRight && !loading && (` |
| 80 | `          <IconRight size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />` |
| 81 | `        )}` |
| 82 | `      </button>` |
| 83 | `    )` |
| 84 | `  },` |
| 85 | `)` |
| 86 | `` |
| 87 | `Button.displayName = 'Button'` |


## `frontend/src/components/ui/Card.tsx`

- **Lines:** 31

- **Purpose:** Reusable UI or layout component.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import type { ReactNode } from 'react'` |
| 2 | `import { cn } from '../../lib/utils'` |
| 3 | `` |
| 4 | `export interface CardProps {` |
| 5 | `  children: ReactNode` |
| 6 | `  className?: string` |
| 7 | `  /** Remove default padding */` |
| 8 | `  noPadding?: boolean` |
| 9 | `  /** Click handler — adds hover/active effects */` |
| 10 | `  onClick?: () => void` |
| 11 | `}` |
| 12 | `` |
| 13 | `export function Card({ children, className, noPadding, onClick }: CardProps) {` |
| 14 | `  const interactive = !!onClick` |
| 15 | `  return (` |
| 16 | `    <div` |
| 17 | `      role={interactive ? 'button' : undefined}` |
| 18 | `      tabIndex={interactive ? 0 : undefined}` |
| 19 | `      onClick={onClick}` |
| 20 | `      onKeyDown={interactive ? (e) => e.key === 'Enter' && onClick?.() : undefined}` |
| 21 | `      className={cn(` |
| 22 | `        'bg-surface rounded-3xl shadow-card',` |
| 23 | `        !noPadding && 'p-5 lg:p-6',` |
| 24 | `        interactive && 'cursor-pointer transition-shadow hover:shadow-raised active:shadow-soft',` |
| 25 | `        className,` |
| 26 | `      )}` |
| 27 | `    >` |
| 28 | `      {children}` |
| 29 | `    </div>` |
| 30 | `  )` |
| 31 | `}` |


## `frontend/src/components/ui/DataTable.tsx`

- **Lines:** 137

- **Purpose:** Reusable UI or layout component.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import { useState, useMemo, type ReactNode } from 'react'` |
| 2 | `import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'` |
| 3 | `import { cn } from '../../lib/utils'` |
| 4 | `` |
| 5 | `export interface Column<T> {` |
| 6 | `  key: string` |
| 7 | `  header: string` |
| 8 | `  /** Custom cell renderer */` |
| 9 | `  render?: (row: T) => ReactNode` |
| 10 | `  /** Enable sorting for this column */` |
| 11 | `  sortable?: boolean` |
| 12 | `  /** Width class */` |
| 13 | `  width?: string` |
| 14 | `  /** Hide on mobile */` |
| 15 | `  hideOnMobile?: boolean` |
| 16 | `}` |
| 17 | `` |
| 18 | `export interface DataTableProps<T> {` |
| 19 | `  columns: Column<T>[]` |
| 20 | `  data: T[]` |
| 21 | `  /** Unique key extractor */` |
| 22 | `  keyExtractor: (row: T) => string \| number` |
| 23 | `  className?: string` |
| 24 | `  /** On row click */` |
| 25 | `  onRowClick?: (row: T) => void` |
| 26 | `  /** Empty state message */` |
| 27 | `  emptyMessage?: string` |
| 28 | `}` |
| 29 | `` |
| 30 | `type SortDir = 'asc' \| 'desc' \| null` |
| 31 | `` |
| 32 | `export function DataTable<T>({` |
| 33 | `  columns,` |
| 34 | `  data,` |
| 35 | `  keyExtractor,` |
| 36 | `  className,` |
| 37 | `  onRowClick,` |
| 38 | `  emptyMessage = 'No data to display',` |
| 39 | `}: DataTableProps<T>) {` |
| 40 | `  const [sortKey, setSortKey] = useState<string \| null>(null)` |
| 41 | `  const [sortDir, setSortDir] = useState<SortDir>(null)` |
| 42 | `` |
| 43 | `  const handleSort = (key: string) => {` |
| 44 | `    if (sortKey === key) {` |
| 45 | `      setSortDir((d) => (d === 'asc' ? 'desc' : d === 'desc' ? null : 'asc'))` |
| 46 | `      if (sortDir === 'desc') setSortKey(null)` |
| 47 | `    } else {` |
| 48 | `      setSortKey(key)` |
| 49 | `      setSortDir('asc')` |
| 50 | `    }` |
| 51 | `  }` |
| 52 | `` |
| 53 | `  const sorted = useMemo(() => {` |
| 54 | `    if (!sortKey \|\| !sortDir) return data` |
| 55 | `    return [...data].sort((a, b) => {` |
| 56 | `      const av = (a as any)[sortKey]` |
| 57 | `      const bv = (b as any)[sortKey]` |
| 58 | `      if (av == null && bv == null) return 0` |
| 59 | `      if (av == null) return 1` |
| 60 | `      if (bv == null) return -1` |
| 61 | `      const cmp = av < bv ? -1 : av > bv ? 1 : 0` |
| 62 | `      return sortDir === 'asc' ? cmp : -cmp` |
| 63 | `    })` |
| 64 | `  }, [data, sortKey, sortDir])` |
| 65 | `` |
| 66 | `  if (data.length === 0) {` |
| 67 | `    return (` |
| 68 | `      <div className="flex flex-col items-center justify-center py-12 text-text-tertiary">` |
| 69 | `        <p className="text-sm">{emptyMessage}</p>` |
| 70 | `      </div>` |
| 71 | `    )` |
| 72 | `  }` |
| 73 | `` |
| 74 | `  return (` |
| 75 | `    <div className={cn('overflow-x-auto rounded-2xl', className)}>` |
| 76 | `      <table className="w-full text-sm">` |
| 77 | `        <thead>` |
| 78 | `          <tr className="border-b border-border-light">` |
| 79 | `            {columns.map((col) => (` |
| 80 | `              <th` |
| 81 | `                key={col.key}` |
| 82 | `                className={cn(` |
| 83 | `                  'text-left font-medium text-text-secondary px-4 py-3 whitespace-nowrap',` |
| 84 | `                  col.width,` |
| 85 | `                  col.hideOnMobile && 'hidden md:table-cell',` |
| 86 | `                  col.sortable && 'cursor-pointer select-none hover:text-text-primary',` |
| 87 | `                )}` |
| 88 | `                onClick={col.sortable ? () => handleSort(col.key) : undefined}` |
| 89 | `              >` |
| 90 | `                <span className="inline-flex items-center gap-1">` |
| 91 | `                  {col.header}` |
| 92 | `                  {col.sortable && (` |
| 93 | `                    <span className="text-text-tertiary">` |
| 94 | `                      {sortKey === col.key && sortDir === 'asc' ? (` |
| 95 | `                        <ArrowUp size={14} />` |
| 96 | `                      ) : sortKey === col.key && sortDir === 'desc' ? (` |
| 97 | `                        <ArrowDown size={14} />` |
| 98 | `                      ) : (` |
| 99 | `                        <ArrowUpDown size={14} />` |
| 100 | `                      )}` |
| 101 | `                    </span>` |
| 102 | `                  )}` |
| 103 | `                </span>` |
| 104 | `              </th>` |
| 105 | `            ))}` |
| 106 | `          </tr>` |
| 107 | `        </thead>` |
| 108 | `        <tbody>` |
| 109 | `          {sorted.map((row) => (` |
| 110 | `            <tr` |
| 111 | `              key={keyExtractor(row)}` |
| 112 | `              onClick={onRowClick ? () => onRowClick(row) : undefined}` |
| 113 | `              className={cn(` |
| 114 | `                'border-b border-border-light/50 last:border-0 transition-colors',` |
| 115 | `                onRowClick && 'cursor-pointer hover:bg-canvas/60',` |
| 116 | `              )}` |
| 117 | `            >` |
| 118 | `              {columns.map((col) => (` |
| 119 | `                <td` |
| 120 | `                  key={col.key}` |
| 121 | `                  className={cn(` |
| 122 | `                    'px-4 py-3 text-text-primary',` |
| 123 | `                    col.hideOnMobile && 'hidden md:table-cell',` |
| 124 | `                  )}` |
| 125 | `                >` |
| 126 | `                  {col.render` |
| 127 | `                    ? col.render(row)` |
| 128 | `                    : ((row as any)[col.key] as ReactNode)}` |
| 129 | `                </td>` |
| 130 | `              ))}` |
| 131 | `            </tr>` |
| 132 | `          ))}` |
| 133 | `        </tbody>` |
| 134 | `      </table>` |
| 135 | `    </div>` |
| 136 | `  )` |
| 137 | `}` |


## `frontend/src/components/ui/Drawer.tsx`

- **Lines:** 70

- **Purpose:** Reusable UI or layout component.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import { useEffect, useRef, type ReactNode } from 'react'` |
| 2 | `import { X } from 'lucide-react'` |
| 3 | `import { cn } from '../../lib/utils'` |
| 4 | `` |
| 5 | `export interface DrawerProps {` |
| 6 | `  open: boolean` |
| 7 | `  onClose: () => void` |
| 8 | `  title?: string` |
| 9 | `  children: ReactNode` |
| 10 | `  /** Side to slide from */` |
| 11 | `  side?: 'left' \| 'right'` |
| 12 | `  className?: string` |
| 13 | `}` |
| 14 | `` |
| 15 | `export function Drawer({ open, onClose, title, children, side = 'left', className }: DrawerProps) {` |
| 16 | `  const overlayRef = useRef<HTMLDivElement>(null)` |
| 17 | `` |
| 18 | `  useEffect(() => {` |
| 19 | `    if (!open) return` |
| 20 | `    const handler = (e: KeyboardEvent) => {` |
| 21 | `      if (e.key === 'Escape') onClose()` |
| 22 | `    }` |
| 23 | `    document.addEventListener('keydown', handler)` |
| 24 | `    return () => document.removeEventListener('keydown', handler)` |
| 25 | `  }, [open, onClose])` |
| 26 | `` |
| 27 | `  useEffect(() => {` |
| 28 | `    if (open) {` |
| 29 | `      document.body.style.overflow = 'hidden'` |
| 30 | `    }` |
| 31 | `    return () => {` |
| 32 | `      document.body.style.overflow = ''` |
| 33 | `    }` |
| 34 | `  }, [open])` |
| 35 | `` |
| 36 | `  if (!open) return null` |
| 37 | `` |
| 38 | `  return (` |
| 39 | `    <div` |
| 40 | `      ref={overlayRef}` |
| 41 | `      className="fixed inset-0 z-50 backdrop-blur-overlay animate-fade-in"` |
| 42 | `      onClick={(e) => e.target === overlayRef.current && onClose()}` |
| 43 | `    >` |
| 44 | `      <div` |
| 45 | `        role="dialog"` |
| 46 | `        aria-modal` |
| 47 | `        aria-label={title}` |
| 48 | `        className={cn(` |
| 49 | `          'fixed top-0 bottom-0 w-72 bg-surface shadow-modal flex flex-col animate-slide-right',` |
| 50 | `          side === 'left' ? 'left-0 rounded-r-3xl' : 'right-0 rounded-l-3xl',` |
| 51 | `          className,` |
| 52 | `        )}` |
| 53 | `      >` |
| 54 | `        {title && (` |
| 55 | `          <div className="flex items-center justify-between p-4 border-b border-border-light">` |
| 56 | `            <h3 className="text-lg font-bold text-text-primary">{title}</h3>` |
| 57 | `            <button` |
| 58 | `              onClick={onClose}` |
| 59 | `              aria-label="Close"` |
| 60 | `              className="flex items-center justify-center w-8 h-8 rounded-lg text-text-tertiary h...` |
| 61 | `            >` |
| 62 | `              <X size={18} />` |
| 63 | `            </button>` |
| 64 | `          </div>` |
| 65 | `        )}` |
| 66 | `        <div className="flex-1 overflow-y-auto p-4">{children}</div>` |
| 67 | `      </div>` |
| 68 | `    </div>` |
| 69 | `  )` |
| 70 | `}` |


## `frontend/src/components/ui/EmptyState.tsx`

- **Lines:** 37

- **Purpose:** Reusable UI or layout component.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import type { LucideIcon } from 'lucide-react'` |
| 2 | `import { Inbox } from 'lucide-react'` |
| 3 | `import { cn } from '../../lib/utils'` |
| 4 | `` |
| 5 | `export interface EmptyStateProps {` |
| 6 | `  icon?: LucideIcon` |
| 7 | `  title: string` |
| 8 | `  description?: string` |
| 9 | `  action?: React.ReactNode` |
| 10 | `  className?: string` |
| 11 | `}` |
| 12 | `` |
| 13 | `export function EmptyState({` |
| 14 | `  icon: Icon = Inbox,` |
| 15 | `  title,` |
| 16 | `  description,` |
| 17 | `  action,` |
| 18 | `  className,` |
| 19 | `}: EmptyStateProps) {` |
| 20 | `  return (` |
| 21 | `    <div` |
| 22 | `      className={cn(` |
| 23 | `        'flex flex-col items-center justify-center py-16 px-6 text-center',` |
| 24 | `        className,` |
| 25 | `      )}` |
| 26 | `    >` |
| 27 | `      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-canvas mb-4">` |
| 28 | `        <Icon size={28} className="text-text-tertiary" />` |
| 29 | `      </div>` |
| 30 | `      <h3 className="text-base font-semibold text-text-primary mb-1">{title}</h3>` |
| 31 | `      {description && (` |
| 32 | `        <p className="text-sm text-text-secondary max-w-xs">{description}</p>` |
| 33 | `      )}` |
| 34 | `      {action && <div className="mt-4">{action}</div>}` |
| 35 | `    </div>` |
| 36 | `  )` |
| 37 | `}` |


## `frontend/src/components/ui/IconRailItem.tsx`

- **Lines:** 33

- **Purpose:** Reusable UI or layout component.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import type { LucideIcon } from 'lucide-react'` |
| 2 | `import { cn } from '../../lib/utils'` |
| 3 | `` |
| 4 | `export interface IconRailItemProps {` |
| 5 | `  icon: LucideIcon` |
| 6 | `  label: string` |
| 7 | `  active?: boolean` |
| 8 | `  onClick?: () => void` |
| 9 | `  badge?: number` |
| 10 | `}` |
| 11 | `` |
| 12 | `export function IconRailItem({ icon: Icon, label, active, onClick, badge }: IconRailItemProps) {` |
| 13 | `  return (` |
| 14 | `    <button` |
| 15 | `      onClick={onClick}` |
| 16 | `      title={label}` |
| 17 | `      aria-label={label}` |
| 18 | `      className={cn(` |
| 19 | `        'relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-2...` |
| 20 | `        active` |
| 21 | `          ? 'bg-primary-50 text-primary-600 shadow-pill'` |
| 22 | `          : 'text-text-tertiary hover:text-text-primary hover:bg-canvas',` |
| 23 | `      )}` |
| 24 | `    >` |
| 25 | `      <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />` |
| 26 | `      {badge !== undefined && badge > 0 && (` |
| 27 | `        <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16p...` |
| 28 | `          {badge > 99 ? '99+' : badge}` |
| 29 | `        </span>` |
| 30 | `      )}` |
| 31 | `    </button>` |
| 32 | `  )` |
| 33 | `}` |


## `frontend/src/components/ui/Modal.tsx`

- **Lines:** 79

- **Purpose:** Reusable UI or layout component.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import { useEffect, useRef, type ReactNode } from 'react'` |
| 2 | `import { X } from 'lucide-react'` |
| 3 | `import { cn } from '../../lib/utils'` |
| 4 | `` |
| 5 | `export interface ModalProps {` |
| 6 | `  open: boolean` |
| 7 | `  onClose: () => void` |
| 8 | `  title?: string` |
| 9 | `  children: ReactNode` |
| 10 | `  /** Max width class */` |
| 11 | `  size?: 'sm' \| 'md' \| 'lg' \| 'xl'` |
| 12 | `  className?: string` |
| 13 | `}` |
| 14 | `` |
| 15 | `const sizeMap = {` |
| 16 | `  sm: 'max-w-sm',` |
| 17 | `  md: 'max-w-md',` |
| 18 | `  lg: 'max-w-lg',` |
| 19 | `  xl: 'max-w-xl',` |
| 20 | `}` |
| 21 | `` |
| 22 | `export function Modal({ open, onClose, title, children, size = 'md', className }: ModalProps) {` |
| 23 | `  const overlayRef = useRef<HTMLDivElement>(null)` |
| 24 | `` |
| 25 | `  // Close on Escape` |
| 26 | `  useEffect(() => {` |
| 27 | `    if (!open) return` |
| 28 | `    const handler = (e: KeyboardEvent) => {` |
| 29 | `      if (e.key === 'Escape') onClose()` |
| 30 | `    }` |
| 31 | `    document.addEventListener('keydown', handler)` |
| 32 | `    return () => document.removeEventListener('keydown', handler)` |
| 33 | `  }, [open, onClose])` |
| 34 | `` |
| 35 | `  // Trap scroll` |
| 36 | `  useEffect(() => {` |
| 37 | `    if (open) {` |
| 38 | `      document.body.style.overflow = 'hidden'` |
| 39 | `    }` |
| 40 | `    return () => {` |
| 41 | `      document.body.style.overflow = ''` |
| 42 | `    }` |
| 43 | `  }, [open])` |
| 44 | `` |
| 45 | `  if (!open) return null` |
| 46 | `` |
| 47 | `  return (` |
| 48 | `    <div` |
| 49 | `      ref={overlayRef}` |
| 50 | `      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-overlay an...` |
| 51 | `      onClick={(e) => e.target === overlayRef.current && onClose()}` |
| 52 | `    >` |
| 53 | `      <div` |
| 54 | `        role="dialog"` |
| 55 | `        aria-modal` |
| 56 | `        aria-label={title}` |
| 57 | `        className={cn(` |
| 58 | `          'w-full bg-surface rounded-3xl shadow-modal p-6 animate-scale-in',` |
| 59 | `          sizeMap[size],` |
| 60 | `          className,` |
| 61 | `        )}` |
| 62 | `      >` |
| 63 | `        {title && (` |
| 64 | `          <div className="flex items-center justify-between mb-4">` |
| 65 | `            <h3 className="text-lg font-bold text-text-primary">{title}</h3>` |
| 66 | `            <button` |
| 67 | `              onClick={onClose}` |
| 68 | `              aria-label="Close"` |
| 69 | `              className="flex items-center justify-center w-8 h-8 rounded-lg text-text-tertiary h...` |
| 70 | `            >` |
| 71 | `              <X size={18} />` |
| 72 | `            </button>` |
| 73 | `          </div>` |
| 74 | `        )}` |
| 75 | `        {children}` |
| 76 | `      </div>` |
| 77 | `    </div>` |
| 78 | `  )` |
| 79 | `}` |


## `frontend/src/components/ui/PillTabs.tsx`

- **Lines:** 47

- **Purpose:** Reusable UI or layout component.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import { cn } from '../../lib/utils'` |
| 2 | `` |
| 3 | `export interface PillTab {` |
| 4 | `  id: string` |
| 5 | `  label: string` |
| 6 | `}` |
| 7 | `` |
| 8 | `export interface PillTabsProps {` |
| 9 | `  tabs: PillTab[]` |
| 10 | `  activeId: string` |
| 11 | `  onChange: (id: string) => void` |
| 12 | `  className?: string` |
| 13 | `  size?: 'sm' \| 'md'` |
| 14 | `}` |
| 15 | `` |
| 16 | `export function PillTabs({ tabs, activeId, onChange, className, size = 'md' }: PillTabsProps) {` |
| 17 | `  return (` |
| 18 | `    <div` |
| 19 | `      role="tablist"` |
| 20 | `      className={cn(` |
| 21 | `        'inline-flex items-center gap-1 rounded-full bg-canvas p-1',` |
| 22 | `        className,` |
| 23 | `      )}` |
| 24 | `    >` |
| 25 | `      {tabs.map((tab) => {` |
| 26 | `        const active = tab.id === activeId` |
| 27 | `        return (` |
| 28 | `          <button` |
| 29 | `            key={tab.id}` |
| 30 | `            role="tab"` |
| 31 | `            aria-selected={active}` |
| 32 | `            onClick={() => onChange(tab.id)}` |
| 33 | `            className={cn(` |
| 34 | `              'rounded-full font-medium transition-all duration-200 whitespace-nowrap',` |
| 35 | `              size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm',` |
| 36 | `              active` |
| 37 | `                ? 'bg-primary-50 text-primary-600 shadow-pill'` |
| 38 | `                : 'text-text-secondary hover:text-text-primary hover:bg-surface/60',` |
| 39 | `            )}` |
| 40 | `          >` |
| 41 | `            {tab.label}` |
| 42 | `          </button>` |
| 43 | `        )` |
| 44 | `      })}` |
| 45 | `    </div>` |
| 46 | `  )` |
| 47 | `}` |


## `frontend/src/components/ui/SectionHeader.tsx`

- **Lines:** 31

- **Purpose:** Reusable UI or layout component.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import { Link } from 'react-router-dom'` |
| 2 | `import { cn } from '../../lib/utils'` |
| 3 | `` |
| 4 | `export interface SectionHeaderProps {` |
| 5 | `  title: string` |
| 6 | `  /** "View all" destination */` |
| 7 | `  viewAllTo?: string` |
| 8 | `  viewAllLabel?: string` |
| 9 | `  className?: string` |
| 10 | `}` |
| 11 | `` |
| 12 | `export function SectionHeader({` |
| 13 | `  title,` |
| 14 | `  viewAllTo,` |
| 15 | `  viewAllLabel = 'View all',` |
| 16 | `  className,` |
| 17 | `}: SectionHeaderProps) {` |
| 18 | `  return (` |
| 19 | `    <div className={cn('flex items-center justify-between', className)}>` |
| 20 | `      <h2 className="text-lg font-bold text-text-primary">{title}</h2>` |
| 21 | `      {viewAllTo && (` |
| 22 | `        <Link` |
| 23 | `          to={viewAllTo}` |
| 24 | `          className="text-sm font-medium text-primary-500 hover:text-primary-600 transition-colors"` |
| 25 | `        >` |
| 26 | `          {viewAllLabel} →` |
| 27 | `        </Link>` |
| 28 | `      )}` |
| 29 | `    </div>` |
| 30 | `  )` |
| 31 | `}` |


## `frontend/src/components/ui/Skeleton.tsx`

- **Lines:** 44

- **Purpose:** Reusable UI or layout component.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import { cn } from '../../lib/utils'` |
| 2 | `` |
| 3 | `export interface SkeletonProps {` |
| 4 | `  className?: string` |
| 5 | `  /** Predefined shape */` |
| 6 | `  variant?: 'text' \| 'circle' \| 'rect' \| 'card'` |
| 7 | `}` |
| 8 | `` |
| 9 | `export function Skeleton({ className, variant = 'rect' }: SkeletonProps) {` |
| 10 | `  return (` |
| 11 | `    <div` |
| 12 | `      aria-hidden` |
| 13 | `      className={cn(` |
| 14 | `        'bg-gradient-to-r from-border-light via-canvas to-border-light bg-[length:200%_100%] anim...` |
| 15 | `        variant === 'text' && 'h-4 rounded-md',` |
| 16 | `        variant === 'circle' && 'rounded-full',` |
| 17 | `        variant === 'rect' && 'rounded-2xl',` |
| 18 | `        variant === 'card' && 'rounded-3xl h-32',` |
| 19 | `        className,` |
| 20 | `      )}` |
| 21 | `    />` |
| 22 | `  )` |
| 23 | `}` |
| 24 | `` |
| 25 | `/** Pre-composed skeleton for a stat card */` |
| 26 | `export function StatCardSkeleton() {` |
| 27 | `  return (` |
| 28 | `    <div className="bg-surface rounded-3xl shadow-card p-5 lg:p-6 space-y-3">` |
| 29 | `      <Skeleton variant="text" className="w-24" />` |
| 30 | `      <Skeleton variant="text" className="w-32 h-8" />` |
| 31 | `    </div>` |
| 32 | `  )` |
| 33 | `}` |
| 34 | `` |
| 35 | `/** Pre-composed skeleton for a table row */` |
| 36 | `export function TableRowSkeleton({ cols = 4 }: { cols?: number }) {` |
| 37 | `  return (` |
| 38 | `    <div className="flex gap-4 px-4 py-3">` |
| 39 | `      {Array.from({ length: cols }).map((_, i) => (` |
| 40 | `        <Skeleton key={i} variant="text" className="flex-1" />` |
| 41 | `      ))}` |
| 42 | `    </div>` |
| 43 | `  )` |
| 44 | `}` |


## `frontend/src/components/ui/StatCard.tsx`

- **Lines:** 67

- **Purpose:** Reusable UI or layout component.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react'` |
| 2 | `import { cn } from '../../lib/utils'` |
| 3 | `` |
| 4 | `export interface StatCardProps {` |
| 5 | `  label: string` |
| 6 | `  value: string` |
| 7 | `  /** Percentage change — positive, negative, or zero */` |
| 8 | `  delta?: number` |
| 9 | `  /** Optional icon */` |
| 10 | `  icon?: LucideIcon` |
| 11 | `  /** Accent color class for the icon bg */` |
| 12 | `  iconBg?: string` |
| 13 | `  iconColor?: string` |
| 14 | `  className?: string` |
| 15 | `}` |
| 16 | `` |
| 17 | `export function StatCard({` |
| 18 | `  label,` |
| 19 | `  value,` |
| 20 | `  delta,` |
| 21 | `  icon: Icon,` |
| 22 | `  iconBg = 'bg-primary-50',` |
| 23 | `  iconColor = 'text-primary-500',` |
| 24 | `  className,` |
| 25 | `}: StatCardProps) {` |
| 26 | `  const DeltaIcon = delta === undefined \|\| delta === 0` |
| 27 | `    ? Minus` |
| 28 | `    : delta > 0` |
| 29 | `      ? TrendingUp` |
| 30 | `      : TrendingDown` |
| 31 | `` |
| 32 | `  const deltaColor = delta === undefined \|\| delta === 0` |
| 33 | `    ? 'text-text-tertiary'` |
| 34 | `    : delta > 0` |
| 35 | `      ? 'text-accent-green'` |
| 36 | `      : 'text-accent-red'` |
| 37 | `` |
| 38 | `  return (` |
| 39 | `    <div` |
| 40 | `      className={cn(` |
| 41 | `        'bg-surface rounded-3xl shadow-card p-5 lg:p-6 flex flex-col gap-3',` |
| 42 | `        className,` |
| 43 | `      )}` |
| 44 | `    >` |
| 45 | `      <div className="flex items-center justify-between">` |
| 46 | `        <span className="text-sm text-text-secondary font-medium">{label}</span>` |
| 47 | `        {Icon && (` |
| 48 | `          <span className={cn('flex items-center justify-center w-9 h-9 rounded-xl', iconBg)}>` |
| 49 | `            <Icon size={18} className={iconColor} />` |
| 50 | `          </span>` |
| 51 | `        )}` |
| 52 | `      </div>` |
| 53 | `` |
| 54 | `      <div className="flex items-end gap-2">` |
| 55 | `        <span className="text-2xl lg:text-3xl font-bold text-text-primary tracking-tight">` |
| 56 | `          {value}` |
| 57 | `        </span>` |
| 58 | `        {delta !== undefined && (` |
| 59 | `          <span className={cn('flex items-center gap-0.5 text-sm font-medium mb-0.5', deltaColor)}>` |
| 60 | `            <DeltaIcon size={14} />` |
| 61 | `            {Math.abs(delta).toFixed(1)}%` |
| 62 | `          </span>` |
| 63 | `        )}` |
| 64 | `      </div>` |
| 65 | `    </div>` |
| 66 | `  )` |
| 67 | `}` |


## `frontend/src/components/ui/StatusChip.tsx`

- **Lines:** 58

- **Purpose:** Reusable UI or layout component.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import { cn } from '../../lib/utils'` |
| 2 | `` |
| 3 | `export type ChipVariant =` |
| 4 | `  \| 'success'` |
| 5 | `  \| 'warning'` |
| 6 | `  \| 'error'` |
| 7 | `  \| 'info'` |
| 8 | `  \| 'pending'` |
| 9 | `  \| 'neutral'` |
| 10 | `` |
| 11 | `export interface StatusChipProps {` |
| 12 | `  label: string` |
| 13 | `  variant?: ChipVariant` |
| 14 | `  className?: string` |
| 15 | `  /** Render as a small dot instead of text */` |
| 16 | `  dot?: boolean` |
| 17 | `}` |
| 18 | `` |
| 19 | `const variantStyles: Record<ChipVariant, string> = {` |
| 20 | `  success: 'bg-status-success text-status-success-text',` |
| 21 | `  warning: 'bg-status-warning text-status-warning-text',` |
| 22 | `  error: 'bg-status-error text-status-error-text',` |
| 23 | `  info: 'bg-status-info text-status-info-text',` |
| 24 | `  pending: 'bg-status-pending text-status-pending-text',` |
| 25 | `  neutral: 'bg-canvas text-text-secondary',` |
| 26 | `}` |
| 27 | `` |
| 28 | `export function StatusChip({ label, variant = 'neutral', className, dot }: StatusChipProps) {` |
| 29 | `  if (dot) {` |
| 30 | `    return (` |
| 31 | `      <span className={cn('flex items-center gap-1.5 text-xs font-medium', className)}>` |
| 32 | `        <span` |
| 33 | `          className={cn('w-2 h-2 rounded-full', {` |
| 34 | `            'bg-accent-green': variant === 'success',` |
| 35 | `            'bg-accent-yellow': variant === 'warning',` |
| 36 | `            'bg-accent-red': variant === 'error',` |
| 37 | `            'bg-primary-500': variant === 'info',` |
| 38 | `            'bg-accent-purple': variant === 'pending',` |
| 39 | `            'bg-text-tertiary': variant === 'neutral',` |
| 40 | `          })}` |
| 41 | `        />` |
| 42 | `        {label}` |
| 43 | `      </span>` |
| 44 | `    )` |
| 45 | `  }` |
| 46 | `` |
| 47 | `  return (` |
| 48 | `    <span` |
| 49 | `      className={cn(` |
| 50 | `        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',` |
| 51 | `        variantStyles[variant],` |
| 52 | `        className,` |
| 53 | `      )}` |
| 54 | `    >` |
| 55 | `      {label}` |
| 56 | `    </span>` |
| 57 | `  )` |
| 58 | `}` |


## `frontend/src/components/ui/Toast.tsx`

- **Lines:** 107

- **Purpose:** Reusable UI or layout component.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'` |
| 2 | `import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'` |
| 3 | `import { cn } from '../../lib/utils'` |
| 4 | `` |
| 5 | `// ── Types ──────────────────────────────────────────────────────────────────` |
| 6 | `export type ToastVariant = 'success' \| 'error' \| 'warning' \| 'info'` |
| 7 | `` |
| 8 | `export interface ToastData {` |
| 9 | `  id: string` |
| 10 | `  message: string` |
| 11 | `  variant: ToastVariant` |
| 12 | `  duration?: number` |
| 13 | `}` |
| 14 | `` |
| 15 | `interface ToastContextValue {` |
| 16 | `  toast: (message: string, variant?: ToastVariant, duration?: number) => void` |
| 17 | `}` |
| 18 | `` |
| 19 | `// ── Context ────────────────────────────────────────────────────────────────` |
| 20 | `const ToastContext = createContext<ToastContextValue \| null>(null)` |
| 21 | `` |
| 22 | `export function useToast(): ToastContextValue {` |
| 23 | `  const ctx = useContext(ToastContext)` |
| 24 | `  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')` |
| 25 | `  return ctx` |
| 26 | `}` |
| 27 | `` |
| 28 | `// ── Provider ───────────────────────────────────────────────────────────────` |
| 29 | `export function ToastProvider({ children }: { children: ReactNode }) {` |
| 30 | `  const [toasts, setToasts] = useState<ToastData[]>([])` |
| 31 | `  const idCounter = useRef(0)` |
| 32 | `` |
| 33 | `  const toast = useCallback(` |
| 34 | `    (message: string, variant: ToastVariant = 'info', duration = 4000) => {` |
| 35 | `      const id = `toast-${++idCounter.current}`` |
| 36 | `      setToasts((prev) => [...prev, { id, message, variant, duration }])` |
| 37 | `      if (duration > 0) {` |
| 38 | `        setTimeout(() => {` |
| 39 | `          setToasts((prev) => prev.filter((t) => t.id !== id))` |
| 40 | `        }, duration)` |
| 41 | `      }` |
| 42 | `    },` |
| 43 | `    [],` |
| 44 | `  )` |
| 45 | `` |
| 46 | `  const dismiss = useCallback((id: string) => {` |
| 47 | `    setToasts((prev) => prev.filter((t) => t.id !== id))` |
| 48 | `  }, [])` |
| 49 | `` |
| 50 | `  return (` |
| 51 | `    <ToastContext.Provider value={{ toast }}>` |
| 52 | `      {children}` |
| 53 | `      {/* Toast container — fixed top-right */}` |
| 54 | `      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none max-w-s...` |
| 55 | `        {toasts.map((t) => (` |
| 56 | `          <ToastItem key={t.id} data={t} onDismiss={() => dismiss(t.id)} />` |
| 57 | `        ))}` |
| 58 | `      </div>` |
| 59 | `    </ToastContext.Provider>` |
| 60 | `  )` |
| 61 | `}` |
| 62 | `` |
| 63 | `// ── Individual toast ───────────────────────────────────────────────────────` |
| 64 | `const icons: Record<ToastVariant, typeof CheckCircle> = {` |
| 65 | `  success: CheckCircle,` |
| 66 | `  error: AlertCircle,` |
| 67 | `  warning: AlertTriangle,` |
| 68 | `  info: Info,` |
| 69 | `}` |
| 70 | `` |
| 71 | `const variantStyles: Record<ToastVariant, string> = {` |
| 72 | `  success: 'border-accent-green/30 bg-status-success',` |
| 73 | `  error: 'border-accent-red/30 bg-status-error',` |
| 74 | `  warning: 'border-accent-yellow/30 bg-status-warning',` |
| 75 | `  info: 'border-primary-200 bg-status-info',` |
| 76 | `}` |
| 77 | `` |
| 78 | `const iconColors: Record<ToastVariant, string> = {` |
| 79 | `  success: 'text-accent-green',` |
| 80 | `  error: 'text-accent-red',` |
| 81 | `  warning: 'text-accent-yellow',` |
| 82 | `  info: 'text-primary-500',` |
| 83 | `}` |
| 84 | `` |
| 85 | `function ToastItem({ data, onDismiss }: { data: ToastData; onDismiss: () => void }) {` |
| 86 | `  const Icon = icons[data.variant]` |
| 87 | `` |
| 88 | `  return (` |
| 89 | `    <div` |
| 90 | `      role="alert"` |
| 91 | `      className={cn(` |
| 92 | `        'pointer-events-auto flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-raised a...` |
| 93 | `        variantStyles[data.variant],` |
| 94 | `      )}` |
| 95 | `    >` |
| 96 | `      <Icon size={18} className={iconColors[data.variant]} />` |
| 97 | `      <p className="flex-1 text-sm font-medium text-text-primary">{data.message}</p>` |
| 98 | `      <button` |
| 99 | `        onClick={onDismiss}` |
| 100 | `        className="text-text-tertiary hover:text-text-primary transition-colors"` |
| 101 | `        aria-label="Dismiss"` |
| 102 | `      >` |
| 103 | `        <X size={14} />` |
| 104 | `      </button>` |
| 105 | `    </div>` |
| 106 | `  )` |
| 107 | `}` |


## `frontend/src/components/ui/index.ts`

- **Lines:** 18

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `export { Card } from './Card'` |
| 2 | `export { SectionHeader } from './SectionHeader'` |
| 3 | `export { PillTabs } from './PillTabs'` |
| 4 | `export type { PillTab } from './PillTabs'` |
| 5 | `export { IconRailItem } from './IconRailItem'` |
| 6 | `export { Avatar } from './Avatar'` |
| 7 | `export { AvatarStack } from './AvatarStack'` |
| 8 | `export { StatusChip } from './StatusChip'` |
| 9 | `export type { ChipVariant } from './StatusChip'` |
| 10 | `export { StatCard } from './StatCard'` |
| 11 | `export { Button } from './Button'` |
| 12 | `export { Modal } from './Modal'` |
| 13 | `export { Drawer } from './Drawer'` |
| 14 | `export { DataTable } from './DataTable'` |
| 15 | `export type { Column } from './DataTable'` |
| 16 | `export { EmptyState } from './EmptyState'` |
| 17 | `export { Skeleton, StatCardSkeleton, TableRowSkeleton } from './Skeleton'` |
| 18 | `export { ToastProvider, useToast } from './Toast'` |


## `frontend/src/hooks/.gitkeep`

- **Lines:** 0

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|


## `frontend/src/hooks/useAuth.ts`

- **Lines:** 16

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import { useContext } from 'react'` |
| 2 | `import { AuthContext, type AuthState } from '../lib/auth-context'` |
| 3 | `` |
| 4 | `/**` |
| 5 | ` * Access the current auth state.` |
| 6 | ` *` |
| 7 | ` * In dev mode this exposes `switchRole()` to quickly change the active role` |
| 8 | ` * without logging in. In production the real JWT flow will replace the mock.` |
| 9 | ` */` |
| 10 | `export function useAuth(): AuthState {` |
| 11 | `  const ctx = useContext(AuthContext)` |
| 12 | `  if (!ctx) {` |
| 13 | `    throw new Error('useAuth must be used inside <AuthProvider>')` |
| 14 | `  }` |
| 15 | `  return ctx` |
| 16 | `}` |


## `frontend/src/index.css`

- **Lines:** 79

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `@tailwind base;` |
| 2 | `@tailwind components;` |
| 3 | `@tailwind utilities;` |
| 4 | `` |
| 5 | `/* ── Inter font (bundled, no CDN — NFR-012) ── */` |
| 6 | `/* Inter is loaded from the system or as a fallback to system-ui */` |
| 7 | `` |
| 8 | `@layer base {` |
| 9 | `  html {` |
| 10 | `    font-family: 'Inter', system-ui, -apple-system, sans-serif;` |
| 11 | `    -webkit-font-smoothing: antialiased;` |
| 12 | `    -moz-osx-font-smoothing: grayscale;` |
| 13 | `  }` |
| 14 | `` |
| 15 | `  body {` |
| 16 | `    @apply bg-canvas text-text-primary;` |
| 17 | `    min-height: 100dvh;` |
| 18 | `  }` |
| 19 | `` |
| 20 | `  /* Custom scrollbar — subtle, matches the soft UI */` |
| 21 | `  ::-webkit-scrollbar {` |
| 22 | `    width: 6px;` |
| 23 | `    height: 6px;` |
| 24 | `  }` |
| 25 | `  ::-webkit-scrollbar-track {` |
| 26 | `    @apply bg-transparent;` |
| 27 | `  }` |
| 28 | `  ::-webkit-scrollbar-thumb {` |
| 29 | `    @apply bg-border-light rounded-full;` |
| 30 | `  }` |
| 31 | `  ::-webkit-scrollbar-thumb:hover {` |
| 32 | `    @apply bg-border;` |
| 33 | `  }` |
| 34 | `` |
| 35 | `  /* Remove default focus outline, add custom */` |
| 36 | `  *:focus-visible {` |
| 37 | `    @apply outline-2 outline-offset-2 outline-primary-500;` |
| 38 | `  }` |
| 39 | `}` |
| 40 | `` |
| 41 | `@layer components {` |
| 42 | `  /* Diagonal hatch pattern for unavailable/weekend cells */` |
| 43 | `  .pattern-hatch {` |
| 44 | `    background-image: repeating-linear-gradient(` |
| 45 | `      -45deg,` |
| 46 | `      transparent,` |
| 47 | `      transparent 4px,` |
| 48 | `      rgba(148, 163, 184, 0.15) 4px,` |
| 49 | `      rgba(148, 163, 184, 0.15) 5px` |
| 50 | `    );` |
| 51 | `  }` |
| 52 | `` |
| 53 | `  /* Glass overlay for modals */` |
| 54 | `  .backdrop-blur-overlay {` |
| 55 | `    @apply bg-text-primary/20 backdrop-blur-sm;` |
| 56 | `  }` |
| 57 | `}` |
| 58 | `` |
| 59 | `@layer utilities {` |
| 60 | `  /* Touch target minimum — NFR-007 */` |
| 61 | `  .touch-target {` |
| 62 | `    min-width: 44px;` |
| 63 | `    min-height: 44px;` |
| 64 | `  }` |
| 65 | `` |
| 66 | `  /* Truncate text with ellipsis */` |
| 67 | `  .text-truncate {` |
| 68 | `    @apply truncate;` |
| 69 | `  }` |
| 70 | `` |
| 71 | `  /* Hide scrollbar but keep scroll */` |
| 72 | `  .scrollbar-hide {` |
| 73 | `    -ms-overflow-style: none;` |
| 74 | `    scrollbar-width: none;` |
| 75 | `  }` |
| 76 | `  .scrollbar-hide::-webkit-scrollbar {` |
| 77 | `    display: none;` |
| 78 | `  }` |
| 79 | `}` |


## `frontend/src/lib/.gitkeep`

- **Lines:** 0

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|


## `frontend/src/lib/auth-context.tsx`

- **Lines:** 164

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import React, {` |
| 2 | `  createContext,` |
| 3 | `  useState,` |
| 4 | `  useCallback,` |
| 5 | `  useMemo,` |
| 6 | `  useEffect,` |
| 7 | `  type ReactNode,` |
| 8 | `} from 'react'` |
| 9 | `import type { Role, AuthUser } from '../api/types'` |
| 10 | `export type { Role } from '../api/types'` |
| 11 | `import {` |
| 12 | `  loginApi,` |
| 13 | `  logoutApi,` |
| 14 | `  refreshSession,` |
| 15 | `  setAccessToken,` |
| 16 | `  setOnAuthFailure,` |
| 17 | `  getAccessToken,` |
| 18 | `  ApiError,` |
| 19 | `} from '../api/client'` |
| 20 | `import { Trophy } from 'lucide-react'` |
| 21 | `` |
| 22 | `// ── Context Types ──────────────────────────────────────────────────────────` |
| 23 | `export interface User extends AuthUser {}` |
| 24 | `` |
| 25 | `export interface AuthState {` |
| 26 | `  user: User \| null` |
| 27 | `  isAuthenticated: boolean` |
| 28 | `  isLoading: boolean` |
| 29 | `  login: (email: string, password: string) => Promise<User>` |
| 30 | `  logout: () => Promise<void>` |
| 31 | `  /** Dev-only: switch role instantly without a real API call. */` |
| 32 | `  switchRole: (role: Role) => void` |
| 33 | `}` |
| 34 | `` |
| 35 | `// ── Mock users for dev role switcher only ───────────────────────────────────` |
| 36 | `const MOCK_USERS: Record<Role, User> = {` |
| 37 | `  OWNER: { id: 1, email: 'owner@club.test', full_name: 'Meera Iyer', role: 'OWNER', member_id: nu...` |
| 38 | `  MANAGER: { id: 2, email: 'manager@club.test', full_name: 'Ravi Kumar', role: 'MANAGER', member_...` |
| 39 | `  FRONT_DESK: { id: 3, email: 'desk@club.test', full_name: 'Arjun Singh', role: 'FRONT_DESK', mem...` |
| 40 | `  BAR_STAFF: { id: 4, email: 'bar@club.test', full_name: 'Sana Mirza', role: 'BAR_STAFF', member_...` |
| 41 | `  MEMBER: { id: 5, email: 'member1@club.test', full_name: 'Karan Shah', role: 'MEMBER', member_id...` |
| 42 | `}` |
| 43 | `` |
| 44 | `// ── Context ────────────────────────────────────────────────────────────────` |
| 45 | `export const AuthContext = createContext<AuthState \| null>(null)` |
| 46 | `` |
| 47 | `export function AuthProvider({ children }: { children: ReactNode }) {` |
| 48 | `  const [user, setUser] = useState<User \| null>(null)` |
| 49 | `  const [isLoading, setIsLoading] = useState(true)` |
| 50 | `` |
| 51 | `  // On initial mount: restore session via HttpOnly refresh cookie (SRS 3.2.1 & 7)` |
| 52 | `  useEffect(() => {` |
| 53 | `    let isMounted = true` |
| 54 | `` |
| 55 | `    // Register callback for when refresh token expires during normal API requests` |
| 56 | `    setOnAuthFailure(() => {` |
| 57 | `      setAccessToken(null)` |
| 58 | `      setUser(null)` |
| 59 | `    })` |
| 60 | `` |
| 61 | `    async function restoreSession() {` |
| 62 | `      try {` |
| 63 | `        const data = await refreshSession()` |
| 64 | `        if (data && isMounted) {` |
| 65 | `          setUser(data.user)` |
| 66 | `          setAccessToken(data.access_token)` |
| 67 | `        } else if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === 'true' && !getAccess...` |
| 68 | `          // Dev convenience: default to OWNER only if explicitly requested` |
| 69 | `          setUser(MOCK_USERS.OWNER)` |
| 70 | `        }` |
| 71 | `      } catch {` |
| 72 | `        if (isMounted) {` |
| 73 | `          setUser(null)` |
| 74 | `          setAccessToken(null)` |
| 75 | `        }` |
| 76 | `      } finally {` |
| 77 | `        if (isMounted) {` |
| 78 | `          setIsLoading(false)` |
| 79 | `        }` |
| 80 | `      }` |
| 81 | `    }` |
| 82 | `` |
| 83 | `    restoreSession()` |
| 84 | `` |
| 85 | `    return () => {` |
| 86 | `      isMounted = false` |
| 87 | `    }` |
| 88 | `  }, [])` |
| 89 | `` |
| 90 | `  // Real login API call` |
| 91 | `  const login = useCallback(async (email: string, password: string): Promise<User> => {` |
| 92 | `    try {` |
| 93 | `      const response = await loginApi(email.trim(), password)` |
| 94 | `      setAccessToken(response.access_token)` |
| 95 | `      setUser(response.user)` |
| 96 | `      return response.user` |
| 97 | `    } catch (err: any) {` |
| 98 | `      // In DEV mode, if backend is offline and mocks enabled, support dev fallback` |
| 99 | `      if (` |
| 100 | `        import.meta.env.DEV &&` |
| 101 | `        (import.meta.env.VITE_USE_MOCKS === 'true' \|\| err?.code === 'NETWORK_ERROR')` |
| 102 | `      ) {` |
| 103 | `        const emailLower = email.trim().toLowerCase()` |
| 104 | `        const found = Object.values(MOCK_USERS).find((u) => u.email.toLowerCase() === emailLower)` |
| 105 | `        const mockUser = found \|\| (emailLower.includes('member') ? MOCK_USERS.MEMBER : MOCK_USE...` |
| 106 | `        setAccessToken('dev-mock-jwt-token')` |
| 107 | `        setUser(mockUser)` |
| 108 | `        return mockUser` |
| 109 | `      }` |
| 110 | `      throw err` |
| 111 | `    }` |
| 112 | `  }, [])` |
| 113 | `` |
| 114 | `  // Real logout API call` |
| 115 | `  const logout = useCallback(async () => {` |
| 116 | `    try {` |
| 117 | `      await logoutApi()` |
| 118 | `    } catch {` |
| 119 | `      // Ignore network errors on logout` |
| 120 | `    } finally {` |
| 121 | `      setAccessToken(null)` |
| 122 | `      setUser(null)` |
| 123 | `    }` |
| 124 | `  }, [])` |
| 125 | `` |
| 126 | `  // Dev role switcher (strictly gated by DEV mode)` |
| 127 | `  const switchRole = useCallback((role: Role) => {` |
| 128 | `    if (import.meta.env.DEV) {` |
| 129 | `      setUser(MOCK_USERS[role])` |
| 130 | `      setAccessToken('dev-mock-jwt-token')` |
| 131 | `    }` |
| 132 | `  }, [])` |
| 133 | `` |
| 134 | `  const value = useMemo<AuthState>(` |
| 135 | `    () => ({` |
| 136 | `      user,` |
| 137 | `      isAuthenticated: user !== null,` |
| 138 | `      isLoading,` |
| 139 | `      login,` |
| 140 | `      logout,` |
| 141 | `      switchRole,` |
| 142 | `    }),` |
| 143 | `    [user, isLoading, login, logout, switchRole],` |
| 144 | `  )` |
| 145 | `` |
| 146 | `  // Show a smooth loading screen while checking session on reload (no login page flash)` |
| 147 | `  if (isLoading) {` |
| 148 | `    return (` |
| 149 | `      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-4">` |
| 150 | `        <div className="flex flex-col items-center gap-4 animate-pulse">` |
| 151 | `          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700...` |
| 152 | `            <Trophy size={28} className="stroke-[2.2]" />` |
| 153 | `          </div>` |
| 154 | `          <div className="text-center">` |
| 155 | `            <h2 className="text-base font-extrabold text-text-primary">Champions Club</h2>` |
| 156 | `            <p className="text-xs text-text-tertiary mt-0.5">Restoring session...</p>` |
| 157 | `          </div>` |
| 158 | `        </div>` |
| 159 | `      </div>` |
| 160 | `    )` |
| 161 | `  }` |
| 162 | `` |
| 163 | `  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>` |
| 164 | `}` |


## `frontend/src/lib/format.ts`

- **Lines:** 126

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `/**` |
| 2 | ` * Formatting and integer arithmetic helpers for CCMS.` |
| 3 | ` *` |
| 4 | ` * Rules (SRS 1.4):` |
| 5 | ` * - Money: Integer paise only. Frontend formats ₹{(p/100).toFixed(2)}. Never float/decimal.` |
| 6 | ` * - Time: Club timezone is Asia/Kolkata (IST = UTC+05:30).` |
| 7 | ` * - Rounding: discount = (subtotal * pct + 50) // 100; tax = (total * rate + (100+rate)//2) // (...` |
| 8 | ` */` |
| 9 | `` |
| 10 | `/** Format paise integer to Indian Rupee display (e.g. 450000 -> "₹4,500.00") */` |
| 11 | `export function formatMoney(paise: number): string {` |
| 12 | `  const safePaise = Math.round(Number.isFinite(paise) ? paise : 0)` |
| 13 | `  const isNegative = safePaise < 0` |
| 14 | `  const absPaise = Math.abs(safePaise)` |
| 15 | `  const rupees = Math.floor(absPaise / 100)` |
| 16 | `  const remainder = absPaise % 100` |
| 17 | `  const paddedRemainder = remainder.toString().padStart(2, '0')` |
| 18 | `` |
| 19 | `  // Format integer rupees with Indian numbering (e.g. 1,00,000)` |
| 20 | `  const rupeesStr = rupees.toLocaleString('en-IN')` |
| 21 | `  return `${isNegative ? '-' : ''}₹${rupeesStr}.${paddedRemainder}`` |
| 22 | `}` |
| 23 | `` |
| 24 | `/** Format paise integer without decimal cents if whole, e.g. "₹4,500" */` |
| 25 | `export function formatMoneyCompact(paise: number): string {` |
| 26 | `  const safePaise = Math.round(Number.isFinite(paise) ? paise : 0)` |
| 27 | `  const rupees = Math.floor(safePaise / 100)` |
| 28 | `  return `₹${rupees.toLocaleString('en-IN')}`` |
| 29 | `}` |
| 30 | `` |
| 31 | `/** Calculate discount using integer arithmetic: (subtotal * pct + 50) // 100 */` |
| 32 | `export function calcDiscountPaise(subtotalPaise: number, discountPct: number): number {` |
| 33 | `  if (subtotalPaise <= 0 \|\| discountPct <= 0) return 0` |
| 34 | `  return Math.floor((subtotalPaise * discountPct + 50) / 100)` |
| 35 | `}` |
| 36 | `` |
| 37 | `/** Calculate embedded GST tax using integer arithmetic: (total * rate + (100+rate)//2) // (100+r...` |
| 38 | `export function calcTaxPaise(totalPaise: number, taxRatePct: number = 5): number {` |
| 39 | `  if (totalPaise <= 0 \|\| taxRatePct <= 0) return 0` |
| 40 | `  const half = Math.floor((100 + taxRatePct) / 2)` |
| 41 | `  return Math.floor((totalPaise * taxRatePct + half) / (100 + taxRatePct))` |
| 42 | `}` |
| 43 | `` |
| 44 | `/** Calculate embedded Shop GST tax (18% rate): (total * 18 + 59) // 118 */` |
| 45 | `export function calcShopTaxPaise(totalPaise: number): number {` |
| 46 | `  if (totalPaise <= 0) return 0` |
| 47 | `  return Math.floor((totalPaise * 18 + 59) / 118)` |
| 48 | `}` |
| 49 | `` |
| 50 | `const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000` |
| 51 | `` |
| 52 | `/** Convert UTC ISO string or Date to IST Date object */` |
| 53 | `function toISTDate(utcDateStr: string \| Date): Date {` |
| 54 | `  const d = typeof utcDateStr === 'string' ? new Date(utcDateStr) : utcDateStr` |
| 55 | `  // Offset to IST` |
| 56 | `  const utc = d.getTime() + d.getTimezoneOffset() * 60000` |
| 57 | `  return new Date(utc + IST_OFFSET_MS)` |
| 58 | `}` |
| 59 | `` |
| 60 | `/** Format date in IST: "09 Oct 2026" */` |
| 61 | `export function formatDateIST(dateStr: string \| Date): string {` |
| 62 | `  try {` |
| 63 | `    const ist = toISTDate(dateStr)` |
| 64 | `    return ist.toLocaleDateString('en-IN', {` |
| 65 | `      day: '2-digit',` |
| 66 | `      month: 'short',` |
| 67 | `      year: 'numeric',` |
| 68 | `    })` |
| 69 | `  } catch {` |
| 70 | `    return String(dateStr)` |
| 71 | `  }` |
| 72 | `}` |
| 73 | `` |
| 74 | `/** Format time in IST: "12:30 PM" */` |
| 75 | `export function formatTimeIST(dateStr: string \| Date): string {` |
| 76 | `  try {` |
| 77 | `    const ist = toISTDate(dateStr)` |
| 78 | `    return ist.toLocaleTimeString('en-IN', {` |
| 79 | `      hour: '2-digit',` |
| 80 | `      minute: '2-digit',` |
| 81 | `      hour12: true,` |
| 82 | `    })` |
| 83 | `  } catch {` |
| 84 | `    return String(dateStr)` |
| 85 | `  }` |
| 86 | `}` |
| 87 | `` |
| 88 | `/** Format datetime in IST: "09 Oct 2026, 12:30 PM" */` |
| 89 | `export function formatDateTimeIST(dateStr: string \| Date): string {` |
| 90 | `  try {` |
| 91 | `    const ist = toISTDate(dateStr)` |
| 92 | `    const datePart = ist.toLocaleDateString('en-IN', {` |
| 93 | `      day: '2-digit',` |
| 94 | `      month: 'short',` |
| 95 | `      year: 'numeric',` |
| 96 | `    })` |
| 97 | `    const timePart = ist.toLocaleTimeString('en-IN', {` |
| 98 | `      hour: '2-digit',` |
| 99 | `      minute: '2-digit',` |
| 100 | `      hour12: true,` |
| 101 | `    })` |
| 102 | `    return `${datePart}, ${timePart}`` |
| 103 | `  } catch {` |
| 104 | `    return String(dateStr)` |
| 105 | `  }` |
| 106 | `}` |
| 107 | `` |
| 108 | `/** Get today's calendar date in IST as "YYYY-MM-DD" */` |
| 109 | `export function getTodayIST(): string {` |
| 110 | `  const ist = toISTDate(new Date())` |
| 111 | `  const year = ist.getFullYear()` |
| 112 | `  const month = String(ist.getMonth() + 1).padStart(2, '0')` |
| 113 | `  const day = String(ist.getDate()).padStart(2, '0')` |
| 114 | `  return `${year}-${month}-${day}`` |
| 115 | `}` |
| 116 | `` |
| 117 | `/** Convert IST date string and time "HH:MM" to UTC ISO string */` |
| 118 | `export function istToUtcIso(dateStr: string, timeStr: string): string {` |
| 119 | `  // dateStr is YYYY-MM-DD, timeStr is HH:MM` |
| 120 | `  const [year, month, day] = dateStr.split('-').map(Number)` |
| 121 | `  const [hours, minutes] = timeStr.split(':').map(Number)` |
| 122 | `  // IST is UTC + 5:30 -> UTC is IST - 5:30` |
| 123 | `  const istTimeMs = Date.UTC(year, month - 1, day, hours, minutes, 0)` |
| 124 | `  const utcMs = istTimeMs - IST_OFFSET_MS` |
| 125 | `  return new Date(utcMs).toISOString()` |
| 126 | `}` |


## `frontend/src/lib/nav-config.ts`

- **Lines:** 143

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import type { LucideIcon } from 'lucide-react'` |
| 2 | `import {` |
| 3 | `  LayoutDashboard,` |
| 4 | `  Users,` |
| 5 | `  CalendarDays,` |
| 6 | `  Dumbbell,` |
| 7 | `  ShoppingBag,` |
| 8 | `  Package,` |
| 9 | `  UtensilsCrossed,` |
| 10 | `  ChefHat,` |
| 11 | `  UserSearch,` |
| 12 | `  FileText,` |
| 13 | `  Receipt,` |
| 14 | `  UsersRound,` |
| 15 | `  Bell,` |
| 16 | `  ClipboardList,` |
| 17 | `  Globe,` |
| 18 | `  Info,` |
| 19 | `  CreditCard,` |
| 20 | `  BarChart3,` |
| 21 | `  Home,` |
| 22 | `  User,` |
| 23 | `  ShoppingCart,` |
| 24 | `  Calendar,` |
| 25 | `  Trophy,` |
| 26 | `} from 'lucide-react'` |
| 27 | `import type { Role } from './auth-context'` |
| 28 | `` |
| 29 | `// ── Types ──────────────────────────────────────────────────────────────────` |
| 30 | `export interface NavItem {` |
| 31 | `  id: string` |
| 32 | `  label: string` |
| 33 | `  icon: LucideIcon` |
| 34 | `  path: string` |
| 35 | `  /** Show as a bottom-bar item on mobile (max 5) */` |
| 36 | `  mobileBar?: boolean` |
| 37 | `}` |
| 38 | `` |
| 39 | `export interface NavSection {` |
| 40 | `  title?: string` |
| 41 | `  items: NavItem[]` |
| 42 | `}` |
| 43 | `` |
| 44 | `// ── Staff navigation (desktop sidebar / icon rail) ─────────────────────────` |
| 45 | `const staffCommon: NavItem[] = [` |
| 46 | `  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/staff', mobileBar: true },` |
| 47 | `]` |
| 48 | `` |
| 49 | `const memberManagement: NavItem[] = [` |
| 50 | `  { id: 'members', label: 'Members', icon: Users, path: '/staff/members', mobileBar: true },` |
| 51 | `]` |
| 52 | `` |
| 53 | `const courtBooking: NavItem[] = [` |
| 54 | `  { id: 'bookings', label: 'Bookings', icon: CalendarDays, path: '/staff/bookings', mobileBar: tr...` |
| 55 | `]` |
| 56 | `` |
| 57 | `const shopItems: NavItem[] = [` |
| 58 | `  { id: 'shop', label: 'Shop', icon: ShoppingBag, path: '/staff/shop', mobileBar: true },` |
| 59 | `  { id: 'stock', label: 'Stock', icon: Package, path: '/staff/stock' },` |
| 60 | `]` |
| 61 | `` |
| 62 | `const barItems: NavItem[] = [` |
| 63 | `  { id: 'bar', label: 'Bar POS', icon: UtensilsCrossed, path: '/staff/bar', mobileBar: true },` |
| 64 | `  { id: 'kitchen', label: 'Kitchen', icon: ChefHat, path: '/staff/kitchen' },` |
| 65 | `]` |
| 66 | `` |
| 67 | `const leadItems: NavItem[] = [` |
| 68 | `  { id: 'leads', label: 'Leads', icon: UserSearch, path: '/staff/leads' },` |
| 69 | `]` |
| 70 | `` |
| 71 | `const financeItems: NavItem[] = [` |
| 72 | `  { id: 'payments', label: 'Payments', icon: CreditCard, path: '/staff/payments' },` |
| 73 | `  { id: 'reports', label: 'Reports', icon: BarChart3, path: '/staff/reports' },` |
| 74 | `]` |
| 75 | `` |
| 76 | `// ── Role → nav config map (one entry per SRS role: OWNER, MANAGER, FRONT_DESK, BAR_STAFF, MEMBE...` |
| 77 | `export const NAV_CONFIG: Record<Role, NavSection[]> = {` |
| 78 | `  OWNER: [` |
| 79 | `    { items: staffCommon },` |
| 80 | `    { title: 'Club', items: [...memberManagement, ...courtBooking] },` |
| 81 | `    { title: 'Commerce', items: [...shopItems, ...barItems] },` |
| 82 | `    { title: 'Pipeline', items: leadItems },` |
| 83 | `    { title: 'Finance', items: financeItems },` |
| 84 | `  ],` |
| 85 | `  MANAGER: [` |
| 86 | `    { items: staffCommon },` |
| 87 | `    { title: 'Club', items: [...memberManagement, ...courtBooking] },` |
| 88 | `    { title: 'Commerce', items: [...shopItems, ...barItems] },` |
| 89 | `    { title: 'Pipeline', items: leadItems },` |
| 90 | `    { title: 'Finance', items: financeItems.filter((i) => i.id !== 'reports') },` |
| 91 | `  ],` |
| 92 | `  FRONT_DESK: [` |
| 93 | `    { items: staffCommon },` |
| 94 | `    { title: 'Club', items: [...memberManagement, ...courtBooking] },` |
| 95 | `    { title: 'Commerce', items: shopItems },` |
| 96 | `    { title: 'Pipeline', items: leadItems },` |
| 97 | `  ],` |
| 98 | `  BAR_STAFF: [` |
| 99 | `    { items: staffCommon },` |
| 100 | `    { title: 'Bar', items: barItems },` |
| 101 | `  ],` |
| 102 | `  MEMBER: [` |
| 103 | `    {` |
| 104 | `      items: [` |
| 105 | `        { id: 'portal-home', label: 'Home', icon: Home, path: '/portal', mobileBar: true },` |
| 106 | `        { id: 'portal-book', label: 'Book', icon: Calendar, path: '/portal/book', mobileBar: true },` |
| 107 | `        { id: 'portal-bookings', label: 'Bookings', icon: CalendarDays, path: '/portal/bookings',...` |
| 108 | `        { id: 'portal-shop', label: 'Shop', icon: ShoppingCart, path: '/portal/shop', mobileBar: ...` |
| 109 | `        { id: 'portal-orders', label: 'Orders', icon: Package, path: '/portal/orders' },` |
| 110 | `        { id: 'portal-profile', label: 'Profile', icon: User, path: '/portal/profile', mobileBar:...` |
| 111 | `      ],` |
| 112 | `    },` |
| 113 | `  ],` |
| 114 | `}` |
| 115 | `` |
| 116 | `/** Get navigation sections for any SRS role */` |
| 117 | `export function getNavSections(role?: Role): NavSection[] {` |
| 118 | `  if (!role) return []` |
| 119 | `  return (NAV_CONFIG[role] ?? []).filter((s) => s.items.length > 0)` |
| 120 | `}` |
| 121 | `` |
| 122 | `/** Flatten navigation items for any SRS role */` |
| 123 | `export function getNavItems(role?: Role): NavItem[] {` |
| 124 | `  return getNavSections(role).flatMap((s) => s.items)` |
| 125 | `}` |
| 126 | `` |
| 127 | `// ── Backward-compatibility exports ─────────────────────────────────────────` |
| 128 | `export const STAFF_NAV = NAV_CONFIG` |
| 129 | `export const MEMBER_NAV: NavItem[] = NAV_CONFIG.MEMBER[0].items` |
| 130 | `` |
| 131 | `// ── Public site navigation ────────────────────────────────────────────────` |
| 132 | `export const PUBLIC_NAV: NavItem[] = [` |
| 133 | `  { id: 'home', label: 'Home', icon: Home, path: '/' },` |
| 134 | `  { id: 'about', label: 'About', icon: Info, path: '/about' },` |
| 135 | `  { id: 'plans', label: 'Plans', icon: CreditCard, path: '/plans' },` |
| 136 | `  { id: 'availability', label: 'Availability', icon: CalendarDays, path: '/availability' },` |
| 137 | `  { id: 'pub-shop', label: 'Shop', icon: ShoppingBag, path: '/shop' },` |
| 138 | `  { id: 'contact', label: 'Contact', icon: Globe, path: '/contact' },` |
| 139 | `]` |
| 140 | `` |
| 141 | `// ── Notifications bell ────────────────────────────────────────────────────` |
| 142 | `export const NOTIFICATION_ICON = Bell` |
| 143 | `` |


## `frontend/src/lib/utils.ts`

- **Lines:** 43

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import clsx, { type ClassValue } from 'clsx'` |
| 2 | `` |
| 3 | `/** Merge Tailwind class names — thin wrapper over clsx (no tailwind-merge to stay within the pin...` |
| 4 | `export function cn(...inputs: ClassValue[]): string {` |
| 5 | `  return clsx(inputs)` |
| 6 | `}` |
| 7 | `` |
| 8 | `/** Format integer paise as ₹X,XXX.XX (SRS §1.4). */` |
| 9 | `export function formatINR(paise: number): string {` |
| 10 | `  const rupees = paise / 100` |
| 11 | `  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 ...` |
| 12 | `}` |
| 13 | `` |
| 14 | `/** Format a date string to IST display (DD MMM YYYY). */` |
| 15 | `export function formatDate(iso: string): string {` |
| 16 | `  return new Date(iso).toLocaleDateString('en-IN', {` |
| 17 | `    day: '2-digit',` |
| 18 | `    month: 'short',` |
| 19 | `    year: 'numeric',` |
| 20 | `    timeZone: 'Asia/Kolkata',` |
| 21 | `  })` |
| 22 | `}` |
| 23 | `` |
| 24 | `/** Format time in IST (HH:MM). */` |
| 25 | `export function formatTime(iso: string): string {` |
| 26 | `  return new Date(iso).toLocaleTimeString('en-IN', {` |
| 27 | `    hour: '2-digit',` |
| 28 | `    minute: '2-digit',` |
| 29 | `    hour12: true,` |
| 30 | `    timeZone: 'Asia/Kolkata',` |
| 31 | `  })` |
| 32 | `}` |
| 33 | `` |
| 34 | `/** Generate initials from a full name (max 2 chars). */` |
| 35 | `export function getInitials(name: string): string {` |
| 36 | `  return name` |
| 37 | `    .split(' ')` |
| 38 | `    .filter(Boolean)` |
| 39 | `    .map((w) => w[0])` |
| 40 | `    .slice(0, 2)` |
| 41 | `    .join('')` |
| 42 | `    .toUpperCase()` |
| 43 | `}` |


## `frontend/src/main.tsx`

- **Lines:** 145

- **Purpose:** React entry: Router, React Query, auth/toast providers, all routes.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import React from 'react'` |
| 2 | `import ReactDOM from 'react-dom/client'` |
| 3 | `import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'` |
| 4 | `import { QueryClient, QueryClientProvider } from '@tanstack/react-query'` |
| 5 | `import './index.css'` |
| 6 | `` |
| 7 | `import { AuthProvider } from './lib/auth-context'` |
| 8 | `import { ToastProvider } from './components/ui/Toast'` |
| 9 | `import { AppShell } from './components/layout/AppShell'` |
| 10 | `import { PublicLayout } from './components/layout/PublicLayout'` |
| 11 | `import { RoleGuard } from './components/layout/RoleGuard'` |
| 12 | `` |
| 13 | `// ── Public pages ───────────────────────────────────────────────────────────` |
| 14 | `import HomePage from './pages/public/HomePage'` |
| 15 | `import AboutPage from './pages/public/AboutPage'` |
| 16 | `import PlansPage from './pages/public/PlansPage'` |
| 17 | `import AvailabilityPage from './pages/public/AvailabilityPage'` |
| 18 | `import ShopPage from './pages/public/ShopPage'` |
| 19 | `import ContactPage from './pages/public/ContactPage'` |
| 20 | `import LoginPage from './pages/public/LoginPage'` |
| 21 | `` |
| 22 | `// ── Member portal pages ───────────────────────────────────────────────────` |
| 23 | `import PortalHome from './pages/portal/PortalHome'` |
| 24 | `import PortalBook from './pages/portal/PortalBook'` |
| 25 | `import PortalBookings from './pages/portal/PortalBookings'` |
| 26 | `import PortalShop from './pages/portal/PortalShop'` |
| 27 | `import PortalOrders from './pages/portal/PortalOrders'` |
| 28 | `import PortalSocial from './pages/portal/PortalSocial'` |
| 29 | `import PortalProfile from './pages/portal/PortalProfile'` |
| 30 | `` |
| 31 | `// ── Staff pages ───────────────────────────────────────────────────────────` |
| 32 | `import StaffDashboard from './pages/staff/StaffDashboard'` |
| 33 | `import StaffMembers from './pages/staff/StaffMembers'` |
| 34 | `import StaffMemberDetail from './pages/staff/StaffMemberDetail'` |
| 35 | `import StaffBookings from './pages/staff/StaffBookings'` |
| 36 | `import StaffCourts from './pages/staff/StaffCourts'` |
| 37 | `import StaffSocial from './pages/staff/StaffSocial'` |
| 38 | `import StaffShop from './pages/staff/StaffShop'` |
| 39 | `import StaffStock from './pages/staff/StaffStock'` |
| 40 | `import StaffBar from './pages/staff/StaffBar'` |
| 41 | `import StaffKitchen from './pages/staff/StaffKitchen'` |
| 42 | `import StaffLeads from './pages/staff/StaffLeads'` |
| 43 | `import StaffPayments from './pages/staff/StaffPayments'` |
| 44 | `import StaffInvoices from './pages/staff/StaffInvoices'` |
| 45 | `import StaffExpenses from './pages/staff/StaffExpenses'` |
| 46 | `import StaffReports from './pages/staff/StaffReports'` |
| 47 | `import StaffHR from './pages/staff/StaffHR'` |
| 48 | `import StaffAudit from './pages/staff/StaffAudit'` |
| 49 | `` |
| 50 | `// ── Dev pages ─────────────────────────────────────────────────────────────` |
| 51 | `import DesignShowcase from './pages/dev/DesignShowcase'` |
| 52 | `` |
| 53 | `// ── Query client ──────────────────────────────────────────────────────────` |
| 54 | `const queryClient = new QueryClient({` |
| 55 | `  defaultOptions: {` |
| 56 | `    queries: {` |
| 57 | `      staleTime: 30_000,` |
| 58 | `      retry: 1,` |
| 59 | `      refetchOnWindowFocus: false,` |
| 60 | `    },` |
| 61 | `  },` |
| 62 | `})` |
| 63 | `` |
| 64 | `// ── Staff roles for the guard ─────────────────────────────────────────────` |
| 65 | `const STAFF_ROLES = ['OWNER', 'MANAGER', 'FRONT_DESK', 'BAR_STAFF'] as const` |
| 66 | `` |
| 67 | `ReactDOM.createRoot(document.getElementById('root')!).render(` |
| 68 | `  <React.StrictMode>` |
| 69 | `    <QueryClientProvider client={queryClient}>` |
| 70 | `      <AuthProvider>` |
| 71 | `        <ToastProvider>` |
| 72 | `          <BrowserRouter>` |
| 73 | `            <Routes>` |
| 74 | `              {/* ── Public (no auth, PublicLayout) ── */}` |
| 75 | `              <Route element={<PublicLayout />}>` |
| 76 | `                <Route path="/" element={<HomePage />} />` |
| 77 | `                <Route path="/about" element={<AboutPage />} />` |
| 78 | `                <Route path="/plans" element={<PlansPage />} />` |
| 79 | `                <Route path="/availability" element={<AvailabilityPage />} />` |
| 80 | `                <Route path="/shop" element={<ShopPage />} />` |
| 81 | `                <Route path="/contact" element={<ContactPage />} />` |
| 82 | `                <Route path="/login" element={<LoginPage />} />` |
| 83 | `              </Route>` |
| 84 | `` |
| 85 | `              {/* ── Member portal (MEMBER role, inside shell) ── */}` |
| 86 | `              <Route` |
| 87 | `                element={` |
| 88 | `                  <RoleGuard allowed={['MEMBER']}>` |
| 89 | `                    <AppShell />` |
| 90 | `                  </RoleGuard>` |
| 91 | `                }` |
| 92 | `              >` |
| 93 | `                <Route path="/portal" element={<PortalHome />} />` |
| 94 | `                <Route path="/portal/book" element={<PortalBook />} />` |
| 95 | `                <Route path="/portal/bookings" element={<PortalBookings />} />` |
| 96 | `                <Route path="/portal/shop" element={<PortalShop />} />` |
| 97 | `                <Route path="/portal/orders" element={<PortalOrders />} />` |
| 98 | `                <Route path="/portal/social" element={<PortalSocial />} />` |
| 99 | `                <Route path="/portal/profile" element={<PortalProfile />} />` |
| 100 | `              </Route>` |
| 101 | `` |
| 102 | `              {/* ── Staff console (staff roles, inside shell) ── */}` |
| 103 | `              <Route` |
| 104 | `                element={` |
| 105 | `                  <RoleGuard allowed={[...STAFF_ROLES]}>` |
| 106 | `                    <AppShell />` |
| 107 | `                  </RoleGuard>` |
| 108 | `                }` |
| 109 | `              >` |
| 110 | `                <Route path="/staff" element={<StaffDashboard />} />` |
| 111 | `                <Route path="/staff/members" element={<StaffMembers />} />` |
| 112 | `                <Route path="/staff/members/:id" element={<StaffMemberDetail />} />` |
| 113 | `                <Route path="/staff/bookings" element={<StaffBookings />} />` |
| 114 | `                <Route path="/staff/courts" element={<StaffCourts />} />` |
| 115 | `                <Route path="/staff/social" element={<StaffSocial />} />` |
| 116 | `                <Route path="/staff/shop" element={<StaffShop />} />` |
| 117 | `                <Route path="/staff/stock" element={<StaffStock />} />` |
| 118 | `                <Route path="/staff/bar" element={<StaffBar />} />` |
| 119 | `                <Route path="/staff/kitchen" element={<StaffKitchen />} />` |
| 120 | `                <Route path="/staff/leads" element={<StaffLeads />} />` |
| 121 | `                <Route path="/staff/payments" element={<StaffPayments />} />` |
| 122 | `                <Route path="/staff/invoices" element={<StaffInvoices />} />` |
| 123 | `                <Route path="/staff/expenses" element={<StaffExpenses />} />` |
| 124 | `                <Route path="/staff/reports" element={<StaffReports />} />` |
| 125 | `                <Route path="/staff/hr" element={<StaffHR />} />` |
| 126 | `                <Route path="/staff/audit" element={<StaffAudit />} />` |
| 127 | `              </Route>` |
| 128 | `` |
| 129 | `              {/* ── Dev pages (dev only, no guard, inside shell for nav testing) ── */}` |
| 130 | `              {import.meta.env.DEV && (` |
| 131 | `                <Route element={<AppShell />}>` |
| 132 | `                  <Route path="/dev/design" element={<DesignShowcase />} />` |
| 133 | `                </Route>` |
| 134 | `              )}` |
| 135 | `` |
| 136 | `` |
| 137 | `              {/* ── Catch-all ── */}` |
| 138 | `              <Route path="*" element={<Navigate to="/" replace />} />` |
| 139 | `            </Routes>` |
| 140 | `          </BrowserRouter>` |
| 141 | `        </ToastProvider>` |
| 142 | `      </AuthProvider>` |
| 143 | `    </QueryClientProvider>` |
| 144 | `  </React.StrictMode>,` |
| 145 | `)` |


## `frontend/src/mocks/seed-data.ts`

- **Lines:** 464

- **Purpose:** Project asset; see contents and parent folder context below.


### Structure outline


- export const `MOCK_PLANS` — line **21**
- export const `MOCK_COURT_PRICES` — line **27**
- export const `MOCK_COURTS` — line **50**
- export const `MOCK_PRODUCTS` — line **59**
- export const `MOCK_MENU` — line **76**
- export const `MOCK_TABLES` — line **94**
- const `MEMBER_NAMES` — line **106**
- export function `generateMockMembers` — line **115**
- const `today` — line **116**
- const `id` — line **120**
- const `codeNum` — line **121**
- const `member_code` — line **122**
- const `phone` — line **123**
- const `email` — line **124**
- const `expDate` — line **142**
- export function `generateInitialBookings` — line **173**
- const `today` — line **174**
- const `b` — line **175**
- export function `generateInitialBarOrders` — line **261**
- const `today` — line **262**
- export function `generateInitialShopOrders` — line **329**
- const `today` — line **330**
- export function `generateInitialPayments` — line **373**
- const `today` — line **374**
- const `payments` — line **376**
- const `methods` — line **377**
- const `sources` — line **378**
- const `dt` — line **382**
- const `dtStr` — line **383**
- const `member` — line **384**
- const `count` — line **387**
- const `src` — line **389**
- const `method` — line **390**
- const `amountPaise` — line **391**
- const `isRefunded` — line **399**
- export function `generateInitialSocialSessions` — line **420**
- const `today` — line **421**
- const `sessions` — line **423**
- const `configs` — line **426**
- const `dt` — line **437**
- const `dtEnd` — line **438**
- const `participantsCount` — line **441**
- const `participants` — line **442**



## `frontend/src/mocks/store.ts`

- **Lines:** 1100

- **Purpose:** Project asset; see contents and parent folder context below.


### Structure outline


- export function `setSimulatedError` — line **71**
- export function `getSimulatedError` — line **75**
- function `checkSimulatedError` — line **79**
- const `code` — line **81**
- const `err` — line **83**
- export function `getTierPrice` — line **94**
- const `p` — line **95**
- export function `getMemberDiscount` — line **99**
- const `m` — line **101**
- const `plan` — line **103**
- export function `getMockCourtAvailability` — line **109**
- const `slotTimes` — line **111**
- const `hh` — line **113**
- const `m` — line **123**
- const `filteredCourts` — line **129**
- const `courtsResult` — line **131**
- const `courtBookings` — line **132**
- const `slots` — line **136**
- const `startIso` — line **137**
- const `existing` — line **140**
- const `bStart` — line **142**
- const `bEnd` — line **143**
- const `sTime` — line **144**
- const `m` — line **149**
- const `dayOfWeek` — line **163**
- const `price` — line **174**
- export function `getMockBookings` — line **199**
- export function `createMockBooking` — line **216**
- const `court` — line **219**
- const `startMs` — line **225**
- const `endIso` — line **226**
- const `conflict` — line **229**
- const `bookingDate` — line **243**
- const `count` — line **244**
- const `m` — line **262**
- const `price` — line **268**
- const `isPaid` — line **269**
- const `newBooking` — line **271**
- export function `cancelMockBooking` — line **291**
- const `b` — line **293**
- const `startTimeMs` — line **297**
- const `nowMs` — line **298**
- const `hoursUntilStart` — line **303**
- const `isEligibleForRefund` — line **305**
- const `refundPaise` — line **306**
- export function `updateMockBookingStatus` — line **321**
- const `b` — line **322**
- export function `payMockBooking` — line **328**
- const `b` — line **329**
- export function `getMockMembers` — line **336**
- *(more symbols omitted)*



## `frontend/src/pages/PlaceholderPage.tsx`

- **Lines:** 22

- **Purpose:** React page component for a route in `main.tsx`.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import { useLocation } from 'react-router-dom'` |
| 2 | `` |
| 3 | `/**` |
| 4 | ` * Generic placeholder page — renders the route name.` |
| 5 | ` * Will be replaced with actual page content in later prompts.` |
| 6 | ` */` |
| 7 | `export function PlaceholderPage({ title }: { title?: string }) {` |
| 8 | `  const location = useLocation()` |
| 9 | `  const displayTitle = title ?? location.pathname` |
| 10 | `` |
| 11 | `  return (` |
| 12 | `    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">` |
| 13 | `      <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center mb-4">` |
| 14 | `        <span className="text-2xl">🚧</span>` |
| 15 | `      </div>` |
| 16 | `      <h1 className="text-xl font-bold text-text-primary mb-2">{displayTitle}</h1>` |
| 17 | `      <p className="text-sm text-text-secondary max-w-sm">` |
| 18 | `        This page is a placeholder. Content will be built in upcoming prompts.` |
| 19 | `      </p>` |
| 20 | `    </div>` |
| 21 | `  )` |
| 22 | `}` |


## `frontend/src/pages/dev/DesignShowcase.tsx`

- **Lines:** 379

- **Purpose:** React page component for a route in `main.tsx`.


### Structure outline


- default export function `DesignShowcase` — line **35**
- const `sampleColumns` — line **359**
- const `variant` — line **366**
- const `sampleData` — line **373**



## `frontend/src/pages/portal/.gitkeep`

- **Lines:** 0

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|


## `frontend/src/pages/portal/PortalBook.tsx`

- **Lines:** 457

- **Purpose:** React page component for a route in `main.tsx`.


### Structure outline


- const `SPORTS` — line **36**
- default export function `PortalBook` — line **44**
- const `navigate` — line **46**
- const `memberId` — line **48**
- const `todayStr` — line **50**
- const `next7Days` — line **55**
- const `days` — line **56**
- const `dt` — line **59**
- const `dateStr` — line **60**
- const `dayName` — line **61**
- const `dayNumber` — line **62**
- const `memberTier` — line **75**
- const `sportParam` — line **78**
- const `createBookingMutation` — line **87**
- const `bookingsOnDateCount` — line **91**
- const `isDailyLimitReached` — line **97**
- const `handleSlotClick` — line **110**
- const `handleBookingSubmit` — line **126**
- const `price` — line **131**
- const `methodToPass` — line **132**
- const `msg` — line **147**
- const `isSelected` — line **192**
- const `startTime` — line **284**
- const `isFree` — line **285**
- const `isSocial` — line **286**
- const `isBooked` — line **287**
- const `price` — line **288**



## `frontend/src/pages/portal/PortalBookings.tsx`

- **Lines:** 400

- **Purpose:** React page component for a route in `main.tsx`.


### Structure outline


- default export function `PortalBookings` — line **34**
- const `navigate` — line **36**
- const `memberId` — line **38**
- const `cancelMutation` — line **43**
- const `getCourtInfo` — line **46**
- const `c` — line **47**
- const `nowMs` — line **59**
- const `upcoming` — line **63**
- const `past` — line **64**
- const `startMs` — line **67**
- const `displayedBookings` — line **82**
- const `refundDetails` — line **85**
- const `startTimeMs` — line **88**
- const `hoursUntilStart` — line **89**
- const `isPaid` — line **90**
- const `isWaived` — line **91**
- const `isEligible` — line **92**
- const `handleOpenCancel` — line **103**
- const `handleConfirmCancel` — line **109**
- const `res` — line **115**
- const `msg` — line **128**
- const `tabOptions` — line **133**
- const `startMs` — line **213**
- const `canCancel` — line **214**
- const `statusVariants` — line **216**
- const `paymentVariants` — line **223**
- const `courtInfo` — line **230**



## `frontend/src/pages/portal/PortalHome.tsx`

- **Lines:** 438

- **Purpose:** React page component for a route in `main.tsx`.


### Structure outline


- default export function `PortalHome` — line **37**
- const `navigate` — line **39**
- const `memberId` — line **40**
- const `todayStr` — line **50**
- const `upcomingBookings` — line **53**
- const `recentPayments` — line **58**
- const `nextSocial` — line **61**
- const `tier` — line **63**
- const `isExpiring` — line **64**
- const `isExpired` — line **65**
- const `tierGradients` — line **67**
- const `tierGradient` — line **73**
- const `court` — line **279**



## `frontend/src/pages/portal/PortalOrders.tsx`

- **Lines:** 575

- **Purpose:** React page component for a route in `main.tsx`.


### Structure outline


- function `getOrderStatusChip` — line **38**
- function `getPaymentStatusChip` — line **55**
- default export function `PortalOrders` — line **69**
- const `navigate` — line **71**
- const `memberId` — line **73**
- const `cancelMutation` — line **77**
- const `sortedOrders` — line **89**
- const `filteredOrders` — line **96**
- const `handleConfirmCancel` — line **112**
- const `msg` — line **126**
- const `activeOrdersCount` — line **137**
- const `isCancellable` — line **229**
- const `gst` — line **230**
- const `totalItemsCount` — line **231**
- const `orderStatus` — line **232**
- const `paymentStatus` — line **233**



## `frontend/src/pages/portal/PortalProfile.tsx`

- **Lines:** 2

- **Purpose:** React page component for a route in `main.tsx`.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import { PlaceholderPage } from '../PlaceholderPage'` |
| 2 | `export default function PortalProfile() { return <PlaceholderPage title="My Profile" /> }` |


## `frontend/src/pages/portal/PortalShop.tsx`

- **Lines:** 776

- **Purpose:** React page component for a route in `main.tsx`.


### Structure outline


- const `CATEGORIES` — line **52**
- default export function `PortalShop` — line **61**
- const `navigate` — line **63**
- const `memberId` — line **65**
- const `createOrderMutation` — line **78**
- const `filteredProducts` — line **97**
- const `q` — line **99**
- const `discountPct` — line **109**
- const `subtotalPaise` — line **124**
- const `discountPaise` — line **128**
- const `totalPaise` — line **132**
- const `gstPaise` — line **136**
- const `totalCartCount` — line **140**
- const `addToCart` — line **145**
- const `existing` — line **148**
- const `updateQuantity` — line **168**
- const `nextQty` — line **173**
- const `removeFromCart` — line **187**
- const `handleCheckout` — line **191**
- const `order` — line **205**
- const `msg` — line **228**
- const `isSelected` — line **276**
- const `inStock` — line **337**
- const `cartItem` — line **338**
- const `isDiscounted` — line **339**
- const `lineTotal` — line **482**



## `frontend/src/pages/portal/PortalSocial.tsx`

- **Lines:** 286

- **Purpose:** React page component for a route in `main.tsx`.


### Structure outline


- default export function `PortalSocial` — line **33**
- const `memberId` — line **36**
- const `todayStr` — line **38**
- const `isGoldMember` — line **40**
- const `joinMutation` — line **47**
- const `leaveMutation` — line **48**
- const `handleJoin` — line **54**
- const `handleLeave` — line **70**
- const `hasJoined` — line **145**
- const `isFull` — line **146**
- const `spotsRemaining` — line **147**
- const `fillPct` — line **148**
- const `isFree` — line **150**
- const `feeDisplay` — line **151**



## `frontend/src/pages/public/.gitkeep`

- **Lines:** 0

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|


## `frontend/src/pages/public/AboutPage.tsx`

- **Lines:** 143

- **Purpose:** React page component for a route in `main.tsx`.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import React from 'react'` |
| 2 | `import { Link } from 'react-router-dom'` |
| 3 | `import {` |
| 4 | `  Trophy,` |
| 5 | `  Award,` |
| 6 | `  ShieldCheck,` |
| 7 | `  Users,` |
| 8 | `  Target,` |
| 9 | `  Clock,` |
| 10 | `  MapPin,` |
| 11 | `  ArrowRight,` |
| 12 | `  Sparkles,` |
| 13 | `} from 'lucide-react'` |
| 14 | `import { Button, Card } from '../../components/ui'` |
| 15 | `` |
| 16 | `const VALUES = [` |
| 17 | `  {` |
| 18 | `    icon: Trophy,` |
| 19 | `    title: 'Excellence in Sport',` |
| 20 | `    description: 'Providing competition-standard courts, precision lighting, and tournament certi...` |
| 21 | `  },` |
| 22 | `  {` |
| 23 | `    icon: Users,` |
| 24 | `    title: 'Inclusive Community',` |
| 25 | `    description: 'Fostering a welcoming environment for junior beginners, casual enthusiasts, and...` |
| 26 | `  },` |
| 27 | `  {` |
| 28 | `    icon: ShieldCheck,` |
| 29 | `    title: 'Integrity & Fair Play',` |
| 30 | `    description: 'Transparent hourly pricing, equal access booking rules, and zero hidden fees.',` |
| 31 | `  },` |
| 32 | `  {` |
| 33 | `    icon: Target,` |
| 34 | `    title: 'Athlete Development',` |
| 35 | `    description: 'Structured junior training programs and certified professional coaches across a...` |
| 36 | `  },` |
| 37 | `]` |
| 38 | `` |
| 39 | `export default function AboutPage() {` |
| 40 | `  return (` |
| 41 | `    <div className="space-y-12 md:space-y-16 pb-12">` |
| 42 | `      {/* ── Header ──────────────────────────────────────────────────────── */}` |
| 43 | `      <div className="text-center max-w-2xl mx-auto space-y-3">` |
| 44 | `        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-50 bor...` |
| 45 | `          <Trophy size={14} />` |
| 46 | `          <span>About Champions Club</span>` |
| 47 | `        </div>` |
| 48 | `        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-text-primary">` |
| 49 | `          Bangalore&apos;s Home for Racquet Sports` |
| 50 | `        </h1>` |
| 51 | `        <p className="text-sm text-text-secondary leading-relaxed">` |
| 52 | `          Founded with a vision to create a premier athletic haven where sporting passion, commun...` |
| 53 | `        </p>` |
| 54 | `      </div>` |
| 55 | `` |
| 56 | `      {/* ── Story Card ──────────────────────────────────────────────────── */}` |
| 57 | `      <Card className="p-6 sm:p-10 rounded-3xl border border-border-light bg-surface shadow-card ...` |
| 58 | `        <div className="max-w-3xl space-y-4 text-xs sm:text-sm text-text-secondary leading-relaxed">` |
| 59 | `          <h2 className="text-xl sm:text-2xl font-extrabold text-text-primary">` |
| 60 | `            World-Class Infrastructure in the Heart of the City` |
| 61 | `          </h2>` |
| 62 | `          <p>` |
| 63 | `            Champions Club was established to solve a critical need in Bengaluru&apos;s sporting ...` |
| 64 | `          </p>` |
| 65 | `          <p>` |
| 66 | `            Spread across dedicated athletic grounds in Koramangala, our facility features 2 ITF-...` |
| 67 | `          </p>` |
| 68 | `          <p>` |
| 69 | `            With on-site racquet restringing, a performance pro-shop, a recovery sports lounge & ...` |
| 70 | `          </p>` |
| 71 | `        </div>` |
| 72 | `` |
| 73 | `        <div className="pt-6 border-t border-border-light grid grid-cols-2 sm:grid-cols-4 gap-4 t...` |
| 74 | `          <div>` |
| 75 | `            <div className="text-2xl sm:text-3xl font-extrabold text-primary-600">6</div>` |
| 76 | `            <div className="text-xs font-semibold text-text-tertiary mt-0.5">Pro Courts</div>` |
| 77 | `          </div>` |
| 78 | `          <div>` |
| 79 | `            <div className="text-2xl sm:text-3xl font-extrabold text-primary-600">15 hrs</div>` |
| 80 | `            <div className="text-xs font-semibold text-text-tertiary mt-0.5">Daily Open Hours</div>` |
| 81 | `          </div>` |
| 82 | `          <div>` |
| 83 | `            <div className="text-2xl sm:text-3xl font-extrabold text-primary-600">500+</div>` |
| 84 | `            <div className="text-xs font-semibold text-text-tertiary mt-0.5">Active Members</div>` |
| 85 | `          </div>` |
| 86 | `          <div>` |
| 87 | `            <div className="text-2xl sm:text-3xl font-extrabold text-primary-600">4</div>` |
| 88 | `            <div className="text-xs font-semibold text-text-tertiary mt-0.5">Sports Disciplines</...` |
| 89 | `          </div>` |
| 90 | `        </div>` |
| 91 | `      </Card>` |
| 92 | `` |
| 93 | `      {/* ── Core Values ──────────────────────────────────────────────────── */}` |
| 94 | `      <section className="space-y-6">` |
| 95 | `        <div className="text-center max-w-xl mx-auto space-y-2">` |
| 96 | `          <h2 className="text-2xl font-extrabold text-text-primary tracking-tight">` |
| 97 | `            Our Core Values` |
| 98 | `          </h2>` |
| 99 | `          <p className="text-xs text-text-secondary">` |
| 100 | `            Guided by principles of sporting excellence, fair play, and athlete well-being.` |
| 101 | `          </p>` |
| 102 | `        </div>` |
| 103 | `` |
| 104 | `        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">` |
| 105 | `          {VALUES.map((val) => (` |
| 106 | `            <Card key={val.title} className="p-5 rounded-2xl border border-border-light bg-surfac...` |
| 107 | `              <div className="w-10 h-10 rounded-xl bg-canvas flex items-center justify-center tex...` |
| 108 | `                <val.icon size={20} />` |
| 109 | `              </div>` |
| 110 | `              <h3 className="font-bold text-base text-text-primary">{val.title}</h3>` |
| 111 | `              <p className="text-xs text-text-secondary leading-relaxed">{val.description}</p>` |
| 112 | `            </Card>` |
| 113 | `          ))}` |
| 114 | `        </div>` |
| 115 | `      </section>` |
| 116 | `` |
| 117 | `      {/* ── CTA Banner ──────────────────────────────────────────────────── */}` |
| 118 | `      <section className="p-8 sm:p-10 rounded-3xl bg-surface border border-border-light shadow-so...` |
| 119 | `        <div className="space-y-1 text-center sm:text-left">` |
| 120 | `          <h3 className="text-xl font-extrabold text-text-primary">` |
| 121 | `            Experience Champions Club Today` |
| 122 | `          </h3>` |
| 123 | `          <p className="text-xs text-text-secondary">` |
| 124 | `            Schedule a walkthrough or book a trial match with our coaches.` |
| 125 | `          </p>` |
| 126 | `        </div>` |
| 127 | `` |
| 128 | `        <div className="flex items-center gap-3">` |
| 129 | `          <Link to="/contact">` |
| 130 | `            <Button variant="primary" pill iconRight={ArrowRight} className="text-xs font-bold mi...` |
| 131 | `              Book a Trial` |
| 132 | `            </Button>` |
| 133 | `          </Link>` |
| 134 | `          <Link to="/plans">` |
| 135 | `            <Button variant="secondary" pill className="text-xs font-bold min-h-[44px] px-6">` |
| 136 | `              View Plans` |
| 137 | `            </Button>` |
| 138 | `          </Link>` |
| 139 | `        </div>` |
| 140 | `      </section>` |
| 141 | `    </div>` |
| 142 | `  )` |
| 143 | `}` |


## `frontend/src/pages/public/AvailabilityPage.tsx`

- **Lines:** 285

- **Purpose:** React page component for a route in `main.tsx`.


### Structure outline


- const `SPORTS_FILTER` — line **19**
- default export function `AvailabilityPage` — line **27**
- const `navigate` — line **28**
- const `todayStr` — line **29**
- const `next7Days` — line **35**
- const `list` — line **36**
- const `base` — line **37**
- const `d` — line **40**
- const `yyyy` — line **42**
- const `mm` — line **43**
- const `dd` — line **44**
- const `dateStr` — line **45**
- const `dayLabel` — line **47**
- const `dateNum` — line **48**
- const `courtsWithDaySlots` — line **72**
- const `daySlots` — line **75**
- const `handleSlotClick` — line **83**
- const `isSelected` — line **122**
- const `isSelected` — line **148**
- const `freeCount` — line **214**
- const `isFree` — line **236**
- const `timeLabel` — line **237**



## `frontend/src/pages/public/ContactPage.tsx`

- **Lines:** 417

- **Purpose:** React page component for a route in `main.tsx`.


### Structure outline


- const `INTEREST_OPTIONS` — line **18**
- default export function `ContactPage` — line **25**
- const `submitMutation` — line **26**
- const `handleSubmit` — line **44**
- const `handleReset` — line **95**
- const `isSelected` — line **240**



## `frontend/src/pages/public/HomePage.tsx`

- **Lines:** 457

- **Purpose:** React page component for a route in `main.tsx`.


### Structure outline


- const `SPORTS_STRIP` — line **25**
- const `FACILITIES` — line **56**
- const `TESTIMONIALS` — line **89**
- default export function `HomePage` — line **110**
- const `navigate` — line **111**
- const `freeSlotsToday` — line **116**
- const `isGold` — line **293**



## `frontend/src/pages/public/LoginPage.tsx`

- **Lines:** 230

- **Purpose:** React page component for a route in `main.tsx`.


### Structure outline


- const `DEMO_PERSONAS` — line **18**
- default export function `LoginPage` — line **26**
- const `navigate` — line **28**
- const `handleSubmit` — line **44**
- const `user` — line **57**
- const `handleQuickFill` — line **82**



## `frontend/src/pages/public/PlansPage.tsx`

- **Lines:** 320

- **Purpose:** React page component for a route in `main.tsx`.


### Structure outline


- const `SPORT_NAMES` — line **20**
- const `FAQS` — line **27**
- default export function `PlansPage` — line **50**
- const `priceMatrix` — line **55**
- const `sports` — line **56**
- const `getPrice` — line **58**
- const `item` — line **59**
- const `isGold` — line **103**
- const `isJunior` — line **104**



## `frontend/src/pages/public/ShopPage.tsx`

- **Lines:** 268

- **Purpose:** React page component for a route in `main.tsx`.


### Structure outline


- const `CATEGORIES` — line **19**
- default export function `ShopPage` — line **28**
- const `navigate` — line **29**
- const `filteredProducts` — line **41**
- const `q` — line **43**
- const `isSelected` — line **121**



## `frontend/src/pages/staff/.gitkeep`

- **Lines:** 0

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|


## `frontend/src/pages/staff/StaffAudit.tsx`

- **Lines:** 2

- **Purpose:** React page component for a route in `main.tsx`.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import { PlaceholderPage } from '../PlaceholderPage'` |
| 2 | `export default function StaffAudit() { return <PlaceholderPage title="Audit Log" /> }` |


## `frontend/src/pages/staff/StaffBar.tsx`

- **Lines:** 929

- **Purpose:** React page component for a route in `main.tsx`.


### Structure outline


- default export function `StaffBar` — line **56**
- const `createOrderMut` — line **91**
- const `addItemsMut` — line **92**
- const `payBarMut` — line **93**
- const `putOnTabMut` — line **94**
- const `settleTabsMut` — line **95**
- const `filteredMenu` — line **99**
- const `q` — line **103**
- const `tabOrders` — line **110**
- const `tabsByMember` — line **116**
- const `map` — line **117**
- const `existing` — line **120**
- function `addToCart` — line **137**
- const `idx` — line **140**
- const `next` — line **142**
- function `updateCartQty` — line **150**
- const `idx` — line **152**
- const `next` — line **154**
- const `newQty` — line **155**
- function `setCartNote` — line **165**
- function `clearCart` — line **169**
- const `cartSubtotal` — line **179**
- const `order` — line **189**
- const `code` — line **202**
- const `totalSettled` — line **233**
- const `menuCategories` — line **245**
- const `hasOrder` — line **300**
- const `isSelected` — line **301**
- const `inCart` — line **443**



## `frontend/src/pages/staff/StaffBookings.tsx`

- **Lines:** 628

- **Purpose:** React page component for a route in `main.tsx`.


### Structure outline


- default export function `StaffBookings` — line **36**
- const `createBookingMutation` — line **68**
- const `cancelBookingMutation` — line **69**
- const `updateStatusMutation` — line **70**
- const `payBookingMutation` — line **71**
- const `selectedBooking` — line **73**
- const `appliedTier` — line **76**
- const `tierPrices` — line **80**
- const `calculatedPricePaise` — line **87**
- const `handleOpenSlot` — line **92**
- const `handleCreateBooking` — line **98**
- const `code` — line **127**
- const `handleCancelBooking` — line **138**
- const `res` — line **141**
- const `handleMarkStatus` — line **158**
- const `handlePay` — line **169**
- const `court` — line **485**



## `frontend/src/pages/staff/StaffCourts.tsx`

- **Lines:** 2

- **Purpose:** React page component for a route in `main.tsx`.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import { PlaceholderPage } from '../PlaceholderPage'` |
| 2 | `export default function StaffCourts() { return <PlaceholderPage title="Courts" /> }` |


## `frontend/src/pages/staff/StaffDashboard.tsx`

- **Lines:** 868

- **Purpose:** React page component for a route in `main.tsx`.


### Structure outline


- function `OwnerManagerDashboard` — line **59**
- const `navigate` — line **60**
- const `todayStr` — line **66**
- const `chartData` — line **68**
- const `sourceData` — line **78**
- const `methodData` — line **87**
- const `periodTabs` — line **96**
- function `BarDailyReportCard` — line **486**
- const `navigate` — line **487**
- const `todayStr` — line **489**
- const `pct` — line **593**
- function `FrontDeskDashboard` — line **658**
- const `navigate` — line **660**
- const `todayStr` — line **663**
- const `updateStatusMutation` — line **667**
- const `handleCheckIn` — line **669**
- const `court` — line **769**
- default export function `StaffDashboard` — line **853**



## `frontend/src/pages/staff/StaffExpenses.tsx`

- **Lines:** 2

- **Purpose:** React page component for a route in `main.tsx`.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import { PlaceholderPage } from '../PlaceholderPage'` |
| 2 | `export default function StaffExpenses() { return <PlaceholderPage title="Expenses" /> }` |


## `frontend/src/pages/staff/StaffHR.tsx`

- **Lines:** 2

- **Purpose:** React page component for a route in `main.tsx`.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import { PlaceholderPage } from '../PlaceholderPage'` |
| 2 | `export default function StaffHR() { return <PlaceholderPage title="Staff / HR" /> }` |


## `frontend/src/pages/staff/StaffInvoices.tsx`

- **Lines:** 2

- **Purpose:** React page component for a route in `main.tsx`.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import { PlaceholderPage } from '../PlaceholderPage'` |
| 2 | `export default function StaffInvoices() { return <PlaceholderPage title="Invoices" /> }` |


## `frontend/src/pages/staff/StaffKitchen.tsx`

- **Lines:** 289

- **Purpose:** React page component for a route in `main.tsx`.


### Structure outline


- const `KITCHEN_COLUMNS` — line **30**
- const `NEXT_STATUS` — line **37**
- function `ElapsedTime` — line **46**
- const `intervalRef` — line **48**
- function `update` — line **51**
- const `created` — line **52**
- const `now` — line **53**
- const `diffMs` — line **54**
- const `mins` — line **55**
- const `hrs` — line **56**
- default export function `StaffKitchen` — line **78**
- const `setStatusMut` — line **84**
- const `interval` — line **88**
- const `grouped` — line **95**
- const `map` — line **96**
- const `twoHoursAgo` — line **110**
- const `next` — line **117**
- const `Icon` — line **172**
- const `orders` — line **173**
- const `nextStatus` — line **174**



## `frontend/src/pages/staff/StaffLeads.tsx`

- **Lines:** 748

- **Purpose:** React page component for a route in `main.tsx`.


### Structure outline


- const `STATUS_TABS` — line **38**
- const `STATUS_BADGE_VARIANT` — line **47**
- const `INTEREST_BADGE_VARIANT` — line **55**
- const `PLANS` — line **62**
- default export function `StaffLeads` — line **68**
- const `updateLeadMutation` — line **105**
- const `addNoteMutation` — line **106**
- const `addQuoteMutation` — line **107**
- const `convertLeadMutation` — line **108**
- const `createMemberMutation` — line **109**
- const `leadId` — line **112**
- const `leads` — line **116**
- const `totalLeads` — line **117**
- const `handleStatusChange` — line **119**
- const `updated` — line **123**
- const `handleAddNote` — line **130**
- const `handleCreateQuote` — line **142**
- const `rupees` — line **147**
- const `amount_paise` — line **154**
- const `handleConvertClick` — line **177**
- const `res` — line **181**
- const `prefill` — line **182**
- const `handleRegisterMember` — line **198**
- const `columns` — line **222**



## `frontend/src/pages/staff/StaffMemberDetail.tsx`

- **Lines:** 223

- **Purpose:** React page component for a route in `main.tsx`.


### Structure outline


- default export function `StaffMemberDetail` — line **27**
- const `navigate` — line **29**
- const `memberId` — line **30**
- const `bookingColumns` — line **61**
- const `court` — line **66**
- const `v` — line **88**
- const `v` — line **96**



## `frontend/src/pages/staff/StaffMembers.tsx`

- **Lines:** 401

- **Purpose:** React page component for a route in `main.tsx`.


### Structure outline


- default export function `StaffMembers` — line **28**
- const `navigate` — line **29**
- const `createMemberMutation` — line **53**
- const `handleRegister` — line **55**
- const `created` — line **65**
- const `columns` — line **89**
- const `variant` — line **135**



## `frontend/src/pages/staff/StaffPayments.tsx`

- **Lines:** 2

- **Purpose:** React page component for a route in `main.tsx`.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import { PlaceholderPage } from '../PlaceholderPage'` |
| 2 | `export default function StaffPayments() { return <PlaceholderPage title="Payments Ledger" /> }` |


## `frontend/src/pages/staff/StaffReports.tsx`

- **Lines:** 528

- **Purpose:** React page component for a route in `main.tsx`.


### Structure outline


- const `SOURCE_OPTIONS` — line **34**
- const `METHOD_OPTIONS` — line **42**
- default export function `StaffReports` — line **49**
- const `todayStr` — line **52**
- const `defaultFrom` — line **55**
- const `dt` — line **57**
- const `pageSize` — line **67**
- const `payments` — line **79**
- const `totalCount` — line **80**
- const `totalPages` — line **81**
- const `refundMutation` — line **83**
- const `isOwnerOrManager` — line **90**
- const `filteredPayments` — line **93**
- const `q` — line **96**
- const `matchRef` — line **97**
- const `matchMem` — line **98**
- const `totals` — line **106**
- const `handleRefundSubmit` — line **129**
- const `res` — line **134**
- const `exportCSV` — line **146**
- const `blob` — line **148**
- const `url` — line **149**
- const `link` — line **150**
- const `setQuickRange` — line **163**
- const `dt` — line **165**
- const `columns` — line **171**
- const `labels` — line **190**
- const `icons` — line **218**
- const `Icon` — line **224**



## `frontend/src/pages/staff/StaffShop.tsx`

- **Lines:** 522

- **Purpose:** React page component for a route in `main.tsx`.


### Structure outline


- default export function `StaffShop` — line **33**
- const `createOrderMutation` — line **53**
- const `discountPct` — line **56**
- const `subtotalPaise` — line **65**
- const `discountPaise` — line **66**
- const `totalPaise` — line **67**
- const `taxPaise` — line **68**
- const `handleAddToCart` — line **71**
- const `existing` — line **79**
- const `handleUpdateQty` — line **93**
- const `newQty` — line **99**
- const `handleCheckout` — line **112**
- const `order` — line **125**
- const `code` — line **138**
- const `filteredProducts` — line **147**
- const `q` — line **149**
- const `isLowStock` — line **219**
- const `isOutOfStock` — line **220**



## `frontend/src/pages/staff/StaffSocial.tsx`

- **Lines:** 2

- **Purpose:** React page component for a route in `main.tsx`.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import { PlaceholderPage } from '../PlaceholderPage'` |
| 2 | `export default function StaffSocial() { return <PlaceholderPage title="Social Play" /> }` |


## `frontend/src/pages/staff/StaffStock.tsx`

- **Lines:** 677

- **Purpose:** React page component for a route in `main.tsx`.


### Structure outline


- const `CATEGORIES` — line **36**
- default export function `StaffStock` — line **45**
- const `canManageProducts` — line **48**
- const `restockMutation` — line **52**
- const `createMutation` — line **53**
- const `updateMutation` — line **54**
- const `filteredProducts` — line **93**
- const `q` — line **98**
- const `matchName` — line **99**
- const `matchSku` — line **100**
- const `matchVariant` — line **101**
- const `lowStockCount` — line **109**
- const `totalInventoryValuePaise` — line **113**
- const `openAddModal` — line **118**
- const `openEditModal` — line **134**
- const `handleRestockSubmit` — line **150**
- const `handleProductFormSubmit` — line **168**
- const `priceRupeesNum` — line **175**
- const `price_paise` — line **180**
- const `updateInput` — line **185**
- const `createInput` — line **203**
- const `columns` — line **224**
- const `isLow` — line **269**
- const `isOut` — line **270**



## `frontend/tailwind.config.js`

- **Lines:** 117

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `/** @type {import('tailwindcss').Config} */` |
| 2 | `export default {` |
| 3 | `  content: ['./index.html', './src/**/*.{ts,tsx}'],` |
| 4 | `  theme: {` |
| 5 | `    extend: {` |
| 6 | `      fontFamily: {` |
| 7 | `        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],` |
| 8 | `      },` |
| 9 | `      colors: {` |
| 10 | `        canvas: '#E8ECF3',` |
| 11 | `        surface: '#FFFFFF',` |
| 12 | `        primary: {` |
| 13 | `          DEFAULT: '#3B82F6',` |
| 14 | `          50: '#EFF6FF',` |
| 15 | `          100: '#DBEAFE',` |
| 16 | `          200: '#BFDBFE',` |
| 17 | `          300: '#93C5FD',` |
| 18 | `          400: '#60A5FA',` |
| 19 | `          500: '#3B82F6',` |
| 20 | `          600: '#2563EB',` |
| 21 | `          700: '#1D4ED8',` |
| 22 | `          800: '#1E40AF',` |
| 23 | `          900: '#1E3A8A',` |
| 24 | `        },` |
| 25 | `        accent: {` |
| 26 | `          purple: '#8B5CF6',` |
| 27 | `          green: '#22C55E',` |
| 28 | `          yellow: '#F59E0B',` |
| 29 | `          red: '#EF4444',` |
| 30 | `          teal: '#14B8A6',` |
| 31 | `          orange: '#F97316',` |
| 32 | `          pink: '#EC4899',` |
| 33 | `        },` |
| 34 | `        text: {` |
| 35 | `          primary: '#0F172A',` |
| 36 | `          secondary: '#64748B',` |
| 37 | `          tertiary: '#94A3B8',` |
| 38 | `          inverse: '#FFFFFF',` |
| 39 | `        },` |
| 40 | `        border: {` |
| 41 | `          light: '#E2E8F0',` |
| 42 | `          DEFAULT: '#CBD5E1',` |
| 43 | `          focus: '#3B82F6',` |
| 44 | `        },` |
| 45 | `        status: {` |
| 46 | `          success: '#DCFCE7',` |
| 47 | `          'success-text': '#166534',` |
| 48 | `          warning: '#FEF9C3',` |
| 49 | `          'warning-text': '#854D0E',` |
| 50 | `          error: '#FEE2E2',` |
| 51 | `          'error-text': '#991B1B',` |
| 52 | `          info: '#DBEAFE',` |
| 53 | `          'info-text': '#1E40AF',` |
| 54 | `          pending: '#F3E8FF',` |
| 55 | `          'pending-text': '#6B21A8',` |
| 56 | `        },` |
| 57 | `      },` |
| 58 | `      borderRadius: {` |
| 59 | `        'shell': '32px',` |
| 60 | `        '4xl': '2rem',` |
| 61 | `      },` |
| 62 | `      boxShadow: {` |
| 63 | `        'soft': '0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.03)',` |
| 64 | `        'card': '0 2px 8px -2px rgba(0, 0, 0, 0.06), 0 4px 16px -4px rgba(0, 0, 0, 0.04)',` |
| 65 | `        'raised': '0 4px 12px -2px rgba(0, 0, 0, 0.08), 0 8px 24px -4px rgba(0, 0, 0, 0.06)',` |
| 66 | `        'modal': '0 8px 32px -4px rgba(0, 0, 0, 0.12), 0 16px 48px -8px rgba(0, 0, 0, 0.08)',` |
| 67 | `        'rail': '0 2px 16px -4px rgba(0, 0, 0, 0.08)',` |
| 68 | `        'pill': '0 1px 4px 0 rgba(0, 0, 0, 0.06)',` |
| 69 | `      },` |
| 70 | `      spacing: {` |
| 71 | `        'rail': '4.5rem',     // 72px — icon rail width` |
| 72 | `        'topbar': '4rem',     // 64px — top bar height` |
| 73 | `        'bottombar': '4rem',  // 64px — mobile bottom bar` |
| 74 | `      },` |
| 75 | `      animation: {` |
| 76 | `        'fade-in': 'fadeIn 0.2s ease-out',` |
| 77 | `        'slide-up': 'slideUp 0.25s ease-out',` |
| 78 | `        'slide-right': 'slideRight 0.25s ease-out',` |
| 79 | `        'scale-in': 'scaleIn 0.2s ease-out',` |
| 80 | `        'shimmer': 'shimmer 1.5s infinite',` |
| 81 | `        'toast-in': 'toastIn 0.3s ease-out',` |
| 82 | `        'toast-out': 'toastOut 0.3s ease-in forwards',` |
| 83 | `      },` |
| 84 | `      keyframes: {` |
| 85 | `        fadeIn: {` |
| 86 | `          '0%': { opacity: '0' },` |
| 87 | `          '100%': { opacity: '1' },` |
| 88 | `        },` |
| 89 | `        slideUp: {` |
| 90 | `          '0%': { opacity: '0', transform: 'translateY(8px)' },` |
| 91 | `          '100%': { opacity: '1', transform: 'translateY(0)' },` |
| 92 | `        },` |
| 93 | `        slideRight: {` |
| 94 | `          '0%': { opacity: '0', transform: 'translateX(-12px)' },` |
| 95 | `          '100%': { opacity: '1', transform: 'translateX(0)' },` |
| 96 | `        },` |
| 97 | `        scaleIn: {` |
| 98 | `          '0%': { opacity: '0', transform: 'scale(0.95)' },` |
| 99 | `          '100%': { opacity: '1', transform: 'scale(1)' },` |
| 100 | `        },` |
| 101 | `        shimmer: {` |
| 102 | `          '0%': { backgroundPosition: '-200% 0' },` |
| 103 | `          '100%': { backgroundPosition: '200% 0' },` |
| 104 | `        },` |
| 105 | `        toastIn: {` |
| 106 | `          '0%': { opacity: '0', transform: 'translateY(-12px) scale(0.95)' },` |
| 107 | `          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },` |
| 108 | `        },` |
| 109 | `        toastOut: {` |
| 110 | `          '0%': { opacity: '1', transform: 'translateY(0) scale(1)' },` |
| 111 | `          '100%': { opacity: '0', transform: 'translateY(-12px) scale(0.95)' },` |
| 112 | `        },` |
| 113 | `      },` |
| 114 | `    },` |
| 115 | `  },` |
| 116 | `  plugins: [],` |
| 117 | `}` |


## `frontend/tsconfig.json`

- **Lines:** 17

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `{` |
| 2 | `  "compilerOptions": {` |
| 3 | `    "target": "ES2022",` |
| 4 | `    "lib": ["ES2022", "DOM", "DOM.Iterable"],` |
| 5 | `    "module": "ESNext",` |
| 6 | `    "moduleResolution": "bundler",` |
| 7 | `    "jsx": "react-jsx",` |
| 8 | `    "strict": true,` |
| 9 | `    "noEmit": true,` |
| 10 | `    "skipLibCheck": true,` |
| 11 | `    "isolatedModules": true,` |
| 12 | `    "resolveJsonModule": true,` |
| 13 | `    "allowImportingTsExtensions": true,` |
| 14 | `    "types": ["vite/client"]` |
| 15 | `  },` |
| 16 | `  "include": ["src", "vite.config.ts"]` |
| 17 | `}` |


## `frontend/vite.config.ts`

- **Lines:** 16

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `import react from '@vitejs/plugin-react'` |
| 2 | `import { defineConfig } from 'vite'` |
| 3 | `` |
| 4 | `// Dev mode (SRS 11.2): Vite serves the SPA and proxies /api to the API container,` |
| 5 | `// forwarding the client IP so the rate limiter and lockout see the real address (S-23).` |
| 6 | `export default defineConfig({` |
| 7 | `  plugins: [react()],` |
| 8 | `  server: {` |
| 9 | `    host: '0.0.0.0',` |
| 10 | `    port: 5173,` |
| 11 | `    proxy: {` |
| 12 | `      '/api': { target: 'http://localhost:8000', changeOrigin: true, xfwd: true },` |
| 13 | `      '/health': { target: 'http://localhost:8000', changeOrigin: true, xfwd: true },` |
| 14 | `    },` |
| 15 | `  },` |
| 16 | `})` |


---

# Top-level: `.dockerignore/`


## `.dockerignore`

- **Lines:** 8

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `.git/` |
| 2 | `.env` |
| 3 | `backend/` |
| 4 | `docs/` |
| 5 | `reports/` |
| 6 | `backup/` |
| 7 | `frontend/node_modules/` |
| 8 | `frontend/dist/` |


---

# Top-level: `.env/`


## `.env`

- **Lines:** 12

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `DATABASE_URL=postgresql+psycopg://ccms_app:change_me@db:5432/ccms` |
| 2 | `POSTGRES_PASSWORD=change_me` |
| 3 | `JWT_SECRET=change-me-to-at-least-32-random-bytes` |
| 4 | `ACCESS_TOKEN_MINUTES=15` |
| 5 | `COOKIE_SECURE=false            # plain http on LAN. Must be true behind HTTPS` |
| 6 | `ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8080,http://192.168.1.50:8080   # replace ...` |
| 7 | `SEED=true` |
| 8 | `SEED_PASSWORD=Club@12345       # demo only; change for any real use` |
| 9 | `TAX_COURT=18` |
| 10 | `TAX_SHOP=18` |
| 11 | `TAX_BAR=5` |
| 12 | `TAX_MEMBERSHIP=18` |


---

# Top-level: `.env.example/`


## `.env.example`

- **Lines:** 12

- **Purpose:** Template environment variables (secrets not committed).


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `DATABASE_URL=postgresql+psycopg://ccms_app:change_me@db:5432/ccms` |
| 2 | `POSTGRES_PASSWORD=change_me` |
| 3 | `JWT_SECRET=change-me-to-at-least-32-random-bytes` |
| 4 | `ACCESS_TOKEN_MINUTES=15` |
| 5 | `COOKIE_SECURE=false            # plain http on LAN. Must be true behind HTTPS` |
| 6 | `ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8080,http://192.168.1.50:8080   # replace ...` |
| 7 | `SEED=true` |
| 8 | `SEED_PASSWORD=Club@12345       # demo only; change for any real use` |
| 9 | `TAX_COURT=18` |
| 10 | `TAX_SHOP=18` |
| 11 | `TAX_BAR=5` |
| 12 | `TAX_MEMBERSHIP=18` |


---

# Top-level: `.gitattributes/`


## `.gitattributes`

- **Lines:** 6

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `# core.autocrlf=true is common on Windows. Without this, a fresh clone checks these out with` |
| 2 | `# CRLF and the Postgres entrypoint fails to run db/init/01-app-role.sh inside the container.` |
| 3 | `*.sh text eol=lf` |
| 4 | `Dockerfile text eol=lf` |
| 5 | `*.conf text eol=lf` |
| 6 | `.env.example text eol=lf` |


---

# Top-level: `.gitignore/`


## `.gitignore`

- **Lines:** 12

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `# S-13: secrets never committed. .env.example is.` |
| 2 | `.env` |
| 3 | `` |
| 4 | `__pycache__/` |
| 5 | `*.py[cod]` |
| 6 | `.pytest_cache/` |
| 7 | `.venv/` |
| 8 | `` |
| 9 | `node_modules/` |
| 10 | `dist/` |
| 11 | `` |
| 12 | `backup/` |


---

# Top-level: `README.md/`


## `README.md`

- **Lines:** 109

- **Purpose:** Project overview, quick start, nginx `/api` routing, ports, security notes, reset instructions.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `# CCMS — Champions Club Management System` |
| 2 | `` |
| 3 | `Local-only club management system: public site + member portal + staff console (one responsive` |
| 4 | `React SPA) on top of a FastAPI + PostgreSQL 16 backend. Everything runs on one laptop via Docker` |
| 5 | `Compose; no cloud services, no internet needed at runtime.` |
| 6 | `` |
| 7 | `The SRS (`docs/SRS.md`) is the single source of truth. If code and SRS disagree, the SRS wins.` |
| 8 | `` |
| 9 | `---` |
| 10 | `` |
| 11 | `## Quick start` |
| 12 | `` |
| 13 | ````bash` |
| 14 | `cp .env.example .env     # then edit JWT_SECRET, POSTGRES_PASSWORD and ALLOWED_ORIGINS` |
| 15 | `docker compose up --build` |
| 16 | ````` |
| 17 | `` |
| 18 | `Open <http://localhost:8080>. From a phone on the same Wi-Fi, open `http://<laptop-LAN-IP>:8080`.` |
| 19 | `` |
| 20 | `### Run modes (SRS §11.2)` |
| 21 | `` |
| 22 | `\| Mode \| Command \| URL \|` |
| 23 | `\|------\|---------\|-----\|` |
| 24 | `\| **Demo / final** \| `docker compose up --build` \| `http://<LAN-IP>:8080` \|` |
| 25 | `\| **Dev (hot reload)** \| `docker compose -f docker-compose.yml -f docker-compose.dev.yml up db ...` |
| 26 | `` |
| 27 | ``docker-compose.dev.yml` publishes Postgres on `127.0.0.1:5432` and the API on `127.0.0.1:8000`.` |
| 28 | `Loopback only — those ports are never exposed to the LAN.` |
| 29 | `` |
| 30 | `---` |
| 31 | `` |
| 32 | `## The `/api` prefix — the one decision you need to know` |
| 33 | `` |
| 34 | `**The `/api` prefix is preserved end to end. nginx does not strip it.**` |
| 35 | `` |
| 36 | ````` |
| 37 | `browser  GET /api/v1/plans` |
| 38 | `  nginx  location /api/  →  proxy_pass http://api:8000/api/` |
| 39 | `    api  GET /api/v1/plans          (routers are mounted with prefix="/api/v1")` |
| 40 | ````` |
| 41 | `` |
| 42 | `So a FastAPI router registered as `/api/v1/plans` is reached at `/api/v1/plans` from the browser in` |
| 43 | `both demo mode (nginx) and dev mode (Vite proxy). There is no path rewriting anywhere, which means` |
| 44 | `the path you see in the browser's network tab is the path you see in `GET /openapi.json`.` |
| 45 | `` |
| 46 | `One exception: `GET /health` lives at the API root, not under `/api/v1` (SRS §3.2), so nginx has a` |
| 47 | `dedicated `location = /health` for it. Everything else goes through `/api/`.` |
| 48 | `` |
| 49 | `---` |
| 50 | `` |
| 51 | `## Ports` |
| 52 | `` |
| 53 | `\| Service \| Published \| Why \|` |
| 54 | `\|---------\|-----------\|-----\|` |
| 55 | `\| `web` (nginx) \| `8080:80` \| The only LAN-visible port (SRS §11.1, S-22) \|` |
| 56 | `\| `api` \| none in demo mode \| Internal compose network only; dev override binds `127.0.0.1:800...` |
| 57 | `\| `db` \| none in demo mode \| Internal compose network only; dev override binds `127.0.0.1:5432...` |
| 58 | `` |
| 59 | `Allow inbound TCP 8080 (and 5173 in dev) in the OS firewall for the **private** network profile o...` |
| 60 | `` |
| 61 | `---` |
| 62 | `` |
| 63 | `## Security notes for this layer` |
| 64 | `` |
| 65 | `- The API connects as `ccms_app`, a **non-superuser** role created by `db/init/01-app-role.sh` on` |
| 66 | `  first volume initialisation (S-20). The `postgres` superuser is used only for maintenance.` |
| 67 | `- Uvicorn runs with `--proxy-headers --forwarded-allow-ips="*"` and nginx sets `X-Forwarded-For` and` |
| 68 | `  `X-Real-IP`, so rate limiting and login lockout key on the real client IP rather than the proxy's` |
| 69 | `  (S-23). `--forwarded-allow-ips="*"` is safe here because the API is not reachable except through` |
| 70 | `  the proxy on the internal network.` |
| 71 | `- nginx sets `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy` and a `self`-based` |
| 72 | `  `Content-Security-Policy` (S-10). **No HSTS** — the demo runs on plain http.` |
| 73 | `  The CSP allows `style-src 'unsafe-inline'` because React component libraries inject inline styles;` |
| 74 | `  no inline `<script>` is allowed.` |
| 75 | `- `.env` is git-ignored; `.env.example` is committed (S-13).` |
| 76 | `` |
| 77 | `---` |
| 78 | `` |
| 79 | `## Reset` |
| 80 | `` |
| 81 | ````bash` |
| 82 | `./reset_db.sh            # stop api, drop/recreate ccms, restart (re-seeds). Target < 30 s` |
| 83 | `./reset_db.sh --dev      # same, but keeps the docker-compose.dev.yml port overrides` |
| 84 | `docker compose down -v   # wipe everything including the pgdata volume` |
| 85 | ````` |
| 86 | `` |
| 87 | `Pass `--dev` whenever the dev override is up, otherwise the restart recreates `api` from the base` |
| 88 | `compose file alone and the `127.0.0.1:8000` mapping disappears.` |
| 89 | `` |
| 90 | `On Windows, run these from **Git Bash**. The `bash` on `PATH` is usually the WSL shim, which fails` |
| 91 | `if no WSL distro is installed.` |
| 92 | `` |
| 93 | `---` |
| 94 | `` |
| 95 | `## Repo layout (SRS §2.2)` |
| 96 | `` |
| 97 | ````` |
| 98 | `docker-compose.yml  docker-compose.dev.yml  .env.example  README.md  reset_db.sh  nginx.conf` |
| 99 | `db/init/            one-time Postgres init (app role)` |
| 100 | `backend/  app/{main.py,config.py,db.py,enums.py,routers/,services/}  seed.py  tests/  requirement...` |
| 101 | `frontend/ public/manifest.webmanifest  src/{api,pages/{public,portal,staff},components,hooks,lib}` |
| 102 | `docs/     SRS.md, PRD.md, BRD.md, AI_BUILD_PLAYBOOK.md, DOCUMENTATION_CONTEXT.md` |
| 103 | `reports/  build reports and prompts` |
| 104 | ````` |
| 105 | `` |
| 106 | `## Demo logins` |
| 107 | `` |
| 108 | `Seeded by `backend/seed.py` (not yet populated — see `tasks.md`). All demo users share the password` |
| 109 | `in `SEED_PASSWORD`, default `Club@12345`. **Demo only; change it for any real deployment.**` |


---

# Top-level: `backup/`


## `backup/.gitkeep`

- **Lines:** 0

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|


---

# Top-level: `db/`


## `db/init/01-app-role.sh`

- **Lines:** 11

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `#!/bin/sh` |
| 2 | `# Runs once, on first initialisation of the pgdata volume.` |
| 3 | `# Creates the non-superuser role the API connects as (SRS 11.1, S-20).` |
| 4 | `set -e` |
| 5 | `` |
| 6 | `psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \` |
| 7 | `  -v app_user="$APP_DB_USER" -v app_password="$APP_DB_PASSWORD" -v db_name="$POSTGRES_DB" <<'EOSQL'` |
| 8 | `CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password';` |
| 9 | `GRANT CONNECT ON DATABASE :"db_name" TO :"app_user";` |
| 10 | `GRANT USAGE, CREATE ON SCHEMA public TO :"app_user";` |
| 11 | `EOSQL` |


---

# Top-level: `docker-compose.dev.yml/`


## `docker-compose.dev.yml`

- **Lines:** 10

- **Purpose:** Dev overrides: bind API and Postgres to 127.0.0.1 only.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `# Dev-only override: binds to the loopback interface so the ports stay off the LAN.` |
| 2 | `#   docker compose -f docker-compose.yml -f docker-compose.dev.yml up db api` |
| 3 | `services:` |
| 4 | `  db:` |
| 5 | `    ports:` |
| 6 | `      - "127.0.0.1:5432:5432"` |
| 7 | `` |
| 8 | `  api:` |
| 9 | `    ports:` |
| 10 | `      - "127.0.0.1:8000:8000"` |


---

# Top-level: `docker-compose.yml/`


## `docker-compose.yml`

- **Lines:** 46

- **Purpose:** Production/demo Compose: postgres, api (internal), nginx web on 8080.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `name: ccms` |
| 2 | `` |
| 3 | `services:` |
| 4 | `  # S-22 / SRS 11.1: no published ports. Reachable only on the internal compose network.` |
| 5 | `  db:` |
| 6 | `    image: postgres:16` |
| 7 | `    environment:` |
| 8 | `      POSTGRES_DB: ccms` |
| 9 | `      POSTGRES_USER: postgres` |
| 10 | `      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}` |
| 11 | `      # Non-superuser application role created by db/init (S-20).` |
| 12 | `      APP_DB_USER: ccms_app` |
| 13 | `      APP_DB_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}` |
| 14 | `    volumes:` |
| 15 | `      - pgdata:/var/lib/postgresql/data` |
| 16 | `      - ./db/init:/docker-entrypoint-initdb.d:ro` |
| 17 | `    healthcheck:` |
| 18 | `      test: ["CMD-SHELL", "pg_isready -U postgres -d ccms"]` |
| 19 | `      interval: 5s` |
| 20 | `      timeout: 3s` |
| 21 | `      retries: 10` |
| 22 | `    restart: unless-stopped` |
| 23 | `` |
| 24 | `  api:` |
| 25 | `    build:` |
| 26 | `      context: ./backend` |
| 27 | `    env_file:` |
| 28 | `      - .env` |
| 29 | `    depends_on:` |
| 30 | `      db:` |
| 31 | `        condition: service_healthy` |
| 32 | `    restart: unless-stopped` |
| 33 | `` |
| 34 | `  # The only LAN-visible port.` |
| 35 | `  web:` |
| 36 | `    build:` |
| 37 | `      context: .` |
| 38 | `      dockerfile: frontend/Dockerfile` |
| 39 | `    ports:` |
| 40 | `      - "8080:80"` |
| 41 | `    depends_on:` |
| 42 | `      - api` |
| 43 | `    restart: unless-stopped` |
| 44 | `` |
| 45 | `volumes:` |
| 46 | `  pgdata:` |


---

# Top-level: `nginx.conf/`


## `nginx.conf`

- **Lines:** 40

- **Purpose:** Reverse proxy: static SPA, `/api/` to api:8000 without stripping prefix, security headers.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `server {` |
| 2 | `    listen 80;` |
| 3 | `    server_name _;` |
| 4 | `` |
| 5 | `    root /usr/share/nginx/html;` |
| 6 | `    index index.html;` |
| 7 | `` |
| 8 | `    # SRS S-10. No HSTS: the demo runs on plain http over the LAN.` |
| 9 | `    add_header X-Content-Type-Options "nosniff" always;` |
| 10 | `    add_header X-Frame-Options "DENY" always;` |
| 11 | `    add_header Referrer-Policy "no-referrer" always;` |
| 12 | `    add_header Content-Security-Policy "default-src 'self'; img-src 'self' data:; style-src 'self...` |
| 13 | `` |
| 14 | `    # The /api prefix is PRESERVED: /api/v1/... in the browser reaches /api/v1/... on the API,` |
| 15 | `    # which is the routers' prefix (SRS 3.2). See README.` |
| 16 | `    location /api/ {` |
| 17 | `        proxy_pass http://api:8000/api/;` |
| 18 | `        proxy_http_version 1.1;` |
| 19 | `        proxy_set_header Host $host;` |
| 20 | `        # Overwrite, never append. The appending nginx variable would preserve a client-supplied` |
| 21 | `        # X-Forwarded-For and let anyone spoof the IP the lockout/rate limiter keys on (S-23).` |
| 22 | `        proxy_set_header X-Real-IP $remote_addr;` |
| 23 | `        proxy_set_header X-Forwarded-For $remote_addr;` |
| 24 | `        proxy_set_header X-Forwarded-Proto $scheme;` |
| 25 | `    }` |
| 26 | `` |
| 27 | `    # /health lives at the API root, not under /api/v1 (SRS 3.2).` |
| 28 | `    location = /health {` |
| 29 | `        proxy_pass http://api:8000/health;` |
| 30 | `        proxy_http_version 1.1;` |
| 31 | `        proxy_set_header Host $host;` |
| 32 | `        proxy_set_header X-Real-IP $remote_addr;` |
| 33 | `        proxy_set_header X-Forwarded-For $remote_addr;` |
| 34 | `        proxy_set_header X-Forwarded-Proto $scheme;` |
| 35 | `    }` |
| 36 | `` |
| 37 | `    location / {` |
| 38 | `        try_files $uri $uri/ /index.html;` |
| 39 | `    }` |
| 40 | `}` |


---

# Top-level: `openapi.json/`


## `openapi.json`

- **Lines:** 10888

- **Purpose:** Exported OpenAPI 3 schema of the live API (generated artifact; regenerate from `/openapi.json`).


### Structure outline


File has **10888** lines. First lines set context; see repository copy for full text.

**First 15 lines:**

```
{
  "openapi": "3.1.0",
  "info": {
    "title": "CCMS API",
    "version": "1.0.0"
  },
  "paths": {
    "/api/v1/auth/login": {
      "post": {
        "tags": [
          "auth"
        ],
        "summary": "Login",
        "operationId": "login_api_v1_auth_login_post",
        "requestBody": {
```


---

# Top-level: `reports/`


## `reports/backend_progress.md`

- **Lines:** 205

- **Purpose:** Build progress, prompts, or verification reports from development.


### Structure outline


File has **205** lines. First lines set context; see repository copy for full text.

**First 15 lines:**

```
# CCMS backend — staged build progress

| Stage | Name | Status | Tests passing | Commit |
|-------|------|--------|---------------|--------|
| 0 | Repo skeleton, Docker, nginx | done (earlier) | — | `ae7c396` |
| 0 | F-01 Auth & Roles | done (earlier) | 12 | `49d9f9d` |
| 1 | Foundation: enums, 33 tables, payments/notifications services, empty routers, seed | done | 29 | `1b601aa` |
| 2 | Plans & Members (F-02) | done | 43 | `1c48cc4` |
| 3 | Courts, Availability, Bookings (F-03) | done | 74 | `d68aaf0` |
| 4 | Shop & Stock (F-05) | done | 93 | `77b2df6` |
| 5 | Bar (F-07) | done | 113 | `cd3defc` |
| 6 | Payments & Dashboard (F-10) | done | 132 | `71e85a2` |
| 7 | Public, Leads, Notifications (F-08/09/14) | done | 153 | `8c6dd1d` |
| 8 | P1 extras: social, expenses, invoices | done | 171 | `f5c6c28` |
| 9 | P2 stubs: HR | done | 182 | `f023a6f` |
```


## `reports/backend_report.md`

- **Lines:** 354

- **Purpose:** Build progress, prompts, or verification reports from development.


### Structure outline


File has **354** lines. First lines set context; see repository copy for full text.

**First 15 lines:**

```
# CCMS backend — final report

Champions Club Management System, backend only. FastAPI + PostgreSQL 16 behind nginx, run
entirely with `docker compose`. Frontend is out of scope for this report.

---

## 1. Stages

| Stage | Name | Status | Tests | Commit |
|-------|------|--------|-------|--------|
| 0 | Repo skeleton, Docker, nginx, reset_db | done | — | `ae7c396` |
| 0 | F-01 Auth & Roles | done | 12 | `49d9f9d` |
| 1 | Foundation: enums, 33 tables, payments/notifications services, seed | done | 29 | `1b601aa` |
| 2 | Plans & Members (F-02) | done | 43 | `1c48cc4` |
```


## `reports/frontend_report.md`

- **Lines:** 332

- **Purpose:** Build progress, prompts, or verification reports from development.


### Structure outline


File has **332** lines. First lines set context; see repository copy for full text.

**First 15 lines:**

```
# Frontend Design System & App Shell — Final Report

Champions Club Management System (CCMS) Frontend · Phase 1 (Prompt 1)
Stack: React 18, TypeScript, Vite, Tailwind CSS 3.4, React Router v6, TanStack React Query v5, lucide-react, clsx

---

## 1. Executive Summary

Phase 1 of the CCMS Frontend has been executed strictly against `reports/prompt1.md`, `docs/SRS.md` (§2.2–2.4), and `docs/PRD.md` (§F-16). 

The goal of this phase was to establish an **uncompromising, modern soft-UI design system** and a **responsive, role-driven application shell** without building premature feature screens or introducing heavy external component libraries (no MUI, Chakra, or shadcn).

Every reusable UI component, layout element, routing scaffold, role-guarding boundary, and theme token has been built, compiled with zero TypeScript errors (`tsc --noEmit`), and visually verified via automated browser inspection across mobile (360px), tablet (768px), and desktop (1280px+).

```


## `reports/frontend_tasks.md`

- **Lines:** 77

- **Purpose:** Build progress, prompts, or verification reports from development.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `# Frontend Build — Task Tracker` |
| 2 | `` |
| 3 | `Source: `reports/prompt1.md` · Spec: `docs/SRS.md` §2.2–2.4, `docs/PRD.md` §F-16` |
| 4 | `` |
| 5 | `---` |
| 6 | `` |
| 7 | `## Phase 1 — Design System & App Shell (prompt1)` |
| 8 | `` |
| 9 | `### 1. Foundation` |
| 10 | `- [x] `tailwind.config.js` — theme tokens (colors, border-radius, shadows, fonts)` |
| 11 | `- [x] `src/index.css` — base styles, Inter font, hatch pattern, scrollbar` |
| 12 | `- [x] Install `clsx` dependency` |
| 13 | `` |
| 14 | `### 2. UI Components (`src/components/ui/`)` |
| 15 | `- [x] `Card.tsx`` |
| 16 | `- [x] `SectionHeader.tsx`` |
| 17 | `- [x] `PillTabs.tsx`` |
| 18 | `- [x] `IconRailItem.tsx`` |
| 19 | `- [x] `Avatar.tsx`` |
| 20 | `- [x] `AvatarStack.tsx`` |
| 21 | `- [x] `StatusChip.tsx`` |
| 22 | `- [x] `StatCard.tsx`` |
| 23 | `- [x] `Button.tsx`` |
| 24 | `- [x] `Modal.tsx`` |
| 25 | `- [x] `Drawer.tsx`` |
| 26 | `- [x] `DataTable.tsx`` |
| 27 | `- [x] `EmptyState.tsx`` |
| 28 | `- [x] `Skeleton.tsx`` |
| 29 | `- [x] `Toast.tsx`` |
| 30 | `- [x] `index.ts` — barrel export` |
| 31 | `` |
| 32 | `### 3. Layout Components (`src/components/layout/`)` |
| 33 | `- [x] `AppShell.tsx` — icon rail + top bar + content area; bottom tabs on mobile` |
| 34 | `- [x] `TopBar.tsx` — pill tabs, search, avatar stack, bell, user avatar, role switcher` |
| 35 | `- [x] `IconRail.tsx` — floating left icon rail (desktop); bottom tab bar (mobile)` |
| 36 | `- [x] Navigation config object keyed by role (`src/lib/nav-config.ts`)` |
| 37 | `- [x] `RoleGuard.tsx` — guards routes based on role` |
| 38 | `` |
| 39 | `### 4. Auth & Hooks` |
| 40 | `- [x] `src/hooks/useAuth.ts` — mock auth hook with role switcher (dev only)` |
| 41 | `- [x] `src/lib/auth-context.tsx` — AuthProvider context with mock users` |
| 42 | `` |
| 43 | `### 5. Routing` |
| 44 | `- [x] React Router setup in `main.tsx` with QueryClient + AuthProvider + ToastProvider` |
| 45 | `- [x] Placeholder pages: `/`, `/about`, `/plans`, `/availability`, `/shop`, `/contact`, `/login`` |
| 46 | `- [x] Placeholder pages: `/portal/*` routes (home, book, bookings, shop, orders, social, profile)` |
| 47 | `- [x] Placeholder pages: `/staff/*` routes (dashboard, members, members/:id, bookings, courts, so...` |
| 48 | `- [x] `/dev/design` — component showcase page` |
| 49 | `` |
| 50 | `### 6. Utilities` |
| 51 | `- [x] `src/lib/utils.ts` — `cn()`, `formatINR()`, `formatDate()`, `formatTime()`, `getInitials()`` |
| 52 | `- [x] `src/lib/nav-config.ts` — navigation items by role` |
| 53 | `- [x] `src/api/client.ts` — API client scaffold` |
| 54 | `` |
| 55 | `### 7. Verification` |
| 56 | `- [x] TypeScript compiles with zero errors (`npx tsc --noEmit`)` |
| 57 | `- [x] Vite dev server runs successfully` |
| 58 | `- [x] All 14 component sections render correctly on `/dev/design`` |
| 59 | `- [x] Modal, Drawer, and Toast interactions work` |
| 60 | `- [x] Icon rail and top bar navigation display correctly` |
| 61 | `- [x] Role switcher switches between OWNER/MANAGER/FRONT_DESK/BAR_STAFF/MEMBER` |
| 62 | `` |
| 63 | `---` |
| 64 | `` |
| 65 | `## Status` |
| 66 | `Phase 1: **COMPLETE** ✅` |
| 67 | `` |
| 68 | `---` |
| 69 | `` |
| 70 | `## Deliberately NOT done in this prompt` |
| 71 | `- Feature screens (members, bookings, shop, bar, dashboard, etc.)` |
| 72 | `- Real API integration (all endpoints use placeholder)` |
| 73 | `- Real authentication (JWT, refresh tokens)` |
| 74 | `- PWA manifest icons (192/512 png)` |
| 75 | `- Data fetching with TanStack Query (client scaffold ready)` |
| 76 | `- Mobile responsiveness fine-tuning (foundation is mobile-first)` |
| 77 | `- Public page layouts (no-shell public site design)` |


## `reports/prompt1.md`

- **Lines:** 37

- **Purpose:** Build progress, prompts, or verification reports from development.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `Read @docs/PRD.md and @docs/SRS.md (device/breakpoint section) before starting.` |
| 2 | `` |
| 3 | `TASK: Build ONLY the design system and app shell for the Champions Club Management System fronten...` |
| 4 | `` |
| 5 | `STACK (pinned, do not change or add libraries): React 18, TypeScript, Vite, Tailwind CSS 3.4, Rea...` |
| 6 | `` |
| 7 | `VISUAL STYLE (match a modern soft-UI dashboard):` |
| 8 | `` |
| 9 | `- Page canvas: light cool grey-blue (#E8ECF3). The app sits inside a large rounded container (rou...` |
| 10 | `- Cards: white, rounded-3xl, very soft shadow, generous padding. No harsh borders.` |
| 11 | `- Floating left icon rail: narrow, white, rounded-full pill with vertical icon buttons; active it...` |
| 12 | `- Top bar: pill-shaped nav tabs (active tab is lightly tinted blue), search icon button, avatar s...` |
| 13 | `- Accent palette: blue (#3B82F6) primary, purple, green, yellow, red used for status/category blo...` |
| 14 | `- Status chips: small rounded-full pills ("Approved", "Pending", "Paid", "Low stock").` |
| 15 | `- Weekend/unavailable cells use a diagonal hatch pattern (CSS repeating-linear-gradient).` |
| 16 | `- Typography: Inter, bold headlines, small grey labels.` |
| 17 | `- Light theme only. No dark mode.` |
| 18 | `` |
| 19 | `BUILD THESE REUSABLE COMPONENTS in src/components/ui/, each in its own file with typed props:` |
| 20 | `Card, SectionHeader (title + "View all" link), PillTabs, IconRailItem, Avatar, AvatarStack, Statu...` |
| 21 | `` |
| 22 | `BUILD THE SHELL in src/components/layout/:` |
| 23 | `` |
| 24 | `- AppShell: icon rail + top bar + content area. On screens below 768px the rail becomes a bottom ...` |
| 25 | `- Navigation items come from a config object keyed by role (owner, admin, receptionist, bartender...` |
| 26 | `- RoleGuard component and a mock useAuth() hook (a role switcher in dev only, so we can demo ever...` |
| 27 | `` |
| 28 | `ROUTES: pre-register every route as a placeholder page that says its name: /, /about, /plans, /lo...` |
| 29 | `` |
| 30 | `RULES:` |
| 31 | `` |
| 32 | `- Mobile-first, test at 360px, 768px, 1280px.` |
| 33 | `- Tailwind theme tokens go in tailwind.config.ts; no hardcoded hex values in components.` |
| 34 | `- Do not touch any file outside src/ and the Tailwind/Vite config.` |
| 35 | `- Add a /dev/design page that renders every component once so we can eyeball them.` |
| 36 | `` |
| 37 | `When done, list the files you created and anything you were unsure about. Do not add extra features.` |


## `reports/prompt2.md`

- **Lines:** 46

- **Purpose:** Build progress, prompts, or verification reports from development.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `Attach: @docs/SRS.md @docs/PRD.md` |
| 2 | `Do NOT read or follow reports/frontend_report.md. The SRS is the only source of truth.` |
| 3 | `` |
| 4 | `TASK: Build the staff screens for the Champions Club Management System in stages. Stop after each...` |
| 5 | `` |
| 6 | `ALLOWED: the existing components in src/components/ui and src/components/layout, plus recharts 2....` |
| 7 | `FORBIDDEN: new roles, new routes, report/tracking files, axios, service workers.` |
| 8 | `` |
| 9 | `ROLES (SRS 3.1, exact enum): OWNER, MANAGER, FRONT_DESK, BAR_STAFF. Routes are only those in SRS ...` |
| 10 | `` |
| 11 | `DATA LAYER (do this first, before any screen):` |
| 12 | `` |
| 13 | `- src/api/types.ts: hand-written TypeScript types that mirror the SRS 3.2 JSON shapes exactly (sn...` |
| 14 | `- src/mocks/: seed-like data matching SRS 10.1 (courts: Tennis 1-2, Padel 1, Badminton 1-2, Crick...` |
| 15 | `- src/api/hooks/: React Query v5 hooks (useCourtAvailability, useBookings, useCreateBooking, useM...` |
| 16 | `- Mutations must be able to return the SRS error codes (SLOT_TAKEN, DAILY_LIMIT_REACHED, OUT_OF_S...` |
| 17 | `- Utils (one place each): formatMoney(paise) -> "₹x.xx" using integers only; time helpers that di...` |
| 18 | `` |
| 19 | `CONVENTIONS: touch targets >= 44px; every list/form has loading, empty and error states (NFR-008)...` |
| 20 | `` |
| 21 | `STAGE A: FRONT_DESK` |
| 22 | `` |
| 23 | `1. CourtScheduleGrid (src/components/features/): rows = courts, columns = 30-minute slots for one...` |
| 24 | `2. /staff/bookings: grid + sport filter + date picker. Clicking a FREE slot opens a Drawer: membe...` |
| 25 | `3. /staff/members: DataTable with search by name/phone/code, tier and status filters (ACTIVE/EXPI...` |
| 26 | `4. /staff/shop: counter sale: product grid by category, cart, member code lookup, automatic membe...` |
| 27 | `5. /staff home for FRONT_DESK: today's bookings, quick actions, low-stock list (read-only).` |
| 28 | `` |
| 29 | `STAGE B: BAR_STAFF` |
| 30 | `` |
| 31 | `1. /staff/bar: table grid showing open order totals, menu grid with notes per item, cart, add ite...` |
| 32 | `2. /staff/kitchen: board with columns NEW, PREPARING, READY, SERVED. Forward-only transitions (NE...` |
| 33 | `3. Own-shift daily report card.` |
| 34 | `` |
| 35 | `STAGE C: OWNER and MANAGER` |
| 36 | `` |
| 37 | `1. /staff dashboard from the dashboard/summary shape: revenue today/week/month StatCards, revenue...` |
| 38 | `2. /staff/stock: products DataTable with low-stock chips, restock Modal (qty + note), add/edit pr...` |
| 39 | `3. /staff/reports: payments ledger table with date range and source/method filters, refund action...` |
| 40 | `` |
| 41 | `RULES:` |
| 42 | `` |
| 43 | `- Build in the stage order above and report after each stage: files created/changed and anything ...` |
| 44 | `- Do not refactor or restyle anything that already works.` |
| 45 | `- If you hit the same error 3 times, stop and tell me; do not keep retrying.` |
| 46 | `- Do not invent endpoints, fields or statuses that are not in the SRS.` |


## `reports/prompt3.md`

- **Lines:** 17

- **Purpose:** Build progress, prompts, or verification reports from development.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `Attach: @docs/SRS.md @docs/PRD.md. Do NOT read reports/frontend_report.md.` |
| 2 | `` |
| 3 | `TASK: Build the MEMBER portal. Allowed: existing ui/layout components, recharts, qrcode.react (di...` |
| 4 | `` |
| 5 | `ROUTES (SRS 2.4 only): /portal, /portal/book, /portal/bookings, /portal/shop, /portal/orders, /po...` |
| 6 | `DATA: use the existing hooks/types/mocks pattern; add member-scoped hooks only (a member sees onl...` |
| 7 | `` |
| 8 | `SCREENS (phone-first, 360px, touch targets >= 44px, no horizontal page scroll):` |
| 9 | `` |
| 10 | `1. /portal: greeting, membership card (tier, status ACTIVE/EXPIRING/EXPIRED, expiry date, member_...` |
| 11 | `2. /portal/book: single-day availability using the existing CourtScheduleGrid or a phone-friendly...` |
| 12 | `3. /portal/bookings: upcoming/past tabs, cancel with confirm Modal (refund info shown).` |
| 13 | `4. /portal/social: Friday sessions with joined_count/capacity, Join/Leave, SESSION_FULL handling.` |
| 14 | `5. /portal/shop: catalogue grid, cart, member discount applied automatically, online order with P...` |
| 15 | `6. /portal/orders: own shop orders with status chips.` |
| 16 | `` |
| 17 | `RULES: loading/empty/error states everywhere. Stage per screen; report files changed in max 10 li...` |


## `reports/prompt4.md`

- **Lines:** 23

- **Purpose:** Build progress, prompts, or verification reports from development.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `continue` |
| 2 | `` |
| 3 | `PAIR 2: /portal/bookings and /portal/social. Same rules as before: use the existing hooks/types/s...` |
| 4 | `` |
| 5 | `1. /portal/bookings` |
| 6 | `` |
| 7 | `- PillTabs: Upcoming / Past. A member sees only their own bookings.` |
| 8 | `- Each row: court, sport, date and time in Asia/Kolkata, price in paise via formatMoney, StatusCh...` |
| 9 | `- Cancel is available only for CONFIRMED bookings that have not started. Confirm Modal with an op...` |
| 10 | `- Mock cancel errors: ALREADY_CANCELLED, BOOKING_STARTED. Show them inline in the Modal, not as a...` |
| 11 | `- After cancel, the booking moves out of Upcoming, and the "bookings today x/2" counter on /porta...` |
| 12 | `- WAIVED (free Gold) bookings never show a refund amount.` |
| 13 | `` |
| 14 | `2. /portal/social` |
| 15 | `` |
| 16 | `- List Friday social sessions from useSocialSessions: title, court, date/time (IST), joined_count...` |
| 17 | `- Join mock errors: SESSION_FULL (and disable the button at capacity), ALREADY_JOINED. Leave remo...` |
| 18 | `- Joining a social session must NOT count toward the 2-per-day court booking limit.` |
| 19 | `- Empty state when there are no sessions. Loading and error states required.` |
| 20 | `` |
| 21 | `BOTH SCREENS: phone-first at 360px, touch targets >= 44px, no horizontal page scroll, loading/emp...` |
| 22 | `` |
| 23 | `When done: list files changed (max 10 lines) and anything you were unsure about, then wait for "c...` |


---

# Top-level: `reset_db.sh/`


## `reset_db.sh`

- **Lines:** 53

- **Purpose:** Drop/recreate DB, restart API to run create_all + seed.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `#!/usr/bin/env bash` |
| 2 | `# SRS 11.5: stop api, drop/recreate the database, restart (re-seeds). Target < 30 s.` |
| 3 | `#` |
| 4 | `# Usage:` |
| 5 | `#   ./reset_db.sh          # demo mode (docker-compose.yml only)` |
| 6 | `#   ./reset_db.sh --dev    # keeps the docker-compose.dev.yml port overrides in place` |
| 7 | `set -euo pipefail` |
| 8 | `cd "$(dirname "$0")"` |
| 9 | `` |
| 10 | `APP_DB_USER="${APP_DB_USER:-ccms_app}"` |
| 11 | `` |
| 12 | `# Without this, `docker compose up -d api` below would recreate the container from the base` |
| 13 | `# file alone and silently drop the dev override's 127.0.0.1:8000 mapping.` |
| 14 | `if [ "${1:-}" = "--dev" ]; then` |
| 15 | `  dc() { docker compose -f docker-compose.yml -f docker-compose.dev.yml "$@"; }` |
| 16 | `else` |
| 17 | `  dc() { docker compose "$@"; }` |
| 18 | `fi` |
| 19 | `` |
| 20 | `echo "==> stopping api"` |
| 21 | `dc stop api` |
| 22 | `` |
| 23 | `# psql only interpolates :"var" for input read from stdin; with -c the string goes` |
| 24 | `# straight to the server, so these must be heredocs (same form as db/init/01-app-role.sh).` |
| 25 | `echo "==> dropping and recreating database"` |
| 26 | `dc exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'EOSQL'` |
| 27 | `DROP DATABASE IF EXISTS ccms WITH (FORCE);` |
| 28 | `CREATE DATABASE ccms OWNER postgres;` |
| 29 | `EOSQL` |
| 30 | `` |
| 31 | `dc exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d ccms -v app_user="$APP_DB_USER" <<'EOSQL'` |
| 32 | `GRANT CONNECT ON DATABASE ccms TO :"app_user";` |
| 33 | `GRANT USAGE, CREATE ON SCHEMA public TO :"app_user";` |
| 34 | `EOSQL` |
| 35 | `` |
| 36 | `echo "==> starting api (create_all + seed)"` |
| 37 | `dc up -d api` |
| 38 | `` |
| 39 | `echo -n "==> waiting for api"` |
| 40 | `for _ in $(seq 1 30); do` |
| 41 | `  if dc exec -T api python -c \` |
| 42 | `      "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" \` |
| 43 | `      >/dev/null 2>&1; then` |
| 44 | `    echo " ok"` |
| 45 | `    echo "==> done"` |
| 46 | `    exit 0` |
| 47 | `  fi` |
| 48 | `  echo -n "."` |
| 49 | `  sleep 1` |
| 50 | `done` |
| 51 | `` |
| 52 | `echo " timed out"` |
| 53 | `exit 1` |


---

# Top-level: `rules/`


## `rules/ccms.mdc`

- **Lines:** 36

- **Purpose:** Project asset; see contents and parent folder context below.


### Line-by-line


| Ln | Code |
|----|------|
| 1 | `` |
| 2 | ````` |
| 3 | `---` |
| 4 | `description: CCMS project rules. Always follow the docs in /docs.` |
| 5 | `alwaysApply: true` |
| 6 | `---` |
| 7 | `` |
| 8 | `# CCMS: Champions Club Management System` |
| 9 | `` |
| 10 | `Source of truth: docs/SRS.md (contract), docs/PRD.md (features/acceptance), docs/BRD.md (business...` |
| 11 | `If code and SRS disagree, the SRS wins. If the SRS is silent or ambiguous, STOP AND ASK. Never gu...` |
| 12 | `` |
| 13 | `## Hard rules` |
| 14 | `- Do not add libraries, endpoints, fields, enums, tables or files that are not in the SRS. Stack ...` |
| 15 | `- Backend: Python 3.12, FastAPI, SQLAlchemy 2.0 SYNC style (select(), Session.execute), Pydantic ...` |
| 16 | `- Frontend: React 18 + Vite + TypeScript, Tailwind CSS 3.4 (tailwind.config.js, @tailwind directi...` |
| 17 | `- Money = integer paise (BIGINT). Never float. Format in UI with formatINR(paise).` |
| 18 | `- Time = UTC in DB and API (ISO-8601 with Z). Club timezone Asia/Kolkata via zoneinfo for "day" l...` |
| 19 | `- All business logic lives in backend/app/services/. Routers are thin: validate, call service, re...` |
| 20 | `- Errors always use the envelope {"error":{"code","message","details"}} (SRS section 6) with the ...` |
| 21 | `- RBAC via require_roles(...) on every non-public endpoint (SRS section 3.1). Members only access...` |
| 22 | `- Parameterised SQL only. No f-string SQL. No dangerouslySetInnerHTML.` |
| 23 | `- Public/portal UI is MOBILE-FIRST (Tailwind default classes = phone, lg: = desktop). Every list/...` |
| 24 | `- No service worker, no camera APIs, no cloud services, no real payment/SMS/email.` |
| 25 | `- Double-booking is prevented by the DB unique constraint on court_slots(court_id, slot_start) in...` |
| 26 | `- payments rows are inserted ONLY via services/payments.record_payment().` |
| 27 | `` |
| 28 | `## Working style` |
| 29 | `- Implement exactly what the prompt asks, nothing more. Keep diffs small.` |
| 30 | `- Before multi-file changes, list the files you will touch.` |
| 31 | `- Write or update tests named in the prompt. Run them. Report real output, not guesses.` |
| 32 | `- Do not rewrite whole files to fix a small bug. If a fix fails twice, stop and explain your hypo...` |
| 33 | `- Short explanations (max 5 lines) after the code.` |
| 34 | ````` |
| 35 | `` |
| 36 | `---` |


---

# Top-level: `tasks.md/`


## `tasks.md`

- **Lines:** 341

- **Purpose:** Human-maintained checklist of build tasks and completion status across prompts.


### Structure outline


File has **341** lines. First lines set context; see repository copy for full text.

**First 15 lines:**

```
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
```
