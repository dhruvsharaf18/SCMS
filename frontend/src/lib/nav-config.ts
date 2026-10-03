import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Dumbbell,
  ShoppingBag,
  Package,
  UtensilsCrossed,
  ChefHat,
  UserSearch,
  FileText,
  Receipt,
  UsersRound,
  Bell,
  ClipboardList,
  Globe,
  Info,
  CreditCard,
  BarChart3,
  Home,
  User,
  ShoppingCart,
  Calendar,
  Trophy,
} from 'lucide-react'
import type { Role } from './auth-context'

// ── Types ──────────────────────────────────────────────────────────────────
export interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  path: string
  /** Show as a bottom-bar item on mobile (max 5) */
  mobileBar?: boolean
}

export interface NavSection {
  title?: string
  items: NavItem[]
}

// ── Staff navigation (desktop sidebar / icon rail) ─────────────────────────
const staffCommon: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/staff', mobileBar: true },
]

const memberManagement: NavItem[] = [
  { id: 'members', label: 'Members', icon: Users, path: '/staff/members', mobileBar: true },
]

const courtBooking: NavItem[] = [
  { id: 'bookings', label: 'Bookings', icon: CalendarDays, path: '/staff/bookings', mobileBar: true },
]

const shopItems: NavItem[] = [
  { id: 'shop', label: 'Shop', icon: ShoppingBag, path: '/staff/shop', mobileBar: true },
  { id: 'stock', label: 'Stock', icon: Package, path: '/staff/stock' },
]

const reservationsItem: NavItem = {
  id: 'reservations',
  label: 'Reservations',
  icon: ClipboardList,
  path: '/staff/reservations',
}

const barItems: NavItem[] = [
  { id: 'bar', label: 'Bar POS', icon: UtensilsCrossed, path: '/staff/bar', mobileBar: true },
  { id: 'kitchen', label: 'Kitchen', icon: ChefHat, path: '/staff/kitchen' },
  reservationsItem,
]

const leadItems: NavItem[] = [
  { id: 'leads', label: 'Leads', icon: UserSearch, path: '/staff/leads' },
]

const teamItems: NavItem[] = [
  { id: 'hr', label: 'Staff', icon: UsersRound, path: '/staff/hr' },
]

const financeItems: NavItem[] = [
  { id: 'payments', label: 'Payments', icon: CreditCard, path: '/staff/payments' },
  { id: 'reports', label: 'Reports', icon: BarChart3, path: '/staff/reports' },
]

// ── Role → nav config map (one entry per SRS role: OWNER, MANAGER, FRONT_DESK, BAR_STAFF, MEMBER) ──
export const NAV_CONFIG: Record<Role, NavSection[]> = {
  OWNER: [
    { items: staffCommon },
    { title: 'Club', items: [...memberManagement, ...courtBooking] },
    { title: 'Commerce', items: [...shopItems, ...barItems] },
    { title: 'Pipeline', items: leadItems },
    { title: 'Team', items: teamItems },
    { title: 'Finance', items: financeItems },
  ],
  MANAGER: [
    { items: staffCommon },
    { title: 'Club', items: [...memberManagement, ...courtBooking] },
    { title: 'Commerce', items: [...shopItems, ...barItems] },
    { title: 'Pipeline', items: leadItems },
    { title: 'Team', items: teamItems },
    { title: 'Finance', items: financeItems.filter((i) => i.id !== 'reports') },
  ],
  FRONT_DESK: [
    { items: staffCommon },
    { title: 'Club', items: [...memberManagement, ...courtBooking] },
    { title: 'Commerce', items: [...shopItems, reservationsItem] },
    { title: 'Pipeline', items: leadItems },
  ],
  BAR_STAFF: [
    { items: staffCommon },
    { title: 'Bar', items: barItems },
  ],
  MEMBER: [
    {
      items: [
        { id: 'portal-home', label: 'Home', icon: Home, path: '/portal', mobileBar: true },
        { id: 'portal-book', label: 'Book', icon: Calendar, path: '/portal/book', mobileBar: true },
        { id: 'portal-bookings', label: 'Bookings', icon: CalendarDays, path: '/portal/bookings', mobileBar: true },
        { id: 'portal-shop', label: 'Shop', icon: ShoppingCart, path: '/portal/shop', mobileBar: true },
        { id: 'portal-orders', label: 'Orders', icon: Package, path: '/portal/orders' },
        { id: 'portal-dining', label: 'Dining', icon: UtensilsCrossed, path: '/portal/dining' },
        { id: 'portal-profile', label: 'Profile', icon: User, path: '/portal/profile', mobileBar: true },
      ],
    },
  ],
}

/** Get navigation sections for any SRS role */
export function getNavSections(role?: Role): NavSection[] {
  if (!role) return []
  return (NAV_CONFIG[role] ?? []).filter((s) => s.items.length > 0)
}

/** Flatten navigation items for any SRS role */
export function getNavItems(role?: Role): NavItem[] {
  return getNavSections(role).flatMap((s) => s.items)
}

// ── Backward-compatibility exports ─────────────────────────────────────────
export const STAFF_NAV = NAV_CONFIG
export const MEMBER_NAV: NavItem[] = NAV_CONFIG.MEMBER[0].items

// ── Public site navigation ────────────────────────────────────────────────
export const PUBLIC_NAV: NavItem[] = [
  { id: 'home', label: 'Home', icon: Home, path: '/' },
  { id: 'about', label: 'About', icon: Info, path: '/about' },
  { id: 'plans', label: 'Plans', icon: CreditCard, path: '/plans' },
  { id: 'availability', label: 'Availability', icon: CalendarDays, path: '/availability' },
  { id: 'pub-shop', label: 'Shop', icon: ShoppingBag, path: '/shop' },
  { id: 'contact', label: 'Contact', icon: Globe, path: '/contact' },
]

// ── Notifications bell ────────────────────────────────────────────────────
export const NOTIFICATION_ICON = Bell

