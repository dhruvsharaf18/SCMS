Attach: @docs/SRS.md @docs/PRD.md. Do NOT read reports/frontend_report.md.

TASK: Build the MEMBER portal. Allowed: existing ui/layout components, recharts, qrcode.react (display only, no camera). No other dependencies. No new routes or report files. Do not modify shared ui/layout files or any working staff screen.

ROUTES (SRS 2.4 only): /portal, /portal/book, /portal/bookings, /portal/shop, /portal/orders, /portal/social.
DATA: use the existing hooks/types/mocks pattern; add member-scoped hooks only (a member sees only their own data, SRS 3.1). Money in paise via formatMoney; times in Asia/Kolkata. Mutations can return SLOT_TAKEN, DAILY_LIMIT_REACHED, OUT_OF_STOCK, SESSION_FULL, ALREADY_JOINED.

SCREENS (phone-first, 360px, touch targets >= 44px, no horizontal page scroll):

1. /portal: greeting, membership card (tier, status ACTIVE/EXPIRING/EXPIRED, expiry date, member_code + QR for display), upcoming bookings, quick actions, my recent payments.
2. /portal/book: single-day availability using the existing CourtScheduleGrid or a phone-friendly slot list, sport filter, tier-based price per slot, confirm Drawer, "bookings today x/2" indicator, inline error codes.
3. /portal/bookings: upcoming/past tabs, cancel with confirm Modal (refund info shown).
4. /portal/social: Friday sessions with joined_count/capacity, Join/Leave, SESSION_FULL handling.
5. /portal/shop: catalogue grid, cart, member discount applied automatically, online order with PICKUP/DELIVERY (address required for DELIVERY).
6. /portal/orders: own shop orders with status chips.

RULES: loading/empty/error states everywhere. Stage per screen; report files changed in max 10 lines after each pair of screens and wait for "continue". Same error 3 times -> stop and tell me. Do not refactor working code.
