'use client'

import { useEffect, useState, type ReactNode } from 'react'
import AttendanceCalendar from '@/app/components/AttendanceCalendar'
import {
  BAND_TEXT, BandPill, Card, DashSkeleton, ErrorBox, Kpi, PctBar, TrendChart, monthName, pctText, shortDate, useApi,
  type Summary,
} from '@/app/components/attendance-dashboard/parts'
import type { AttendanceBand } from '@/lib/attendanceRules'

// Student 360 — everything the school admin needs when a parent walks in, on one page:
// who the student is, what to raise with the parent, attendance, marks, fees and engagement,
// for any academic year the student was enrolled in.

type Flag = { level: 'red' | 'amber' | 'green'; text: string }
type SubjectRow = { subject: string; obtained: number | null; max: number; absent: boolean; pct: number | null; classAvgPct: number | null }
type Exam = {
  id: number; name: string; type: string; date: string | null; status: string; passingPct: number
  subjects: SubjectRow[]; remark: { teacher: string | null; conduct: string | null; advice: string | null } | null
  obtained: number; max: number; pct: number | null; passed: boolean | null
}
type Profile = {
  student: {
    id: number; name: string; status: string; email: string | null; phone: string | null; dateOfBirth: string | null
    grade: string | null; section: string | null; rollNumber: number | null; admitted: string; classTeacher: string | null
  }
  parents: { name: string | null; phone: string | null; email: string | null }[]
  years: { id: number | null; label: string; isCurrent: boolean; grade: string | null; section: string | null }[]
  year: { id: number | null; label: string; from: string; to: string; isCurrent: boolean; upcoming: boolean }
  flags: Flag[]
  attendance: null | {
    summary: Summary
    months: { month: string; summary: Summary }[]
    absentDayCount: number
    recentAbsences: { date: string; sessions: string[] }[]
    currentAbsentStreak: number
  }
  marks: {
    exams: Exam[]
    subjects: { subject: string; avgPct: number | null; classAvgPct: number | null; exams: number }[]
    averagePct: number | null
    weakest: { subject: string; avgPct: number | null } | null
    strongest: { subject: string; avgPct: number | null } | null
    lastChange: number | null
  }
  fees: {
    items: { id: number; category: string; period: string | null; due: number; waived: number; paid: number; balance: number; dueDate: string | null; status: string; overdue: boolean }[]
    totals: { due: number; waived: number; paid: number; balance: number; overdue: number }
    payments: { id: number; receipt: string | null; amount: number; mode: string; status: string; date: string; category: string }[]
  }
  engagement: {
    points: number; badges: { type: string; earnedAt: string }[]
    streak: { current: number; longest: number; lastDay: string | null }
    lastSeen: string | null; actions30d: number
  }
}

const rupee = (n: number) => `₹${n.toLocaleString('en-IN')}`
const longDate = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const label = (s: string) => s.replace(/[_-]/g, ' ').replace(/^\w/, c => c.toUpperCase())
const pctBand = (p: number | null): AttendanceBand => (p === null ? 'none' : p >= 75 ? 'good' : p >= 40 ? 'watch' : 'low')

const FLAG_STYLE: Record<Flag['level'], string> = {
  red: 'bg-red-50 border-red-200 text-red-800', amber: 'bg-amber-50 border-amber-200 text-amber-900', green: 'bg-green-50 border-green-200 text-green-800',
}
const FLAG_DOT: Record<Flag['level'], string> = { red: 'bg-red-500', amber: 'bg-amber-400', green: 'bg-green-500' }

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section data-testid={`profile-section-${id}`} className="space-y-3">
      <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide">{title}</h3>
      {children}
    </section>
  )
}

export default function StudentProfile({ studentId, onClose }: { studentId: number; onClose: () => void }) {
  const [yearId, setYearId] = useState<string>('')
  const [showCalendar, setShowCalendar] = useState(false)
  const { data, error, loading, retry } = useApi<Profile>(`/api/students/${studentId}/profile${yearId ? `?year=${yearId}` : ''}`)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])

  const s = data?.student
  const att = data?.attendance

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose} data-testid="student-profile-overlay">
      <aside role="dialog" aria-modal="true" aria-label={s ? `${s.name} — student profile` : 'Student profile'} data-testid="student-profile"
        onClick={e => e.stopPropagation()} className="bg-gray-50 w-full max-w-5xl h-full overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-violet-100 text-violet-700 font-black text-lg flex items-center justify-center flex-shrink-0" aria-hidden>
              {(s?.name ?? '?').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 truncate" data-testid="profile-name">{s?.name ?? 'Loading…'}</h2>
              {s && (
                <p className="text-xs text-gray-500 flex flex-wrap gap-x-2">
                  <span>Class {s.grade}-{s.section}</span>
                  {s.rollNumber !== null && <span>· Roll {s.rollNumber}</span>}
                  {s.classTeacher && <span>· Class teacher: {s.classTeacher}</span>}
                  <span>· Admitted {longDate(s.admitted)}</span>
                  {s.dateOfBirth && <span>· Born {longDate(s.dateOfBirth)}</span>}
                  {s.status !== 'active' && <span className="text-red-600 font-semibold">· {label(s.status)}</span>}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {data && data.years.length > 1 && (
              <select value={yearId || String(data.year.id ?? '')} onChange={e => { setYearId(e.target.value); setShowCalendar(false) }}
                aria-label="Academic year" data-testid="profile-year" className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
                {data.years.map(y => <option key={String(y.id)} value={String(y.id ?? '')}>{y.label}{y.isCurrent ? ' (current)' : ''}{y.grade ? ` · Class ${y.grade}-${y.section}` : ''}</option>)}
              </select>
            )}
            {data && data.years.length === 1 && <span className="text-xs font-semibold bg-gray-100 text-gray-600 rounded-lg px-2.5 py-1.5">{data.year.label}</span>}
            <button type="button" onClick={onClose} aria-label="Close" data-testid="student-profile-close"
              className="w-9 h-9 rounded-xl text-gray-500 hover:bg-gray-100 text-lg">✕</button>
          </div>
        </div>

        <div className="p-4 sm:p-6 space-y-6">
          {error && <ErrorBox message={error} onRetry={retry} />}
          {loading && !data && <DashSkeleton />}

          {data && s && (
            <div className={loading ? 'opacity-60 space-y-6' : 'space-y-6'}>
              {/* At a glance */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="profile-glance">
                <Kpi testid="profile-kpi-attendance" label="Attendance" band={att?.summary.band ?? 'none'} value={pctText(att?.summary.pct ?? null)}
                  sub={att?.summary.marked ? `${att.absentDayCount} day${att.absentDayCount === 1 ? '' : 's'} absent` : 'Nothing marked yet'} />
                <Kpi testid="profile-kpi-marks" label="Average marks" band={pctBand(data.marks.averagePct)} value={pctText(data.marks.averagePct)}
                  sub={data.marks.exams.length ? `${data.marks.exams.length} exam${data.marks.exams.length === 1 ? '' : 's'}` : 'No exams yet'} />
                <Kpi testid="profile-kpi-fees" label="Fees to pay" band={data.fees.totals.overdue > 0 ? 'low' : data.fees.totals.balance > 0 ? 'watch' : 'good'}
                  value={data.fees.items.length ? rupee(data.fees.totals.balance) : '—'}
                  sub={data.fees.items.length ? (data.fees.totals.overdue > 0 ? `${rupee(data.fees.totals.overdue)} overdue` : data.fees.totals.balance > 0 ? 'nothing overdue' : 'all paid') : 'No fees for this year'} />
                <Kpi testid="profile-kpi-engagement" label="Learning points" value={data.engagement.points}
                  sub={data.engagement.lastSeen ? `last active ${longDate(data.engagement.lastSeen)}` : 'Has not used the app'} />
              </div>

              {/* Talking points */}
              <Card title="Talking points for the parent" hint="Picked automatically from this year's attendance, marks and fees." testid="profile-flags">
                {data.flags.length === 0
                  ? <p className="text-sm text-gray-500">Not enough data yet for this year.</p>
                  : (
                    <ul className="space-y-2">
                      {data.flags.map((f, i) => (
                        <li key={i} className={`flex items-start gap-2.5 border rounded-xl px-3 py-2 text-sm ${FLAG_STYLE[f.level]}`}>
                          <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${FLAG_DOT[f.level]}`} />{f.text}
                        </li>
                      ))}
                    </ul>
                  )}
              </Card>

              {/* Parents */}
              <Section id="parents" title="Parents & contact">
                {data.parents.length === 0 ? <p className="text-sm text-gray-400">No parent contact saved.</p> : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {data.parents.map((p, i) => (
                      <div key={i} className="bg-white border border-gray-200 rounded-2xl p-4" data-testid={`profile-parent-${i}`}>
                        <p className="text-sm font-semibold text-gray-900">{p.name || 'Parent'}</p>
                        {p.phone && <p className="text-sm mt-1"><a href={`tel:${p.phone}`} className="text-blue-600 font-medium">📞 {p.phone}</a></p>}
                        {p.email && <p className="text-sm mt-0.5"><a href={`mailto:${p.email}`} className="text-blue-600 break-all">✉ {p.email}</a></p>}
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Attendance */}
              <Section id="attendance" title="Attendance">
                {!att ? <p className="text-sm text-gray-400">This academic year has not started yet.</p> : (
                  <>
                    <div className="grid lg:grid-cols-3 gap-4">
                      <div className="lg:col-span-2">
                        <Card title={`Attendance by month — ${data.year.label}`} hint={`${att.summary.attended} of ${att.summary.marked} sessions attended (${pctText(att.summary.pct)})`}>
                          <TrendChart bucket="month" points={att.months.map(m => ({ key: m.month, ...m.summary }))} />
                        </Card>
                      </div>
                      <Card title="Recent absences" hint={att.currentAbsentStreak >= 2 ? `${att.currentAbsentStreak} school days in a row right now` : undefined}>
                        {att.recentAbsences.length === 0 ? <p className="text-sm text-green-700">No absences this year.</p> : (
                          <ul className="space-y-1.5" data-testid="profile-absences">
                            {att.recentAbsences.map(a => (
                              <li key={a.date} className="flex items-center justify-between text-sm">
                                <span className="text-gray-700">{longDate(a.date)}</span>
                                <span className="text-xs text-red-600 font-medium">{a.sessions.length === 2 ? 'Full day' : label(a.sessions[0] ?? 'absent')}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </Card>
                    </div>
                    {data.year.isCurrent && (
                      <>
                        <button type="button" onClick={() => setShowCalendar(v => !v)} data-testid="profile-toggle-calendar"
                          className="text-sm font-semibold text-blue-600 hover:underline">{showCalendar ? 'Hide day-by-day calendar' : 'Show day-by-day calendar'}</button>
                        {showCalendar && <AttendanceCalendar endpoint={`/api/attendance?view=student&student_id=${studentId}`} who="staff" />}
                      </>
                    )}
                  </>
                )}
              </Section>

              {/* Marks */}
              <Section id="marks" title="Marks & exams">
                {data.marks.exams.length === 0 ? <p className="text-sm text-gray-400">No exam marks recorded for {data.year.label}.</p> : (
                  <>
                    <div className="grid lg:grid-cols-2 gap-4">
                      <Card title="Subject-wise" hint="This student's average vs the class average" testid="profile-subjects">
                        <ul className="space-y-3">
                          {[...data.marks.subjects].reverse().map(sub => (
                            <li key={sub.subject}>
                              <div className="flex items-center justify-between text-sm">
                                <span className="font-medium text-gray-800">{sub.subject}</span>
                                <span className={`font-bold ${BAND_TEXT[pctBand(sub.avgPct)]}`}>{pctText(sub.avgPct)}
                                  {sub.classAvgPct !== null && <span className="text-xs font-normal text-gray-400"> · class {sub.classAvgPct}%</span>}</span>
                              </div>
                              <PctBar pct={sub.avgPct} band={pctBand(sub.avgPct)} />
                            </li>
                          ))}
                        </ul>
                        {data.marks.strongest && data.marks.weakest && data.marks.subjects.length > 1 && (
                          <p className="text-xs text-gray-500 mt-3">Strongest: <b className="text-gray-800">{data.marks.strongest.subject}</b> · Needs help: <b className="text-gray-800">{data.marks.weakest.subject}</b></p>
                        )}
                      </Card>
                      <Card title="Exam by exam" hint="Total marks in each exam" testid="profile-exam-trend">
                        <ul className="space-y-3">
                          {data.marks.exams.map(e => (
                            <li key={e.id}>
                              <div className="flex items-center justify-between text-sm">
                                <span className="font-medium text-gray-800 truncate pr-2">{e.name}</span>
                                <span className={`font-bold ${BAND_TEXT[pctBand(e.pct)]}`}>{pctText(e.pct)}</span>
                              </div>
                              <PctBar pct={e.pct} band={pctBand(e.pct)} />
                            </li>
                          ))}
                        </ul>
                        {data.marks.lastChange !== null && (
                          <p className={`text-xs mt-3 ${data.marks.lastChange < 0 ? 'text-red-600' : 'text-green-700'}`}>
                            {data.marks.lastChange === 0 ? 'Same as the previous exam.' : `${data.marks.lastChange > 0 ? '▲ Up' : '▼ Down'} ${Math.abs(data.marks.lastChange)} points from the previous exam.`}
                          </p>
                        )}
                      </Card>
                    </div>

                    <div className="space-y-2">
                      {[...data.marks.exams].reverse().map(e => (
                        <details key={e.id} className="bg-white border border-gray-200 rounded-2xl group" data-testid={`profile-exam-${e.id}`}>
                          <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">{e.name}</p>
                              <p className="text-xs text-gray-500">{label(e.type)}{e.date ? ` · ${longDate(e.date)}` : ''} · {label(e.status)}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-bold text-gray-900">{e.max ? `${e.obtained} / ${e.max}` : '—'}</p>
                              {e.passed !== null && <BandPill band={e.passed ? 'good' : 'low'} pct={e.pct} />}
                            </div>
                          </summary>
                          <div className="px-4 pb-4 overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead><tr className="text-xs text-gray-500 text-left"><th className="py-1.5 font-medium">Subject</th><th className="py-1.5 font-medium text-right">Marks</th><th className="py-1.5 font-medium text-right">%</th><th className="py-1.5 font-medium text-right">Class avg</th></tr></thead>
                              <tbody className="divide-y divide-gray-100">
                                {e.subjects.map(x => (
                                  <tr key={x.subject}>
                                    <td className="py-1.5 text-gray-800">{x.subject}</td>
                                    <td className="py-1.5 text-right">{x.absent ? <span className="text-amber-600 font-medium">Absent</span> : x.obtained === null ? '—' : `${x.obtained} / ${x.max}`}</td>
                                    <td className={`py-1.5 text-right font-semibold ${BAND_TEXT[pctBand(x.pct)]}`}>{pctText(x.pct)}</td>
                                    <td className="py-1.5 text-right text-gray-500">{x.classAvgPct === null ? '—' : `${x.classAvgPct}%`}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {e.remark && (e.remark.teacher || e.remark.advice) && (
                              <div className="mt-3 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-sm text-gray-700 space-y-1">
                                {e.remark.teacher && <p><b>Teacher:</b> {e.remark.teacher}</p>}
                                {e.remark.advice && <p><b>Advice:</b> {e.remark.advice}</p>}
                                {e.remark.conduct && <p className="text-xs text-gray-500">Conduct: {e.remark.conduct}</p>}
                              </div>
                            )}
                          </div>
                        </details>
                      ))}
                    </div>
                  </>
                )}
              </Section>

              {/* Fees */}
              <Section id="fees" title="Fees">
                {data.fees.items.length === 0 ? <p className="text-sm text-gray-400">No fees assigned for {data.year.label}.</p> : (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      {([['Total fees', data.fees.totals.due, ''], ['Waived', data.fees.totals.waived, ''], ['Paid', data.fees.totals.paid, 'text-green-600'], ['Balance', data.fees.totals.balance, data.fees.totals.balance > 0 ? 'text-red-600' : 'text-green-600']] as const).map(([l, v, c]) => (
                        <div key={l} className="bg-white border border-gray-200 rounded-2xl p-4">
                          <p className="text-xs text-gray-500">{l}</p>
                          <p className={`text-xl font-black mt-1 ${c || 'text-gray-900'}`} data-testid={`profile-fees-${l.toLowerCase().replace(' ', '-')}`}>{rupee(v)}</p>
                        </div>
                      ))}
                    </div>
                    <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
                      <table className="w-full text-sm" data-testid="profile-fee-table">
                        <thead><tr className="text-xs text-gray-500 text-left border-b border-gray-100">
                          <th className="px-4 py-2 font-medium">Fee</th><th className="px-2 py-2 font-medium">Due date</th>
                          <th className="px-2 py-2 font-medium text-right">Amount</th><th className="px-2 py-2 font-medium text-right">Paid</th>
                          <th className="px-2 py-2 font-medium text-right">Balance</th><th className="px-4 py-2 font-medium text-right">Status</th>
                        </tr></thead>
                        <tbody className="divide-y divide-gray-50">
                          {data.fees.items.map(i => (
                            <tr key={i.id}>
                              <td className="px-4 py-2 text-gray-800">{i.category}{i.period && <span className="text-xs text-gray-400"> · {i.period}</span>}</td>
                              <td className="px-2 py-2 text-gray-500">{i.dueDate ? shortDate(i.dueDate) : '—'}</td>
                              <td className="px-2 py-2 text-right">{rupee(i.due - i.waived)}</td>
                              <td className="px-2 py-2 text-right text-green-700">{rupee(i.paid)}</td>
                              <td className={`px-2 py-2 text-right font-semibold ${i.balance > 0 ? 'text-red-600' : 'text-gray-400'}`}>{rupee(i.balance)}</td>
                              <td className="px-4 py-2 text-right">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${i.overdue ? 'bg-red-100 text-red-700' : i.balance === 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'}`}>
                                  {i.overdue ? 'Overdue' : i.balance === 0 ? (i.status === 'waived' ? 'Waived' : 'Paid') : label(i.status)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {data.fees.payments.length > 0 && (
                      <Card title="Recent payments" testid="profile-payments">
                        <ul className="divide-y divide-gray-100">
                          {data.fees.payments.map(p => (
                            <li key={p.id} className="py-2 flex items-center justify-between text-sm">
                              <span className="text-gray-700">{longDate(p.date)} · {p.category}<span className="text-xs text-gray-400"> · {label(p.mode)}{p.receipt ? ` · ${p.receipt}` : ''}</span>
                                {p.status !== 'completed' && <span className="text-xs text-amber-600"> · awaiting verification</span>}</span>
                              <span className="font-semibold text-green-700">{rupee(p.amount)}</span>
                            </li>
                          ))}
                        </ul>
                      </Card>
                    )}
                  </>
                )}
              </Section>

              {/* Engagement */}
              <Section id="engagement" title="Learning activity">
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="bg-white border border-gray-200 rounded-2xl p-4"><p className="text-xs text-gray-500">Points earned</p><p className="text-2xl font-black text-gray-900 mt-1">{data.engagement.points}</p></div>
                  <div className="bg-white border border-gray-200 rounded-2xl p-4"><p className="text-xs text-gray-500">Daily streak</p><p className="text-2xl font-black text-gray-900 mt-1">{data.engagement.streak.current}<span className="text-xs font-normal text-gray-400"> best {data.engagement.streak.longest}</span></p></div>
                  <div className="bg-white border border-gray-200 rounded-2xl p-4"><p className="text-xs text-gray-500">App actions (30 days)</p><p className="text-2xl font-black text-gray-900 mt-1">{data.engagement.actions30d}</p></div>
                </div>
                {data.engagement.badges.length > 0 && (
                  <div className="flex flex-wrap gap-2" data-testid="profile-badges">
                    {data.engagement.badges.map(b => <span key={b.type} className="text-xs font-semibold bg-violet-100 text-violet-700 rounded-full px-3 py-1">🏅 {label(b.type)}</span>)}
                  </div>
                )}
              </Section>

              <p className="text-[11px] text-gray-400 text-center pb-2">Shown for {data.year.label} ({monthName(data.year.from.slice(0, 7))} {data.year.from.slice(0, 4)} – {monthName(data.year.to.slice(0, 7))} {data.year.to.slice(0, 4)}). Private to the school office.</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
