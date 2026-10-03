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
