import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'

import { AuthProvider } from './lib/auth-context'
import { ToastProvider } from './components/ui/Toast'
import { AppShell } from './components/layout/AppShell'
import { PublicLayout } from './components/layout/PublicLayout'
import { RoleGuard } from './components/layout/RoleGuard'

// ── Public pages ───────────────────────────────────────────────────────────
import HomePage from './pages/public/HomePage'
import AboutPage from './pages/public/AboutPage'
import PlansPage from './pages/public/PlansPage'
import AvailabilityPage from './pages/public/AvailabilityPage'
import ShopPage from './pages/public/ShopPage'
import ProductDetailPage from './pages/public/ProductDetailPage'
import ContactPage from './pages/public/ContactPage'
import LoginPage from './pages/public/LoginPage'

// ── Member portal pages ───────────────────────────────────────────────────
import PortalHome from './pages/portal/PortalHome'
import PortalBook from './pages/portal/PortalBook'
import PortalBookings from './pages/portal/PortalBookings'
import PortalShop from './pages/portal/PortalShop'
import PortalOrders from './pages/portal/PortalOrders'
import PortalSocial from './pages/portal/PortalSocial'
import PortalProfile from './pages/portal/PortalProfile'
import PortalDining from './pages/portal/PortalDining'

// ── Staff pages ───────────────────────────────────────────────────────────
import StaffDashboard from './pages/staff/StaffDashboard'
import StaffMembers from './pages/staff/StaffMembers'
import StaffMemberDetail from './pages/staff/StaffMemberDetail'
import StaffBookings from './pages/staff/StaffBookings'
import StaffCourts from './pages/staff/StaffCourts'
import StaffSocial from './pages/staff/StaffSocial'
import StaffShop from './pages/staff/StaffShop'
import StaffStock from './pages/staff/StaffStock'
import StaffBar from './pages/staff/StaffBar'
import StaffKitchen from './pages/staff/StaffKitchen'
import StaffReservations from './pages/staff/StaffReservations'
import StaffLeads from './pages/staff/StaffLeads'
import StaffPayments from './pages/staff/StaffPayments'
import StaffInvoices from './pages/staff/StaffInvoices'
import StaffExpenses from './pages/staff/StaffExpenses'
import StaffReports from './pages/staff/StaffReports'
import StaffHR from './pages/staff/StaffHR'
import StaffAudit from './pages/staff/StaffAudit'

// ── Dev pages ─────────────────────────────────────────────────────────────
import DesignShowcase from './pages/dev/DesignShowcase'

// ── Query client ──────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// ── Staff roles for the guard ─────────────────────────────────────────────
const STAFF_ROLES = ['OWNER', 'MANAGER', 'FRONT_DESK', 'BAR_STAFF'] as const

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              {/* ── Public (no auth, PublicLayout) ── */}
              <Route element={<PublicLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/plans" element={<PlansPage />} />
                <Route path="/availability" element={<AvailabilityPage />} />
                <Route path="/shop" element={<ShopPage />} />
                <Route path="/shop/:productId" element={<ProductDetailPage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route path="/login" element={<LoginPage />} />
              </Route>

              {/* ── Member portal (MEMBER role, inside shell) ── */}
              <Route
                element={
                  <RoleGuard allowed={['MEMBER']}>
                    <AppShell />
                  </RoleGuard>
                }
              >
                <Route path="/portal" element={<PortalHome />} />
                <Route path="/portal/book" element={<PortalBook />} />
                <Route path="/portal/bookings" element={<PortalBookings />} />
                <Route path="/portal/shop" element={<PortalShop />} />
                <Route path="/portal/orders" element={<PortalOrders />} />
                <Route path="/portal/social" element={<PortalSocial />} />
                <Route path="/portal/profile" element={<PortalProfile />} />
                <Route path="/portal/dining" element={<PortalDining />} />
              </Route>

              {/* ── Staff console (staff roles, inside shell) ── */}
              <Route
                element={
                  <RoleGuard allowed={[...STAFF_ROLES]}>
                    <AppShell />
                  </RoleGuard>
                }
              >
                <Route path="/staff" element={<StaffDashboard />} />
                <Route path="/staff/members" element={<StaffMembers />} />
                <Route path="/staff/members/:id" element={<StaffMemberDetail />} />
                <Route path="/staff/bookings" element={<StaffBookings />} />
                <Route path="/staff/courts" element={<StaffCourts />} />
                <Route path="/staff/social" element={<StaffSocial />} />
                <Route path="/staff/shop" element={<StaffShop />} />
                <Route path="/staff/stock" element={<StaffStock />} />
                <Route path="/staff/bar" element={<StaffBar />} />
                <Route path="/staff/kitchen" element={<StaffKitchen />} />
                <Route path="/staff/reservations" element={<StaffReservations />} />
                <Route path="/staff/leads" element={<StaffLeads />} />
                <Route path="/staff/payments" element={<StaffPayments />} />
                <Route path="/staff/invoices" element={<StaffInvoices />} />
                <Route path="/staff/expenses" element={<StaffExpenses />} />
                <Route path="/staff/reports" element={<StaffReports />} />
                <Route path="/staff/hr" element={<StaffHR />} />
                <Route path="/staff/audit" element={<StaffAudit />} />
              </Route>

              {/* ── Dev pages (dev only, no guard, inside shell for nav testing) ── */}
              {import.meta.env.DEV && (
                <Route element={<AppShell />}>
                  <Route path="/dev/design" element={<DesignShowcase />} />
                </Route>
              )}


              {/* ── Catch-all ── */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
