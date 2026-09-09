'use client'

import { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FEEDBACK_ROLES } from '@/lib/feedback-defaults'
import { useFeedbackFetch } from './useFeedbackFetch'

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

function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-')
}

export default function FeedbackCategoryEditor({ schoolId }: { schoolId: number }) {
  const [role, setRole] = useState('parent')
  const [newLabel, setNewLabel] = useState('')
  const [newDepartment, setNewDepartment] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const { data: categories, loading, error: loadError, reload } = useFeedbackFetch<Category[]>(
    `/api/feedback/categories?school_id=${schoolId}&role=${role}`, [schoolId, role], 'Failed to load categories'
  )
  const rows = categories ?? []

  async function addCategory() {
    if (!newLabel.trim()) return
    setSaving(true); setFormError('')
    try {
      const res = await fetch('/api/feedback/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, role, key: slugify(newLabel), label: newLabel.trim(), department: newDepartment.trim() || undefined }),
      })
      if (!res.ok) { const body = await res.json(); throw new Error(body.error || 'Failed to add category') }
      setNewLabel(''); setNewDepartment('')
      reload()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to add category')
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
    reload()
  }

  return (
    <div data-testid="feedback-category-editor">
      <div className="mb-4 flex items-center gap-3">
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-44" data-testid="feedback-categories-role-select"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FEEDBACK_ROLES.map(r => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-gray-400">Loading…</div>
      ) : loadError ? (
        <div className="py-10 text-center text-sm text-red-500">{loadError}</div>
      ) : (
        <div className="mb-4 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {rows.map(cat => (
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
          {rows.length === 0 && <p className="px-4 py-6 text-center text-sm text-gray-400">No categories for this role yet.</p>}
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
        {formError && <p className="mt-2 text-xs text-red-500">{formError}</p>}
      </div>
    </div>
  )
}
