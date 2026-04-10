'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Feature = { key: string; label: string; category: string }
type Matrix  = Record<string, Record<string, boolean>>  // feature_key → { basic, standard, premium }

const TIERS = [
  { key: 'basic',    label: 'Basic',    color: 'text-green-700',  bg: 'bg-green-50',  ring: 'ring-green-400',  check: 'bg-green-500' },
  { key: 'standard', label: 'Standard', color: 'text-blue-700',   bg: 'bg-blue-50',   ring: 'ring-blue-400',   check: 'bg-blue-500' },
  { key: 'premium',  label: 'Premium',  color: 'text-purple-700', bg: 'bg-purple-50', ring: 'ring-purple-400', check: 'bg-purple-500' },
]

const CATEGORY_ORDER = ['Core', 'Academic', 'Analytics', 'Finance', 'Communication', 'Administration']

export default function FeaturePlansPage() {
  const [features, setFeatures] = useState<Feature[]>([])
  const [matrix, setMatrix]     = useState<Matrix>({})
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const res = await fetch('/api/platform/features')
      const data = await res.json()
      setFeatures(data.features)
      setMatrix(data.matrix)
    } catch { setError('Failed to load features') }
    finally { setLoading(false) }
  }

  function toggle(featureKey: string, tier: string) {
    setMatrix(prev => ({
      ...prev,
      [featureKey]: {
        ...prev[featureKey],
        [tier]: !prev[featureKey]?.[tier],
      },
    }))
    setSaved(false)
  }

  // When enabling a tier, also enable all lower tiers (premium includes standard includes basic)
  function toggleWithCascade(featureKey: string, tier: string) {
    const tierOrder = ['basic', 'standard', 'premium']
    const tierIdx   = tierOrder.indexOf(tier)
    const current   = matrix[featureKey]?.[tier] ?? false

    setMatrix(prev => {
      const updated = { ...prev[featureKey] }
      if (!current) {
        // enabling: also enable all lower tiers
        for (let i = 0; i <= tierIdx; i++) updated[tierOrder[i]] = true
      } else {
        // disabling: also disable all higher tiers
        for (let i = tierIdx; i < tierOrder.length; i++) updated[tierOrder[i]] = false
      }
      return { ...prev, [featureKey]: updated }
    })
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true); setError('')
    try {
      const assignments: { feature_key: string; tier: string; enabled: boolean }[] = []
      for (const [featureKey, tiers] of Object.entries(matrix)) {
        for (const [tier, enabled] of Object.entries(tiers)) {
          assignments.push({ feature_key: featureKey, tier, enabled })
        }
      }
      const res = await fetch('/api/platform/features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments }),
      })
      if (!res.ok) throw new Error()
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch { setError('Failed to save') }
    finally { setSaving(false) }
  }

  // Group features by category
  const grouped = CATEGORY_ORDER.map(cat => ({
    category: cat,
    items: features.filter(f => f.category === cat),
  })).filter(g => g.items.length > 0)

  // Summary counts
  const counts = TIERS.reduce((acc, t) => {
    acc[t.key] = features.filter(f => matrix[f.key]?.[t.key]).length
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Link href="/platform-admin" className="text-gray-400 hover:text-gray-600 text-sm">← Platform Admin</Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-800 font-medium text-sm">Feature Plans</span>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-green-600 text-sm font-medium">✓ Saved — school admins will see changes immediately</span>}
          {error && <span className="text-red-600 text-sm">{error}</span>}
          <button onClick={handleSave} disabled={saving}
            className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Plan Config'}
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">Feature Plan Configuration</h1>
          <p className="text-gray-500 text-sm mt-1">
            Check which features are available in each plan. School admins will only see features enabled for their plan.
            Enabling a higher tier also enables lower tiers automatically.
          </p>
        </div>

        {/* Plan summary */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {TIERS.map(t => (
            <div key={t.key} className={`rounded-xl border-2 p-5 ${t.bg} border-${t.key === 'basic' ? 'green' : t.key === 'standard' ? 'blue' : 'purple'}-200`}>
              <p className={`text-sm font-bold uppercase tracking-wide ${t.color}`}>{t.label}</p>
              <p className="text-3xl font-black text-gray-900 mt-2">{loading ? '—' : counts[t.key]}</p>
              <p className="text-xs text-gray-500 mt-1">of {features.length} features enabled</p>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="py-20 text-center text-gray-400">Loading features…</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[1fr_100px_100px_100px] bg-gray-50 border-b border-gray-200">
              <div className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Feature</div>
              {TIERS.map(t => (
                <div key={t.key} className={`px-3 py-3 text-xs font-semibold uppercase tracking-wide text-center ${t.color}`}>
                  {t.label}
                </div>
              ))}
            </div>

            {grouped.map((group, gi) => (
              <div key={group.category}>
                {/* Category header */}
                <div className="px-5 py-2 bg-gray-50 border-y border-gray-100">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{group.category}</span>
                </div>

                {group.items.map((feature, fi) => (
                  <div
                    key={feature.key}
                    className={`grid grid-cols-[1fr_100px_100px_100px] items-center hover:bg-gray-50 transition-colors
                      ${gi < grouped.length - 1 || fi < group.items.length - 1 ? 'border-b border-gray-100' : ''}`}
                  >
                    <div className="px-5 py-3.5">
                      <span className="text-sm text-gray-800 font-medium">{feature.label}</span>
                    </div>

                    {TIERS.map(t => {
                      const enabled = matrix[feature.key]?.[t.key] ?? false
                      return (
                        <div key={t.key} className="flex items-center justify-center py-3.5">
                          <button
                            onClick={() => toggleWithCascade(feature.key, t.key)}
                            className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
                              enabled
                                ? `${t.check} border-transparent`
                                : 'border-gray-300 bg-white hover:border-gray-400'
                            }`}
                          >
                            {enabled && (
                              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-gray-400 mt-4 text-center">
          Changes saved here are reflected immediately in all school admin dashboards on next page load.
        </p>
      </div>
    </div>
  )
}
