'use client'

import { useEffect, useState } from 'react'
import { Sparkles, CalendarClock, AlertTriangle } from 'lucide-react'
import { INK, GREEN, GOLD, CORAL, PURPLE, BORDER, SURFACE } from '@/app/components/ulearn/theme'
import { UlearnCard, ProgressBar } from '@/app/components/ulearn/primitives'

type Question = {
  question: string
  options: string[]
  subject: string
  difficulty: 'easy' | 'medium' | 'hard'
}

type WeeklyTestData = {
  id: number
  week_start: string
  questions: Question[]
  max_score: number
  status: 'available' | 'submitted'
  score: number | null
  submitted_at: string | null
}

type ResultItem = {
  question: string
  subject: string
  student_answer: string
  correct_answer: string
  is_correct: boolean
}

type Props = {
  student: { id: number; name: string; grade: string; section: string }
  classId: number
  schoolId: number
}

const DIFF_STYLE: Record<string, { bg: string; fg: string }> = {
  easy:   { bg: '#E1F5EE', fg: '#085041' },
  medium: { bg: '#FCEBDB', fg: '#8A4B12' },
  hard:   { bg: '#FBE7E1', fg: '#8A2F12' },
}

export default function WeeklyTest({ student, classId, schoolId }: Props) {
  const [test, setTest] = useState<WeeklyTestData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [results, setResults] = useState<ResultItem[] | null>(null)
  const [finalScore, setFinalScore] = useState<{ score: number; max: number } | null>(null)
  const [diagnosis, setDiagnosis] = useState('')
  const [diagnosisLoading, setDiagnosisLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/weekly-test?student_id=${student.id}&school_id=${schoolId}&class_id=${classId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        setTest(data)
        if (data.status === 'submitted') setFinalScore({ score: data.score, max: data.max_score })
      })
      .catch(() => setError('Failed to load test'))
      .finally(() => setLoading(false))
  }, [student.id, schoolId, classId])

  async function handleSubmit() {
    if (!test) return
    const unanswered = test.questions.findIndex((_, i) => !answers[i])
    if (unanswered !== -1) {
      alert(`Please answer question ${unanswered + 1} before submitting.`)
      return
    }
    setSubmitting(true)
    try {
      const submitted_answers = test.questions.map((_, i) => answers[i] ?? '')
      const res = await fetch('/api/weekly-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test_id: test.id, student_id: student.id, submitted_answers }),
      })
      const data = await res.json()
      if (data.error) { alert(data.error); return }
      setResults(data.results)
      setFinalScore({ score: data.score, max: data.max_score })
      setTest(prev => prev ? { ...prev, status: 'submitted' } : prev)

      // Fire AI diagnosis after submit (non-blocking)
      const wrongQs = (data.results as ResultItem[])
        .filter(r => !r.is_correct)
        .map(r => ({ question: r.question, subject: r.subject, correct: r.correct_answer, chosen: r.student_answer }))
      setDiagnosisLoading(true)
      fetch('/api/ai/test-diagnosis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade: student.grade, score: data.score, max_score: data.max_score, wrong_questions: wrongQs }),
      })
        .then(r => r.json())
        .then(d => { if (d.diagnosis) setDiagnosis(d.diagnosis) })
        .catch(() => {})
        .finally(() => setDiagnosisLoading(false))
    } catch {
      alert('Submit failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 rounded-xl w-48" style={{ background: BORDER }} />
      {[1, 2, 3].map(i => <div key={i} className="h-28 rounded-2xl" style={{ background: BORDER }} />)}
    </div>
  )

  if (error) {
    // No test yet — show a friendly "coming on Sunday" card
    const today = new Date().getDay()   // 0=Sun 1=Mon … 6=Sat
    const daysToSunday = today === 0 ? 7 : 7 - today
    const isSunday = today === 0

    return (
      <div className="space-y-4">
        <UlearnCard className="p-6 text-center" borderColor={BORDER}>
          <CalendarClock size={28} className="mx-auto mb-3" style={{ color: GOLD }} />
          {isSunday ? (
            <>
              <p className="font-semibold text-sm" style={{ color: INK }}>Your test is being prepared…</p>
              <p className="text-xs text-gray-500 mt-1">It will be ready shortly — check back in a few minutes.</p>
            </>
          ) : (
            <>
              <p className="font-semibold text-sm" style={{ color: INK }}>Next Weekly Test: Sunday</p>
              <p className="text-xs text-gray-500 mt-1">
                {daysToSunday === 1 ? 'Tomorrow!' : `In ${daysToSunday} days`} · Tests are auto-generated every Sunday based on this week&apos;s topics
              </p>
            </>
          )}
        </UlearnCard>
        {error.includes('syllabus') && (
          <div className="rounded-xl p-4 text-center text-xs" style={{ background: '#FCEBDB', color: '#8A4B12' }}>
            Your teacher hasn&apos;t marked any topics as covered yet. Tests generate once syllabus topics are covered.
          </div>
        )}
      </div>
    )
  }

  if (!test) return null

  const weekLabel = new Date(test.week_start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  const pct = finalScore ? Math.round((finalScore.score / finalScore.max) * 100) : 0

  // ── Submitted view ────────────────────────────────────────────────────────
  if (test.status === 'submitted') {
    const scoreColor = pct >= 80 ? GREEN : pct >= 50 ? GOLD : CORAL
    const scoreBg = pct >= 80 ? '#E1F5EE' : pct >= 50 ? '#FCEBDB' : '#FBE7E1'

    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: INK }}>Weekly Test</h2>
          <p className="text-sm text-gray-500">Week of {weekLabel}</p>
        </div>

        <div className="rounded-2xl p-6 text-center" style={{ background: scoreBg, border: `1px solid ${BORDER}` }}>
          <p className="text-xs font-medium uppercase tracking-wide mb-1 text-gray-500">Your Score</p>
          <p className="text-5xl font-black" style={{ color: scoreColor }}>
            {finalScore?.score}<span className="text-2xl text-gray-400">/{finalScore?.max}</span>
          </p>
          <p className="text-lg font-bold mt-1" style={{ color: scoreColor }}>{pct}%</p>
          <p className="text-sm text-gray-500 mt-2">
            {pct >= 80 ? 'Excellent! Keep it up!' : pct >= 50 ? 'Good effort. Review the wrong ones.' : 'Review your syllabus and try next week!'}
          </p>
        </div>

        {/* AI Diagnosis */}
        {(diagnosisLoading || diagnosis) && (
          <UlearnCard className="p-4" borderColor="#D6D2F0">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={15} style={{ color: PURPLE }} />
              <p className="text-sm font-bold" style={{ color: PURPLE }}>AI Tutor&apos;s Personal Feedback</p>
            </div>
            {diagnosisLoading ? (
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: PURPLE, animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
                <p className="text-xs" style={{ color: PURPLE }}>Analysing your test...</p>
              </div>
            ) : (
              <p className="text-sm leading-relaxed" style={{ color: INK }}>{diagnosis}</p>
            )}
          </UlearnCard>
        )}

        {results && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold" style={{ color: INK }}>Question Review</h3>
            {results.map((r, i) => (
              <div
                key={i}
                className="rounded-xl border p-4"
                style={{ background: r.is_correct ? '#E1F5EE' : '#FBE7E1', borderColor: r.is_correct ? '#B9E3D2' : '#F0C7B7' }}
              >
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-sm mt-0.5" style={{ color: r.is_correct ? GREEN : CORAL }}>
                    {r.is_correct ? '✓' : '✗'}
                  </span>
                  <p className="text-sm font-medium" style={{ color: INK }}>{r.question}</p>
                </div>
                {!r.is_correct && (
                  <div className="ml-5 space-y-1 text-xs">
                    <p style={{ color: CORAL }}>Your answer: {r.student_answer}</p>
                    <p className="font-medium" style={{ color: '#085041' }}>Correct: {r.correct_answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Test-taking view ──────────────────────────────────────────────────────
  const answered = Object.keys(answers).length
  const total = test.questions.length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: INK }}>Weekly Test</h2>
          <p className="text-sm text-gray-500">Week of {weekLabel} · {total} questions</p>
        </div>
        <span className="text-xs font-medium px-3 py-1.5 rounded-full" style={{ background: SURFACE, color: INK, border: `1px solid ${BORDER}` }}>
          {answered}/{total} answered
        </span>
      </div>

      <ProgressBar pct={total > 0 ? (answered / total) * 100 : 0} color={GREEN} className="w-full" />

      <div className="space-y-4">
        {test.questions.map((q, i) => {
          const diff = DIFF_STYLE[q.difficulty] ?? { bg: SURFACE, fg: '#6b7280' }
          return (
            <UlearnCard key={i} className="p-5" borderColor={BORDER}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-3">
                  <span
                    className="w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: '#E1F5EE', color: '#085041' }}
                  >
                    {i + 1}
                  </span>
                  <p className="text-sm font-medium" style={{ color: INK }}>{q.question}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-xs text-gray-400 font-medium">{q.subject}</span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: diff.bg, color: diff.fg }}>
                    {q.difficulty}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 ml-9">
                {q.options.map((opt, j) => {
                  const picked = answers[i] === opt
                  return (
                    <button
                      key={j}
                      data-testid={`weekly-test-option-${i}-${j}`}
                      onClick={() => setAnswers(prev => ({ ...prev, [i]: opt }))}
                      className="text-left text-sm px-4 py-2.5 rounded-xl border transition-all"
                      style={{
                        background: picked ? GREEN : SURFACE,
                        borderColor: picked ? GREEN : BORDER,
                        color: picked ? 'white' : INK,
                        fontWeight: picked ? 500 : 400,
                      }}
                    >
                      {opt}
                    </button>
                  )
                })}
              </div>
            </UlearnCard>
          )
        })}
      </div>

      {test.questions.length === 0 && (
        <UlearnCard className="p-6 text-center text-sm text-gray-400 flex flex-col items-center gap-2" borderColor={BORDER}>
          <AlertTriangle size={20} style={{ color: GOLD }} />
          No questions in this test yet.
        </UlearnCard>
      )}

      <button
        data-testid="weekly-test-submit-btn"
        onClick={handleSubmit}
        disabled={submitting || answered < total}
        className="w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed text-white"
        style={{ background: GREEN }}
      >
        {submitting ? 'Submitting…' : answered < total ? `Answer all ${total} questions to submit` : 'Submit Test'}
      </button>
    </div>
  )
}
