import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMember, useBookings, useCourts } from '../../api/hooks'
import { formatDateIST, formatTimeIST, formatMoney } from '../../lib/format'
import {
  Card,
  Button,
  StatusChip,
  Avatar,
  DataTable,
  Skeleton,
  type Column,
} from '../../components/ui'
import {
  ArrowLeft,
  Calendar,
  Phone,
  Mail,
  ShieldCheck,
  CreditCard,
  Clock,
  AlertCircle,
  FileText,
} from 'lucide-react'
import type { Booking } from '../../api/types'

export default function StaffMemberDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const memberId = Number(id)

  const { data: member, isLoading: memberLoading, isError } = useMember(memberId)
  const { data: courts = [] } = useCourts()
  const { data: memberBookings, isLoading: bookingsLoading } = useBookings({ member_id: memberId })

  if (memberLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-64 rounded-card" />
          <Skeleton className="h-64 rounded-card md:col-span-2" />
        </div>
      </div>
    )
  }

  if (isError || !member) {
    return (
      <div className="p-8 text-center bg-surface rounded-card shadow-soft border border-status-error/30 space-y-3">
        <AlertCircle size={32} className="mx-auto text-status-error-text" />
        <h2 className="text-lg font-bold text-text-primary">Member Not Found</h2>
        <p className="text-sm text-text-secondary">Could not find record for member ID #{id}</p>
        <Button variant="secondary" onClick={() => navigate('/staff/members')}>
          Back to Directory
        </Button>
      </div>
    )
  }

  const bookingColumns: Column<Booking>[] = [
    {
      key: 'court_id',
      header: 'Court',
      render: (b) => {
        const court = courts.find((c) => c.id === b.court_id)
        return <span className="font-bold text-xs text-text-primary">{court?.name ?? `Court #${b.court_id}`}</span>
      },
    },
    {
      key: 'start_at',
      header: 'Date & Time',
      render: (b) => (
        <span className="text-xs text-text-secondary">
          {formatDateIST(b.start_at)}, {formatTimeIST(b.start_at)}
        </span>
      ),
    },
    {
      key: 'price_paise',
      header: 'Fee',
      render: (b) => <span className="font-bold text-xs text-primary-600">{formatMoney(b.price_paise)}</span>,
    },
    {
      key: 'status',
      header: 'Booking Status',
      render: (b) => {
        const v = b.status === 'CONFIRMED' ? 'success' : b.status === 'COMPLETED' ? 'info' : 'error'
        return <StatusChip label={b.status} variant={v} />
      },
    },
    {
      key: 'payment_status',
      header: 'Payment',
      render: (b) => {
        const v = b.payment_status === 'PAID' || b.payment_status === 'WAIVED' ? 'success' : 'warning'
        return <StatusChip label={b.payment_status} variant={v} />
      },
    },
  ]

  return (
    <div className="space-y-6">
      {/* Back button & page title */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/staff/members')}
          className="p-2 rounded-xl bg-surface hover:bg-canvas text-text-secondary transition-colors touch-target border border-border-light shadow-soft"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Member Profile</h1>
          <p className="text-xs text-text-secondary">Member #{member.id} · {member.member_code}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Personal info & Member Card */}
        <Card className="p-6 space-y-6">
          <div className="flex flex-col items-center text-center">
            <Avatar name={member.full_name} size="lg" className="mb-3" />
            <h2 className="text-xl font-bold text-text-primary">{member.full_name}</h2>
            <span className="font-mono text-xs font-bold text-primary-600 bg-primary-50 px-2.5 py-1 rounded-pill mt-1">
              {member.member_code}
            </span>
            <div className="mt-3">
              <StatusChip
                label={member.status}
                variant={
                  member.status === 'ACTIVE'
                    ? 'success'
                    : member.status === 'EXPIRING'
                    ? 'warning'
                    : 'error'
                }
              />
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-border-light text-sm">
            <div className="flex items-center gap-3 text-text-secondary">
              <Phone size={16} className="text-text-tertiary" />
              <span>{member.phone}</span>
            </div>
            <div className="flex items-center gap-3 text-text-secondary">
              <Mail size={16} className="text-text-tertiary" />
              <span>{member.email ?? 'No email on file'}</span>
            </div>
            {member.emergency_contact && (
              <div className="flex items-center gap-3 text-text-secondary">
                <ShieldCheck size={16} className="text-text-tertiary" />
                <span>Emergency: {member.emergency_contact}</span>
              </div>
            )}
            {member.dob && (
              <div className="flex items-center gap-3 text-text-secondary">
                <Calendar size={16} className="text-text-tertiary" />
                <span>DOB: {formatDateIST(member.dob)}</span>
              </div>
            )}
          </div>
        </Card>

        {/* Right Column: Active Subscription & Bookings History */}
        <div className="lg:col-span-2 space-y-6">
          {/* Active Plan Card */}
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-text-tertiary uppercase tracking-wider block mb-0.5">
                  Current Membership Plan
                </span>
                <h3 className="text-xl font-extrabold text-primary-600">
                  {member.membership?.plan_code ?? 'WALKIN'} Tier
                </h3>
              </div>
              <StatusChip
                label={member.membership?.status ?? 'NONE'}
                variant={member.membership?.status === 'ACTIVE' ? 'success' : 'error'}
              />
            </div>

            {member.membership && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2 border-t border-border-light text-xs">
                <div>
                  <span className="text-text-tertiary block mb-0.5">Valid From</span>
                  <span className="font-semibold text-text-primary">{formatDateIST(member.membership.start_date)}</span>
                </div>
                <div>
                  <span className="text-text-tertiary block mb-0.5">Expires On</span>
                  <span className="font-semibold text-text-primary">{formatDateIST(member.membership.end_date)}</span>
                </div>
                <div>
                  <span className="text-text-tertiary block mb-0.5">Discounts</span>
                  <span className="font-semibold text-text-primary">
                    {member.membership.plan_code === 'GOLD' ? '15% Shop & Bar' : member.membership.plan_code === 'SILVER' ? '5% Shop & Bar' : '10% Shop & Bar'}
                  </span>
                </div>
              </div>
            )}
          </Card>

          {/* Bookings History */}
          <div className="space-y-3">
            <h3 className="text-base font-bold text-text-primary">Court Bookings History</h3>
            {bookingsLoading ? (
              <p className="text-xs text-text-tertiary py-4 text-center">Loading bookings...</p>
            ) : (
              <DataTable
                columns={bookingColumns as any}
                data={(memberBookings ?? []) as any}
                keyExtractor={(b: any) => b.id}
                emptyMessage="No bookings on record for this member"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
