/**
 * Formatting and integer arithmetic helpers for CCMS.
 *
 * Rules (SRS 1.4):
 * - Money: Integer paise only. Frontend formats ₹{(p/100).toFixed(2)}. Never float/decimal.
 * - Time: Club timezone is Asia/Kolkata (IST = UTC+05:30).
 * - Rounding: discount = (subtotal * pct + 50) // 100; tax = (total * rate + (100+rate)//2) // (100+rate).
 */

/** Format paise integer to Indian Rupee display (e.g. 450000 -> "₹4,500.00") */
export function formatMoney(paise: number): string {
  const safePaise = Math.round(Number.isFinite(paise) ? paise : 0)
  const isNegative = safePaise < 0
  const absPaise = Math.abs(safePaise)
  const rupees = Math.floor(absPaise / 100)
  const remainder = absPaise % 100
  const paddedRemainder = remainder.toString().padStart(2, '0')

  // Format integer rupees with Indian numbering (e.g. 1,00,000)
  const rupeesStr = rupees.toLocaleString('en-IN')
  return `${isNegative ? '-' : ''}₹${rupeesStr}.${paddedRemainder}`
}

/** Format paise integer without decimal cents if whole, e.g. "₹4,500" */
export function formatMoneyCompact(paise: number): string {
  const safePaise = Math.round(Number.isFinite(paise) ? paise : 0)
  const rupees = Math.floor(safePaise / 100)
  return `₹${rupees.toLocaleString('en-IN')}`
}

/** Calculate discount using integer arithmetic: (subtotal * pct + 50) // 100 */
export function calcDiscountPaise(subtotalPaise: number, discountPct: number): number {
  if (subtotalPaise <= 0 || discountPct <= 0) return 0
  return Math.floor((subtotalPaise * discountPct + 50) / 100)
}

/** Calculate embedded GST tax using integer arithmetic: (total * rate + (100+rate)//2) // (100+rate) */
export function calcTaxPaise(totalPaise: number, taxRatePct: number = 5): number {
  if (totalPaise <= 0 || taxRatePct <= 0) return 0
  const half = Math.floor((100 + taxRatePct) / 2)
  return Math.floor((totalPaise * taxRatePct + half) / (100 + taxRatePct))
}

/** Calculate embedded Shop GST tax (18% rate): (total * 18 + 59) // 118 */
export function calcShopTaxPaise(totalPaise: number): number {
  if (totalPaise <= 0) return 0
  return Math.floor((totalPaise * 18 + 59) / 118)
}

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000

/** Convert UTC ISO string or Date to IST Date object */
function toISTDate(utcDateStr: string | Date): Date {
  const d = typeof utcDateStr === 'string' ? new Date(utcDateStr) : utcDateStr
  // Offset to IST
  const utc = d.getTime() + d.getTimezoneOffset() * 60000
  return new Date(utc + IST_OFFSET_MS)
}

/** Format date in IST: "09 Oct 2026" */
export function formatDateIST(dateStr: string | Date): string {
  try {
    const ist = toISTDate(dateStr)
    return ist.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return String(dateStr)
  }
}

/** Format time in IST: "12:30 PM" */
export function formatTimeIST(dateStr: string | Date): string {
  try {
    const ist = toISTDate(dateStr)
    return ist.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return String(dateStr)
  }
}

/** Format datetime in IST: "09 Oct 2026, 12:30 PM" */
export function formatDateTimeIST(dateStr: string | Date): string {
  try {
    const ist = toISTDate(dateStr)
    const datePart = ist.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    const timePart = ist.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
    return `${datePart}, ${timePart}`
  } catch {
    return String(dateStr)
  }
}

/** Get today's calendar date in IST as "YYYY-MM-DD" */
export function getTodayIST(): string {
  const ist = toISTDate(new Date())
  const year = ist.getFullYear()
  const month = String(ist.getMonth() + 1).padStart(2, '0')
  const day = String(ist.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Convert IST date string and time "HH:MM" to UTC ISO string */
export function istToUtcIso(dateStr: string, timeStr: string): string {
  // dateStr is YYYY-MM-DD, timeStr is HH:MM
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hours, minutes] = timeStr.split(':').map(Number)
  // IST is UTC + 5:30 -> UTC is IST - 5:30
  const istTimeMs = Date.UTC(year, month - 1, day, hours, minutes, 0)
  const utcMs = istTimeMs - IST_OFFSET_MS
  return new Date(utcMs).toISOString()
}
