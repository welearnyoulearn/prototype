'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, TrendingUp, AlertTriangle, BookOpen, Users } from 'lucide-react'
import { INK, TEAL, CORAL, GREEN, BORDER, SURFACE } from '@/app/components/ulearn/theme'
import { UlearnCard, Pills } from '@/app/components/ulearn/primitives'
import SyllabusTracking from './SyllabusTracking'

// ── Types ──────────────────────────────────────────────────────────────────

type TaskRow = {
  id: number; title: string; subject: string; task_type: string
  status: string; due_date: string | null
  teacher_name: string; class_label: string
  submitted_count: number; reviewed_count: number; pending_count: number
  total_students: number
}

// ── Helpers ────────────────────────────────────────────────────────────────

function band(pct: number | null): { color: string; bg: string; label: string } {
  if (pct == null) return { color: '#9CA3AF', bg: '#F3F4F1', label: 'Not started' }
  if (pct >= 75) return { color: GREEN, bg: '#E7F3EB', label: 'On track' }
  if (pct >= 40) return { color: '#E8A33D', bg: '#FCF1DF', label: 'In progress' }
  return { color: CORAL, bg: '#FBEAE3', label: 'Falling behind' }
}

function PctBar({ pct, size = 'md' }: { pct: number | null; size?: 'sm' | 'md' }) {
  const val = pct ?? 0
  const { color } = band(pct)
  const height = size === 'sm' ? 'h-1.5' : 'h-2'
  return (
    <div className="flex items-center gap-2.5 w-full">
      <div className={`flex-1 rounded-full ${height} overflow-hidden`} style={{ background: BORDER }}>
        <div className={`h-full rounded-full transition-all duration-500`} style={{ width: `${val}%`, background: color }} />
      </div>
      <span className="text-xs font-bold w-9 text-right tabular-nums" style={{ color: pct != null ? color : '#9CA3AF' }}>
        {pct != null ? `${val}%` : '—'}
      </span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    published: { bg: '#E7F3EB', color: GREEN },
    draft:     { bg: SURFACE, color: '#9CA3AF' },
    closed:    { bg: '#EAF1F5', color: TEAL },
  }
  const s = map[status] ?? { bg: SURFACE, color: '#9CA3AF' }
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide" style={{ background: s.bg, color: s.color }}>
      {status}
    </span>
  )
}

function KpiCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string | number; tone: string }) {
  return (
    <UlearnCard className="p-4 flex items-center gap-3" borderColor={BORDER}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${tone}1A`, color: tone }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-gray-400 font-medium truncate">{label}</p>
        <p className="text-xl font-bold tabular-nums" style={{ color: INK }}>{value}</p>
      </div>
    </UlearnCard>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────
// The Syllabus Coverage tab is owned entirely by SyllabusTracking.tsx (its
// own class/teacher two-pane list+detail+trend-chart screen) — this
// component now only owns the top-level tab switcher and the Tasks &
// Assignments tab.

export default function AcademicAnalytics({ schoolId }: { schoolId: number }) {
  const [tab, setTab] = useState<'syllabus' | 'tasks'>('syllabus')

  // Tasks state
  const [tasks, setTasks]             = useState<TaskRow[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [tasksError, setTasksError]   = useState('')
  const [taskFilter, setTaskFilter]   = useState<'all' | 'published' | 'draft'>('all')
  const [taskType, setTaskType]       = useState<'all' | 'homework' | 'practice' | 'test'>('all')

  useEffect(() => { loadTasks() }, [schoolId]) // eslint-disable-line react-hooks/exhaustive-deps

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
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: INK }}>Academic Analytics</h2>
          <p className="text-sm text-gray-500 mt-0.5">Syllabus coverage &amp; task tracking across every class</p>
        </div>
        <Pills
          items={['syllabus', 'tasks'] as const}
          value={tab}
          onChange={setTab}
          color={TEAL}
        />
      </div>

      {/* ── SYLLABUS TAB ─────────────────────────────────────────────── */}
      {tab === 'syllabus' && <SyllabusTracking schoolId={schoolId} />}

      {/* ── TASKS TAB ────────────────────────────────────────────────── */}
      {tab === 'tasks' && (
        <div className="space-y-4">
          {/* KPI summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard icon={<BookOpen size={16} />} label="Total Tasks" value={tasks.length} tone={INK} />
            <KpiCard icon={<TrendingUp size={16} />} label="Published" value={publishedTasks.length} tone={GREEN} />
            <KpiCard icon={<BookOpen size={16} />} label="Drafts" value={draftTasks.length} tone="#9CA3AF" />
            <KpiCard icon={<AlertTriangle size={16} />} label="Overdue" value={overdueTasks.length} tone={overdueTasks.length > 0 ? CORAL : GREEN} />
          </div>

          {/* Teacher task activity */}
          <UlearnCard borderColor={BORDER} className="overflow-hidden">
            <div className="px-5 py-3.5 border-b flex items-center gap-2" style={{ borderColor: BORDER }}>
              <Users size={14} style={{ color: TEAL }} />
              <h3 className="text-sm font-semibold" style={{ color: INK }}>Task Activity by Teacher</h3>
            </div>
            {teacherTaskList.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">No task data yet.</div>
            ) : (
              <div className="divide-y" style={{ borderColor: BORDER }}>
                {teacherTaskList.map(t => (
                  <div key={t.name} className="flex items-center gap-4 px-5 py-3">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: '#EDE9FB', color: '#5B4E8A' }}>
                      {t.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="w-32 text-sm font-medium truncate flex-shrink-0" style={{ color: INK }}>{t.name}</span>
                    <div className="flex gap-2 flex-1 text-xs">
                      <span className="px-2 py-0.5 rounded-full font-medium" style={{ background: SURFACE, color: '#6b7280' }}>{t.total} tasks</span>
                      <span className="px-2 py-0.5 rounded-full font-medium" style={{ background: '#E7F3EB', color: GREEN }}>{t.published} live</span>
                    </div>
                    <div className="w-40 flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-gray-400 whitespace-nowrap">Avg submission</span>
                      <div className="w-16">
                        <PctBar pct={t.published > 0 ? t.avg_submission : null} size="sm" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </UlearnCard>

          {/* Filters + task list */}
          <UlearnCard borderColor={BORDER} className="overflow-hidden">
            <div className="px-5 py-3.5 border-b flex items-center gap-3 flex-wrap" style={{ borderColor: BORDER }}>
              <h3 className="text-sm font-semibold flex-1" style={{ color: INK }}>All Tasks</h3>
              <Pills items={['all', 'published', 'draft'] as const} value={taskFilter} onChange={setTaskFilter} color={TEAL} />
              <Pills items={['all', 'homework', 'practice', 'test'] as const} value={taskType} onChange={setTaskType} color={'#E8A33D'} />
              <button onClick={loadTasks}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border hover:bg-gray-50 transition-colors"
                style={{ borderColor: BORDER, color: INK }}>
                <RefreshCw size={12} /> Refresh
              </button>
            </div>

            {tasksLoading && <div className="text-center py-12 text-gray-400 text-sm">Loading tasks…</div>}
            {tasksError  && <div className="text-center py-6 text-sm" style={{ color: CORAL }}>{tasksError}</div>}

            {!tasksLoading && !tasksError && (
              filteredTasks.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">No tasks match the selected filters.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead style={{ background: SURFACE }}>
                      <tr>
                        {['Task', 'Class', 'Teacher', 'Type', 'Due', 'Status', 'Submission'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 border-b" style={{ borderColor: BORDER }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: BORDER }}>
                      {filteredTasks.map(t => {
                        const subPct = t.total_students > 0
                          ? Math.round((t.submitted_count / t.total_students) * 100) : null
                        const isOverdue = t.due_date && new Date(t.due_date) < new Date() && t.status === 'published'
                        return (
                          <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 py-3 max-w-[180px]">
                              <p className="font-medium truncate" style={{ color: INK }}>{t.title}</p>
                              <p className="text-xs text-gray-400">{t.subject}</p>
                            </td>
                            <td className="px-4 py-3 font-medium" style={{ color: INK }}>{t.class_label}</td>
                            <td className="px-4 py-3 text-gray-500 text-xs">{t.teacher_name}</td>
                            <td className="px-4 py-3">
                              <span className="text-xs px-2 py-0.5 rounded-full capitalize font-medium" style={{ background: '#EAF1F5', color: TEAL }}>{t.task_type}</span>
                            </td>
                            <td className="px-4 py-3 text-xs" style={isOverdue ? { color: CORAL, fontWeight: 600 } : { color: '#6b7280' }}>
                              {t.due_date ?? '—'}
                              {isOverdue && <span className="ml-1" style={{ color: CORAL }}>(overdue)</span>}
                            </td>
                            <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                            <td className="px-4 py-3 w-32">
                              {t.status === 'published' ? (
                                <div className="flex items-center gap-1.5">
                                  <PctBar pct={subPct} size="sm" />
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
          </UlearnCard>
        </div>
      )}
    </div>
  )
}
