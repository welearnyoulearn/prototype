'use client'

import { useEffect, useState } from 'react'
import type { Checklist } from '@/lib/setupChecklist'

// The setup checklist on the school's Overview until everything is done (DOCS/SCHOOL-ONBOARDING.md §5).
// Items tick themselves from the school's data; each "Open" goes to the screen where it is done.
export default function SetupChecklist({ onNavigate }: { onNavigate?: (key: string) => void }) {
  const [list, setList] = useState<Checklist | null>(null)
  useEffect(() => {
    // Anything unexpected (an error body, a missing feature) simply hides the card — it must never break the page.
    fetch('/api/school/setup-checklist', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((d: Checklist | null) => setList(d && Array.isArray(d.items) && d.total > 0 ? d : null))
      .catch(() => setList(null))
  }, [])
  if (!list || list.complete) return null
  const pct = Math.round((list.done / list.total) * 100)
  return (
    <section className="rounded-xl border border-[#dce2db] bg-white p-5" data-testid="setup-checklist">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-900">Set up your school</h2>
        <span className="text-sm text-[#67736b]" data-testid="setup-checklist-progress">{list.done} of {list.total} done</span>
      </div>
      <div className="mt-2 h-2 w-full rounded-full bg-[#eef2eb]" aria-hidden="true"><div className="h-2 rounded-full bg-[#245b46]" style={{ width: `${pct}%` }} /></div>
      <ol className="mt-4 space-y-2">
        {list.items.map(i => (
          <li key={i.key} className="flex items-start justify-between gap-3" data-testid={`setup-item-${i.key}`} data-done={i.done}>
            <span className="flex items-start gap-2">
              <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${i.done ? 'bg-[#245b46] text-white' : 'border border-gray-300'}`}>{i.done ? '✓' : ''}</span>
              <span><span className={i.done ? 'text-gray-500 line-through' : 'text-gray-900'}>{i.label}</span>{!i.done && <span className="block text-xs text-[#67736b]">{i.hint}</span>}</span>
            </span>
            {!i.done && onNavigate && <button onClick={() => onNavigate(i.tab)} data-testid={`setup-open-${i.key}`} className="shrink-0 rounded-md border border-[#dce2db] px-2.5 py-1 text-xs text-[#465449] hover:bg-[#eef2eb]">Open</button>}
          </li>
        ))}
      </ol>
    </section>
  )
}
