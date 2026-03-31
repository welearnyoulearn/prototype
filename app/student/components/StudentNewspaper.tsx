'use client'

import { useEffect, useState, useMemo } from 'react'

type Newspaper = {
  id: number
  date: string
  title: string
  subtitle: string | null
  content: string
  fun_fact: string | null
  quiz_question: string | null
  quiz_answer: string | null
  quiz_options: string[]
  topic: string | null
  category: string | null
  has_read: boolean
}

type QuizState = 'idle' | 'answered_correct' | 'answered_wrong' | 'skipped'

type Props = {
  studentId: number
  schoolId: number
}

export default function StudentNewspaper({ studentId, schoolId }: Props) {
  const [paper, setPaper] = useState<Newspaper | null>(null)
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)
  const [quizState, setQuizState] = useState<QuizState>('idle')
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [showQuizModal, setShowQuizModal] = useState(false)
  const [pointsEarned, setPointsEarned] = useState<number | null>(null)
  const [showPointsToast, setShowPointsToast] = useState(false)

  useEffect(() => {
    fetch(`/api/newspapers/today?school_id=${schoolId}&student_id=${studentId}`)
      .then(r => r.json())
      .then(data => {
        setPaper(data)
        setLoading(false)
        if (data.has_read) setQuizState('skipped')
      })
      .catch(() => setLoading(false))
  }, [schoolId, studentId])

  // Shuffle quiz options once when paper loads, keeping index 0 as correct
  const shuffledOptions = useMemo(() => {
    if (!paper?.quiz_options?.length) return []
    const opts = [...paper.quiz_options]
    // Fisher-Yates shuffle
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[opts[i], opts[j]] = [opts[j], opts[i]]
    }
    return opts
  }, [paper?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submitAnswer(chosen: string, result: 'correct' | 'wrong' | 'skipped') {
    if (!paper || paper.has_read || marking) return
    setSelectedOption(chosen)
    setQuizState(result === 'correct' ? 'answered_correct' : result === 'wrong' ? 'answered_wrong' : 'skipped')
    setShowQuizModal(false)
    setMarking(true)
    try {
      const res = await fetch(`/api/newspapers/${paper.id}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, student_id: studentId, quiz_result: result }),
      })
      const data = await res.json()
      if (res.ok && !data.already_read) {
        setPointsEarned(data.points_awarded)
        setShowPointsToast(true)
        setPaper(p => p ? { ...p, has_read: true } : p)
        setTimeout(() => setShowPointsToast(false), 4000)
      }
    } finally {
      setMarking(false)
    }
  }

  function skipQuiz() {
    submitAnswer('', 'skipped')
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 animate-pulse">
        <div className="h-16 bg-amber-100 rounded" />
        <div className="h-64 bg-amber-50 rounded" />
        <div className="h-32 bg-amber-50 rounded" />
      </div>
    )
  }

  if (!paper) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p className="text-4xl mb-3">📰</p>
        <p>Could not load today&apos;s newspaper. Try again later.</p>
      </div>
    )
  }

  const formattedDate = new Date(paper.date).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="max-w-3xl mx-auto" style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}>

      {/* Points Toast */}
      {showPointsToast && pointsEarned !== null && (
        <div
          className="fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border-2 animate-bounce"
          style={{
            background: pointsEarned >= 3 ? '#14532d' : pointsEarned >= 1 ? '#1e3a5f' : '#7f1d1d',
            borderColor: pointsEarned >= 3 ? '#16a34a' : pointsEarned >= 1 ? '#3b82f6' : '#ef4444',
            color: 'white',
          }}
        >
          <span className="text-2xl">{pointsEarned >= 3 ? '🎉' : pointsEarned >= 1 ? '📰' : '😬'}</span>
          <div>
            <p className="font-bold text-sm">
              {pointsEarned > 0 ? `+${pointsEarned} points earned!` : 'No points this time'}
            </p>
            <p className="text-xs opacity-80">
              {pointsEarned >= 3 ? 'Correct answer bonus!' : pointsEarned === 1 ? 'Keep reading daily!' : 'Better luck tomorrow!'}
            </p>
          </div>
        </div>
      )}

      {/* MCQ Quiz Modal */}
      {showQuizModal && paper.quiz_question && shuffledOptions.length > 0 && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div
            className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border-4"
            style={{ borderColor: '#8B6914', background: '#fdf6e3' }}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 text-center border-b-4" style={{ borderColor: '#8B6914', background: '#2c1810' }}>
              <p className="text-xs tracking-widest uppercase mb-1" style={{ color: '#d4a017' }}>Quick Knowledge Check</p>
              <p className="text-lg font-bold" style={{ color: '#fdf6e3' }}>Today&apos;s Quiz</p>
            </div>

            <div className="p-6 space-y-4">
              {/* Question */}
              <p className="text-base font-semibold text-center leading-snug" style={{ color: '#2c1810' }}>
                {paper.quiz_question}
              </p>

              {/* Options */}
              <div className="space-y-2.5">
                {shuffledOptions.map((opt, idx) => {
                  const labels = ['A', 'B', 'C', 'D']
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        const isCorrect = opt === paper.quiz_options[0]
                        submitAnswer(opt, isCorrect ? 'correct' : 'wrong')
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
                      style={{
                        borderColor: '#8B6914',
                        background: '#fff9ec',
                        color: '#2c1810',
                      }}
                    >
                      <span
                        className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                        style={{ background: '#8B6914', color: '#fdf6e3' }}
                      >
                        {labels[idx]}
                      </span>
                      <span className="text-sm">{opt}</span>
                    </button>
                  )
                })}
              </div>

              {/* Points info */}
              <div
                className="text-center text-xs py-2 px-4 rounded-lg"
                style={{ background: '#f5ecd7', color: '#6b4c11' }}
              >
                ✓ Correct = +3 pts &nbsp;·&nbsp; ✗ Wrong = 0 pts &nbsp;·&nbsp; Base reading = +1 pt always
              </div>

              {/* Skip */}
              <button
                onClick={skipQuiz}
                className="w-full text-center text-xs py-2 underline"
                style={{ color: '#9a7240' }}
              >
                Skip quiz (earn only base reading point)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ NEWSPAPER ═══════════════ */}
      <div
        className="rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: '#fdf6e3',
          border: '3px solid #8B6914',
          boxShadow: '0 8px 32px rgba(139,105,20,0.25), inset 0 0 60px rgba(139,105,20,0.05)',
        }}
      >
        {/* ── MASTHEAD ── */}
        <div
          className="px-6 pt-5 pb-3 text-center"
          style={{ background: '#2c1810', borderBottom: '4px double #d4a017' }}
        >
          <p className="text-xs tracking-[0.35em] uppercase mb-1" style={{ color: '#d4a017' }}>
            Est. For Curious Minds
          </p>
          <h1
            className="text-4xl font-black tracking-tight leading-none"
            style={{
              color: '#fdf6e3',
              textShadow: '2px 2px 0 #8B6914',
              letterSpacing: '-0.02em',
              fontFamily: "'Georgia', serif",
            }}
          >
            THE DAILY KNOWLEDGE
          </h1>
          <div className="flex items-center justify-center gap-4 mt-2">
            <div className="flex-1 border-t" style={{ borderColor: '#d4a017' }} />
            <p className="text-xs" style={{ color: '#d4a017', letterSpacing: '0.15em' }}>
              {formattedDate.toUpperCase()}
            </p>
            <div className="flex-1 border-t" style={{ borderColor: '#d4a017' }} />
          </div>
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs" style={{ color: '#9a7240' }}>
              {paper.category || 'General Knowledge'}
            </p>
            <p className="text-xs" style={{ color: '#9a7240' }}>
              {paper.has_read ? '✓ READ' : 'UNREAD'}
            </p>
          </div>
        </div>

        {/* ── BREAKING NEWS HEADLINE ── */}
        <div
          className="px-6 py-4 text-center"
          style={{ background: '#1a0a05', borderBottom: '3px solid #d4a017' }}
        >
          <p
            className="text-xs font-bold tracking-[0.4em] uppercase mb-2"
            style={{ color: '#ef4444' }}
          >
            ◆ Breaking Knowledge ◆
          </p>
          <h2
            className="text-2xl font-black leading-tight"
            style={{ color: '#fdf6e3', fontFamily: "'Georgia', serif" }}
          >
            {paper.title}
          </h2>
          {paper.subtitle && (
            <p className="text-sm mt-2 italic" style={{ color: '#d4a017' }}>
              {paper.subtitle}
            </p>
          )}
        </div>

        {/* ── MAIN CONTENT ── */}
        <div className="px-6 py-5" style={{ borderBottom: '2px solid #c9a84c' }}>
          {/* Decorative rule */}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 border-t-2" style={{ borderColor: '#8B6914' }} />
            <span className="text-xs" style={{ color: '#8B6914' }}>◆</span>
            <div className="flex-1 border-t-2" style={{ borderColor: '#8B6914' }} />
          </div>

          {/* Two-column layout on wider screens */}
          <div className="sm:columns-2 gap-6 text-sm leading-relaxed" style={{ color: '#2c1810' }}>
            {paper.content.split('\n').filter(p => p.trim()).map((para, i) => (
              <p key={i} className={`mb-3 text-justify ${i === 0 ? 'first-letter:text-5xl first-letter:font-black first-letter:float-left first-letter:leading-none first-letter:mr-1 first-letter:mt-1' : ''}`}
                style={i === 0 ? { color: '#1a0a05' } : {}}>
                {para}
              </p>
            ))}
          </div>

          <div className="flex items-center gap-2 mt-4">
            <div className="flex-1 border-t-2" style={{ borderColor: '#8B6914' }} />
            <span className="text-xs" style={{ color: '#8B6914' }}>◆</span>
            <div className="flex-1 border-t-2" style={{ borderColor: '#8B6914' }} />
          </div>
        </div>

        {/* ── FUN FACT + QUIZ side by side ── */}
        <div
          className="grid grid-cols-1 sm:grid-cols-2"
          style={{ borderBottom: '2px solid #c9a84c' }}
        >
          {/* Fun Fact */}
          {paper.fun_fact && (
            <div
              className="p-5"
              style={{
                background: '#f5ecd7',
                borderRight: '1px solid #c9a84c',
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">💡</span>
                <p
                  className="text-xs font-bold tracking-widest uppercase"
                  style={{ color: '#8B6914' }}
                >
                  Did You Know?
                </p>
              </div>
              <div
                className="border-l-4 pl-3 italic text-sm leading-relaxed"
                style={{ borderColor: '#d4a017', color: '#3d2b1f' }}
              >
                {paper.fun_fact}
              </div>
            </div>
          )}

          {/* Quiz Box */}
          {paper.quiz_question && (
            <div
              className="p-5"
              style={{ background: '#2c1810' }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🎯</span>
                <p
                  className="text-xs font-bold tracking-widest uppercase"
                  style={{ color: '#d4a017' }}
                >
                  Quiz Time
                </p>
              </div>
              <p className="text-sm font-medium leading-snug mb-4" style={{ color: '#fdf6e3' }}>
                {paper.quiz_question}
              </p>

              {quizState === 'idle' && !paper.has_read ? (
                <button
                  onClick={() => setShowQuizModal(true)}
                  className="w-full py-2.5 rounded-lg font-bold text-sm transition-all hover:brightness-110 active:scale-95"
                  style={{ background: '#d4a017', color: '#1a0a05' }}
                >
                  Answer Now →
                </button>
              ) : quizState === 'answered_correct' ? (
                <div
                  className="rounded-lg px-4 py-3 text-center"
                  style={{ background: '#14532d', border: '1px solid #16a34a' }}
                >
                  <p className="text-xs font-bold mb-1" style={{ color: '#86efac' }}>✓ Correct! +2 bonus pts</p>
                  <p className="text-xs" style={{ color: '#bbf7d0' }}>Answer: {paper.quiz_answer}</p>
                </div>
              ) : quizState === 'answered_wrong' ? (
                <div
                  className="rounded-lg px-4 py-3 text-center"
                  style={{ background: '#7f1d1d', border: '1px solid #ef4444' }}
                >
                  <p className="text-xs font-bold mb-1" style={{ color: '#fca5a5' }}>✗ Wrong answer</p>
                  <p className="text-xs" style={{ color: '#fecaca' }}>Answer: {paper.quiz_answer}</p>
                  {selectedOption && (
                    <p className="text-xs mt-1" style={{ color: '#fca5a5' }}>You chose: {selectedOption}</p>
                  )}
                </div>
              ) : (
                <div
                  className="rounded-lg px-4 py-3 text-center"
                  style={{ background: '#1c1917', border: '1px solid #78716c' }}
                >
                  <p className="text-xs" style={{ color: '#d6d3d1' }}>Answer: {paper.quiz_answer}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── FOOTER: Mark as Read ── */}
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ background: '#f5ecd7' }}
        >
          <div className="text-xs" style={{ color: '#9a7240' }}>
            <span className="font-semibold">Topic:</span> {paper.topic || 'General'} &nbsp;·&nbsp;
            <span className="font-semibold">Category:</span> {paper.category || '—'}
          </div>

          {!paper.has_read ? (
            <button
              onClick={() => {
                if (paper.quiz_question && quizState === 'idle') {
                  setShowQuizModal(true)
                } else {
                  skipQuiz()
                }
              }}
              disabled={marking}
              className="px-5 py-2 rounded-lg text-sm font-bold transition-all hover:brightness-110 active:scale-95 disabled:opacity-50"
              style={{ background: '#2c1810', color: '#d4a017', border: '2px solid #8B6914' }}
            >
              {marking ? 'Saving...' : paper.quiz_question && quizState === 'idle' ? 'Take Quiz & Read (+1~3 pts)' : 'Mark as Read (+1 pt)'}
            </button>
          ) : (
            <div
              className="px-5 py-2 rounded-lg text-sm font-bold"
              style={{ background: '#14532d', color: '#86efac', border: '2px solid #16a34a' }}
            >
              ✓ Read Today
            </div>
          )}
        </div>

        {/* ── BOTTOM RULE ── */}
        <div
          className="h-3"
          style={{
            background: 'repeating-linear-gradient(90deg, #2c1810 0px, #2c1810 10px, #d4a017 10px, #d4a017 12px)',
          }}
        />
      </div>
    </div>
  )
}
