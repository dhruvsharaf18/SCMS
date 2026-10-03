import type {
  Court,
  CourtPrice,
  Plan,
  Product,
  MenuItem,
  BarTable,
  Member,
  Booking,
  ShopOrder,
  BarOrder,
  Payment,
  PaymentMethod,
  SourceType,
  SocialSession,
  Tier,
  Sport,
} from '../api/types'
import { getTodayIST, istToUtcIso } from '../lib/format'

export const MOCK_PLANS: Plan[] = [
  { id: 1, code: 'GOLD', name: 'Gold', fee_paise: 300000, duration_days: 30, shop_discount_pct: 15, bar_discount_pct: 15 },
  { id: 2, code: 'SILVER', name: 'Silver', fee_paise: 150000, duration_days: 30, shop_discount_pct: 5, bar_discount_pct: 5 },
  { id: 3, code: 'JUNIOR', name: 'Junior', fee_paise: 80000, duration_days: 30, shop_discount_pct: 10, bar_discount_pct: 10 },
]

export const MOCK_COURT_PRICES: CourtPrice[] = [
  // Tennis
  { id: 1, sport: 'TENNIS', tier: 'GOLD', price_per_hour_paise: 0 },
  { id: 2, sport: 'TENNIS', tier: 'SILVER', price_per_hour_paise: 40000 },
  { id: 3, sport: 'TENNIS', tier: 'JUNIOR', price_per_hour_paise: 25000 },
  { id: 4, sport: 'TENNIS', tier: 'WALKIN', price_per_hour_paise: 60000 },
  // Padel
  { id: 5, sport: 'PADEL', tier: 'GOLD', price_per_hour_paise: 0 },
  { id: 6, sport: 'PADEL', tier: 'SILVER', price_per_hour_paise: 70000 },
  { id: 7, sport: 'PADEL', tier: 'JUNIOR', price_per_hour_paise: 45000 },
  { id: 8, sport: 'PADEL', tier: 'WALKIN', price_per_hour_paise: 100000 },
  // Badminton
  { id: 9, sport: 'BADMINTON', tier: 'GOLD', price_per_hour_paise: 0 },
  { id: 10, sport: 'BADMINTON', tier: 'SILVER', price_per_hour_paise: 20000 },
  { id: 11, sport: 'BADMINTON', tier: 'JUNIOR', price_per_hour_paise: 12000 },
  { id: 12, sport: 'BADMINTON', tier: 'WALKIN', price_per_hour_paise: 30000 },
  // Cricket Net
  { id: 13, sport: 'CRICKET_NET', tier: 'GOLD', price_per_hour_paise: 0 },
  { id: 14, sport: 'CRICKET_NET', tier: 'SILVER', price_per_hour_paise: 50000 },
  { id: 15, sport: 'CRICKET_NET', tier: 'JUNIOR', price_per_hour_paise: 30000 },
  { id: 16, sport: 'CRICKET_NET', tier: 'WALKIN', price_per_hour_paise: 80000 },
]

export const MOCK_COURTS: Court[] = [
  { id: 1, name: 'Tennis 1', sport: 'TENNIS', is_active: true },
  { id: 2, name: 'Tennis 2', sport: 'TENNIS', is_active: true },
  { id: 3, name: 'Padel 1', sport: 'PADEL', is_active: true },
  { id: 4, name: 'Badminton 1', sport: 'BADMINTON', is_active: true },
  { id: 5, name: 'Badminton 2', sport: 'BADMINTON', is_active: true },
  { id: 6, name: 'Cricket Net 1', sport: 'CRICKET_NET', is_active: true },
]

export const MOCK_PRODUCTS: Product[] = [
  { id: 1, sku: 'RKT-001', name: 'Yonex Astrox 88', category: 'RACKET', variant: '3U/G4', description: 'Advanced offensive badminton racket', price_paise: 450000, stock_qty: 6, reorder_level: 3, is_active: true },
  { id: 2, sku: 'RKT-002', name: 'Wilson Pro Staff', category: 'RACKET', variant: '97 v14', description: 'Precision tennis racket for control', price_paise: 980000, stock_qty: 2, reorder_level: 3, is_active: true }, // LOW STOCK
  { id: 3, sku: 'RKT-003', name: 'Head Speed MP', category: 'RACKET', variant: 'Grip 3', description: 'Fast all-court tennis racket', price_paise: 820000, stock_qty: 4, reorder_level: 3, is_active: true },
  { id: 4, sku: 'BAL-001', name: 'Tennis Balls (can of 3)', category: 'BALL', variant: 'Can of 3', description: 'Championship pressurized balls', price_paise: 45000, stock_qty: 40, reorder_level: 10, is_active: true },
  { id: 5, sku: 'BAL-002', name: 'Shuttlecocks (tube of 6)', category: 'BALL', variant: 'Feather', description: 'Tournament grade feather shuttles', price_paise: 60000, stock_qty: 1, reorder_level: 5, is_active: true }, // LOW STOCK
  { id: 6, sku: 'BAL-003', name: 'Padel Balls (can of 3)', category: 'BALL', variant: 'Can of 3', description: 'High durability padel balls', price_paise: 52000, stock_qty: 18, reorder_level: 6, is_active: true },
  { id: 7, sku: 'SHO-001', name: 'Asics Gel Court', category: 'SHOE', variant: 'Size 9', description: 'Non-marking court stability shoes', price_paise: 720000, stock_qty: 5, reorder_level: 2, is_active: true },
  { id: 8, sku: 'SHO-002', name: 'Yonex Power Cushion', category: 'SHOE', variant: 'Size 10', description: 'Cushioned indoor badminton footwear', price_paise: 650000, stock_qty: 2, reorder_level: 3, is_active: true }, // LOW STOCK
  { id: 9, sku: 'ACC-001', name: 'Overgrip (pack of 3)', category: 'ACCESSORY', variant: 'White', description: 'Super absorbent tacky grips', price_paise: 35000, stock_qty: 50, reorder_level: 10, is_active: true },
  { id: 10, sku: 'ACC-002', name: 'Wrist Band', category: 'ACCESSORY', variant: 'Black', description: 'Terry cotton sweatband', price_paise: 25000, stock_qty: 30, reorder_level: 8, is_active: true },
  { id: 11, sku: 'ACC-003', name: 'Racket Bag', category: 'ACCESSORY', variant: '6 Rackets', description: 'Thermal protective kit bag', price_paise: 280000, stock_qty: 7, reorder_level: 3, is_active: true },
  { id: 12, sku: 'APP-001', name: 'Club Polo Shirt', category: 'APPAREL', variant: 'Size L', description: 'Breathable dry-fit polyester polo', price_paise: 150000, stock_qty: 25, reorder_level: 8, is_active: true },
  { id: 13, sku: 'APP-002', name: 'Club Shorts', category: 'APPAREL', variant: 'Size M', description: 'Stretch training shorts with pockets', price_paise: 120000, stock_qty: 20, reorder_level: 8, is_active: true },
  { id: 14, sku: 'APP-003', name: 'Club Cap', category: 'APPAREL', variant: 'Adjustable', description: 'UV protective sports visor cap', price_paise: 60000, stock_qty: 15, reorder_level: 5, is_active: true },
]

export const MOCK_MENU: MenuItem[] = [
  { id: 1, name: 'Masala Chai', category: 'DRINK', price_paise: 4000, is_available: true },
  { id: 2, name: 'Filter Coffee', category: 'DRINK', price_paise: 5000, is_available: true },
  { id: 3, name: 'Fresh Lime Soda', category: 'DRINK', price_paise: 8000, is_available: true },
  { id: 4, name: 'Buttermilk', category: 'DRINK', price_paise: 6000, is_available: true },
  { id: 5, name: 'Protein Shake', category: 'DRINK', price_paise: 18000, is_available: true },
  { id: 6, name: 'Coconut Water', category: 'DRINK', price_paise: 7000, is_available: true },
  { id: 7, name: 'Veg Sandwich', category: 'FOOD', price_paise: 14000, is_available: true },
  { id: 8, name: 'Paneer Tikka', category: 'FOOD', price_paise: 26000, is_available: true },
  { id: 9, name: 'Chicken Roll', category: 'FOOD', price_paise: 22000, is_available: true },
  { id: 10, name: 'Pasta Alfredo', category: 'FOOD', price_paise: 28000, is_available: true },
  { id: 11, name: 'Dal Khichdi', category: 'FOOD', price_paise: 20000, is_available: true },
  { id: 12, name: 'Masala Peanuts', category: 'SNACK', price_paise: 9000, is_available: true },
  { id: 13, name: 'French Fries', category: 'SNACK', price_paise: 12000, is_available: true },
  { id: 14, name: 'Fruit Bowl', category: 'SNACK', price_paise: 15000, is_available: true },
  { id: 15, name: 'Energy Bar', category: 'SNACK', price_paise: 10000, is_available: true },
]

export const MOCK_TABLES: BarTable[] = [
  { id: 1, label: 'Table 1', seats: 4, open_orders: 0, open_total_paise: null, open_order_id: null, open_order_total_paise: null },
  { id: 2, label: 'Table 2', seats: 4, open_orders: 1, open_total_paise: 38000, open_order_id: 1, open_order_total_paise: 38000 },
  { id: 3, label: 'Table 3', seats: 2, open_orders: 0, open_total_paise: null, open_order_id: null, open_order_total_paise: null },
  { id: 4, label: 'Table 4', seats: 6, open_orders: 0, open_total_paise: null, open_order_id: null, open_order_total_paise: null },
  { id: 5, label: 'Table 5', seats: 4, open_orders: 1, open_total_paise: 62000, open_order_id: 2, open_order_total_paise: 62000 },
  { id: 6, label: 'Table 6', seats: 4, open_orders: 0, open_total_paise: null, open_order_id: null, open_order_total_paise: null },
  { id: 7, label: 'Table 7', seats: 8, open_orders: 0, open_total_paise: null, open_order_id: null, open_order_total_paise: null },
  { id: 8, label: 'Table 8', seats: 2, open_orders: 0, open_total_paise: null, open_order_id: null, open_order_total_paise: null },
]

// 30 Members matching SRS 10.1 (5 expiring in 7 days, 3 expired, remainder active)
const MEMBER_NAMES = [
  'Karan Shah', 'Priya Nair', 'Rahul Mehta', 'Aisha Verma', 'Dev Patel',
  'Ananya Roy', 'Rohan Gupta', 'Neha Sharma', 'Vikram Joshi', 'Sneha Kapoor',
  'Aditya Rao', 'Meera Bhatt', 'Varun Menon', 'Pooja Iyer', 'Kabir Sethi',
  'Tanvi Deshmukh', 'Arnav Chopra', 'Simran Kaur', 'Kunal Reddy', 'Shreya Saxena',
  'Harsh Agarwal', 'Rhea Pillai', 'Nikhil Kulkarni', 'Kavita Chawla', 'Siddharth Jain',
  'Deepa Das', 'Akash Singhal', 'Swati Hegde', 'Manish Pandey', 'Bhavna Lal',
]

export function generateMockMembers(): Member[] {
  const today = getTodayIST()
  const [tYear, tMonth, tDay] = today.split('-').map(Number)

  return MEMBER_NAMES.map((name, idx) => {
    const id = idx + 1
    const codeNum = String(id).padStart(6, '0')
    const member_code = `CC-${codeNum}`
    const phone = `98765${String(40000 + id).padStart(5, '0')}`
    const email = id <= 3 ? `member${id}@club.test` : `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`

    let planCode: 'GOLD' | 'SILVER' | 'JUNIOR' = 'GOLD'
    if (id % 3 === 2) planCode = 'SILVER'
    if (id % 3 === 0) planCode = 'JUNIOR'

    // Status logic from SRS:
    // Members 4-8 expire within 7 days
    // Members 9-11 expired (end_date < today)
    // Others active
    let start_date = '2026-09-10'
    let end_date = '2026-11-15'
    let status: 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'NONE' = 'ACTIVE'

    if (id >= 4 && id <= 8) {
      status = 'EXPIRING'
      start_date = '2026-09-06'
      // end date in 3 days
      const expDate = new Date(Date.UTC(tYear, tMonth - 1, tDay + (id - 3)))
      end_date = expDate.toISOString().split('T')[0]
    } else if (id >= 9 && id <= 11) {
      status = 'EXPIRED'
      start_date = '2026-08-01'
      end_date = '2026-09-30'
    }

    return {
      id,
      member_code,
      full_name: name,
      phone,
      email,
      dob: '1992-06-15',
      emergency_contact: '9822001122',
      notes: id === 1 ? 'Club champion 2025' : null,
      tier: (status === 'EXPIRED' ? 'WALKIN' : planCode) as Tier,
      status,
      membership: {
        id,
        plan_code: planCode,
        plan_id: planCode === 'GOLD' ? 1 : planCode === 'SILVER' ? 2 : 3,
        start_date,
        end_date,
        status: status === 'EXPIRED' ? 'CANCELLED' : 'ACTIVE',
      },
    }
  })
}

export function generateInitialBookings(members: Member[]): Booking[] {
  const today = getTodayIST()
  const b: Booking[] = []

  // Create a few bookings for today across courts
  b.push({
    id: 101,
    court_id: 1,
    member_id: 1,
    member_name: 'Rahul Sharma',
    member_code: 'MEM001',
    guest_name: null,
    start_at: istToUtcIso(today, '07:00'),
    end_at: istToUtcIso(today, '08:00'),
    status: 'COMPLETED',
    tier_applied: 'GOLD',
    price_paise: 0,
    payment_status: 'WAIVED',
    source: 'WEB',
  })

  b.push({
    id: 102,
    court_id: 1,
    member_id: 2,
    member_name: 'Priya Patel',
    member_code: 'MEM002',
    guest_name: null,
    start_at: istToUtcIso(today, '09:00'),
    end_at: istToUtcIso(today, '10:00'),
    status: 'CONFIRMED',
    tier_applied: 'SILVER',
    price_paise: 40000,
    payment_status: 'PAID',
    source: 'FRONT_DESK',
  })

  b.push({
    id: 103,
    court_id: 3,
    member_id: null,
    member_name: null,
    member_code: null,
    guest_name: 'Amitabh Sen',
    start_at: istToUtcIso(today, '10:30'),
    end_at: istToUtcIso(today, '11:30'),
    status: 'CONFIRMED',
    tier_applied: 'WALKIN',
    price_paise: 100000,
    payment_status: 'UNPAID',
    source: 'PHONE',
  })

  b.push({
    id: 104,
    court_id: 4,
    member_id: 3,
    member_name: 'Ananya Verma',
    member_code: 'MEM003',
    guest_name: null,
    start_at: istToUtcIso(today, '16:00'),
    end_at: istToUtcIso(today, '17:00'),
    status: 'CONFIRMED',
    tier_applied: 'JUNIOR',
    price_paise: 12000,
    payment_status: 'PAID',
    source: 'WEB',
  })

  b.push({
    id: 105,
    court_id: 6,
    member_id: 5,
    member_name: 'Vikram Malhotra',
    member_code: 'MEM005',
    guest_name: null,
    start_at: istToUtcIso(today, '18:00'),
    end_at: istToUtcIso(today, '19:00'),
    status: 'CONFIRMED',
    tier_applied: 'GOLD',
    price_paise: 0,
    payment_status: 'WAIVED',
    source: 'FRONT_DESK',
  })

  return b
}

export function generateInitialBarOrders(members: Member[]): BarOrder[] {
  const today = getTodayIST()
  return [
    {
      id: 1,
      table_id: 2,
      table_label: 'Table 2',
      member_id: 1,
      member_name: members[0].full_name,
      member_code: members[0].member_code,
      guest_name: null,
      kitchen_status: 'PREPARING',
      payment_status: 'UNPAID',
      is_tab: false,
      subtotal_paise: 40000,
      discount_paise: 6000,
      total_paise: 34000,
      tax_paise: 1619,
      created_at: istToUtcIso(today, '11:15'),
      items: [
        { menu_item_id: 8, name: 'Paneer Tikka', qty: 1, unit_price_paise: 26000, line_total_paise: 26000, note: 'Spicy' },
        { menu_item_id: 7, name: 'Veg Sandwich', qty: 1, unit_price_paise: 14000, line_total_paise: 14000, note: null },
      ],
    },
    {
      id: 2,
      table_id: 5,
      table_label: 'Table 5',
      member_id: 2,
      member_name: members[1].full_name,
      member_code: members[1].member_code,
      guest_name: null,
      kitchen_status: 'NEW',
      payment_status: 'UNPAID',
      is_tab: true, // ON TAB
      subtotal_paise: 62000,
      discount_paise: 3100,
      total_paise: 58900,
      tax_paise: 2805,
      created_at: istToUtcIso(today, '11:30'),
      items: [
        { menu_item_id: 10, name: 'Pasta Alfredo', qty: 1, unit_price_paise: 28000, line_total_paise: 28000, note: 'Extra cheese' },
        { menu_item_id: 9, name: 'Chicken Roll', qty: 1, unit_price_paise: 22000, line_total_paise: 22000, note: null },
        { menu_item_id: 3, name: 'Fresh Lime Soda', qty: 1, unit_price_paise: 8000, line_total_paise: 8000, note: 'Sweet & salt' },
        { menu_item_id: 1, name: 'Masala Chai', qty: 1, unit_price_paise: 4000, line_total_paise: 4000, note: null },
      ],
    },
    {
      id: 3,
      table_id: 1,
      table_label: 'Table 1',
      member_id: null,
      guest_name: 'Rajesh Khanna',
      kitchen_status: 'READY',
      payment_status: 'UNPAID',
      is_tab: false,
      subtotal_paise: 18000,
      discount_paise: 0,
      total_paise: 18000,
      tax_paise: 857,
      created_at: istToUtcIso(today, '10:50'),
      items: [
        { menu_item_id: 5, name: 'Protein Shake', qty: 1, unit_price_paise: 18000, line_total_paise: 18000, note: 'Chocolate' },
      ],
    },
  ]
}

export function generateInitialShopOrders(members: Member[]): ShopOrder[] {
  const today = getTodayIST()
  return [
    {
      id: 88,
      member_id: 1,
      member_name: members[0].full_name,
      guest_name: null,
      channel: 'COUNTER',
      fulfilment: 'INSTORE',
      delivery_address: null,
      status: 'COMPLETED',
      subtotal_paise: 450000,
      discount_paise: 67500, // 15%
      total_paise: 382500,
      tax_paise: 18214,
      payment_status: 'PAID',
      created_at: istToUtcIso(today, '08:30'),
      items: [
        { product_id: 1, name: 'Yonex Astrox 88', qty: 1, unit_price_paise: 450000, line_total_paise: 450000 },
      ],
    },
    {
      id: 89,
      member_id: null,
      guest_name: 'Sunil Gavaskar',
      channel: 'COUNTER',
      fulfilment: 'INSTORE',
      delivery_address: null,
      status: 'COMPLETED',
      subtotal_paise: 70000,
      discount_paise: 0,
      total_paise: 70000,
      tax_paise: 3333,
      payment_status: 'PAID',
      created_at: istToUtcIso(today, '09:45'),
      items: [
        { product_id: 4, name: 'Tennis Balls (can of 3)', qty: 1, unit_price_paise: 45000, line_total_paise: 45000 },
        { product_id: 10, name: 'Wrist Band', qty: 1, unit_price_paise: 25000, line_total_paise: 25000 },
      ],
    },
  ]
}

export function generateInitialPayments(members: Member[]): Payment[] {
  const today = getTodayIST()
  const [y, m, d] = today.split('-').map(Number)
  const payments: Payment[] = []
  const methods: PaymentMethod[] = ['CASH', 'CARD', 'UPI']
  const sources: SourceType[] = ['BOOKING', 'SHOP_ORDER', 'BAR_ORDER', 'MEMBERSHIP']

  let idCounter = 1001
  for (let i = 0; i < 60; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d - i, 10 + (i % 8), 15 * (i % 4), 0))
    const dtStr = dt.toISOString()
    const member = members[i % members.length]
    
    // 1-3 transactions per day
    const count = (i % 3) + 1
    for (let c = 0; c < count; c++) {
      const src = sources[(i + c) % sources.length]
      const method = methods[(i * 2 + c) % methods.length]
      const amountPaise = src === 'MEMBERSHIP' 
        ? (i % 2 === 0 ? 300000 : 150000)
        : src === 'BOOKING'
        ? 40000 + (c * 20000)
        : src === 'SHOP_ORDER'
        ? 35000 + (c * 45000)
        : 18000 + (c * 12000)

      const isRefunded = (i === 3 && c === 0) || (i === 14 && c === 1) || (i === 28 && c === 0)

      payments.push({
        id: idCounter++,
        source_type: src,
        source_id: 100 + i + c,
        member_id: (i + c) % 4 === 0 ? null : member.id,
        amount_paise: amountPaise,
        tax_paise: Math.round(amountPaise * 0.05),
        method: method,
        status: isRefunded ? 'REFUNDED' : 'PAID',
        reference: `TXN-${y}${String(m).padStart(2, '0')}-${idCounter}`,
        created_at: dtStr,
        received_by: 3,
      })
    }
  }

  return payments
}

export function generateInitialSocialSessions(members: Member[]): SocialSession[] {
  const today = getTodayIST()
  const [y, m, d] = today.split('-').map(Number)
  const sessions: SocialSession[] = []

  // Create 4 Friday sessions (1 past, 1 this week, 2 upcoming)
  const configs = [
    { title: 'Friday Badminton Social Mixer', courtId: 4, courtName: 'Badminton 1 & 2', sport: 'BADMINTON' as Sport, capacity: 16, feePaise: 0, daysOffset: -7 },
    { title: 'Friday Night Tennis Doubles Rally', courtId: 1, courtName: 'Tennis 1 & 2', sport: 'TENNIS' as Sport, capacity: 12, feePaise: 0, daysOffset: 0 },
    { title: 'Friday Padel Fiesta & Social', courtId: 3, courtName: 'Padel 1', sport: 'PADEL' as Sport, capacity: 8, feePaise: 15000, daysOffset: 0 },
    { title: 'Friday Badminton Social Mixer', courtId: 4, courtName: 'Badminton 1 & 2', sport: 'BADMINTON' as Sport, capacity: 16, feePaise: 0, daysOffset: 7 },
    { title: 'Weekend Cricket Net Practice Social', courtId: 6, courtName: 'Cricket Net 1', sport: 'CRICKET_NET' as Sport, capacity: 10, feePaise: 20000, daysOffset: 8 },
    { title: 'Friday Night Tennis Doubles Rally', courtId: 1, courtName: 'Tennis 1 & 2', sport: 'TENNIS' as Sport, capacity: 12, feePaise: 0, daysOffset: 14 },
  ]

  let idCounter = 1
  for (const cfg of configs) {
    const dt = new Date(Date.UTC(y, m - 1, d + cfg.daysOffset, 18, 0, 0))
    const dtEnd = new Date(Date.UTC(y, m - 1, d + cfg.daysOffset, 20, 0, 0))

    // Pre-populate some participants
    const participantsCount = cfg.daysOffset === 0 && cfg.sport === 'PADEL' ? cfg.capacity - 1 : Math.min(cfg.capacity - 2, 6)
    const participants = members.slice(0, participantsCount).map((mem) => ({
      member_id: mem.id,
      member_name: mem.full_name,
      joined_at: new Date(Date.UTC(y, m - 1, d + cfg.daysOffset - 1, 14, 0, 0)).toISOString(),
    }))

    sessions.push({
      id: idCounter++,
      court_id: cfg.courtId,
      court_name: cfg.courtName,
      sport: cfg.sport,
      title: cfg.title,
      start_at: dt.toISOString(),
      end_at: dtEnd.toISOString(),
      capacity: cfg.capacity,
      joined_count: participants.length,
      fee_paise: cfg.feePaise,
      participants,
    })
  }

  return sessions
}
