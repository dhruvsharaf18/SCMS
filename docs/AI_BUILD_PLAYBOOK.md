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
| Tablets | Bar POS + kitchen board |
| Laptops | Front desk, manager, owner |
| Database | PostgreSQL 16 in Docker |
| Hosting | Local laptop via Docker Compose. Phones join the same Wi-Fi: `http://<laptop-IP>:8080` |
| Not included | Native apps, offline mode/service worker, camera QR scanning, HTTPS, cloud, domain |

**Final submission package**
1. Source repo (frontend, backend, docker-compose, seed, tests)
2. `docker compose up --build` works on a clean machine, with seeded demo data
3. README: setup, LAN/phone instructions, demo logins, architecture, built vs stubbed, security measures
4. Live demo: laptop + at least one phone
5. 3–5 slides and a backup demo video

---

## 1. The Honest Goal

A **complete, working, secure core** beats a half-working everything. Judges see a demo, not a feature count. Success means:

> Every one of the 6 scenes from the problem statement can be demonstrated end-to-end with real data, role-based login, no crashes, and a visible security story, with the visitor and member scenes shown on a real phone.

"Complete" is defined as **P0 fully done + as much P1 as time allows + P2 as stubs**.

---

## 2. Scope Tiers

### P0: must be fully working (target: done by Hour 19)
| Module | What "done" means |
|--------|-------------------|
| Auth + RBAC + audit log | Login, lockout, 5 roles, 403s work, refresh token |
| Members + plans | Register, search, QR code, profile history, renew, expiry flags |
| Court booking | Availability grid, book (member/walk-in), 2/day limit, tier pricing, cancel/refund, no double booking (tested) |
| Shop (counter) + stock | Catalogue, counter sale, discount, stock decrement, low-stock list, restock |
| Bar POS | Tables, orders, kitchen board, pay, member tab + settle, daily report |
| Payments ledger + owner dashboard | Today/week/month, by source and method, receivables/payables (from available data), chart |
| Public site + enquiry | Plans, prices, availability, shop, enquiry form → lead + notification |

### P1: do in this order, stop at Hour 21 feature freeze
1. Friday social play (SRS §3.2.6)
2. Online shop orders (pickup/delivery) in member portal
3. Lead pipeline (notes, quote, convert to member)
4. Expenses (feeds payables)
5. Invoices + clients (printable HTML)
6. CSV export of payments

### P2: stub only (list page + create form + one action; no polish)
Employees, shifts, leave request/approve, payroll run, GST summary. If the clock says no, show them as read-only pages with seeded data and say so in the demo.

### Explicitly NOT building
Real payments · email/SMS · courier tracking · native/hybrid mobile app · offline mode/service workers · camera QR scanning · push notifications · cloud hosting/HTTPS/Caddy · PDF server rendering · multi-branch · photo upload · i18n · accounting-grade tax · unit tests for the frontend. **Do not let the AI "helpfully" add any of these.**

---

## 3. Hour-by-Hour Plan

| Hours | Track A: Backend core | Track B: Backend ops + dashboard | Track C: Frontend |
|-------|---------------------|---------------------|-------------------|
| **0–1.5** | Repo, Docker Compose (`db` internal, `api`, `web`/nginx), FastAPI skeleton, `/health`, config, DB session, enums, error envelope, `--proxy-headers` | Review SRS, write `seed.py` skeleton, pin versions, `.env.example` | Vite + TS + Tailwind 3.4, router, **mobile-first layout shell** (bottom nav on phone, drawer sidebar < 1024 px), API client, generated types script, Vite proxy for `/api` with `--host 0.0.0.0` |
| **1.5–4** | Auth (login, JWT, refresh, lockout, `require_roles`), users, audit helper | Plans, members, memberships, member-code, search, by-code | Login page, staff layout + role-based menu, members list/form/profile (QR) |
| **4–9** | Booking engine (`court_slots`, pricing, limit, cancel) + **T-01…T-04** | Courts CRUD, availability query, payments service `record_payment` | Availability grid, booking dialog with price preview, my bookings, staff bookings |
| **9–12** | Products, stock service, counter orders + **T-05, T-06** | Restock, low-stock, notifications, `/public/*` endpoints | Shop counter screen (cart), stock page, low-stock badge, bell |
| **12–15** | Bar orders, kitchen status, pay, tab, settle + **T-12** | Bar report, menu/tables CRUD | Bar POS (tables + order screen), kitchen board (poll 5 s), tab settle |
| **15–17** | Dashboard summary + series + **T-10** | Refund endpoint, audit coverage, member history timeline | Owner dashboard (cards + recharts), payments list |
| **17–19** | Enquiry endpoint + rate limit + honeypot, lead list | Security checklist pass (S-01…S-23) + **T-07, T-08, T-09** | Public site (home, plans, availability, shop, contact), phone-first |
| **19–21** | P1 items in order (social play → online orders → lead pipeline → expenses → invoices → CSV) | same | same |
| **21** | **FEATURE FREEZE.** Only bug fixes from here. Tag `v1-freeze`. | | |
| **21–23** | Bug bash with the 7 demo scenarios, fix P0 bugs, `pip-audit`/`npm audit`, README | **LAN phone test** (firewall, `ALLOWED_ORIGINS`, real client IP in rate limiter); P2 stubs only if everything green | `manifest.webmanifest` + icons (30 min), "Add to Home Screen" test, empty/loading/error states, 360 px + 768 px check, polish top 3 screens |
| **23–24** | Fresh-clone test (`docker compose up --build` on a clean machine), `pg_dump` seeded DB backup, demo rehearsal ×2 (laptop + phone), record backup video | | Slides (3–5): problem → architecture → security → demo |

**Mobile rule from hour 0:** build every public/portal component phone-first (Tailwind default = mobile, `lg:` = desktop). Retrofitting responsiveness at hour 20 is how demos break.

**Checkpoints (be strict):** H4 = login + members work. H9 = booking works with concurrency test green. H15 = bar + shop done. H17 = dashboard shows real numbers. **If a checkpoint slips by > 1 h, drop the next P1 item immediately.**

---

## 4. Anti-Hallucination Rules (read before prompting any AI)

1. **SRS is the contract.** Always paste the relevant SRS section (endpoint table + schema for that module) into the prompt. Say: *"Implement exactly this. Do not add fields, endpoints, enums, or libraries not in the spec. If something is missing, ask me instead of guessing."*
2. **One module per session.** Start a fresh AI chat per module (auth, members, booking, shop, bar, dashboard, public). Give it: stack list (SRS §1.3), conventions (§1.4), the module's spec, and the files it must touch. Don't carry a 4-hour chat history.
3. **Pin everything at H0.** Generate `requirements.txt` and `package-lock.json`, commit. Tell the AI: *"Use only installed versions. Do not upgrade packages. Tailwind is v3.4 (`tailwind.config.js` + `@tailwind` directives), React Query is v5 (object syntax `useQuery({queryKey, queryFn})`), SQLAlchemy is 2.0 style (`select()`, `Session.execute`), Pydantic is v2 (`model_validate`, `ConfigDict`)."* These version mismatches are the #1 source of AI errors.
4. **Contract-first types.** After each backend module: start the API, run `npm run gen:api`, and give the frontend AI the generated `schema.d.ts` rather than describing endpoints in words.
5. **Business logic lives in `services/`.** Routers stay thin. This keeps each AI task small and testable.
6. **Constraints in the database, not just in code.** The unique slot constraint, CHECK constraints and `stock_qty >= 0` mean a hallucinated code path still can't corrupt data.
7. **No migrations, no async, no ORM magic.** `create_all()` + `seed.py` + `reset_db.sh`. Sync SQLAlchemy. No Celery/Redis/websockets (kitchen board polls every 5 s).
8. **Money = integer paise, time = UTC.** Put this in the system prompt of every session. Wrong-unit bugs look like logic bugs and waste hours.
9. **Run, don't trust.** After every AI change: run tests / hit the endpoint with `curl` or the built-in `/docs`. Never accept "this should work".
10. **Small diffs.** Ask for one file or one endpoint at a time for critical logic (booking, stock, payments). Review these three files by a human line by line.

---

## 5. Anti-Loop Protocol

**3-Strike Rule**: If the same error survives 3 AI attempts:
1. **Stop.** Do not paste the error a 4th time.
2. Reduce to a **minimal reproduction**: the one failing request/test + the one function + the exact error text.
3. Open a **fresh AI session** and give only that + the relevant spec. Ask: *"List 3 possible causes ranked by likelihood before changing any code."*
4. Still stuck after 20 min total → **ask a teammate or simplify the feature** (cut an edge case, hard-code, defer to P1/P2). Log it in `KNOWN_ISSUES.md` and move on.

**Loop signatures to recognise**: AI alternates between two fixes · keeps rewriting the whole file · adds a new library to fix an old one · "fixes" a test by loosening the assertion · wraps everything in try/except. When you see any, apply the 3-strike rule immediately.

**Time-box table**
| Task type | Max time before escalating |
|-----------|---------------------------|
| Docker/env problem | 20 min → ask teammate / use local run without Docker |
| CSS/layout | 10 min → accept slightly ugly |
| Business-logic bug | 30 min → minimal repro, fresh session |
| CORS/cookie/auth quirk | 20 min → fall back to access token in memory + login on refresh failure |
| Chart/library issue | 15 min → render a table instead |
| Phone can't reach laptop over Wi-Fi | 15 min → check same network (not guest Wi-Fi), laptop firewall allows port 8080, correct LAN IP; else use phone hotspot / router; else demo on laptop and show a phone screen recording |
| Cookie/refresh problems on LAN IP | 20 min → confirm everything goes through the same-origin `/api` proxy and `COOKIE_SECURE=false`; fall back to re-login on token expiry |
| PWA/manifest not installing | 5 min → accept a plain home-screen shortcut; never add a service worker |

---

## 6. Prompt Templates

**Session starter (paste at the top of every new chat)**
```
You are helping build CCMS, a sports club system. Stack: FastAPI 0.115, SQLAlchemy 2.0 (sync, select() style), Pydantic v2, PostgreSQL 16, React 18 + Vite + TypeScript, Tailwind 3.4 (mobile-first classes), TanStack Query v5. One responsive web app, hosted locally with Docker Compose, plain http on LAN, PWA manifest only (no service worker, no camera APIs).
Rules: money is integer paise; datetimes UTC; all business logic in services/; routers are thin; errors use {"error":{"code","message","details"}}; no new libraries; no async DB; no migrations.
I will paste the spec for ONE module. Implement exactly it. Do not invent fields/endpoints. If anything is unclear, ask before coding.
```

**Backend module prompt**
```
Module: <name>. Spec: <paste SRS endpoints + tables + business rules>.
Files to create/modify: <list>. Existing helpers: security.require_roles, db.get_session, services/payments.record_payment.
Deliver: models, schemas, service functions, router, and pytest tests for: <test IDs>. Show the files only; no explanations longer than 5 lines.
```

**Frontend page prompt**
```
Page: <route>. Use generated types from src/api/schema.d.ts (pasted below). Use TanStack Query v5 for data, Tailwind for styling, no other UI library.
Must have loading, empty and error states. Roles allowed: <roles>. Money formatting helper: formatINR(paise).
```

**Review prompt (after each module)**
```
Review this module against the spec below. List only: (1) deviations from the spec, (2) missing authz checks, (3) places where an integer-paise or UTC rule is violated. Do not rewrite code.
```

---

## 7. Definition of Done (per module)

- [ ] All endpoints in the SRS for that module exist and match request/response shapes
- [ ] RBAC verified for at least one allowed and one forbidden role
- [ ] Relevant tests from SRS §9 pass
- [ ] Seed data includes realistic rows for this module
- [ ] Frontend page has loading/empty/error states
- [ ] Audit log entries for sensitive actions
- [ ] Committed with a clear message; `docker compose up` still works

---

## 8. Cut List (in the order you drop things when late)

1. P2 stubs → delete from nav
2. CSV export, invoices/clients
3. Expenses (payables show only unpaid tabs)
4. Lead pipeline beyond capture (keep list + status change)
5. Online shop orders (keep counter sales)
6. Social play
7. Chart on dashboard → cards only
8. Refresh-token rotation → single longer-lived access token (note as known limitation)

**Never cut**: unique-slot constraint, RBAC, ledger, seed data, `docker compose up`, the demo script.

---

## 9. Demo Script (5 minutes)

| Min | Scene | Click path | Wow factor |
|-----|-------|-----------|------------|
| 0:00 | Stranger | **On a phone:** public site → plans → availability → submit trial enquiry | Bell lights up on the laptop's staff screen |
| 0:45 | New member | Front desk → register Silver member → QR/profile | Expiry date auto-set |
| 1:30 | Busy 6 pm | Laptop grid → book member (₹400), walk-in (₹600), Gold (₹0); try a 3rd booking → rejected; **member books from phone** while front desk clicks the same slot on the laptop | Race condition handled |
| 2:30 | Gear | Counter sale with 5% discount → stock drops → low-stock badge | Same shelf online/offline *(P1: order from member portal)* |
| 3:15 | Bar | 3 tables → kitchen board → put one on tab → settle → UPI pay → daily report | No paper |
| 4:00 | Owner | Dashboard today/week/month, by source/method, receivables/payables → export CSV (also open on phone) | One source of truth |
| 4:40 | Security | Show 403 for member on staff API, audit log, rate limit/lockout | Judges' checkbox |

Practise twice. Keep a recorded video as a fallback.

---

## 10. Pre-Submission Checklist
- [ ] Fresh clone → `cp .env.example .env && docker compose up --build` works (no internet needed after images/packages are pulled)
- [ ] Only port 8080 published; `db` and `api` not reachable from the LAN
- [ ] Tested on a real phone over Wi-Fi: public site, member login, booking, shop checkout, Add to Home Screen
- [ ] Tested at 360 px and 768 px widths; no horizontal scroll on public/portal pages
- [ ] Rate limiter and lockout use the real client IP (test from two devices)
- [ ] `pg_dump` backup of seeded DB saved in `backup/`
- [ ] README: setup, demo credentials, architecture diagram, feature list (what's built vs stubbed), security measures, known limitations
- [ ] `KNOWN_ISSUES.md` honest and short
- [ ] No secrets in git history (`git log -p | grep -i secret`)
- [ ] Tests green (`pytest`)
- [ ] Seed/`reset_db.sh` tested
- [ ] Demo video recorded (include the phone screen)
- [ ] Slides: problem → solution → architecture → security → demo → what's next
