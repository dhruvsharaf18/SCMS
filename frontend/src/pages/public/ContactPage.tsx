import React, { useState } from 'react'
import {
  Phone,
  Mail,
  MapPin,
  Clock,
  Send,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ShieldCheck,
  Building,
} from 'lucide-react'
import { Button, Card } from '../../components/ui'
import { useSubmitEnquiry, usePlans, useErrorSimulation } from '../../api/hooks'
import type { LeadInterest } from '../../api/types'

const INTEREST_OPTIONS: { id: LeadInterest; label: string; description: string }[] = [
  { id: 'TRIAL', label: 'Trial Session', description: 'Book a trial match or facility walkthrough' },
  { id: 'MEMBERSHIP', label: 'Club Membership', description: 'Gold, Silver, or Junior plan enquiry' },
  { id: 'CORPORATE', label: 'Corporate Booking', description: 'Company tournaments & group packages' },
  { id: 'OTHER', label: 'General / Coaching', description: 'Private academy coaching or events' },
]

export default function ContactPage() {
  const submitMutation = useSubmitEnquiry()
  const { data: plans = [] } = usePlans()
  const { currentError, setSimulatedError } = useErrorSimulation()

  // Form State
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [interest, setInterest] = useState<LeadInterest>('TRIAL')
  const [preferredPlanId, setPreferredPlanId] = useState<string>('')
  const [message, setMessage] = useState('')
  const [honeypot, setHoneypot] = useState('') // Hidden 'website' field

  // Status State
  const [validationError, setValidationError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)

  // Bot Protection: Throttling state (Security Item 12)
  const [lastSubmitTime, setLastSubmitTime] = useState(0)
  const [pageMountTime] = useState(() => Date.now())

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError(null)
    setServerError(null)

    // Security Item 12: Client-side throttling
    const now = Date.now()
    if (now - lastSubmitTime < 3000) {
      setValidationError('Please wait a few seconds before submitting again.')
      return
    }
    if (now - pageMountTime < 1000) {
      setValidationError('Submission too fast. Please take a moment to review your enquiry.')
      return
    }
    setLastSubmitTime(now)

    // Client-side validations
    if (!name.trim()) {
      setValidationError('Please enter your full name.')
      return
    }
    if (name.trim().length > 120) {
      setValidationError('Name cannot exceed 120 characters.')
      return
    }
    if (email.trim() && email.trim().length > 255) {
      setValidationError('Email cannot exceed 255 characters.')
      return
    }
    if (phone.trim() && phone.trim().length > 15) {
      setValidationError('Phone number cannot exceed 15 characters.')
      return
    }
    if (message.length > 1000) {
      setValidationError('Message cannot exceed 1,000 characters.')
      return
    }

    try {
      await submitMutation.mutateAsync({
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        interest,
        preferred_plan_id: preferredPlanId ? parseInt(preferredPlanId, 10) : null,
        message: message.trim() || null,
        website: honeypot, // Honeypot
      })

      // S-15 / SRS 3.2.10: Never echo submitted data, show only "received"
      setIsSuccess(true)
    } catch (err: any) {
      if (err?.code === 'RATE_LIMITED' || err?.status === 429) {
        setServerError('Too many requests. Please wait a few moments and try again later.')
      } else {
        setServerError(
          err?.message || 'Failed to submit enquiry. Please check your connection and try again.'
        )
      }
    }
  }

  const handleReset = () => {
    setName('')
    setEmail('')
    setPhone('')
    setInterest('TRIAL')
    setPreferredPlanId('')
    setMessage('')
    setHoneypot('')
    setIsSuccess(false)
    setValidationError(null)
    setServerError(null)
  }

  return (
    <div className="space-y-12 pb-12">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-50 border border-primary-200 text-primary-600 text-xs font-bold shadow-soft">
          <Phone size={14} />
          <span>Get in Touch (SRS §3.2.10)</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-text-primary">
          Contact & Enquiries
        </h1>
        <p className="text-sm text-text-secondary leading-relaxed">
          Have questions about memberships, coaching, court trials, or corporate events? Send us a message and our front desk team will get back to you promptly.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* ── Left Column: Enquiry Form ──────────────────────────────────── */}
        <div className="lg:col-span-7">
          <Card className="p-6 sm:p-8 rounded-3xl border border-border-light shadow-card">
            {isSuccess ? (
              <div className="py-8 text-center space-y-5 animate-scale-in">
                <div className="w-16 h-16 rounded-full bg-status-success text-ink flex items-center justify-center mx-auto border border-status-success-accent">
                  <CheckCircle2 size={36} />
                </div>

                <div className="space-y-2">
                  <h3 className="text-2xl font-extrabold text-text-primary">
                    Enquiry Received
                  </h3>
                  <p className="text-xs sm:text-sm text-text-secondary max-w-md mx-auto leading-relaxed">
                    Thank you! Your enquiry has been registered with our front desk team. We will review your request and reach out to you shortly.
                  </p>
                </div>

                <div className="p-4 bg-canvas rounded-2xl border border-border-light max-w-md mx-auto text-xs text-text-tertiary">
                  Status: <strong className="text-ink font-bold">Received (Code: 201)</strong> • Registered in club CRM queue
                </div>

                <div className="pt-2">
                  <Button variant="secondary" onClick={handleReset} className="text-xs font-bold px-6">
                    Submit Another Enquiry
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="border-b border-border-light pb-3">
                  <h2 className="text-lg font-bold text-text-primary">Send an Enquiry</h2>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Fill out the details below and our team will get in touch with you.
                  </p>
                </div>

                {/* Honeypot field (hidden from real users) */}
                <div
                  style={{
                    position: 'absolute',
                    left: '-9999px',
                    top: '-9999px',
                    opacity: 0,
                    pointerEvents: 'none',
                  }}
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <label htmlFor="website">Website</label>
                  <input
                    type="text"
                    id="website"
                    name="website"
                    autoComplete="off"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                  />
                </div>

                {/* Name field (Required) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-text-secondary flex items-center justify-between">
                    <span>Full Name *</span>
                    <span className="text-[10px] text-text-tertiary font-normal">Max 120 chars</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    placeholder="e.g. Isha Rao"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-surface border border-border-light rounded-xl text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary-500 transition-colors"
                  />
                </div>

                {/* Email & Phone fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-text-secondary">
                      Email Address
                    </label>
                    <input
                      type="email"
                      maxLength={255}
                      placeholder="isha@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-surface border border-border-light rounded-xl text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary-500 transition-colors"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-text-secondary">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      maxLength={15}
                      placeholder="+91 98111 11111"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-surface border border-border-light rounded-xl text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary-500 transition-colors"
                    />
                  </div>
                </div>

                {/* Interest Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-text-secondary block">
                    Area of Interest *
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {INTEREST_OPTIONS.map((opt) => {
                      const isSelected = interest === opt.id
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setInterest(opt.id)}
                          className={`p-3 rounded-xl border text-left transition-all touch-manipulation flex flex-col justify-between ${
                            isSelected
                              ? 'border-primary-500 bg-primary-50 text-primary-600 font-semibold ring-1 ring-primary-500'
                              : 'border-border-light bg-surface text-text-secondary hover:bg-canvas'
                          }`}
                        >
                          <span className="text-xs font-bold text-text-primary">{opt.label}</span>
                          <span className="text-[10px] text-text-tertiary mt-0.5">{opt.description}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Preferred Plan Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-text-secondary">
                    Preferred Membership Tier (Optional)
                  </label>
                  <select
                    value={preferredPlanId}
                    onChange={(e) => setPreferredPlanId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-surface border border-border-light rounded-xl text-sm text-text-primary focus:outline-none focus:border-primary-500 transition-colors"
                  >
                    <option value="">No preference / Not sure yet</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} Tier ({p.code})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Message Field (Max 1000 chars) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-text-secondary">
                    <span>Message / Specific Request</span>
                    <span className={`text-[10px] ${message.length > 900 ? 'text-ink font-bold' : 'text-text-tertiary font-normal'}`}>
                      {message.length} / 1000
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    maxLength={1000}
                    placeholder="Tell us about your preferred match times, racket sport experience, or group size..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-surface border border-border-light rounded-xl text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary-500 transition-colors"
                  />
                </div>

                {/* Validation or Server Error display */}
                {validationError && (
                  <div className="p-3 bg-status-error border border-accent-red/20 rounded-xl text-accent-red text-xs flex items-start gap-2">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                    <span>{validationError}</span>
                  </div>
                )}

                {serverError && (
                  <div className="p-3 bg-status-error border border-accent-red/20 rounded-xl text-accent-red text-xs flex items-start gap-2">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                    <span>{serverError}</span>
                  </div>
                )}

                {/* Dev Simulated Error Active Indicator */}
                {currentError && (
                  <div className="p-2.5 bg-status-warning border border-status-warning-accent rounded-xl flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-ink font-medium">
                      <AlertTriangle size={14} className="text-status-warning-icon" />
                      <span>Mock Error Active: {currentError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSimulatedError(null)}
                      className="text-ink hover:underline font-bold text-[10px]"
                    >
                      Clear
                    </button>
                  </div>
                )}

                {/* Honeypot field (Item 12): hidden from humans & screen readers without breaking accessibility */}
                <div
                  style={{
                    position: 'absolute',
                    left: '-9999px',
                    top: '-9999px',
                    width: '1px',
                    height: '1px',
                    overflow: 'hidden',
                    opacity: 0,
                    pointerEvents: 'none',
                  }}
                  aria-hidden="true"
                >
                  <label htmlFor="website">Leave this field blank</label>
                  <input
                    type="text"
                    id="website"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                  />
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  loading={submitMutation.isPending}
                  className="w-full min-h-[46px] font-bold text-xs gap-2"
                >
                  <Send size={15} />
                  <span>Send Enquiry</span>
                </Button>
              </form>
            )}
          </Card>
        </div>

        {/* ── Right Column: Club Info & Location ─────────────────────────── */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="p-6 rounded-3xl border border-border-light space-y-5 shadow-card">
            <h3 className="font-extrabold text-base text-text-primary">
              Clubhouse Information
            </h3>

            <div className="space-y-4 text-xs">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-canvas flex items-center justify-center text-primary-600 border border-border-light shrink-0">
                  <Clock size={16} />
                </div>
                <div>
                  <div className="font-bold text-text-primary">Operating Hours</div>
                  <div className="text-text-secondary mt-0.5">
                    06:00 AM – 09:00 PM IST (All 7 Days)
                  </div>
                  <div className="text-[10px] text-text-tertiary">
                    Floodlit courts available until close
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-canvas flex items-center justify-center text-primary-600 border border-border-light shrink-0">
                  <MapPin size={16} />
                </div>
                <div>
                  <div className="font-bold text-text-primary">Club Location</div>
                  <div className="text-text-secondary mt-0.5">
                    Champions Sports Club, Sports Avenue, 4th Block, Koramangala, Bengaluru 560034
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-canvas flex items-center justify-center text-primary-600 border border-border-light shrink-0">
                  <Mail size={16} />
                </div>
                <div>
                  <div className="font-bold text-text-primary">Desk Email</div>
                  <div className="text-text-secondary mt-0.5 font-mono">
                    desk@club.test
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-canvas flex items-center justify-center text-primary-600 border border-border-light shrink-0">
                  <Phone size={16} />
                </div>
                <div>
                  <div className="font-bold text-text-primary">Telephone / WhatsApp</div>
                  <div className="text-text-secondary mt-0.5 font-mono">
                    +91 80 4000 8888
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6 rounded-3xl border border-border-light bg-surface space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-ink">
              <ShieldCheck size={18} />
              <span>Safety & Fair Play Protocol</span>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">
              Non-marking shoes are strictly required on all indoor badminton and padel surfaces. Racquet hire and trial equipment are available at the front desk.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}
