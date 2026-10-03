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

| Face | Primary device | Layout target |
|------|----------------|---------------|
| Public site | Phone | 360 px and up |
| Member portal | Phone | 360 px and up |
| Staff console (front desk, shop) | Desktop/laptop | 1024 px and up (usable at 768 px) |
| Bar POS + kitchen board | Tablet | 768 px and up, large touch targets |
| Owner dashboard | Laptop or phone | Responsive cards, readable on 360 px |
1. **Public site**: club info, plans/prices, this week's availability, shop catalogue, enquiry/trial form.
2. **Member portal**: book courts, join social play, order gear, see membership/history.
3. **Staff console**: front desk, bar POS + kitchen screen, shop/stock, leads, finance dashboard, HR basics. Menu items shown by role.

### 1.3 Target Users
- Primary: front desk, bar staff, members, owner/manager.
- Secondary: prospective visitors.

---

## 2. User Personas

### 2.1 Meera, Owner
- **Age**: 45–55 · **Tech Level**: Medium
- **Goal**: Know earnings, sources and obligations without asking anyone.
- **Pain Points**: Numbers scattered; can't tell if the club is profitable.
- **Needs**: One dashboard (today/week/month), exports to share with her accountant.

### 2.2 Arjun, Front Desk
- **Age**: 22–30 · **Tech Level**: Medium
- **Goal**: Handle a walk-in, a phone call and WhatsApp-style requests at 6 pm without errors.
- **Pain Points**: Calling around to check courts, remembering who is on which plan.
- **Needs**: Fast member search by name, phone or typed code, big availability grid, quick walk-in booking, counter sales.

### 2.3 Sana, Bar Staff
- **Age**: 20–28 · **Tech Level**: Medium
- **Goal**: Take 20 orders at once with no lost tabs.
- **Pain Points**: Paper orders, kitchen asking "who ordered what", manual discounts.
- **Needs**: Table-based order screen, kitchen board, tab and settle, closing report.

### 2.4 Karan, Gold Member
- **Age**: 30–40 · **Tech Level**: High
- **Goal**: Book a court and order shoes from his phone.
- **Needs**: Mobile-friendly portal, see his bookings/orders/expiry, automatic discounts.

### 2.5 Isha, Visitor
- **Age**: 20–35 · **Tech Level**: High
- **Goal**: Find a nearby place to play and book a trial.
- **Needs**: Clear plans/prices, see what's free, simple enquiry form.

---

## 3. Product Features

Legend: **[P0]** must ship · **[P1]** ship if P0 done · **[P2]** minimal/stub OK.

### F-01 Authentication & Roles [P0]
**User Story**: As a staff member or member, I want to log in securely so that I only see what my role permits.
**Acceptance Criteria**:
- [ ] Login with email + password; passwords hashed (argon2); JWT access token (15 min).
- [ ] 5 failed logins → account locked 15 min; rate limit on login.
- [ ] Roles OWNER, MANAGER, FRONT_DESK, BAR_STAFF, MEMBER enforced on every endpoint (403 otherwise).
- [ ] A member requesting another member's data gets 404/403.
- [ ] Logout invalidates refresh token.

### F-02 Member Registration & Plans [P0]
**User Story**: As front desk, I want to register a member with a plan so that entitlements apply automatically.
**Acceptance Criteria**:
- [ ] Create member with name, phone, email, DOB, emergency contact, plan; member code `CC-000123` generated.
- [ ] Junior plan rejected if age ≥ 18.
- [ ] Plan defines court tier, shop %, bar %, duration, fee. OWNER/MANAGER can edit plans.
- [ ] Membership has start/end; status ACTIVE / EXPIRING (≤ 7 days) / EXPIRED computed on read.
- [ ] Renew and change-plan actions create a new membership row and a payment/invoice.
- [ ] Member profile shows QR (encodes member code), plan, expiry, bookings, shop orders, bar orders, payments.
- [ ] Search by name/phone/code returns results in < 1 s; typing or pasting a code (e.g. `CC-000011`) opens the profile directly. A USB barcode scanner that types like a keyboard also works. No camera scanning.
- [ ] "Expiring in 7 days" list on dashboard and members page.

### F-03 Court Availability & Booking [P0]
**User Story**: As a member or front desk, I want to see free slots and book one so that nobody double-books.
**Acceptance Criteria**:
- [ ] Availability grid per date and sport: courts as rows, 30-min slots as columns, states FREE / BOOKED / SOCIAL / PAST.
- [ ] A start time is bookable only if it and the next 30-min slot are both free.
- [ ] Booking is 1 h; start on :00 or :30; inside 06:00–21:00 start; not in the past.
- [ ] Price computed from the booker's tier; Gold = ₹0 (payment status WAIVED); price shown **before** confirming.
- [ ] Member limit: third exclusive booking on a day → 409 `DAILY_LIMIT_REACHED`.
- [ ] 100 concurrent requests for the same slot → exactly 1 succeeds, rest 409 `SLOT_TAKEN`.
- [ ] Staff can book for a member or for a walk-in (guest name + phone); source recorded (FRONT_DESK/PHONE/WEB).
- [ ] Cancel: ≥ 2 h before → refund recorded; < 2 h → no refund; slot freed in both cases; reason stored.
- [ ] Changing a member's plan does not change prices of existing bookings.
- [ ] Staff can mark COMPLETED / NO_SHOW.

### F-04 Friday Social Play [P1]
**User Story**: As a member, I want to join a social session on Friday night so that I can play without a full-court booking.
**Acceptance Criteria**:
- [ ] MANAGER creates a social session (court, start, end, capacity, fee); the court's slots in that window become SOCIAL (not bookable).
- [ ] Creating a session fails if any slot is already booked (409 with the conflicting booking listed).
- [ ] Members/walk-ins join until capacity; the (capacity+1)th gets 409 `SESSION_FULL`.
- [ ] Gold joins free; others pay the fee; leaving frees the spot.
- [ ] Participant list visible to staff.

### F-05 Gear Shop & Stock [P0]
**User Story**: As front desk, I want to sell items and always know the stock so that we never oversell or run out unnoticed.
**Acceptance Criteria**:
- [ ] Product CRUD (OWNER/MANAGER); categories RACKET/BALL/SHOE/ACCESSORY/APPAREL; variant text (e.g. size).
- [ ] Counter sale: search product → add to cart → pick member (optional) → discount auto-applied → pay Cash/Card/UPI → stock decremented.
- [ ] Qty > stock → 409 `OUT_OF_STOCK`; nothing partially saved.
- [ ] Stock movements logged (SALE, RESTOCK, CANCEL, ADJUST) with user.
- [ ] Items with stock ≤ reorder level appear on a Low-stock list and dashboard badge.
- [ ] Restock action (+qty) by MANAGER.

### F-06 Online Shop Orders [P1]
**User Story**: As a member, I want to order shoes from home for pickup or delivery so that I save time.
**Acceptance Criteria**:
- [ ] Member portal shop with cart; discount shown.
- [ ] Choose PICKUP or DELIVERY (address required for delivery).
- [ ] Order reserves stock immediately; same stock pool as counter.
- [ ] Mock online payment or "pay at pickup".
- [ ] Staff update status PLACED → READY → (OUT_FOR_DELIVERY) → COMPLETED; cancel restores stock.

### F-07 Bar POS, Kitchen & Tabs [P0]
**User Story**: As bar staff, I want to take orders by table and settle bills so that nothing gets lost.
**Acceptance Criteria**:
- [ ] Menu CRUD (MANAGER); availability toggle.
- [ ] Open order for a table (or member); add/remove items before sending; send to kitchen.
- [ ] Kitchen board shows NEW/PREPARING/READY orders, auto-refresh every 5 s; staff advance status.
- [ ] Member discount auto-applied from plan.
- [ ] Pay by Cash/Card/UPI → order PAID, payment recorded with staff id; table becomes free.
- [ ] "Put on tab" for members: order stays UNPAID under the member; "Settle tab" pays all selected unpaid orders with one payment per order or one grouped payment.
- [ ] Table view shows free/occupied tables with running total.
- [ ] Daily bar report: revenue total, by payment method, by staff, order count, outstanding tabs.

### F-08 Public Website [P0]
**User Story**: As a visitor, I want to see plans, prices, free slots and the shop so that I can decide to visit.
**Acceptance Criteria**:
- [ ] No login needed. Pages: Home, Plans & Prices, Availability (next 7 days), Shop, Contact/Trial form.
- [ ] Public availability shows only FREE/BUSY, never names or phone numbers.
- [ ] Mobile responsive; page loads without JS errors.
- [ ] Form validation + honeypot field + rate limit (30 req/min/IP).

### F-09 Lead Management [P0 capture / P1 pipeline]
**User Story**: As a manager, I want every enquiry tracked so that I can follow up and win members.
**Acceptance Criteria**:
- [ ] [P0] Submitting the form creates a NEW lead and a notification for MANAGER and FRONT_DESK.
- [ ] [P1] Status flow NEW → CONTACTED → QUOTED → WON / LOST; notes timeline; assignee.
- [ ] [P1] Create a quote (amount, description, valid until); printable.
- [ ] [P1] "Convert to member" opens the member form prefilled and marks lead WON.

### F-10 Payments Ledger & Owner Dashboard [P0]
**User Story**: As the owner, I want one view of earnings and obligations so that I know how the club is doing.
**Acceptance Criteria**:
- [ ] Every paid booking, shop order, bar order, membership writes one `payments` row (source, method, amount, tax).
- [ ] Dashboard periods: Today / This week / This month. Cards: total revenue; by source (Courts, Shop, Bar, Memberships); by method (Cash, Card, UPI, Online).
- [ ] Revenue line/bar chart per day for the period.
- [ ] Receivables (unpaid tabs + unpaid invoices) and Payables (unpaid expenses + pending payroll).
- [ ] Court utilisation % (booked slots ÷ available slots), new members, new leads, low-stock count, expiring memberships.
- [ ] Dashboard total equals the sum of ledger rows (automated test).
- [ ] [P1] CSV export of payments for a date range (OWNER/MANAGER; audit-logged); print-friendly report.
- [ ] [P2] GST collected summary per month.

### F-11 Invoices & Business Clients [P1]
**User Story**: As a manager, I want to invoice memberships and corporate clients so that billing is formal.
**Acceptance Criteria**:
- [ ] Client CRUD (company, contact, GSTIN).
- [ ] Invoice with lines, tax, due date, number `INV-2026-0001`; statuses DRAFT/SENT/PAID/VOID.
- [ ] Marking paid records a payment in the ledger.
- [ ] Printable invoice page.

### F-12 Expenses [P1]
- [ ] Record expense (category, vendor, amount, PAID/UNPAID, due date); unpaid appear in Payables.

### F-13 Staff, Shifts, Leave, Payroll [P2]
- [ ] Employees list; weekly shifts by area; leave request (employee/staff) → approve/reject (MANAGER).
- [ ] Monthly payroll run creates one row per employee (base − deductions = net); mark PAID creates an expense row.

### F-14 Notifications [P0 minimal]
- [ ] Bell icon with unread count; events: new lead, low stock, membership expiring, new online order, leave request.

### F-16 Responsive Layout & PWA-lite [P0]
**User Story**: As a member or visitor on my phone, I want the site to fit my screen and be one tap away from my home screen so that I use it like an app.
**Acceptance Criteria**:
- [ ] Public site and member portal have no horizontal scroll at 360 px; tap targets ≥ 44 px; bottom navigation in the member portal on mobile.
- [ ] Staff console collapses its sidebar to a drawer below 1024 px; tables become scrollable or card lists on small screens.
- [ ] Bar POS and kitchen board work on a 768 px tablet with large buttons.
- [ ] `manifest.webmanifest` (name, short_name, icons 192/512, theme colour, `display: standalone`, `start_url: /`) and `<meta name="viewport">` are present, so "Add to Home Screen" gives an icon.
- [ ] No service worker and no offline mode (explicitly out of scope).
- [ ] App opens from a phone at `http://<laptop-LAN-IP>:<port>` on the same Wi-Fi (verified at H21).

### F-15 Security & Audit [P0]
- [ ] Items in SRS §7 checklist implemented; audit log viewable by OWNER.

---

## 4. Feature Prioritization

| Feature | Priority | Build window |
|---------|----------|--------------|
| F-01 Auth & RBAC | MUST | H1.5–4 |
| F-02 Members & plans | MUST | H1.5–4 |
| F-03 Court booking | MUST | H4–9 |
| F-05 Shop & stock (counter) | MUST | H9–12 |
| F-07 Bar POS & kitchen & tabs | MUST | H12–15 |
| F-10 Ledger & dashboard | MUST | H15–17 |
| F-08 Public site + F-09 lead capture + F-14 notifications | MUST | H17–19 |
| F-16 Responsive layout (built in from H0) + PWA manifest (30 min) + LAN phone test | MUST | H0 (mobile-first components) · H21–22 (manifest, phone test) |
| F-04 Social play | SHOULD | H19–20.5 |
| F-06 Online shop orders | SHOULD | H20.5–22 (cut first if late) |
| F-09 pipeline, F-11 invoices, F-12 expenses, CSV export | SHOULD | fill remaining time in this order |
| F-13 HR/payroll, GST summary | COULD | stub UI + basic CRUD only |
| Real payments, SMS/email, mobile apps, multi-branch | WON'T | Phase 2 |

(Full hour-by-hour plan: `AI_BUILD_PLAYBOOK.md`.)

---

## 5. Demo Scenarios (acceptance = these 7 run end-to-end without errors)

1. **New member**: front desk registers Silver member → QR/profile → expiry date shown.
2. **Busy evening** (member books from a **phone**, front desk from the laptop): grid at 18:00; book for a member (₹400), a walk-in (₹600), a Gold member (₹0); third booking for the same member that day is rejected; two browsers click the same slot → one wins.
3. **Friday social**: manager creates session; 8 join; 9th rejected. *(P1)*
4. **Gear**: racket sold at counter with Silver 5% discount; stock drops; low-stock badge appears. Member orders shoes online for pickup *(P1)*.
5. **Bar**: 3 tables order; kitchen board updates; one tab settled; one paid by UPI; daily bar report matches.
6. **Stranger**: visitor submits trial enquiry → bell notification → lead appears. *(Quote/convert is P1.)*
7. **Owner**: dashboard shows today/week/month by source and method; CSV export *(P1)*.

---

## 6. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Demo scenarios passing | 7/7 (P0 scenes 1,2,4-counter,5,6-capture,7 minimum) | Dry run at H22 |
| Critical automated tests green | ≥ 8 (SRS §9) | `pytest` |
| Security checklist items done | ≥ 90% | SRS §7 checklist |
| Cold start to usable app | `docker compose up` < 3 min | Fresh clone test |
| Works on a real phone over LAN | Public site, member booking, shop checkout usable at 360 px | Phone test at H21 |
| Open P0 bugs at H22 | 0 | Bug list |

## 7. Out of Scope
Cloud hosting/domain/HTTPS, real payment gateway, SMS/WhatsApp/email delivery, push notifications, offline mode/service workers, camera QR scanning, courier tracking, native or hybrid mobile apps, coaching/classes, tournaments/leagues, multi-branch, loyalty points, photo upload, face/ID recognition, accounting-grade GST filing, statutory payroll.
