# Documentation Context: Sports Club Management System ("Champions Club")

## Project Overview
- **Name**: Champions Club Management System (CCMS)
- **Description**: One platform for courts, members, gear shop, bar/cafeteria, public website + leads, and owner finance dashboard.
- **Started**: 2026-10-03
- **Constraint**: 24-hour hackathon, AI-assisted coding, security features required, "complete deliverable"
- **Deliverable**: ONE responsive web app (public site + member portal + staff console) that can be added to a phone's home screen (PWA-lite), **hosted entirely locally** (Docker Compose + PostgreSQL), demoed on laptop + phones over the same Wi-Fi. No native apps, no cloud hosting.
- **Status**: Documents complete (revision 2: local-only, responsive web app + PWA-lite), ready for build

## Research Notes
- Web research skipped on purpose (time-boxed). Stack chosen from mainstream, well-documented tools that AI coding assistants know well.
- Library versions in SRS §1.3 are known-good minimums. **Pin to whatever `pip install` / `npm install` actually resolves in Hour 0 and write it into the lockfile.** Do not let the AI "upgrade" later.
- GST rates in seed data are placeholders. Verify with an accountant before any real use.

## Source Document Issues Found
1. Title says "tennis, padel and badminton"; club description says "tennis and cricket courts". → Courts have a `sport` field; seed includes TENNIS, PADEL, BADMINTON, CRICKET_NET. No code depends on a fixed list.
2. "Sessions last an hour, slot opens every half hour" → 1-hour bookings that may start at :00 or :30 (overlapping start times, so each booking occupies two 30-min slots).
3. "Members pay less than walk-ins, or nothing at all" → exact prices not given. Assumed (see A-05).
4. "Share the numbers" → implemented as CSV export + print-friendly report, not live share links.

## Assumptions (overrule any of these before build starts)
| ID | Assumption |
|----|-----------|
| A-01 | Single club, single branch, single currency (INR). Money stored as integer paise. |
| A-02 | Timezone Asia/Kolkata. Stored UTC, displayed IST. Club hours 06:00–22:00, last start 21:00. |
| A-03 | Roles: OWNER, MANAGER, FRONT_DESK, BAR_STAFF, MEMBER. Shop counter sales are done by FRONT_DESK. |
| A-04 | Gold = free courts; Silver and Junior = discounted court rates; walk-ins pay full rate. |
| A-05 | Seed pricing (INR/hour, tennis): Walk-in 600, Silver 400, Junior 250, Gold 0. Shop/bar discount: Gold 15%, Silver 5%, Junior 10%. |
| A-06 | "Max twice a day" applies to **members' exclusive bookings** per calendar day (IST). Cancelled bookings don't count. Social-play joins don't count. Walk-ins (non-members) are not limited. |
| A-07 | Free cancellation up to 2 hours before start (paid bookings refunded). Later cancellations free the slot but are not refunded. |
| A-08 | Social play: Friday 18:00–22:00 on designated courts, capacity per session (default 8). Created by MANAGER; members join individually. Gold joins free, others pay a flat fee. |
| A-09 | Payments are **simulated**. Cash/Card/UPI are recorded by staff; "online" = mock checkout that always succeeds. No real gateway, no card data ever stored. |
| A-10 | No real email/SMS. Notifications are in-app (bell icon) + server log line. |
| A-11 | Membership expiry is computed on read (no cron). Expiring-soon = within 7 days. |
| A-12 | Prices are tax-inclusive. Tax = amount × rate / (100 + rate). Seed rates: courts 18%, shop 18%, bar 5%, memberships 18%. |
| A-13 | Invoices are printable HTML pages (browser Print → PDF). No server-side PDF generation. |
| A-14 | Payroll = monthly record per employee (base − manual deductions). No statutory compliance (PF/TDS). |
| A-15 | Online shop orders require a logged-in member. Delivery = address captured + status updates; no courier integration. |
| A-16 | **Deliverable = one responsive web app.** Phone-first layout for public site and member portal (≥ 360 px); staff console targets tablet/desktop (≥ 768 px). Installable as a home-screen shortcut via a web manifest ("PWA-lite"). No offline mode, no service worker, no native/hybrid app. |
| A-17 | **Everything runs locally**: `docker compose up` (PostgreSQL + API + web). No cloud, no domain, no HTTPS, no Caddy. Phones reach the app at `http://<laptop-LAN-IP>:<port>` on the same Wi-Fi. |
| A-18 | **No camera QR scanning.** Member QR is displayed on the profile; staff look members up by typing/pasting the code or phone (a USB barcode scanner that types like a keyboard would also work). Reason: browsers block camera access on plain-http LAN origins. Optional upgrade: local HTTPS via `mkcert` only if time remains. |

## Tech Stack Decisions
- **Backend**: FastAPI + SQLAlchemy 2.0 (**sync**, not async: fewer subtle bugs for AI-generated code) + PostgreSQL 16.
- **Frontend**: React 18 + Vite + TypeScript + Tailwind 3.4 (not v4, avoids config churn) + TanStack Query v5.
- **Contract**: FastAPI OpenAPI → `openapi-typescript` generates frontend types, so backend/frontend can't drift.
- **No Alembic**: `create_all()` + `seed.py` + `reset_db.sh`. Migrations are a time sink in 24h.
- **IDs**: integer PKs (not UUID) for simplicity; every endpoint enforces ownership checks anyway.
- **Double-booking prevention**: DB-level `UNIQUE(court_id, slot_start)` on a `court_slots` table. The database enforces it, not application code.
- **Hosting**: local only. Dev: `docker compose up db api` + Vite dev server (hot reload). Demo: `docker compose up --build` runs `db`, `api`, and `web` (nginx serving the built bundle and proxying `/api`). Only the `web` port is published to the LAN; `db` and `api` are internal.
- **Same-origin by design**: phones load the app and call `/api` through the same origin (nginx/Vite proxy), so CORS and the SameSite=Strict refresh cookie work over a LAN IP without HTTPS.
- **Client IP behind the proxy**: nginx/Vite forward `X-Forwarded-For`; uvicorn runs with `--proxy-headers` so rate limiting and lockouts see the real client IP, not the proxy's.
- **PWA-lite**: `manifest.webmanifest` + icons + theme colour only. Skip service workers (common source of AI loops and stale-cache bugs).
- **Cookie flag**: `COOKIE_SECURE=false` locally (plain http); must be `true` if ever deployed behind HTTPS.

## Document Status
- [x] BRD: docs/BRD.md
- [x] PRD: docs/PRD.md
- [x] SRS: docs/SRS.md
- [x] AI Build Playbook: docs/AI_BUILD_PLAYBOOK.md (extra: timeline, scope tiers, anti-loop rules)

## Next Steps
→ cto-architect / orchestrator-master: confirm assumptions A-01…A-18, then start at Playbook Hour 0.

## Changelog
| Date | Change |
|------|--------|
| 2026-10-03 | Initial analysis, BRD/PRD/SRS/Playbook generated |
| 2026-10-03 | Revision 2: deliverable defined (responsive web app + PWA-lite), local-only hosting, LAN demo, no camera scanning, no HTTPS/Caddy; added A-16…A-18, F-16, S-22, local deployment section |
