'use client'

import { useEffect, useState } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────

type SubjectCoverage = { subject: string; total: number; covered: number; pct: number }

type ClassCoverage = {
  class_id: number; grade: string; section: string
  total: number; covered: number; pct: number | null
  subjects: SubjectCoverage[]
}

type TeacherCoverage = {
  teacher_id: number; teacher_name: string
  total: number; covered: number; pct: number | null
  subjects: SubjectCoverage[]
}

type SubjectSchool = { subject: string; total: number; covered: number; pct: number | null }

type SyllabusData = {
  by_class:   ClassCoverage[]
  by_teacher: TeacherCoverage[]
  by_subject: SubjectSchool[]
}

type TaskRow = {
  id: number; title: string; subject: string; task_type: string
  status: string; due_date: string | null
  teacher_name: string; class_label: string
  submitted_count: number; reviewed_count: number; pending_count: number
  total_students: number
}

// ── Helpers ────────────────────────────────────────────────────────────────

function PctBar({ pct, color = 'blue' }: { pct: number | null; color?: string }) {
  const val = pct ?? 0
  const bg =
    val >= 75 ? 'bg-green-500' :
    val >= 50 ? 'bg-amber-400' :
                'bg-red-400'
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className={`${bg} h-full rounded-full transition-all`} style={{ width: `${val}%` }} />
      </div>
      <span className={`text-xs font-semibold w-9 text-right ${
        val >= 75 ? 'text-green-600' : val >= 50 ? 'text-amber-500' : 'text-red-500'
      }`}>
        {pct != null ? `${val}%` : '—'}
      </span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    published: 'bg-green-100 text-green-700',
    draft:     'bg-gray-100 text-gray-500',
    closed:    'bg-blue-100 text-blue-600',
  }
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${map[status] ?? 'bg-gray-100 text-gray-400'}`}>
      {status}
    </span>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function AcademicAnalytics({ schoolId }: { schoolId: number }) {
  const [tab, setTab] = useState<'syllabus' | 'tasks'>('syllabus')

  // Syllabus state
  const [syllabusView, setSyllabusView] = useState<'class' | 'teacher' | 'subject'>('class')
  const [syllabusData, setSyllabusData] = useState<SyllabusData | null>(null)
  const [syllabusLoading, setSyllabusLoading] = useState(false)
  const [syllabusError, setSyllabusError] = useState('')

  // Tasks state
  const [tasks, setTasks]             = useState<TaskRow[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [tasksError, setTasksError]   = useState('')
  const [taskFilter, setTaskFilter]   = useState<'all' | 'published' | 'draft'>('all')
  const [taskType, setTaskType]       = useState<'all' | 'homework' | 'practice' | 'test'>('all')

  useEffect(() => { loadSyllabus() }, [schoolId])
  useEffect(() => { loadTasks() },   [schoolId])

  async function loadSyllabus() {
    setSyllabusLoading(true)
    setSyllabusError('')
    try {
      const r = await fetch(`/api/syllabus/analytics?school_id=${schoolId}`)
      if (!r.ok) throw new Error()
      setSyllabusData(await r.json())
    } catch {
      setSyllabusError('Failed to load syllabus data')
    } finally {
      setSyllabusLoading(false)
    }
  }

  async function loadTasks() {
    setTasksLoading(true)
    setTasksError('')
    try {
      const r = await fetch(`/api/tasks?school_id=${schoolId}`)
      if (!r.ok) throw new Error()
      setTasks(await r.json())
    } catch {
      setTasksError('Failed to load tasks')
    } finally {
      setTasksLoading(false)
    }
  }

  // ── Derived: task stats ──
  const publishedTasks = tasks.filter(t => t.status === 'published')
  const draftTasks     = tasks.filter(t => t.status === 'draft')
  const overdueTasks   = publishedTasks.filter(t =>
    t.due_date && new Date(t.due_date) < new Date() && t.submitted_count < t.total_students
  )

  const filteredTasks = tasks.filter(t => {
    if (taskFilter !== 'all' && t.status !== taskFilter) return false
    if (taskType !== 'all' && t.task_type !== taskType) return false
    return true
  })

  // Teacher task summary
  const teacherTaskMap: Record<string, { name: string; total: number; published: number; avg_submission: number; sum: number }> = {}
  for (const t of tasks) {
    const key = t.teacher_name
    if (!teacherTaskMap[key]) teacherTaskMap[key] = { name: key, total: 0, published: 0, avg_submission: 0, sum: 0 }
    teacherTaskMap[key].total++
    if (t.status === 'published') {
      teacherTaskMap[key].published++
      if (t.total_students > 0) teacherTaskMap[key].sum += Math.round((t.submitted_count / t.total_students) * 100)
    }
  }
  const teacherTaskList = Object.values(teacherTaskMap)
    .map(t => ({
      ...t,
      avg_submission: t.published > 0 ? Math.round(t.sum / t.published) : 0,
    }))
    .sort((a, b) => b.total - a.total)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Academic Analytics</h2>
          <p className="text-sm text-gray-400 mt-0.5">Syllabus coverage & task tracking across all classes</p>
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {(['syllabus', 'tasks'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                tab === t ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'syllabus' ? 'Syllabus Coverage' : 'Tasks & Assignments'}
            </button>
          ))}
        </div>
      </div>

      {/* ── SYLLABUS TAB ─────────────────────────────────────────────── */}
      {tab === 'syllabus' && (
        <div className="space-y-4">
          {syllabusLoading && (
            <div className="text-center py-12 text-gray-400 text-sm">Loading syllabus data…</div>
          )}
          {syllabusError && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">{syllabusError}</div>
          )}

          {!syllabusLoading && syllabusData && (
            <>
              {/* School-wide summary KPIs */}
              {(() => {
                const total   = syllabusData.by_subject.reduce((s, r) => s + r.total, 0)
                const covered = syllabusData.by_subject.reduce((s, r) => s + r.covered, 0)
                const pct     = total > 0 ? Math.round((covered / total) * 100) : 0
                const behind  = syllabusData.by_class.filter(c => (c.pct ?? 0) < 50).length
                return (
                  <div className="grid grid-cols-4 gap-4">
                    {[
                      { label: 'Total Topics',    value: total,                      color: 'text-gray-800' },
                      { label: 'Topics Covered',  value: covered,                    color: 'text-green-600' },
                      { label: 'School Coverage', value: `${pct}%`,                 color: pct >= 75 ? 'text-green-600' : pct >= 50 ? 'text-amber-500' : 'text-red-500' },
                      { label: 'Classes Behind',  value: behind,                     color: behind > 0 ? 'text-red-500' : 'text-green-600' },
                    ].map(k => (
                      <div key={k.label} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                        <p className="text-xs text-gray-400 mb-1">{k.label}</p>
                        <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
                      </div>
                    ))}
                  </div>
                )
              })()}

              {/* View selector */}
              <div className="flex gap-2">
                {(['class', 'teacher', 'subject'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setSyllabusView(v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                      syllabusView === v ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    By {v}
                  </button>
                ))}
                <button onClick={loadSyllabus}
                  className="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
                  ↻ Refresh
                </button>
              </div>

              {/* By Class */}
              {syllabusView === 'class' && (
                <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-50">
                    <h3 className="text-sm font-semibold text-gray-700">Coverage by Class</h3>
                  </div>
                  {syllabusData.by_class.length === 0 ? (
                    <div className="text-center py-10 text-gray-400 text-sm">No syllabus data available</div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {syllabusData.by_class.map(cls => (
                        <details key={cls.class_id} className="group">
                          <summary className="flex items-center gap-4 px-5 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors list-none">
                            <div className="w-16 text-center">
                              <span className="text-sm font-bold text-gray-800">{cls.grade}-{cls.section}</span>
                            </div>
                            <div className="flex-1">
                              <PctBar pct={cls.pct} />
                            </div>
                            <div className="w-24 text-right text-xs text-gray-400">
                              {cls.covered}/{cls.total} topics
                            </div>
                            <svg className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </summary>
                          <div className="px-5 pb-4 bg-gray-50/50 border-t border-gray-50">
                            <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-3">
                              {cls.subjects.map(s => (
                                <div key={s.subject} className="flex items-center gap-3">
                                  <span className="text-xs text-gray-600 w-24 truncate">{s.subject}</span>
                                  <div className="flex-1">
                                    <PctBar pct={s.pct} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </details>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* By Teacher */}
              {syllabusView === 'teacher' && (
                <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-50">
                    <h3 className="text-sm font-semibold text-gray-700">Coverage by Teacher</h3>
                  </div>
                  {syllabusData.by_teacher.length === 0 ? (
                    <div className="text-center py-10 text-gray-400 text-sm">No teacher-syllabus mapping found</div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {syllabusData.by_teacher.map(t => (
                        <details key={t.teacher_id} className="group">
                          <summary className="flex items-center gap-4 px-5 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors list-none">
                            <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {t.teacher_name.charAt(0).toUpperCase()}
                            </div>
                            <span className="w-36 text-sm text-gray-700 truncate">{t.teacher_name}</span>
                            <div className="flex-1">
                              <PctBar pct={t.pct} />
                            </div>
                            <div className="w-24 text-right text-xs text-gray-400">
                              {t.covered}/{t.total} topics
                            </div>
                            <svg className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </summary>
                          <div className="px-5 pb-4 bg-gray-50/50 border-t border-gray-50">
                            <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-3">
                              {t.subjects.map(s => (
                                <div key={s.subject} className="flex items-center gap-3">
                                  <span className="text-xs text-gray-600 w-24 truncate">{s.subject}</span>
                                  <div className="flex-1">
                                    <PctBar pct={s.pct} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </details>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* By Subject */}
              {syllabusView === 'subject' && (
                <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-50">
                    <h3 className="text-sm font-semibold text-gray-700">Coverage by Subject (School-wide)</h3>
                  </div>
                  {syllabusData.by_subject.length === 0 ? (
                    <div className="text-center py-10 text-gray-400 text-sm">No syllabus data available</div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {syllabusData.by_subject.map(s => (
                        <div key={s.subject} className="flex items-center gap-4 px-5 py-3.5">
                          <span className="w-32 text-sm text-gray-700 font-medium truncate">{s.subject}</span>
                          <div className="flex-1">
                            <PctBar pct={s.pct} />
                          </div>
                          <div className="w-28 text-right text-xs text-gray-400">
                            {s.covered} / {s.total} topics
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── TASKS TAB ────────────────────────────────────────────────── */}
      {tab === 'tasks' && (
        <div className="space-y-4">
          {/* KPI summary */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Total Tasks',     value: tasks.length,            color: 'text-gray-800' },
              { label: 'Published',       value: publishedTasks.length,   color: 'text-green-600' },
              { label: 'Drafts',          value: draftTasks.length,       color: 'text-gray-500' },
              { label: 'Overdue',         value: overdueTasks.length,     color: overdueTasks.length > 0 ? 'text-red-500' : 'text-green-600' },
            ].map(k => (
              <div key={k.label} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                <p className="text-xs text-gray-400 mb-1">{k.label}</p>
                <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Teacher task activity */}
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">Task Activity by Teacher</h3>
            </div>
            {teacherTaskList.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No task data</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {teacherTaskList.map(t => (
                  <div key={t.name} className="flex items-center gap-4 px-5 py-3">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {t.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="w-36 text-sm text-gray-700 truncate">{t.name}</span>
                    <div className="flex gap-3 flex-1 text-xs text-gray-500">
                      <span className="bg-gray-100 px-2 py-0.5 rounded-full">{t.total} tasks</span>
                      <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{t.published} live</span>
                    </div>
                    <div className="w-36 flex items-center gap-2">
                      <span className="text-xs text-gray-500">Avg submission</span>
                      <div className="w-16">
                        <PctBar pct={t.published > 0 ? t.avg_submission : null} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Filters + task list */}
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50 flex items-center gap-3 flex-wrap">
              <h3 className="text-sm font-semibold text-gray-700 flex-1">All Tasks</h3>
              {/* Status filter */}
              <div className="flex gap-1">
                {(['all', 'published', 'draft'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setTaskFilter(f)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${
                      taskFilter === f ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              {/* Type filter */}
              <div className="flex gap-1">
                {(['all', 'homework', 'practice', 'test'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setTaskType(f)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${
                      taskType === f ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <button onClick={loadTasks}
                className="px-3 py-1 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
                ↻ Refresh
              </button>
            </div>

            {tasksLoading && <div className="text-center py-10 text-gray-400 text-sm">Loading tasks…</div>}
            {tasksError  && <div className="text-center py-6 text-red-500 text-sm">{tasksError}</div>}

            {!tasksLoading && !tasksError && (
              filteredTasks.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">No tasks match the selected filters</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        {['Task', 'Class', 'Teacher', 'Type', 'Due', 'Status', 'Submission'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredTasks.map(t => {
                        const subPct = t.total_students > 0
                          ? Math.round((t.submitted_count / t.total_students) * 100) : null
                        const isOverdue = t.due_date && new Date(t.due_date) < new Date() && t.status === 'published'
                        return (
                          <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 py-3 max-w-[180px]">
                              <p className="font-medium text-gray-800 truncate">{t.title}</p>
                              <p className="text-xs text-gray-400">{t.subject}</p>
                            </td>
                            <td className="px-4 py-3 text-gray-600 font-medium">{t.class_label}</td>
                            <td className="px-4 py-3 text-gray-500 text-xs">{t.teacher_name}</td>
                            <td className="px-4 py-3">
                              <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full capitalize">{t.task_type}</span>
                            </td>
                            <td className={`px-4 py-3 text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-500'}`}>
                              {t.due_date ?? '—'}
                              {isOverdue && <span className="ml-1 text-red-400">(overdue)</span>}
                            </td>
                            <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                            <td className="px-4 py-3 w-32">
                              {t.status === 'published' ? (
                                <div className="flex items-center gap-1.5">
                                  <PctBar pct={subPct} />
                                  <span className="text-xs text-gray-400 whitespace-nowrap">{t.submitted_count}/{t.total_students}</span>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}
