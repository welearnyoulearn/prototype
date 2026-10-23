import type { ChecklistStep } from '@/lib/feeYearEndChecklist'

const ICON: Record<ChecklistStep['status'], { glyph: string; cls: string }> = {
  done:    { glyph: '✓', cls: 'bg-green-100 text-green-700' },
  todo:    { glyph: '○', cls: 'bg-gray-100 text-gray-500' },
  waiting: { glyph: '…', cls: 'bg-amber-100 text-amber-700' },
  warn:    { glyph: '!', cls: 'bg-red-100 text-red-700' },
}

// Live status of each year-end step, with who owns the process. Informational — every action still
// happens in the steps below; this just answers "where are we, and what's next?".
export default function YearEndChecklist({ year, steps, ownerName, approverName, signoffOn, leaveOpenDays, onOpenRollover }: {
  year: string
  steps: ChecklistStep[]
  ownerName: string | null
  approverName: string | null
  signoffOn: boolean
  leaveOpenDays: number
  onOpenRollover?: () => void
}) {
  const done = steps.filter(s => s.status === 'done').length
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0
  const next = steps.find(s => s.status !== 'done')
  return (
    <div data-testid="yearend-checklist" className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Year-end checklist · {year}</p>
          <p data-testid="yearend-checklist-progress" className="text-sm font-semibold text-gray-800 mt-0.5">
            {done} of {steps.length} done{next ? ` — next: ${next.label}` : ' — all done 🎉'}
          </p>
        </div>
        <div className="text-xs text-gray-500 text-right space-y-0.5">
          <p>Owner: <strong className="text-gray-700" data-testid="yearend-owner">{ownerName ?? 'not assigned (set it under Staff Accounts)'}</strong></p>
          <p>{signoffOn ? <>Sign-off: <strong className="text-gray-700">{approverName}</strong></> : 'Sign-off: not needed'} · Leave Open deadline: {leaveOpenDays} days</p>
        </div>
      </div>

      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-[#245b46] rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>

      <ul className="space-y-2">
        {steps.map(s => (
          <li key={s.id} data-testid={`checklist-${s.id}`} data-status={s.status} className="flex items-start gap-3">
            <span className={`mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${ICON[s.status].cls}`}>{ICON[s.status].glyph}</span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${s.status === 'done' ? 'text-gray-500' : 'text-gray-800 font-medium'}`}>{s.label}</p>
              <p className={`text-xs ${s.status === 'warn' ? 'text-red-600' : s.status === 'waiting' ? 'text-amber-700' : 'text-gray-400'}`}>{s.detail}</p>
            </div>
            {s.id === 'rollover' && s.status === 'todo' && s.detail.startsWith('Next') && onOpenRollover && (
              <button onClick={onOpenRollover} className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg font-medium hover:bg-blue-700">Open Year Rollover →</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
