import React, { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Trophy,
  Sparkles,
  Calendar,
  ArrowRight,
  CheckCircle2,
  Users,
  ShieldCheck,
  Star,
  ChevronRight,
  Flame,
  Dumbbell,
  Coffee,
  ShoppingBag,
  Clock,
  MapPin,
  Award,
} from 'lucide-react'
import { Button, Card, Skeleton } from '../../components/ui'
import { usePublicAvailability, usePlans } from '../../api/hooks'
import { formatMoney } from '../../lib/format'

const SPORTS_STRIP = [
  {
    name: 'Tennis',
    tagline: '2 ITF Grade Synthetic Courts',
    description: 'Championship-grade acrylic courts with night floodlights and ball machines.',
    gradient: 'from-amber-500/10 to-orange-500/10 border-orange-200/60',
    iconColor: 'text-orange-600',
  },
  {
    name: 'Padel',
    tagline: '1 Panoramic Glass Court',
    description: 'Enclosed professional padel court with textured monofilament turf.',
    gradient: 'from-blue-500/10 to-indigo-500/10 border-blue-200/60',
    iconColor: 'text-primary-600',
  },
  {
    name: 'Badminton',
    tagline: '2 BWF Standard Wooden Courts',
    description: 'Teakwood sprung subfloors with anti-glare overhead illumination.',
    gradient: 'from-emerald-500/10 to-teal-500/10 border-emerald-200/60',
    iconColor: 'text-emerald-600',
  },
  {
    name: 'Cricket Net',
    tagline: '1 Automated Pitch',
    description: 'Astro-turf batting lane with programmable multi-speed bowling machine.',
    gradient: 'from-purple-500/10 to-pink-500/10 border-purple-200/60',
    iconColor: 'text-purple-600',
  },
]

const FACILITIES = [
  {
    icon: Flame,
    title: 'Tournament Lighting',
    description: 'HD TV-broadcast compliant 500+ lux LED lighting on all outdoor and indoor courts.',
  },
  {
    icon: ShoppingBag,
    title: 'Pro Shop & Restringing',
    description: 'Official racquets, tournament balls, apparel, and electronic racquet restringing.',
  },
  {
    icon: Coffee,
    title: 'Sports Café & Lounge',
    description: 'Fresh smoothies, protein bowls, gourmet espresso, and post-match recovery meals.',
  },
  {
    icon: Dumbbell,
    title: 'Locker Rooms & Physio',
    description: 'Spacious hot-shower locker suites with on-site sports recovery physiotherapist.',
  },
  {
    icon: Award,
    title: 'Certified Coaching',
    description: 'Private 1-on-1 coaching and weekend junior academy for all skill levels.',
  },
  {
    icon: Users,
    title: 'Friday Social Club',
    description: 'Weekly doubles mixers, round-robins, and club ranking leagues for members.',
  },
]

const TESTIMONIALS = [
  {
    name: 'Aditya Verma',
    role: 'Gold Member • Tennis Enthusiast',
    rating: 5,
    text: 'The court maintenance and lighting at Champions Club are unmatched in Bangalore. Having free court access as a Gold member makes playing 4 days a week incredibly easy.',
  },
  {
    name: 'Pooja Hegde',
    role: 'Silver Member • Padel Player',
    rating: 5,
    text: 'The panoramic padel court is top-tier. Booking through the member portal is super smooth, and the Friday socials are the highlight of my week.',
  },
  {
    name: 'Rajesh & Aarav',
    role: 'Junior Member Family • Badminton',
    rating: 5,
    text: 'My son trains under the club coaching academy. The wooden courts are forgiving on his knees, and the coaches are genuinely invested in player development.',
  },
]

export default function HomePage() {
  const navigate = useNavigate()
  const { data: availability, isLoading: isAvailLoading } = usePublicAvailability({ days: 1 })
  const { data: plans = [], isLoading: isPlansLoading } = usePlans()

  // Calculate total free slots across all courts today
  const freeSlotsToday = useMemo(() => {
    if (!availability?.courts) return 0
    return availability.courts.reduce((total, court) => {
      return total + court.slots.filter((s) => s.state === 'FREE').length
    }, 0)
  }, [availability])

  return (
    <div className="space-y-16 md:space-y-24">
      {/* ── 1. Hero Section ──────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl bg-surface border border-border-light p-6 sm:p-10 md:p-14 shadow-card">
        {/* Soft background decorative gradient blocks */}
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-primary-100/60 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-accent-green/10 blur-3xl pointer-events-none" />

        <div className="relative max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary-50 border border-primary-200 text-primary-700 text-xs font-bold shadow-soft animate-fade-in">
            <Trophy size={14} className="text-primary-600" />
            <span>Bangalore&apos;s Elite Racquet & Sports Club</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-text-primary leading-tight">
            Where Passion Meets <span className="text-primary-600">Peak Performance.</span>
          </h1>

          <p className="text-sm sm:text-base md:text-lg text-text-secondary leading-relaxed">
            Experience world-class tennis, padel, badminton, and automated cricket net facilities with professional coaching, premium surfaces, and a vibrant community.
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
            <Link to="/login" className="flex-1 sm:flex-none">
              <Button
                variant="primary"
                size="lg"
                pill
                iconRight={ArrowRight}
                className="w-full sm:w-auto text-sm font-bold min-h-[48px] px-7"
              >
                Book a Court
              </Button>
            </Link>
            <Link to="/plans" className="flex-1 sm:flex-none">
              <Button
                variant="secondary"
                size="lg"
                pill
                className="w-full sm:w-auto text-sm font-bold min-h-[48px] px-7"
              >
                Explore Membership Plans
              </Button>
            </Link>
          </div>

          {/* Value Badges */}
          <div className="pt-6 border-t border-border-light/80 grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs font-semibold text-text-secondary">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-accent-green shrink-0" />
              <span>6 Professional Courts</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-accent-green shrink-0" />
              <span>06:00 AM – 09:00 PM</span>
            </div>
            <div className="flex items-center gap-2 col-span-2 sm:col-span-1">
              <CheckCircle2 size={16} className="text-accent-green shrink-0" />
              <span>All 7 Days Open</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. Live Today's Court Availability Teaser ────────────────────── */}
      <section className="bg-canvas border border-border-light rounded-3xl p-6 sm:p-8 shadow-soft">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-accent-green animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-accent-green">
                Live Court Teaser
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-text-primary">
              Today&apos;s Court Schedule
            </h2>
            <p className="text-xs sm:text-sm text-text-secondary">
              {isAvailLoading ? (
                'Checking court schedules...'
              ) : (
                <>
                  <strong className="text-text-primary font-bold">{freeSlotsToday} court slots</strong> currently open for booking today across Tennis, Padel, Badminton & Cricket.
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            <Link to="/availability">
              <Button variant="secondary" size="md" pill iconRight={ChevronRight} className="text-xs font-bold">
                View Full 7-Day Grid
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="primary" size="md" pill className="text-xs font-bold">
                Log in to Reserve
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── 3. Sports Strip ──────────────────────────────────────────────── */}
      <section className="space-y-6">
        <div className="text-center max-w-xl mx-auto space-y-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
            Sports & Disciplines
          </h2>
          <p className="text-xs sm:text-sm text-text-secondary">
            Engineered to international federation standards with tournament-grade equipment.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {SPORTS_STRIP.map((sport) => (
            <Card
              key={sport.name}
              className={`p-5 rounded-2xl border bg-gradient-to-b ${sport.gradient} hover:shadow-card-hover transition-all duration-200 flex flex-col justify-between space-y-4`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-extrabold text-lg text-text-primary">{sport.name}</h3>
                  <Trophy size={18} className={sport.iconColor} />
                </div>
                <div className="text-xs font-bold text-text-secondary">{sport.tagline}</div>
                <p className="text-xs text-text-secondary leading-relaxed">{sport.description}</p>
              </div>

              <div className="pt-2 border-t border-border-light/60 flex items-center justify-between text-xs font-semibold text-text-primary">
                <span>View Free Slots</span>
                <ChevronRight size={14} className="text-text-tertiary" />
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* ── 4. Membership Plans Preview ──────────────────────────────────── */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary-600 mb-1">
              <Sparkles size={14} />
              <span>Flexible Memberships</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
              Transparent Membership Tiers
            </h2>
          </div>
          <Link to="/plans">
            <Button variant="secondary" size="sm" pill iconRight={ArrowRight} className="text-xs font-bold">
              Compare All Benefits
            </Button>
          </Link>
        </div>

        {isPlansLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="p-6 bg-surface rounded-3xl border border-border-light space-y-4">
                <Skeleton className="w-1/3 h-5 rounded" />
                <Skeleton className="w-1/2 h-8 rounded" />
                <Skeleton className="w-full h-24 rounded-xl" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const isGold = plan.code === 'GOLD'
              return (
                <Card
                  key={plan.id}
                  className={`p-6 sm:p-7 rounded-3xl border transition-all flex flex-col justify-between relative ${
                    isGold
                      ? 'bg-surface border-primary-500 shadow-raised ring-2 ring-primary-500/20'
                      : 'bg-surface border-border-light hover:shadow-card-hover'
                  }`}
                >
                  {isGold && (
                    <span className="absolute -top-3 right-6 px-3 py-1 rounded-full bg-primary-500 text-white text-[11px] font-extrabold tracking-wide uppercase shadow-pill">
                      Most Popular
                    </span>
                  )}

                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-bold text-text-primary">{plan.name} Tier</h3>
                      <div className="flex items-baseline gap-1 mt-2">
                        <span className="text-3xl font-extrabold text-primary-600">
                          {formatMoney(plan.fee_paise)}
                        </span>
                        <span className="text-xs text-text-tertiary">/ month</span>
                      </div>
                    </div>

                    <ul className="space-y-2.5 text-xs text-text-secondary pt-3 border-t border-border-light">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 size={14} className="text-accent-green shrink-0" />
                        <span>
                          {isGold ? (
                            <strong className="text-text-primary">Free Court Access (₹0/hr)</strong>
                          ) : (
                            'Deeply discounted court rates'
                          )}
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 size={14} className="text-accent-green shrink-0" />
                        <span>{plan.shop_discount_pct}% Pro Shop equipment discount</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 size={14} className="text-accent-green shrink-0" />
                        <span>{plan.bar_discount_pct}% Sports Café & Lounge discount</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 size={14} className="text-accent-green shrink-0" />
                        <span>2 bookings per day • 14 days in advance</span>
                      </li>
                    </ul>
                  </div>

                  <div className="pt-6 mt-6 border-t border-border-light">
                    <Link to="/plans" className="block">
                      <Button
                        variant={isGold ? 'primary' : 'secondary'}
                        className="w-full text-xs font-bold min-h-[44px]"
                      >
                        View Plan Details
                      </Button>
                    </Link>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {/* ── 5. World-Class Facilities Grid ───────────────────────────────── */}
      <section className="space-y-6">
        <div className="text-center max-w-xl mx-auto space-y-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
            Club Amenities & Services
          </h2>
          <p className="text-xs sm:text-sm text-text-secondary">
            Everything you need for serious training, casual matches, and post-game recovery.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FACILITIES.map((facility) => (
            <Card key={facility.title} className="p-5 rounded-2xl border border-border-light bg-surface space-y-3">
              <div className="w-10 h-10 rounded-xl bg-canvas flex items-center justify-center text-primary-600 border border-border-light">
                <facility.icon size={20} />
              </div>
              <h3 className="font-bold text-base text-text-primary">{facility.title}</h3>
              <p className="text-xs text-text-secondary leading-relaxed">{facility.description}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ── 6. Member Testimonials ───────────────────────────────────────── */}
      <section className="space-y-6">
        <div className="text-center max-w-xl mx-auto space-y-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
            Loved by Bangalore&apos;s Athletes
          </h2>
          <p className="text-xs sm:text-sm text-text-secondary">
            Hear from our active community of racquet enthusiasts and weekend warriors.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TESTIMONIALS.map((t) => (
            <Card key={t.name} className="p-6 rounded-2xl border border-border-light bg-surface space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-1 text-amber-500">
                  {[...Array(t.rating)].map((_, i) => (
                    <Star key={i} size={15} fill="currentColor" />
                  ))}
                </div>
                <p className="text-xs text-text-secondary italic leading-relaxed">
                  &ldquo;{t.text}&rdquo;
                </p>
              </div>

              <div className="pt-3 border-t border-border-light">
                <div className="font-bold text-xs text-text-primary">{t.name}</div>
                <div className="text-[11px] text-text-tertiary">{t.role}</div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* ── 7. Closing Call-to-Action ────────────────────────────────────── */}
      <section className="rounded-3xl bg-gradient-to-r from-primary-600 to-primary-800 text-white p-8 sm:p-12 text-center relative overflow-hidden shadow-raised">
        <div className="relative max-w-2xl mx-auto space-y-5">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight">
            Ready to Take the Court?
          </h2>
          <p className="text-xs sm:text-sm text-primary-100 max-w-lg mx-auto leading-relaxed">
            Join as a member today or submit an enquiry for a trial session, corporate booking, or private coaching.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link to="/contact" className="w-full sm:w-auto">
              <Button
                variant="secondary"
                size="lg"
                pill
                className="w-full sm:w-auto text-xs sm:text-sm font-bold min-h-[46px] px-8 bg-white text-primary-700 hover:bg-primary-50"
              >
                Send an Enquiry
              </Button>
            </Link>
            <Link to="/plans" className="w-full sm:w-auto">
              <Button
                variant="ghost"
                size="lg"
                pill
                className="w-full sm:w-auto text-xs sm:text-sm font-bold min-h-[46px] px-8 text-white hover:bg-white/10"
              >
                View Plans
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
