'use client'

import { useEffect, useState } from 'react'

type Feature    = { key: string; label: string; category: string; portals: string[] }

const PORTAL_LABEL: Record<string, string> = { 'school-admin': 'School', student: 'Student', parent: 'Parent' }
type Matrix     = Record<string, Record<string, boolean>>  // feature_key → { basic, standard, premium }
type StaffLimits = Record<string, string>  // tier → '' (unlimited) | '2' | '5' etc.

const TIERS = [
  { key: 'basic',    label: 'Basic',    color: 'text-green-700',  bg: 'bg-green-50',  ring: 'ring-green-400',  check: 'bg-green-500' },
  { key: 'standard', label: 'Standard', color: 'text-blue-700',   bg: 'bg-blue-50',   ring: 'ring-blue-400',   check: 'bg-blue-500' },
  { key: 'premium',  label: 'Premium',  color: 'text-purple-700', bg: 'bg-purple-50', ring: 'ring-purple-400', check: 'bg-purple-500' },
]

const CATEGORY_ORDER = ['Core', 'Scheduling', 'Analytics', 'Finance', 'Communication', 'Administration']

export default function FeaturePlansPage() {
  const [features, setFeatures]     = useState<Feature[]>([])
  const [matrix, setMatrix]         = useState<Matrix>({})
  const [staffLimits, setStaffLimits] = useState<StaffLimits>({ basic: '2', standard: '5', premium: '', none: '1' })
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [error, setError]           = useState('')
  const [showSavedPopup, setShowSavedPopup] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const res = await fetch('/api/platform/features')
      const data = await res.json()
      if (Array.isArray(data.features)) setFeatures(data.features)
      if (data.matrix && typeof data.matrix === 'object') setMatrix(data.matrix)
      if (data.staffLimits) {
        setStaffLimits({
          basic:    data.staffLimits.basic    == null ? '' : String(data.staffLimits.basic),
          standard: data.staffLimits.standard == null ? '' : String(data.staffLimits.standard),
          premium:  data.staffLimits.premium  == null ? '' : String(data.staffLimits.premium),
          none:     data.staffLimits.none     == null ? '' : String(data.staffLimits.none),
        })
      }
    } catch { setError('Failed to load features') }
    finally { setLoading(false) }
  }

  // Each tier checkbox is independent — checking Premium does NOT auto-check Basic/Standard.
  // This allows premium-only, standard-only, or any custom combination.
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
        body: JSON.stringify({ assignments, staffLimits }),
      })
      if (!res.ok) throw new Error()
      setSaved(true)
      setShowSavedPopup(true)
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
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <h1 className="text-lg font-bold text-gray-900">Feature Plans</h1>
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
            Each tier checkbox is independent — you can enable a feature for Premium only without giving it to Basic or Standard.
            School admins only see features enabled for their plan.
          </p>
        </div>

        {/* Plan summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {TIERS.map(t => (
            <div key={t.key} className={`rounded-xl border-2 p-5 ${t.bg} border-${t.key === 'basic' ? 'green' : t.key === 'standard' ? 'blue' : 'purple'}-200`}>
              <p className={`text-sm font-bold uppercase tracking-wide ${t.color}`}>{t.label}</p>
              <p className="text-3xl font-black text-gray-900 mt-2">{loading ? '—' : counts[t.key]}</p>
              <p className="text-xs text-gray-500 mt-1">of {features.length} features enabled</p>
              <div className="mt-4 pt-4 border-t border-black/10">
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Staff Account Limit</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    placeholder="Unlimited"
                    value={staffLimits[t.key] ?? ''}
                    onChange={e => { setStaffLimits(prev => ({ ...prev, [t.key]: e.target.value })); setSaved(false) }}
                    className="w-full rounded-lg border border-black/20 bg-white/70 px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-current"
                    data-testid={`staff-limit-${t.key}`}
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Leave blank for unlimited</p>
              </div>
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
                    <div className="px-5 py-3.5 flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-gray-800 font-medium">{feature.label}</span>
                      {/* Badge: show tier restriction at a glance */}
                      {(() => {
                        const b = matrix[feature.key]?.basic    ?? false
                        const s = matrix[feature.key]?.standard ?? false
                        const p = matrix[feature.key]?.premium  ?? false
                        if (!b && !s && p)  return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">Premium only</span>
                        if (!b && s && p)   return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">Standard+</span>
                        if (!b && !s && !p) return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">Disabled</span>
                        return null
                      })()}
                      {/* Badge: this toggle also gates other portals, not just School Admin */}
                      {feature.portals?.length > 1 && (
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700"
                          title={`Also gates: ${feature.portals.filter(p => p !== 'school-admin').map(p => PORTAL_LABEL[p] || p).join(', ')} portal`}
                        >
                          {feature.portals.map(p => PORTAL_LABEL[p] || p).join(' · ')}
                        </span>
                      )}
                    </div>

                    {TIERS.map(t => {
                      const enabled = matrix[feature.key]?.[t.key] ?? false
                      return (
                        <div key={t.key} className="flex items-center justify-center py-3.5">
                          <button
                            onClick={() => toggle(feature.key, t.key)}
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

      {/* ── Save Confirmation Popup ── */}
      {showSavedPopup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="bg-green-600 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-white font-bold text-base">Plan Config Saved!</h3>
                  <p className="text-green-200 text-xs">Feature access updated across all schools</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-5">
              <div className="space-y-2 mb-4">
                {TIERS.map(t => (
                  <div key={t.key} className="flex items-center justify-between text-sm">
                    <span className={`font-medium ${t.color}`}>{t.label}</span>
                    <span className="text-gray-500">{features.filter(f => matrix[f.key]?.[t.key]).length} features enabled</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 mb-4">
                School admin dashboards will reflect these changes on next page load.
              </p>
              <button onClick={() => setShowSavedPopup(false)}
                className="w-full bg-gray-900 hover:bg-gray-800 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
