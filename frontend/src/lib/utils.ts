import clsx, { type ClassValue } from 'clsx'

/** Merge Tailwind class names — thin wrapper over clsx (no tailwind-merge to stay within the pinned stack). */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs)
}

/** Format integer paise as ₹X,XXX.XX (SRS §1.4). */
export function formatINR(paise: number): string {
  const rupees = paise / 100
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Format a date string to IST display (DD MMM YYYY). */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })
}

/** Format time in IST (HH:MM). */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  })
}

/**
 * Returns `raw` only when it is a same-origin relative path: one leading "/", not "//",
 * no backslash, no control characters. Anything else (absolute URLs, "//host", "/\host")
 * could send the user off-site after login, so it yields null.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 512) return null
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  if (raw.includes('\\')) return null
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null
  if (raw === '/login' || raw.startsWith('/login?')) return null
  return raw
}

/** Generate initials from a full name (max 2 chars). */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
