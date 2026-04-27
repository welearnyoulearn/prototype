'use client'

import { useEffect, useState, useCallback } from 'react'

type FeeCategory = {
  id: number
  name: string
  description: string | null
  frequency: 'monthly' | 'quarterly' | 'annual' | 'one_time'
  is_active: boolean
  structure_count: number
}

type FeeStructure = {
  id: number
  fee_category_id: number
  category_name: string
  grade: string
  amount: number
  due_day: number
  frequency: string
}

type LedgerEntry = {
  id: number
  student_id: number
  student_name: string
  roll_number: string
  grade: string
  section: string
  category_name: string
  period_label: string
  amount_due: number
  amount_paid: number
  balance: number
  due_date: string
  status: 'pending' | 'paid' | 'partial' | 'overdue' | 'waived'
  days_overdue: number
}

type FeeStats = {
  summary: {
    total_students: number
    total_due: number
    total_collected: number
    total_outstanding: number
    paid_count: number
    partial_count: number
    pending_count: number
    overdue_count: number
    defaulters_count: number
  }
  by_category: Array<{
    category_name: string
    frequency: string
    total_due: number
    total_collected: number
    overdue_count: number
  }>
  monthly_trend: Array<{ month: string; collected: number }>
  top_defaulters: Array<{
    student_id: number
    student_name: string
    grade: string
    section: string
    roll_number: string
    outstanding: number
    overdue_entries: number
  }>
  by_payment_mode: Array<{ payment_mode: string; count: number; total: number }>
}

type PaymentForm = {
  student_id: string
  ledger_id: string
  amount: string
  payment_mode: string
  transaction_ref: string
  collected_by_name: string
  notes: string
  paid_date: string
}

const GRADES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']

const STATUS_COLORS: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  partial: 'bg-yellow-100 text-yellow-700',
  pending: 'bg-gray-100 text-gray-600',
  overdue: 'bg-red-100 text-red-700',
  waived: 'bg-purple-100 text-purple-700',
}

function fmt(n: number | string) {
  return `₹${Number(n).toLocaleString('en-IN')}`
}

function pct(num: number, den: number) {
  if (!den) return 0
  return Math.round((num / den) * 100)
}

export default function FeeManagement({ schoolId }: { schoolId: number }) {
  const [activeTab, setActiveTab] = useState<'structure' | 'ledger' | 'collect' | 'defaulters' | 'reports'>('reports')
  const [academicYear, setAcademicYear] = useState('')
  const [academicYears, setAcademicYears] = useState<string[]>([])
  const [stats, setStats] = useState<FeeStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  // Structure state
  const [categories, setCategories] = useState<FeeCategory[]>([])
  const [structures, setStructures] = useState<FeeStructure[]>([])
  const [structureYear, setStructureYear] = useState('')
  const [newCategory, setNewCategory] = useState({ name: '', frequency: 'monthly', description: '' })
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [editAmounts, setEditAmounts] = useState<Record<string, string>>({})
  const [savingStructure, setSavingStructure] = useState(false)
  const [generatingLedger, setGeneratingLedger] = useState(false)
  const [structureMsg, setStructureMsg] = useState('')

  // Ledger state
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [ledgerGrade, setLedgerGrade] = useState('')
  const [ledgerStatus, setLedgerStatus] = useState('')
  const [ledgerSearch, setLedgerSearch] = useState('')
  const [ledgerYear, setLedgerYear] = useState('')

  // Collect payment state
  const [collectSearch, setCollectSearch] = useState('')
  const [collectStudentLedger, setCollectStudentLedger] = useState<LedgerEntry[]>([])
  const [collectSearchLoading, setCollectSearchLoading] = useState(false)
  const [selectedLedger, setSelectedLedger] = useState<LedgerEntry | null>(null)
  const [paymentForm, setPaymentForm] = useState<PaymentForm>({
    student_id: '', ledger_id: '', amount: '', payment_mode: 'cash',
    transaction_ref: '', collected_by_name: '', notes: '',
    paid_date: new Date().toISOString().slice(0, 10),
  })
  const [collectError, setCollectError] = useState('')
  const [collectSuccess, setCollectSuccess] = useState<{ receipt_number: string; student_name: string; amount: number } | null>(null)
  const [collectLoading, setCollectLoading] = useState(false)

  // Waiver state
  const [showWaiver, setShowWaiver] = useState(false)
  const [waiverForm, setWaiverForm] = useState({ waiver_type: 'percentage', waiver_value: '', reason: '', granted_by_name: '' })
  const [waiverLoading, setWaiverLoading] = useState(false)

  // ——— Stats ———
  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const r = await fetch(`/api/fees/stats?school_id=${schoolId}&academic_year=${academicYear}`)
      const d = await r.json()
      setStats(d)
    } catch { /* silent */ }
    setStatsLoading(false)
  }, [schoolId, academicYear])

  // ——— Load academic years from DB ———
  useEffect(() => {
    Promise.all([
      fetch(`/api/academic-year/current?school_id=${schoolId}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/academic-years?school_id=${schoolId}`).then(r => r.ok ? r.json() : []),
    ]).then(([current, all]) => {
      const allLabels: string[] = Array.isArray(all) ? all.map((y: { label: string }) => y.label) : []
      const currentLabel: string = current?.label ?? allLabels[0] ?? '2025-26'
      if (!allLabels.length) allLabels.push(currentLabel)
      setAcademicYears(allLabels)
      setAcademicYear(currentLabel)
      setStructureYear(currentLabel)
      setLedgerYear(currentLabel)
    }).catch(() => {
      setAcademicYears(['2025-26'])
      setAcademicYear('2025-26')
      setStructureYear('2025-26')
      setLedgerYear('2025-26')
    })
  }, [schoolId])

  useEffect(() => { if (academicYear) loadStats() }, [loadStats, academicYear])

  // ——— Categories + Structures ———
  const loadStructures = useCallback(async () => {
    const [catRes, strRes] = await Promise.all([
      fetch(`/api/fees/categories?school_id=${schoolId}`),
      fetch(`/api/fees/structures?school_id=${schoolId}&academic_year=${structureYear}`),
    ])
    setCategories(await catRes.json())
    const s: FeeStructure[] = await strRes.json()
    setStructures(s)
    const init: Record<string, string> = {}
    s.forEach(r => { init[`${r.fee_category_id}_${r.grade}`] = String(r.amount) })
    setEditAmounts(init)
  }, [schoolId, structureYear])

  useEffect(() => {
    if (activeTab === 'structure') loadStructures()
  }, [activeTab, loadStructures])

  async function saveStructures() {
    setSavingStructure(true)
    setStructureMsg('')
    const structs = []
    for (const cat of categories) {
      for (const grade of GRADES) {
        const key = `${cat.id}_${grade}`
        const val = editAmounts[key]
        if (val && parseFloat(val) > 0) {
          structs.push({ fee_category_id: cat.id, grade, amount: parseFloat(val), due_day: 10 })
        }
      }
    }
    const r = await fetch('/api/fees/structures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, academic_year: structureYear, structures: structs }),
    })
    if (r.ok) setStructureMsg('✓ Fee structure saved')
    else setStructureMsg('Failed to save')
    setSavingStructure(false)
  }

  async function generateLedger() {
    setGeneratingLedger(true)
    setStructureMsg('')
    const r = await fetch('/api/fees/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, academic_year: structureYear }),
    })
    const d = await r.json()
    if (r.ok) setStructureMsg(`✓ Generated ${d.created} entries (${d.skipped} already existed)`)
    else setStructureMsg(d.error || 'Failed')
    setGeneratingLedger(false)
    loadStats()
  }

  async function addCategory() {
    if (!newCategory.name.trim()) return
    const r = await fetch('/api/fees/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, ...newCategory }),
    })
    if (r.ok) {
      setNewCategory({ name: '', frequency: 'monthly', description: '' })
      setShowAddCategory(false)
      loadStructures()
    }
  }

  // ——— Ledger ———
  const loadLedger = useCallback(async () => {
    setLedgerLoading(true)
    const params = new URLSearchParams({ school_id: String(schoolId), academic_year: ledgerYear })
    if (ledgerGrade) params.set('grade', ledgerGrade)
    if (ledgerStatus) params.set('status', ledgerStatus)
    const r = await fetch(`/api/fees/ledger?${params}`)
    setLedger(await r.json())
    setLedgerLoading(false)
  }, [schoolId, ledgerYear, ledgerGrade, ledgerStatus])

  useEffect(() => {
    if (activeTab === 'ledger') loadLedger()
  }, [activeTab, loadLedger])

  const filteredLedger = ledger.filter(e =>
    !ledgerSearch || e.student_name.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
    e.roll_number.toLowerCase().includes(ledgerSearch.toLowerCase())
  )

  // ——— Collect Fee ———
  async function searchStudent(q: string) {
    if (!q.trim()) { setCollectStudentLedger([]); return }
    setCollectSearchLoading(true)
    const r = await fetch(`/api/fees/ledger?school_id=${schoolId}&academic_year=${academicYear}`)
    const all: LedgerEntry[] = await r.json()
    const filtered = all.filter(e =>
      e.student_name.toLowerCase().includes(q.toLowerCase()) ||
      e.roll_number.toLowerCase().includes(q.toLowerCase())
    ).filter(e => e.status !== 'paid' && e.status !== 'waived')
    setCollectStudentLedger(filtered)
    setCollectSearchLoading(false)
  }

  function selectLedgerEntry(entry: LedgerEntry) {
    setSelectedLedger(entry)
    setPaymentForm(prev => ({
      ...prev,
      student_id: String(entry.student_id),
      ledger_id: String(entry.id),
      amount: String(entry.balance > 0 ? entry.balance : entry.amount_due),
    }))
    setCollectSuccess(null)
    setCollectError('')
    setShowWaiver(false)
  }

  async function submitPayment() {
    setCollectLoading(true)
    setCollectError('')
    const r = await fetch('/api/fees/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: schoolId,
        student_id: parseInt(paymentForm.student_id),
        ledger_id: parseInt(paymentForm.ledger_id),
        amount: parseFloat(paymentForm.amount),
        payment_mode: paymentForm.payment_mode,
        transaction_ref: paymentForm.transaction_ref || null,
        collected_by_name: paymentForm.collected_by_name || null,
        notes: paymentForm.notes || null,
        paid_date: paymentForm.paid_date,
      }),
    })
    const d = await r.json()
    if (r.ok) {
      setCollectSuccess({ receipt_number: d.receipt_number, student_name: d.student_name, amount: d.amount })
      setSelectedLedger(null)
      setCollectStudentLedger([])
      setCollectSearch('')
      loadStats()
    } else {
      setCollectError(d.error || 'Payment failed')
    }
    setCollectLoading(false)
  }

  async function submitWaiver() {
    if (!selectedLedger) return
    setWaiverLoading(true)
    const r = await fetch('/api/fees/waivers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: schoolId,
        student_id: selectedLedger.student_id,
        ledger_id: selectedLedger.id,
        waiver_type: waiverForm.waiver_type,
        waiver_value: parseFloat(waiverForm.waiver_value) || null,
        reason: waiverForm.reason,
        granted_by_name: waiverForm.granted_by_name || null,
      }),
    })
    if (r.ok) {
      setShowWaiver(false)
      setSelectedLedger(null)
      setCollectStudentLedger([])
      setCollectSearch('')
      setCollectSuccess(null)
      loadStats()
    }
    setWaiverLoading(false)
  }

  const TABS = [
    { key: 'reports', label: 'Dashboard' },
    { key: 'structure', label: 'Fee Structure' },
    { key: 'ledger', label: 'Fee Ledger' },
    { key: 'collect', label: 'Collect Payment' },
    { key: 'defaulters', label: 'Defaulters' },
  ] as const

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Fee Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage fee structures, collect payments, track defaulters</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={academicYear}
            onChange={e => setAcademicYear(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {academicYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === t.key
                ? 'text-blue-700 bg-blue-50 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ——— DASHBOARD TAB ——— */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {statsLoading ? (
            <div className="grid grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
                  <div className="h-3 bg-gray-100 rounded w-24 mb-3" />
                  <div className="h-7 bg-gray-200 rounded w-32 mb-2" />
                  <div className="h-2 bg-gray-100 rounded w-20" />
                </div>
              ))}
            </div>
          ) : stats?.summary ? (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Total Due</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(stats.summary.total_due)}</p>
                  <p className="text-xs text-gray-400 mt-1">{stats.summary.total_students} students</p>
                </div>
                <div className="bg-white rounded-xl border border-green-100 p-5">
                  <p className="text-xs text-green-600 font-medium uppercase tracking-wide">Collected</p>
                  <p className="text-2xl font-bold text-green-700 mt-1">{fmt(stats.summary.total_collected)}</p>
                  <p className="text-xs text-green-500 mt-1">{pct(Number(stats.summary.total_collected), Number(stats.summary.total_due))}% of total</p>
                </div>
                <div className="bg-white rounded-xl border border-red-100 p-5">
                  <p className="text-xs text-red-500 font-medium uppercase tracking-wide">Outstanding</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">{fmt(stats.summary.total_outstanding)}</p>
                  <p className="text-xs text-red-400 mt-1">{stats.summary.overdue_count} overdue entries</p>
                </div>
                <div className="bg-white rounded-xl border border-orange-100 p-5">
                  <p className="text-xs text-orange-500 font-medium uppercase tracking-wide">Defaulters</p>
                  <p className="text-2xl font-bold text-orange-600 mt-1">{stats.summary.defaulters_count}</p>
                  <p className="text-xs text-orange-400 mt-1">students with zero payment</p>
                </div>
              </div>

              {/* Status breakdown */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Status Breakdown</h3>
                <div className="flex gap-6 flex-wrap">
                  {[
                    { label: 'Paid', count: stats.summary.paid_count, color: 'bg-green-500' },
                    { label: 'Partial', count: stats.summary.partial_count, color: 'bg-yellow-400' },
                    { label: 'Pending', count: stats.summary.pending_count, color: 'bg-gray-300' },
                    { label: 'Overdue', count: stats.summary.overdue_count, color: 'bg-red-500' },
                  ].map(s => (
                    <div key={s.label} className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${s.color}`} />
                      <span className="text-sm text-gray-600">{s.label}</span>
                      <span className="text-sm font-semibold text-gray-900">{s.count}</span>
                    </div>
                  ))}
                </div>
                {/* Progress bar */}
                <div className="mt-4 h-2 bg-gray-100 rounded-full overflow-hidden flex">
                  <div
                    className="bg-green-500 h-full transition-all"
                    style={{ width: `${pct(Number(stats.summary.total_collected), Number(stats.summary.total_due))}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-gray-400">0%</span>
                  <span className="text-xs text-green-600 font-medium">{pct(Number(stats.summary.total_collected), Number(stats.summary.total_due))}% collected</span>
                  <span className="text-xs text-gray-400">100%</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* By category */}
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">Collection by Category</h3>
                  {stats.by_category.length === 0 ? (
                    <p className="text-sm text-gray-400">No data yet</p>
                  ) : (
                    <div className="space-y-3">
                      {stats.by_category.map(cat => (
                        <div key={cat.category_name}>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm text-gray-700">{cat.category_name}</span>
                            <span className="text-xs text-gray-400">{fmt(cat.total_collected)} / {fmt(cat.total_due)}</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="bg-blue-500 h-full rounded-full transition-all"
                              style={{ width: `${pct(Number(cat.total_collected), Number(cat.total_due))}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Payment mode + top defaulters */}
                <div className="space-y-4">
                  <div className="bg-white rounded-xl border border-gray-100 p-5">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Payment Modes</h3>
                    {stats.by_payment_mode.length === 0 ? (
                      <p className="text-sm text-gray-400">No payments recorded yet</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {stats.by_payment_mode.map(m => (
                          <div key={m.payment_mode} className="bg-gray-50 rounded-lg px-3 py-2">
                            <p className="text-xs text-gray-400 capitalize">{m.payment_mode}</p>
                            <p className="text-sm font-semibold text-gray-800">{fmt(m.total)}</p>
                            <p className="text-xs text-gray-400">{m.count} txns</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-xl border border-red-50 p-5">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Top Defaulters</h3>
                    {stats.top_defaulters.length === 0 ? (
                      <p className="text-sm text-gray-400">No defaulters</p>
                    ) : (
                      <div className="space-y-2">
                        {stats.top_defaulters.slice(0, 5).map(d => (
                          <div key={d.student_id} className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-gray-800">{d.student_name}</p>
                              <p className="text-xs text-gray-400">Grade {d.grade}{d.section} · {d.roll_number}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-red-600">{fmt(d.outstanding)}</p>
                              <p className="text-xs text-red-400">{d.overdue_entries} overdue</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
              <p className="text-gray-400">No fee data for {academicYear}. Set up fee structures first.</p>
              <button
                onClick={() => setActiveTab('structure')}
                className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                Set Up Fee Structure
              </button>
            </div>
          )}
        </div>
      )}

      {/* ——— STRUCTURE TAB ——— */}
      {activeTab === 'structure' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <select
                value={structureYear}
                onChange={e => setStructureYear(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
              >
                {academicYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <span className="text-sm text-gray-400">Configure fee amounts per grade per category</span>
            </div>
            <div className="flex items-center gap-2">
              {structureMsg && (
                <span className={`text-sm ${structureMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>
                  {structureMsg}
                </span>
              )}
              <button
                onClick={() => setShowAddCategory(true)}
                className="text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors"
              >
                + Add Category
              </button>
              <button
                onClick={saveStructures}
                disabled={savingStructure}
                className="text-sm bg-blue-600 text-white hover:bg-blue-700 px-4 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
              >
                {savingStructure ? 'Saving…' : 'Save Structure'}
              </button>
              <button
                onClick={generateLedger}
                disabled={generatingLedger}
                className="text-sm bg-green-600 text-white hover:bg-green-700 px-4 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
              >
                {generatingLedger ? 'Generating…' : 'Generate Ledger'}
              </button>
            </div>
          </div>

          {/* Add category modal */}
          {showAddCategory && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-end gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-600">Category Name</label>
                <input
                  type="text"
                  placeholder="e.g. Tuition Fee"
                  value={newCategory.name}
                  onChange={e => setNewCategory(p => ({ ...p, name: e.target.value }))}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Frequency</label>
                <select
                  value={newCategory.frequency}
                  onChange={e => setNewCategory(p => ({ ...p, frequency: e.target.value }))}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                  <option value="one_time">One Time</option>
                </select>
              </div>
              <button onClick={addCategory} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium">Add</button>
              <button onClick={() => setShowAddCategory(false)} className="text-gray-400 hover:text-gray-600 text-sm px-2 py-1.5">Cancel</button>
            </div>
          )}

          {categories.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
              <p className="text-gray-400 text-sm">No fee categories yet. Add one to get started.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Category</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Frequency</th>
                    {GRADES.map(g => (
                      <th key={g} className="text-center px-2 py-3 font-semibold text-gray-600 text-xs">Gr.{g}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {categories.map(cat => (
                    <tr key={cat.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{cat.name}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">{cat.frequency}</span>
                      </td>
                      {GRADES.map(grade => {
                        const key = `${cat.id}_${grade}`
                        return (
                          <td key={grade} className="px-1 py-2">
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={editAmounts[key] || ''}
                              onChange={e => setEditAmounts(p => ({ ...p, [key]: e.target.value }))}
                              className="w-16 text-center border border-gray-200 rounded px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <strong>How it works:</strong> Set amounts per grade per category, then Save Structure. Once structure is saved for all grades, click <strong>Generate Ledger</strong> to create individual fee entries for each student. This is idempotent — safe to run multiple times.
          </div>
        </div>
      )}

      {/* ——— LEDGER TAB ——— */}
      {activeTab === 'ledger' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <select
              value={ledgerYear}
              onChange={e => setLedgerYear(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
            >
              {academicYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select
              value={ledgerGrade}
              onChange={e => setLedgerGrade(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
            >
              <option value="">All Grades</option>
              {GRADES.map(g => <option key={g} value={g}>Grade {g}</option>)}
            </select>
            <select
              value={ledgerStatus}
              onChange={e => setLedgerStatus(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="waived">Waived</option>
            </select>
            <input
              type="text"
              placeholder="Search student / roll no…"
              value={ledgerSearch}
              onChange={e => setLedgerSearch(e.target.value)}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={loadLedger}
              className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700"
            >
              Refresh
            </button>
          </div>

          {ledgerLoading ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
              <p className="text-gray-400 text-sm">Loading ledger…</p>
            </div>
          ) : filteredLedger.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
              <p className="text-gray-400 text-sm">No entries found. Generate ledger from the Fee Structure tab first.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                <p className="text-sm text-gray-500">{filteredLedger.length} entries</p>
                <p className="text-sm font-medium text-gray-700">
                  Outstanding: <span className="text-red-600">{fmt(filteredLedger.reduce((s, e) => s + Number(e.balance), 0))}</span>
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Student</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Category</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Period</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-gray-600">Due</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-gray-600">Paid</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-gray-600">Balance</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Due Date</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLedger.map(entry => (
                      <tr key={entry.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-gray-800">{entry.student_name}</div>
                          <div className="text-xs text-gray-400">Gr.{entry.grade}{entry.section} · {entry.roll_number}</div>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">{entry.category_name}</td>
                        <td className="px-4 py-2.5 text-gray-600">{entry.period_label}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-gray-800">{fmt(entry.amount_due)}</td>
                        <td className="px-4 py-2.5 text-right text-green-600">{fmt(entry.amount_paid)}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-red-600">{fmt(entry.balance)}</td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">
                          {entry.due_date}
                          {Number(entry.days_overdue) > 0 && (
                            <span className="ml-1 text-red-500">({entry.days_overdue}d)</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[entry.status]}`}>
                            {entry.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ——— COLLECT PAYMENT TAB ——— */}
      {activeTab === 'collect' && (
        <div className="grid grid-cols-5 gap-5">
          {/* Left: search + ledger list */}
          <div className="col-span-2 space-y-3">
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Find Student</h3>
              <input
                type="text"
                placeholder="Search by name or roll number…"
                value={collectSearch}
                onChange={e => { setCollectSearch(e.target.value); searchStudent(e.target.value) }}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {collectSearchLoading && (
              <div className="bg-white rounded-xl border border-gray-100 p-4 text-center text-sm text-gray-400">Searching…</div>
            )}

            {collectStudentLedger.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100">
                  <p className="text-xs text-gray-400 font-medium">Pending Entries ({collectStudentLedger.length})</p>
                </div>
                <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                  {collectStudentLedger.map(entry => (
                    <button
                      key={entry.id}
                      onClick={() => selectLedgerEntry(entry)}
                      className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors ${
                        selectedLedger?.id === entry.id ? 'bg-blue-50 border-l-2 border-blue-500' : ''
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-medium text-gray-800">{entry.student_name}</p>
                          <p className="text-xs text-gray-400">{entry.category_name} · {entry.period_label}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-red-600">{fmt(entry.balance)}</p>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full capitalize ${STATUS_COLORS[entry.status]}`}>
                            {entry.status}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: payment form */}
          <div className="col-span-3">
            {collectSuccess ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-green-800 mb-1">Payment Recorded!</h3>
                <p className="text-green-700 mb-1">{collectSuccess.student_name}</p>
                <p className="text-2xl font-bold text-green-800 mb-2">{fmt(collectSuccess.amount)}</p>
                <div className="bg-white border border-green-200 rounded-lg px-4 py-2 inline-block mb-4">
                  <p className="text-xs text-green-500 font-medium">Receipt Number</p>
                  <p className="text-base font-bold text-green-800 font-mono">{collectSuccess.receipt_number}</p>
                </div>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => { setCollectSuccess(null); setCollectSearch(''); setCollectStudentLedger([]) }}
                    className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
                  >
                    Collect Another
                  </button>
                </div>
              </div>
            ) : selectedLedger ? (
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                {/* Entry info */}
                <div className="bg-gray-50 rounded-lg p-4 mb-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-base font-semibold text-gray-800">{selectedLedger.student_name}</p>
                      <p className="text-sm text-gray-500">Grade {selectedLedger.grade}{selectedLedger.section} · {selectedLedger.roll_number}</p>
                      <p className="text-sm text-gray-500 mt-1">{selectedLedger.category_name} · {selectedLedger.period_label}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Balance Due</p>
                      <p className="text-2xl font-bold text-red-600">{fmt(selectedLedger.balance > 0 ? selectedLedger.balance : selectedLedger.amount_due)}</p>
                      <p className="text-xs text-gray-400">of {fmt(selectedLedger.amount_due)}</p>
                    </div>
                  </div>
                </div>

                {/* Tabs: Pay / Waiver */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setShowWaiver(false)}
                    className={`text-sm px-4 py-1.5 rounded-lg font-medium transition-colors ${!showWaiver ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    Record Payment
                  </button>
                  <button
                    onClick={() => setShowWaiver(true)}
                    className={`text-sm px-4 py-1.5 rounded-lg font-medium transition-colors ${showWaiver ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    Grant Waiver
                  </button>
                </div>

                {!showWaiver ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-medium text-gray-600">Amount (₹)</label>
                        <input
                          type="number"
                          value={paymentForm.amount}
                          onChange={e => setPaymentForm(p => ({ ...p, amount: e.target.value }))}
                          className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600">Payment Mode</label>
                        <select
                          value={paymentForm.payment_mode}
                          onChange={e => setPaymentForm(p => ({ ...p, payment_mode: e.target.value }))}
                          className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="cash">Cash</option>
                          <option value="cheque">Cheque</option>
                          <option value="dd">Demand Draft</option>
                          <option value="upi">UPI</option>
                          <option value="online">Online Transfer</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600">Payment Date</label>
                        <input
                          type="date"
                          value={paymentForm.paid_date}
                          onChange={e => setPaymentForm(p => ({ ...p, paid_date: e.target.value }))}
                          className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600">Collected By</label>
                        <input
                          type="text"
                          placeholder="Staff name"
                          value={paymentForm.collected_by_name}
                          onChange={e => setPaymentForm(p => ({ ...p, collected_by_name: e.target.value }))}
                          className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    {['cheque', 'dd', 'upi', 'online'].includes(paymentForm.payment_mode) && (
                      <div>
                        <label className="text-xs font-medium text-gray-600">Transaction Ref / Cheque No</label>
                        <input
                          type="text"
                          placeholder="Reference number"
                          value={paymentForm.transaction_ref}
                          onChange={e => setPaymentForm(p => ({ ...p, transaction_ref: e.target.value }))}
                          className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-medium text-gray-600">Notes (optional)</label>
                      <input
                        type="text"
                        placeholder="Any remarks"
                        value={paymentForm.notes}
                        onChange={e => setPaymentForm(p => ({ ...p, notes: e.target.value }))}
                        className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    {collectError && <p className="text-sm text-red-600">{collectError}</p>}
                    <button
                      onClick={submitPayment}
                      disabled={collectLoading || !paymentForm.amount}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
                    >
                      {collectLoading ? 'Recording…' : `Record Payment of ${paymentForm.amount ? fmt(paymentForm.amount) : '₹0'}`}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-medium text-gray-600">Waiver Type</label>
                        <select
                          value={waiverForm.waiver_type}
                          onChange={e => setWaiverForm(p => ({ ...p, waiver_type: e.target.value }))}
                          className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                        >
                          <option value="percentage">Percentage (%)</option>
                          <option value="fixed_amount">Fixed Amount (₹)</option>
                          <option value="full">Full Waiver</option>
                        </select>
                      </div>
                      {waiverForm.waiver_type !== 'full' && (
                        <div>
                          <label className="text-xs font-medium text-gray-600">
                            {waiverForm.waiver_type === 'percentage' ? 'Percentage (%)' : 'Amount (₹)'}
                          </label>
                          <input
                            type="number"
                            value={waiverForm.waiver_value}
                            onChange={e => setWaiverForm(p => ({ ...p, waiver_value: e.target.value }))}
                            className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                          />
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Reason (required)</label>
                      <input
                        type="text"
                        placeholder="e.g. Financial hardship, merit scholarship"
                        value={waiverForm.reason}
                        onChange={e => setWaiverForm(p => ({ ...p, reason: e.target.value }))}
                        className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Approved By</label>
                      <input
                        type="text"
                        placeholder="Principal / Admin name"
                        value={waiverForm.granted_by_name}
                        onChange={e => setWaiverForm(p => ({ ...p, granted_by_name: e.target.value }))}
                        className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                      />
                    </div>
                    <button
                      onClick={submitWaiver}
                      disabled={waiverLoading || !waiverForm.reason}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
                    >
                      {waiverLoading ? 'Granting…' : 'Grant Waiver'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
                <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <p className="text-gray-400 text-sm">Search a student on the left to collect their fee payment</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ——— DEFAULTERS TAB ——— */}
      {activeTab === 'defaulters' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Students with overdue or unpaid entries for {academicYear}</p>
            <button
              onClick={loadStats}
              className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700"
            >
              Refresh
            </button>
          </div>

          {statsLoading ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
              <p className="text-gray-400 text-sm">Loading…</p>
            </div>
          ) : !stats || stats.top_defaulters.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-green-700 font-medium">No defaulters!</p>
              <p className="text-gray-400 text-sm mt-1">All students are up to date with their fee payments.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-red-50">
                <p className="text-sm font-semibold text-red-700">{stats.top_defaulters.length} Defaulters · Total Outstanding: {fmt(stats.top_defaulters.reduce((s, d) => s + Number(d.outstanding), 0))}</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Student</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Class</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-gray-600">Outstanding</th>
                    <th className="text-center px-4 py-2.5 font-semibold text-gray-600">Overdue Entries</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.top_defaulters.map((d, i) => (
                    <tr key={d.student_id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                            i === 0 ? 'bg-red-500' : i === 1 ? 'bg-orange-400' : 'bg-gray-400'
                          }`}>{i + 1}</span>
                          <div>
                            <p className="font-medium text-gray-800">{d.student_name}</p>
                            <p className="text-xs text-gray-400">{d.roll_number}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">Grade {d.grade}{d.section}</td>
                      <td className="px-4 py-3 text-right font-bold text-red-600 text-base">{fmt(d.outstanding)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="bg-red-100 text-red-700 text-xs font-medium px-2 py-0.5 rounded-full">{d.overdue_entries}</span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => {
                            setCollectSearch(d.student_name)
                            searchStudent(d.student_name)
                            setActiveTab('collect')
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Collect Fee →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
