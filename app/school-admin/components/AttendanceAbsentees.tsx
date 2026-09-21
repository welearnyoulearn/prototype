'use client'

import { useEffect, useState } from 'react'

// The Day register's "Absentees" view: everyone absent in one session, class by class, on one page —
// so the admin can phone home without opening each class.

type Absent = { student_id: number; name: string; roll: number | null; parent_name: string | null; parent_phone: string | null; whole_day: boolean }
type ClassAbsentees = { id: number; grade: string; section: string; class_teacher: string | null; student_count: number; marked: boolean; marked_by: string | null; absent: Absent[] }
type Data = {
  date: string; session: 'morning' | 'afternoon'
  non_working: { kind: 'holiday' | 'weekly_off'; title: string } | null
  totals: { absent: number; classes: number; classes_marked: number; classes_with_absentees: number }
  classes: ClassAbsentees[]
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

export default function AttendanceAbsentees({ date, onOpenClass }: { date: string; onOpenClass?: (classId: number) => void }) {
  const [session, setSession] = useState<'morning' | 'afternoon'>('morning')
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [loadedKey, setLoadedKey] = useState('')
  const key = `${date}|${session}`
  const loading = loadedKey !== key && !error

  useEffect(() => {
    let cancelled = false
    fetch(`/api/attendance/absentees?date=${date}&session=${session}`, { cache: 'no-store' })
      .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not load absentees'); return r.json() as Promise<Data> })
      .then(d => { if (!cancelled) { setData(d); setError(''); setLoadedKey(key) } })
      .catch((e: unknown) => { if (!cancelled) { setError(e instanceof Error ? e.message : 'Could not load absentees'); setLoadedKey(key) } })
    return () => { cancelled = true }
  }, [date, session, key])

  function print() {
    if (!data) return
    const rows = data.classes.filter(c => c.absent.length > 0).map(c =>
      `<h3>Class ${esc(c.grade)}-${esc(c.section)}${c.class_teacher ? ` <small>· ${esc(c.class_teacher)}</small>` : ''} — ${c.absent.length} absent</h3>
       <table><tr><th>Roll</th><th>Student</th><th>Absent</th><th>Parent</th><th>Phone</th></tr>${c.absent.map(a =>
        `<tr><td>${a.roll ?? ''}</td><td>${esc(a.name)}</td><td>${a.whole_day ? 'Whole day' : data.session === 'morning' ? 'Morning only' : 'Afternoon only'}</td><td>${esc(a.parent_name ?? '')}</td><td>${esc(a.parent_phone ?? '')}</td></tr>`).join('')}</table>`).join('')
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) return
    w.document.write(`<html><head><title>Absentees ${data.date}</title><style>body{font-family:sans-serif;padding:24px}h2{margin:0 0 4px}h3{margin:18px 0 6px}small{color:#666;font-weight:normal}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:5px 8px;text-align:left;font-size:13px}</style></head><body>
      <h2>Absentees — ${data.session === 'morning' ? 'Morning' : 'Afternoon'} — ${data.date}</h2><p>${data.totals.absent} absent · ${data.totals.classes_marked} of ${data.totals.classes} classes marked</p>${rows || '<p>No absentees.</p>'}</body></html>`)
    w.document.close()
    w.focus()
    w.print()
  }

  const label = session === 'morning' ? 'Morning' : 'Afternoon'
  const withAbsent = data?.classes.filter(c => c.absent.length > 0) ?? []
  const clean = data?.classes.filter(c => c.marked && c.absent.length === 0) ?? []
  const notMarked = data?.classes.filter(c => !c.marked) ?? []

  return (
    <div data-testid="attendance-absentees" className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg" role="tablist" aria-label="Session">
          {(['morning', 'afternoon'] as const).map(s => (
            <button key={s} role="tab" aria-selected={session === s} data-testid={`absentees-session-${s}`} onClick={() => setSession(s)}
              className={`px-4 py-1.5 rounded-md text-sm font-semibold ${session === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
              {s === 'morning' ? '🌅 Morning' : '🌆 Afternoon'}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <a href={`/api/export/attendance?mode=absentees&date=${date}`} data-testid="absentees-download"
            className="text-xs font-semibold text-gray-700 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50">⬇ Download (both sessions, CSV)</a>
          <button onClick={print} disabled={!data || withAbsent.length === 0} data-testid="absentees-print"
            className="text-xs font-semibold text-gray-700 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 disabled:opacity-40">🖨 Print</button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}
      {loading && <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>}

      {data && !loading && (
        data.non_working ? (
          <div data-testid="absentees-non-working" className="bg-red-50 border border-red-200 rounded-2xl px-4 py-4 text-sm text-red-800">
            {data.non_working.kind === 'holiday' ? `Holiday — ${data.non_working.title}` : 'Weekly off'}: no attendance is taken on this day.
          </div>
        ) : (
          <>
            <div className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center gap-5 flex-wrap" data-testid="absentees-summary">
              <div>
                <p data-testid="absentees-total" className="text-3xl font-black text-red-600">{data.totals.absent}</p>
                <p className="text-xs text-gray-500">absent in {label}</p>
              </div>
              <div className="text-sm text-gray-600 space-y-0.5">
                <p>{data.totals.classes_with_absentees} of {data.totals.classes} classes have absentees</p>
                <p className={data.totals.classes_marked === data.totals.classes ? 'text-green-700' : 'text-amber-700'}>
                  {data.totals.classes_marked} of {data.totals.classes} classes have marked {label}
                </p>
              </div>
            </div>

            {notMarked.length > 0 && (
              <div data-testid="absentees-not-marked" className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <p className="text-xs font-semibold text-amber-800 mb-1.5">{label} not marked yet — these classes may still have absentees</p>
                <div className="flex flex-wrap gap-1.5">
                  {notMarked.map(c => (
                    <button key={c.id} onClick={() => onOpenClass?.(c.id)} title={c.class_teacher ? `Class teacher: ${c.class_teacher}` : 'No class teacher assigned'}
                      className="text-xs bg-white border border-amber-200 text-amber-800 rounded-lg px-2.5 py-1 hover:bg-amber-100">
                      {c.grade}-{c.section}{c.class_teacher ? ` · ${c.class_teacher}` : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {withAbsent.length === 0 && notMarked.length < data.totals.classes && (
              <p data-testid="absentees-none" className="text-sm text-green-700 font-medium bg-green-50 border border-green-100 rounded-2xl px-4 py-4">✓ No absentees in {label}{notMarked.length > 0 ? ' among the classes that have marked' : ''}.</p>
            )}

            <div className="grid md:grid-cols-2 gap-3 items-start">
              {withAbsent.map(c => (
                <div key={c.id} data-testid={`absentees-class-${c.id}`} className="bg-white border border-red-100 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-4 py-3 bg-red-50/60 border-b border-red-100 flex items-center justify-between gap-2">
                    <button onClick={() => onOpenClass?.(c.id)} className="text-sm font-bold text-gray-900 hover:underline text-left">
                      Class {c.grade}-{c.section}
                      {c.class_teacher && <span className="ml-2 text-xs font-normal text-gray-500">CT: {c.class_teacher}</span>}
                    </button>
                    <span className="text-xs font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full whitespace-nowrap">{c.absent.length} of {c.student_count}</span>
                  </div>
                  <ul className="divide-y divide-gray-50">
                    {c.absent.map(a => (
                      <li key={a.student_id} data-testid={`absentee-${a.student_id}`} className="px-4 py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{a.roll !== null ? `${a.roll}. ` : ''}{a.name}</p>
                          <p className="text-xs text-gray-400 truncate">{a.parent_name ?? 'Parent'}{a.parent_phone ? '' : ' · no phone'}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${a.whole_day ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                            {a.whole_day ? 'Whole day' : `${label} only`}
                          </span>
                          {a.parent_phone && <a href={`tel:${a.parent_phone}`} className="text-xs font-semibold text-blue-600 border border-blue-200 rounded-lg px-2 py-1 hover:bg-blue-50">📞 {a.parent_phone}</a>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {clean.length > 0 && (
              <p data-testid="absentees-clean" className="text-xs text-gray-500">
                <span className="font-semibold text-green-700">No absentees:</span> {clean.map(c => `${c.grade}-${c.section}`).join(', ')}
              </p>
            )}
          </>
        )
      )}
    </div>
  )
}
