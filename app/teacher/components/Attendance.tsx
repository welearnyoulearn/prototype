'use client'

import { useEffect, useState } from 'react'
import { addDays, todayIST, TEACHER_BACKDATE_DAYS } from '@/lib/attendanceRules'
import ClassPicker from './attendance/ClassPicker'
import MarkSheet from './attendance/MarkSheet'
import HistoryView from './attendance/HistoryView'
import ClassDashboard from '@/app/components/attendance-dashboard/ClassDashboard'
import { useApi } from '@/app/components/attendance-dashboard/parts'
import type { Overview, Session } from './attendance/types'

// Teacher attendance. Any teacher can mark any class, Morning or Afternoon:
//   1. pick a class + session (each shows if it is already marked, and by whom),
//   2. mark it — or, if someone already has, view it read-only (and report a mistake),
//   3. on a holiday nothing can be marked.
// The first submit locks the session; the rules are enforced on the server (see #153).
// teacherId / schoolId are kept as props for the portal, but identity always comes from the login.

type Props = { teacherId: number; schoolId: number }
type Loaded = { key: string; overview: Overview | null; error: string }

export default function Attendance({ teacherId, schoolId }: Props) {
  void teacherId; void schoolId
  const today = todayIST()
  const minDate = addDays(today, -TEACHER_BACKDATE_DAYS)

  const [mode, setMode] = useState<'mark' | 'history' | 'mine'>('mark')
  const [myClassId, setMyClassId] = useState<number | null>(null)
  // "My class" dashboard: only for a class teacher (subject teachers just mark and look back).
  const mine = useApi<{ classes: { id: number; grade: string; section: string }[] }>('/api/attendance/dashboard?scope=my-classes')
  const myClasses = mine.data?.classes ?? []
  const activeMyClass = myClasses.find(c => c.id === myClassId) ?? myClasses[0] ?? null
  const [date, setDate] = useState(today)
  const [open, setOpen] = useState<{ classId: number; session: Session } | null>(null)
  const [reload, setReload] = useState(0)

  const key = `${date}|${reload}`
  const [loaded, setLoaded] = useState<Loaded>({ key: '', overview: null, error: '' })

  useEffect(() => {
    let cancelled = false
    fetch(`/api/attendance/overview?date=${date}`, { cache: 'no-store' })
      .then(async r => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(body.error || 'Could not load the classes')
        return body as Overview
      })
      .then(overview => { if (!cancelled) setLoaded({ key, overview, error: '' }) })
      .catch((e: unknown) => { if (!cancelled) setLoaded({ key, overview: null, error: e instanceof Error ? e.message : 'Could not load the classes' }) })
    return () => { cancelled = true }
  }, [date, key])

  const loading = loaded.key !== key
  // Keep showing the last good list while a refresh is in flight — no flicker after saving.
  const overview = loaded.overview

  return (
    <div className="space-y-5 max-w-5xl" data-testid="teacher-attendance">
      {!open && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Attendance</h2>
            <p className="text-sm text-gray-500 mt-0.5">Choose a class and a session. Once marked, a session is locked for other teachers.</p>
          </div>
          <div className="inline-flex bg-gray-100 rounded-xl p-1" role="tablist" aria-label="Attendance mode">
            {(myClasses.length > 0 ? (['mark', 'history', 'mine'] as const) : (['mark', 'history'] as const)).map(m => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} data-testid={`att-mode-${m}`}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold ${mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                {m === 'mark' ? 'Mark' : m === 'history' ? 'History' : 'My class'}
              </button>
            ))}
          </div>
        </div>
      )}

      {open ? (
        <MarkSheet
          key={`${open.classId}|${date}`}
          classId={open.classId} date={date} session={open.session}
          onBack={() => { setOpen(null); setReload(r => r + 1) }}
          onChanged={() => setReload(r => r + 1)}
        />
      ) : mode === 'mine' && activeMyClass ? (
        <div className="space-y-3">
          {myClasses.length > 1 && (
            <select value={activeMyClass.id} onChange={e => setMyClassId(Number(e.target.value))} aria-label="Choose class" data-testid="att-my-class-select"
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
              {myClasses.map(c => <option key={c.id} value={c.id}>Class {c.grade}-{c.section}</option>)}
            </select>
          )}
          <ClassDashboard key={activeMyClass.id} classId={activeMyClass.id} subtitle="You are the class teacher" />
        </div>
      ) : mode === 'history' ? (
        <HistoryView classes={overview?.classes ?? []} today={today} />
      ) : (
        <ClassPicker
          overview={overview} loading={loading && !overview} error={loaded.error && !loading ? loaded.error : ''}
          date={date} minDate={minDate} today={today}
          onDateChange={setDate}
          onOpen={(classId, session) => setOpen({ classId, session })}
          onRetry={() => setReload(r => r + 1)}
        />
      )}
    </div>
  )
}
