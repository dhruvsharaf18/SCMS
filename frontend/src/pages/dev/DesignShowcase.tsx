import { useState } from 'react'
import {
  Card,
  SectionHeader,
  PillTabs,
  Avatar,
  AvatarStack,
  StatusChip,
  StatCard,
  Button,
  Modal,
  Drawer,
  DataTable,
  EmptyState,
  Skeleton,
  StatCardSkeleton,
  TableRowSkeleton,
  useToast,
} from '../../components/ui'
import type { Column } from '../../components/ui'
import {
  Users,
  ShoppingBag,
  CreditCard,
  CalendarDays,
  Plus,
  Download,
  Trash2,
  Search,
} from 'lucide-react'

/**
 * /dev/design — renders every UI component once for visual QA.
 */
export default function DesignShowcase() {
  const [activeTab, setActiveTab] = useState('overview')
  const [modalOpen, setModalOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { toast } = useToast()

  return (
    <div className="space-y-10 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-text-primary mb-1">Design System</h1>
        <p className="text-sm text-text-secondary">
          Every reusable component rendered once for eyeball testing.
        </p>
      </div>

      {/* ── Buttons ─────────────────────────────────────────── */}
      <section>
        <SectionHeader title="Buttons" className="mb-4" />
        <Card>
          <div className="space-y-4">
            <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Variants</p>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
            </div>

            <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Pills</p>
            <div className="flex flex-wrap gap-3">
              <Button pill variant="primary" icon={Plus}>New Member</Button>
              <Button pill variant="secondary" icon={Download}>Export CSV</Button>
              <Button pill variant="ghost" icon={Search}>Search</Button>
            </div>

            <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Sizes</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </div>

            <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">States</p>
            <div className="flex flex-wrap gap-3">
              <Button loading>Loading</Button>
              <Button disabled>Disabled</Button>
            </div>
          </div>
        </Card>
      </section>

      {/* ── Pill Tabs ──────────────────────────────────────── */}
      <section>
        <SectionHeader title="Pill Tabs" className="mb-4" />
        <Card>
          <div className="space-y-4">
            <PillTabs
              tabs={[
                { id: 'overview', label: 'Overview' },
                { id: 'bookings', label: 'Bookings' },
                { id: 'members', label: 'Members' },
                { id: 'revenue', label: 'Revenue' },
              ]}
              activeId={activeTab}
              onChange={setActiveTab}
            />
            <PillTabs
              size="sm"
              tabs={[
                { id: 'today', label: 'Today' },
                { id: 'week', label: 'This Week' },
                { id: 'month', label: 'This Month' },
              ]}
              activeId="today"
              onChange={() => {}}
            />
          </div>
        </Card>
      </section>

      {/* ── Stat Cards ─────────────────────────────────────── */}
      <section>
        <SectionHeader title="Stat Cards" viewAllTo="#" className="mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Revenue"
            value="₹2,45,000"
            delta={12.5}
            icon={CreditCard}
            iconBg="bg-primary-50"
            iconColor="text-primary-500"
          />
          <StatCard
            label="Court Bookings"
            value="28"
            delta={-3.2}
            icon={CalendarDays}
            iconBg="bg-primary-500"
            iconColor="text-ink"
          />
          <StatCard
            label="New Members"
            value="3"
            delta={0}
            icon={Users}
            iconBg="bg-surface-dark"
            iconColor="text-white"
          />
          <StatCard
            label="Shop Sales"
            value="₹90,000"
            delta={8.7}
            icon={ShoppingBag}
            iconBg="bg-primary-500"
            iconColor="text-ink"
          />
        </div>
      </section>

      {/* ── Status Chips ───────────────────────────────────── */}
      <section>
        <SectionHeader title="Status Chips" className="mb-4" />
        <Card>
          <div className="space-y-4">
            <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Pill style</p>
            <div className="flex flex-wrap gap-2">
              <StatusChip label="Active" variant="success" />
              <StatusChip label="Expiring" variant="warning" />
              <StatusChip label="Expired" variant="error" />
              <StatusChip label="Paid" variant="info" />
              <StatusChip label="Pending" variant="pending" />
              <StatusChip label="Draft" variant="neutral" />
            </div>
            <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Dot style</p>
            <div className="flex flex-wrap gap-4">
              <StatusChip label="Online" variant="success" dot />
              <StatusChip label="Low stock" variant="warning" dot />
              <StatusChip label="Locked" variant="error" dot />
            </div>
          </div>
        </Card>
      </section>

      {/* ── Avatars ────────────────────────────────────────── */}
      <section>
        <SectionHeader title="Avatars & Stack" className="mb-4" />
        <Card>
          <div className="space-y-4">
            <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Sizes</p>
            <div className="flex items-center gap-3">
              <Avatar name="Meera Iyer" size="xs" />
              <Avatar name="Arjun Singh" size="sm" />
              <Avatar name="Sana Mirza" size="md" />
              <Avatar name="Karan Shah" size="lg" />
            </div>
            <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Stack</p>
            <AvatarStack
              users={[
                { name: 'Meera Iyer' },
                { name: 'Arjun Singh' },
                { name: 'Sana Mirza' },
                { name: 'Karan Shah' },
                { name: 'Ravi Kumar' },
              ]}
              max={3}
            />
          </div>
        </Card>
      </section>

      {/* ── Cards ──────────────────────────────────────────── */}
      <section>
        <SectionHeader title="Cards" className="mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <h3 className="font-bold text-text-primary mb-1">Default Card</h3>
            <p className="text-sm text-text-secondary">White, rounded-3xl, soft shadow, generous padding.</p>
          </Card>
          <Card onClick={() => toast('Card clicked!', 'info')}>
            <h3 className="font-bold text-text-primary mb-1">Interactive Card</h3>
            <p className="text-sm text-text-secondary">Click me — has hover & active shadow transitions.</p>
          </Card>
        </div>
      </section>

      {/* ── Data Table ─────────────────────────────────────── */}
      <section>
        <SectionHeader title="Data Table" viewAllTo="#" viewAllLabel="See all members" className="mb-4" />
        <Card noPadding>
          <DataTable
            columns={sampleColumns}
            data={sampleData}
            keyExtractor={(r) => r.id as number}
            onRowClick={(r) => toast(`Clicked: ${r.name}`, 'info')}
          />
        </Card>
      </section>

      {/* ── Empty State ────────────────────────────────────── */}
      <section>
        <SectionHeader title="Empty State" className="mb-4" />
        <Card>
          <EmptyState
            title="No bookings yet"
            description="When you create your first booking, it will appear here."
            action={<Button pill icon={Plus}>Create Booking</Button>}
          />
        </Card>
      </section>

      {/* ── Skeletons ──────────────────────────────────────── */}
      <section>
        <SectionHeader title="Skeletons" className="mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
        <Card noPadding>
          <TableRowSkeleton cols={4} />
          <TableRowSkeleton cols={4} />
          <TableRowSkeleton cols={4} />
        </Card>
      </section>

      {/* ── Modal & Drawer ─────────────────────────────────── */}
      <section>
        <SectionHeader title="Modal & Drawer" className="mb-4" />
        <Card>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setModalOpen(true)}>Open Modal</Button>
            <Button variant="secondary" onClick={() => setDrawerOpen(true)}>Open Drawer</Button>
          </div>
        </Card>

        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Confirm Action">
          <p className="text-sm text-text-secondary mb-4">
            Are you sure you want to delete this booking? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="danger" icon={Trash2} onClick={() => { setModalOpen(false); toast('Deleted!', 'error') }}>
              Delete
            </Button>
          </div>
        </Modal>

        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Filter">
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">Filter content goes here.</p>
            <Button pill className="w-full" onClick={() => setDrawerOpen(false)}>Apply Filters</Button>
          </div>
        </Drawer>
      </section>

      {/* ── Toasts ─────────────────────────────────────────── */}
      <section>
        <SectionHeader title="Toasts" className="mb-4" />
        <Card>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => toast('Member registered successfully.', 'success')}>
              Success Toast
            </Button>
            <Button variant="secondary" onClick={() => toast('That slot was just booked.', 'error')}>
              Error Toast
            </Button>
            <Button variant="secondary" onClick={() => toast('Membership expires in 3 days.', 'warning')}>
              Warning Toast
            </Button>
            <Button variant="secondary" onClick={() => toast('New enquiry received.', 'info')}>
              Info Toast
            </Button>
          </div>
        </Card>
      </section>

      {/* ── Hatch Pattern ──────────────────────────────────── */}
      <section>
        <SectionHeader title="Hatch Pattern (Unavailable cells)" className="mb-4" />
        <div className="grid grid-cols-4 gap-2">
          <div className="h-16 rounded-xl bg-primary-50 flex items-center justify-center text-xs font-medium text-primary-600">
            Free
          </div>
          <div className="h-16 rounded-xl bg-status-error flex items-center justify-center text-xs font-medium text-status-error-text">
            Booked
          </div>
          <div className="h-16 rounded-xl bg-status-info flex items-center justify-center text-xs font-medium text-status-info-text">
            Social
          </div>
          <div className="h-16 rounded-xl pattern-hatch bg-canvas flex items-center justify-center text-xs font-medium text-text-tertiary">
            Unavailable
          </div>
        </div>
      </section>

      {/* ── Typography ─────────────────────────────────────── */}
      <section>
        <SectionHeader title="Typography" className="mb-4" />
        <Card>
          <div className="space-y-3">
            <h1 className="text-3xl font-bold text-text-primary">Heading 1 — Bold</h1>
            <h2 className="text-2xl font-bold text-text-primary">Heading 2 — Bold</h2>
            <h3 className="text-xl font-semibold text-text-primary">Heading 3 — Semibold</h3>
            <h4 className="text-lg font-semibold text-text-primary">Heading 4 — Semibold</h4>
            <p className="text-base text-text-primary">Body text — default primary colour</p>
            <p className="text-sm text-text-secondary">Small text — secondary grey</p>
            <p className="text-xs text-text-tertiary">Caption — tertiary muted</p>
          </div>
        </Card>
      </section>
    </div>
  )
}

// ── Sample data for the table ──────────────────────────────────────────────
type SampleRow = Record<string, unknown> & {
  id: number
  name: string
  plan: string
  status: string
  phone: string
}

const sampleColumns: Column<SampleRow>[] = [
  { key: 'name', header: 'Name', sortable: true },
  { key: 'plan', header: 'Plan', sortable: true },
  {
    key: 'status',
    header: 'Status',
    render: (row) => {
      const variant = row.status === 'Active' ? 'success' : row.status === 'Expiring' ? 'warning' : 'error'
      return <StatusChip label={row.status} variant={variant} />
    },
  },
  { key: 'phone', header: 'Phone', hideOnMobile: true },
]

const sampleData: SampleRow[] = [
  { id: 1, name: 'Karan Shah', plan: 'Gold', status: 'Active', phone: '98765 43210' },
  { id: 2, name: 'Priya Nair', plan: 'Silver', status: 'Expiring', phone: '98765 43211' },
  { id: 3, name: 'Rahul Mehta', plan: 'Junior', status: 'Active', phone: '98765 43212' },
  { id: 4, name: 'Aisha Verma', plan: 'Gold', status: 'Expired', phone: '98765 43213' },
  { id: 5, name: 'Dev Patel', plan: 'Silver', status: 'Active', phone: '98765 43214' },
]
