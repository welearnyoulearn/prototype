'use client'

import { useEffect, useRef, useState } from 'react'
import ChessGame from './hub/ChessGame'
import SudokuGame from './hub/SudokuGame'

// ── Types ─────────────────────────────────────────────────────────────────────
type GKQuestion      = { q: string; options: string[]; answer: number }
type WordOfDay       = { word: string; pronunciation: string; meaning: string; example: string }
type Riddle          = { riddle: string; answer: string; hint: string }
type FactMythItem    = { statement: string; answer: boolean; explanation: string }
type DebateStatement = { statement: string; context: string }
type Challenge        = { problem: string; answer: string; explanation: string }
type ReadingPassage   = { passage: string; questions: { q: string; options: string[]; answer: number }[] }
type WritingPrompt    = { prompt: string; theme: string }
type SpeakingSentence = { sentence: string; topic: string }
type Completions      = Record<string, { done: boolean; points: number }>

type HubContent = {
  gk_questions: GKQuestion[] | null
  word_of_day: WordOfDay | null
  riddle: Riddle | null
  fact_myth_questions: FactMythItem[] | null
  debate_statement: DebateStatement | null
  challenge_problem: Challenge | null
  reading_passage: ReadingPassage | null
  writing_prompt: WritingPrompt | null
  speaking_sentences: SpeakingSentence[] | null
  completions: Completions
}

type Problem = { a: number; b: number; op: '+' | '-' | '×'; answer: number }

type Activity =
  | 'gk_quiz' | 'word_of_day' | 'mental_math' | 'typing_test'
  | 'riddle' | 'fact_myth' | 'debate' | 'challenge'
  | 'chess' | 'sudoku' | 'speaking' | 'reading' | 'writing'
  | null

// ── Constants ─────────────────────────────────────────────────────────────────
const LOW_GRADE_META: Record<string, { emoji: string; title: string; desc: string; pts: string; color: string }> = {
  gk_quiz:    { emoji: '🌍', title: 'Daily GK Quiz',       desc: '5 general knowledge questions',  pts: 'Up to 10 pts',  color: 'blue'   },
  word_of_day:{ emoji: '📖', title: 'Word of the Day',     desc: 'Learn a new English word',        pts: '3 pts',         color: 'purple' },
  mental_math:{ emoji: '🧮', title: 'Mental Math',         desc: '10 problems in 60 seconds',       pts: 'Up to 5 pts',   color: 'orange' },
  typing_test:{ emoji: '⌨️', title: 'Typing Speed Test',  desc: 'Type a paragraph, see your WPM',  pts: '2 pts',         color: 'green'  },
  chess:      { emoji: '♟',  title: 'Chess vs AI',         desc: 'Play a game against the AI',      pts: 'No pts — fun!', color: 'slate'  },
  sudoku:     { emoji: '🔢', title: 'Sudoku',              desc: 'Fill the 9×9 grid correctly',     pts: '5 pts',         color: 'violet' },
}

const HIGH_GRADE_META: Record<string, { emoji: string; title: string; desc: string; pts: string; color: string }> = {
  gk_quiz:  { emoji: '🌍', title: 'Daily GK Quiz',          desc: '5 questions, mix of topics',             pts: 'Up to 10 pts',  color: 'blue'   },
  riddle:   { emoji: '🧩', title: 'Riddle of the Day',      desc: 'Crack the daily brain teaser',           pts: '5 pts',         color: 'indigo' },
  fact_myth:{ emoji: '⚡', title: 'Fact or Myth?',          desc: '10 statements — True or False?',         pts: 'Up to 20 pts',  color: 'amber'  },
  debate:   { emoji: '💬', title: 'Debate of the Day',      desc: 'State your argument — AI scores it',     pts: 'Up to 10 pts',  color: 'rose'   },
  challenge:{ emoji: '🎯', title: 'Daily Challenge',        desc: 'One tough problem to crack',              pts: '10 pts',        color: 'teal'   },
  chess:    { emoji: '♟',  title: 'Chess vs AI',            desc: 'Play a game against the computer',        pts: 'No pts — fun!', color: 'slate'  },
  sudoku:   { emoji: '🔢', title: 'Sudoku',                 desc: 'Fill the 9×9 grid correctly',             pts: '5 pts',         color: 'violet' },
  speaking: { emoji: '🎤', title: 'English Speaking',       desc: 'Read a sentence aloud, type it back',     pts: 'Up to 10 pts',  color: 'pink'   },
  reading:  { emoji: '📚', title: 'Reading Comprehension',  desc: 'Read a passage, answer 5 questions',      pts: 'Up to 5 pts',   color: 'cyan'   },
  writing:  { emoji: '✍️', title: 'Creative Writing',      desc: 'Write a response to the daily prompt',    pts: 'Up to 8 pts',   color: 'lime'   },
}

const CARD_STYLE: Record<string, string> = {
  blue:  'bg-blue-50   border-blue-200   text-blue-800',
  purple:'bg-purple-50 border-purple-200 text-purple-800',
  orange:'bg-orange-50 border-orange-200 text-orange-800',
  green: 'bg-green-50  border-green-200  text-green-800',
  indigo:'bg-indigo-50 border-indigo-200 text-indigo-800',
  amber: 'bg-amber-50  border-amber-200  text-amber-800',
  rose:  'bg-rose-50   border-rose-200   text-rose-800',
  teal:  'bg-teal-50   border-teal-200   text-teal-800',
  slate: 'bg-slate-50  border-slate-200  text-slate-800',
  violet:'bg-violet-50 border-violet-200 text-violet-800',
  pink:  'bg-pink-50   border-pink-200   text-pink-800',
  cyan:  'bg-cyan-50   border-cyan-200   text-cyan-800',
  lime:  'bg-lime-50   border-lime-200   text-lime-800',
}
const ICON_BG: Record<string, string> = {
  blue:'bg-blue-100', purple:'bg-purple-100', orange:'bg-orange-100', green:'bg-green-100',
  indigo:'bg-indigo-100', amber:'bg-amber-100', rose:'bg-rose-100', teal:'bg-teal-100',
  slate:'bg-slate-100', violet:'bg-violet-100', pink:'bg-pink-100', cyan:'bg-cyan-100', lime:'bg-lime-100',
}

const TYPING_PASSAGES = [
  'The sun rises in the east and sets in the west. Every morning it brings new hope and energy for the day. Students who wake up early can enjoy the fresh air and quiet time to read or exercise before school begins.',
  'Reading books is one of the best habits a student can develop. Books open up new worlds, teach us about history and science, and improve our language skills. A good reader becomes a good thinker and writer over time.',
  'Science helps us understand the world around us. From the smallest atom to the largest galaxy, scientific discoveries have changed how we live. Every question we ask and every experiment we try brings us closer to the truth.',
  'Teamwork makes every task easier and more enjoyable. When students work together they share ideas and help each other understand difficult topics. A team that communicates well can achieve far more than any individual working alone.',
  'Mathematics is the language of the universe. Numbers and equations describe everything from the motion of planets to the design of buildings. Students who practise daily find that maths becomes easier and even enjoyable over time.',
  'Our environment is precious and must be protected. Planting trees, saving water, and reducing waste are simple actions every student can take. Small steps taken by many people can bring about a big positive change for our planet.',
  'The computer is one of the greatest inventions of modern times. It has transformed how we learn, communicate, and work. Learning to use technology wisely helps students prepare for the challenges and opportunities of the future.',
  'Physical exercise is important for both body and mind. Sports teach us discipline, teamwork, and how to handle both victory and defeat. Students who exercise regularly find it easier to concentrate and perform well in class.',
]

function getDayPassage() { return TYPING_PASSAGES[Math.floor(Date.now() / 86400000) % TYPING_PASSAGES.length] }

function generateProblems(): Problem[] {
  const ops: Array<'+' | '-' | '×'> = ['+', '-', '×', '+', '-', '+', '×', '-', '+', '×']
  return ops.map(op => {
    if (op === '+') { const a = Math.floor(Math.random()*50)+10, b = Math.floor(Math.random()*50)+10; return { a, b, op, answer: a+b } }
    if (op === '-') { const a = Math.floor(Math.random()*50)+30, b = Math.floor(Math.random()*30)+1;  return { a, b, op, answer: a-b } }
    const a = Math.floor(Math.random()*11)+2, b = Math.floor(Math.random()*11)+2; return { a, b, op, answer: a*b }
  })
}

function checkChallengeAnswer(input: string, correct: string): boolean {
  if (input.trim().toLowerCase() === correct.trim().toLowerCase()) return true
  const uNum = parseFloat(input.replace(/[^\d.-]/g, ''))
  const cNum = parseFloat(correct.replace(/[^\d.-]/g, ''))
  if (!isNaN(uNum) && !isNaN(cNum)) return Math.abs(uNum - cNum) <= 0.1
  return false
}

function checkRiddleAnswer(input: string, correct: string): boolean {
  const u = input.trim().toLowerCase()
  const c = correct.trim().toLowerCase()
  return u === c || u.includes(c) || c.includes(u)
}

// ── Back button shared ────────────────────────────────────────────────────────
function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-5">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
      Back to Hub
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function StudentHub({ studentId, schoolId, grade }: { studentId: number; schoolId: number; grade: string }) {
  const isHighGrade = parseInt(grade) >= 6

  const [content, setContent]   = useState<HubContent | null>(null)
  const [loading, setLoading]   = useState(true)
  const [activity, setActivity] = useState<Activity>(null)

  // GK Quiz
  const [gkAnswers, setGkAnswers]     = useState<(number|null)[]>(Array(5).fill(null))
  const [gkSubmitted, setGkSubmitted] = useState(false)
  const [gkScore, setGkScore]         = useState(0)

  // Word of Day (low grade)
  const [wordDone, setWordDone] = useState(false)

  // Mental Math (low grade)
  const [problems, setProblems]           = useState<Problem[]>([])
  const [mathInputs, setMathInputs]       = useState<string[]>(Array(10).fill(''))
  const [mathStarted, setMathStarted]     = useState(false)
  const [mathSubmitted, setMathSubmitted] = useState(false)
  const [mathScore, setMathScore]         = useState(0)
  const [timeLeft, setTimeLeft]           = useState(60)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Typing Test (low grade)
  const [typingStarted, setTypingStarted] = useState(false)
  const [typingDone, setTypingDone]       = useState(false)
  const [typedText, setTypedText]         = useState('')
  const [wpm, setWpm]                     = useState(0)
  const [accuracy, setAccuracy]           = useState(0)
  const typingStartRef = useRef<number | null>(null)
  const passage = getDayPassage()

  // Riddle (high grade)
  const [riddleInput, setRiddleInput]         = useState('')
  const [riddleSubmitted, setRiddleSubmitted] = useState(false)
  const [riddleCorrect, setRiddleCorrect]     = useState(false)
  const [showHint, setShowHint]               = useState(false)

  // Fact or Myth (high grade)
  const [factAnswers, setFactAnswers]     = useState<(boolean|null)[]>(Array(10).fill(null))
  const [factSubmitted, setFactSubmitted] = useState(false)
  const [factScore, setFactScore]         = useState(0)

  // Debate (high grade)
  const [debateText, setDebateText]       = useState('')
  const [debateScoring, setDebateScoring] = useState(false)
  const [debateResult, setDebateResult]   = useState<{ score: number; feedback: string; breakdown: Record<string, number> } | null>(null)

  // Challenge (high grade)
  const [challengeInput, setChallengeInput]       = useState('')
  const [challengeSubmitted, setChallengeSubmitted] = useState(false)
  const [challengeCorrect, setChallengeCorrect]   = useState(false)

  // Speaking (high grade)
  const [speakingInput, setSpeakingInput]   = useState('')
  const [speakingResult, setSpeakingResult] = useState<{ accuracy: number; pts: number } | null>(null)

  // Reading (high grade)
  const [readingAnswers, setReadingAnswers]     = useState<(number|null)[]>(Array(5).fill(null))
  const [readingSubmitted, setReadingSubmitted] = useState(false)
  const [readingScore, setReadingScore]         = useState(0)

  // Writing (high grade)
  const [writingText, setWritingText]         = useState('')
  const [writingScoring, setWritingScoring]   = useState(false)
  const [writingResult, setWritingResult]     = useState<{ score: number; feedback: string } | null>(null)

  useEffect(() => {
    fetch(`/api/hub/daily?student_id=${studentId}&school_id=${schoolId}&grade=${grade}`)
      .then(r => r.json())
      .then(data => setContent(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [studentId, schoolId, grade])

  // Mental math countdown timer
  useEffect(() => {
    if (!mathStarted || mathSubmitted) return
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current!); submitMath(); return 0 }
        return t - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mathStarted])

  // ── Complete helper ──────────────────────────────────────────────────────────
  async function complete(actType: string, score: number, points: number) {
    const res = await fetch('/api/hub/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: studentId, school_id: schoolId, activity_type: actType, score, points }),
    })
    const data = await res.json()
    if (data.ok && !data.already_done) {
      setContent(prev => prev ? { ...prev, completions: { ...prev.completions, [actType]: { done: true, points } } } : prev)
    }
  }

  // ── GK Quiz ──────────────────────────────────────────────────────────────────
  function submitGK() {
    if (!content?.gk_questions) return
    const correct = content.gk_questions.filter((q, i) => gkAnswers[i] === q.answer).length
    setGkScore(correct); setGkSubmitted(true)
    complete('gk_quiz', correct, correct * 2)
  }

  // ── Mental Math ───────────────────────────────────────────────────────────────
  function startMath() {
    setProblems(generateProblems()); setMathInputs(Array(10).fill(''))
    setTimeLeft(60); setMathSubmitted(false); setMathStarted(true)
  }
  function submitMath() {
    if (timerRef.current) clearInterval(timerRef.current)
    let correct = 0
    problems.forEach((p, i) => { if (parseInt(mathInputs[i] ?? '') === p.answer) correct++ })
    const pts = correct >= 9 ? 5 : correct >= 7 ? 4 : correct >= 5 ? 3 : correct >= 3 ? 2 : correct >= 1 ? 1 : 0
    setMathScore(correct); setMathSubmitted(true)
    complete('mental_math', correct, pts)
  }

  // ── Typing Test ────────────────────────────────────────────────────────────────
  function startTyping() { typingStartRef.current = Date.now(); setTypedText(''); setTypingStarted(true); setTypingDone(false) }
  function submitTyping() {
    const mins = (Date.now() - (typingStartRef.current ?? Date.now())) / 60000
    const wordCount = passage.split(/\s+/).length
    setWpm(Math.round(wordCount / Math.max(mins, 0.1)))
    const pWords = passage.split(/\s+/), tWords = typedText.trim().split(/\s+/)
    setAccuracy(Math.round((pWords.filter((w, i) => w.toLowerCase() === (tWords[i] ?? '').toLowerCase()).length / pWords.length) * 100))
    setTypingDone(true)
    complete('typing_test', Math.round(wordCount / Math.max(mins, 0.1)), 2)
  }

  // ── Riddle ────────────────────────────────────────────────────────────────────
  function submitRiddle() {
    if (!content?.riddle) return
    const correct = checkRiddleAnswer(riddleInput, content.riddle.answer)
    setRiddleCorrect(correct); setRiddleSubmitted(true)
    if (correct) complete('riddle', 1, 5)
    else complete('riddle', 0, 0)
  }

  // ── Fact or Myth ──────────────────────────────────────────────────────────────
  function submitFactMyth() {
    const items = content?.fact_myth_questions ?? []
    const correct = items.filter((item, i) => factAnswers[i] === item.answer).length
    setFactScore(correct); setFactSubmitted(true)
    complete('fact_myth', correct, correct * 2)
  }

  // ── Debate ────────────────────────────────────────────────────────────────────
  async function submitDebate() {
    if (!content?.debate_statement || debateText.trim().length < 20) return
    setDebateScoring(true)
    try {
      const res = await fetch('/api/hub/debate-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statement: content.debate_statement.statement, student_response: debateText }),
      })
      const data = await res.json()
      setDebateResult(data)
      complete('debate', data.score, data.score)
    } catch {
      setDebateResult({ score: 5, feedback: 'Good effort!', breakdown: {} })
      complete('debate', 5, 5)
    } finally { setDebateScoring(false) }
  }

  // ── Challenge ─────────────────────────────────────────────────────────────────
  function submitChallenge() {
    if (!content?.challenge_problem) return
    const correct = checkChallengeAnswer(challengeInput, content.challenge_problem.answer)
    setChallengeCorrect(correct); setChallengeSubmitted(true)
    complete('challenge', correct ? 1 : 0, correct ? 10 : 0)
  }

  // ── Speaking ──────────────────────────────────────────────────────────────────
  function submitSpeaking() {
    const sentences = content?.speaking_sentences ?? []
    const sentence = sentences[0]
    if (!sentence) return
    const norm = (s: string) => s.toLowerCase().replace(/[.,!?;:'"()\-]/g, '').trim()
    const targetWords = sentence.sentence.split(/\s+/).map(norm).filter(Boolean)
    const inputWords  = speakingInput.trim().split(/\s+/).map(norm).filter(Boolean)
    let matched = 0
    targetWords.forEach((w, i) => { if (inputWords[i] === w) matched++ })
    const accuracy = Math.round((matched / Math.max(targetWords.length, 1)) * 100)
    const pts = accuracy >= 90 ? 10 : accuracy >= 70 ? 7 : accuracy >= 50 ? 5 : accuracy >= 30 ? 3 : 1
    setSpeakingResult({ accuracy, pts })
    complete('speaking', accuracy, pts)
  }

  // ── Reading ───────────────────────────────────────────────────────────────────
  function submitReading() {
    const rp = content?.reading_passage
    if (!rp) return
    const correct = rp.questions.filter((q, i) => readingAnswers[i] === q.answer).length
    setReadingScore(correct); setReadingSubmitted(true)
    complete('reading', correct, correct)
  }

  // ── Writing ───────────────────────────────────────────────────────────────────
  async function submitWriting() {
    const wp = content?.writing_prompt
    if (!wp) return
    setWritingScoring(true)
    try {
      const res = await fetch('/api/hub/writing-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: wp.prompt, response: writingText }),
      })
      const data = await res.json()
      const score = Math.min(8, Math.max(1, data.score ?? 5))
      setWritingResult({ score, feedback: data.feedback ?? 'Good work!' })
      complete('writing', score, score)
    } catch {
      setWritingResult({ score: 5, feedback: 'Good effort! Keep writing.' })
      complete('writing', 5, 5)
    } finally { setWritingScoring(false) }
  }

  // ── Reset all activity state ───────────────────────────────────────────────────
  function backToHub() {
    setActivity(null)
    setGkAnswers(Array(5).fill(null)); setGkSubmitted(false)
    setWordDone(false)
    setMathStarted(false); setMathSubmitted(false)
    if (timerRef.current) clearInterval(timerRef.current)
    setTypingStarted(false); setTypingDone(false); setTypedText('')
    setRiddleInput(''); setRiddleSubmitted(false); setShowHint(false)
    setFactAnswers(Array(10).fill(null)); setFactSubmitted(false)
    setDebateText(''); setDebateResult(null)
    setChallengeInput(''); setChallengeSubmitted(false)
    setSpeakingInput(''); setSpeakingResult(null)
    setReadingAnswers(Array(5).fill(null)); setReadingSubmitted(false)
    setWritingText(''); setWritingResult(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SHARED: GK QUIZ (same for both grade bands)
  // ════════════════════════════════════════════════════════════════════════════
  if (activity === 'gk_quiz') {
    const questions  = content?.gk_questions ?? []
    const alreadyDone = content?.completions?.gk_quiz?.done
    return (
      <div className="max-w-xl mx-auto">
        <BackBtn onClick={backToHub} />
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-3xl">🌍</span>
            <div><h2 className="text-lg font-bold text-gray-900">Daily GK Quiz</h2><p className="text-sm text-gray-500">2 points per correct answer</p></div>
          </div>
          {alreadyDone && !gkSubmitted ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">✅</div>
              <p className="font-semibold text-gray-800">Already completed today!</p>
              <p className="text-sm text-gray-500 mt-1">You earned {content?.completions?.gk_quiz?.points} pts. Come back tomorrow.</p>
            </div>
          ) : gkSubmitted ? (
            <div className="text-center py-4">
              <div className="text-5xl mb-3">{gkScore === 5 ? '🏆' : gkScore >= 3 ? '🎉' : '📚'}</div>
              <p className="text-2xl font-bold text-gray-900">{gkScore} / 5 correct</p>
              <p className="text-sm text-gray-500 mt-1">You earned <span className="font-semibold text-yellow-600">{gkScore * 2} points</span></p>
              <div className="mt-5 space-y-3 text-left">
                {questions.map((q, qi) => (
                  <div key={qi} className={`p-3 rounded-xl border text-sm ${gkAnswers[qi] === q.answer ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <p className="font-medium text-gray-800 mb-1">{qi + 1}. {q.q}</p>
                    <p className={gkAnswers[qi] === q.answer ? 'text-green-700' : 'text-red-600'}>
                      Your answer: {q.options[gkAnswers[qi] ?? -1] ?? '—'}
                      {gkAnswers[qi] !== q.answer && <span className="text-green-700 ml-2">✓ {q.options[q.answer]}</span>}
                    </p>
                  </div>
                ))}
              </div>
              <button onClick={backToHub} className="mt-5 bg-yellow-400 hover:bg-yellow-500 text-white font-semibold px-6 py-2.5 rounded-xl text-sm">Back to Hub</button>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {questions.map((q, qi) => (
                  <div key={qi} className="border border-gray-100 rounded-xl p-4">
                    <p className="font-medium text-gray-800 mb-3 text-sm">{qi + 1}. {q.q}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {q.options.map((opt, oi) => (
                        <button key={oi} onClick={() => setGkAnswers(prev => { const n = [...prev]; n[qi] = oi; return n })}
                          className={`text-sm text-left px-3 py-2 rounded-lg border transition-colors ${gkAnswers[qi] === oi ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50'}`}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={submitGK} disabled={gkAnswers.some(a => a === null)}
                className="mt-5 w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl text-sm">
                Submit Answers
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // LOW GRADE ACTIVITIES
  // ════════════════════════════════════════════════════════════════════════════
  if (activity === 'word_of_day') {
    const word = content?.word_of_day
    const alreadyDone = content?.completions?.word_of_day?.done
    return (
      <div className="max-w-xl mx-auto">
        <BackBtn onClick={backToHub} />
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-5">
            <span className="text-3xl">📖</span>
            <div><h2 className="text-lg font-bold text-gray-900">Word of the Day</h2><p className="text-sm text-gray-500">Learn a new word, earn 3 pts</p></div>
          </div>
          {word && (
            <div className="bg-purple-50 rounded-xl p-5 mb-5">
              <div className="flex items-baseline gap-3 mb-1">
                <span className="text-2xl font-bold text-purple-800">{word.word}</span>
                <span className="text-sm text-purple-500 italic">{word.pronunciation}</span>
              </div>
              <p className="text-xs font-bold text-purple-600 mt-3 uppercase tracking-wide">Meaning</p>
              <p className="text-sm text-gray-700 mt-0.5">{word.meaning}</p>
              <p className="text-xs font-bold text-purple-600 mt-3 uppercase tracking-wide">Example</p>
              <p className="text-sm text-gray-700 italic mt-0.5">&ldquo;{word.example}&rdquo;</p>
            </div>
          )}
          {alreadyDone || wordDone ? (
            <div className="text-center py-4">
              <div className="text-3xl mb-2">✅</div>
              <p className="font-semibold text-gray-800">{wordDone ? 'Great job! +3 points earned!' : 'Already completed today!'}</p>
              <p className="text-sm text-gray-500 mt-1">Come back tomorrow for a new word.</p>
              <button onClick={backToHub} className="mt-4 bg-yellow-400 hover:bg-yellow-500 text-white font-semibold px-6 py-2.5 rounded-xl text-sm">Back to Hub</button>
            </div>
          ) : (
            <button onClick={async () => { await complete('word_of_day', 1, 3); setWordDone(true) }}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-xl text-sm">
              I learned this word! +3 pts
            </button>
          )}
        </div>
      </div>
    )
  }

  if (activity === 'mental_math') {
    const alreadyDone = content?.completions?.mental_math?.done
    return (
      <div className="max-w-xl mx-auto">
        <BackBtn onClick={backToHub} />
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">🧮</span>
            <div><h2 className="text-lg font-bold text-gray-900">Mental Math</h2><p className="text-sm text-gray-500">10 problems · 60 seconds · up to 5 pts</p></div>
          </div>
          {alreadyDone && !mathSubmitted ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">✅</div>
              <p className="font-semibold text-gray-800">Already completed today!</p>
              <p className="text-sm text-gray-500 mt-1">You earned {content?.completions?.mental_math?.points} pts. Come back tomorrow.</p>
            </div>
          ) : mathSubmitted ? (
            <div className="text-center py-4">
              <div className="text-5xl mb-3">{mathScore >= 8 ? '🏆' : mathScore >= 5 ? '🎉' : '💪'}</div>
              <p className="text-2xl font-bold text-gray-900">{mathScore} / 10 correct</p>
              <p className="text-sm text-gray-500 mt-1">Points: <span className="font-semibold text-yellow-600">{mathScore >= 9 ? 5 : mathScore >= 7 ? 4 : mathScore >= 5 ? 3 : mathScore >= 3 ? 2 : mathScore >= 1 ? 1 : 0} pts</span></p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-left">
                {problems.map((p, i) => {
                  const c = parseInt(mathInputs[i] ?? '') === p.answer
                  return (
                    <div key={i} className={`px-3 py-2 rounded-lg text-xs border ${c ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                      <span className="font-medium">{p.a} {p.op} {p.b} = </span>
                      <span className={c ? 'text-green-700 font-bold' : 'text-red-600 font-bold'}>{mathInputs[i] || '—'}</span>
                      {!c && <span className="text-green-700 ml-1">(✓ {p.answer})</span>}
                    </div>
                  )
                })}
              </div>
              <button onClick={backToHub} className="mt-5 bg-yellow-400 hover:bg-yellow-500 text-white font-semibold px-6 py-2.5 rounded-xl text-sm">Back to Hub</button>
            </div>
          ) : !mathStarted ? (
            <div className="text-center py-6">
              <p className="text-gray-500 text-sm mb-5">Solve as many problems as you can in 60 seconds.</p>
              <div className="grid grid-cols-3 gap-3 mb-6">
                {[['9–10','5 pts'],['7–8','4 pts'],['5–6','3 pts']].map(([r,p]) => (
                  <div key={r} className="bg-orange-50 rounded-xl p-3 text-center"><p className="text-xl font-bold text-orange-700">{r}</p><p className="text-xs text-orange-600">{p}</p></div>
                ))}
              </div>
              <button onClick={startMath} className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-8 py-3 rounded-xl text-sm">Start Challenge</button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-gray-600">Fill in all answers!</span>
                <span className={`text-lg font-bold tabular-nums ${timeLeft <= 10 ? 'text-red-600 animate-pulse' : 'text-orange-600'}`}>{timeLeft}s</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {problems.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                    <span className="text-sm font-medium text-gray-700 w-20 flex-shrink-0">{p.a} {p.op} {p.b} =</span>
                    <input type="number" value={mathInputs[i]} onChange={e => setMathInputs(prev => { const n=[...prev]; n[i]=e.target.value; return n })}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-300" placeholder="?" />
                  </div>
                ))}
              </div>
              <button onClick={submitMath} className="mt-4 w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-xl text-sm">Submit</button>
            </>
          )}
        </div>
      </div>
    )
  }

  if (activity === 'typing_test') {
    const alreadyDone = content?.completions?.typing_test?.done
    return (
      <div className="max-w-xl mx-auto">
        <BackBtn onClick={backToHub} />
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-5">
            <span className="text-3xl">⌨️</span>
            <div><h2 className="text-lg font-bold text-gray-900">Typing Speed Test</h2><p className="text-sm text-gray-500">Type the passage and see your WPM</p></div>
          </div>
          {alreadyDone && !typingDone ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">✅</div>
              <p className="font-semibold text-gray-800">Already completed today!</p>
              <p className="text-sm text-gray-500 mt-1">You earned {content?.completions?.typing_test?.points} pts. Come back tomorrow.</p>
            </div>
          ) : typingDone ? (
            <div className="text-center py-6">
              <div className="text-5xl mb-3">⌨️</div>
              <p className="text-3xl font-bold text-gray-900">{wpm} <span className="text-lg font-normal text-gray-500">WPM</span></p>
              <p className="text-sm text-gray-500 mt-1">Accuracy: <span className="font-semibold text-green-600">{accuracy}%</span> · <span className="font-semibold text-yellow-600">+2 pts</span></p>
              <div className="mt-4 text-left bg-gray-50 rounded-xl p-3 text-xs text-gray-500">
                <span className="font-medium">Speed guide:</span> &lt;20 = Beginner · 20–40 = Average · 40–60 = Good · 60+ = Fast
              </div>
              <button onClick={backToHub} className="mt-5 bg-yellow-400 hover:bg-yellow-500 text-white font-semibold px-6 py-2.5 rounded-xl text-sm">Back to Hub</button>
            </div>
          ) : (
            <>
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                <p className="text-sm text-gray-700 leading-relaxed">{passage}</p>
              </div>
              {!typingStarted ? (
                <button onClick={startTyping} className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl text-sm">Start Typing</button>
              ) : (
                <>
                  <textarea autoFocus value={typedText} onChange={e => setTypedText(e.target.value)} rows={5}
                    placeholder="Type the passage here..." className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-300 resize-none mb-3" />
                  <button onClick={submitTyping} className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl text-sm">Done — Calculate WPM</button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // HIGH GRADE ACTIVITIES
  // ════════════════════════════════════════════════════════════════════════════
  if (activity === 'riddle') {
    const riddle = content?.riddle
    const alreadyDone = content?.completions?.riddle?.done
    return (
      <div className="max-w-xl mx-auto">
        <BackBtn onClick={backToHub} />
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-5">
            <span className="text-3xl">🧩</span>
            <div><h2 className="text-lg font-bold text-gray-900">Riddle of the Day</h2><p className="text-sm text-gray-500">Solve the riddle and earn 5 pts</p></div>
          </div>
          {riddle && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 mb-5">
              <p className="text-base font-semibold text-indigo-900 leading-relaxed">&ldquo;{riddle.riddle}&rdquo;</p>
            </div>
          )}
          {alreadyDone ? (
            <div className="text-center py-4">
              <div className="text-3xl mb-2">{content?.completions?.riddle?.points ? '✅' : '😅'}</div>
              <p className="font-semibold text-gray-800">Already attempted today!</p>
              {content?.completions?.riddle?.points === 0 && riddle && (
                <p className="text-sm text-gray-500 mt-1">The answer was: <span className="font-semibold text-indigo-700">{riddle.answer}</span></p>
              )}
              <button onClick={backToHub} className="mt-4 bg-yellow-400 hover:bg-yellow-500 text-white font-semibold px-6 py-2.5 rounded-xl text-sm">Back to Hub</button>
            </div>
          ) : riddleSubmitted ? (
            <div className={`rounded-xl p-5 text-center ${riddleCorrect ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <div className="text-4xl mb-2">{riddleCorrect ? '🎉' : '🤔'}</div>
              <p className="font-bold text-lg text-gray-900 mb-1">{riddleCorrect ? 'Correct! +5 pts' : 'Not quite!'}</p>
              {riddle && (
                <p className="text-sm text-gray-600">The answer is: <span className="font-semibold text-indigo-700">{riddle.answer}</span></p>
              )}
              <button onClick={backToHub} className="mt-4 bg-yellow-400 hover:bg-yellow-500 text-white font-semibold px-6 py-2.5 rounded-xl text-sm">Back to Hub</button>
            </div>
          ) : (
            <>
              {showHint && riddle && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-3 text-sm text-amber-800">
                  💡 Hint: {riddle.hint}
                </div>
              )}
              <input type="text" value={riddleInput} onChange={e => setRiddleInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && riddleInput.trim() && submitRiddle()}
                placeholder="Type your answer..." autoFocus
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 mb-3" />
              <div className="flex gap-3">
                <button onClick={() => setShowHint(true)} disabled={showHint}
                  className="flex-1 border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-40 font-medium py-2.5 rounded-xl text-sm">
                  {showHint ? 'Hint shown' : 'Show Hint'}
                </button>
                <button onClick={submitRiddle} disabled={!riddleInput.trim()}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl text-sm">
                  Submit Answer
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  if (activity === 'fact_myth') {
    const items = content?.fact_myth_questions ?? []
    const alreadyDone = content?.completions?.fact_myth?.done
    const allAnswered = factAnswers.slice(0, items.length).every(a => a !== null)
    return (
      <div className="max-w-xl mx-auto">
        <BackBtn onClick={backToHub} />
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <span className="text-3xl">⚡</span>
              <div><h2 className="text-lg font-bold text-gray-900">Fact or Myth?</h2><p className="text-sm text-gray-500">Mark each statement True or False</p></div>
            </div>
            {!factSubmitted && !alreadyDone && (
              <span className="text-xs text-gray-400">{factAnswers.filter(a => a !== null).length}/{items.length}</span>
            )}
          </div>
          {alreadyDone && !factSubmitted ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">✅</div>
              <p className="font-semibold text-gray-800">Already completed today!</p>
              <p className="text-sm text-gray-500 mt-1">You earned {content?.completions?.fact_myth?.points} pts. Come back tomorrow.</p>
            </div>
          ) : factSubmitted ? (
            <div>
              <div className="text-center mb-5">
                <div className="text-5xl mb-2">{factScore >= 8 ? '🏆' : factScore >= 5 ? '🎉' : '📚'}</div>
                <p className="text-2xl font-bold text-gray-900">{factScore} / {items.length} correct</p>
                <p className="text-sm text-gray-500 mt-1"><span className="font-semibold text-yellow-600">{factScore * 2} pts earned</span></p>
              </div>
              <div className="space-y-3">
                {items.map((item, i) => {
                  const correct = factAnswers[i] === item.answer
                  return (
                    <div key={i} className={`p-3 rounded-xl border text-sm ${correct ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="font-medium text-gray-800 flex-1">{item.statement}</p>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${item.answer ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                          {item.answer ? 'FACT' : 'MYTH'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">{item.explanation}</p>
                    </div>
                  )
                })}
              </div>
              <button onClick={backToHub} className="mt-5 w-full bg-yellow-400 hover:bg-yellow-500 text-white font-semibold py-3 rounded-xl text-sm">Back to Hub</button>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {items.map((item, i) => (
                  <div key={i} className={`p-4 rounded-xl border transition-colors ${factAnswers[i] !== null ? (factAnswers[i] ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50') : 'border-gray-200'}`}>
                    <p className="text-sm font-medium text-gray-800 mb-3">{i + 1}. {item.statement}</p>
                    <div className="flex gap-2">
                      <button onClick={() => setFactAnswers(prev => { const n=[...prev]; n[i]=true; return n })}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${factAnswers[i] === true ? 'bg-green-600 border-green-600 text-white' : 'border-green-300 text-green-700 hover:bg-green-50'}`}>
                        ✓ Fact
                      </button>
                      <button onClick={() => setFactAnswers(prev => { const n=[...prev]; n[i]=false; return n })}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${factAnswers[i] === false ? 'bg-red-600 border-red-600 text-white' : 'border-red-300 text-red-700 hover:bg-red-50'}`}>
                        ✗ Myth
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={submitFactMyth} disabled={!allAnswered}
                className="mt-5 w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-semibold py-3 rounded-xl text-sm">
                Submit Answers
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  if (activity === 'debate') {
    const topic = content?.debate_statement
    const alreadyDone = content?.completions?.debate?.done
    return (
      <div className="max-w-xl mx-auto">
        <BackBtn onClick={backToHub} />
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-5">
            <span className="text-3xl">💬</span>
            <div><h2 className="text-lg font-bold text-gray-900">Debate of the Day</h2><p className="text-sm text-gray-500">Write your argument — AI scores clarity, reasoning & depth</p></div>
          </div>
          {topic && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 mb-5">
              <p className="text-base font-bold text-rose-900 leading-snug mb-2">&ldquo;{topic.statement}&rdquo;</p>
              {topic.context && <p className="text-xs text-rose-700">{topic.context}</p>}
            </div>
          )}
          {alreadyDone && !debateResult ? (
            <div className="text-center py-4">
              <div className="text-3xl mb-2">✅</div>
              <p className="font-semibold text-gray-800">Already completed today!</p>
              <p className="text-sm text-gray-500 mt-1">You earned {content?.completions?.debate?.points} pts. Come back tomorrow for a new topic.</p>
              <button onClick={backToHub} className="mt-4 bg-yellow-400 hover:bg-yellow-500 text-white font-semibold px-6 py-2.5 rounded-xl text-sm">Back to Hub</button>
            </div>
          ) : debateResult ? (
            <div className="text-center py-2">
              <div className="text-5xl mb-2">{debateResult.score >= 8 ? '🌟' : debateResult.score >= 5 ? '👍' : '📝'}</div>
              <p className="text-3xl font-bold text-gray-900">{debateResult.score} <span className="text-lg font-normal text-gray-500">/ 10</span></p>
              <p className="text-sm text-gray-600 mt-1 italic">&ldquo;{debateResult.feedback}&rdquo;</p>
              {debateResult.breakdown && Object.keys(debateResult.breakdown).length > 0 && (
                <div className="flex justify-center gap-3 mt-4">
                  {Object.entries(debateResult.breakdown).map(([key, val]) => (
                    <div key={key} className="bg-rose-50 rounded-xl px-4 py-2 text-center">
                      <p className="text-lg font-bold text-rose-700">{val}</p>
                      <p className="text-xs text-rose-600 capitalize">{key}</p>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={backToHub} className="mt-5 bg-yellow-400 hover:bg-yellow-500 text-white font-semibold px-6 py-2.5 rounded-xl text-sm">Back to Hub</button>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-2">Write 2–3 sentences supporting or opposing the statement above.</p>
              <textarea value={debateText} onChange={e => setDebateText(e.target.value)} rows={5} autoFocus
                placeholder="State your argument clearly. Give at least one reason or example..."
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-rose-300 resize-none mb-1" />
              <p className="text-xs text-gray-400 mb-3">{debateText.length} characters (min 20)</p>
              <button onClick={submitDebate} disabled={debateText.trim().length < 20 || debateScoring}
                className="w-full bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2">
                {debateScoring ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Scoring your argument...</> : 'Submit for AI Scoring'}
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  if (activity === 'challenge') {
    const challenge = content?.challenge_problem
    const alreadyDone = content?.completions?.challenge?.done
    return (
      <div className="max-w-xl mx-auto">
        <BackBtn onClick={backToHub} />
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-5">
            <span className="text-3xl">🎯</span>
            <div><h2 className="text-lg font-bold text-gray-900">Daily Challenge</h2><p className="text-sm text-gray-500">Solve the problem and earn 10 pts</p></div>
          </div>
          {challenge && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-5 mb-5">
              <p className="text-sm font-semibold text-teal-900 leading-relaxed">{challenge.problem}</p>
            </div>
          )}
          {alreadyDone ? (
            <div className="text-center py-4">
              <div className="text-3xl mb-2">{content?.completions?.challenge?.points === 10 ? '✅' : '😅'}</div>
              <p className="font-semibold text-gray-800">
                {content?.completions?.challenge?.points === 10 ? 'Solved! +10 pts earned!' : 'Already attempted today!'}
              </p>
              {content?.completions?.challenge?.points === 0 && challenge && (
                <div className="mt-3 bg-gray-50 rounded-xl p-4 text-left">
                  <p className="text-sm font-semibold text-gray-700 mb-1">Answer: <span className="text-teal-700">{challenge.answer}</span></p>
                  <p className="text-xs text-gray-500">{challenge.explanation}</p>
                </div>
              )}
              <button onClick={backToHub} className="mt-4 bg-yellow-400 hover:bg-yellow-500 text-white font-semibold px-6 py-2.5 rounded-xl text-sm">Back to Hub</button>
            </div>
          ) : challengeSubmitted ? (
            <div className={`rounded-xl p-5 text-center ${challengeCorrect ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <div className="text-4xl mb-2">{challengeCorrect ? '🎉' : '🤔'}</div>
              <p className="font-bold text-lg text-gray-900 mb-2">{challengeCorrect ? 'Correct! +10 pts!' : 'Not quite!'}</p>
              {challenge && (
                <div className="text-left bg-white/70 rounded-xl p-4 mt-2">
                  <p className="text-sm font-semibold text-gray-700 mb-1">Answer: <span className="text-teal-700">{challenge.answer}</span></p>
                  <p className="text-xs text-gray-600 leading-relaxed">{challenge.explanation}</p>
                </div>
              )}
              <button onClick={backToHub} className="mt-4 bg-yellow-400 hover:bg-yellow-500 text-white font-semibold px-6 py-2.5 rounded-xl text-sm">Back to Hub</button>
            </div>
          ) : (
            <>
              <input type="text" value={challengeInput} onChange={e => setChallengeInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && challengeInput.trim() && submitChallenge()}
                placeholder="Your answer..." autoFocus
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 mb-3" />
              <button onClick={submitChallenge} disabled={!challengeInput.trim()}
                className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl text-sm">
                Submit Answer
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CHESS (all grades)
  // ════════════════════════════════════════════════════════════════════════════
  if (activity === 'chess') {
    const alreadyDone = content?.completions?.chess?.done
    return (
      <div className="max-w-xl mx-auto">
        <BackBtn onClick={backToHub} />
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">♟</span>
            <div><h2 className="text-lg font-bold text-gray-900">Chess vs AI</h2><p className="text-sm text-gray-500">Play for fun — the AI picks random legal moves</p></div>
          </div>
          {alreadyDone && <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 mb-4">Played today ✓ — you can still play more games!</p>}
          <ChessGame onComplete={() => complete('chess', 1, 0)} />
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SUDOKU (all grades)
  // ════════════════════════════════════════════════════════════════════════════
  if (activity === 'sudoku') {
    const alreadyDone = content?.completions?.sudoku?.done
    const earnedPts   = content?.completions?.sudoku?.points ?? 0
    return (
      <div className="max-w-xl mx-auto">
        <BackBtn onClick={backToHub} />
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">🔢</span>
            <div><h2 className="text-lg font-bold text-gray-900">Sudoku</h2><p className="text-sm text-gray-500">Fill in the 9×9 grid — earn 5 pts for solving it</p></div>
          </div>
          {alreadyDone && earnedPts > 0 ? (
            <div className="text-center py-10">
              <div className="text-4xl mb-3">✅</div>
              <p className="font-semibold text-gray-800">Already solved today! +{earnedPts} pts</p>
              <p className="text-sm text-gray-500 mt-1">Come back tomorrow for a new puzzle.</p>
              <button onClick={backToHub} className="mt-5 bg-yellow-400 hover:bg-yellow-500 text-white font-semibold px-6 py-2.5 rounded-xl text-sm">Back to Hub</button>
            </div>
          ) : (
            <SudokuGame onComplete={(pts) => complete('sudoku', pts, pts)} />
          )}
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SPEAKING (grades 6–10)
  // ════════════════════════════════════════════════════════════════════════════
  if (activity === 'speaking') {
    const alreadyDone = content?.completions?.speaking?.done
    const sentence    = content?.speaking_sentences?.[0]
    return (
      <div className="max-w-xl mx-auto">
        <BackBtn onClick={backToHub} />
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-5">
            <span className="text-3xl">🎤</span>
            <div><h2 className="text-lg font-bold text-gray-900">English Speaking</h2><p className="text-sm text-gray-500">Read aloud then type what you said — up to 10 pts</p></div>
          </div>
          {alreadyDone && !speakingResult ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">✅</div>
              <p className="font-semibold text-gray-800">Already completed today!</p>
              <p className="text-sm text-gray-500 mt-1">You earned {content?.completions?.speaking?.points} pts. Come back tomorrow.</p>
            </div>
          ) : speakingResult ? (
            <div className="text-center py-2">
              <div className="text-5xl mb-3">{speakingResult.accuracy >= 80 ? '🎉' : speakingResult.accuracy >= 50 ? '👍' : '💪'}</div>
              <p className="text-3xl font-bold text-gray-900">{speakingResult.accuracy}%</p>
              <p className="text-sm text-gray-500 mt-1">Speaking accuracy · <span className="font-semibold text-yellow-600">+{speakingResult.pts} pts</span></p>
              {sentence && (
                <div className="mt-4 bg-gray-50 rounded-xl p-4 text-left">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Target sentence</p>
                  <p className="text-sm text-gray-700 mt-1 italic">{sentence.sentence}</p>
                </div>
              )}
              <div className="mt-3 bg-pink-50 rounded-xl px-4 py-2 text-xs text-pink-700">
                <span className="font-semibold">Scoring:</span> ≥90% = 10 pts · ≥70% = 7 pts · ≥50% = 5 pts · ≥30% = 3 pts · else 1 pt
              </div>
              <button onClick={backToHub} className="mt-5 bg-yellow-400 hover:bg-yellow-500 text-white font-semibold px-6 py-2.5 rounded-xl text-sm">Back to Hub</button>
            </div>
          ) : (
            <>
              {sentence && (
                <div className="bg-pink-50 border border-pink-200 rounded-xl p-5 mb-5">
                  <p className="text-xs font-semibold text-pink-600 uppercase tracking-wide mb-2">Read this sentence aloud:</p>
                  <p className="text-base font-semibold text-pink-900 leading-relaxed">&ldquo;{sentence.sentence}&rdquo;</p>
                  {sentence.topic && <p className="text-xs text-pink-500 mt-2">Topic: {sentence.topic}</p>}
                </div>
              )}
              <p className="text-sm text-gray-600 mb-2">Now type exactly what you just said:</p>
              <textarea value={speakingInput} onChange={e => setSpeakingInput(e.target.value)} rows={3} autoFocus
                placeholder="Type the sentence you read aloud..."
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none mb-3" />
              <button onClick={submitSpeaking} disabled={speakingInput.trim().length < 5}
                className="w-full bg-pink-600 hover:bg-pink-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl text-sm">
                Check My Accuracy
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // READING COMPREHENSION (grades 6–10)
  // ════════════════════════════════════════════════════════════════════════════
  if (activity === 'reading') {
    const rp          = content?.reading_passage
    const alreadyDone = content?.completions?.reading?.done
    const allAnswered = rp ? readingAnswers.slice(0, rp.questions.length).every(a => a !== null) : false
    return (
      <div className="max-w-xl mx-auto">
        <BackBtn onClick={backToHub} />
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-5">
            <span className="text-3xl">📚</span>
            <div><h2 className="text-lg font-bold text-gray-900">Reading Comprehension</h2><p className="text-sm text-gray-500">Read the passage then answer 5 questions — 1 pt each</p></div>
          </div>
          {alreadyDone && !readingSubmitted ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">✅</div>
              <p className="font-semibold text-gray-800">Already completed today!</p>
              <p className="text-sm text-gray-500 mt-1">You earned {content?.completions?.reading?.points} pts. Come back tomorrow.</p>
            </div>
          ) : readingSubmitted ? (
            <div>
              <div className="text-center mb-5">
                <div className="text-5xl mb-2">{readingScore >= 4 ? '🏆' : readingScore >= 3 ? '🎉' : '📚'}</div>
                <p className="text-2xl font-bold text-gray-900">{readingScore} / {rp?.questions.length ?? 5}</p>
                <p className="text-sm text-gray-500 mt-1"><span className="font-semibold text-yellow-600">{readingScore} pts earned</span></p>
              </div>
              {rp && (
                <div className="space-y-2">
                  {rp.questions.map((q, i) => {
                    const correct = readingAnswers[i] === q.answer
                    return (
                      <div key={i} className={`p-3 rounded-xl border text-sm ${correct ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                        <p className="font-medium text-gray-800 mb-1">{q.q}</p>
                        <p className={correct ? 'text-green-700' : 'text-red-600'}>
                          Your answer: {q.options[readingAnswers[i] ?? -1] ?? '—'}
                          {!correct && <span className="text-green-700 ml-2">✓ {q.options[q.answer]}</span>}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
              <button onClick={backToHub} className="mt-5 w-full bg-yellow-400 hover:bg-yellow-500 text-white font-semibold py-3 rounded-xl text-sm">Back to Hub</button>
            </div>
          ) : rp ? (
            <>
              <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-5 mb-5 max-h-48 overflow-y-auto">
                <p className="text-sm text-gray-700 leading-relaxed">{rp.passage}</p>
              </div>
              <div className="space-y-4">
                {rp.questions.map((q, qi) => (
                  <div key={qi} className="border border-gray-100 rounded-xl p-4">
                    <p className="font-medium text-sm text-gray-800 mb-3">{qi + 1}. {q.q}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {q.options.map((opt, oi) => (
                        <button key={oi} onClick={() => setReadingAnswers(prev => { const n = [...prev]; n[qi] = oi; return n })}
                          className={`text-sm text-left px-3 py-2 rounded-lg border transition-colors ${readingAnswers[qi] === oi ? 'bg-cyan-600 border-cyan-600 text-white' : 'border-gray-200 text-gray-700 hover:border-cyan-300 hover:bg-cyan-50'}`}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={submitReading} disabled={!allAnswered}
                className="mt-5 w-full bg-cyan-600 hover:bg-cyan-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl text-sm">
                Submit Answers
              </button>
            </>
          ) : (
            <div className="text-center py-8 text-gray-400">Content loading... Please try again.</div>
          )}
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CREATIVE WRITING (grades 6–10)
  // ════════════════════════════════════════════════════════════════════════════
  if (activity === 'writing') {
    const wp          = content?.writing_prompt
    const alreadyDone = content?.completions?.writing?.done
    const wordCount   = writingText.trim().split(/\s+/).filter(Boolean).length
    return (
      <div className="max-w-xl mx-auto">
        <BackBtn onClick={backToHub} />
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-5">
            <span className="text-3xl">✍️</span>
            <div><h2 className="text-lg font-bold text-gray-900">Creative Writing</h2><p className="text-sm text-gray-500">Write a response — AI gives feedback — up to 8 pts</p></div>
          </div>
          {alreadyDone && !writingResult ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">✅</div>
              <p className="font-semibold text-gray-800">Already completed today!</p>
              <p className="text-sm text-gray-500 mt-1">You earned {content?.completions?.writing?.points} pts. Come back tomorrow for a new prompt.</p>
            </div>
          ) : writingResult ? (
            <div className="text-center py-2">
              <div className="text-5xl mb-2">{writingResult.score >= 7 ? '🌟' : writingResult.score >= 5 ? '👍' : '📝'}</div>
              <p className="text-3xl font-bold text-gray-900">{writingResult.score} <span className="text-lg font-normal text-gray-500">/ 8</span></p>
              <p className="text-sm text-gray-600 mt-2 italic">&ldquo;{writingResult.feedback}&rdquo;</p>
              <button onClick={backToHub} className="mt-5 bg-yellow-400 hover:bg-yellow-500 text-white font-semibold px-6 py-2.5 rounded-xl text-sm">Back to Hub</button>
            </div>
          ) : (
            <>
              {wp && (
                <div className="bg-lime-50 border border-lime-200 rounded-xl p-5 mb-5">
                  <p className="text-xs font-semibold text-lime-600 uppercase tracking-wide mb-1">{wp.theme}</p>
                  <p className="text-base font-semibold text-lime-900 leading-snug">{wp.prompt}</p>
                </div>
              )}
              <textarea value={writingText} onChange={e => setWritingText(e.target.value)} rows={6} autoFocus
                placeholder="Write your response here... (minimum 30 words)"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-lime-300 resize-none mb-1" />
              <p className="text-xs text-gray-400 mb-3">{wordCount} words {wordCount < 30 ? `(need ${30 - wordCount} more)` : '✓'}</p>
              <button onClick={submitWriting} disabled={wordCount < 30 || writingScoring}
                className="w-full bg-lime-600 hover:bg-lime-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2">
                {writingScoring ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Scoring...</> : 'Submit for AI Feedback'}
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // HUB LANDING GRID
  // ════════════════════════════════════════════════════════════════════════════
  const meta = isHighGrade ? HIGH_GRADE_META : LOW_GRADE_META
  const activities = Object.keys(meta)
  const totalDone = activities.filter(k => content?.completions?.[k]?.done).length
  const totalPts  = activities.reduce((s, k) => s + (content?.completions?.[k]?.points ?? 0), 0)

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Student Hub</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {isHighGrade ? 'Daily challenges for grades 6–10' : 'Daily activities for extra points'}
        </p>
      </div>

      {totalDone > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 mb-5 flex items-center gap-3">
          <span className="text-xl">🌟</span>
          <div>
            <p className="text-sm font-semibold text-yellow-800">Great effort today!</p>
            <p className="text-xs text-yellow-700">{totalDone} / {activities.length} activities done · {totalPts} pts earned</p>
          </div>
        </div>
      )}

      <div className={`grid gap-4 ${isHighGrade ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {activities.map(key => {
          const m    = meta[key]
          const done = content?.completions?.[key]?.done
          const pts  = content?.completions?.[key]?.points
          return (
            <button key={key} onClick={() => setActivity(key as Activity)}
              className={`text-left border rounded-2xl p-5 transition-all hover:shadow-md ${done ? 'bg-gray-50 border-gray-200 opacity-75' : `${CARD_STYLE[m.color]} hover:shadow-md`}`}>
              <div className="flex items-start justify-between mb-3">
                <div className={`w-12 h-12 ${done ? 'bg-gray-100' : ICON_BG[m.color]} rounded-xl flex items-center justify-center text-2xl`}>
                  {m.emoji}
                </div>
                {done ? (
                  <span className="bg-green-100 text-green-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                    {(pts ?? 0) > 0 ? `✓ ${pts} pts` : '✓ Played'}
                  </span>
                ) : (
                  <span className="bg-white/60 text-xs font-medium px-2.5 py-1 rounded-full border border-current/10 text-current">{m.pts}</span>
                )}
              </div>
              <p className={`font-bold text-base ${done ? 'text-gray-500' : ''}`}>{m.title}</p>
              <p className={`text-xs mt-0.5 ${done ? 'text-gray-400' : 'opacity-75'}`}>{m.desc}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
