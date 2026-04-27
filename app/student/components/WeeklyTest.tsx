'use client'

import { useEffect, useState } from 'react'

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

const DIFF_COLOR: Record<string, string> = {
  easy:   'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  hard:   'bg-red-100 text-red-700',
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
      <div className="h-8 bg-gray-100 rounded-xl w-48" />
      {[1,2,3].map(i => <div key={i} className="h-28 bg-gray-100 rounded-2xl" />)}
    </div>
  )

  if (error) {
    // No test yet — show a friendly "coming on Sunday" card
    const today = new Date().getDay()   // 0=Sun 1=Mon … 6=Sat
    const daysToSunday = today === 0 ? 7 : 7 - today
    const isSunday = today === 0

    return (
      <div className="space-y-4">
        <div className="bg-violet-50 border border-violet-200 rounded-2xl p-6 text-center">
          <div className="text-3xl mb-3">📅</div>
          {isSunday ? (
            <>
              <p className="text-violet-800 font-semibold text-sm">Your test is being prepared…</p>
              <p className="text-violet-600 text-xs mt-1">It will be ready shortly — check back in a few minutes.</p>
            </>
          ) : (
            <>
              <p className="text-violet-800 font-semibold text-sm">Next Weekly Test: Sunday</p>
              <p className="text-violet-600 text-xs mt-1">
                {daysToSunday === 1 ? 'Tomorrow!' : `In ${daysToSunday} days`} · Tests are auto-generated every Sunday based on this week&apos;s topics
              </p>
            </>
          )}
        </div>
        {error.includes('syllabus') && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
            <p className="text-yellow-700 text-xs">Your teacher hasn&apos;t marked any topics as covered yet. Tests generate once syllabus topics are covered.</p>
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
    const scoreColor = pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-600'
    const scoreBg    = pct >= 80 ? 'bg-green-50 border-green-200' : pct >= 50 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'

    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Weekly Test</h2>
          <p className="text-sm text-gray-500">Week of {weekLabel}</p>
        </div>

        <div className={`rounded-2xl border p-6 text-center ${scoreBg}`}>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Your Score</p>
          <p className={`text-5xl font-black ${scoreColor}`}>{finalScore?.score}<span className="text-2xl text-gray-400">/{finalScore?.max}</span></p>
          <p className={`text-lg font-bold mt-1 ${scoreColor}`}>{pct}%</p>
          <p className="text-sm text-gray-500 mt-2">
            {pct >= 80 ? '🌟 Excellent! Keep it up!' : pct >= 50 ? '👍 Good effort. Review the wrong ones.' : '📖 Review your syllabus and try next week!'}
          </p>
        </div>

        {/* AI Diagnosis */}
        {(diagnosisLoading || diagnosis) && (
          <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">✨</span>
              <p className="text-sm font-bold text-violet-800">AI Tutor's Personal Feedback</p>
            </div>
            {diagnosisLoading ? (
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />
                  ))}
                </div>
                <p className="text-xs text-violet-600">Analysing your test...</p>
              </div>
            ) : (
              <p className="text-sm text-violet-800 leading-relaxed">{diagnosis}</p>
            )}
          </div>
        )}

        {results && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Question Review</h3>
            {results.map((r, i) => (
              <div key={i} className={`rounded-xl border p-4 ${r.is_correct ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-start gap-2 mb-2">
                  <span className={`text-sm mt-0.5 ${r.is_correct ? 'text-green-600' : 'text-red-600'}`}>
                    {r.is_correct ? '✓' : '✗'}
                  </span>
                  <p className="text-sm font-medium text-gray-800">{r.question}</p>
                </div>
                {!r.is_correct && (
                  <div className="ml-5 space-y-1 text-xs">
                    <p className="text-red-600">Your answer: {r.student_answer}</p>
                    <p className="text-green-700 font-medium">Correct: {r.correct_answer}</p>
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
          <h2 className="text-lg font-bold text-gray-900">Weekly Test</h2>
          <p className="text-sm text-gray-500">Week of {weekLabel} · {total} questions</p>
        </div>
        <span className="text-xs font-medium text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full">
          {answered}/{total} answered
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-100 rounded-full h-1.5">
        <div
          className="bg-blue-500 h-1.5 rounded-full transition-all"
          style={{ width: `${(answered / total) * 100}%` }}
        />
      </div>

      <div className="space-y-4">
        {test.questions.map((q, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <p className="text-sm font-medium text-gray-800">{q.question}</p>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className="text-xs text-gray-400 font-medium">{q.subject}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${DIFF_COLOR[q.difficulty] ?? 'bg-gray-100 text-gray-600'}`}>
                  {q.difficulty}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 ml-9">
              {q.options.map((opt, j) => (
                <button
                  key={j}
                  onClick={() => setAnswers(prev => ({ ...prev, [i]: opt }))}
                  className={`text-left text-sm px-4 py-2.5 rounded-xl border transition-all ${
                    answers[i] === opt
                      ? 'bg-blue-600 border-blue-600 text-white font-medium'
                      : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-blue-50 hover:border-blue-300'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting || answered < total}
        className="w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-700 text-white"
      >
        {submitting ? 'Submitting…' : answered < total ? `Answer all ${total} questions to submit` : 'Submit Test'}
      </button>
    </div>
  )
}
