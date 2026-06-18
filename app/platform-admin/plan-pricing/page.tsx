'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { OVERRIDABLE_FEATURE_KEYS } from '@/lib/features'

const TIERS = ['basic', 'standard', 'premium']

type Row = { plan_name: string; feature_key: string; enabled: boolean }

export default function PlanPricingPage() {
  const [rows, setRows]       = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState('')

  useEffect(() => {
    fetch('/api/platform/plan-pricing')
      .then(r => r.json())
      .then(d => setRows(d.features || []))
      .finally(() => setLoading(false))
  }, [])

  function isEnabled(tier: string, key: string) {
    return rows.find(r => r.plan_name === tier && r.feature_key === key)?.enabled ?? false
  }

  function toggle(tier: string, key: string) {
    setRows(prev => {
      const existing = prev.find(r => r.plan_name === tier && r.feature_key === key)
      if (existing) return prev.map(r => r.plan_name === tier && r.feature_key === key ? { ...r, enabled: !r.enabled } : r)
      return [...prev, { plan_name: tier, feature_key: key, enabled: true }]
    })
    setMsg('')
  }

  async function save() {
    setSaving(true); setMsg('')
    try {
      const assignments = TIERS.flatMap(tier =>
        OVERRIDABLE_FEATURE_KEYS.map(key => ({
          plan_name: tier, feature_key: key, enabled: isEnabled(tier, key),
        }))
      )
      const res = await fetch('/api/platform/plan-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg(data.error || 'Failed to save'); return }
      setMsg('Saved successfully')
      setTimeout(() => setMsg(''), 3000)
    } catch { setMsg('Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Link href="/platform-admin" className="text-gray-400 hover:text-gray-600 text-sm">← Platform Admin</Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-800 font-medium text-sm">Plan Pricing & Add-on Features</span>
        </div>
        <div className="flex items-center gap-3">
          {msg && <span className={`text-sm ${msg.includes('success') ? 'text-green-600' : 'text-red-600'}`}>{msg}</span>}
          <button onClick={save} disabled={saving}
            className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Add-on Feature Configuration</h1>
          <p className="text-gray-500 text-sm mt-1">
            Control which add-on features are available per plan tier by default.
            You can also override these per school from the school detail page.
          </p>
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-400">Loading…</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-[1fr_100px_100px_100px] bg-gray-50 border-b border-gray-200">
              <div className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Feature</div>
              {TIERS.map(t => (
                <div key={t} className="px-3 py-3 text-xs font-semibold uppercase text-center text-gray-600 capitalize">{t}</div>
              ))}
            </div>

            {OVERRIDABLE_FEATURE_KEYS.map((key, i) => (
              <div key={key} className={`grid grid-cols-[1fr_100px_100px_100px] items-center ${i < OVERRIDABLE_FEATURE_KEYS.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div className="px-5 py-4">
                  <p className="text-sm font-medium text-gray-800">{key}</p>
                </div>
                {TIERS.map(tier => {
                  const enabled = isEnabled(tier, key)
                  return (
                    <div key={tier} className="flex items-center justify-center py-4">
                      <button onClick={() => toggle(tier, key)}
                        className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${enabled ? 'bg-purple-600 border-transparent' : 'border-gray-300 bg-white hover:border-gray-400'}`}>
                        {enabled && <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </button>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-gray-400 text-center">
          Per-school overrides take precedence over these tier defaults. Set overrides in Schools → [School] → Feature Overrides.
        </p>
      </div>
    </div>
  )
}
