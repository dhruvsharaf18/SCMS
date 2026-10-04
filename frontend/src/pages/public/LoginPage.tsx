import React, { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import {
  Trophy,
  LogIn,
  Eye,
  EyeOff,
  AlertTriangle,
  Lock,
  Mail,
  ShieldAlert,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import { Button, Card } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { safeNextPath } from '../../lib/utils'

const DEMO_PERSONAS = [
  { label: 'Member 1 (Karan)', email: 'member1@club.test', role: 'MEMBER' },
  { label: 'Member 2 (Pooja)', email: 'member2@club.test', role: 'MEMBER' },
  { label: 'Member 3 (Rahul)', email: 'member3@club.test', role: 'MEMBER' },
  { label: 'Front Desk (Arjun)', email: 'desk@club.test', role: 'FRONT_DESK' },
  { label: 'Bar Staff (Sana)', email: 'bar@club.test', role: 'BAR_STAFF' },
  { label: 'Manager (Ravi)', email: 'manager@club.test', role: 'MANAGER' },
  { label: 'Owner (Meera)', email: 'owner@club.test', role: 'OWNER' },
]

export default function LoginPage() {
  const { login, user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const nextPath = safeNextPath(searchParams.get('next'))

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLockedOut, setIsLockedOut] = useState(false)

  // Redirect if already authenticated
  React.useEffect(() => {
    if (user) {
      navigate(nextPath ?? (user.role === 'MEMBER' ? '/portal' : '/staff'), { replace: true })
    }
  }, [user, navigate, nextPath])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setIsLockedOut(false)

    if (!email.trim() || !password) {
      setErrorMessage('Please enter both email and password.')
      return
    }

    setLoading(true)

    try {
      const user = await login(email.trim(), password)

      // Post-login redirect: a safe ?next= path first, otherwise the role landing page (SRS §2.4 & §3.1)
      navigate(nextPath ?? (user.role === 'MEMBER' ? '/portal' : '/staff'), { replace: true })
    } catch (err: any) {
      const status = err?.status ?? 0
      const code = err?.code ?? ''

      if (status === 423 || code === 'ACCOUNT_LOCKED') {
        setIsLockedOut(true)
        setErrorMessage(
          'Account temporarily locked due to too many failed attempts. Please try again in 15 minutes.'
        )
      } else if (status === 429 || code === 'RATE_LIMITED') {
        setErrorMessage('Too many attempts, wait a minute and try again.')
      } else if (status === 422 || code === 'VALIDATION_ERROR') {
        setErrorMessage('Please enter a valid email and password.')
      } else if (status >= 500 || status === 0 || code === 'NETWORK_ERROR') {
        setErrorMessage('Cannot reach the server. Try again shortly.')
      } else if (status === 401 || code === 'INVALID_CREDENTIALS') {
        // Generic error text: never reveals whether email or password was wrong (SRS §7, S-05)
        setErrorMessage('Invalid email or password.')
      } else {
        setErrorMessage('Invalid email or password.')
      }
    } finally {
      setLoading(false)
      // S-21 (A3): Clear password from component state after every attempt —
      // success or failure — so the plaintext is not retained in React state
      // beyond the duration of the network request.
      setPassword('')
    }
  }

  const handleQuickFill = (demoEmail: string) => {
    setEmail(demoEmail)
    setPassword('Club@12345')
    setErrorMessage(null)
    setIsLockedOut(false)
  }

  return (
    <div className="py-6 sm:py-10 max-w-md mx-auto space-y-6 animate-fade-in">
      {/* ── Login Card ──────────────────────────────────────────────────── */}
      <Card className="p-6 sm:p-8 rounded-3xl border border-border-light shadow-card space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-odoo-purple text-white border border-border-light flex items-center justify-center mx-auto shadow-pill">
            <Trophy size={24} className="stroke-[2.2]" />
          </div>
          <h1 className="text-2xl font-extrabold text-text-primary tracking-tight">
            Portal Sign In
          </h1>
          <p className="text-xs text-text-secondary">
            Access your court bookings, order history, or staff dashboard.
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div
            role="alert"
            className={`p-3.5 rounded-2xl text-xs flex items-start gap-2.5 border ${
              isLockedOut
                ? 'bg-status-warning border-status-warning-accent text-ink font-semibold'
                : 'bg-status-error border-status-error-accent text-ink font-semibold'
            }`}
          >
            {isLockedOut ? (
              <ShieldAlert size={16} className="shrink-0 mt-0.5 text-ink" />
            ) : (
              <AlertTriangle size={16} className="shrink-0 mt-0.5 text-ink" />
            )}
            <p className="leading-relaxed">{errorMessage}</p>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div className="space-y-1.5">
            <label
              htmlFor="login-email"
              className="text-xs font-bold text-text-secondary block"
            >
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary" size={16} />
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                placeholder="name@club.test"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-3.5 py-2.5 bg-surface border border-border-light rounded-xl text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-odoo-purple transition-colors"
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="login-password"
                className="text-xs font-bold text-text-secondary block"
              >
                Password
              </label>
            </div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary" size={16} />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 bg-surface border border-border-light rounded-xl text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-odoo-purple transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary transition-colors touch-manipulation"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            pill
            loading={loading}
            className="w-full min-h-[46px] text-xs font-bold gap-2 mt-2"
          >
            <LogIn size={16} />
            <span>Sign In</span>
          </Button>
        </form>

        <div className="pt-2 text-center text-xs text-text-secondary">
          <span>Don&apos;t have a membership yet? </span>
          <Link to="/contact" className="font-bold text-odoo-purple hover:underline">
            Enquire for Access
          </Link>
        </div>
      </Card>

      {/* ── Demo Quick-Fill Persona Selector (DEV Only) ─────────────────── */}
      {import.meta.env.DEV && (
        <Card className="p-4 rounded-2xl border border-border-light bg-surface space-y-2.5 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-ink">
            <Sparkles size={14} className="text-odoo-purple" />
            <span>Demo Quick-Fill Accounts (SRS §10.1)</span>
          </div>
          <p className="text-[11px] text-text-secondary">
            Click any account to populate demo credentials (Password: <code>Club@12345</code>):
          </p>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {DEMO_PERSONAS.map((p) => (
              <button
                key={p.email}
                type="button"
                onClick={() => handleQuickFill(p.email)}
                className="px-2.5 py-1 rounded-lg bg-grey-tint border border-border-light text-[11px] font-semibold text-ink hover:bg-odoo-grey transition-colors touch-manipulation"
              >
                {p.label}
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
