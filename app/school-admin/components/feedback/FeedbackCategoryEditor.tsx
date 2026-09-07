'use client'

import { useEffect, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Category {
  id: number
  role: string
  key: string
  label: string
  icon: string | null
  department: string | null
  is_active: boolean
  sort_order: number
}

const ROLES = [
  { value: 'parent', label: 'Parent' },
  { value: 'student', label: 'Student' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'visitor', label: 'Visitor' },
  { value: 'other', label: 'Other' },
]

function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-')
}

export default function FeedbackCategoryEditor({ schoolId }: { schoolId: number }) {
  const [role, setRole] = useState('parent')
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [newLabel, setNewLabel] = useState('')
  const [newDepartment, setNewDepartment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    fetch(`/api/feedback/categories?school_id=${schoolId}&role=${role}`)
      .then(res => { if (!res.ok) throw new Error(); return res.json() })
      .then(data => { setCategories(data); setError('') })
      .catch(() => setError('Failed to load categories'))
      .finally(() => setLoading(false))
  }

  // Standard fetch-on-mount/on-role-change — see FeedbackDashboardTab.tsx for why
  // set-state-in-effect is suppressed here.
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { load() }, [schoolId, role])

  async function addCategory() {
    if (!newLabel.trim()) return
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/feedback/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, role, key: slugify(newLabel), label: newLabel.trim(), department: newDepartment.trim() || undefined }),
      })
      if (!res.ok) { const body = await res.json(); throw new Error(body.error || 'Failed to add category') }
      setNewLabel(''); setNewDepartment('')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add category')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(cat: Category) {
    await fetch(`/api/feedback/categories/${cat.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !cat.is_active }),
    })
    load()
  }

  return (
    <div data-testid="feedback-category-editor">
      <div className="mb-4 flex items-center gap-3">
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-44" data-testid="feedback-categories-role-select"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-gray-400">Loading…</div>
      ) : error && categories.length === 0 ? (
        <div className="py-10 text-center text-sm text-red-500">{error}</div>
      ) : (
        <div className="mb-4 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {categories.map(cat => (
            <div key={cat.id} className="flex items-center gap-3 px-4 py-2.5" data-testid={`feedback-category-row-${cat.key}`}>
              <span className="text-lg">{cat.icon}</span>
              <span className={`flex-1 text-sm font-medium ${cat.is_active ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{cat.label}</span>
              <span className="text-xs text-gray-400">{cat.department || '—'}</span>
              <button
                type="button"
                data-testid={`feedback-category-toggle-${cat.key}`}
                onClick={() => toggleActive(cat)}
                className={`rounded-md px-2 py-1 text-xs font-semibold ${cat.is_active ? 'bg-gray-100 text-gray-600' : 'bg-emerald-50 text-emerald-600'}`}
              >
                {cat.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          ))}
          {categories.length === 0 && <p className="px-4 py-6 text-center text-sm text-gray-400">No categories for this role yet.</p>}
        </div>
      )}

      <div className="rounded-xl border border-dashed border-gray-300 p-4">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Add category</p>
        <div className="flex flex-wrap gap-2">
          <input
            data-testid="feedback-new-category-label"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder="e.g. Library"
            className="flex-1 min-w-[140px] rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <input
            data-testid="feedback-new-category-department"
            value={newDepartment}
            onChange={e => setNewDepartment(e.target.value)}
            placeholder="Department (optional)"
            className="flex-1 min-w-[140px] rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            data-testid="feedback-add-category-btn"
            onClick={addCategory}
            disabled={saving || !newLabel.trim()}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Add
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      </div>
    </div>
  )
}
