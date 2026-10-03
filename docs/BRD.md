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
| Today | Consequence |
|-------|-------------|
| Bookings via WhatsApp/phone | Double bookings, front-desk overload, no self-service |
| Members in Excel | No expiry tracking, no plan entitlements, no history |
| Paper bar receipts and tabs | Lost tabs, kitchen confusion, no daily bar earnings |
| Shop stock unknown | Stock-outs, no low-stock warning, no online ordering |
| No website | Invisible to new customers; enquiries lost |
| No consolidated numbers | Owner cannot answer "what did we earn, from where, what do we owe?" |

### 1.3 Business Objectives
- **O-1**: Eliminate double bookings and phone-based availability checks.
- **O-2**: Make every member instantly recognisable with plan, expiry and history.
- **O-3**: Apply plan-based pricing and discounts automatically (no staff memory).
- **O-4**: Track all revenue (courts, shop, bar) in one ledger by method and source.
- **O-5**: Capture every online enquiry and drive it to follow-up/quote/membership.
- **O-6**: Give the owner a real-time view of today / week / month, receivables and payables.

### 1.4 Success Metrics (KPIs)
| Metric | Target | Measurement |
|--------|--------|-------------|
| Double bookings | 0 | DB unique constraint + concurrency test (100 parallel requests → 1 success) |
| Time to book a court at front desk | < 30 s | Demo stopwatch |
| Stock oversell | 0 | Concurrency test on stock decrement |
| Bar order → kitchen visibility | < 5 s | Kitchen screen auto-refresh (polling 5 s) |
| Lead captured → visible to staff | < 10 s | In-app notification appears |
| Owner dashboard load | < 2 s | Seeded demo dataset |
| Revenue reconciliation | Dashboard total = sum of ledger rows | Automated test |
| Mobile usability | Public site, member booking and shop checkout usable at 360 px width | Test on a real phone over LAN |
| Setup effort | Fresh machine → running app with one command | `docker compose up --build` on a clean clone |

---

## 2. Stakeholder Analysis

| Stakeholder | Role | Interest |
|-------------|------|----------|
| Owner | Primary | Revenue visibility, payables, trust in numbers, sharing reports |
| Manager | Primary | Pricing, staff shifts, leave approval, social-play setup, leads |
| Front-desk staff | Primary | Fast member lookup, walk-in/phone booking, shop counter sales |
| Bar/cafeteria staff | Primary | Fast order entry, table tracking, tabs, settling bills |
| Members (Gold/Silver/Junior) | Primary | Self-service booking, discounts, ordering gear from home |
| Prospective visitors | Secondary | See plans, prices, availability, shop; submit enquiry/trial request |
| Hackathon judges | Secondary | Completeness, working demo, security, code quality |

---

## 3. Business Requirements

### 3.1 Functional Requirements (Business Level)

**Membership (Scene: new member walks in)**
- BR-001: The system shall register a member with identity details and one of three plans (Gold, Silver, Junior).
- BR-002: The system shall record membership start/end dates and flag memberships expiring within 7 days without anyone remembering.
- BR-003: The system shall let any staff member find a member by name, phone or member code (QR) and see bookings, purchases, invoices and plan.
- BR-004: The system shall define per-plan entitlements: court rate tier, shop discount %, bar discount %.

**Court booking (Scene: busy 6 pm)**
- BR-005: The system shall show real-time court availability in 30-minute slot steps.
- BR-006: A booking shall last exactly 1 hour and may start on any half hour.
- BR-007: A member shall have at most 2 exclusive bookings per day.
- BR-008: Price shall depend on plan (Gold free, Silver/Junior discounted, walk-in full price).
- BR-009: The system shall allow booking by members (self-service) and by staff (walk-in/phone).
- BR-010: The system shall support cancellation with a refund rule and release the slot.
- BR-011: The system shall never allow two exclusive bookings on the same court at overlapping times.
- BR-012: The system shall support Friday-night social play where many people share one court up to a capacity.

**Shop (Scene: gearing up)**
- BR-013: The system shall maintain a product catalogue (rackets, balls, shoes, accessories, apparel) with stock.
- BR-014: Counter sales and online orders shall draw from the same stock.
- BR-015: The system shall alert when stock ≤ reorder level.
- BR-016: Members shall order online for pickup or delivery; plan discount applies automatically.

**Bar (Scene: after the match)**
- BR-017: Staff shall create orders by table or by member, and the kitchen shall see them on a live screen.
- BR-018: Member discount shall apply automatically.
- BR-019: Members may run a tab and settle before leaving.
- BR-020: Guests pay by cash, card or UPI; all payments are recorded with staff identity.
- BR-021: The owner shall see bar earnings per day and per payment method.

**Online presence (Scene: stranger finds the club)**
- BR-022: A public website shall show club info, plans and prices, this week's free slots and shop items.
- BR-023: A visitor shall submit an enquiry or trial request; it shall create a lead and notify staff.
- BR-024: Leads shall move through NEW → CONTACTED → QUOTED → WON/LOST with notes, a quote, and conversion to a member.

**Finance and operations (Scene: owner at month end)**
- BR-025: Every payment from courts, shop, bar and memberships shall go into one ledger with source, method, tax.
- BR-026: The owner shall see revenue for today/week/month by source and method, plus receivables and payables.
- BR-027: The system shall issue invoices for memberships and business clients.
- BR-028: The system shall record expenses and show unpaid obligations.
- BR-029: The system shall manage employees, shifts, leave requests/approval and monthly payroll records.
- BR-030: The system shall produce a tax-collected summary and CSV exports for sharing.

**Access & devices**
- BR-033: The system shall be usable on phones, tablets and desktops through a browser without installing an app store application; phones may add it to the home screen.
- BR-034: The system shall run fully locally (no external hosting or third-party online services required).
- BR-035: Staff shall be able to identify a member by typing or pasting the member code, phone or name (QR is shown on the member profile; camera scanning is out of scope).

**Security (hackathon requirement)**
- BR-031: Access shall be role-based; members can only see their own data.
- BR-032: Sensitive actions (refunds, price changes, role changes, exports) shall be audit-logged.

### 3.2 Business Rules

| Rule ID | Rule | Impact |
|---------|------|--------|
| BRL-01 | Court session = 60 min; start times on :00 or :30 only; within club hours 06:00–22:00 (last start 21:00). | Booking, availability |
| BRL-02 | Max 2 CONFIRMED/COMPLETED exclusive bookings per member per IST calendar day. | Booking |
| BRL-03 | Expired or cancelled membership → member books at WALK-IN rate and gets no discounts. | Pricing, shop, bar |
| BRL-04 | Court rate tiers: GOLD 0, SILVER and JUNIOR discounted, WALKIN full (configurable per sport). | Pricing |
| BRL-05 | Junior plan only for age < 18 at signup/renewal. | Member registration |
| BRL-06 | Price is snapshotted on the booking/order at creation; later plan or price changes never alter past records. | Booking, orders, finance |
| BRL-07 | Free cancellation ≥ 2 h before start (refund); later = no refund, slot released. | Booking, finance |
| BRL-08 | Social play: capacity enforced; Gold joins free; social joins do not count toward the daily limit. | Social play |
| BRL-09 | Stock can never go below zero; online orders reserve stock at placement; cancel restores. | Shop |
| BRL-10 | Member discount % applies to shop and bar subtotals by plan; discount is rounded to whole paise. | Shop, bar |
| BRL-11 | A tab = unpaid bar orders linked to a member; must be settled (payment recorded) before it's closed. | Bar, finance |
| BRL-12 | Revenue = payments with status COMPLETED. Refunded payments are excluded. | Dashboard |
| BRL-13 | Receivables = unpaid bar tabs + unpaid invoices. Payables = unpaid expenses + pending payroll. | Dashboard |
| BRL-14 | Only OWNER/MANAGER can change prices, plans, refunds above ₹0 after the cancellation window, payroll, exports. | RBAC |

---

## 4. Data Flow Diagram

```
 Visitor ──► [Public Site] ──enquiry──► [Leads] ──notify──► [Staff Bell]
    │                                       │ convert
    ▼                                       ▼
 Member ──► [Member Portal] ──► ┌───────────────────────────┐
 Staff  ──► [Staff Console] ──► │      CCMS API (FastAPI)   │
                                │  Auth/RBAC · Business Logic│
                                └─────┬──────────┬──────────┘
                                      │          │
        ┌────────────┬────────────┬───┴────┬─────┴──────┐
        ▼            ▼            ▼        ▼            ▼
   [Members &   [Courts &    [Shop &   [Bar POS &   [HR/Expenses/
    Plans]       Bookings]    Stock]    Kitchen]     Invoices]
        │            │            │        │            │
        └────────────┴─────► [PAYMENTS LEDGER] ◄────────┘
                                   │
                                   ▼
                        [Owner Dashboard / CSV / Tax summary]
                                   ▲
                         [Audit Log] (sensitive actions)
```

---

## 5. Process Flows

### 5.1 Court booking
```
START ─► choose date/sport ─► system shows free slots
  │
  ▼
select court + start time
  │
  ├─ member inactive? ─ YES ─► price at WALK-IN tier (members only: warn)
  ├─ in past / off-grid / outside hours? ─ YES ─► 422 error
  ├─ member already has 2 bookings that day? ─ YES ─► 409 DAILY_LIMIT_REACHED
  ▼
BEGIN TRANSACTION
  lock member row → insert booking → insert 2 court_slots rows
  ├─ unique violation (slot taken)? ─► ROLLBACK ─► 409 SLOT_TAKEN ─► show refreshed grid
  ▼
COMMIT ─► price>0? ─► record payment (staff: cash/card/UPI | member: mock online) or mark UNPAID (pay at desk)
  ▼
END (confirmation + notification)
```

### 5.2 Shop order (counter or online)
```
START ─► add items ─► apply plan discount ─► for each item:
   UPDATE stock WHERE stock ≥ qty ─ 0 rows? ─► 409 OUT_OF_STOCK (rollback all)
 ─► create order (+stock_movements) ─► pay now (counter) / pay online (mock) / pay on pickup
 ─► status PLACED → READY → COMPLETED (or OUT_FOR_DELIVERY → COMPLETED) / CANCELLED (stock restored)
 ─► stock ≤ reorder level? ─► low-stock alert on dashboard + notification
```

### 5.3 Bar order
```
START ─► pick table or member ─► add items ─► discount auto-applied ─► SEND TO KITCHEN
  ─► kitchen: NEW → PREPARING → READY → SERVED
  ─► bill: member tab? ─ YES ─► stays UNPAID (tab) ─► later "Settle tab" ─► payment
                       ─ NO  ─► pay Cash/Card/UPI ─► PAID ─► table freed
END
```

### 5.4 Lead handling
```
Visitor submits form ─► lead NEW + notification to MANAGER/FRONT_DESK
 ─► staff contacts ─► CONTACTED ─► create quote ─► QUOTED
 ─► accepted ─► "Convert to member" (prefills member form, creates membership + invoice) ─► WON
 ─► declined ─► LOST (reason note)
```

---

## 6. Risk Analysis

| Risk | Impact | Mitigation |
|------|--------|------------|
| Scope too large for 24 h | H | Three scope tiers (Playbook §2); hard feature freeze at hour 21; P2 items may be stubs |
| AI coding assistant hallucinates endpoints/fields | H | SRS is the single source of truth; OpenAPI → generated TS types; one module per AI session |
| AI loops on a bug | H | 3-strike rule, fresh session, minimal repro (Playbook §5) |
| Double-booking race conditions | H | DB unique constraint + transaction + concurrency test |
| Security gaps judged | M | Security checklist (SRS §7) built in from hour 1, not bolted on |
| Integration drift between frontend and backend | M | Generated types, shared enums, contract-first |
| Demo day failure (env, network) | H | Docker Compose one-command start, seeded data, `reset_db.sh`, recorded backup video |
| Phones cannot reach the laptop over Wi-Fi (firewall, isolated guest network) | M | Test at H21; allow the web port in the OS firewall; bring a phone hotspot or a small router as backup; fall back to laptop-only demo + phone screen recording |
| Users expect camera QR scanning or offline mode | L | Explicitly out of scope; typed-code lookup works; documented in README |
| Misread requirements (e.g. sports list inconsistency) | L | Sport is data, not code; assumptions documented |
| Money rounding errors | M | Integer paise everywhere; unit tests for discount/tax |

---

## 7. Constraints
- **Technical**: 24 h build; **locally hosted only** (Docker Compose on one laptop, PostgreSQL 16, no cloud/domain/HTTPS); no real payment gateway, SMS or email; plain-http LAN means browsers block camera access and full PWA install, so those are out of scope; single DB.
- **Business**: Rules BRL-01 … BRL-14 cannot be violated.
- **Regulatory**: Indian context (INR, GST) assumed; no card data stored (PCI out of scope because payments are simulated); minimal PII (name, phone, email, DOB for juniors). A privacy note is shown on forms.

## 8. Assumptions
See `DOCUMENTATION_CONTEXT.md` assumptions A-01 … A-18. Key ones: single branch, simulated payments, in-app notifications only, seed pricing, 2/day limit scoped to exclusive member bookings, one responsive web app with PWA-lite, local-only hosting, no camera QR scanning.

## 9. Scope Boundary (honest version)
**Fully built (P0)**: auth/RBAC, members/plans, court booking engine, shop + stock, bar POS + kitchen + tabs, payment ledger, owner dashboard, public site + enquiry.
**Built if time allows (P1)**: social play, online shop orders with delivery, lead pipeline with quotes/convert, invoices, expenses, CSV export.
**Minimal (P2)**: employees/shifts/leave/payroll, tax summary.
**Mobile approach**: responsive web + home-screen shortcut (PWA-lite: manifest and icons only).
**Not built**: real payments, SMS/email, courier tracking, native/hybrid mobile apps, offline mode, camera QR scanning, push notifications, cloud hosting, multi-branch, photo upload, server-side PDF, statutory payroll, accounting-grade GST filing.
