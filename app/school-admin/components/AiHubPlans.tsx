'use client'

import { useEffect, useState } from 'react'

type Plan = { id: number; name: string; students_included: number; queries_per_student_per_day: number; price: number }
type CurrentSub = { ai_plan_id: number; active: boolean; students_licensed: number; start_date: string }

export default function AiHubPlans() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [current, setCurrent] = useState<CurrentSub | null>(null)
  const [loading, setLoading] = useState(true)
  const [activating, setActivating] = useState<number | null>(null)
  const [justActivated, setJustActivated] = useState<number | null>(null)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    fetch('/api/school/ai-plans')
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Failed to load plans')
        return r.json()
      })
      .then(data => { setPlans(data.plans || []); setCurrent(data.currentSubscription) })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  async function activate(planId: number) {
    setActivating(planId)
    setError('')
    try {
      const res = await fetch('/api/school/ai-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_plan_id: planId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to activate plan')
      setCurrent(data.subscription)
      setJustActivated(planId)
      setTimeout(() => setJustActivated(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate plan')
    } finally {
      setActivating(null)
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-pulse max-w-4xl">
        {[1, 2, 3].map(i => <div key={i} className="h-64 bg-gray-100 rounded-2xl" />)}
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <span className="w-8 h-8 rounded-xl bg-purple-600 flex items-center justify-center text-sm">🤖</span>
          AI Doubt Assistant — Plans
        </h2>
        <p className="text-sm text-gray-500 mt-1">Give your students access to the AI-powered syllabus doubt assistant.</p>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {current?.active && (
        <div className="mb-5 flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-sm font-medium px-4 py-2.5 rounded-xl" data-testid="ai-hub-current-plan-banner">
          <span>✅</span>
          Currently on <strong>{plans.find(p => p.id === current.ai_plan_id)?.name ?? 'a plan'}</strong> — {current.students_licensed} students licensed since {new Date(current.start_date).toLocaleDateString()}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {plans.map(plan => {
          const isCurrent = current?.active && current.ai_plan_id === plan.id
          return (
            <div key={plan.id}
              data-testid={`ai-hub-plan-card-${plan.name}`}
              className={`card-lift relative bg-white rounded-2xl border-2 p-5 flex flex-col ${isCurrent ? 'border-purple-500 shadow-md' : 'border-gray-100'}`}>
              {isCurrent && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full">CURRENT PLAN</span>
              )}
              <h3 className="font-bold text-gray-800 text-base mt-2">{plan.name}</h3>
              <p className="text-2xl font-extrabold text-gray-800 mt-2">
                ₹{plan.price}<span className="text-xs font-medium text-gray-400">/mo</span>
              </p>
              <ul className="text-sm text-gray-500 space-y-1.5 mt-4 flex-1">
                <li>👥 Up to {plan.students_included} students</li>
                <li>💬 {plan.queries_per_student_per_day} questions/student/day</li>
              </ul>
              <button
                data-testid={`ai-hub-activate-btn-${plan.name}`}
                onClick={() => activate(plan.id)}
                disabled={activating === plan.id || !!isCurrent}
                className={`mt-5 w-full text-sm font-bold py-2.5 rounded-xl transition-all active:scale-95 disabled:opacity-60 ${
                  isCurrent ? 'bg-purple-50 text-purple-600' : 'bg-purple-600 text-white hover:bg-purple-700'
                }`}>
                {isCurrent ? '✓ Active' : activating === plan.id ? 'Activating…' : justActivated === plan.id ? "You're live! 🎉" : 'Activate'}
              </button>
            </div>
          )
        })}
      </div>

      {/* TODO(real payments): plans activate immediately for now — no
          payment collection exists yet. Wire a real checkout/payment
          confirmation step here before setting a subscription active. */}
      <p className="text-xs text-gray-400 mt-5">Prices shown are illustrative — no payment is collected yet in this prototype phase.</p>
    </div>
  )
}
