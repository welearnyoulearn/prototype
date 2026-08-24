export type FeeCategory = {
  id: number; name: string; description: string | null
  frequency: 'monthly' | 'quarterly' | 'annual' | 'one_time'
  is_active: boolean; structure_count: number; ledger_count: number
  category_type: 'fixed' | 'variable'
  // System-generated categories ("Previous Year Dues", "Passout Dues") are billed
  // directly to each student's ledger by year-rollover/year-end — they never get a
  // fee_structures row and must be excluded from the fixed-fee-setup gate below.
  is_system?: boolean
}

export type ApplStudent = { id: number; name: string; roll_number: string; section: string }
export type ApplCategory = { id: number; name: string; frequency: string }

export type FeeStructure = {
  id: number; fee_category_id: number; category_name: string
  grade: string; amount: number; due_day: number; frequency: string
}

export type StructureLock = {
  id: number; school_id: number; academic_year: string
  locked_by: string; locked_at: string
} | null

export type Amendment = {
  id: number; grade: string; academic_year: string; category_name: string
  old_amount: number; new_amount: number; effective_from: string
  reason: string; changed_by: string; created_at: string
}

export type LedgerEntry = {
  id: number; student_id: number; student_name: string
  roll_number: string; school_roll_number: number | null; grade: string; section: string
  email: string | null; phone: string | null
  parent_name: string | null; parent_phone: string | null; parent_email: string | null
  student_status: string
  category_name: string; period_label: string
  amount_due: number; amount_paid: number; balance: number; waiver_amount: number
  due_date: string; status: 'pending' | 'paid' | 'partial' | 'overdue' | 'waived' | 'settled'
  days_overdue: number; has_edits: boolean
  source_academic_year: string | null
  notes: string | null
}

export type FeeStats = {
  summary: {
    total_students: number; total_due: number; total_collected: number; total_waived: number
    discretionary_waived?: number
    total_outstanding: number; paid_count: number; partial_count: number
    pending_count: number; overdue_count: number; waived_count: number; defaulters_count: number
    students_fully_paid: number; students_partial: number; students_not_paid: number
  }
  by_category: Array<{ category_name: string; frequency: string; total_due: number; total_collected: number; total_waived?: number; total_outstanding?: number; overdue_count: number }>
  monthly_trend: Array<{ month: string; collected: number }>
  top_defaulters: Array<{ student_id: number; student_name: string; grade: string; section: string; roll_number: string; outstanding: number; overdue_entries: number }>
  by_payment_mode: Array<{ payment_mode: string; count: number; total: number }>
  by_class?: Array<{ grade: string; section?: string; students: number; total_due: number; total_collected: number; outstanding: number; fully_paid_students?: number; defaulter_students?: number }>
  unbilled_students?: number
}

export type PendingPayment = {
  id: number; student_id: number; student_name: string; roll_number: string
  grade: string; section: string; category_name: string; period_label: string
  amount: number; payment_mode: string; transaction_ref: string | null
  receipt_number: string; paid_date: string; notes: string | null
  ledger_id: number; amount_due: number; ledger_balance: number
}

export type EditRecord = {
  id: number; old_amount: number; new_amount: number
  reason: string; changed_by: string; changed_at: string
}

export type ReportData = {
  balance: { total_billed: number; total_collected: number; total_outstanding: number; total_waived: number; discretionary_waived?: number; paid_entries: number; partial_entries: number; unpaid_entries: number; waived_entries: number; total_students: number }
  monthly: Array<{ month: string; collected: number; payment_count: number; students_paid: number }>
  monthlyDue: Array<{ month: string; billed: number }>
  byGrade: Array<{ grade: string; section?: string; students: number; total_due: number; total_collected: number; total_waived: number; discretionary_waived?: number; outstanding: number; fully_paid_students?: number; defaulter_students?: number }>
  byCategory: Array<{ category_name: string; frequency: string; students: number; total_due: number; total_collected: number; total_waived: number; discretionary_waived?: number; outstanding: number; paid_count: number; unpaid_count: number }>
  byMode: Array<{ payment_mode: string; count: number; total: number }>
  defaulters: Array<{ student_name: string; roll_number: string; grade: string; section: string; parent_name: string | null; parent_phone: string | null; outstanding: number; overdue_entries: number; unpaid_entries: number }>
}


export type PaymentRecord = {
  id: number; receipt_number: string; amount: number
  payment_mode: string; payment_status: string
  paid_date: string; collected_by_name: string | null
  transaction_ref: string | null; notes: string | null
  verified_by: string | null; verified_at: string | null
  rejection_reason: string | null; created_at: string
  bill_year?: string; ledger_id?: number
}

export type ReceiptHeaderBlock = {
  text: string
  size: 'sm' | 'md' | 'lg' | 'xl'
  bold: boolean
  italic: boolean
  align: 'left' | 'center' | 'right'
}

export type PaySuccess = {
  receipt_number: string; student_name: string; amount: number
  school_name: string; roll_number: string; grade: string; section: string; parent_name: string | null
  category_name: string; period_label: string; amount_due: number
  payment_mode: string; paid_date: string; collected_by_name: string | null
  transaction_ref: string | null; notes: string | null
  // Outstanding balance snapshotted at the moment of submission, BEFORE the async
  // loadLedger() refetch — printing the receipt later reads this instead of the live
  // `row` state, which can still reflect the pre-payment balance if the admin clicks
  // Print before the refetch has resolved and re-rendered.
  outstanding_before?: number
  // Per-fee-head breakdown from the API — a single payment can span multiple fee
  // categories (e.g. Tuition + Transport + Hostel), so this is the source of truth
  // for the receipt table rather than the single category_name/period_label above.
  line_items?: { category_name: string; period_label: string; amount: number }[]
}

export type ReceiptCardData = {
  school_name: string
  logo_url: string | null
  logo_align: 'left' | 'center' | 'right'
  header_blocks: ReceiptHeaderBlock[]
  student_name: string
  roll_number: string
  grade: string
  section: string
  parent_name: string | null
  receipt_number: string
  lines: { label: string; period: string; amount: number }[]
  total_paid: number
  payment_mode: string
  paid_date: string
  transaction_ref?: string | null
  collected_by_name?: string | null
  notes?: string | null
  balance_after?: number
}
