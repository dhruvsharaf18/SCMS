import { useNavigate } from 'react-router-dom'
import type { MemberHistoryEvent } from '../../api/types'
import { useMember, useMemberHistory, usePlans } from '../../api/hooks'
import { useAuth } from '../../hooks/useAuth'
import { formatDateIST, formatDateTimeIST, formatMoney, getTodayIST } from '../../lib/format'
import { Card, Button, StatusChip, SectionHeader } from '../../components/ui'
import type { ChipVariant } from '../../components/ui'
import {
  Phone,
  Mail,
  Cake,
  HeartPulse,
  ShoppingBag,
  UtensilsCrossed,
  CalendarDays,
  CreditCard,
  Clock,
  LogOut,
  Info,
  AlertTriangle,
} from 'lucide-react'

const STATUS_VARIANTS: Record<string, ChipVariant> = {
  ACTIVE: 'success',
  EXPIRING: 'warning',
  EXPIRED: 'error',
  NONE: 'neutral',
}

const HISTORY_META: Record<MemberHistoryEvent['kind'], { label: string; icon: typeof Clock }> = {
  BOOKING: { label: 'Court booking', icon: CalendarDays },
  SHOP_ORDER: { label: 'Shop order', icon: ShoppingBag },
  BAR_ORDER: { label: 'Bar order', icon: UtensilsCrossed },
  PAYMENT: { label: 'Payment', icon: CreditCard },
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000)
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')
}

function DetailRow({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <div className="w-9 h-9 rounded-xl bg-canvas text-text-secondary flex items-center justify-center flex-shrink-0">
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase font-semibold tracking-wider text-text-tertiary">{label}</p>
        <p className="text-sm font-semibold text-text-primary truncate">{value || 'Not provided'}</p>
      </div>
    </div>
  )
}

export default function PortalProfile() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const memberId = user?.member_id ?? 0

  const { data: member, isLoading } = useMember(memberId)
  const { data: plans = [] } = usePlans()
  const { data: history = [], isLoading: historyLoading } = useMemberHistory(memberId, 10)

  const membership = member?.membership ?? null
  const plan = plans.find((p) => p.code === membership?.plan_code)
  const status = member?.status ?? 'NONE'
  const today = getTodayIST()

  const totalDays = membership ? Math.max(1, daysBetween(membership.start_date, membership.end_date)) : 1
  const daysLeft = membership ? daysBetween(today, membership.end_date) : 0
  const progress = membership ? Math.min(100, Math.max(0, (daysLeft / totalDays) * 100)) : 0

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  if (!memberId) {
    return (
      <Card className="p-6 text-center text-sm text-text-secondary">
        This account is not linked to a member record. Please contact the front desk.
      </Card>
    )
  }

  if (isLoading) {
    return <Card className="p-6 text-center text-xs text-text-tertiary animate-pulse">Loading your profile...</Card>
  }

  return (
    <div className="space-y-6 pb-8">
      {/* ── Identity ── */}
      <Card className="p-5 flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-indigo-600 text-white flex items-center justify-center text-xl font-black flex-shrink-0">
          {initials(member?.full_name ?? user?.full_name ?? 'M')}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-text-primary truncate">{member?.full_name ?? user?.full_name}</h1>
          <p className="font-mono text-xs text-primary-600 mt-0.5">{member?.member_code}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary-50 text-primary-700">
              {membership?.plan_code ?? 'No plan'}
            </span>
            <StatusChip label={status} variant={STATUS_VARIANTS[status] ?? 'neutral'} />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Membership ── */}
        <div className="space-y-3">
          <SectionHeader title="Membership" />
          <Card className="p-5 space-y-4">
            {membership ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-base text-text-primary">{plan?.name ?? membership.plan_code} plan</p>
                    <p className="text-xs text-text-secondary mt-0.5">
                      {formatDateIST(membership.start_date)} – {formatDateIST(membership.end_date)}
                    </p>
                  </div>
                  {plan && (
                    <p className="text-xs text-text-secondary text-right">
                      <span className="font-bold text-text-primary">{formatMoney(plan.fee_paise)}</span>
                      <br />per {plan.duration_days} days
                    </p>
                  )}
                </div>

                <div>
                  <div className="h-2 rounded-full bg-canvas overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        status === 'EXPIRED' ? 'bg-accent-red' : status === 'EXPIRING' ? 'bg-amber-500' : 'bg-accent-green'
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-text-secondary mt-1.5">
                    {daysLeft > 0
                      ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`
                      : daysLeft === 0
                      ? 'Ends today'
                      : `Expired ${-daysLeft} day${daysLeft === -1 ? '' : 's'} ago`}
                  </p>
                </div>

                {(status === 'EXPIRING' || status === 'EXPIRED') && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                    <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                    <span>
                      {status === 'EXPIRED'
                        ? 'Your membership has ended, so member prices no longer apply.'
                        : 'Your membership ends soon.'}{' '}
                      Visit the front desk to renew.
                    </span>
                  </div>
                )}

                {plan && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {[
                      { label: 'Pro shop', value: `${plan.shop_discount_pct}% off` },
                      { label: 'Bar & dining', value: `${plan.bar_discount_pct}% off` },
                      ...(plan.max_bookings_per_day
                        ? [{ label: 'Court bookings', value: `${plan.max_bookings_per_day} per day` }]
                        : []),
                      ...(plan.advance_booking_days
                        ? [{ label: 'Book ahead', value: `${plan.advance_booking_days} days` }]
                        : []),
                    ].map((b) => (
                      <div key={b.label} className="p-3 rounded-xl bg-canvas">
                        <p className="text-[10px] uppercase font-semibold tracking-wider text-text-tertiary">{b.label}</p>
                        <p className="text-sm font-bold text-text-primary">{b.value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-text-secondary">
                You don't have a membership plan yet. Ask the front desk about Gold, Silver or Junior plans.
              </p>
            )}
          </Card>
        </div>

        {/* ── Personal details ── */}
        <div className="space-y-3">
          <SectionHeader title="Personal Details" />
          <Card className="p-5">
            <div className="divide-y divide-border-light">
              <DetailRow icon={Phone} label="Phone" value={member?.phone} />
              <DetailRow icon={Mail} label="Email" value={member?.email ?? user?.email} />
              <DetailRow icon={Cake} label="Date of birth" value={member?.dob ? formatDateIST(member.dob) : null} />
              <DetailRow icon={HeartPulse} label="Emergency contact" value={member?.emergency_contact} />
            </div>
            <p className="text-[11px] text-text-tertiary mt-4 flex items-center gap-1.5">
              <Info size={12} /> Need to change something? The front desk can update your details.
            </p>
          </Card>
        </div>
      </div>

      {/* ── Recent activity ── */}
      <div className="space-y-3">
        <SectionHeader title="Recent Activity" />
        <Card className="p-5">
          {historyLoading ? (
            <p className="text-xs text-text-tertiary text-center animate-pulse">Loading activity...</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-text-tertiary text-center">No activity yet.</p>
          ) : (
            <div className="divide-y divide-border-light">
              {history.map((event) => {
                const meta = HISTORY_META[event.kind] ?? { label: event.kind, icon: Clock }
                const Icon = meta.icon
                return (
                  <div key={`${event.kind}-${event.id}`} className="py-2.5 flex items-center justify-between gap-3 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-canvas text-text-secondary flex items-center justify-center flex-shrink-0">
                        <Icon size={15} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-text-primary">{meta.label}</p>
                        <p className="text-[10px] text-text-tertiary truncate">
                          {formatDateTimeIST(event.at)} · {event.detail.split('/').join(' · ')}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs font-bold text-text-primary flex-shrink-0">
                      {event.amount_paise === 0 ? 'Free' : formatMoney(event.amount_paise)}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* ── Account ── */}
      <div className="space-y-3">
        <SectionHeader title="Account" />
        <Card className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase font-semibold tracking-wider text-text-tertiary">Signed in as</p>
            <p className="text-sm font-semibold text-text-primary">{user?.email}</p>
          </div>
          <Button variant="secondary" icon={LogOut} onClick={handleLogout} className="touch-target">
            Log out
          </Button>
        </Card>
      </div>
    </div>
  )
}
