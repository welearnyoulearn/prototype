'use client'

// The student portal's floating "Today" button (#442): a brass-rimmed dial whose ring shows today's quiz progress.
// One tap opens a short panel with what needs doing today, points, streak and rank, and shortcuts, so a student
// doesn't have to hunt through the portal. Data comes from the quiz, progress, doubts and attendance APIs that
// already exist; the wording and counts are decided in lib/studentDial.ts.

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { BookOpen, CalendarDays, Check, ChevronRight, CircleHelp, ClipboardCheck, MessageCircle, X, type LucideIcon } from 'lucide-react'
import { NOTIFICATIONS_CHANGED_EVENT } from '@/app/components/notificationGroups'
import { todayIST } from '@/lib/attendanceRules'
import { buildDialModel, type DialDoubt, type DialLink, type DialProgress, type DialRing, type DialStat, type DialTask, type DialToday } from '@/lib/studentDial'

const POLL_MS = 60_000

const TASK_ICON: Record<DialTask['key'], LucideIcon> = { quiz: CircleHelp, doubts: MessageCircle }
const LINK_ICON: Record<DialLink['key'], LucideIcon> = { marks: BookOpen, attendance: ClipboardCheck, calendar: CalendarDays }

type Props = {
  /** The school has the Daily Quiz switched on (also gates points, streak and rank). */
  dailyQuiz: boolean
  /** The school has Student Doubts switched on. */
  doubts: boolean
  /** The school has Attendance switched on. */
  attendance: boolean
  /** The school has the Academic Calendar switched on. */
  calendar: boolean
  /** Hide the dial while another layer (sidebar drawer, "All features") is open. */
  suspended?: boolean
  onNavigate: (navKey: string) => void
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

function Gauge({ ring, size, idPrefix }: { ring: DialRing; size: number; idPrefix: string }) {
  const r = 18
  const circ = 2 * Math.PI * r
  const fraction = ring.total > 0 ? ring.done / ring.total : 0
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden="true">
      <defs>
        <linearGradient id={`${idPrefix}b`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f3dfb8" /><stop offset=".5" stopColor="#b0702a" /><stop offset="1" stopColor="#6e4416" /></linearGradient>
        <radialGradient id={`${idPrefix}f`} cx=".4" cy=".3" r=".8"><stop offset="0" stopColor="#fffaf0" /><stop offset="1" stopColor="#e4d8bb" /></radialGradient>
      </defs>
      <circle cx="36" cy="36" r="35" fill={`url(#${idPrefix}b)`} />
      <circle cx="36" cy="36" r="29" fill="#153b2d" />
      <circle cx="36" cy="36" r="26" fill={`url(#${idPrefix}f)`} />
      <circle cx="36" cy="36" r={r} fill="none" stroke="#d6c9a8" strokeWidth="5" />
      <circle cx="36" cy="36" r={r} fill="none" stroke="#235b46" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(circ * fraction).toFixed(1)} ${circ.toFixed(1)}`} transform="rotate(-90 36 36)" />
      <text x="36" y="40.5" textAnchor="middle" className="sd-num" fontSize="14" fontWeight="700" fill="#153b2d">{ring.label}</text>
    </svg>
  )
}

export default function StudentDial({ dailyQuiz, doubts, attendance, calendar, suspended = false, onNavigate }: Props) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [open, setOpen] = useState(false)
  const [today, setToday] = useState<DialToday | null>(null)
  const [progress, setProgress] = useState<DialProgress | null>(null)
  const [doubtList, setDoubtList] = useState<DialDoubt[] | null>(null)
  const [attendancePct, setAttendancePct] = useState<number | null>(null)
  const fabRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const [t, p, d, a] = await Promise.all([
      dailyQuiz ? getJson<DialToday>('/api/student/quiz/today') : null,
      dailyQuiz ? getJson<DialProgress>('/api/student/quiz/progress') : null,
      doubts ? getJson<{ doubts: DialDoubt[] }>('/api/student/doubts') : null,
      attendance ? getJson<{ month?: { summary?: { pct?: unknown } } }>('/api/student/attendance') : null,
    ])
    if (t) setToday(t)
    if (p) setProgress(p)
    if (d) setDoubtList(d.doubts)
    if (a) setAttendancePct(typeof a.month?.summary?.pct === 'number' ? a.month.summary.pct : null)
  }, [dailyQuiz, doubts, attendance])

  useEffect(() => {
    const first = setTimeout(() => { void load() }, 0)
    const timer = setInterval(() => { if (!document.hidden) void load() }, POLL_MS)
    const onChanged = () => { void load() }
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged)
    }
  }, [load])

  const model = useMemo(
    () => buildDialModel({ dailyQuiz, doubts, attendance, calendar, today, progress, doubtList, attendancePct }),
    [dailyQuiz, doubts, attendance, calendar, today, progress, doubtList, attendancePct],
  )

  const close = useCallback(() => {
    setOpen(false)
    fabRef.current?.focus()
  }, [])

  function openPanel() {
    setOpen(true)
    void load()
  }

  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLElement>('button[data-sd-first]')?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])

  // Another layer opened over the portal: drop the panel now, so it isn't still open when that layer closes.
  if (suspended && open) setOpen(false)

  // Keep Tab inside the open panel.
  function trapTab(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button') ?? [])
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  function go(navKey: string) {
    setOpen(false)
    onNavigate(navKey)
  }

  if (suspended) return null

  const date = new Date(`${todayIST()}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  const loaded = today !== null || !dailyQuiz

  return (
    <div className="sd-root" data-testid="student-dial-container">
      <button
        ref={fabRef}
        type="button"
        className="sd-fab"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Open today’s summary${model.badge > 0 ? `, ${model.badge} to do` : ''}`}
        onClick={openPanel}
        data-testid="student-dial-fab-btn"
      >
        <Gauge ring={model.ring} size={72} idPrefix={`${gid}fab`} />
        {model.badge > 0 && <span className="sd-badge" data-testid="student-dial-fab-badge-text">{model.badge}</span>}
      </button>

      <div
        className="sd-overlay"
        data-open={open ? 'true' : 'false'}
        onClick={e => { if (e.target === e.currentTarget) close() }}
        data-testid="student-dial-overlay-container"
      >
        <div
          ref={panelRef}
          className="sd-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Today"
          aria-hidden={!open}
          onKeyDown={trapTab}
          data-testid="student-dial-panel-container"
        >
          <button type="button" className="sd-close" onClick={close} aria-label="Close" tabIndex={open ? 0 : -1} data-testid="student-dial-close-btn"><X size={18} aria-hidden="true" /></button>

          <header className="sd-head">
            <Gauge ring={model.ring} size={64} idPrefix={`${gid}hd`} />
            <div className="sd-head-text">
              <p className="sd-eyebrow">{date}</p>
              <h2 data-testid="student-dial-headline-text">{loaded ? model.headline : 'Checking your day…'}</h2>
            </div>
          </header>

          {model.tasks.length > 0 && (
            <ul className="sd-tasks" aria-label="Today">
              {model.tasks.map((task, i) => {
                const Icon = TASK_ICON[task.key]
                return (
                  <li key={task.key}>
                    <button type="button" className="sd-task" data-urgent={task.urgent ? 'true' : 'false'} data-sd-first={i === 0 ? '' : undefined} tabIndex={open ? 0 : -1} onClick={() => go(task.navKey)} data-testid={`student-dial-task-${task.key}-btn`}>
                      <span className="sd-task-icon" aria-hidden="true">{task.urgent ? <Icon size={20} /> : <Check size={20} />}</span>
                      <span className="sd-task-text"><strong>{task.title}</strong><span>{task.detail}</span></span>
                      <ChevronRight size={18} className="sd-chev" aria-hidden="true" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {model.stats.length > 0 && (
            <button type="button" className="sd-stats" tabIndex={open ? 0 : -1} data-sd-first={model.tasks.length === 0 ? '' : undefined} onClick={() => go('daily-quiz')} aria-label="See your points and progress" data-testid="student-dial-stats-btn">
              {model.stats.map((s: DialStat) => (
                <span key={s.key} className="sd-stat" data-testid={`student-dial-stat-${s.key}-text`}>
                  <span className="sd-stat-label">{s.label}</span>
                  <span className="sd-stat-value sd-num">{s.value}</span>
                  <span className="sd-stat-sub">{s.sub}</span>
                </span>
              ))}
            </button>
          )}

          <nav className="sd-links" aria-label="Quick links">
            {model.links.map((l, i) => {
              const Icon = LINK_ICON[l.key]
              return (
                <button key={l.key} type="button" className="sd-link" tabIndex={open ? 0 : -1} data-sd-first={model.tasks.length === 0 && model.stats.length === 0 && i === 0 ? '' : undefined} onClick={() => go(l.navKey)} data-testid={`student-dial-link-${l.key}-btn`}>
                  <Icon size={18} aria-hidden="true" />
                  <span><strong>{l.label}</strong><span>{l.detail}</span></span>
                </button>
              )
            })}
          </nav>
        </div>
      </div>
    </div>
  )
}
