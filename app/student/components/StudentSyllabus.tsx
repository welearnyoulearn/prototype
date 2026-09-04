'use client'

import { useEffect, useState } from 'react'
import { BookOpen, Check, Lock } from 'lucide-react'
import TopicContentViewer from '@/app/components/TopicContentViewer'
import { INK, GREEN, BORDER, SURFACE, CREAM } from '@/app/components/ulearn/theme'
import { Pills, ProgressBar, UlearnCard, StatusPill } from '@/app/components/ulearn/primitives'

type Resource = { id: number; title: string; url: string; resource_type: string }

type Topic = {
  id: number
  subject: string
  chapter_name: string
  chapter_order: number
  topic_name: string
  topic_order: number
  status: string
  covered_date: string | null
  covered_by_name: string | null
  content_text?: string
  content_pdf_url?: string
  resources?: Resource[] | null
}

type Chapter = {
  chapter_name: string
  chapter_order: number
  semester?: string | null
  // Per-class semester grouping from the teacher's own Setup screen —
  // distinct from `semester` above (school_chapters' shared column).
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

type Material = { id: number; material_type: 'textbook'; title: string; file_url: string }

type Props = {
  schoolId: number
  classId: number
  grade: string
}

export default function StudentSyllabus({ schoolId, classId, grade }: Props) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSubject, setActiveSubject] = useState('')
  // Which of this class's own Semester 1/2/... splits is showing — from the
  // teacher's Setup screen.
  const [activeClassSemester, setActiveClassSemester] = useState('')
  const [activeTopic, setActiveTopic] = useState<Topic | null>(null)
  const [materials, setMaterials] = useState<Material[]>([])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/syllabus?school_id=${schoolId}&class_id=${classId}`)
      .then(r => r.json())
      .then(d => {
        const subs: Subject[] = d.subjects || []
        setSubjects(subs)
        setActiveSubject(prev => (prev && subs.some(s => s.subject === prev)) ? prev : (subs[0]?.subject ?? ''))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [schoolId, classId])

  // Textbooks uploaded once per subject on the platform side — students only
  // ever see the 'textbook' type, never handbooks.
  useEffect(() => {
    if (!grade || !activeSubject) { setMaterials([]); return }
    const params = new URLSearchParams({ school_id: String(schoolId), grade, subject_name: activeSubject })
    fetch(`/api/school/subjects/materials?${params}`)
      .then(r => r.json())
      .then(data => setMaterials(Array.isArray(data) ? data : []))
      .catch(() => setMaterials([]))
  }, [schoolId, grade, activeSubject])

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse max-w-3xl mx-auto">
        <div className="h-9 rounded-xl w-64" style={{ background: BORDER }} />
        <div className="flex gap-2">
          {[1, 2, 3].map(i => <div key={i} className="h-9 w-24 rounded-lg" style={{ background: BORDER }} />)}
        </div>
        <div className="h-20 rounded-2xl" style={{ background: BORDER }} />
        {[1, 2].map(i => <div key={i} className="h-32 rounded-2xl" style={{ background: BORDER }} />)}
      </div>
    )
  }

  if (subjects.length === 0) {
    return (
      <UlearnCard className="max-w-md mx-auto text-center py-16 px-6" borderColor={BORDER}>
        <p className="text-4xl mb-3">📚</p>
        <p className="font-semibold" style={{ color: INK }}>No syllabus yet</p>
        <p className="text-xs text-gray-400 mt-1">Your teacher hasn&apos;t mapped the syllabus for your class yet.</p>
      </UlearnCard>
    )
  }

  const subjectNames = subjects.map(s => s.subject)
  const subject = subjects.find(s => s.subject === activeSubject) ?? subjects[0]

  // This class's own Semester 1/2/... tabs — only when the teacher ran
  // Setup in Semester Wise mode.
  const classSemesterChoices = subject.semester_mode && subject.semester_count
    ? Array.from({ length: subject.semester_count }, (_, i) => `Semester ${i + 1}`)
    : []
  const effectiveClassSemester = classSemesterChoices.includes(activeClassSemester)
    ? activeClassSemester
    : (classSemesterChoices[0] || '')
  const chaptersForClassSemester = classSemesterChoices.length > 0
    ? subject.chapters.filter(c => c.class_semester_label === effectiveClassSemester)
    : subject.chapters

  // Group chapters by the board's own semester column when the subject uses
  // it — falls back to a single flat bucket (no header) otherwise.
  const semesterGroups: { semester: string | null; chapters: Chapter[] }[] = chaptersForClassSemester.some(c => c.semester)
    ? Object.values(
        chaptersForClassSemester.reduce((acc, ch) => {
          const key = ch.semester || ' none'
          if (!acc[key]) acc[key] = { semester: ch.semester || null, chapters: [] }
          acc[key].chapters.push(ch)
          return acc
        }, {} as Record<string, { semester: string | null; chapters: Chapter[] }>)
      )
    : [{ semester: null, chapters: chaptersForClassSemester }]

  const allLocked = subject.chapters.every(c => c.topics.every(t => t.status !== 'covered'))

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="rounded-3xl p-4 sm:p-5" style={{ background: CREAM, border: `1px solid ${BORDER}` }}>
        <h2 className="text-lg font-semibold" style={{ color: INK }}>My learning</h2>
        <p className="text-sm text-gray-500 mt-0.5">Topics unlock as your teacher teaches them. Take the quiz once one&apos;s unlocked.</p>
      </div>

      <Pills items={subjectNames} value={activeSubject} onChange={setActiveSubject} color={GREEN} />

      {classSemesterChoices.length > 0 && (
        <Pills
          items={classSemesterChoices}
          value={effectiveClassSemester}
          onChange={setActiveClassSemester}
          color={GREEN}
        />
      )}

      <UlearnCard className="p-4 flex items-center justify-between gap-4" borderColor={BORDER}>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium mb-1.5 truncate" style={{ color: INK }}>
            {subject.subject} &middot; {subject.covered}/{subject.total} topics taught
          </div>
          <ProgressBar pct={subject.completion_pct} color={GREEN} className="w-full" />
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-semibold" style={{ color: INK }}>{subject.completion_pct}%</div>
          <div className="text-xs text-gray-400">covered</div>
        </div>
      </UlearnCard>

      {materials.length > 0 && (
        <UlearnCard className="p-4" borderColor={BORDER}>
          <div className="text-sm font-medium mb-2" style={{ color: INK }}>Textbook</div>
          <div className="space-y-2">
            {materials.map(m => (
              <a key={m.id} href={m.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg hover:underline" style={{ background: SURFACE, color: GREEN }}>
                <BookOpen size={14} className="shrink-0" /> {m.title}
              </a>
            ))}
          </div>
        </UlearnCard>
      )}

      {allLocked && (
        <UlearnCard className="p-4 text-center text-sm text-gray-400" borderColor={BORDER}>
          Nothing unlocked in {subject.subject} yet — your teacher hasn&apos;t marked any topics as taught.
        </UlearnCard>
      )}

      {semesterGroups.map(group => (
        <div key={group.semester ?? '__none__'} className="space-y-4">
          {group.semester && (
            <h3 className="text-xs font-bold uppercase tracking-widest px-1" style={{ color: GREEN }}>{group.semester}</h3>
          )}
          {group.chapters.map(ch => (
        <UlearnCard key={ch.chapter_name} className="p-4" borderColor={BORDER}>
          <div className="flex items-center gap-2 mb-3">
            <BookOpen size={16} style={{ color: GREEN }} />
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
                // Locked topics stay visible so the student can see the road ahead,
                // but the name is all they get until the teacher marks it taught.
                return (
                  <div
                    key={t.id}
                    data-testid={`topic-locked-${t.id}`}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 flex-wrap"
                    style={{ background: SURFACE, opacity: 0.7 }}
                  >
                    <Lock size={14} className="shrink-0" style={{ color: '#9b978d' }} />
                    <span className="text-sm flex-1 min-w-[140px]" style={{ color: '#5F5E5A' }}>{t.topic_name}</span>
                    <StatusPill status="locked" />
                  </div>
                )
              }
              return (
                <div key={t.id} className="flex items-center gap-3 rounded-lg px-3 py-2 flex-wrap" style={{ background: SURFACE }}>
                  <Check size={14} style={{ color: GREEN }} className="shrink-0" />
                  <button
                    data-testid={`topic-study-${t.id}`}
                    onClick={() => setActiveTopic(t)}
                    className="text-sm flex-1 text-left hover:underline min-w-[140px]"
                    style={{ color: INK }}
                  >
                    {t.topic_name}
                  </button>
                  <StatusPill status="taught" />
                </div>
              )
            })}
          </div>
        </UlearnCard>
          ))}
        </div>
      ))}

      {activeTopic && (
        <TopicContentViewer topic={activeTopic} onClose={() => setActiveTopic(null)} role="student" />
      )}
    </div>
  )
}
