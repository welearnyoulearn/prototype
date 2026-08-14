'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = {
  id: number; name: string; is_system: boolean; is_active: boolean
  entry_count: number; total_spent: number
}

type Expense = {
  id: number; category_id: number; category_name: string
  title: string; payee_name: string | null; amount: number
  expense_date: string; payment_mode: string; transaction_ref: string | null
  notes: string | null; voucher_number: string
  recorded_by_name: string | null; attachment_count: number
}

type Attachment = { id: number; file_url: string; file_name: string | null }

type AuditRow = {
  id: number; expense_id: number; action: string; changed_by_name: string | null
  changes: Record<string, unknown> | null; created_at: string
  expense_title: string | null; voucher_number: string | null
}

type Metrics = {
  total_spent: number; entry_count: number; previous_period_total: number
  trend_pct: number | null
  top_category: { name: string; total: number } | null
  by_category: { category_id: number; category_name: string; total: number; count: number }[]
  recent: { id: number; title: string; amount: number; expense_date: string; payee_name: string | null; category_name: string }[]
}

type Props = { schoolId: number }

const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
]

const PAYMENT_MODE_COLORS: Record<string, string> = {
  cash: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  bank_transfer: 'bg-sky-50 text-sky-700 border-sky-200',
  upi: 'bg-violet-50 text-violet-700 border-violet-200',
  cheque: 'bg-amber-50 text-amber-700 border-amber-200',
}

const CATEGORY_COLORS = [
  { bar: 'bg-indigo-500', dot: 'bg-indigo-500' },
  { bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
  { bar: 'bg-amber-500', dot: 'bg-amber-500' },
  { bar: 'bg-rose-500', dot: 'bg-rose-500' },
  { bar: 'bg-sky-500', dot: 'bg-sky-500' },
  { bar: 'bg-violet-500', dot: 'bg-violet-500' },
  { bar: 'bg-teal-500', dot: 'bg-teal-500' },
  { bar: 'bg-orange-500', dot: 'bg-orange-500' },
]

type Toast = { id: number; message: string; type: 'success' | 'error' }

// Stable per-category color, keyed by id rather than list position — a category's
// color would otherwise shift between the Dashboard (sorted by spend) and the
// Categories tab (sorted by name).
function categoryColor(id: number) {
  return CATEGORY_COLORS[id % CATEGORY_COLORS.length]
}

const fmt = (n: number) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

function todayStr() { return new Date().toISOString().slice(0, 10) }
function monthStartStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }

export default function ExpenseManagement({ schoolId }: Props) {
  const [tab, setTab] = useState<'dashboard' | 'expenses' | 'categories' | 'audit'>('dashboard')
  const [adminName, setAdminName] = useState('')
  const [adminId, setAdminId] = useState<number | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [showForm, setShowForm] = useState(false)
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0)
  const [listRefreshKey, setListRefreshKey] = useState(0)
  const [toasts, setToasts] = useState<Toast[]>([])

  const notify = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200)
  }, [])

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(d => {
      if (d) { setAdminName(d.full_name || d.email || ''); setAdminId(d.id ?? null) }
    }).catch(() => {})
  }, [])

  const loadCategories = useCallback(async () => {
    const r = await fetch(`/api/expenses/categories?school_id=${schoolId}`)
    if (r.ok) setCategories(await r.json())
  }, [schoolId])

  useEffect(() => {
    const t = setTimeout(() => { loadCategories() }, 0)
    return () => clearTimeout(t)
  }, [loadCategories])

  function handleLogged() {
    setShowForm(false)
    loadCategories()
    setDashboardRefreshKey(k => k + 1)
    setListRefreshKey(k => k + 1)
    notify('Expense logged successfully')
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-gray-800">Expenses</h2>
          <button
            onClick={() => setShowForm(true)}
            data-testid="expenses-quick-add-btn"
            className="bg-gradient-to-br from-indigo-600 to-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150 flex items-center gap-1.5"
          >
            <span className="text-base leading-none">+</span> Add Expense
          </button>
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {(['dashboard', 'expenses', 'categories', 'audit'] as const).map(t => (
            <button
              key={t}
              data-testid={`expenses-tab-${t}`}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-150 capitalize ${
                tab === t ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'dashboard' ? 'Dashboard' : t === 'expenses' ? 'All Expenses' : t === 'categories' ? 'Categories' : 'Audit Log'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'dashboard' && <DashboardView schoolId={schoolId} refreshKey={dashboardRefreshKey} />}
      {tab === 'expenses' && (
        <ExpensesListView
          schoolId={schoolId} categories={categories} adminName={adminName} adminId={adminId}
          onCategoriesChanged={loadCategories} notify={notify} refreshKey={listRefreshKey}
        />
      )}
      {tab === 'categories' && (
        <CategoriesView schoolId={schoolId} categories={categories} onChanged={loadCategories} notify={notify} />
      )}
      {tab === 'audit' && <AuditLogView schoolId={schoolId} />}

      {showForm && (
        <ExpenseFormModal
          schoolId={schoolId} categories={categories} adminName={adminName} adminId={adminId}
          editing={null}
          onClose={() => setShowForm(false)}
          onSaved={handleLogged}
        />
      )}

      <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2 items-end">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium text-white animate-[fadeIn_0.15s_ease-out] ${
              t.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
            }`}
          >
            <span className="text-base leading-none">{t.type === 'success' ? '✓' : '⚠'}</span>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Dashboard ──────────────────────────────────────────────────────────────────

function DashboardView({ schoolId, refreshKey }: { schoolId: number; refreshKey: number }) {
  const [range, setRange] = useState<'month' | 'week' | 'custom'>('month')
  const [customFrom, setCustomFrom] = useState(monthStartStr())
  const [customTo, setCustomTo] = useState(todayStr())
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)

  // Week/Month ranges are derived directly from `range` — no separate state
  // or effect needed for them; only Custom needs its own editable state.
  const weekFrom = (() => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10) })()
  const from = range === 'week' ? weekFrom : range === 'month' ? monthStartStr() : customFrom
  const to = range === 'custom' ? customTo : todayStr()

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/expenses/metrics?school_id=${schoolId}&from=${from}&to=${to}`)
    if (r.ok) setMetrics(await r.json())
    setLoading(false)
  }, [schoolId, from, to])

  useEffect(() => {
    const t = setTimeout(() => { load() }, 0)
    return () => clearTimeout(t)
  }, [load, refreshKey])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {(['week', 'month', 'custom'] as const).map(r => (
          <button key={r} onClick={() => setRange(r)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
              range === r ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            {r === 'week' ? 'Last 7 Days' : r === 'month' ? 'This Month' : 'Custom Range'}
          </button>
        ))}
        {range === 'custom' && (
          <>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs" data-testid="expenses-metrics-from" />
            <span className="text-xs text-gray-400">to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs" data-testid="expenses-metrics-to" />
          </>
        )}
      </div>

      {loading && <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>}

      {!loading && metrics && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm">💰</span>
                <p className="text-xs text-gray-400">Total Spent</p>
              </div>
              <p className="text-2xl font-bold text-gray-800">{fmt(metrics.total_spent)}</p>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center text-sm">🧾</span>
                <p className="text-xs text-gray-400">Entries</p>
              </div>
              <p className="text-2xl font-bold text-gray-800">{metrics.entry_count}</p>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center text-sm">🏷️</span>
                <p className="text-xs text-gray-400">Top Category</p>
              </div>
              <p className="text-lg font-bold text-gray-800 truncate">{metrics.top_category?.name || '—'}</p>
              {metrics.top_category && <p className="text-xs text-gray-400">{fmt(metrics.top_category.total)}</p>}
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm ${metrics.trend_pct == null ? 'bg-gray-50 text-gray-400' : metrics.trend_pct > 0 ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600'}`}>
                  {metrics.trend_pct == null ? '—' : metrics.trend_pct > 0 ? '↑' : '↓'}
                </span>
                <p className="text-xs text-gray-400">vs. Previous Period</p>
              </div>
              <p className={`text-2xl font-bold ${metrics.trend_pct == null ? 'text-gray-400' : metrics.trend_pct > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                {metrics.trend_pct == null ? '—' : `${metrics.trend_pct > 0 ? '+' : ''}${metrics.trend_pct}%`}
              </p>
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">Spend by Category</h3>
            </div>
            {metrics.by_category.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">No expenses logged for this period</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {metrics.by_category.map(c => {
                  const pct = metrics.total_spent > 0 ? Math.round((c.total / metrics.total_spent) * 100) : 0
                  const color = categoryColor(c.category_id)
                  return (
                    <div key={c.category_id} className="flex items-center gap-4 px-5 py-3">
                      <span className="flex items-center gap-2 w-40 min-w-0">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color.dot}`} />
                        <span className="text-sm text-gray-700 font-medium truncate">{c.category_name}</span>
                      </span>
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div className={`${color.bar} h-full rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-24 text-right text-xs text-gray-500">{fmt(c.total)}</span>
                      <span className="w-10 text-right text-xs text-gray-400">{pct}%</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">Recent Expenses</h3>
            </div>
            {metrics.recent.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No expenses yet</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {metrics.recent.map(e => (
                  <div key={e.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 truncate">{e.title}</p>
                      <p className="text-xs text-gray-400">{e.category_name}{e.payee_name ? ` · ${e.payee_name}` : ''} · {fmtDate(e.expense_date)}</p>
                    </div>
                    <span className="font-bold text-gray-800 flex-shrink-0">{fmt(e.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── All Expenses (list + filters + pagination) ─────────────────────────────────

function ExpensesListView({ schoolId, categories, adminName, adminId, onCategoriesChanged, notify, refreshKey }: {
  schoolId: number; categories: Category[]; adminName: string; adminId: number | null
  onCategoriesChanged: () => void; notify: (message: string, type?: 'success' | 'error') => void; refreshKey: number
}) {
  const [filterMode, setFilterMode] = useState<'all' | 'day' | 'range' | 'month'>('all')
  const [filterDate, setFilterDate] = useState(todayStr())
  const [filterFrom, setFilterFrom] = useState(monthStartStr())
  const [filterTo, setFilterTo] = useState(todayStr())
  const [filterMonth, setFilterMonth] = useState(todayStr().slice(0, 7))
  const [filterCategory, setFilterCategory] = useState('')
  const [filterPayee, setFilterPayee] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 25

  const [data, setData] = useState<{ expenses: Expense[]; total: number; total_pages: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ school_id: String(schoolId), page: String(page), page_size: String(pageSize) })
    if (filterMode === 'day') params.set('date', filterDate)
    if (filterMode === 'range') { params.set('from', filterFrom); params.set('to', filterTo) }
    if (filterMode === 'month') params.set('month', filterMonth)
    if (filterCategory) params.set('category_id', filterCategory)
    if (filterPayee) params.set('payee', filterPayee)
    const r = await fetch(`/api/expenses?${params}`)
    if (r.ok) setData(await r.json())
    setLoading(false)
  }, [schoolId, page, filterMode, filterDate, filterFrom, filterTo, filterMonth, filterCategory, filterPayee])

  useEffect(() => {
    const t = setTimeout(() => { load() }, 0)
    return () => clearTimeout(t)
  }, [load, refreshKey])
  useEffect(() => {
    const t = setTimeout(() => { setPage(1) }, 0)
    return () => clearTimeout(t)
  }, [filterMode, filterDate, filterFrom, filterTo, filterMonth, filterCategory, filterPayee])

  async function handleDelete(id: number) {
    if (!confirm('Remove this expense? It can be reviewed later in the audit log but will no longer count toward totals.')) return
    const r = await fetch(`/api/expenses/${id}?changed_by_name=${encodeURIComponent(adminName)}`, { method: 'DELETE' })
    if (r.ok) { notify('Expense removed'); load() } else { notify('Failed to remove expense', 'error') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {(['all', 'day', 'range', 'month'] as const).map(m => (
            <button key={m} onClick={() => setFilterMode(m)}
              data-testid={`expenses-filter-${m}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                filterMode === m ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}>
              {m === 'all' ? 'All Time' : m === 'day' ? 'Specific Day' : m === 'range' ? 'Custom Range' : 'By Month'}
            </button>
          ))}
          {filterMode === 'day' && (
            <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs" data-testid="expenses-filter-date" />
          )}
          {filterMode === 'range' && (
            <>
              <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs" data-testid="expenses-filter-from" />
              <span className="text-xs text-gray-400">to</span>
              <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs" data-testid="expenses-filter-to" />
            </>
          )}
          {filterMode === 'month' && (
            <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs" data-testid="expenses-filter-month" />
          )}
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs" data-testid="expenses-filter-category">
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input value={filterPayee} onChange={e => setFilterPayee(e.target.value)} placeholder="Search payee…" className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-32" data-testid="expenses-filter-payee" />
        </div>
        <div className="flex items-center gap-2">
          <a href={`/api/expenses/export?school_id=${schoolId}${filterMode === 'range' ? `&from=${filterFrom}&to=${filterTo}` : ''}${filterCategory ? `&category_id=${filterCategory}` : ''}`}
            className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50" data-testid="expenses-export-btn">
            ⬇ Export CSV
          </a>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
        ) : !data || data.expenses.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No expenses match these filters.</div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                  <th className="text-left px-4 py-2 font-semibold">Voucher</th>
                  <th className="text-left px-4 py-2 font-semibold">Date</th>
                  <th className="text-left px-4 py-2 font-semibold">Title</th>
                  <th className="text-left px-4 py-2 font-semibold">Category</th>
                  <th className="text-left px-4 py-2 font-semibold">Payee</th>
                  <th className="text-left px-4 py-2 font-semibold">Mode</th>
                  <th className="text-right px-4 py-2 font-semibold">Amount</th>
                  <th className="text-center px-4 py-2 font-semibold">Bills</th>
                  <th className="text-right px-4 py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.expenses.map(e => (
                  <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setDetailId(e.id)} data-testid={`expenses-row-${e.id}`}>
                    <td className="px-4 py-2.5 font-mono text-xs text-indigo-600">{e.voucher_number}</td>
                    <td className="px-4 py-2.5 text-gray-600">{fmtDate(e.expense_date)}</td>
                    <td className="px-4 py-2.5 text-gray-800 font-medium">{e.title}</td>
                    <td className="px-4 py-2.5 text-gray-500">{e.category_name}</td>
                    <td className="px-4 py-2.5 text-gray-500">{e.payee_name || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium border capitalize ${PAYMENT_MODE_COLORS[e.payment_mode] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                        {e.payment_mode.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-800">{fmt(e.amount)}</td>
                    <td className="px-4 py-2.5 text-center text-gray-400">{e.attachment_count > 0 ? `📎 ${e.attachment_count}` : '—'}</td>
                    <td className="px-4 py-2.5 text-right" onClick={ev => ev.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => { setEditing(e); setShowForm(true) }} className="text-xs border border-gray-200 text-gray-500 px-2 py-1 rounded-lg hover:bg-gray-50">Edit</button>
                        <button onClick={() => handleDelete(e.id)} className="text-xs border border-red-200 text-red-500 px-2 py-1 rounded-lg hover:bg-red-50">Remove</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-50">
              <p className="text-xs text-gray-400">{data.total} total · Page {page} of {Math.max(1, data.total_pages)}</p>
              <div className="flex gap-1.5">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                  className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg disabled:opacity-40" data-testid="expenses-page-prev">Prev</button>
                <button disabled={page >= data.total_pages} onClick={() => setPage(p => p + 1)}
                  className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg disabled:opacity-40" data-testid="expenses-page-next">Next</button>
              </div>
            </div>
          </>
        )}
      </div>

      {showForm && (
        <ExpenseFormModal
          schoolId={schoolId} categories={categories} adminName={adminName} adminId={adminId}
          editing={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); onCategoriesChanged(); notify(editing ? 'Expense updated' : 'Expense logged successfully') }}
        />
      )}
      {detailId != null && (
        <ExpenseDetailModal id={detailId} onClose={() => setDetailId(null)} />
      )}
    </div>
  )
}

// ── File dropzone (drag-drop + click-to-browse, with a removable chip list) ────

function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileDropzone({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    onChange([...files, ...Array.from(list)])
  }

  function removeFile(idx: number) {
    onChange(files.filter((_, i) => i !== idx))
  }

  return (
    <div className="mt-1">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault(); setDragOver(false)
          addFiles(e.dataTransfer.files)
        }}
        data-testid="expense-form-dropzone"
        className={`flex flex-col items-center justify-center gap-1.5 border-2 border-dashed rounded-xl px-4 py-6 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
        }`}
      >
        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p className="text-sm text-gray-600"><span className="text-indigo-600 font-medium">Click to upload</span> or drag bills here</p>
        <p className="text-xs text-gray-400">Images or PDF, multiple files allowed</p>
        <input
          ref={inputRef}
          type="file" multiple accept="image/*,.pdf"
          onChange={e => { addFiles(e.target.files); e.target.value = '' }}
          className="hidden" data-testid="expense-form-files"
        />
      </div>

      {files.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm flex-shrink-0">📎</span>
                <span className="text-xs text-gray-700 truncate">{f.name}</span>
                <span className="text-[10px] text-gray-400 flex-shrink-0">{fileSizeLabel(f.size)}</span>
              </div>
              <button type="button" onClick={() => removeFile(i)} className="text-gray-400 hover:text-red-500 text-sm flex-shrink-0 ml-2" aria-label={`Remove ${f.name}`}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Log / Edit Expense form ─────────────────────────────────────────────────────

function ExpenseFormModal({ schoolId, categories, adminName, adminId, editing, onClose, onSaved }: {
  schoolId: number; categories: Category[]; adminName: string; adminId: number | null
  editing: Expense | null; onClose: () => void; onSaved: () => void
}) {
  const [categoryId, setCategoryId] = useState(String(editing?.category_id ?? categories[0]?.id ?? ''))
  const [title, setTitle] = useState(editing?.title ?? '')
  const [payee, setPayee] = useState(editing?.payee_name ?? '')
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [date, setDate] = useState(editing?.expense_date?.slice(0, 10) ?? todayStr())
  const [mode, setMode] = useState(editing?.payment_mode ?? 'cash')
  const [ref, setRef] = useState(editing?.transaction_ref ?? '')
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Categories can still be loading (async fetch on mount) when this modal is
  // opened immediately after page load, leaving categoryId stuck at '' with
  // no options rendered — sync it once the list actually arrives.
  useEffect(() => {
    if (!editing && !categoryId && categories.length > 0) setCategoryId(String(categories[0].id))
  }, [editing, categoryId, categories])

  async function uploadFile(file: File, expenseId: number) {
    const signRes = await fetch('/api/upload/sign', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder: 'expense-bills' }),
    })
    const signData = await signRes.json()
    if (!signRes.ok) throw new Error(signData?.error || 'Failed to get upload signature')
    const { signature, timestamp, cloud_name, api_key, folder } = signData

    const formData = new FormData()
    formData.append('file', file)
    formData.append('api_key', api_key)
    formData.append('timestamp', String(timestamp))
    formData.append('signature', signature)
    formData.append('folder', folder)

    const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloud_name}/auto/upload`, { method: 'POST', body: formData })
    const uploadData = await uploadRes.json()
    if (!uploadRes.ok) throw new Error('File upload failed')

    await fetch(`/api/expenses/${expenseId}/attachments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_url: uploadData.secure_url, file_name: file.name }),
    })
  }

  async function handleSubmit() {
    setError('')
    if (!categoryId || !title.trim() || !(parseFloat(amount) > 0)) {
      setError('Category, title, and a positive amount are required')
      return
    }
    setSaving(true)
    try {
      const body = {
        school_id: schoolId, category_id: Number(categoryId), title: title.trim(),
        payee_name: payee.trim() || null, amount: parseFloat(amount), expense_date: date,
        payment_mode: mode, transaction_ref: ref.trim() || null, notes: notes.trim() || null,
        recorded_by_name: adminName || null, recorded_by_id: adminId,
      }
      const res = editing
        ? await fetch(`/api/expenses/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, changed_by_name: adminName }) })
        : await fetch('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save expense')

      const expenseId = editing ? editing.id : data.id
      for (const f of files) {
        await uploadFile(f, expenseId).catch(() => { /* one failed file shouldn't block the rest */ })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save expense')
    } finally {
      setSaving(false)
    }
  }

  const inputBase = "mt-1 w-full border rounded-lg px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2"

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 via-white to-white rounded-t-2xl">
          <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm">💸</span>
            {editing ? 'Edit Expense' : 'Add Expense'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg">{error}</div>}

          <div>
            <label className="text-xs font-medium text-gray-600">📝 Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Petrol, March Electricity Bill"
              className={`${inputBase} border-gray-200 focus:border-indigo-400 focus:ring-indigo-100`} data-testid="expense-form-title" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">🏷️ Category *</label>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
                className={`${inputBase} border-gray-200 focus:border-amber-400 focus:ring-amber-100`} data-testid="expense-form-category">
                {categories
                  .filter(c => c.is_active || (editing && c.id === editing.category_id))
                  .map(c => <option key={c.id} value={c.id}>{c.name}{!c.is_active ? ' (inactive)' : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">💰 Amount (₹) *</label>
              <input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)}
                className={`${inputBase} border-gray-200 focus:border-emerald-400 focus:ring-emerald-100`} data-testid="expense-form-amount" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">🧑 Payee</label>
              <input value={payee} onChange={e => setPayee(e.target.value)} placeholder="Who was paid"
                className={`${inputBase} border-gray-200 focus:border-sky-400 focus:ring-sky-100`} data-testid="expense-form-payee" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">📅 Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className={`${inputBase} border-gray-200 focus:border-violet-400 focus:ring-violet-100`} data-testid="expense-form-date" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">💳 Payment Mode</label>
              <select value={mode} onChange={e => setMode(e.target.value)}
                className={`${inputBase} border-gray-200 focus:border-rose-400 focus:ring-rose-100`} data-testid="expense-form-mode">
                {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">🔖 Reference / Cheque No.</label>
              <input value={ref} onChange={e => setRef(e.target.value)}
                className={`${inputBase} border-gray-200 focus:border-teal-400 focus:ring-teal-100`} data-testid="expense-form-ref" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">🗒️ Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className={`${inputBase} border-gray-200 focus:border-indigo-400 focus:ring-indigo-100`} data-testid="expense-form-notes" />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">📎 Attach Bills (optional, multiple allowed)</label>
            <FileDropzone files={files} onChange={setFiles} />
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={handleSubmit} disabled={saving || categories.length === 0}
              title={categories.length === 0 ? 'Loading categories…' : undefined}
              className="flex-1 bg-gradient-to-br from-indigo-600 to-indigo-700 text-white py-2.5 rounded-lg text-sm font-semibold shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150 disabled:opacity-50 disabled:hover:translate-y-0" data-testid="expense-form-submit">
              {saving ? 'Saving…' : categories.length === 0 ? 'Loading…' : editing ? 'Save Changes' : 'Add Expense'}
            </button>
            <button onClick={onClose} className="px-4 py-2.5 text-sm text-gray-500">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Expense detail (view + printable voucher + attachments) ────────────────────

function ExpenseDetailModal({ id, onClose }: { id: number; onClose: () => void }) {
  const [expense, setExpense] = useState<(Expense & { attachments: Attachment[] }) | null>(null)

  useEffect(() => {
    fetch(`/api/expenses/${id}`).then(r => r.ok ? r.json() : null).then(setExpense)
  }, [id])

  function printVoucher() {
    if (!expense) return
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Expense Voucher ${expense.voucher_number}</title>
<style>
  body{font-family:Arial,sans-serif;padding:32px;color:#222;max-width:600px;margin:0 auto}
  .hdr{text-align:center;border-bottom:2px solid #333;padding-bottom:10px;margin-bottom:16px}
  .title{font-size:16px;font-weight:bold}.rno{font-size:11px;color:#555;margin-top:4px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px}
  .lbl{font-size:10px;color:#888}.val{font-size:12px;font-weight:500}
  table{width:100%;border-collapse:collapse;margin:10px 0}
  th{background:#f3f4f6;padding:6px 8px;text-align:left;font-size:10px;border:1px solid #ddd}
  td{padding:6px 8px;font-size:12px;border:1px solid #ddd}
  .ftr{margin-top:20px;text-align:center;font-size:10px;color:#aaa}
</style></head><body>
<div class="hdr"><div class="title">EXPENSE VOUCHER</div><div class="rno">Voucher No: <strong>${expense.voucher_number}</strong></div></div>
<div class="grid2">
  <div><div class="lbl">Category</div><div class="val">${expense.category_name}</div></div>
  <div><div class="lbl">Date</div><div class="val">${fmtDate(expense.expense_date)}</div></div>
  <div><div class="lbl">Payee</div><div class="val">${expense.payee_name || '—'}</div></div>
  <div><div class="lbl">Payment Mode</div><div class="val">${expense.payment_mode}</div></div>
</div>
<table><thead><tr><th>Title</th><th style="text-align:right">Amount</th></tr></thead>
<tbody><tr><td>${expense.title}</td><td style="text-align:right">${fmt(expense.amount)}</td></tr></tbody></table>
${expense.notes ? `<div class="val" style="margin-top:8px"><span class="lbl">Notes:</span> ${expense.notes}</div>` : ''}
<div class="ftr">Recorded by ${expense.recorded_by_name || '—'} · Generated ${new Date().toLocaleString('en-IN')}</div>
</body></html>`
    const win = window.open('', '_blank', 'width=700,height=600')
    if (win) { win.document.write(html); win.document.close(); win.print() }
  }

  async function removeAttachment(attId: number) {
    await fetch(`/api/expenses/attachments/${attId}`, { method: 'DELETE' })
    setExpense(prev => prev ? { ...prev, attachments: prev.attachments.filter(a => a.id !== attId) } : prev)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-800">Expense Detail</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        {!expense ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : (
          <div className="p-6 space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Voucher</span><span className="font-mono text-indigo-600">{expense.voucher_number}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Title</span><span className="font-medium text-gray-800">{expense.title}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Category</span><span className="text-gray-800">{expense.category_name}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Payee</span><span className="text-gray-800">{expense.payee_name || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Amount</span><span className="font-bold text-gray-800">{fmt(expense.amount)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Date</span><span className="text-gray-800">{fmtDate(expense.expense_date)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Mode</span><span className="text-gray-800 capitalize">{expense.payment_mode.replace('_', ' ')}</span></div>
            {expense.transaction_ref && <div className="flex justify-between"><span className="text-gray-400">Reference</span><span className="text-gray-800">{expense.transaction_ref}</span></div>}
            {expense.notes && <div><span className="text-gray-400">Notes</span><p className="text-gray-800 mt-1">{expense.notes}</p></div>}

            {expense.attachments.length > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 mb-2">Attached Bills</p>
                <div className="space-y-1.5">
                  {expense.attachments.map(a => (
                    <div key={a.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5">
                      <a href={a.file_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 text-xs truncate">{a.file_name || 'View file'}</a>
                      <button onClick={() => removeAttachment(a.id)} className="text-red-400 hover:text-red-600 text-xs flex-shrink-0 ml-2">Remove</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button onClick={printVoucher} className="w-full mt-3 border border-indigo-200 text-indigo-600 py-2 rounded-lg text-sm font-medium hover:bg-indigo-50" data-testid="expense-print-voucher">
              🖨 Print Voucher
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Categories management ───────────────────────────────────────────────────────

function CategoriesView({ schoolId, categories, onChanged, notify }: { schoolId: number; categories: Category[]; onChanged: () => void; notify: (message: string, type?: 'success' | 'error') => void }) {
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [error, setError] = useState('')

  async function addCategory() {
    setError('')
    if (!newName.trim()) return
    const r = await fetch('/api/expenses/categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, name: newName.trim() }),
    })
    const d = await r.json()
    if (!r.ok) { setError(d.error || 'Failed to add category'); notify(d.error || 'Failed to add category', 'error'); return }
    setNewName(''); setShowAdd(false); onChanged(); notify('Category added')
  }

  async function saveRename(id: number) {
    if (!editName.trim()) return
    const r = await fetch(`/api/expenses/categories?id=${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, name: editName.trim() }),
    })
    setEditingId(null); onChanged()
    notify(r.ok ? 'Category renamed' : 'Failed to rename category', r.ok ? 'success' : 'error')
  }

  async function toggleActive(cat: Category) {
    const r = await fetch(`/api/expenses/categories?id=${cat.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, is_active: !cat.is_active }),
    })
    onChanged()
    notify(r.ok ? (cat.is_active ? 'Category deactivated' : 'Category reactivated') : 'Failed to update category', r.ok ? 'success' : 'error')
  }

  async function deleteCategory(cat: Category) {
    if (cat.entry_count > 0) return // button is disabled in this case; guard kept for safety
    if (!confirm(`Delete "${cat.name}"? This can't be undone.`)) return
    const r = await fetch(`/api/expenses/categories?id=${cat.id}&school_id=${schoolId}`, { method: 'DELETE' })
    const d = await r.json()
    if (!r.ok) { setError(d.error || 'Failed to delete category'); notify(d.error || 'Failed to delete category', 'error'); return }
    setError(''); onChanged(); notify('Category deleted')
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowAdd(v => !v)} className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-indigo-700" data-testid="expense-category-add-btn">
          + Add Category
        </button>
      </div>
      {showAdd && (
        <div className="bg-white border border-gray-100 rounded-xl p-4 flex gap-2 items-center shadow-sm">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Category name" autoFocus
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="expense-category-name-input" />
          <button onClick={addCategory} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium">Add</button>
          <button onClick={() => { setShowAdd(false); setError('') }} className="text-gray-400 text-sm px-2">Cancel</button>
        </div>
      )}
      {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg">{error}</div>}

      <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {categories.map(cat => (
          <div key={cat.id} className={`bg-white rounded-xl border p-4 shadow-sm hover:shadow-md transition-shadow ${!cat.is_active ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between">
              {editingId === cat.id ? (
                <div className="flex-1 flex gap-2">
                  <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-sm" />
                  <button onClick={() => saveRename(cat.id)} className="text-xs text-indigo-600 font-medium">Save</button>
                  <button onClick={() => setEditingId(null)} className="text-xs text-gray-400">Cancel</button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${categoryColor(cat.id).dot}`} />
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 truncate flex items-center gap-1.5">
                        {cat.name}
                        {!cat.is_active && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">Inactive</span>}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{cat.entry_count} {cat.entry_count === 1 ? 'entry' : 'entries'} · {fmt(cat.total_spent)}</p>
                    </div>
                  </div>
                  {!cat.is_system && (
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button onClick={() => { setEditingId(cat.id); setEditName(cat.name) }} className="text-xs text-gray-400 hover:text-gray-600">Rename</button>
                    </div>
                  )}
                </>
              )}
            </div>
            {editingId !== cat.id && !cat.is_system && (
              <div className="mt-3 flex gap-1.5">
                <button onClick={() => toggleActive(cat)}
                  className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                  {cat.is_active ? 'Deactivate' : 'Reactivate'}
                </button>
                <button onClick={() => deleteCategory(cat)} disabled={cat.entry_count > 0}
                  title={cat.entry_count > 0 ? `Can't delete — ${cat.entry_count} expense${cat.entry_count === 1 ? '' : 's'} logged under this category. Deactivate it instead.` : undefined}
                  className="text-xs px-2.5 py-1 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white">
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Audit Log ────────────────────────────────────────────────────────────────

const AUDIT_ACTION_STYLE: Record<string, string> = {
  created: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  edited: 'bg-amber-50 text-amber-700 border-amber-200',
  deleted: 'bg-red-50 text-red-700 border-red-200',
}

function formatFieldValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  return String(v)
}

function AuditLogView({ schoolId }: { schoolId: number }) {
  const [data, setData] = useState<{ rows: AuditRow[]; total: number; total_pages: number } | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 25
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch(`/api/expenses/audit-log?school_id=${schoolId}&page=${page}&page_size=${pageSize}`)
      if (r.ok) setData(await r.json())
      else setError('Could not load audit log — try refreshing')
    } catch { setError('Network error — audit log could not be loaded') }
    setLoading(false)
  }, [schoolId, page])

  useEffect(() => {
    const t = setTimeout(() => { load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-700">Audit Log — Every Expense Action</p>
          <p className="text-xs text-gray-400">Permanent record of every expense logged, edited, or removed. Cannot be deleted.</p>
        </div>
        <button onClick={load} className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50" data-testid="expenses-audit-refresh">
          ↻ Refresh
        </button>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
        ) : error ? (
          <div className="text-center py-12 text-red-500 text-sm">{error}</div>
        ) : !data || data.rows.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No expense actions recorded yet.</div>
        ) : (
          <>
            <div className="overflow-x-auto max-h-[560px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr className="text-xs text-gray-500 border-b border-gray-100">
                    <th className="text-left px-4 py-2 font-semibold whitespace-nowrap">Date / Time</th>
                    <th className="text-left px-4 py-2 font-semibold">Who</th>
                    <th className="text-left px-4 py-2 font-semibold">Action</th>
                    <th className="text-left px-4 py-2 font-semibold">Expense</th>
                    <th className="text-left px-4 py-2 font-semibold">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map(a => (
                    <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50" data-testid={`expenses-audit-row-${a.id}`}>
                      <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                        {new Date(a.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-2.5 text-gray-700">{a.changed_by_name || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium border capitalize ${AUDIT_ACTION_STYLE[a.action] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                          {a.action}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-800">
                        <span className="font-medium">{a.expense_title || `#${a.expense_id}`}</span>
                        {a.voucher_number && <span className="block text-xs font-mono text-indigo-500">{a.voucher_number}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">
                        {!a.changes ? '—' : a.action === 'edited' ? (
                          <div className="space-y-0.5">
                            {Object.entries(a.changes).map(([field, diff]) => {
                              const d = diff as { from: unknown; to: unknown }
                              return (
                                <div key={field}><span className="font-medium text-gray-600 capitalize">{field.replace('_', ' ')}:</span> {formatFieldValue(d.from)} → {formatFieldValue(d.to)}</div>
                              )
                            })}
                          </div>
                        ) : (
                          Object.entries(a.changes).map(([k, v]) => `${k}: ${formatFieldValue(v)}`).join(', ')
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-50">
              <p className="text-xs text-gray-400">{data.total} total · Page {page} of {Math.max(1, data.total_pages)}</p>
              <div className="flex gap-1.5">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                  className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg disabled:opacity-40" data-testid="expenses-audit-page-prev">Prev</button>
                <button disabled={page >= data.total_pages} onClick={() => setPage(p => p + 1)}
                  className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg disabled:opacity-40" data-testid="expenses-audit-page-next">Next</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
