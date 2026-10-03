import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  UserSearch,
  Plus,
  MessageSquare,
  FileText,
  UserCheck,
  Calendar,
  Phone,
  Mail,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Send,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { StatusChip, type ChipVariant } from '../../components/ui/StatusChip'
import { Drawer } from '../../components/ui/Drawer'
import { Button } from '../../components/ui/Button'
import { PillTabs, type PillTab } from '../../components/ui/PillTabs'
import { formatDate, formatTime, formatINR, cn } from '../../lib/utils'
import {
  useLeads,
  useUpdateLead,
  useLeadNotes,
  useAddLeadNote,
  useLeadQuotes,
  useAddLeadQuote,
  useConvertLead,
  useCreateMember,
} from '../../api/hooks'
import type { Lead, LeadStatus, LeadInterest, PaymentMethod } from '../../api/types'

const STATUS_TABS: PillTab[] = [
  { id: 'ALL', label: 'All Leads' },
  { id: 'NEW', label: 'New' },
  { id: 'CONTACTED', label: 'Contacted' },
  { id: 'QUOTED', label: 'Quoted' },
  { id: 'WON', label: 'Won' },
  { id: 'LOST', label: 'Lost' },
]

const STATUS_BADGE_VARIANT: Record<LeadStatus, ChipVariant> = {
  NEW: 'info',
  CONTACTED: 'warning',
  QUOTED: 'pending',
  WON: 'success',
  LOST: 'error',
}

const INTEREST_BADGE_VARIANT: Record<LeadInterest, ChipVariant> = {
  TRIAL: 'info',
  MEMBERSHIP: 'pending',
  CORPORATE: 'success',
  OTHER: 'warning',
}

const PLANS = [
  { id: 1, name: 'Gold', price: 300000, desc: 'Free Tennis & Padel, 15% discount' },
  { id: 2, name: 'Silver', price: 150000, desc: 'Discounts on all courts, 5% off' },
  { id: 3, name: 'Junior', price: 80000, desc: 'Youth plan (under 18), 10% off' },
]

export default function StaffLeads() {
  const { user } = useAuth()
  const [activeStatus, setActiveStatus] = useState<string>('ALL')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [activeDrawerTab, setActiveDrawerTab] = useState<'details' | 'notes' | 'quotes'>('details')

  // Register Member prefill modal state
  const [registerDrawerOpen, setRegisterDrawerOpen] = useState(false)
  const [convertLeadId, setConvertLeadId] = useState<number | null>(null)
  const [regFullName, setRegFullName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPhone, setRegPhone] = useState('')
  const [regPlanId, setRegPlanId] = useState<number>(1)
  const [regPaymentMethod, setRegPaymentMethod] = useState<PaymentMethod>('UPI')
  const [regDob, setRegDob] = useState('')
  const [regEmergency, setRegEmergency] = useState('')
  const [regError, setRegError] = useState<string | null>(null)

  // Forms inside lead drawer
  const [newNoteText, setNewNoteText] = useState('')
  const [quoteRupees, setQuoteRupees] = useState('')
  const [quoteDesc, setQuoteDesc] = useState('')
  const [quoteValidUntil, setQuoteValidUntil] = useState('')
  const [drawerError, setDrawerError] = useState<string | null>(null)

  // Role check: ONLY OWNER, MANAGER, FRONT_DESK allowed
  if (user && user.role !== 'OWNER' && user.role !== 'MANAGER' && user.role !== 'FRONT_DESK') {
    return <Navigate to={user.role === 'MEMBER' ? '/portal' : '/staff'} replace />
  }

  // Query leads
  const { data: leadsData, isLoading, isError, error, refetch } = useLeads({
    status: activeStatus === 'ALL' ? undefined : (activeStatus as LeadStatus),
    page_size: 100,
  })

  // Mutations
  const updateLeadMutation = useUpdateLead()
  const addNoteMutation = useAddLeadNote()
  const addQuoteMutation = useAddLeadQuote()
  const convertLeadMutation = useConvertLead()
  const createMemberMutation = useCreateMember()

  // Additional detail queries for selected lead
  const leadId = selectedLead?.id ?? 0
  const { data: notesData, isLoading: notesLoading } = useLeadNotes(leadId)
  const { data: quotesData, isLoading: quotesLoading } = useLeadQuotes(leadId)

  const leads = leadsData?.items ?? []
  const totalLeads = leadsData?.total ?? leads.length

  const handleStatusChange = async (newStatus: LeadStatus) => {
    if (!selectedLead) return
    setDrawerError(null)
    try {
      const updated = await updateLeadMutation.mutateAsync({ leadId: selectedLead.id, data: { status: newStatus } })
      setSelectedLead(updated)
    } catch (err: any) {
      setDrawerError(err?.message || err?.detail || 'Failed to update lead status')
    }
  }

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedLead || !newNoteText.trim()) return
    setDrawerError(null)
    try {
      await addNoteMutation.mutateAsync({ leadId: selectedLead.id, body: newNoteText.trim() })
      setNewNoteText('')
    } catch (err: any) {
      setDrawerError(err?.message || err?.detail || 'Failed to add note')
    }
  }

  const handleCreateQuote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedLead || !quoteRupees || !quoteDesc.trim()) return
    setDrawerError(null)

    const rupees = parseFloat(quoteRupees)
    if (isNaN(rupees) || rupees <= 0) {
      setDrawerError('Please enter a valid positive quote amount')
      return
    }

    // Convert rupees to paise using integer math
    const amount_paise = Math.round(rupees * 100)

    try {
      await addQuoteMutation.mutateAsync({
        leadId: selectedLead.id,
        quote: {
          amount_paise,
          description: quoteDesc.trim(),
          valid_until: quoteValidUntil || undefined,
        },
      })
      setQuoteRupees('')
      setQuoteDesc('')
      setQuoteValidUntil('')
      // Refresh lead details if status updated to QUOTED
      if (selectedLead.status === 'NEW' || selectedLead.status === 'CONTACTED') {
        setSelectedLead({ ...selectedLead, status: 'QUOTED' })
      }
    } catch (err: any) {
      setDrawerError(err?.message || err?.detail || 'Failed to create quote')
    }
  }

  const handleConvertClick = async () => {
    if (!selectedLead) return
    setDrawerError(null)
    try {
      const res = await convertLeadMutation.mutateAsync({ leadId: selectedLead.id })
      const prefill = res.member_prefill
      setConvertLeadId(res.lead_id || selectedLead.id)
      setRegFullName(prefill.full_name || selectedLead.name || '')
      setRegEmail(prefill.email || selectedLead.email || '')
      setRegPhone(prefill.phone || selectedLead.phone || '')
      setRegPlanId(prefill.plan_id || 1)
      setRegPaymentMethod('UPI')
      setRegDob('')
      setRegEmergency('')
      setRegError(null)
      setRegisterDrawerOpen(true)
    } catch (err: any) {
      setDrawerError(err?.message || err?.detail || 'Failed to prepare lead conversion')
    }
  }

  const handleRegisterMember = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegError(null)
    try {
      await createMemberMutation.mutateAsync({
        full_name: regFullName.trim(),
        email: regEmail.trim() || undefined,
        phone: regPhone.trim(),
        plan_id: regPlanId,
        payment_method: regPaymentMethod,
        dob: regDob || undefined,
        emergency_contact: regEmergency || undefined,
        lead_id: convertLeadId,
      })
      setRegisterDrawerOpen(false)
      if (selectedLead && selectedLead.id === convertLeadId) {
        setSelectedLead({ ...selectedLead, status: 'WON' })
      }
      refetch()
    } catch (err: any) {
      setRegError(err?.message || err?.detail || 'Failed to register member')
    }
  }

  const columns: Column<Lead>[] = [
    {
      key: 'name',
      header: 'Lead Name',
      render: (lead) => (
        <div>
          <p className="font-semibold text-text-primary text-sm">{lead.name}</p>
          {lead.preferred_plan_id && (
            <p className="text-[11px] text-text-tertiary">
              Prefers: {PLANS.find((p) => p.id === lead.preferred_plan_id)?.name ?? `Plan #${lead.preferred_plan_id}`}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'interest',
      header: 'Interest',
      render: (lead) => (
        <StatusChip
          label={lead.interest}
          variant={INTEREST_BADGE_VARIANT[lead.interest] ?? 'neutral'}
        />
      ),
    },
    {
      key: 'contact',
      header: 'Contact Info',
      render: (lead) => (
        <div className="space-y-0.5 text-xs text-text-secondary">
          {lead.phone && (
            <div className="flex items-center gap-1.5">
              <Phone size={12} className="text-text-tertiary" />
              <span>{lead.phone}</span>
            </div>
          )}
          {lead.email && (
            <div className="flex items-center gap-1.5">
              <Mail size={12} className="text-text-tertiary" />
              <span className="truncate max-w-[160px]">{lead.email}</span>
            </div>
          )}
          {!lead.phone && !lead.email && <span className="text-text-tertiary italic">No contact provided</span>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (lead) => (
        <StatusChip
          label={lead.status}
          variant={STATUS_BADGE_VARIANT[lead.status] ?? 'neutral'}
        />
      ),
    },
    {
      key: 'created_at',
      header: 'Created (IST)',
      render: (lead) => (
        <div className="text-xs text-text-secondary">
          <p>{formatDate(lead.created_at)}</p>
          <p className="text-[11px] text-text-tertiary">{formatTime(lead.created_at)}</p>
        </div>
      ),
    },
  ]

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">Leads & Enquiries</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-surface border border-border-light text-xs font-semibold text-text-secondary">
              Total: {totalLeads}
            </span>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Track, nurture, quote, and convert sales prospects into club members.
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="overflow-x-auto pb-1">
        <PillTabs tabs={STATUS_TABS} activeId={activeStatus} onChange={setActiveStatus} />
      </div>

      {/* Main Table */}
      <DataTable
        data={leads}
        columns={columns}
        keyExtractor={(lead) => lead.id}
        onRowClick={(lead) => {
          setSelectedLead(lead)
          setActiveDrawerTab('details')
          setDrawerError(null)
        }}
        emptyMessage={`No leads found for status "${activeStatus}"`}
      />

      {/* ── ROW DRAWER: LEAD DETAILS, NOTES, QUOTES ─────────────────────── */}
      <Drawer
        open={!!selectedLead}
        onClose={() => {
          setSelectedLead(null)
          setDrawerError(null)
        }}
        title={selectedLead ? selectedLead.name : 'Lead Details'}
      >
        {selectedLead && (
          <div className="space-y-6">
            {drawerError && (
              <div className="p-3 rounded-2xl bg-status-error border border-status-error-text/30 flex items-start gap-2.5">
                <AlertCircle size={18} className="text-status-error-text flex-shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-status-error-text">{drawerError}</p>
              </div>
            )}

            {/* Status Bar & Quick Actions */}
            <div className="p-4 rounded-2xl bg-surface border border-border-light space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-text-tertiary uppercase tracking-wider">Status:</span>
                  <StatusChip label={selectedLead.status} variant={STATUS_BADGE_VARIANT[selectedLead.status]} />
                </div>
                {selectedLead.status !== 'WON' && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={handleConvertClick}
                    loading={convertLeadMutation.isPending}
                    icon={UserCheck}
                  >
                    Convert to Member
                  </Button>
                )}
              </div>

              {/* Status change selector */}
              <div>
                <label className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider block mb-1">
                  Change Status:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {(['NEW', 'CONTACTED', 'QUOTED', 'WON', 'LOST'] as LeadStatus[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => handleStatusChange(st)}
                      disabled={updateLeadMutation.isPending || selectedLead.status === st}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors touch-target',
                        selectedLead.status === st
                          ? 'bg-primary-600 text-white shadow-pill'
                          : 'bg-canvas text-text-secondary hover:bg-border-light hover:text-text-primary'
                      )}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Drawer Sub-navigation */}
            <div className="flex border-b border-border-light">
              <button
                type="button"
                onClick={() => setActiveDrawerTab('details')}
                className={cn(
                  'px-4 py-2.5 text-xs font-bold border-b-2 transition-colors',
                  activeDrawerTab === 'details'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                )}
              >
                Overview
              </button>
              <button
                type="button"
                onClick={() => setActiveDrawerTab('notes')}
                className={cn(
                  'px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5',
                  activeDrawerTab === 'notes'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                )}
              >
                Notes {notesData && notesData.length > 0 && `(${notesData.length})`}
              </button>
              <button
                type="button"
                onClick={() => setActiveDrawerTab('quotes')}
                className={cn(
                  'px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5',
                  activeDrawerTab === 'quotes'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                )}
              >
                Quotes {quotesData && quotesData.length > 0 && `(${quotesData.length})`}
              </button>
            </div>

            {/* TAB 1: DETAILS OVERVIEW */}
            {activeDrawerTab === 'details' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-3 rounded-xl bg-surface border border-border-light space-y-1">
                    <p className="text-[11px] font-bold text-text-tertiary uppercase">Interest</p>
                    <p className="font-semibold text-text-primary">{selectedLead.interest}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-surface border border-border-light space-y-1">
                    <p className="text-[11px] font-bold text-text-tertiary uppercase">Preferred Plan</p>
                    <p className="font-semibold text-text-primary">
                      {selectedLead.preferred_plan_id
                        ? PLANS.find((p) => p.id === selectedLead.preferred_plan_id)?.name ?? `Plan #${selectedLead.preferred_plan_id}`
                        : 'None'}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-surface border border-border-light space-y-1">
                    <p className="text-[11px] font-bold text-text-tertiary uppercase">Phone</p>
                    <p className="font-semibold text-text-primary">{selectedLead.phone || 'N/A'}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-surface border border-border-light space-y-1">
                    <p className="text-[11px] font-bold text-text-tertiary uppercase">Email</p>
                    <p className="font-semibold text-text-primary truncate">{selectedLead.email || 'N/A'}</p>
                  </div>
                </div>

                {/* Plain Text Message */}
                <div className="p-4 rounded-xl bg-surface border border-border-light space-y-2">
                  <p className="text-xs font-bold text-text-tertiary uppercase tracking-wider">Enquiry Message</p>
                  <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
                    {selectedLead.message ? selectedLead.message : <span className="italic text-text-tertiary">No message attached with enquiry</span>}
                  </p>
                </div>

                <div className="text-xs text-text-tertiary space-y-1 pt-2">
                  <p>Created IST: {formatDate(selectedLead.created_at)} {formatTime(selectedLead.created_at)}</p>
                  {selectedLead.assigned_to && <p>Assigned Staff ID: #{selectedLead.assigned_to}</p>}
                </div>
              </div>
            )}

            {/* TAB 2: NOTES */}
            {activeDrawerTab === 'notes' && (
              <div className="space-y-4">
                {/* Add Note Form */}
                <form onSubmit={handleAddNote} className="space-y-2">
                  <textarea
                    rows={3}
                    placeholder="Add internal note about this prospect..."
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    className="w-full p-3 rounded-xl border border-border-light bg-surface text-sm outline-none focus:border-primary-500"
                  />
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!newNoteText.trim() || addNoteMutation.isPending}
                      loading={addNoteMutation.isPending}
                      icon={Plus}
                    >
                      Add Note
                    </Button>
                  </div>
                </form>

                {/* Notes List */}
                <div className="space-y-3">
                  {notesLoading ? (
                    <p className="text-xs text-text-tertiary py-4 text-center">Loading notes...</p>
                  ) : !notesData || notesData.length === 0 ? (
                    <p className="text-xs text-text-tertiary py-4 text-center">No notes recorded yet</p>
                  ) : (
                    notesData.map((note) => (
                      <div key={note.id} className="p-3 rounded-xl bg-surface border border-border-light space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-text-tertiary">
                          <span className="font-semibold text-text-secondary">Staff #{note.author_id}</span>
                          <span>{formatDate(note.created_at)} {formatTime(note.created_at)}</span>
                        </div>
                        <p className="text-xs text-text-primary whitespace-pre-wrap">{note.body}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: QUOTES */}
            {activeDrawerTab === 'quotes' && (
              <div className="space-y-4">
                {/* Create Quote Form */}
                <form onSubmit={handleCreateQuote} className="p-4 rounded-xl bg-surface border border-border-light space-y-3">
                  <p className="text-xs font-bold text-text-tertiary uppercase tracking-wider">Create New Quote</p>
                  <div>
                    <label className="text-xs font-semibold text-text-secondary block mb-1">Amount in Rupees (₹) *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="e.g. 25000"
                      value={quoteRupees}
                      onChange={(e) => setQuoteRupees(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-border-light bg-canvas text-sm outline-none focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-text-secondary block mb-1">Description *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Annual Gold Membership + 2 Coaching Sessions"
                      value={quoteDesc}
                      onChange={(e) => setQuoteDesc(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-border-light bg-canvas text-sm outline-none focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-text-secondary block mb-1">Valid Until (Optional)</label>
                    <input
                      type="date"
                      value={quoteValidUntil}
                      onChange={(e) => setQuoteValidUntil(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-border-light bg-canvas text-xs outline-none focus:border-primary-500"
                    />
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    className="w-full"
                    disabled={addQuoteMutation.isPending}
                    loading={addQuoteMutation.isPending}
                    icon={Send}
                  >
                    Send Quote
                  </Button>
                </form>

                {/* Quotes List */}
                <div className="space-y-3">
                  {quotesLoading ? (
                    <p className="text-xs text-text-tertiary py-4 text-center">Loading quotes...</p>
                  ) : !quotesData || quotesData.length === 0 ? (
                    <p className="text-xs text-text-tertiary py-4 text-center">No quotes created yet</p>
                  ) : (
                    quotesData.map((q) => (
                      <div key={q.id} className="p-3.5 rounded-xl bg-surface border border-border-light space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-sm text-primary-600">{formatINR(q.amount_paise)}</span>
                          <StatusChip
                            label={q.status}
                            variant={q.status === 'ACCEPTED' ? 'success' : q.status === 'REJECTED' ? 'error' : 'info'}
                          />
                        </div>
                        <p className="text-xs text-text-primary">{q.description}</p>
                        {q.valid_until && (
                          <p className="text-[11px] text-text-tertiary">Valid until: {formatDate(q.valid_until)}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* ── REGISTER MEMBER PREFILLED DRAWER ────────────────────────────── */}
      <Drawer
        open={registerDrawerOpen}
        onClose={() => setRegisterDrawerOpen(false)}
        title="Register New Member (From Lead)"
      >
        <form onSubmit={handleRegisterMember} className="space-y-4">
          {regError && (
            <div className="p-3 rounded-2xl bg-status-error border border-status-error-text/30 flex items-start gap-2.5">
              <AlertCircle size={18} className="text-status-error-text flex-shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-status-error-text">{regError}</p>
            </div>
          )}

          <div className="p-3 rounded-xl bg-primary-50 border border-primary-200 text-xs text-primary-800 flex items-center gap-2">
            <Sparkles size={16} className="text-primary-600 flex-shrink-0" />
            <span>Lead prefilled! Completing registration will automatically mark lead as WON.</span>
          </div>

          <div>
            <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider block mb-1">
              Full Name *
            </label>
            <input
              type="text"
              required
              value={regFullName}
              onChange={(e) => setRegFullName(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-border-light bg-surface text-sm outline-none focus:border-primary-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider block mb-1">
              Phone Number
            </label>
            <input
              type="tel"
              value={regPhone}
              onChange={(e) => setRegPhone(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-border-light bg-surface text-sm outline-none focus:border-primary-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider block mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={regEmail}
              onChange={(e) => setRegEmail(e.target.value)}
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
                value={regDob}
                onChange={(e) => setRegDob(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-border-light bg-surface text-xs outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider block mb-1">
                Emergency Contact
              </label>
              <input
                type="tel"
                value={regEmergency}
                onChange={(e) => setRegEmergency(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-border-light bg-surface text-sm outline-none focus:border-primary-500"
              />
            </div>
          </div>

          {/* Membership Plan Selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider block">
              Membership Plan *
            </label>
            <div className="grid grid-cols-3 gap-2">
              {PLANS.map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => setRegPlanId(pl.id)}
                  className={cn(
                    'p-3 rounded-xl border text-left flex flex-col justify-between transition-colors touch-target',
                    regPlanId === pl.id
                      ? 'bg-primary-50 border-primary-500 shadow-pill'
                      : 'bg-surface border-border-light hover:bg-canvas'
                  )}
                >
                  <span className="font-bold text-xs text-text-primary">{pl.name}</span>
                  <span className="font-extrabold text-xs text-primary-600 my-1">{formatINR(pl.price)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider block">
              Payment Method *
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['UPI', 'CARD', 'CASH'] as PaymentMethod[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setRegPaymentMethod(m)}
                  className={cn(
                    'py-2 px-3 rounded-xl border text-xs font-bold transition-colors touch-target',
                    regPaymentMethod === m
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
              Complete Registration
            </Button>
          </div>
        </form>
      </Drawer>
    </div>
  )
}
