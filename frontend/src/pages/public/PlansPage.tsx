import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  Trophy,
  ArrowRight,
  ShieldCheck,
  HelpCircle,
  Clock,
  Calendar,
  Users,
} from 'lucide-react'
import { Button, Card, Skeleton } from '../../components/ui'
import { usePlans, useCourtPrices } from '../../api/hooks'
import { formatMoney } from '../../lib/format'
import type { Sport, Tier } from '../../api/types'

const SPORT_NAMES: Record<Sport, string> = {
  TENNIS: 'Tennis (Outdoor Synthetic)',
  PADEL: 'Padel (Panoramic Glass)',
  BADMINTON: 'Badminton (Teakwood Indoor)',
  CRICKET_NET: 'Cricket Net (Automated Pitch)',
}

const FAQS = [
  {
    q: 'How does Gold tier court pricing work?',
    a: 'Gold members enjoy 100% complimentary court bookings (₹0/hr) across all sports. Bookings are subject to the standard 2 hours per day fair-use policy.',
  },
  {
    q: 'Can I book courts in advance as a member?',
    a: 'Yes, all active members can reserve court slots up to 14 days in advance through the online member portal. Non-members and walk-ins can only book on the same day.',
  },
  {
    q: 'Who is eligible for the Junior membership tier?',
    a: 'The Junior plan is designed for young athletes aged 18 and under, providing access to junior development coaching leagues, discounted court rates, and pro-shop equipment.',
  },
  {
    q: 'Are the Friday social sessions included?',
    a: 'Friday evening social mixers (doubles play and round-robins) are free for Gold members and available at a nominal fee for Silver and Junior members.',
  },
  {
    q: 'How do Pro Shop and Sports Café discounts apply?',
    a: 'Discounts are automatically calculated at checkout in the member portal and counter POS systems whenever your member code is presented.',
  },
]

export default function PlansPage() {
  const { data: plans = [], isLoading: isPlansLoading } = usePlans()
  const { data: courtPrices = [], isLoading: isPricesLoading } = useCourtPrices()

  // Group court prices by sport
  const priceMatrix = useMemo(() => {
    const sports: Sport[] = ['TENNIS', 'PADEL', 'BADMINTON', 'CRICKET_NET']
    return sports.map((sport) => {
      const getPrice = (tier: Tier) => {
        const item = courtPrices.find((p) => p.sport === sport && p.tier === tier)
        return item ? item.price_per_hour_paise : 0
      }
      return {
        sport,
        name: SPORT_NAMES[sport],
        gold: getPrice('GOLD'),
        silver: getPrice('SILVER'),
        junior: getPrice('JUNIOR'),
        walkin: getPrice('WALKIN'),
      }
    })
  }, [courtPrices])

  return (
    <div className="space-y-12 md:space-y-16">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-50 border border-primary-200 text-primary-600 text-xs font-bold shadow-soft">
          <Sparkles size={14} />
          <span>Transparent Membership Tiers</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-text-primary">
          Choose the Perfect Membership
        </h1>
        <p className="text-sm text-text-secondary leading-relaxed">
          From full complimentary court access to flexible pay-and-play options, explore our tailored plans for athletes of all levels.
        </p>
      </div>

      {/* ── 1. Plan Cards ────────────────────────────────────────────────── */}
      {isPlansLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="p-6 bg-surface rounded-3xl border border-border-light space-y-4">
              <Skeleton className="w-1/3 h-5 rounded" />
              <Skeleton className="w-1/2 h-8 rounded" />
              <Skeleton className="w-full h-32 rounded-xl" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {plans.map((plan) => {
            const isGold = plan.code === 'GOLD'
            const isJunior = plan.code === 'JUNIOR'

            return (
              <Card
                key={plan.id}
                className={`p-6 sm:p-8 rounded-3xl border transition-all flex flex-col justify-between relative ${
                  isGold
                    ? 'bg-surface border-primary-500 shadow-raised ring-2 ring-primary-500/20 md:-translate-y-2'
                    : 'bg-surface border-border-light hover:shadow-card-hover'
                }`}
              >
                {isGold && (
                  <span className="absolute -top-3.5 right-6 px-3.5 py-1 rounded-full bg-primary-500 text-white text-[11px] font-extrabold tracking-wide uppercase shadow-pill">
                    Best Value
                  </span>
                )}

                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-bold text-text-primary flex items-center gap-2">
                      {plan.name} Tier
                      {isGold && <Trophy size={18} className="text-amber-500" />}
                    </h3>
                    <p className="text-xs text-text-secondary mt-1">
                      {isGold
                        ? 'Unlimited court play with full club privileges'
                        : isJunior
                        ? 'Dedicated youth sports development plan'
                        : 'Flexible access with member-rate court discounts'}
                    </p>

                    <div className="flex items-baseline gap-1 mt-4">
                      <span className="text-3xl sm:text-4xl font-extrabold text-primary-600">
                        {formatMoney(plan.fee_paise)}
                      </span>
                      <span className="text-xs font-semibold text-text-tertiary">/ 30 days</span>
                    </div>
                  </div>

                  {/* Feature Highlights */}
                  <div className="space-y-3 pt-4 border-t border-border-light text-xs">
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 size={16} className="text-accent-green shrink-0" />
                      <span>
                        {isGold ? (
                          <strong className="text-text-primary">100% Free Court Access (₹0/hr)</strong>
                        ) : (
                          'Member-discounted hourly court rates'
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 size={16} className="text-accent-green shrink-0" />
                      <span>
                        <strong className="text-text-primary">{plan.shop_discount_pct}% Discount</strong> on all Pro Shop equipment
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 size={16} className="text-accent-green shrink-0" />
                      <span>
                        <strong className="text-text-primary">{plan.bar_discount_pct}% Discount</strong> at Sports Café & Lounge
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 size={16} className="text-accent-green shrink-0" />
                      <span>2 bookings per day limit</span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 size={16} className="text-accent-green shrink-0" />
                      <span>14 days advance booking priority</span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 size={16} className="text-accent-green shrink-0" />
                      <span>
                        {isGold
                          ? 'Free access to Friday Social sessions'
                          : 'Priority registration for club social sessions'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-6 mt-6 border-t border-border-light">
                  <Link to="/contact" className="block">
                    <Button
                      variant={isGold ? 'primary' : 'secondary'}
                      className="w-full text-xs font-bold min-h-[46px]"
                    >
                      Enquire for {plan.name}
                    </Button>
                  </Link>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── 2. Court Price Comparison Table (SRS 10.1) ───────────────────── */}
      <section className="space-y-6">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary-600">
            <Clock size={14} />
            <span>Court Hourly Rates (SRS §10.1)</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
            Hourly Court Rates by Tier
          </h2>
          <p className="text-xs sm:text-sm text-text-secondary">
            Court pricing is computed per 1-hour booking slot. All rates are inclusive of floodlights and court maintenance.
          </p>
        </div>

        {isPricesLoading ? (
          <div className="p-6 bg-surface rounded-3xl border border-border-light space-y-3">
            <Skeleton className="w-full h-10 rounded-xl" />
            <Skeleton className="w-full h-10 rounded-xl" />
            <Skeleton className="w-full h-10 rounded-xl" />
          </div>
        ) : (
          <div className="bg-surface rounded-3xl border border-border-light shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-canvas border-b border-border-light">
                    <th className="py-4 px-4 sm:px-6 font-bold text-text-primary">Sport & Surface</th>
                    <th className="py-4 px-3 sm:px-4 font-bold text-primary-600">Gold Tier</th>
                    <th className="py-4 px-3 sm:px-4 font-bold text-text-primary">Silver Tier</th>
                    <th className="py-4 px-3 sm:px-4 font-bold text-text-primary">Junior Tier</th>
                    <th className="py-4 px-4 sm:px-6 font-bold text-text-tertiary">Walk-in / Guest</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {priceMatrix.map((row) => (
                    <tr key={row.sport} className="hover:bg-canvas/40 transition-colors">
                      <td className="py-4 px-4 sm:px-6 font-bold text-text-primary">
                        {row.name}
                      </td>
                      <td className="py-4 px-3 sm:px-4">
                        <span className="inline-flex items-center gap-1 font-bold text-accent-green px-2 py-0.5 rounded-full bg-status-success text-xs">
                          {formatMoney(row.gold)} (Free)
                        </span>
                      </td>
                      <td className="py-4 px-3 sm:px-4 font-bold text-text-primary">
                        {formatMoney(row.silver)}/hr
                      </td>
                      <td className="py-4 px-3 sm:px-4 font-bold text-text-primary">
                        {formatMoney(row.junior)}/hr
                      </td>
                      <td className="py-4 px-4 sm:px-6 font-semibold text-text-tertiary">
                        {formatMoney(row.walkin)}/hr
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 bg-canvas/40 border-t border-border-light text-[11px] text-text-tertiary flex flex-col sm:flex-row items-center justify-between gap-2">
              <span>* Walk-in and non-member bookings can only be reserved at the front desk.</span>
              <span>All prices in Indian Rupees (₹)</span>
            </div>
          </div>
        )}
      </section>

      {/* ── 3. Frequently Asked Questions ────────────────────────────────── */}
      <section className="space-y-6">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary-600">
            <HelpCircle size={14} />
            <span>Got Questions?</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
            Membership FAQ
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FAQS.map((faq, i) => (
            <Card key={i} className="p-5 rounded-2xl border border-border-light bg-surface space-y-2">
              <h3 className="font-bold text-sm text-text-primary flex items-start gap-2">
                <span className="text-primary-600 shrink-0">Q:</span>
                <span>{faq.q}</span>
              </h3>
              <p className="text-xs text-text-secondary leading-relaxed pl-5">
                {faq.a}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* ── 4. CTA Banner ────────────────────────────────────────────────── */}
      <section className="p-8 sm:p-10 rounded-3xl bg-surface border border-border-light shadow-soft flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-1.5 text-center md:text-left">
          <h3 className="text-xl sm:text-2xl font-extrabold text-text-primary">
            Need a Custom Corporate or Family Plan?
          </h3>
          <p className="text-xs sm:text-sm text-text-secondary max-w-xl">
            We offer bespoke group memberships, tournament corporate packages, and private coaching clinics.
          </p>
        </div>

        <Link to="/contact">
          <Button variant="primary" size="lg" pill iconRight={ArrowRight} className="text-xs font-bold whitespace-nowrap min-h-[46px] px-7">
            Talk to Our Team
          </Button>
        </Link>
      </section>
    </div>
  )
}
