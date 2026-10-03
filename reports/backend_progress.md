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
| 10a | Security sweep: RBAC fixes, audit-log route, T-07/T-08 | done | 215 | `4007fd0` |
| 10b | 30-day demo history seeded through the services | done | 215 | `10f5c32` |
| 10c | Final report | done | 215 | see report |

---

## DECISIONS

Where the SRS is silent, the most conservative reading was taken.

1. **`docs/BUILD_PLAN_AND_CURSOR_PROMPTS.md` does not exist** in this repo (the other four
   documents do). Stage 1 asked for `.cursor/rules/ccms.mdc` to be created "from BUILD_PLAN
   section 5". Instead of inventing content, the existing `.cursor/rules` file — which already
   carries the same project rules — was `git mv`-ed to `.cursor/rules/ccms.mdc`, converting it to
   the directory form without changing a word.
2. **Router prefixes are `/api/v1`, not `/api/v1/<name>`.** Several SRS 3.2 modules own more than
   one path root (`plans` also serves `/court-prices`, `shop` serves `/products` and
   `/shop/orders`, `payments` serves `/reports/*`, `hr` serves `/employees`, `/shifts`,
   `/leave-requests`, `/payroll`). A per-module prefix would have forced invented paths, so each
   router declares full SRS paths under a shared `/api/v1` prefix.
3. **IST helpers live in `config.py`** (`CLUB_TZ`, `local_date`, `day_bounds_utc`). SRS 2.2 lists
   no time-utils module and both `services/booking.py` and `services/reports.py` need them;
   `config.py` already owns environment-derived settings, so the club timezone sits there.
4. **`assert_member_access` takes a session** — `assert_member_access(session, user, member_id)`
   rather than `(user, member_id)`. Resolving a user's member row needs a query, and the SRS keeps
   `members.user_id` on the members table rather than denormalising onto `users`.
5. **`AppError` lives in `security.py`** (carried over from F-01). SRS 2.2 lists no `errors.py` and
   defining the class in `main.py` would create a circular import.
6. **Tax rate for `source_type=INVOICE` is `TAX_MEMBERSHIP`.** SRS 4.6 names rates for court, shop,
   bar and membership but not invoices; both candidates are 18 today, so the choice is currently
   not observable.
7. **Enums not constrained by a CHECK in the SRS 10 DDL** (`social_sessions.status`,
   `social_participants.status`, `quotes.status`) are modelled as Python enums without a DB CHECK,
   matching the DDL exactly rather than tightening it.
8. **Member search filters in Python, not SQL.** `search_members` loads the candidate rows via a
   parameterised `select()` and then applies the status filter and pagination in Python, because
   `status` is derived from the latest membership's `end_date` rather than stored. With a seeded
   club of 30 members this is exact; a future index-backed rewrite would need a materialised
   status column, which SRS 10 does not define.
9. **`BAR_STAFF` sees a reduced member view.** SRS 3.1 grants bar staff member lookup for tab
   attribution only, so `GET /members/{id}` returns `{id, member_code, full_name, plan_code}` for
   that role and the full record for FRONT_DESK/MANAGER/OWNER. No SRS table names the reduced
   shape, so the most conservative subset was chosen.
10. **Renewal always runs from today, never from the old end date.** SRS 3.2.3 does not say whether
    an early renewal stacks onto the remaining days. Extending from today is the reading that
    cannot over-credit a member, so `renew` sets `start_date = today` and
    `end_date = today + plan.duration_days`.
11. **Expiring-member notifications are emitted by `GET /members/expiring`.** SRS 14 names the
    `MEMBERSHIP_EXPIRING` notification but no scheduler exists in SRS 2.2. The read endpoint calls
    `notifications.notify()` with a dedupe key of member + end_date, so repeated calls are
    idempotent and no cron is invented.
12. **The availability grid lists 31 starts, 06:00 to 21:00 IST inclusive.** SRS 4.2 bounds a
    *start* to `[06:00, 21:00]`, so a 21:00 booking legitimately runs to 22:00. The 21:30 half-slot
    is therefore occupiable but never offered as a start.
13. **`bookable_1h` is false whenever the following half-slot is held**, and `price_paise` is
    returned only for bookable slots (matching the SRS 3.2.4 sample, where BOOKED and SOCIAL slots
    carry `null`).
14. **Staff see walk-in prices on `/courts/availability` unless they pass `member_id`**, exactly as
    the SRS 3.2.4 note says. A MEMBER's own id is always forced from the token, ignoring the query
    parameter.
15. **The public grid folds PAST into BUSY.** SRS 3.2.4 allows only FREE and BUSY there, and
    telling an anonymous caller that a slot is merely past is still more than it needs.
16. **`advance_booking_days` and `max_bookings_per_day` come from the member's active plan**, with
    the SRS 4.2 defaults (14 and 2) used at walk-in tier. SRS 10 puts both columns on `plans`, and
    there is no club-wide setting for either.
17. **A late-cancel refund override is a `refund: true` flag on the cancel body**, honoured only
    for OWNER and MANAGER per SRS 4.3, and always written to the audit log.
19. **Stock is taken with a conditional UPDATE, not SELECT ... FOR UPDATE.** SRS 4.5 spells out
    `UPDATE products SET stock_qty = stock_qty - :q WHERE id=:id AND is_active AND stock_qty >= :q`
    and checks `rowcount`. That single statement is its own lock, so oversell is impossible without
    a separate read. Lines are still processed in `product_id` order, as the SRS requires, to keep
    multi-line orders deadlock-free.
20. **Duplicate product lines in one cart are merged before pricing.** SRS 3.2.7 does not say what
    two lines for the same product mean; summing the quantities is the only reading that cannot
    take stock twice or deadlock against itself.
21. **A COUNTER order requires a payment method.** SRS 3.2.7 says `COUNTER` + paid becomes
    `COMPLETED` but never describes an unpaid counter sale, so one is refused with 422.
22. **Shop order statuses are forward-only** (`PLACED → READY → OUT_FOR_DELIVERY → COMPLETED`), and
    `COMPLETED` additionally requires payment. SRS 3.2.7 lists the states but not the edges; the
    bar's forward-only rule (SRS 8) was applied here too rather than inventing a looser one.
23. **`LOW_STOCK` dedupe key includes the level crossed** (`LOW_STOCK:<id>:<qty>`), so SRS 4.5's
    "once per crossing" holds: dropping 4→2 notifies once, and only a further drop notifies again.
24. **Cancelling a COMPLETED shop order needs MANAGER or OWNER.** SRS 3.2.7 allows cancellation
    with a refund but does not scope it; restricting the already-settled case is the conservative
    reading, and it is audited either way.
26. **The kitchen may skip a step forward but never repeat or reverse one.** SRS 3.2.8 says
    "NEW→PREPARING→READY→SERVED (forward only)", which a strict reading satisfies by comparing
    positions in that list. Setting the status it already holds is refused as INVALID_TRANSITION.
27. **`CANCELLED` is a kitchen status, not a step in the chain.** It is allowed from any state
    before SERVED and only while the order is unpaid; SRS 10 lists it on the enum but SRS 3.2.8
    leaves its edges unsaid, so the narrow reading was taken.
28. **A bar order's totals are recomputed from its stored line snapshots** every time items are
    added, so the member discount applies to the whole order and a later menu price change never
    rewrites an existing line.
29. **`/bar/tabs/settle` validates every order before writing any payment.** SRS 3.2.8 calls it
    atomic; the implementation locks all named orders in id order, checks ownership, payment and
    kitchen state for each, and only then records one payment per order.
30. **`outstanding_tabs_paise` is the club-wide open-tab balance, not one day's.** SRS 3.2.8 shows
    it inside the daily report but a tab by definition outlives the day it was opened, so limiting
    it to the report date would understate what is owed.
31. **Members may read their own bar orders but not create them.** SRS 3.1 keeps ordering with the
    bar staff; a member is given the same own-records read the rest of the system grants.
33. **`week` and `month` run from their start up to the end of today, not a whole calendar week
    or month.** SRS 3.2.9's sample shows `to` as the end of the current day, and a dashboard that
    counted days that have not happened yet would dilute utilisation.
34. **Utilisation uses 32 half-hour slots per active court per day.** The bookable window is
    06:00 to 22:00 IST (SRS 4.2 allows a 21:00 start, which runs to 22:00), and each booking
    occupies two slots. SRS 4.8 gives the ratio but not the denominator's constants.
35. **Receivables count invoices in `SENT`, not `DRAFT`.** A draft has not been billed to anyone,
    so counting it would overstate what the club is owed. SRS 4.8 defers to BRL-13 without listing
    the statuses.
36. **Refunding a BAR_ORDER payment leaves the bar order row untouched.** SRS 10 gives
    `bar_orders.payment_status` only UNPAID and PAID, so there is no truthful value to write; the
    ledger row carries the refund, and the daily bar report reads the ledger.
37. **CSV exports neutralise formula-leading cells** by prefixing `'` to any value starting with
    `=`, `+`, `-` or `@` (S-17 applied to the export path).
38. **`GET /dashboard/summary` is what triggers expiry notifications**, alongside the members page,
    exactly as SRS 4.9 describes ("generated lazily when the dashboard or members page is loaded").
40. **A honeypot hit returns `{"id": 0, "status": "received"}`.** SRS 3.2.10 says the honeypot must
    be silent; returning id 0 keeps the response shape identical to a success so a bot cannot
    tell it was caught, and 0 is never a real lead id.
41. **An unknown `preferred_plan_id` on a public enquiry is silently dropped, not rejected.**
    A 404 would let an anonymous caller enumerate which plan ids exist (S-15).
42. **Lead statuses flow NEW → CONTACTED → QUOTED → WON/LOST, with LOST reachable from any open
    state and both WON and LOST terminal.** SRS 3.2.10 names the states but not the edges.
43. **Posting a quote moves an open lead to QUOTED by itself**, since SRS 3.2.10 lists QUOTED as a
    pipeline state and a lead with a quote on it is, factually, quoted.
44. **`POST /leads/{id}/convert` only returns the prefill.** The SRS is explicit that the lead
    "marks WON after member created (`POST /members` with `lead_id`)", so convert never mutates it.
45. **Role-targeted notifications are shared, and the first person to open one marks it read for
    the role.** SRS 10 gives `notifications` a single nullable `read_at`, so per-user read state
    is not representable without a new table.
47. **Cancelling a social session keeps the row and sets `status='CANCELLED'`.** SRS 3.2.6 spells
    the route `DELETE`, but SRS 10 gives `social_sessions` a CANCELLED status and the hard-delete
    ban covers anything a refund points at. Slots are freed and participants refunded.
48. **Social payments all share `source_id = session_id`**, since SRS 10 has no participant-level
    payment reference. A participant's refund is matched by session, member and amount.
49. **Invoice `total_paise` equals `subtotal_paise`, with tax carried inclusively.** SRS 4.6 is
    explicit that tax is inclusive, so adding it to the total would charge it twice.
50. **An invoice bills either a member or a client, never both and never neither.** SRS 10 makes
    both columns nullable, but a bill with no payer, or two, has no meaning.
51. **`InvoiceStatus.PAID` is unreachable through `/invoices/{id}/status`.** Only `mark-paid`
    sets it, so the ledger row and the status can never diverge.
52. **Paying an expense writes no `payments` row.** SRS 4.7 defines that table as the revenue
    ledger; expenses are money out and reach the dashboard through `payables`.
54. **`GET /shifts?week=` accepts any date inside the week** and returns the Monday-to-Sunday
    roster containing it, matching the IST week the dashboard already uses.
55. **Staff raise leave for themselves only; a manager may raise one for anyone.** SRS 3.2.11 says
    "employee request, MANAGER approve/reject" without naming who may file on whose behalf, so a
    non-manager's `employee_id` is ignored in favour of their own linked employee row.
56. ~~**`POST /payroll/run` is restricted to OWNER.**~~ Reversed in Stage 10: SRS 3.1 grants
    MANAGER "W (no payroll pay)", so running payroll is OWNER + MANAGER and only
    `/payroll/{id}/mark-paid` stays OWNER-only.
57. **Paying a payroll row raises a PAID expense rather than a payment.** SRS 3.2.11 only says
    "mark paid"; routing it through `expenses` keeps money-out in one place and out of revenue.
58. **`MemberStatus` and `SlotState` are derived-only enums** (SRS 3.2.3 / 3.2.4). They exist in
   `enums.py` for API shapes but are never stored, so they carry no CHECK.

---

59. **MEMBER has no access to the bar at all.** SRS 3.1 shows `—` for MEMBER against both the
    menu and bar orders, so the menu is staff-only even though members can see the shop catalogue.
60. **FRONT_DESK reads invoices and clients but writes neither.** SRS 3.1 lists "FRONT_DESK R",
    so the list and detail routes admit them and every mutation stays with OWNER and MANAGER.
61. **`GET /audit-logs` is OWNER-only and read-only** (SRS 3.2.11). It filters on action, entity
    and actor and is never written through, since only `audit.log()` inserts.
62. **Seed history is created through the services, then shifted back whole days.** The booking
    service refuses a start date in the past or beyond the 14-day horizon, so demo rows are
    created on free near-future slots and moved back by an exact number of days. Whole days keep
    `UNIQUE(court_id, slot_start)` intact and leave every ledger and stock rule enforced.
63. **`_seed_history` is guarded on the payments table being empty.** Payments exist only once
    history has run, which makes the section idempotent without a marker column.
64. **The seeded low-stock count is a floor, not an exact number.** The sales history draws extra
    products under their reorder level, so `test_seed_shapes` asserts at least the SRS-required 3.

65. **JWT replaced by server-side login sessions (mentor request, post-Stage 10).** Login still
    checks email + argon2 password against `users`, with the lockout, rate limit and password
    policy kept. A match stores the SHA-256 of a random id in `login_sessions` and sets it as an
    HttpOnly `ccms_session` cookie (path `/`, SameSite=Lax, `SESSION_HOURS` default 12). Every
    request resolves the cookie to a user and `require_roles` is unchanged. `/auth/refresh`,
    `refresh_tokens`, `JWT_SECRET`, `ACCESS_TOKEN_MINUTES` and `pyjwt` are gone. 401 codes are
    now `NOT_AUTHENTICATED` and `SESSION_EXPIRED`. This deviates from SRS 3.2.1 / S-03 / S-04,
    which specify JWT access + rotating refresh tokens. No SMTP or email verification existed.
66. **Members get a Bar & Dining module (`/api/v1/dining/*`, post-Stage 10).** This narrows
    decision 59. Members still cannot reach `/menu-items` or bar orders. Instead they get a
    read-only `GET /dining/menu` showing their tier's `bar_discount_pct` (the same figure
    `bar._retotal` applies when staff link an order to the member). They can also reserve tables
    in a new `table_reservations` table (CONFIRMED -> SEATED | NO_SHOW | CANCELLED). The rules:
    - Sittings are a fixed 120 minutes, starting on the half hour from 08:00 to 21:00 IST.
    - Tables can be booked up to 14 days ahead.
    - Each member gets one active reservation per IST day.
    - The service picks the smallest free table that seats the party. Members never choose.

    Concurrency matches the court-slot pattern. The member row is locked before the daily-limit
    count. The candidate tables are locked `FOR UPDATE` in (seats, id) order before the overlap
    check, so a race for the last table gives one 201 and one 409 `NO_TABLE_AVAILABLE`.

    Members only see and cancel their own reservations (404 otherwise), and only before the
    sitting starts. Staff book for any member and mark SEATED or NO_SHOW. Reservations carry no
    deposit and no payment row.
67. **`GET /payments/summary` (OWNER, MANAGER) totals the ledger over the same filters as
    `GET /payments`.** It returns the count, the COMPLETED amount, and the REFUNDED count and
    amount, so the ledger's KPI cards cover the whole filtered range rather than one page.
68. **Employees are removed by deactivation, via `PATCH /employees/{id}` (OWNER, MANAGER).**
    The endpoint edits name, title, salary and `is_active`. It never hard-deletes, because
    shifts and payroll reference the row, and inactive employees are already skipped by
    payroll runs.
    - A linked staff login follows the employee's active flag: deactivating disables the login
      and closes its sessions, and reactivating re-enables it.
    - Logins are OWNER business (SRS 3.1). So only the OWNER may toggle an employee who has a
      login, and nobody may deactivate their own.
    - `POST /employees` accepts an optional `login` (OWNER only) that creates the staff user in
      the same transaction. A duplicate email therefore leaves neither row behind.

---

## KNOWN_ISSUES

_None._ Every test in the suite passes on a freshly reset database.

---

## Carried over from F-01

- ~~`member_id` in the login / `/auth/me` response is hard-coded `null`.~~ Done in Stage 2:
  `routers/auth.py::_summary` resolves the real members row for `MEMBER` users.
- `POST /auth/register-member` is P1 and deliberately not implemented.
- `PATCH /users/{id}` restricts `role` to the four staff roles; the SRS does not say whether a
  staff user may be demoted to MEMBER.
