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
| 3 | Courts, Availability, Bookings (F-03) | done | 74 | `d68aaf0` |
| 4 | Shop & Stock (F-05) | done | 93 | `77b2df6` |
| 5 | Bar (F-07) | done | 113 | `cd3defc` |
| 6 | Payments, Refunds & Dashboard (F-10) | done | 132 | `71e85a2` |
| 7 | Public site, Leads, Notifications (F-08/09/14) | done | 153 | `8c6dd1d` |
| 8 | Social sessions, Expenses, Invoices | done | 171 | `f5c6c28` |
| 9 | HR: employees, shifts, leave, payroll | done | 182 | `f023a6f` |
| 10a | Security sweep: RBAC fixes, audit-log route, T-07 / T-08 | done | 215 | `4007fd0` |
| 10b | 30-day demo history seeded through the services | done | 215 | `10f5c32` |
| 10c | This report | done | 215 | final commit |

All ten stages are complete. Nothing was skipped.

---

## 2. Tests

```
215 passed, 1 warning in 28.52s
```

The single warning is a `DeprecationWarning` from Starlette's own `testclient` module, not
from CCMS code.

| File | Tests | Covers |
|------|-------|--------|
| `test_auth.py` | 12 | login, refresh rotation, logout, lockout, rate limit (T-09) |
| `test_bar.py` | 20 | tabs, kitchen flow, split settle (T-12), daily report |
| `test_bookings.py` | 31 | pricing tiers, availability grid, cancel/refund, T-01, T-02, T-03, T-04 |
| `test_foundation.py` | 17 | schema shape, enums, seed shape, error envelope |
| `test_hr.py` | 11 | employees, shifts, leave approval, payroll idempotency |
| `test_leads.py` | 21 | enquiry honeypot, lead flow, conversion, notifications |
| `test_members.py` | 14 | member codes, renewals, expiry, tier derivation |
| `test_payments.py` | 19 | ledger, refunds, dashboard periods, CSV export, T-10 |
| `test_security.py` | 33 | T-07 RBAC matrix, T-08 IDOR, S-02/11/12/15/18/20 |
| `test_shop.py` | 19 | pricing, discounts, stock race (T-05), order lifecycle |
| `test_social_billing.py` | 18 | social sessions (T-11), invoices, expenses |

Concurrency tests call the service function from real threads, each with its own
`SessionLocal()`, and assert on the database constraint outcome rather than on application
logic: T-01 fires 50 threads at one court slot and expects exactly one `CONFIRMED` booking,
T-05 fires 2 threads at the last unit of stock and expects exactly one sale.

Run them with:

```
docker compose up --build -d api
docker compose exec api pytest -q
```

Every test creates its own throwaway rows and deletes them in foreign-key order at the end of
the session, so the database is byte-identical to its seeded state after a run and the suite is
order-independent.

---

## 3. Database and seed

33 tables in `public`. Row counts on a freshly reset database:

| Table | Rows | Table | Rows |
|-------|------|-------|------|
| users | 7 | bookings | 42 |
| plans | 3 | court_slots | 88 |
| courts | 6 | shop_orders | 13 |
| court_prices | 16 | bar_orders | 16 |
| members | 30 | payments | 53 |
| memberships | 30 | leads | 4 |
| products | 14 | social_sessions | 1 |
| menu_items | 15 | social_participants | 5 |
| bar_tables | 8 | audit_logs | 7 |

30 of the bookings are historical (completed or no-show) and spread one per day across the last
30 days; the rest are upcoming, including three today so the dashboard's booking tiles are never
zero. Shop and bar orders are spread every other day across the same window with rotating
payment methods. Every one of these rows was created by calling the real service function, so
the ledger, stock, slot-uniqueness and audit rules all applied; past-dated rows were then shifted
back by a whole number of days.

Dashboard figures on the seeded database (owner, via nginx):

| Period | Revenue (paise) | Bookings | Utilisation |
|--------|-----------------|----------|-------------|
| today | 651,000 | 3 | 3.1% |
| week | 4,548,600 | 7 | 1.2% |
| month | 2,338,600 | 4 | 1.4% |

Month is lower than week because `month` is the calendar month to date, which at the time of
writing had only three days in it, while `week` reaches back into the previous month.

---

## 4. Security checklist (SRS 7)

| ID | Requirement | State | Evidence |
|----|-------------|-------|----------|
| S-01 | Passwords hashed with argon2 | Done | `security.hash_password`; `test_auth.py` |
| S-02 | Hashes never returned by the API | Done | `test_security.py::test_s02_password_hash_never_leaves_the_api` |
| S-03 | Access token 15 min, refresh 7 days | Done | `config.py`; `test_auth.py` |
| S-04 | Refresh tokens rotate and revoke on reuse | Done | `test_auth.py` rotation tests |
| S-05 | Request bodies reject unknown fields | Done | `test_security.py::test_every_request_body_forbids_unknown_fields` sweeps every schema |
| S-06 | Lockout after repeated failures | Done | `test_auth.py` lockout test |
| S-07 | Logout revokes the refresh token | Done | `test_auth.py` |
| S-08 | Parameterised SQL only | Done | All access is SQLAlchemy `select()` / `update()`; no string SQL anywhere in `app/` |
| S-09 | No hard deletes of financial rows | Done | Refunds mark status; `cancel` never deletes a payment |
| S-10 | Secrets from env, never committed | Done | `.env.example` only; verified in the Prompt 1 pass |
| S-11 | Unauthenticated calls are 401 | Done | `test_security.py::test_s11_unauthenticated_calls_are_401_not_500` |
| S-12 | Tampered tokens rejected | Done | `test_security.py::test_s12_a_tampered_token_is_rejected` |
| S-13 | Role checks on every non-public route | Done | `test_security.py::test_t07_every_non_public_route_has_a_role_guard` reads the live route table |
| S-14 | Members reach only their own records | Done | T-08, four endpoints, 404 not 403 |
| S-15 | Public endpoints leak no personal data | Done | `test_security.py::test_s15_public_endpoints_return_no_personal_data` |
| S-16 | Stored input escaped on output | Done | `leads.sanitise`; `billing.invoice_html` escapes; XSS test in `test_leads.py` |
| S-17 | Enquiry honeypot | Done | `leads.record_enquiry` returns 201 and stores nothing |
| S-18 | Uniform error envelope, no stack traces | Done | `test_security.py::test_s18_errors_use_the_srs_envelope` |
| S-19 | Sensitive actions audited | Done | `audit.log()` on refund, price/plan change, role change, export, payroll, delete |
| S-20 | Health endpoint leaks nothing | Done | `test_security.py::test_s20_health_needs_no_auth_and_leaks_nothing` |
| S-21 | Rate limits on auth and public routes | Done | slowapi on login, refresh, enquiries, public availability; T-09 |
| S-22 | Security headers at the edge | Done | nginx `add_header` block, verified in the Prompt 1 closing pass |
| S-23 | Real client IP behind the proxy | Done | `--proxy-headers`, `X-Forwarded-For` spoofing test in the Prompt 1 pass |

Four RBAC mismatches against SRS 3.1 were found during the Stage 10 sweep and fixed: MEMBER was
able to read the bar menu and bar orders (SRS gives them `—`), FRONT_DESK could not read invoices
or clients (SRS gives them `R`), `POST /payroll/run` was OWNER-only (SRS gives MANAGER write on
HR, withholding only payroll *payment*), and `GET /audit-logs` was missing entirely.

---

## 5. Endpoints

108 routes. The full table is below; roles are the expanded `require_roles` argument of each
endpoint.

| Method and path | Roles |
|---|---|
| `GET /api/v1/audit-logs` | OWNER |
| `POST /api/v1/auth/login` | public |
| `POST /api/v1/auth/logout` | any authenticated |
| `GET /api/v1/auth/me` | any authenticated |
| `POST /api/v1/auth/refresh` | public |
| `GET /api/v1/bar/orders` | OWNER, MANAGER, FRONT_DESK, BAR_STAFF |
| `POST /api/v1/bar/orders` | OWNER, MANAGER, BAR_STAFF |
| `GET /api/v1/bar/orders/{order_id}` | OWNER, MANAGER, FRONT_DESK, BAR_STAFF |
| `POST /api/v1/bar/orders/{order_id}/items` | OWNER, MANAGER, BAR_STAFF |
| `POST /api/v1/bar/orders/{order_id}/kitchen-status` | OWNER, MANAGER, BAR_STAFF |
| `POST /api/v1/bar/orders/{order_id}/pay` | OWNER, MANAGER, BAR_STAFF |
| `POST /api/v1/bar/orders/{order_id}/tab` | OWNER, MANAGER, BAR_STAFF |
| `GET /api/v1/bar/reports/daily` | OWNER, MANAGER, BAR_STAFF |
| `GET /api/v1/bar/tables` | OWNER, MANAGER, FRONT_DESK, BAR_STAFF |
| `POST /api/v1/bar/tables` | OWNER, MANAGER |
| `PATCH /api/v1/bar/tables/{table_id}` | OWNER, MANAGER |
| `POST /api/v1/bar/tabs/settle` | OWNER, MANAGER, BAR_STAFF |
| `GET /api/v1/bookings` | OWNER, MANAGER, FRONT_DESK, MEMBER |
| `POST /api/v1/bookings` | OWNER, MANAGER, FRONT_DESK, MEMBER |
| `GET /api/v1/bookings/{booking_id}` | OWNER, MANAGER, FRONT_DESK, MEMBER |
| `POST /api/v1/bookings/{booking_id}/cancel` | OWNER, MANAGER, FRONT_DESK, MEMBER |
| `POST /api/v1/bookings/{booking_id}/pay` | OWNER, MANAGER, FRONT_DESK |
| `POST /api/v1/bookings/{booking_id}/status` | OWNER, MANAGER, FRONT_DESK |
| `GET /api/v1/clients` | OWNER, MANAGER, FRONT_DESK |
| `POST /api/v1/clients` | OWNER, MANAGER |
| `PATCH /api/v1/clients/{client_id}` | OWNER, MANAGER |
| `GET /api/v1/court-prices` | public |
| `PUT /api/v1/court-prices` | OWNER, MANAGER |
| `GET /api/v1/courts` | OWNER, MANAGER, FRONT_DESK, BAR_STAFF, MEMBER |
| `POST /api/v1/courts` | OWNER, MANAGER |
| `GET /api/v1/courts/availability` | OWNER, MANAGER, FRONT_DESK, BAR_STAFF, MEMBER |
| `PATCH /api/v1/courts/{court_id}` | OWNER, MANAGER |
| `GET /api/v1/dashboard/revenue-series` | OWNER, MANAGER |
| `GET /api/v1/dashboard/summary` | OWNER, MANAGER |
| `GET /api/v1/employees` | OWNER, MANAGER |
| `POST /api/v1/employees` | OWNER, MANAGER |
| `GET /api/v1/expenses` | OWNER, MANAGER |
| `POST /api/v1/expenses` | OWNER, MANAGER |
| `GET /api/v1/expenses/{expense_id}` | OWNER, MANAGER |
| `POST /api/v1/expenses/{expense_id}/mark-paid` | OWNER, MANAGER |
| `GET /api/v1/invoices` | OWNER, MANAGER, FRONT_DESK |
| `POST /api/v1/invoices` | OWNER, MANAGER |
| `GET /api/v1/invoices/{invoice_id}` | OWNER, MANAGER, FRONT_DESK |
| `POST /api/v1/invoices/{invoice_id}/mark-paid` | OWNER, MANAGER |
| `GET /api/v1/invoices/{invoice_id}/print` | OWNER, MANAGER |
| `POST /api/v1/invoices/{invoice_id}/status` | OWNER, MANAGER |
| `GET /api/v1/leads` | OWNER, MANAGER, FRONT_DESK |
| `GET /api/v1/leads/{lead_id}` | OWNER, MANAGER, FRONT_DESK |
| `PATCH /api/v1/leads/{lead_id}` | OWNER, MANAGER, FRONT_DESK |
| `POST /api/v1/leads/{lead_id}/convert` | OWNER, MANAGER, FRONT_DESK |
| `GET /api/v1/leads/{lead_id}/notes` | OWNER, MANAGER, FRONT_DESK |
| `POST /api/v1/leads/{lead_id}/notes` | OWNER, MANAGER, FRONT_DESK |
| `GET /api/v1/leads/{lead_id}/quotes` | OWNER, MANAGER, FRONT_DESK |
| `POST /api/v1/leads/{lead_id}/quotes` | OWNER, MANAGER, FRONT_DESK |
| `GET /api/v1/leave-requests` | OWNER, MANAGER, FRONT_DESK, BAR_STAFF |
| `POST /api/v1/leave-requests` | OWNER, MANAGER, FRONT_DESK, BAR_STAFF |
| `POST /api/v1/leave-requests/{request_id}/decide` | OWNER, MANAGER |
| `GET /api/v1/members` | OWNER, MANAGER, FRONT_DESK, BAR_STAFF |
| `POST /api/v1/members` | OWNER, MANAGER, FRONT_DESK |
| `GET /api/v1/members/by-code/{code}` | OWNER, MANAGER, FRONT_DESK, BAR_STAFF, MEMBER |
| `GET /api/v1/members/expiring` | OWNER, MANAGER, FRONT_DESK |
| `GET /api/v1/members/{member_id}` | OWNER, MANAGER, FRONT_DESK, BAR_STAFF, MEMBER |
| `PATCH /api/v1/members/{member_id}` | OWNER, MANAGER, FRONT_DESK |
| `GET /api/v1/members/{member_id}/history` | OWNER, MANAGER, FRONT_DESK, BAR_STAFF, MEMBER |
| `POST /api/v1/members/{member_id}/renew` | OWNER, MANAGER, FRONT_DESK |
| `GET /api/v1/menu-items` | OWNER, MANAGER, FRONT_DESK, BAR_STAFF |
| `POST /api/v1/menu-items` | OWNER, MANAGER |
| `PATCH /api/v1/menu-items/{item_id}` | OWNER, MANAGER |
| `GET /api/v1/notifications` | OWNER, MANAGER, FRONT_DESK, BAR_STAFF, MEMBER |
| `GET /api/v1/notifications/unread-count` | OWNER, MANAGER, FRONT_DESK, BAR_STAFF, MEMBER |
| `POST /api/v1/notifications/{notification_id}/read` | OWNER, MANAGER, FRONT_DESK, BAR_STAFF, MEMBER |
| `GET /api/v1/payments` | OWNER, MANAGER |
| `GET /api/v1/payments/mine` | MEMBER |
| `POST /api/v1/payments/{payment_id}/refund` | OWNER, MANAGER |
| `GET /api/v1/payroll` | OWNER, MANAGER |
| `POST /api/v1/payroll/run` | OWNER, MANAGER |
| `POST /api/v1/payroll/{payroll_id}/mark-paid` | OWNER |
| `GET /api/v1/plans` | public |
| `PATCH /api/v1/plans/{plan_id}` | OWNER, MANAGER |
| `GET /api/v1/products` | OWNER, MANAGER, FRONT_DESK |
| `POST /api/v1/products` | OWNER, MANAGER |
| `GET /api/v1/products/low-stock` | OWNER, MANAGER, FRONT_DESK |
| `GET /api/v1/products/{product_id}` | OWNER, MANAGER, FRONT_DESK |
| `PATCH /api/v1/products/{product_id}` | OWNER, MANAGER |
| `POST /api/v1/products/{product_id}/restock` | OWNER, MANAGER |
| `GET /api/v1/public/availability` | public |
| `POST /api/v1/public/enquiries` | public |
| `GET /api/v1/public/products` | public |
| `GET /api/v1/reports/payments.csv` | OWNER, MANAGER |
| `GET /api/v1/reports/tax-summary` | OWNER, MANAGER |
| `GET /api/v1/shifts` | OWNER, MANAGER, FRONT_DESK, BAR_STAFF |
| `POST /api/v1/shifts` | OWNER, MANAGER |
| `GET /api/v1/shop/orders` | OWNER, MANAGER, FRONT_DESK, MEMBER |
| `POST /api/v1/shop/orders` | OWNER, MANAGER, FRONT_DESK, MEMBER |
| `GET /api/v1/shop/orders/{order_id}` | OWNER, MANAGER, FRONT_DESK, MEMBER |
| `POST /api/v1/shop/orders/{order_id}/cancel` | OWNER, MANAGER, FRONT_DESK, MEMBER |
| `POST /api/v1/shop/orders/{order_id}/pay` | OWNER, MANAGER, FRONT_DESK |
| `POST /api/v1/shop/orders/{order_id}/status` | OWNER, MANAGER, FRONT_DESK |
| `GET /api/v1/social-sessions` | OWNER, MANAGER, FRONT_DESK, BAR_STAFF, MEMBER |
| `POST /api/v1/social-sessions` | OWNER, MANAGER |
| `DELETE /api/v1/social-sessions/{session_id}` | OWNER, MANAGER |
| `GET /api/v1/social-sessions/{session_id}` | OWNER, MANAGER, FRONT_DESK, BAR_STAFF, MEMBER |
| `POST /api/v1/social-sessions/{session_id}/join` | OWNER, MANAGER, FRONT_DESK, MEMBER |
| `POST /api/v1/social-sessions/{session_id}/leave` | OWNER, MANAGER, FRONT_DESK, MEMBER |
| `GET /api/v1/social-sessions/{session_id}/participants` | OWNER, MANAGER, FRONT_DESK |
| `POST /api/v1/users` | OWNER |
| `PATCH /api/v1/users/{user_id}` | OWNER |
| `GET /health` | public |

---

## 6. Decisions and known issues

The full numbered list of 64 decisions lives in `reports/backend_progress.md` under
`## DECISIONS`. The ones a reader most needs:

- Money is an integer number of paise everywhere, in the database, the services and the API.
- Tax is inclusive: `tax = (total*rate + (100+rate)//2) // (100+rate)`, so an invoice total
  equals its subtotal.
- Timestamps are UTC with a `Z` suffix; anything that means "a day" (daily limits, the booking
  grid, dashboard periods, payroll months) resolves through `Asia/Kolkata`.
- A one-hour booking is two 30-minute `court_slots` rows; double booking is prevented by
  `UNIQUE(court_id, slot_start)` and surfaces as `SLOT_TAKEN` 409.
- Stock is taken with a conditional `UPDATE ... WHERE stock_qty >= :qty` and a rowcount check,
  so overselling is impossible without a lock.
- Rows in `payments` are inserted only by `services/payments.record_payment()`. Refunded
  payments are excluded from revenue. Expenses and payroll are money out and never touch it.
- Paying a payroll row raises a `PAID` expense rather than a payment.
- Seed history is created through the services, then shifted back by whole days; see decision 62.

**KNOWN_ISSUES: none.** Every test passes on a freshly reset database.

---

## 7. Deviations from the SRS

1. `POST /auth/register-member` is listed as P1 in the SRS and is deliberately not implemented.
   Members are created by staff through `POST /members`.
2. `MemberStatus` and `SlotState` are derived at read time and never stored, so they carry no
   database CHECK constraint even though SRS 10 lists them as enums.
3. `InvoiceStatus.PAID` cannot be set through `POST /invoices/{id}/status`; only `mark-paid`
   reaches it, so the status and the ledger row can never disagree.
4. The seeded low-stock product count is a floor of 3 rather than exactly 3, because the seeded
   sales history draws further products below their reorder level.
5. `PATCH /users/{id}` will not demote a staff user to MEMBER. The SRS does not say whether that
   is allowed, and a MEMBER user row without a members row would be inconsistent.

---

## 8. Running it

```bash
cp .env.example .env          # set SECRET_KEY and the database password
docker compose up --build -d  # db, api, web
# API:  http://localhost:8080/api/v1
# Docs: http://localhost:8080/docs
./reset_db.sh                 # drop, recreate and reseed in under 30 s
```

Demo accounts, all with the password in `SEED_PASSWORD` (`Club@12345` by default):

| Email | Role |
|-------|------|
| `owner@club.test` | OWNER |
| `manager@club.test` | MANAGER |
| `desk@club.test` | FRONT_DESK |
| `bar@club.test` | BAR_STAFF |
| `member1@club.test`, `member2@club.test`, `member3@club.test` | MEMBER |

---

## 9. What the frontend needs to know

**Login and refresh.** `POST /auth/login` with `{email, password}` returns
`{access_token, refresh_token, user}`. Send the access token as `Authorization: Bearer <token>`.
It expires after 15 minutes.

**TOKEN_EXPIRED.** When any call returns 401 with `error.code == "TOKEN_EXPIRED"`, call
`POST /auth/refresh` with `{refresh_token}` and retry the original request once. Refresh tokens
rotate: the response carries a new refresh token and the old one is dead. If refresh itself
fails, or the code is `TOKEN_REVOKED`, send the user back to login. `POST /auth/logout` revokes
the current refresh token.

**Error envelope.** Every error, at every status code, is
`{"error": {"code": "...", "message": "...", "details": {...}}}`. Drive UI off `code`, show
`message`, and read `details` for field errors (`VALIDATION_ERROR` puts a list under
`details.errors`) or for context such as `OUT_OF_STOCK` returning `details.available`.

**Rate limits.** Login and refresh are limited per IP, as are the public enquiry and availability
endpoints. A breach returns 429 with code `RATE_LIMITED`. Back off rather than retrying in a loop.

**`member_id`.** For a MEMBER user, `user.member_id` in the login and `/auth/me` responses is the
members-table id. It is `null` for staff. Member-scoped endpoints ignore any `member_id` sent by
a member and substitute their own, and return 404 (never 403) for another member's record, so do
not treat a 404 as a bug.

**Money.** Every field ending in `_paise` is an integer number of paise. Divide by 100 only for
display, never for arithmetic, and never send a float.

**Pagination.** List endpoints return `{items, total, page, page_size}` and take `page` and
`page_size` query parameters, with `page_size` capped at 100.

**Times.** All timestamps are UTC with a `Z` suffix. The club runs on `Asia/Kolkata`, so render
in IST; booking slots start on the hour or half hour between 06:00 and 21:00 IST and a booking is
always one hour long.
