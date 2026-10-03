continue

PAIR 2: /portal/bookings and /portal/social. Same rules as before: use the existing hooks/types/store pattern; do not modify shared ui/layout files or any working screen; no new dependencies; no report or tracking files except updating tasks.md; max 10 lines of reporting; same error 3 times -> stop and tell me.

1. /portal/bookings

- PillTabs: Upcoming / Past. A member sees only their own bookings.
- Each row: court, sport, date and time in Asia/Kolkata, price in paise via formatMoney, StatusChip for status (CONFIRMED / CANCELLED / COMPLETED / NO_SHOW) and payment_status (PAID / UNPAID / WAIVED / REFUNDED).
- Cancel is available only for CONFIRMED bookings that have not started. Confirm Modal with an optional reason. Before confirming, show the refund rule from SRS 4.3: if the booking is PAID and starts at least 2 hours from now, it is refunded in full; otherwise there is NO refund. Compute that same rule in the mock cancel mutation and return { id, status, refunded, refund_paise }.
- Mock cancel errors: ALREADY_CANCELLED, BOOKING_STARTED. Show them inline in the Modal, not as a crash.
- After cancel, the booking moves out of Upcoming, and the "bookings today x/2" counter on /portal/book must update (cancelled bookings do not count). Invalidate the right React Query keys.
- WAIVED (free Gold) bookings never show a refund amount.

2. /portal/social

- List Friday social sessions from useSocialSessions: title, court, date/time (IST), joined_count / capacity as a progress bar, fee (show "Free" when 0 or when the member is GOLD), and a Join or Leave button depending on whether the member already joined.
- Join mock errors: SESSION_FULL (and disable the button at capacity), ALREADY_JOINED. Leave removes the member and frees a spot.
- Joining a social session must NOT count toward the 2-per-day court booking limit.
- Empty state when there are no sessions. Loading and error states required.

BOTH SCREENS: phone-first at 360px, touch targets >= 44px, no horizontal page scroll, loading/empty/error states, no floats for money, no imports from src/mocks or the store inside pages or components.

When done: list files changed (max 10 lines) and anything you were unsure about, then wait for "continue" for Pair 3.
