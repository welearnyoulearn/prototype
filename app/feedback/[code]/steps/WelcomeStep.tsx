'use client'

import { FEEDBACK_ROLES } from '@/lib/feedback-defaults'
import { FeedbackRole } from '../types'
import MascotHeader from './MascotHeader'

export default function WelcomeStep({ schoolName, onSelectRole }: { schoolName: string; onSelectRole: (role: FeedbackRole) => void }) {
  return (
    <div>
      <MascotHeader emoji="👋" />
      <h1 className="text-center text-xl font-bold text-slate-900 mb-1">Welcome to {schoolName} 💬</h1>
      <p className="text-center text-sm text-slate-500 mb-5">Your voice helps us create a better school experience!</p>
      <p className="text-center text-sm font-bold text-slate-900 mb-3">How would you like to share feedback?</p>
      <div className="grid grid-cols-2 gap-3">
        {FEEDBACK_ROLES.map(r => (
          <button
            key={r.key}
            type="button"
            data-testid={`feedback-role-${r.key}-btn`}
            onClick={() => onSelectRole(r.key)}
            className="flex flex-col items-center gap-1.5 rounded-2xl border-2 border-transparent bg-violet-50 p-4 text-center transition hover:-translate-y-1 hover:border-violet-400"
          >
            <span className="text-3xl">{r.icon}</span>
            <span className="text-sm font-bold text-slate-900">{r.label}</span>
          </button>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-slate-300">No login required · Takes under a minute</p>
    </div>
  )
}
