import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { useAuth } from '../../hooks/useAuth'
import {
  useMember,
  useMyBookings,
  useMyPayments,
  useSocialSessions,
  useCourts,
} from '../../api/hooks'
import { getTodayIST, formatDateIST, formatTimeIST, formatMoney } from '../../lib/format'
import {
  Card,
  Button,
  StatusChip,
  SectionHeader,
  Modal,
} from '../../components/ui'
import {
  CalendarDays,
  ShoppingBag,
  Users,
  QrCode,
  ArrowRight,
  Clock,
  Sparkles,
  ShieldCheck,
  Receipt,
  CreditCard,
  ChevronRight,
  UtensilsCrossed,
  Layers,
  Award,
} from 'lucide-react'

export default function PortalHome() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const memberId = user?.member_id ?? 1

  const { data: member, isLoading: memberLoading } = useMember(memberId)
  const { data: myBookings = [], isLoading: bookingsLoading } = useMyBookings(memberId)
  const { data: courts = [] } = useCourts()
  const { data: myPayments = [], isLoading: paymentsLoading } = useMyPayments(memberId)
  const { data: socialSessions = [] } = useSocialSessions({ from: getTodayIST() })

  const [qrModalOpen, setQrModalOpen] = useState(false)

  const todayStr = getTodayIST()

  // Filter upcoming confirmed bookings
  const upcomingBookings = myBookings
    .filter((b) => b.status === 'CONFIRMED' && b.start_at.slice(0, 10) >= todayStr)
    .slice(0, 2)

  // Recent payments
  const recentPayments = myPayments.slice(0, 3)

  // Next upcoming social session
  const nextSocial = socialSessions[0]

  const tier = member?.membership?.plan_code ?? member?.tier ?? 'GOLD'
  const isExpiring = member?.status === 'EXPIRING'
  const isExpired = member?.status === 'EXPIRED'

  const tierGradients: Record<string, string> = {
    GOLD: 'from-amber-600 via-amber-500 to-yellow-400 text-amber-950',
    SILVER: 'from-slate-600 via-slate-500 to-zinc-400 text-slate-950',
    JUNIOR: 'from-blue-600 via-indigo-500 to-sky-400 text-blue-950',
  }

  const tierGradient = tierGradients[tier] || tierGradients.GOLD

  return (
    <div className="space-y-6 pb-6">
      {/* ── Top Greeting ── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">
              Hello, {member?.full_name?.split(' ')[0] ?? 'Member'}!
            </h1>
            <span className="text-xl">👋</span>
          </div>
          <p className="text-xs text-text-secondary mt-0.5">
            Welcome to your Champions Club Member Portal
          </p>
        </div>

        <button
          type="button"
          onClick={() => setQrModalOpen(true)}
          className="p-2.5 rounded-2xl bg-surface border border-border-light shadow-soft hover:shadow-card transition-all text-text-secondary hover:text-primary-600 flex items-center gap-1.5 touch-target"
          aria-label="Display Member QR Code"
        >
          <QrCode size={20} />
          <span className="text-xs font-semibold hidden sm:inline">My Pass</span>
        </button>
      </div>

      {/* ── Luxury Digital Membership Card ── */}
      <div className="relative overflow-hidden rounded-3xl p-6 shadow-card transition-all duration-300 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white border border-white/10">
        {/* Background glow & subtle watermark */}
        <div className="absolute -right-12 -bottom-12 w-56 h-56 rounded-full bg-primary-500/20 blur-3xl pointer-events-none" />
        <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
          <Award size={120} />
        </div>

        <div className="relative z-10 space-y-6">
          {/* Card Top Row */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold tracking-wider text-xs uppercase text-primary-300">
                  Champions Club
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-primary-400" />
                <span className="text-xs font-medium text-white/70">Membership Pass</span>
              </div>
              <p className="text-2xl font-black tracking-tight mt-1 bg-gradient-to-r from-white via-white to-white/80 bg-clip-text text-transparent">
                {member?.full_name ?? user?.full_name ?? 'Club Member'}
              </p>
            </div>

            <div className="flex flex-col items-end gap-1.5">
              <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-white/10 backdrop-blur-md border border-white/20 text-white shadow-sm">
                {tier} MEMBER
              </span>
              <StatusChip
                label={member?.status ?? 'ACTIVE'}
                variant={member?.status === 'ACTIVE' ? 'success' : isExpiring ? 'warning' : 'error'}
              />
            </div>
          </div>

          {/* Card Middle: Code & Expiry */}
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/10">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
                Member ID
              </p>
              <p className="font-mono font-bold text-sm tracking-wider text-white mt-0.5">
                {member?.member_code ?? '#CC-M001'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
                Valid Until
              </p>
              <p className="font-semibold text-sm text-white mt-0.5">
                {member?.membership?.end_date ? formatDateIST(member.membership.end_date) : 'Auto-renew'}
              </p>
            </div>
          </div>

          {/* Card Bottom: QR Code snippet & Benefits */}
          <div className="flex items-center justify-between pt-3 border-t border-white/10">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] px-2.5 py-1 rounded-lg bg-white/10 text-white/90 font-medium">
                {tier === 'GOLD' ? '15% Off Shop & Bar' : tier === 'SILVER' ? '5% Off Shop & Bar' : '10% Off'}
              </span>
              <span className="text-[11px] px-2.5 py-1 rounded-lg bg-white/10 text-white/90 font-medium hidden sm:inline">
                {tier === 'GOLD' ? 'Free Court Bookings' : 'Discounted Courts'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setQrModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white text-slate-950 font-bold text-xs shadow-soft hover:bg-white/90 transition-all touch-target"
            >
              <QrCode size={16} />
              <span>Show QR</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Quick Actions Grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => navigate('/portal/book')}
          className="p-4 rounded-2xl bg-surface border border-border-light shadow-soft hover:shadow-card hover:border-primary-300 transition-all text-left flex flex-col justify-between group touch-target"
        >
          <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
            <CalendarDays size={20} />
          </div>
          <div>
            <p className="font-bold text-xs text-text-primary">Book Court</p>
            <p className="text-[10px] text-text-tertiary mt-0.5">Reserve 1-hour slot</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate('/portal/social')}
          className="p-4 rounded-2xl bg-surface border border-border-light shadow-soft hover:shadow-card hover:border-accent-purple/50 transition-all text-left flex flex-col justify-between group touch-target"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-accent-purple flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
            <Users size={20} />
          </div>
          <div>
            <p className="font-bold text-xs text-text-primary">Friday Social</p>
            <p className="text-[10px] text-text-tertiary mt-0.5">Club mix & match</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate('/portal/shop')}
          className="p-4 rounded-2xl bg-surface border border-border-light shadow-soft hover:shadow-card hover:border-accent-green/50 transition-all text-left flex flex-col justify-between group touch-target"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-accent-green flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
            <ShoppingBag size={20} />
          </div>
          <div>
            <p className="font-bold text-xs text-text-primary">Pro Store</p>
            <p className="text-[10px] text-text-tertiary mt-0.5">Member discount</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate('/portal/orders')}
          className="p-4 rounded-2xl bg-surface border border-border-light shadow-soft hover:shadow-card hover:border-amber-300 transition-all text-left flex flex-col justify-between group touch-target"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
            <Receipt size={20} />
          </div>
          <div>
            <p className="font-bold text-xs text-text-primary">My Orders</p>
            <p className="text-[10px] text-text-tertiary mt-0.5">Purchases & pickup</p>
          </div>
        </button>
      </div>

      {/* ── Upcoming Bookings Section ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionHeader title="My Upcoming Bookings" />
          <Button
            variant="ghost"
            size="sm"
            icon={ArrowRight}
            onClick={() => navigate('/portal/bookings')}
          >
            View All
          </Button>
        </div>

        {bookingsLoading ? (
          <Card className="p-6 text-center text-xs text-text-tertiary animate-pulse">
            Loading your bookings...
          </Card>
        ) : upcomingBookings.length === 0 ? (
          <Card className="p-6 text-center space-y-3">
            <CalendarDays size={32} className="mx-auto text-text-tertiary" />
            <div>
              <p className="font-bold text-sm text-text-primary">No upcoming bookings</p>
              <p className="text-xs text-text-secondary mt-0.5">
                Ready to play? Book a tennis, padel, or badminton court now!
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              icon={CalendarDays}
              onClick={() => navigate('/portal/book')}
              className="touch-target mx-auto"
            >
              Book a Slot
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {upcomingBookings.map((b) => {
              const court = courts.find((c) => c.id === b.court_id)
              return (
                <Card key={b.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-primary-50 text-primary-600 flex flex-col items-center justify-center flex-shrink-0">
                      <Clock size={20} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-text-primary truncate">
                        {court?.name ?? `Court #${b.court_id}`}
                      </p>
                      <p className="text-xs text-text-secondary mt-0.5">
                        {formatDateIST(b.start_at)} · {formatTimeIST(b.start_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <StatusChip label={b.status} variant="success" />
                    <span className="font-bold text-xs text-text-primary">
                      {b.price_paise === 0 ? 'Complimentary' : formatMoney(b.price_paise)}
                    </span>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Friday Social Highlight & Recent Payments ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Next Social Session Card */}
        {nextSocial && (
          <Card className="p-5 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-accent-purple animate-pulse" />
                  <span className="text-xs font-bold text-accent-purple uppercase tracking-wider">
                    Next Social Play
                  </span>
                </div>
                <span className="text-xs font-semibold text-text-secondary">
                  {formatDateIST(nextSocial.start_at)}
                </span>
              </div>
              <h3 className="font-bold text-base text-text-primary mt-2">
                {nextSocial.title}
              </h3>
              <p className="text-xs text-text-secondary mt-1">
                {nextSocial.court_name} ({nextSocial.sport}) · {formatTimeIST(nextSocial.start_at)} to {formatTimeIST(nextSocial.end_at)}
              </p>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border-light">
              <div className="text-xs">
                <span className="text-text-secondary">Spots: </span>
                <span className="font-bold text-text-primary">
                  {nextSocial.joined_count} / {nextSocial.capacity} joined
                </span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                icon={ChevronRight}
                onClick={() => navigate('/portal/social')}
                className="touch-target text-xs"
              >
                Join Session
              </Button>
            </div>
          </Card>
        )}

        {/* My Recent Payments */}
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <SectionHeader title="My Recent Payments" />
            <span className="text-xs text-text-tertiary">Billing record</span>
          </div>

          {paymentsLoading ? (
            <p className="text-xs text-text-tertiary py-3 text-center">Loading transactions...</p>
          ) : recentPayments.length === 0 ? (
            <p className="text-xs text-text-tertiary py-3 text-center">No payment transactions found</p>
          ) : (
            <div className="divide-y divide-border-light">
              {recentPayments.map((p) => (
                <div key={p.id} className="py-2.5 flex items-center justify-between gap-2 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-canvas flex items-center justify-center text-text-secondary flex-shrink-0">
                      <CreditCard size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-xs text-text-primary truncate">
                        {p.source_type.replace('_', ' ')}
                      </p>
                      <p className="text-[10px] text-text-tertiary">
                        {formatDateIST(p.created_at)} · {p.method}
                      </p>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-xs text-text-primary">
                      {formatMoney(p.amount_paise)}
                    </p>
                    <StatusChip
                      label={p.status}
                      variant={p.status === 'PAID' ? 'success' : 'error'}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── QR Pass Modal ── */}
      <Modal
        open={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        title="Member Digital Pass"
      >
        <div className="flex flex-col items-center justify-center p-4 space-y-4 text-center">
          <div className="p-4 rounded-3xl bg-white shadow-card border border-border-light">
            <QRCodeSVG
              value={`CCMS:${member?.member_code ?? '#CC-M001'}:${member?.id ?? memberId}`}
              size={190}
              level="H"
              includeMargin
            />
          </div>

          <div>
            <p className="text-base font-bold text-text-primary">
              {member?.full_name ?? user?.full_name}
            </p>
            <p className="font-mono font-bold text-xs text-primary-600 bg-primary-50 px-2.5 py-1 rounded-full inline-block mt-1">
              {member?.member_code ?? '#CC-M001'}
            </p>
            <p className="text-xs text-text-tertiary mt-2">
              Present this QR code at the Front Desk, Pro Shop, or Bar to verify membership and apply your member discount.
            </p>
          </div>

          <Button
            variant="secondary"
            onClick={() => setQrModalOpen(false)}
            className="touch-target w-full"
          >
            Close Pass
          </Button>
        </div>
      </Modal>
    </div>
  )
}
