'use client'

// Read-only "what's been taught, how is my child scoring" view, ported from
// the Ulearn prototype's ParentView (UlearnPrototype.jsx ~L1371-1428).
// Coverage is wired to the real /api/syllabus endpoint (same one StudentSyllabus
// uses) — subject/chapter/topic status is real per-class data. Per-topic quiz
// scores are NOT wired to real data: see the TODO below the topic row.

import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { INK, GREEN, CORAL } from '@/app/components/ulearn/theme'
import { Pills, ProgressBar, UlearnCard } from '@/app/components/ulearn/primitives'

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
  const taughtChapters = subj.chapters
    .map(ch => ({ ...ch, topics: ch.topics.filter(t => t.status === 'covered') }))
    .filter(ch => ch.topics.length > 0)
    .sort((a, b) => a.chapter_order - b.chapter_order)

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

      <UlearnCard className="p-4 flex items-center gap-4">
        <div className="flex-1">
          <div className="text-sm font-medium mb-1.5" style={{ color: INK }}>
            {subj.subject} · {subj.covered}/{subj.total} topics taught
          </div>
          <ProgressBar pct={subj.completion_pct} color={CORAL} className="w-full" />
        </div>
        <div className="text-right shrink-0">
          {/* TODO(parent-syllabus): no API persists a real per-child average quiz
              score today, so this is left blank rather than fabricated — see the
              per-topic note below for what's missing. */}
          <div className="text-2xl font-semibold" style={{ color: INK }}>—</div>
          <div className="text-xs text-gray-400">avg score /10</div>
        </div>
      </UlearnCard>

      {subj.covered === 0 && (
        <UlearnCard className="p-6 text-center">
          <p className="text-sm text-gray-400">No {subj.subject} topics have been taught to {firstName}&apos;s class yet.</p>
        </UlearnCard>
      )}

      {taughtChapters.map(ch => (
        <UlearnCard key={ch.chapter_name} className="p-4">
          <div className="font-medium text-sm mb-2" style={{ color: INK }}>{ch.chapter_name}</div>
          <div className="space-y-2">
            {ch.topics.map(t => (
              <div key={t.id} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: '#FAFAF8' }}>
                <CheckCircle2 size={14} style={{ color: GREEN }} className="shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" style={{ color: INK }}>{t.topic_name}</p>
                  {t.covered_date && (
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      Taught {new Date(t.covered_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      {t.covered_by_name && ` · ${t.covered_by_name}`}
                    </p>
                  )}
                </div>
                {/* TODO(parent-syllabus): real per-topic quiz scores aren't wired
                    up because they don't exist yet anywhere in the backend. The
                    in-topic quiz in app/components/TopicContentViewer.tsx
                    (handleSubmitQuiz) grades entirely client-side and never POSTs
                    a result, so there is no student-scoped "score for this topic"
                    to read. Once a persistence endpoint exists (e.g. a
                    student_topic_quiz_attempts table + /api/parent/topic-scores),
                    swap this static pill for the real score, matching the
                    prototype's `p.quizScore != null ? "{score}/10" : "not attempted"`. */}
                <span className="text-xs text-gray-400 shrink-0">not attempted</span>
              </div>
            ))}
          </div>
        </UlearnCard>
      ))}
    </div>
  )
}
