'use client'

// Read-only "what's been taught, how is my child scoring" view, ported from
// the Ulearn prototype's ParentView (UlearnPrototype.jsx ~L1371-1428).
// Coverage is wired to the real /api/syllabus endpoint (same one StudentSyllabus
// uses) — subject/chapter/topic status is real per-class data. Per-topic quiz
// scores are NOT wired to real data: see the TODO below the topic row.

import { useEffect, useState } from 'react'
import { CheckCircle2, Lock } from 'lucide-react'
import { INK, GREEN, CORAL, SURFACE, BORDER } from '@/app/components/ulearn/theme'
import { Pills, ProgressBar, UlearnCard, StatusPill } from '@/app/components/ulearn/primitives'

type Topic = {
  id: number
  topic_name: string
  topic_order: number
  status: string
  covered_date: string | null
  covered_by_name: string | null
}

type Chapter = {
  chapter_name: string
  chapter_order: number
  // Per-class semester grouping from the teacher's own Setup screen.
  class_semester_label?: string | null
  total: number
  covered: number
  topics: Topic[]
}

type Subject = {
  subject: string
  total: number
  covered: number
  completion_pct: number
  chapters: Chapter[]
  setup_completed_at?: string | null
  semester_mode?: boolean
  semester_count?: number | null
}

type Props = {
  schoolId: number
  classId: number
  studentName: string
  grade: string
  section: string
}

export default function ParentSyllabus({ schoolId, classId, studentName, grade, section }: Props) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSubject, setActiveSubject] = useState('')
  const [activeClassSemester, setActiveClassSemester] = useState('')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/syllabus?school_id=${schoolId}&class_id=${classId}`)
      .then(r => r.json())
      .then(d => {
        const list: Subject[] = d.subjects || []
        setSubjects(list)
        setActiveSubject(prev => (prev && list.some(s => s.subject === prev)) ? prev : (list[0]?.subject ?? ''))
      })
      .catch(() => setSubjects([]))
      .finally(() => setLoading(false))
  }, [schoolId, classId])

  const firstName = studentName.split(' ')[0]

  if (loading) {
    return (
      <div className="max-w-2xl space-y-4 animate-pulse" data-testid="parent-syllabus-loading">
        <div className="h-14 bg-gray-100 rounded-2xl" />
        <div className="h-10 bg-gray-100 rounded-2xl w-2/3" />
        <div className="h-20 bg-gray-100 rounded-2xl" />
        <div className="h-32 bg-gray-100 rounded-2xl" />
      </div>
    )
  }

  if (subjects.length === 0) {
    return (
      <UlearnCard className="max-w-2xl p-10 text-center">
        <p className="text-sm text-gray-400">No syllabus has been mapped for {firstName}&apos;s class yet.</p>
      </UlearnCard>
    )
  }

  const subj = subjects.find(s => s.subject === activeSubject) ?? subjects[0]

  // This class's own Semester 1/2/... tabs — from the teacher's Setup
  // screen, only shown when Setup actually ran in Semester Wise mode.
  const classSemesterChoices = subj.semester_mode && subj.semester_count
    ? Array.from({ length: subj.semester_count }, (_, i) => `Semester ${i + 1}`)
    : []
  const effectiveClassSemester = classSemesterChoices.includes(activeClassSemester)
    ? activeClassSemester
    : (classSemesterChoices[0] || '')
  const chaptersForSemester = classSemesterChoices.length > 0
    ? subj.chapters.filter(ch => ch.class_semester_label === effectiveClassSemester)
    : subj.chapters

  // Full syllabus, not just what's been taught — every active chapter/topic
  // the teacher's Setup kept, same as the student view. Each topic row below
  // distinguishes taught (checkmark) from not-yet-taught (locked, name-only)
  // rather than hiding untaught content entirely.
  const allChapters = [...chaptersForSemester].sort((a, b) => a.chapter_order - b.chapter_order)

  return (
    <div className="max-w-2xl space-y-4" data-testid="parent-syllabus">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: INK }}>
          {firstName}&apos;s progress · Grade {grade}-{section}
        </h2>
        <p className="text-sm text-gray-500">A read-only window into what&apos;s been taught and how {firstName} is scoring.</p>
      </div>

      <Pills
        items={subjects.map(s => s.subject)}
        value={subj.subject}
        onChange={setActiveSubject}
        color={CORAL}
      />

      {classSemesterChoices.length > 0 && (
        <Pills
          items={classSemesterChoices}
          value={effectiveClassSemester}
          onChange={setActiveClassSemester}
          color={CORAL}
        />
      )}

      <UlearnCard className="p-4 flex items-center gap-4">
        <div className="flex-1">
          <div className="text-sm font-medium mb-1.5" style={{ color: INK }}>
            {subj.subject} · {subj.covered}/{subj.total} topics taught
          </div>
          <ProgressBar pct={subj.completion_pct} color={CORAL} className="w-full" />
        </div>
        {/* FUTURE: "avg score /10" quiz-average card — hidden, matching the
            removal of the interactive quiz itself in TopicContentViewer.tsx.
            No API has ever persisted a real per-child quiz score, so this
            was always a fabricated "—" placeholder, not real data. Bring
            back once quiz attempts are actually persisted (see the note in
            TopicContentViewer.tsx for what that needs). */}
      </UlearnCard>

      {subj.covered === 0 && (
        <UlearnCard className="p-6 text-center">
          <p className="text-sm text-gray-400">No {subj.subject} topics have been taught to {firstName}&apos;s class yet.</p>
        </UlearnCard>
      )}

      {allChapters.map(ch => (
        <UlearnCard key={ch.chapter_name} className="p-4" borderColor={BORDER}>
          <div className="flex items-center gap-2 mb-2">
            <span className="font-medium text-sm" style={{ color: INK }}>{ch.chapter_name}</span>
            <span className="text-xs text-gray-400 ml-auto">{ch.covered}/{ch.topics.length} taught</span>
          </div>
          <div className="space-y-2">
            {ch.topics.length === 0 && (
              <p className="text-xs text-gray-400 italic">No topics added to this chapter yet.</p>
            )}
            {ch.topics.map(t => {
              const taught = t.status === 'covered'
              if (!taught) {
                // Not-yet-taught topics stay visible so a parent can see the
                // road ahead, same treatment as the student view's locked rows.
                return (
                  <div key={t.id} className="flex items-center gap-3 rounded-lg px-3 py-2 flex-wrap" style={{ background: SURFACE, opacity: 0.7 }}>
                    <Lock size={14} className="shrink-0" style={{ color: '#9b978d' }} />
                    <span className="text-sm flex-1 min-w-[140px]" style={{ color: '#5F5E5A' }}>{t.topic_name}</span>
                    <StatusPill status="locked" />
                  </div>
                )
              }
              return (
                <div key={t.id} className="flex items-center gap-3 rounded-lg px-3 py-2 flex-wrap" style={{ background: SURFACE }}>
                  <CheckCircle2 size={14} style={{ color: GREEN }} className="shrink-0" />
                  <div className="flex-1 min-w-[140px]">
                    <p className="text-sm truncate" style={{ color: INK }}>{t.topic_name}</p>
                    {t.covered_date && (
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        Taught {new Date(t.covered_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        {t.covered_by_name && ` · ${t.covered_by_name}`}
                      </p>
                    )}
                  </div>
                  <StatusPill status="taught" />
                  {/* FUTURE: per-topic quiz-score pill — hidden, matching the
                      removal of the interactive quiz itself in
                      TopicContentViewer.tsx. This was always a static label,
                      never real data (no quiz result has ever been persisted
                      anywhere). Bring back once a real per-topic score exists
                      to read (e.g. a quiz_attempts table + an API route). */}
                </div>
              )
            })}
          </div>
        </UlearnCard>
      ))}
    </div>
  )
}
