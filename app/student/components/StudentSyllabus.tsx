'use client'

import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { BookOpen, Check, Lock, Route } from 'lucide-react'
import TopicContentViewer from '@/app/components/TopicContentViewer'
import { INK, SURFACE } from '@/app/components/ulearn/theme'
import { Pills, StatusPill } from '@/app/components/ulearn/primitives'
import { Skeleton } from '@/components/ui/skeleton'
import { StudentEmptyState, StudentPageIntro, StudentProgressTrack } from './StudentExperience'

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

const STUDENT_ACCENT = '#8B4A10'

export default function StudentSyllabus({ schoolId, classId, grade }: Props) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSubject, setActiveSubject] = useState('')
  // Which of this class's own Semester 1/2/... splits is showing — from the
  // teacher's Setup screen.
  const [activeClassSemester, setActiveClassSemester] = useState('')
  const [activeTopic, setActiveTopic] = useState<Topic | null>(null)
  const [materials, setMaterials] = useState<Material[]>([])
  const reduceMotion = useReducedMotion()

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
      <div className="mx-auto max-w-3xl space-y-5" role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Preparing your learning path…</span>
        <Skeleton className="h-28 rounded-md" />
        <div className="flex gap-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-9 w-24" />)}
        </div>
        <Skeleton className="h-20" />
        {[1, 2].map(i => <Skeleton key={i} className="h-32" />)}
      </div>
    )
  }

  if (subjects.length === 0) {
    return (
      <StudentEmptyState icon={<BookOpen size={22} />} title="Your learning path is not ready yet" description="Your teacher has not mapped the syllabus for this class. It will appear here when it is available." />
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
    <div className="max-w-3xl mx-auto space-y-6">
      <StudentPageIntro eyebrow="Your learning path" title="Syllabus" description="Follow what has been taught, open available study material, and see what comes next in each subject." aside={
        <div className="flex items-center gap-2 text-xs font-medium text-[#68736b]"><Route size={17} className="text-[#a85f16]" aria-hidden="true" />Grade {grade}</div>
      } />

      <Pills items={subjectNames} value={activeSubject} onChange={setActiveSubject} color={STUDENT_ACCENT} />

      {classSemesterChoices.length > 0 && (
        <Pills
          items={classSemesterChoices}
          value={effectiveClassSemester}
          onChange={setActiveClassSemester}
          color={STUDENT_ACCENT}
        />
      )}

      <motion.div key={subject.subject} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <div className="grid gap-4 border-y border-[#dcd8cd] bg-white/55 px-4 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="flex-1 min-w-0">
            <div className="mb-2 text-sm font-semibold truncate" style={{ color: INK }}>{subject.subject}</div>
            <StudentProgressTrack value={subject.completion_pct} label={`${subject.covered} of ${subject.total} topics taught`} />
          </div>
          <div className="text-right shrink-0">
            <motion.div
              key={subject.completion_pct}
              initial={{ scale: 0.85, opacity: 0.5 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="text-2xl font-semibold"
              style={{ color: INK }}
            >
              {subject.completion_pct}%
            </motion.div>
            <div className="text-xs text-gray-500">subject coverage</div>
          </div>
        </div>
      </motion.div>

      {materials.length > 0 && (
        <div className="border-l-2 border-[#a85f16] bg-[#f6efe4] p-4">
          <div className="text-sm font-semibold mb-2" style={{ color: INK }}>Textbook for {subject.subject}</div>
          <div className="space-y-2">
            {materials.map(m => (
              <a key={m.id} href={m.file_url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-white/70 hover:underline" style={{ color: '#6f3b0b' }}>
                <BookOpen size={14} className="shrink-0" /> {m.title}
              </a>
            ))}
          </div>
        </div>
      )}

      {allLocked && (
        <div className="border-y border-[#dcd8cd] px-4 py-5 text-center text-sm text-gray-500">
          Nothing unlocked in {subject.subject} yet — your teacher hasn&apos;t marked any topics as taught.
        </div>
      )}

      {semesterGroups.map(group => (
        <div key={group.semester ?? '__none__'} className="space-y-4">
          {group.semester && (
            <h3 className="text-xs font-bold uppercase tracking-widest px-1" style={{ color: STUDENT_ACCENT }}>{group.semester}</h3>
          )}
          {group.chapters.map((ch, i) => (
        <motion.div
          key={ch.chapter_name}
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(i * 0.05, 0.3), duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
        <section className="border-b border-[#dcd8cd] px-1 py-5">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen size={16} style={{ color: STUDENT_ACCENT }} />
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
                  <Check size={14} style={{ color: STUDENT_ACCENT }} className="shrink-0" />
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
        </section>
        </motion.div>
          ))}
        </div>
      ))}

      {activeTopic && (
        <TopicContentViewer topic={activeTopic} onClose={() => setActiveTopic(null)} role="student" />
      )}
    </div>
  )
}
