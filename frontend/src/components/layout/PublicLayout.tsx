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
    <div className="min-h-screen bg-canvas flex flex-col text-text-primary antialiased">
      {/* ── Sticky Top Navigation ────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-surface/90 backdrop-blur-md border-b border-border-light shadow-soft transition-all">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Brand Logo */}
          <Link
            to="/"
            className="flex items-center gap-2.5 group focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-xl"
            aria-label="Champions Club Home"
          >
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center shadow-pill group-hover:scale-105 transition-transform">
              <Trophy size={20} className="stroke-[2.2]" />
            </div>
            <div>
              <span className="font-extrabold text-base sm:text-lg tracking-tight text-text-primary block leading-tight">
                Champions<span className="text-primary-600">Club</span>
              </span>
              <span className="text-[10px] font-semibold tracking-wider uppercase text-text-tertiary block leading-none">
                Sports & Racquet Club
              </span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-1 bg-canvas p-1 rounded-full border border-border-light shadow-inner-soft">
            {NAV_ITEMS.map((item) => {
              const isActive = location.pathname === item.path
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={`px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 min-h-[38px] flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-primary-500 text-white shadow-pill'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface/80'
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
                className="w-10 h-10 rounded-xl bg-surface border border-border-light text-text-primary flex items-center justify-center touch-manipulation hover:bg-canvas"
                aria-label="Member Login"
              >
                <LogIn size={18} />
              </button>
            </Link>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="w-11 h-11 rounded-xl bg-surface border border-border-light text-text-primary flex items-center justify-center touch-manipulation hover:bg-canvas transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border-light bg-surface px-4 py-4 space-y-1.5 animate-slide-up shadow-card">
            {NAV_ITEMS.map((item) => {
              const isActive = location.pathname === item.path
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold transition-all min-h-[44px] touch-manipulation ${
                    isActive
                      ? 'bg-primary-50 text-primary-600 font-bold border border-primary-200'
                      : 'text-text-primary hover:bg-canvas'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon size={18} className={isActive ? 'text-primary-600' : 'text-text-tertiary'} />
                    <span>{item.label}</span>
                  </div>
                  <ChevronRight size={16} className="text-text-tertiary" />
                </NavLink>
              )
            })}
            <div className="pt-2 border-t border-border-light">
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-primary-500 text-white font-bold text-sm min-h-[44px] touch-manipulation shadow-pill"
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
      <footer className="bg-surface border-t border-border-light mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 md:py-14">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
            {/* Club Brand Summary */}
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary-500 text-white flex items-center justify-center">
                  <Trophy size={16} />
                </div>
                <span className="font-extrabold text-base tracking-tight text-text-primary">
                  Champions<span className="text-primary-600">Club</span>
                </span>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed">
                Premier multi-sport club featuring world-class tennis, padel, badminton courts, and an indoor cricket net.
              </p>
              <div className="flex items-center gap-2 text-xs font-semibold text-accent-green">
                <ShieldCheck size={16} />
                <span>Certified Professional Surfaces</span>
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-tertiary mb-3">
                Navigation
              </h4>
              <ul className="space-y-2 text-xs font-medium text-text-secondary">
                <li>
                  <Link to="/" className="hover:text-primary-600 transition-colors">Home</Link>
                </li>
                <li>
                  <Link to="/plans" className="hover:text-primary-600 transition-colors">Membership Plans</Link>
                </li>
                <li>
                  <Link to="/availability" className="hover:text-primary-600 transition-colors">Court Availability</Link>
                </li>
                <li>
                  <Link to="/shop" className="hover:text-primary-600 transition-colors">Pro Shop Equipment</Link>
                </li>
                <li>
                  <Link to="/contact" className="hover:text-primary-600 transition-colors">Enquiries & Trials</Link>
                </li>
              </ul>
            </div>

            {/* Operating Hours & Location */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-tertiary mb-3">
                Club Information
              </h4>
              <div className="space-y-2 text-xs text-text-secondary">
                <div className="flex items-start gap-2">
                  <Clock size={15} className="text-text-tertiary shrink-0 mt-0.5" />
                  <span>
                    <strong>Hours:</strong> 06:00 AM – 09:00 PM IST<br />
                    Open All 7 Days
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin size={15} className="text-text-tertiary shrink-0 mt-0.5" />
                  <span>Sports Avenue, Koramangala, Bengaluru, Karnataka 560034</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail size={15} className="text-text-tertiary shrink-0" />
                  <span>desk@club.test</span>
                </div>
              </div>
            </div>

            {/* Portal Access */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-tertiary mb-3">
                Portal Access
              </h4>
              <p className="text-xs text-text-secondary mb-3">
                Members and staff can log in to manage court bookings, tabs, and club operations.
              </p>
              <Link to="/login">
                <Button variant="secondary" size="sm" pill className="w-full text-xs font-bold min-h-[44px]">
                  Go to Login
                </Button>
              </Link>
            </div>
          </div>

          <div className="pt-6 border-t border-border-light flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-text-tertiary">
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
