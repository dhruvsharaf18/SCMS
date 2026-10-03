import React, { useState } from 'react'
import type { Employee, StaffRole } from '../../api/types'
import { useEmployees, useCreateEmployee, useUpdateEmployee } from '../../api/hooks'
import { useAuth } from '../../hooks/useAuth'
import { formatMoney } from '../../lib/format'
import { Card, Button, StatusChip, Modal, PillTabs, useToast } from '../../components/ui'
import { UserPlus, Pencil, UserX, UserCheck, KeyRound, Info, AlertTriangle } from 'lucide-react'

const ROLE_LABELS: Record<StaffRole, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  FRONT_DESK: 'Front Desk',
  BAR_STAFF: 'Bar Staff',
}

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-border-light bg-canvas text-sm text-text-primary focus:outline-none focus:border-primary-500 focus:bg-surface'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-text-secondary mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-text-tertiary mt-1">{hint}</span>}
    </label>
  )
}

interface FormState {
  full_name: string
  title: string
  salary_rupees: string
  with_login: boolean
  email: string
  role: StaffRole
  password: string
}

const EMPTY_FORM: FormState = {
  full_name: '',
  title: '',
  salary_rupees: '',
  with_login: false,
  email: '',
  role: 'FRONT_DESK',
  password: '',
}

export default function StaffHR() {
  const { user } = useAuth()
  const { toast } = useToast()
  const isOwner = user?.role === 'OWNER'

  const [view, setView] = useState('ACTIVE')
  const { data: employees = [], isLoading, error } = useEmployees(view === 'ALL')
  const createEmployee = useCreateEmployee()
  const updateEmployee = useUpdateEmployee()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<Employee | null>(null)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))

  const openAdd = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setFormOpen(true)
  }

  const openEdit = (employee: Employee) => {
    setEditing(employee)
    setForm({
      ...EMPTY_FORM,
      full_name: employee.full_name,
      title: employee.title ?? '',
      salary_rupees: String(employee.monthly_salary_paise / 100),
    })
    setFormError(null)
    setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    const salary = Math.round(Number(form.salary_rupees) * 100)
    if (!Number.isFinite(salary) || salary < 0) {
      setFormError('Enter a valid monthly salary.')
      return
    }
    try {
      if (editing) {
        await updateEmployee.mutateAsync({
          id: editing.id,
          changes: { full_name: form.full_name.trim(), title: form.title.trim() || null, monthly_salary_paise: salary },
        })
        toast(`${form.full_name} updated`, 'success')
      } else {
        await createEmployee.mutateAsync({
          full_name: form.full_name.trim(),
          title: form.title.trim() || undefined,
          monthly_salary_paise: salary,
          login: form.with_login
            ? { email: form.email.trim(), password: form.password, role: form.role }
            : undefined,
        })
        toast(
          form.with_login ? `${form.full_name} added. They can sign in as ${form.email.trim()}` : `${form.full_name} added`,
          'success',
        )
      }
      setFormOpen(false)
    } catch (err: any) {
      setFormError(err?.error?.message ?? 'Could not save the employee.')
    }
  }

  const toggleActive = async (employee: Employee) => {
    try {
      await updateEmployee.mutateAsync({ id: employee.id, changes: { is_active: !employee.is_active } })
      toast(employee.is_active ? `${employee.full_name} deactivated` : `${employee.full_name} reactivated`, 'success')
    } catch (err: any) {
      toast(err?.error?.message ?? 'Could not update the employee.', 'error')
    }
    setConfirmTarget(null)
  }

  const canToggle = (employee: Employee): { allowed: boolean; reason?: string } => {
    if (employee.user_id !== null && employee.user_id === user?.id) return { allowed: false, reason: 'This is you' }
    if (employee.user_id !== null && !isOwner) return { allowed: false, reason: 'Owner only (has a login)' }
    return { allowed: true }
  }

  const saving = createEmployee.isPending || updateEmployee.isPending

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Staff</h1>
          <p className="text-sm text-text-secondary mt-1">Add, edit and deactivate employees and their staff logins</p>
        </div>
        <Button icon={UserPlus} onClick={openAdd} className="touch-target">
          Add employee
        </Button>
      </div>

      <PillTabs
        tabs={[
          { id: 'ACTIVE', label: 'Active' },
          { id: 'ALL', label: 'All (incl. inactive)' },
        ]}
        activeId={view}
        onChange={setView}
        size="sm"
      />

      {error ? (
        <Card className="p-6 text-center text-sm text-text-secondary flex flex-col items-center gap-2">
          <AlertTriangle size={20} className="text-accent-red" />
          {error.error?.message ?? 'Could not load employees.'}
        </Card>
      ) : isLoading ? (
        <Card className="p-6 text-center text-xs text-text-tertiary animate-pulse">Loading staff...</Card>
      ) : employees.length === 0 ? (
        <Card className="p-8 text-center space-y-3">
          <p className="text-sm font-bold text-text-primary">No employees yet</p>
          <p className="text-xs text-text-secondary">Add your first employee to start rostering shifts and running payroll.</p>
          <Button icon={UserPlus} onClick={openAdd} className="mx-auto">
            Add employee
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {employees.map((employee) => {
            const toggle = canToggle(employee)
            return (
              <Card key={employee.id} className={`p-5 space-y-4 ${employee.is_active ? '' : 'opacity-70'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-base text-text-primary truncate">{employee.full_name}</p>
                    <p className="text-xs text-text-secondary">{employee.title || 'No title'}</p>
                  </div>
                  <StatusChip label={employee.is_active ? 'Active' : 'Inactive'} variant={employee.is_active ? 'success' : 'neutral'} />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-3 rounded-xl bg-canvas">
                    <p className="text-[10px] uppercase font-semibold tracking-wider text-text-tertiary">Monthly salary</p>
                    <p className="font-bold text-text-primary">{formatMoney(employee.monthly_salary_paise)}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-canvas min-w-0">
                    <p className="text-[10px] uppercase font-semibold tracking-wider text-text-tertiary">Login</p>
                    {employee.login_email ? (
                      <>
                        <p className="font-bold text-text-primary">
                          {employee.login_role ? ROLE_LABELS[employee.login_role] : ''}
                          {employee.login_active === false && <span className="text-ink font-bold"> · disabled</span>}
                        </p>
                        <p className="text-[11px] text-text-secondary truncate" title={employee.login_email}>
                          {employee.login_email}
                        </p>
                      </>
                    ) : (
                      <p className="font-semibold text-text-tertiary">No login</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button variant="secondary" size="sm" icon={Pencil} onClick={() => openEdit(employee)}>
                    Edit
                  </Button>
                  {toggle.allowed ? (
                    <Button
                      variant={employee.is_active ? 'ghost' : 'secondary'}
                      size="sm"
                      icon={employee.is_active ? UserX : UserCheck}
                      onClick={() => setConfirmTarget(employee)}
                      className={employee.is_active ? 'text-ink hover:bg-status-error' : ''}
                    >
                      {employee.is_active ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  ) : (
                    <span className="text-[11px] text-text-tertiary">{toggle.reason}</span>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Add / edit ── */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? `Edit ${editing.full_name}` : 'Add employee'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Full name">
            <input className={inputClass} value={form.full_name} onChange={(e) => set('full_name', e.target.value)} maxLength={120} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Job title">
              <input className={inputClass} value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={60} placeholder="e.g. Coach" />
            </Field>
            <Field label="Monthly salary (₹)">
              <input
                className={inputClass}
                type="number"
                min={0}
                step="0.01"
                value={form.salary_rupees}
                onChange={(e) => set('salary_rupees', e.target.value)}
                required
              />
            </Field>
          </div>

          {!editing &&
            (isOwner ? (
              <div className="p-4 rounded-2xl border border-border-light space-y-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-text-primary cursor-pointer">
                  <input type="checkbox" checked={form.with_login} onChange={(e) => set('with_login', e.target.checked)} />
                  <KeyRound size={14} /> Give them a staff login
                </label>
                {form.with_login && (
                  <>
                    <Field label="Login email">
                      <input className={inputClass} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Role">
                        <select className={inputClass} value={form.role} onChange={(e) => set('role', e.target.value as StaffRole)}>
                          {(Object.keys(ROLE_LABELS) as StaffRole[]).map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Temporary password" hint="10+ chars, upper, lower and a digit">
                        <input
                          className={inputClass}
                          type="text"
                          autoComplete="new-password"
                          value={form.password}
                          onChange={(e) => set('password', e.target.value)}
                          required
                        />
                      </Field>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-text-tertiary flex items-start gap-1.5">
                <Info size={12} className="mt-0.5 flex-shrink-0" />
                Only the owner can create staff logins. This adds the employee for rostering and payroll only.
              </p>
            ))}

          {formError && <p className="p-3 rounded-xl bg-status-error border border-status-error-accent text-xs text-ink font-semibold">{formError}</p>}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-light">
            <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? 'Save changes' : 'Add employee'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Deactivate / reactivate confirmation ── */}
      <Modal
        open={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        title={confirmTarget?.is_active ? `Deactivate ${confirmTarget?.full_name}?` : `Reactivate ${confirmTarget?.full_name}?`}
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            {confirmTarget?.is_active
              ? 'They will be left out of future payroll runs. Past shifts and payroll stay on record.'
              : 'They will be included in payroll runs again.'}
            {confirmTarget?.login_email &&
              (confirmTarget.is_active
                ? ` Their login (${confirmTarget.login_email}) will be disabled and they will be signed out everywhere.`
                : ` Their login (${confirmTarget.login_email}) will work again.`)}
          </p>
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setConfirmTarget(null)}>
              Cancel
            </Button>
            <Button
              variant={confirmTarget?.is_active ? 'danger' : 'primary'}
              loading={updateEmployee.isPending}
              onClick={() => confirmTarget && toggleActive(confirmTarget)}
            >
              {confirmTarget?.is_active ? 'Deactivate' : 'Reactivate'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
