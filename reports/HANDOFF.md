# Project Handoff

## Current Branch
- **Branch**: `theme-odoo`

## Last 8 Commits
1. `ec3f0d4` - theme(rebalance): rebalance color area dominance with grey-tint canvas and white cards
2. `ae88173` - fix(auth): map login error statuses correctly and target port 8080 proxy
3. `fd42d3e` - theme(wcag): ensure strict ink text on grey and status tokens compliance across remaining views
4. `4303871` - theme(pages): replace bypassing colors across staff, public, and portal pages with Odoo palette
5. `62f63aa` - theme(components): adapt UI primitives and layout shell to Odoo theme
6. `c305083` - theme(tokens): define Odoo palette in tailwind config and index.css
7. `54a4e2b` - theme(pwa): recolor manifest and app icons to Odoo brand purple #875A7B
8. `7768c6e` - docs(report): update for F1-F8 fixes, correct mock-mode claim, record typecheck/build/audit results

## Feature Status
- **(a) Login fix (login showing "Invalid email or password." for valid accounts)**: **Done**
  - Dev proxy target routed to port 8080 where Nginx reverse proxy routes to the API container.
  - Implemented accurate HTTP error status mapping: 401 (generic invalid credentials), 423 (account lockout), 429 (rate limit exceeded), 422 (validation error), 5xx / network errors (cannot reach server).
  - Password cleared from React state in `finally` and never stored or logged.
  - All 7 seeded accounts verified with HTTP 200 OK.
- **(b) Color rebalance**: **Done**
  - Page canvas / background: `grey-tint` (`#E6E6E6`).
  - Top header, staff sidebar rail, table headers, footer, chips, and dividers: `odoo-grey` (`#8E8E8E`) with `ink` (`#141B2D`) text.
  - Cards, panels, modals, drawers, form containers, table bodies, input fills: `white` (`#FFFFFF`) with `ink` text.
  - Small accents only: `odoo-purple` (`#875A7B`) for logo mark, active nav indicators, links on white, section heading rules, and small icons (white text on purple).
  - Primary action buttons: `accent-yellow` (`#EAB14D`) fill with `ink` text. Yellow eliminated from text, links, and small icons.
  - Contrast ratios verified against WCAG AA standards (minimum 4.5:1 for normal text, 3:1 for UI components).
- **(c) All other features**: **Done**
  - F1: Post-login redirect to safe same-origin `?next=` path or role landing.
  - F2: Mock mode indicator removed; fully connected to backend API.
  - F3: Payments CSV download wired to `/api/v1/reports/payments.csv`.
  - F4: OWNER-only audit logs viewer with pagination, filtering, and export.
  - F5: Unused placeholder routes cleaned up.
  - F6: Court booking conflict plain-language error mapping.
  - F7: Social session scheduler with conflict detection and roster view.
  - F8: Court administration management (create, rename, deactivate, sport filter).

## Demo Accounts
- `owner@club.test` (Role: OWNER)
- `manager@club.test` (Role: MANAGER)
- `desk@club.test` (Role: FRONT_DESK)
- `bar@club.test` (Role: BAR_STAFF)
- `member1@club.test` (Role: MEMBER)
- `member2@club.test` (Role: MEMBER)
- `member3@club.test` (Role: MEMBER)
- **Password**: `Club@12345`
