'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

type School = {
  id: number
  name: string
  type: string
  city: string
  country: string
  status: string
  created_at: string
}

type Subscription = {
  school_id: number
  tier: 'none' | 'basic' | 'standard' | 'premium'
}

const TIERS = [
  {
    key: 'none',
    label: 'No Plan',
    color: 'gray',
    description: 'School has no active subscription.',
    features: [],
  },
  {
    key: 'basic',
    label: 'Basic',
    color: 'green',
    description: 'Essential school management features.',
    features: [
      'Teacher Leave Management',
      'Student-Teacher Analysis',
      'Staff Bulk Onboarding',
      'Student Bulk Onboarding (class-wise)',
      'Class & Subject Management',
    ],
  },
  {
    key: 'standard',
    label: 'Standard',
    color: 'blue',
    description: 'Everything in Basic, plus communication & finance tools.',
    features: [
      'Everything in Basic',
      'Parent Communication Portal',
      'Fee Management',
      'Exam & Marks Management',
      'Report Card Generation',
    ],
    comingSoon: true,
  },
  {
    key: 'premium',
    label: 'Premium',
    color: 'purple',
    description: 'Full platform access with AI-powered insights.',
    features: [
      'Everything in Standard',
      'AI-Powered Analytics & Insights',
      'Multi-Branch Management',
      'Custom Branding',
      'Priority Support',
    ],
    comingSoon: true,
  },
]

const colorMap: Record<string, string> = {
  gray: 'border-gray-200 bg-gray-50',
  green: 'border-green-400 bg-green-50',
  blue: 'border-blue-400 bg-blue-50',
  purple: 'border-purple-400 bg-purple-50',
}
const selectedColorMap: Record<string, string> = {
  gray: 'ring-2 ring-gray-400',
  green: 'ring-2 ring-green-500',
  blue: 'ring-2 ring-blue-500',
  purple: 'ring-2 ring-purple-500',
}
const badgeMap: Record<string, string> = {
  none: 'bg-gray-100 text-gray-600',
  basic: 'bg-green-100 text-green-700',
  standard: 'bg-blue-100 text-blue-700',
  premium: 'bg-purple-100 text-purple-700',
}

export default function SchoolDetailPage() {
  const params = useParams()
  const schoolId = params.id as string

  const [school, setSchool] = useState<School | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [selectedTier, setSelectedTier] = useState<string>('none')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        await fetch('/api/init')
        const [schoolRes, subRes] = await Promise.all([
          fetch(`/api/schools/${schoolId}`),
          fetch(`/api/schools/${schoolId}/subscription`),
        ])
        const schoolData = await schoolRes.json()
        const subData = await subRes.json()
        if (!schoolRes.ok) throw new Error(schoolData.error)
        setSchool(schoolData)
        setSubscription(subData)
        setSelectedTier(subData.tier || 'none')
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load school')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [schoolId])

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      const res = await fetch(`/api/schools/${schoolId}/subscription`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: selectedTier }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSubscription(data)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const hasChanged = subscription?.tier !== selectedTier

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Loading school...</p>
      </div>
    )
  }

  if (!school) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 font-medium">School not found</p>
          <Link href="/platform-admin" className="text-purple-600 text-sm mt-2 block hover:underline">← Back to Platform Admin</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/platform-admin" className="text-gray-400 hover:text-gray-600 text-sm">← Platform Admin</Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-800 font-medium text-sm">{school.name}</span>
        </div>
        <span className="bg-purple-100 text-purple-700 text-xs font-medium px-3 py-1 rounded-full">Platform Admin</span>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-4">✕</button>
          </div>
        )}

        {/* School Header */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-gray-900">{school.name}</h1>
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
                  school.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>{school.status}</span>
              </div>
              <p className="text-gray-500 text-sm">
                {[school.type, school.city, school.country].filter(Boolean).join(' · ')}
              </p>
              <p className="text-gray-400 text-xs mt-1">ID #{school.id} · Created {new Date(school.created_at).toLocaleDateString()}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 mb-1">Current Plan</p>
              <span className={`text-sm font-semibold px-3 py-1 rounded-full capitalize ${badgeMap[subscription?.tier || 'none']}`}>
                {subscription?.tier === 'none' || !subscription?.tier ? 'No Plan' : subscription.tier}
              </span>
            </div>
          </div>
        </div>

        {/* Subscription Tier Selection */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Subscription Plan</h2>
          <p className="text-gray-500 text-sm mb-4">Select a plan to enable features for this school. Changes reflect immediately in the School Admin dashboard.</p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {TIERS.map(tier => (
              <div
                key={tier.key}
                onClick={() => !tier.comingSoon && setSelectedTier(tier.key)}
                className={`relative rounded-xl border-2 p-5 transition-all ${
                  tier.comingSoon ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:shadow-md'
                } ${colorMap[tier.color]} ${selectedTier === tier.key ? selectedColorMap[tier.color] : ''}`}
              >
                {tier.comingSoon && (
                  <span className="absolute top-3 right-3 text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-medium">Coming Soon</span>
                )}
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    selectedTier === tier.key
                      ? tier.color === 'gray' ? 'border-gray-500 bg-gray-500' :
                        tier.color === 'green' ? 'border-green-500 bg-green-500' :
                        tier.color === 'blue' ? 'border-blue-500 bg-blue-500' :
                        'border-purple-500 bg-purple-500'
                      : 'border-gray-300'
                  }`}>
                    {selectedTier === tier.key && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <span className="font-semibold text-gray-900 text-base">{tier.label}</span>
                </div>
                <p className="text-sm text-gray-500 mb-3 ml-7">{tier.description}</p>
                {tier.features.length > 0 && (
                  <ul className="ml-7 space-y-1">
                    {tier.features.map(f => (
                      <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          tier.comingSoon ? 'bg-gray-400' :
                          tier.color === 'green' ? 'bg-green-500' :
                          tier.color === 'blue' ? 'bg-blue-500' : 'bg-purple-500'
                        }`} />
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving || !hasChanged}
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Plan'}
          </button>
          {saved && (
            <span className="text-green-600 text-sm font-medium">
              ✓ Plan updated — school admin will now see the enabled features
            </span>
          )}
          {!hasChanged && !saved && (
            <span className="text-gray-400 text-sm">No changes to save</span>
          )}
        </div>
      </div>
    </div>
  )
}
