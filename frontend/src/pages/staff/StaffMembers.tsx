import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Member, Tier, MemberStatus, PaymentMethod } from '../../api/types'
import { useMembers, useCreateMember } from '../../api/hooks'
import { formatDateIST, formatMoney } from '../../lib/format'
import {
  DataTable,
  Button,
  Drawer,
  StatusChip,
  Card,
  Avatar,
  useToast,
  type Column,
} from '../../components/ui'
import {
  Search,
  UserPlus,
  Filter,
  Phone,
  Mail,
  Calendar,
  AlertCircle,
  ChevronRight,
} from 'lucide-react'
import { cn } from '../../lib/utils'

export default function StaffMembers() {
  const navigate = useNavigate()
  const { toast } = useToast()

  const [searchQuery, setSearchQuery] = useState('')
  const [tierFilter, setTierFilter] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [registerDrawerOpen, setRegisterDrawerOpen] = useState(false)

  // Registration Form State
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [dob, setDob] = useState('')
  const [emergencyContact, setEmergencyContact] = useState('')
  const [selectedPlanId, setSelectedPlanId] = useState<number>(1)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI')
  const [inlineError, setInlineError] = useState<string | null>(null)

  const { data: members, isLoading, isError } = useMembers({
    q: searchQuery,
    tier: tierFilter === 'ALL' ? undefined : tierFilter,
    status: statusFilter === 'ALL' ? undefined : statusFilter,
  })

  const createMemberMutation = useCreateMember()

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setInlineError(null)

    if (!fullName.trim() || !phone.trim()) {
      setInlineError('Full name and primary phone number are required.')
      return
    }

    try {
      const created = await createMemberMutation.mutateAsync({
        full_name: fullName.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        dob: dob || null,
        emergency_contact: emergencyContact.trim() || null,
        plan_id: selectedPlanId,
        payment_method: paymentMethod,
      })

      toast(`Member ${created.full_name} (${created.member_code}) registered successfully!`, 'success')
      setRegisterDrawerOpen(false)
      // reset form
      setFullName('')
      setPhone('')
      setEmail('')
      setDob('')
      setEmergencyContact('')
      navigate(`/staff/members/${created.id}`)
    } catch (err: any) {
      setInlineError(err?.error?.message ?? 'Failed to register member.')
    }
  }

  const columns: Column<any>[] = [
    {
      key: 'member_code',
      header: 'Member Code',
      sortable: true,
      render: (m) => (
        <span className="font-mono text-xs font-bold text-primary-600 bg-primary-50 px-2 py-1 rounded-lg">
          {m.member_code}
        </span>
      ),
    },
    {
      key: 'full_name',
      header: 'Member Name',
      sortable: true,
      render: (m) => (
        <div className="flex items-center gap-3">
          <Avatar name={m.full_name} size="sm" />
          <div>
            <p className="font-bold text-text-primary text-sm leading-tight">{m.full_name}</p>
            <p className="text-xs text-text-tertiary">{m.email ?? 'No email'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      hideOnMobile: true,
      render: (m) => <span className="text-xs text-text-secondary">{m.phone}</span>,
    },
    {
      key: 'tier',
      header: 'Plan / Tier',
      sortable: true,
      render: (m) => (
        <span className="font-bold text-xs text-text-primary uppercase tracking-wide">
          {m.membership?.plan_code ?? m.tier}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (m) => {
        const variant =
          m.status === 'ACTIVE'
            ? 'success'
            : m.status === 'EXPIRING'
            ? 'warning'
            : 'error'
        return <StatusChip label={m.status} variant={variant} />
      },
    },
    {
      key: 'actions',
      header: '',
      render: (m) => (
        <Button
          variant="ghost"
          size="sm"
          icon={ChevronRight}
          onClick={(e) => {
            e.stopPropagation()
            navigate(`/staff/members/${m.id}`)
          }}
          className="text-text-tertiary hover:text-primary-600"
        >
          View
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Members</h1>
          <p className="text-sm text-text-secondary">Directory, subscriptions, renewals, and registrations</p>
        </div>
        <Button
          variant="primary"
          icon={UserPlus}
          onClick={() => setRegisterDrawerOpen(true)}
          className="touch-target"
        >
          Register Member
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          {/* Search */}
          <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-canvas rounded-xl border border-border-light">
            <Search size={16} className="text-text-tertiary" />
            <input
              type="text"
              placeholder="Search by name, phone, or member code (e.g. CC-000001)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-sm w-full outline-none text-text-primary placeholder:text-text-tertiary"
            />
          </div>

          {/* Tier Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-0.5">
            {(['ALL', 'GOLD', 'SILVER', 'JUNIOR'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTierFilter(t)}
                className={cn(
                  'px-3 py-1.5 rounded-pill text-xs font-semibold whitespace-nowrap transition-colors touch-target',
                  tierFilter === t
                    ? 'bg-primary-50 text-primary-600 border border-primary-200'
                    : 'bg-canvas text-text-secondary hover:text-text-primary'
                )}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Status Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-0.5 border-l border-border-light pl-2">
            {(['ALL', 'ACTIVE', 'EXPIRING', 'EXPIRED'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={cn(
                  'px-3 py-1.5 rounded-pill text-xs font-semibold whitespace-nowrap transition-colors touch-target',
                  statusFilter === st
                    ? 'bg-primary-50 text-primary-600 border border-primary-200'
                    : 'bg-canvas text-text-secondary hover:text-text-primary'
                )}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Members DataTable */}
      <DataTable
        columns={columns}
        data={(members ?? []) as any}
        keyExtractor={(row: any) => row.id}
        onRowClick={(row: any) => navigate(`/staff/members/${row.id}`)}
        emptyMessage="No members match your search criteria"
      />

      {/* ── REGISTER MEMBER DRAWER ─────────────────────────────────────── */}
      <Drawer
        open={registerDrawerOpen}
        onClose={() => setRegisterDrawerOpen(false)}
        title="Register New Member"
      >
        <form onSubmit={handleRegister} className="space-y-5">
          {inlineError && (
            <div className="p-3 rounded-2xl bg-status-error border border-status-error-text/30 flex items-start gap-2.5">
              <AlertCircle size={18} className="text-status-error-text flex-shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-status-error-text">{inlineError}</p>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider block mb-1">
              Full Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Karan Shah"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-border-light bg-surface text-sm outline-none focus:border-primary-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider block mb-1">
              Phone Number *
            </label>
            <input
              type="tel"
              required
              placeholder="e.g. 9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-border-light bg-surface text-sm outline-none focus:border-primary-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider block mb-1">
              Email Address
            </label>
            <input
              type="email"
              placeholder="e.g. karan@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-border-light bg-surface text-sm outline-none focus:border-primary-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider block mb-1">
                Date of Birth
              </label>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-border-light bg-surface text-xs outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider block mb-1">
                Emergency Contact
              </label>
              <input
                type="tel"
                placeholder="9000000000"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-border-light bg-surface text-sm outline-none focus:border-primary-500"
              />
            </div>
          </div>

          {/* Membership Plan Selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider block">
              Select Membership Plan
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 1, name: 'Gold', price: 300000, desc: 'Free Tennis & Padel, 15% discount' },
                { id: 2, name: 'Silver', price: 150000, desc: 'Discounts on all courts, 5% off' },
                { id: 3, name: 'Junior', price: 80000, desc: 'Youth plan (under 18), 10% off' },
              ].map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => setSelectedPlanId(pl.id)}
                  className={cn(
                    'p-3 rounded-xl border text-left flex flex-col justify-between transition-colors touch-target',
                    selectedPlanId === pl.id
                      ? 'bg-primary-50 border-primary-500 shadow-pill'
                      : 'bg-surface border-border-light hover:bg-canvas'
                  )}
                >
                  <span className="font-bold text-xs text-text-primary">{pl.name}</span>
                  <span className="font-extrabold text-xs text-primary-600 my-1">{formatMoney(pl.price)}</span>
                  <span className="text-[10px] text-text-tertiary leading-tight">{pl.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider block">
              First Month Payment Method
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['UPI', 'CARD', 'CASH'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  className={cn(
                    'py-2 px-3 rounded-xl border text-xs font-bold transition-colors touch-target',
                    paymentMethod === m
                      ? 'bg-primary-50 border-primary-500 text-primary-700'
                      : 'bg-surface border-border-light text-text-secondary hover:bg-canvas'
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-3 flex gap-3">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => setRegisterDrawerOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="flex-1"
              loading={createMemberMutation.isPending}
            >
              Register & Pay
            </Button>
          </div>
        </form>
      </Drawer>
    </div>
  )
}
