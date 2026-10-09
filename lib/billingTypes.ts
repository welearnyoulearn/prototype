// Shapes shared by the usage + billing API routes (#358) and the screens that read them.
// Server code builds these; client components import the types only.

export type Tier = 'basic' | 'standard' | 'premium'
export type AtCap = 'block' | 'allow' | 'notify'

export type Meter = {
  key: string            // 'whatsapp.message'
  name: string           // 'WhatsApp messages'
  unitLabel: string      // 'message', '1,000 tokens'
  unitSize: number       // raw quantity per billed unit (1000 for ai.tokens)
  category: string
  ourCostPerUnit: number | null
  isActive: boolean
  isBillable: boolean
}

// One plan's price for one service, effective from a month. null in a grid cell = not in that plan.
export type TierPrice = { included: number; unitPrice: number; cap: number | null; atCap: AtCap }

// GET /api/platform/pricing
export type PricingRow = Meter & {
  prices: Record<Tier, TierPrice | null>          // in force this month
  pending: Record<Tier, TierPrice | null | undefined> // from next month; undefined = no change scheduled
}
export type PricingResponse = { month: string; nextMonth: string; rows: PricingRow[] }

// PUT /api/platform/pricing body (validated with Zod): one cell, applies from next month.
export type PricingUpdate = { meterKey: string; tier: Tier; inPlan: boolean } & Partial<TierPrice>

// Usage of one charged service by one school in one month.
export type MeterUsage = {
  used: number           // raw quantity (tokens, messages)
  included: number
  cap: number | null
  extra: number          // ₹ so far, exact to the paisa
  paused: boolean        // cap reached and atCap = 'block'
}

// GET /api/platform/usage?month=YYYY-MM
export type UsageSchoolRow = {
  schoolId: number
  schoolName: string
  schoolCode: string
  tier: string
  deactivated: boolean
  charged: Record<string, MeterUsage | null>   // billable meters; null = not in plan
  counted: Record<string, number>              // track-only meters: raw quantity
  extra: number                                // ₹ total extra so far
}
export type UsageResponse = {
  month: string
  inProgress: boolean
  meters: Meter[]
  totals: Record<string, { quantity: number; extra: number }>
  ourCost: number | null       // null when any active meter has no our_cost_per_unit
  billedExtra: number
  platform: Record<string, number>  // usage with no school (platform's own emails)
  schools: UsageSchoolRow[]
}

// GET /api/platform/usage/[schoolId]?month=YYYY-MM
export type SchoolOverride = {
  meterKey: string
  included: number | null; unitPrice: number | null; cap: number | null; atCap: AtCap | null
  note: string; updatedBy: string | null; updatedAt: string
}
export type SchoolUsageDetail = {
  month: string
  schoolId: number
  schoolName: string
  tier: string
  daily: Record<string, { day: string; quantity: number }[]>  // per meter, every day of the month so far
  charged: Record<string, MeterUsage | null>
  overrides: SchoolOverride[]
}

// GET /api/billing/usage (school admin / principal, own school)
export type MyUsageResponse = {
  month: string
  monthLabel: string           // '1 – 31 Oct'
  charged: { meter: Meter; usage: MeterUsage; price: TierPrice; nextPrice?: TierPrice }[]
  counted: { meter: Meter; quantity: number }[]
  extra: number
}

// ── Bills (saas_invoices + saas_invoice_items + saas_payments) ──────────────
export type BillStatus = 'due' | 'overdue' | 'part_paid' | 'paid' | 'no_charge'
export type BillLine = {
  id: number
  type: 'usage' | 'plan_fee' | 'adjustment'
  meterKey: string | null
  description: string      // 'WhatsApp messages: 1,240 used, 1,000 included'
  quantity: number
  unitRate: number
  amount: number           // ₹, negative for a credit adjustment
}
export type BillPayment = { id: number; amount: number; method: string; reference: string | null; paidOn: string; recordedBy: string }
export type Bill = {
  id: number
  number: string | null    // null for a ₹0 "no charge" bill
  schoolId: number
  schoolName: string
  kind: 'usage' | 'plan'
  title: string            // 'September 2026 usage' / 'Plan · Standard 2026–27'
  billMonth: string | null // 'YYYY-MM' for usage bills
  billDate: string         // 'YYYY-MM-DD'
  dueDate: string
  subtotal: number
  gst: number
  total: number
  paid: number
  status: BillStatus
  lines: BillLine[]
  payments: BillPayment[]
}
// GET /api/platform/billing?month=YYYY-MM  (bills dated in that month, plus every unpaid older bill)
export type BillsResponse = {
  month: string
  lastRun: { at: string; month: string; created: number; failed: { schoolId: number; schoolName: string; error: string }[] } | null
  nextRun: string          // ISO datetime of the next automatic run
  gstDetailsPending: boolean
  bills: Bill[]
}
// POST /api/platform/billing/[billId] body
export type BillAction =
  | { action: 'record_payment'; amount: number; paidOn: string; method: 'bank_transfer' | 'upi' | 'cheque' | 'cash'; reference?: string }
  | { action: 'add_adjustment'; amount: number; description: string }   // goes on the school's next usage bill
  | { action: 'resend' }

// ── Plans (plan_pricing) and a school's plan terms ──────────────────────────
export type PlanRow = {
  tier: Tier
  name: string
  description: string
  monthly: number | null
  yearly: number | null
  staffLimit: number | null
  schools: number          // schools currently on this plan
  shownOnWebsite: boolean
  retired: boolean
}
export type PlanTerm = {
  id: number; tier: string; startDate: string; endDate: string
  billingPeriod: 'monthly' | 'yearly'; listPrice: number; agreedPrice: number; discountReason: string | null
}
