import React, { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Trophy,
  Menu,
  X,
  Calendar,
  Sparkles,
  ShoppingBag,
  Phone,
  LogIn,
  ChevronRight,
  Clock,
  MapPin,
  Mail,
  ShieldCheck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '../ui'

interface NavItem {
  label: string
  path: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Home', path: '/', icon: Trophy },
  { label: 'Plans', path: '/plans', icon: Sparkles },
  { label: 'Availability', path: '/availability', icon: Calendar },
  { label: 'Shop', path: '/shop', icon: ShoppingBag },
  { label: 'Contact', path: '/contact', icon: Phone },
]

export function PublicLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="min-h-screen bg-canvas flex flex-col text-ink antialiased">
      {/* ── Sticky Top Navigation ────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-odoo-grey border-b border-border-light shadow-soft transition-all text-ink">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Brand Logo */}
          <Link
            to="/"
            className="flex items-center gap-2.5 group focus:outline-none focus:ring-2 focus:ring-ink rounded-xl"
            aria-label="Champions Club Home"
          >
            <div className="w-10 h-10 rounded-2xl bg-odoo-purple text-white flex items-center justify-center shadow-pill group-hover:scale-105 transition-transform border border-border-light">
              <Trophy size={20} className="stroke-[2.2]" />
            </div>
            <div>
              <span className="font-extrabold text-base sm:text-lg tracking-tight text-ink block leading-tight">
                Champions<span className="text-ink underline decoration-odoo-purple decoration-2">Club</span>
              </span>
              <span className="text-[10px] font-bold tracking-wider uppercase text-ink block leading-none">
                Sports & Racquet Club
              </span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-1 bg-grey-tint p-1 rounded-full border border-border-light shadow-inner-soft">
            {NAV_ITEMS.map((item) => {
              const isActive = location.pathname === item.path
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-all duration-200 min-h-[38px] flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-odoo-purple text-white shadow-pill'
                      : 'text-ink hover:text-ink hover:bg-white'
                  }`}
                >
                  <item.icon size={14} />
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </nav>

          {/* Right Action: Login CTA */}
          <div className="hidden sm:flex items-center gap-3">
            <Link to="/login">
              <Button
                variant={location.pathname === '/login' ? 'primary' : 'secondary'}
                size="sm"
                pill
                icon={LogIn}
                className="min-h-[44px] px-5 text-xs font-bold"
              >
                Member Login
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Toggle Button */}
          <div className="flex md:hidden items-center gap-2">
            <Link to="/login" className="sm:hidden">
              <button
                className="w-10 h-10 rounded-xl bg-odoo-grey border border-border-light text-ink flex items-center justify-center touch-manipulation hover:bg-grey-tint"
                aria-label="Member Login"
              >
                <LogIn size={18} />
              </button>
            </Link>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="w-11 h-11 rounded-xl bg-odoo-grey border border-border-light text-ink flex items-center justify-center touch-manipulation hover:bg-grey-tint transition-colors focus:outline-none focus:ring-2 focus:ring-ink"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border-light bg-odoo-grey px-4 py-4 space-y-1.5 animate-slide-up shadow-card text-ink">
            {NAV_ITEMS.map((item) => {
              const isActive = location.pathname === item.path
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-bold transition-all min-h-[44px] touch-manipulation ${
                    isActive
                      ? 'bg-odoo-purple text-white border border-border-light'
                      : 'text-ink hover:bg-grey-tint'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon size={18} className="text-ink" />
                    <span>{item.label}</span>
                  </div>
                  <ChevronRight size={16} className="text-ink" />
                </NavLink>
              )
            })}
            <div className="pt-2 border-t border-border-light">
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-primary-500 text-ink font-bold text-sm min-h-[44px] touch-manipulation shadow-pill border border-ink"
              >
                <LogIn size={16} />
                <span>Member Portal Login</span>
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* ── Main Public Page Content ────────────────────────────────────── */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 md:py-10">
        <Outlet />
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="bg-odoo-grey border-t border-border-light mt-auto text-ink">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 md:py-14">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
            {/* Club Brand Summary */}
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-odoo-purple text-white flex items-center justify-center border border-border-light">
                  <Trophy size={16} />
                </div>
                <span className="font-extrabold text-base tracking-tight text-ink">
                  Champions<span className="text-ink underline decoration-odoo-purple">Club</span>
                </span>
              </div>
              <p className="text-xs text-ink leading-relaxed">
                Premier multi-sport club featuring world-class tennis, padel, badminton courts, and an indoor cricket net.
              </p>
              <div className="flex items-center gap-2 text-xs font-bold text-ink">
                <ShieldCheck size={16} className="text-ink" />
                <span>Certified Professional Surfaces</span>
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink mb-3">
                Navigation
              </h4>
              <ul className="space-y-2 text-xs font-medium text-ink">
                <li>
                  <Link to="/" className="hover:underline transition-colors">Home</Link>
                </li>
                <li>
                  <Link to="/plans" className="hover:underline transition-colors">Membership Plans</Link>
                </li>
                <li>
                  <Link to="/availability" className="hover:underline transition-colors">Court Availability</Link>
                </li>
                <li>
                  <Link to="/shop" className="hover:underline transition-colors">Pro Shop Equipment</Link>
                </li>
                <li>
                  <Link to="/contact" className="hover:underline transition-colors">Enquiries & Trials</Link>
                </li>
              </ul>
            </div>

            {/* Operating Hours & Location */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink mb-3">
                Club Information
              </h4>
              <div className="space-y-2 text-xs text-ink">
                <div className="flex items-start gap-2">
                  <Clock size={15} className="text-ink shrink-0 mt-0.5" />
                  <span>
                    <strong>Hours:</strong> 06:00 AM – 09:00 PM IST<br />
                    Open All 7 Days
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin size={15} className="text-ink shrink-0 mt-0.5" />
                  <span>Sports Avenue, Koramangala, Bengaluru, Karnataka 560034</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail size={15} className="text-ink shrink-0" />
                  <span>desk@club.test</span>
                </div>
              </div>
            </div>

            {/* Portal Access */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink mb-3">
                Portal Access
              </h4>
              <p className="text-xs text-ink mb-3">
                Members and staff can log in to manage court bookings, tabs, and club operations.
              </p>
              <Link to="/login">
                <Button variant="secondary" size="sm" pill className="w-full text-xs font-bold min-h-[44px]">
                  Go to Login
                </Button>
              </Link>
            </div>
          </div>

          <div className="pt-6 border-t border-border-light flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-ink font-medium">
            <div>
              © 2026 Champions Club Management System (CCMS). All rights reserved.
            </div>
            <div className="flex items-center gap-4">
              <span>Timezone: Asia/Kolkata (IST)</span>
              <span>•</span>
              <span>All prices in Indian Rupees (₹)</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
