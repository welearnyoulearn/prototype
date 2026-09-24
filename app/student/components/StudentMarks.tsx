'use client'

import { useEffect, useState } from 'react'
import { motion, useMotionValue, useTransform, animate, useReducedMotion } from 'framer-motion'
import { ChevronDown, Printer } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StudentAlert, StudentEmptyState, StudentPageIntro, StudentProgressTrack, studentReveal } from './StudentExperience'
import { Sticker, subjectSticker, type StickerName, type Tone } from './stickers'

type SubjectResult = {
  subject_name: string
  max_marks: number
  marks_obtained: number | null
  is_absent: boolean
  percentage: number | null
  grade: string | null
  pass: boolean | null
}

type ExamResult = {
  exam_id: number
  exam_name: string
  exam_type: string
  exam_date: string
  passing_pct: number
  released_at: string
  subjects: SubjectResult[]
  total_obtained: number | null
  total_max: number
  percentage: number | null
  grade: string | null
  pass: boolean | null
  parent_acknowledged: boolean
  parent_ack_name: string | null
  parent_ack_at: string | null
}

type Props = {
  studentId: number
  schoolId: number
  classId: number
}

function CountUpPercent({ value }: { value: number }) {
  const reduceMotion = useReducedMotion()
  const mv = useMotionValue(0)
  const rounded = useTransform(mv, v => Math.round(v))
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const controls = animate(mv, value, { duration: reduceMotion ? 0 : 0.9, ease: [0.16, 1, 0.3, 1] })
    const unsub = rounded.on('change', v => setDisplay(v))
    return () => { controls.stop(); unsub() }
  }, [value, reduceMotion]) // eslint-disable-line react-hooks/exhaustive-deps
  return <>{display}</>
}

function fmtDate(date: string): string {
  const d = new Date(date.length === 10 ? `${date}T00:00:00` : date)
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function passTone(pass: boolean | null): Tone {
  return pass === true ? 'mint' : pass === false ? 'coral' : 'paper'
}

function resultSticker(pct: number | null, pass: boolean | null): StickerName {
  if (pct === null) return 'memo'
  if (pct >= 100) return 'hundred-points'
  if (pct >= 90) return 'star-struck'
  if (pass) return 'sports-medal'
  return 'seedling'
}

function cheerFor(pct: number | null, pass: boolean | null): string {
  if (pct === null) return 'Result recorded.'
  if (pct >= 100) return 'A perfect score!'
  if (pct >= 90) return 'Outstanding work!'
  if (pass) return 'Well done — keep it up!'
  return 'You can bounce back — ask your teacher what to practise next.'
}

const PAGE_INTRO = { eyebrow: 'Academic progress', title: 'My marks', sticker: 'trophy' as const, tone: 'yellow' as const, description: 'Review released exams, see how each subject went, and open a score card to share or print.' }

const EXAM_TYPE_LABELS: Record<string, string> = {
  unit_test: 'Unit Test',
  mid_term: 'Mid Term',
  final_exam: 'Final Exam',
  practical: 'Practical',
}

export default function StudentMarks({ studentId, schoolId, classId }: Props) {
  const [exams, setExams] = useState<ExamResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [scoreCardExam, setScoreCardExam] = useState<ExamResult | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    fetchExams()
  }, [studentId, schoolId, classId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchExams() {
    setLoading(true)
    try {
      const res = await fetch(`/api/students/${studentId}/exams?school_id=${schoolId}&class_id=${classId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setExams(data)
      if (data.length > 0) setExpanded(data[0].exam_id)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load marks')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Preparing your released results…</span>
        <Skeleton className="h-28 rounded-[22px]" />
        <Skeleton className="h-56 rounded-[22px]" />
        {[1, 2].map(i => <Skeleton key={i} className="h-20 rounded-[14px]" />)}
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <StudentPageIntro {...PAGE_INTRO} />
        <StudentAlert onRetry={fetchExams}>We couldn’t load your released results. {error}</StudentAlert>
      </div>
    )
  }

  if (exams.length === 0) {
    return (
      <div className="space-y-6">
        <StudentPageIntro {...PAGE_INTRO} />
        <StudentEmptyState sticker="hourglass" tone="yellow" title="No released results yet" description="Your exam results will appear here after your school releases them." />
      </div>
    )
  }

  const latestExam = exams[0]
  const latestTone: Tone = latestExam.pass === true ? 'mint' : latestExam.pass === false ? 'orange' : 'paper'

  return (
    <div className="space-y-10">
      <StudentPageIntro {...PAGE_INTRO} />

      {latestExam.percentage !== null && (
        <motion.section
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="sb-card p-6 sm:p-8" data-tone={latestTone} data-testid="marks-latest" aria-labelledby="marks-latest-title"
        >
          <Sticker name={resultSticker(latestExam.percentage, latestExam.pass)} size="hero" tilt={12} className="sb-peek -top-10 right-6" />
          <div className="grid items-center gap-8 sm:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <span className="sb-kicker" data-tone="paper">Latest released result</span>
              <h2 id="marks-latest-title" className="sb-display mt-3 text-3xl sm:text-4xl">{latestExam.exam_name}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="sb-chip" data-tone="paper">{EXAM_TYPE_LABELS[latestExam.exam_type] || latestExam.exam_type}</span>
                <span className="sb-chip" data-tone="paper">{fmtDate(latestExam.exam_date)}</span>
              </div>
              <div className="mt-5 max-w-sm"><StudentProgressTrack value={latestExam.percentage} tone="yellow" label={`${latestExam.total_obtained ?? '—'} of ${latestExam.total_max} total marks`} /></div>
              <p className="sb-hand mt-4">{cheerFor(latestExam.percentage, latestExam.pass)}</p>
            </div>
            <div className="flex flex-col items-center gap-5">
              <div className="sb-score-badge">
                <span>
                  <strong><CountUpPercent value={latestExam.percentage} />%</strong>
                  <span className="mt-1 block text-xs font-extrabold">{latestExam.grade} · {latestExam.pass ? 'PASS' : 'FAIL'}</span>
                </span>
              </div>
              <button onClick={() => setScoreCardExam(latestExam)} data-testid="view-score-card" className="sb-btn" data-variant="dark">
                <Sticker name="identification-card" size="xs" />Open score card
              </button>
            </div>
          </div>
        </motion.section>
      )}

      <section className="space-y-4" aria-labelledby="marks-all-title">
        <div className="flex items-center gap-3">
          <Sticker name="notebook" size="md" tilt={-8} />
          <h2 id="marks-all-title" className="sb-display text-2xl">All released results</h2>
        </div>
        {exams.map((exam, i) => (
          <motion.div
            key={exam.exam_id}
            custom={i}
            variants={studentReveal}
            initial={reduceMotion ? false : 'hidden'}
            animate="visible"
            className="sb-index-card" data-testid={`exam-card-${exam.exam_id}`}>
            <button aria-expanded={expanded === exam.exam_id} onClick={() => setExpanded(expanded === exam.exam_id ? null : exam.exam_id)}>
              <span className="flex min-w-0 items-center gap-3">
                <span className="sb-grade-dot" data-tone={passTone(exam.pass)}>{exam.grade || '—'}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-extrabold">{exam.exam_name}</span>
                  <span className="block text-xs font-semibold text-[#6b604f]">{EXAM_TYPE_LABELS[exam.exam_type] || exam.exam_type} · {fmtDate(exam.exam_date)}</span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                {exam.percentage !== null && (
                  <span className="text-right">
                    <span className="sb-display block text-2xl">{exam.percentage}%</span>
                    <span className="sb-chip mt-1" data-tone={passTone(exam.pass)}>{exam.pass ? 'Pass' : 'Fail'}</span>
                  </span>
                )}
                <ChevronDown size={20} className={`transition-transform ${expanded === exam.exam_id ? 'rotate-180' : ''}`} aria-hidden="true" />
              </span>
            </button>

            {expanded === exam.exam_id && (
              <div className="space-y-4 border-t-[2.5px] border-[#1b1611] bg-[#faf5e8] p-4">
                <ul className="grid gap-2" aria-label={`${exam.exam_name} subjects`}>
                  {exam.subjects.map(sub => (
                    <li key={sub.subject_name} className="sb-subject-row">
                      <Sticker name={subjectSticker(sub.subject_name)} size="sm" tilt={-6} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-extrabold">{sub.subject_name}</span>
                        {sub.is_absent
                          ? <span className="sb-chip mt-1" data-tone="yellow">Absent</span>
                          : sub.percentage !== null && <span className="mt-1.5 block max-w-[220px]"><StudentProgressTrack value={sub.percentage} tone={sub.pass === false ? 'coral' : 'mint'} size="sm" /></span>}
                      </span>
                      <span className="flex items-center gap-2 text-right">
                        <span className="text-sm font-extrabold tabular-nums">{sub.is_absent ? '—' : sub.marks_obtained !== null ? `${sub.marks_obtained}/${sub.max_marks}` : '—'}</span>
                        {sub.grade && <span className="sb-chip" data-tone={passTone(sub.pass)}>{sub.grade}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                {exam.total_obtained !== null && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border-[2.5px] border-[#1b1611] bg-[#1b1611] px-4 py-3 text-white">
                    <span className="text-sm font-extrabold uppercase tracking-[.08em]">Total</span>
                    <span className="flex items-center gap-3 font-extrabold tabular-nums">
                      {exam.total_obtained}/{exam.total_max} · {exam.percentage}%
                      {exam.grade && <span className="sb-chip" data-tone={passTone(exam.pass)}>{exam.grade}</span>}
                    </span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  {exam.parent_acknowledged ? (
                    <p className="flex flex-1 items-center gap-2 text-sm font-semibold">
                      <Sticker name="check-mark-button" size="xs" />
                      <span>Seen by <strong>{exam.parent_ack_name}</strong>{exam.parent_ack_at && ` on ${new Date(exam.parent_ack_at).toLocaleDateString()}`}</span>
                    </p>
                  ) : (
                    <p className="flex flex-1 items-center gap-2 text-sm font-semibold">
                      <Sticker name="hourglass" size="xs" />
                      <span>Waiting for your parent to acknowledge this result in their portal.</span>
                    </p>
                  )}
                  <button onClick={() => setScoreCardExam(exam)} className="sb-btn" data-size="sm" data-variant="ghost">Open score card</button>
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </section>

      {scoreCardExam && <ScoreCardModal exam={scoreCardExam} onClose={() => setScoreCardExam(null)} />}
    </div>
  )
}

// ─── Score Card Modal ───────────────────────────────────────────────────────
// A dedicated, print-friendly "moment" view — distinct from the routine
// accordion above, since a released result is something a family shares/
// prints, not just a dashboard number.
function ScoreCardModal({ exam, onClose }: { exam: ExamResult; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent data-student-ui="" className="max-h-[90dvh] gap-0 overflow-y-auto bg-[#fffdf7] p-0 sm:max-w-lg" showCloseButton>
        <DialogHeader className="sb-certificate-head pr-14 text-left">
          <Sticker name={resultSticker(exam.percentage, exam.pass)} size="xl" tilt={10} className="absolute right-12 top-4 hidden sm:inline-block" />
          <span className="sb-kicker w-fit" data-tone="yellow">Released score card</span>
          <DialogTitle className="sb-display mt-3 text-3xl text-white">{exam.exam_name}</DialogTitle>
          <DialogDescription className="text-sm text-white/70">{EXAM_TYPE_LABELS[exam.exam_type] || exam.exam_type} · {fmtDate(exam.exam_date)}</DialogDescription>
          <div className="mt-5 flex flex-wrap gap-3">
            <span className="sb-note px-4 py-2" data-tone="yellow" style={{ '--tilt': '-3deg' } as React.CSSProperties}><span className="sb-display block text-3xl">{exam.percentage}%</span><span className="text-[11px] font-extrabold uppercase">Overall</span></span>
            <span className="sb-note px-4 py-2" data-tone="blue" style={{ '--tilt': '2deg' } as React.CSSProperties}><span className="sb-display block text-3xl">{exam.grade}</span><span className="text-[11px] font-extrabold uppercase">Grade</span></span>
            <span className="sb-note px-4 py-2" data-tone={passTone(exam.pass)} style={{ '--tilt': '-1.5deg' } as React.CSSProperties}><span className="sb-display block text-3xl">{exam.pass ? 'PASS' : 'FAIL'}</span><span className="text-[11px] font-extrabold uppercase">Result</span></span>
          </div>
        </DialogHeader>
        <div className="space-y-2 p-6">
          {exam.subjects.map(sub => (
            <div key={sub.subject_name} className="sb-subject-row">
              <Sticker name={subjectSticker(sub.subject_name)} size="sm" />
              <span className="truncate text-sm font-extrabold">{sub.subject_name}</span>
              <span className="flex items-center gap-2 text-sm font-extrabold tabular-nums">
                {sub.is_absent ? 'Absent' : sub.marks_obtained !== null ? `${sub.marks_obtained}/${sub.max_marks}` : '—'}
                {sub.grade && <span className="sb-chip" data-tone={passTone(sub.pass)}>{sub.grade}</span>}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-[14px] border-[2.5px] border-[#1b1611] bg-[#1b1611] px-4 py-3 font-extrabold text-white">
            <span>Total</span><span className="tabular-nums">{exam.total_obtained}/{exam.total_max} · {exam.percentage}%</span>
          </div>
          <p className="pt-3 text-center text-xs font-semibold text-[#6b604f]">Passing criteria: {exam.passing_pct}% · Released {new Date(exam.released_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <button onClick={() => window.print()} className="sb-btn mt-2 w-full" data-tone="yellow">
            <Printer size={16} aria-hidden="true" />Print or save as PDF
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
