'use client'

import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, BookOpen } from 'lucide-react'
import TopicContentViewer from '@/app/components/TopicContentViewer'
import { Skeleton } from '@/components/ui/skeleton'
import { StudentEmptyState, StudentPageIntro, StudentProgressTrack } from './StudentExperience'
import { Sticker, subjectSticker, subjectTone } from './stickers'

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
      <div className="mx-auto max-w-4xl space-y-5" role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Preparing your learning path…</span>
        <Skeleton className="h-28 rounded-[22px]" />
        <div className="flex gap-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-32 rounded-t-2xl" />)}
        </div>
        <Skeleton className="h-80 rounded-[22px]" />
      </div>
    )
  }

  if (subjects.length === 0) {
    return (
      <StudentEmptyState sticker="thinking-face" title="Your learning path is not ready yet" description="Your teacher has not mapped the syllabus for this class. It will appear here when it is available." />
    )
  }

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
  const tone = subjectTone(subject.subject)
  const meterTone = tone === 'yellow' ? 'pink' : 'yellow'
  const cheer = subject.completion_pct >= 100 ? 'All done — amazing!' : subject.completion_pct >= 60 ? 'Nearly there!' : subject.completion_pct > 0 ? 'Keep going!' : 'Fresh start!'

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <StudentPageIntro eyebrow="Your learning path" title="Syllabus" sticker="graduation-cap" tone="blue"
        description="Follow what has been taught, open study material, and see what comes next in each subject."
        aside={<span className="sb-chip" data-size="lg" data-tone="yellow"><Sticker name="notebook" size="xs" />Grade {grade}</span>} />

      <div>
        <div className="sb-folder-tabs" role="group" aria-label="Subjects">
          {subjects.map((s, i) => (
            <button key={s.subject} type="button" onClick={() => setActiveSubject(s.subject)} aria-pressed={s.subject === subject.subject}
              className="sb-folder-tab" data-tone={subjectTone(s.subject)} data-testid={`syllabus-subject-tab-${i}`}>
              <Sticker name={subjectSticker(s.subject)} size="sm" tilt={-8} />
              {s.subject}
            </button>
          ))}
        </div>

        <motion.div key={subject.subject} initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          className="sb-folder-body space-y-7" data-tone={tone} data-testid="student-syllabus-panel">
          <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr_auto]">
            <Sticker name={subjectSticker(subject.subject)} size="hero" tilt={-8} className="hidden sm:inline-block" />
            <div className="min-w-0">
              <h2 className="sb-display truncate text-3xl sm:text-4xl">{subject.subject}</h2>
              <div className="mt-3 max-w-md"><StudentProgressTrack value={subject.completion_pct} tone={meterTone} label={`${subject.covered} of ${subject.total} topics taught`} /></div>
            </div>
            <div className="sb-score-badge" data-testid="syllabus-coverage">
              <span>
                <motion.strong key={subject.completion_pct} initial={reduceMotion ? false : { scale: 0.8 }} animate={{ scale: 1 }} transition={{ duration: 0.25 }}>{subject.completion_pct}%</motion.strong>
                <span className="block text-[11px] font-extrabold uppercase tracking-[.08em]">covered</span>
                <span className="sb-hand mt-0.5 block text-base">{cheer}</span>
              </span>
            </div>
          </div>

          {classSemesterChoices.length > 0 && (
            <div className="sb-seg" role="group" aria-label="Semester">
              {classSemesterChoices.map(c => (
                <button key={c} type="button" onClick={() => setActiveClassSemester(c)} aria-pressed={c === effectiveClassSemester}>{c}</button>
              ))}
            </div>
          )}

          {materials.length > 0 && (
            <div className="sb-card flex flex-wrap items-center gap-3 p-4" data-tone="paper">
              <Sticker name="paperclip" size="md" tilt={-20} />
              <p className="sb-display mr-2 text-lg">Your {subject.subject} textbook</p>
              {materials.map(m => (
                <a key={m.id} href={m.file_url} target="_blank" rel="noopener noreferrer" className="sb-btn" data-size="sm" data-tone="yellow">
                  <BookOpen size={15} aria-hidden="true" />{m.title}
                </a>
              ))}
            </div>
          )}

          {allLocked && (
            <div className="sb-card flex items-center gap-4 p-5" data-tone="paper">
              <Sticker name="sleeping-face" size="lg" />
              <p className="text-sm font-semibold">Nothing unlocked in {subject.subject} yet — your teacher hasn&apos;t marked any topics as taught.</p>
            </div>
          )}

          {semesterGroups.map(group => (
            <div key={group.semester ?? '__none__'} className="space-y-5">
              {group.semester && <span className="sb-kicker" data-tone="paper">{group.semester}</span>}
              {group.chapters.map((ch, i) => (
                <motion.section key={ch.chapter_name} className="sb-notebook" data-tone={tone}
                  initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.05, 0.3), duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
                  <header className="sb-notebook-head">
                    <Sticker name={subjectSticker(subject.subject)} size="xs" />
                    <h3 className="min-w-0 flex-1 truncate text-[15px] font-extrabold">{ch.chapter_name}</h3>
                    <span className="sb-chip" data-tone={ch.covered === ch.topics.length && ch.topics.length > 0 ? 'mint' : 'paper'}>{ch.covered}/{ch.topics.length} taught</span>
                  </header>
                  {ch.topics.length === 0 && (
                    <p className="sb-notebook-row text-sm italic text-[#8b8373]">No topics added to this chapter yet.</p>
                  )}
                  {ch.topics.map(t => t.status === 'covered' ? (
                    <div key={t.id} className="sb-notebook-row">
                      <Sticker name="check-mark-button" size="xs" className="sb-row-mark" />
                      <button type="button" data-testid={`topic-study-${t.id}`} onClick={() => setActiveTopic(t)} className="sb-topic-btn">
                        <span>{t.topic_name}</span>
                        <span className="sb-topic-go" aria-hidden="true">Study <ArrowRight size={12} /></span>
                      </button>
                    </div>
                  ) : (
                    // Locked topics stay visible so the student can see the road ahead,
                    // but the name is all they get until the teacher marks it taught.
                    <div key={t.id} data-testid={`topic-locked-${t.id}`} className="sb-notebook-row">
                      <Sticker name="locked" size="xs" className="sb-row-mark opacity-70" />
                      <span className="sb-topic-locked flex-1">{t.topic_name}</span>
                      <span className="sb-chip" data-tone="paper">Coming up</span>
                    </div>
                  ))}
                </motion.section>
              ))}
            </div>
          ))}
        </motion.div>
      </div>

      {activeTopic && (
        <TopicContentViewer topic={activeTopic} onClose={() => setActiveTopic(null)} role="student" />
      )}
    </div>
  )
}
