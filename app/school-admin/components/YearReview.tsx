'use client'

import { useState, useRef } from 'react'

type ReviewData = {
  academic_year: string
  school: { name: string; type: string; city: string; country: string }
  counts: { teachers: number; students: number; classes: number }
  attendance: { present: number; total: number; school_days: number; pct: number | null }
  exams: { count: number; types: number }
  tasks: { total: number; published: number }
  doubts: { total: number; resolved: number }
  fees: { collected: number; payments: number }
  top_students: Array<{ name: string; grade: string; section: string; total_points: number }>
  monthly_attendance: Array<{ month: string; pct: number; present: number; total: number }>
}

const ACADEMIC_YEARS = ['2025-26', '2024-25', '2023-24']

function fmt(n: number) { return `₹${n.toLocaleString('en-IN')}` }
function pct(v: number, t: number) { return t > 0 ? Math.round((v / t) * 100) : 0 }

function StatBox({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className={`rounded-xl p-4 ${color}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-black">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function YearReview({ schoolId }: { schoolId: number }) {
  const [year, setYear]       = useState(ACADEMIC_YEARS[0])
  const [data, setData]       = useState<ReviewData | null>(null)
  const [loading, setLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [error, setError]     = useState('')
  const reportRef             = useRef<HTMLDivElement>(null)

  async function generate() {
    setLoading(true); setError('')
    try {
      const r = await fetch(`/api/year-review?school_id=${schoolId}&academic_year=${year}`)
      if (!r.ok) throw new Error()
      setData(await r.json())
    } catch { setError('Failed to generate report') }
    setLoading(false)
  }

  async function downloadPDF() {
    if (!data || !reportRef.current) return
    setPdfLoading(true)
    try {
      const { default: jsPDF } = await import('jspdf')
      const { default: html2canvas } = await import('html2canvas')

      const canvas = await html2canvas(reportRef.current, {
        scale: 2, useCORS: true, backgroundColor: '#ffffff',
        windowWidth: reportRef.current.scrollWidth,
        windowHeight: reportRef.current.scrollHeight,
      })

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const imgW  = pageW
      const imgH  = (canvas.height * imgW) / canvas.width

      let y = 0
      while (y < imgH) {
        if (y > 0) pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, -y, imgW, imgH)
        y += pageH
      }

      pdf.save(`${data.school.name.replace(/\s+/g, '_')}_Year_Review_${data.academic_year}.pdf`)
    } catch (e) { console.error(e) }
    setPdfLoading(false)
  }

  const maxAttPct = data ? Math.max(...data.monthly_attendance.map(m => m.pct), 1) : 100

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">School Year-in-Review</h1>
          <p className="text-sm text-gray-500 mt-0.5">Auto-generated annual summary report for {year}</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={year} onChange={e => { setYear(e.target.value); setData(null) }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
            {ACADEMIC_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={generate} disabled={loading}
            className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
            {loading ? 'Generating…' : data ? 'Regenerate' : 'Generate Report'}
          </button>
          {data && (
            <button onClick={downloadPDF} disabled={pdfLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {pdfLoading ? 'Exporting…' : 'Download PDF'}
            </button>
          )}
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {!data && !loading && (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-16 text-center">
          <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-gray-600 font-medium">Click &quot;Generate Report&quot; to create your {year} Year-in-Review</p>
          <p className="text-gray-400 text-sm mt-1">Aggregates attendance, exams, tasks, doubts, fees, and top performers</p>
        </div>
      )}

      {loading && (
        <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
          <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Gathering all your school data…</p>
        </div>
      )}

      {/* ── Printable Report ── */}
      {data && (
        <div ref={reportRef} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">

          {/* Page 1 — School Overview */}
          <div className="bg-gradient-to-br from-purple-600 to-blue-700 px-8 py-10 text-white">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-purple-200 text-sm font-semibold uppercase tracking-widest mb-2">Annual Report</p>
                <h2 className="text-4xl font-black mb-1">{data.school.name}</h2>
                <p className="text-purple-200">{[data.school.city, data.school.country].filter(Boolean).join(', ')} · {data.school.type}</p>
              </div>
              <div className="text-right">
                <div className="text-purple-200 text-sm uppercase tracking-wide">Academic Year</div>
                <div className="text-3xl font-black mt-1">{data.academic_year}</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-5 mt-10">
              {[
                { label: 'Students', value: data.counts.students },
                { label: 'Teachers', value: data.counts.teachers },
                { label: 'Classes',  value: data.counts.classes },
              ].map(s => (
                <div key={s.label} className="bg-white/10 rounded-xl p-5 text-center backdrop-blur-sm">
                  <div className="text-4xl font-black">{s.value}</div>
                  <div className="text-purple-200 text-sm uppercase tracking-wide mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Page 2 — Academic Highlights */}
          <div className="px-8 py-8 border-b border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-5 flex items-center gap-2">
              <span className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center text-sm">📚</span>
              Academic Highlights
            </h3>
            <div className="grid grid-cols-4 gap-4 mb-6">
              <StatBox label="Exams Conducted" value={data.exams.count} color="bg-blue-50 text-blue-800" />
              <StatBox label="Tasks Published"  value={data.tasks.published} color="bg-green-50 text-green-800" />
              <StatBox label="Doubts Resolved"  value={`${data.doubts.resolved}/${data.doubts.total}`} sub={`${pct(data.doubts.resolved, data.doubts.total)}% resolution rate`} color="bg-purple-50 text-purple-800" />
              <StatBox label="Fee Collected"    value={fmt(data.fees.collected)} sub={`${data.fees.payments} payments`} color="bg-amber-50 text-amber-800" />
            </div>

            {data.top_students.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-600 mb-3">Top Performers</p>
                <div className="grid grid-cols-5 gap-3">
                  {data.top_students.map((s, i) => (
                    <div key={i} className="text-center bg-gray-50 rounded-xl p-3">
                      <div className="text-2xl mb-1">{['🥇','🥈','🥉','⭐','⭐'][i]}</div>
                      <div className="text-sm font-bold text-gray-800 truncate">{s.name.split(' ')[0]}</div>
                      <div className="text-xs text-gray-400">Gr.{s.grade}-{s.section}</div>
                      <div className="text-sm font-black text-purple-600 mt-1">{s.total_points} pts</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Page 3 — Attendance Story */}
          <div className="px-8 py-8 border-b border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-5 flex items-center gap-2">
              <span className="w-7 h-7 bg-green-100 rounded-lg flex items-center justify-center text-sm">📅</span>
              Attendance Story
            </h3>
            <div className="grid grid-cols-4 gap-4 mb-6">
              <StatBox label="School Days"     value={data.attendance.school_days}  color="bg-gray-50 text-gray-800" />
              <StatBox label="Present (sessions)" value={data.attendance.present}   color="bg-green-50 text-green-800" />
              <StatBox label="Overall Rate"    value={data.attendance.pct !== null ? `${data.attendance.pct}%` : '—'} color={`${(data.attendance.pct ?? 0) >= 85 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`} />
              <StatBox label="Total Sessions"  value={data.attendance.total} color="bg-blue-50 text-blue-800" />
            </div>

            {/* Monthly bar chart */}
            {data.monthly_attendance.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-600 mb-3">Monthly Attendance Trend</p>
                <div className="flex items-end gap-2 h-32">
                  {data.monthly_attendance.map(m => (
                    <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                      <div className="text-[10px] font-bold text-gray-600">{m.pct}%</div>
                      <div className="w-full rounded-t-md transition-all"
                        style={{
                          height: `${(m.pct / maxAttPct) * 88}px`,
                          backgroundColor: m.pct >= 85 ? '#22c55e' : m.pct >= 75 ? '#f59e0b' : '#ef4444',
                        }}
                      />
                      <div className="text-[9px] text-gray-400 text-center leading-tight">{m.month.replace(' ', '\n')}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Page 4 — Activity Highlights */}
          <div className="px-8 py-8">
            <h3 className="text-lg font-bold text-gray-800 mb-5 flex items-center gap-2">
              <span className="w-7 h-7 bg-purple-100 rounded-lg flex items-center justify-center text-sm">⚡</span>
              Activity Highlights
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                {
                  title: 'Task Engagement',
                  items: [
                    { label: 'Tasks Created',   value: data.tasks.total },
                    { label: 'Tasks Published',  value: data.tasks.published },
                    { label: 'Publish Rate',     value: `${pct(data.tasks.published, data.tasks.total)}%` },
                  ],
                  color: 'border-blue-200 bg-blue-50',
                },
                {
                  title: 'Doubt Resolution',
                  items: [
                    { label: 'Total Doubts',     value: data.doubts.total },
                    { label: 'Resolved',         value: data.doubts.resolved },
                    { label: 'Resolution Rate',  value: `${pct(data.doubts.resolved, data.doubts.total)}%` },
                  ],
                  color: 'border-purple-200 bg-purple-50',
                },
                {
                  title: 'Examinations',
                  items: [
                    { label: 'Exams Conducted',  value: data.exams.count },
                    { label: 'Exam Types',        value: data.exams.types },
                  ],
                  color: 'border-green-200 bg-green-50',
                },
                {
                  title: 'Fee Collection',
                  items: [
                    { label: 'Total Collected',  value: fmt(data.fees.collected) },
                    { label: 'Payment Records',  value: data.fees.payments },
                  ],
                  color: 'border-amber-200 bg-amber-50',
                },
              ].map(card => (
                <div key={card.title} className={`border rounded-xl p-5 ${card.color}`}>
                  <p className="text-sm font-bold text-gray-700 mb-3">{card.title}</p>
                  <div className="space-y-2">
                    {card.items.map(item => (
                      <div key={item.label} className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">{item.label}</span>
                        <span className="text-sm font-bold text-gray-800">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="mt-8 pt-5 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
              <span>{data.school.name} · Academic Year {data.academic_year}</span>
              <span>Generated by WLYL Platform · {new Date().toLocaleDateString('en-IN')}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
