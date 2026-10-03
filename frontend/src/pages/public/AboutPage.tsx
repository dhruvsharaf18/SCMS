import React from 'react'
import { Link } from 'react-router-dom'
import {
  Trophy,
  Award,
  ShieldCheck,
  Users,
  Target,
  Clock,
  MapPin,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import { Button, Card } from '../../components/ui'

const VALUES = [
  {
    icon: Trophy,
    title: 'Excellence in Sport',
    description: 'Providing competition-standard courts, precision lighting, and tournament certified equipment.',
  },
  {
    icon: Users,
    title: 'Inclusive Community',
    description: 'Fostering a welcoming environment for junior beginners, casual enthusiasts, and elite players.',
  },
  {
    icon: ShieldCheck,
    title: 'Integrity & Fair Play',
    description: 'Transparent hourly pricing, equal access booking rules, and zero hidden fees.',
  },
  {
    icon: Target,
    title: 'Athlete Development',
    description: 'Structured junior training programs and certified professional coaches across all racquet sports.',
  },
]

export default function AboutPage() {
  return (
    <div className="space-y-12 md:space-y-16 pb-12">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-50 border border-primary-200 text-primary-600 text-xs font-bold shadow-soft">
          <Trophy size={14} />
          <span>About Champions Club</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-text-primary">
          Bangalore&apos;s Home for Racquet Sports
        </h1>
        <p className="text-sm text-text-secondary leading-relaxed">
          Founded with a vision to create a premier athletic haven where sporting passion, community connection, and top-tier facilities converge.
        </p>
      </div>

      {/* ── Story Card ──────────────────────────────────────────────────── */}
      <Card className="p-6 sm:p-10 rounded-3xl border border-border-light bg-surface shadow-card space-y-6">
        <div className="max-w-3xl space-y-4 text-xs sm:text-sm text-text-secondary leading-relaxed">
          <h2 className="text-xl sm:text-2xl font-extrabold text-text-primary">
            World-Class Infrastructure in the Heart of the City
          </h2>
          <p>
            Champions Club was established to solve a critical need in Bengaluru&apos;s sporting landscape: high-performance, well-maintained courts accessible to both casual players and competitive athletes.
          </p>
          <p>
            Spread across dedicated athletic grounds in Koramangala, our facility features 2 ITF-standard synthetic tennis courts, an enclosed panoramic padel court with specialized turf, 2 BWF-approved wooden badminton courts, and an automated cricket batting lane.
          </p>
          <p>
            With on-site racquet restringing, a performance pro-shop, a recovery sports lounge & café, and an active tournament calendar, we provide everything needed for athletes to excel.
          </p>
        </div>

        <div className="pt-6 border-t border-border-light grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl sm:text-3xl font-extrabold text-primary-600">6</div>
            <div className="text-xs font-semibold text-text-tertiary mt-0.5">Pro Courts</div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-extrabold text-primary-600">15 hrs</div>
            <div className="text-xs font-semibold text-text-tertiary mt-0.5">Daily Open Hours</div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-extrabold text-primary-600">500+</div>
            <div className="text-xs font-semibold text-text-tertiary mt-0.5">Active Members</div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-extrabold text-primary-600">4</div>
            <div className="text-xs font-semibold text-text-tertiary mt-0.5">Sports Disciplines</div>
          </div>
        </div>
      </Card>

      {/* ── Core Values ──────────────────────────────────────────────────── */}
      <section className="space-y-6">
        <div className="text-center max-w-xl mx-auto space-y-2">
          <h2 className="text-2xl font-extrabold text-text-primary tracking-tight">
            Our Core Values
          </h2>
          <p className="text-xs text-text-secondary">
            Guided by principles of sporting excellence, fair play, and athlete well-being.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {VALUES.map((val) => (
            <Card key={val.title} className="p-5 rounded-2xl border border-border-light bg-surface space-y-3">
              <div className="w-10 h-10 rounded-xl bg-canvas flex items-center justify-center text-primary-600 border border-border-light">
                <val.icon size={20} />
              </div>
              <h3 className="font-bold text-base text-text-primary">{val.title}</h3>
              <p className="text-xs text-text-secondary leading-relaxed">{val.description}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ── CTA Banner ──────────────────────────────────────────────────── */}
      <section className="p-8 sm:p-10 rounded-3xl bg-surface border border-border-light shadow-soft flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="space-y-1 text-center sm:text-left">
          <h3 className="text-xl font-extrabold text-text-primary">
            Experience Champions Club Today
          </h3>
          <p className="text-xs text-text-secondary">
            Schedule a walkthrough or book a trial match with our coaches.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link to="/contact">
            <Button variant="primary" pill iconRight={ArrowRight} className="text-xs font-bold min-h-[44px] px-6">
              Book a Trial
            </Button>
          </Link>
          <Link to="/plans">
            <Button variant="secondary" pill className="text-xs font-bold min-h-[44px] px-6">
              View Plans
            </Button>
          </Link>
        </div>
      </section>
    </div>
  )
}
