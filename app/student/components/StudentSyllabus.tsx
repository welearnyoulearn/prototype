'use client'

import { useEffect, useState } from 'react'
import { BookOpen, Check, HelpCircle, Lock } from 'lucide-react'
import TopicContentViewer from '@/app/components/TopicContentViewer'
import { INK, GREEN, BORDER, SURFACE, CREAM } from '@/app/components/ulearn/theme'
import { Pills, ProgressBar, UlearnCard, StatusPill, QuizPill, BackBtn, Toast } from '@/app/components/ulearn/primitives'
import { useToast } from '@/app/components/ulearn/useToast'

type Question = { q: string; options: string[]; answer: number; source?: string }

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
  questions?: Question[] | string | null
  resources?: Resource[] | null
}

type Chapter = {
  chapter_name: string
  chapter_order: number
  semester?: string | null
  book_type?: string | null
  audience?: string | null
  book_name?: string | null
  total: number
  covered: number
  topics: Topic[]
}

const BOOK_TYPE_LABELS: Record<string, string> = { textbook: 'Text Book', handbook: 'Hand Book', workbook: 'Work Book' }
const AUDIENCE_LABELS: Record<string, string> = { teacher: 'Teacher Edition', both: 'Teacher & Student' }

/** Majority-audience badge for a book tab label — purely cosmetic, never hides anything. */
function audienceBadge(groupChapters: Chapter[]): string | null {
  const counts: Record<string, number> = {}
  for (const c of groupChapters) {
    const a = c.audience || 'student'
    counts[a] = (counts[a] || 0) + 1
  }
  const majority = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  if (!majority || majority[0] === 'student') return null
  return AUDIENCE_LABELS[majority[0]] || null
}

// A "book" a chapter belongs to is (book_type, book_name) — book_type alone
// can't tell two different Text Books apart. When only one book exists for
// a type, its tab keeps the generic label; once a second book shares that
// type, each gets its own tab labeled with its actual name.
type BookGroup = { key: string; label: string; chapters: Chapter[] }

function bookGroupKey(bookType: string | null | undefined, bookName: string | null | undefined): string {
  return `${bookType || 'textbook'}::${bookName || ''}`
}

function computeBookGroups(chapters: Chapter[]): BookGroup[] {
  const byType = new Map<string, Map<string, Chapter[]>>()
  for (const c of chapters) {
    const bt = c.book_type || 'textbook'
    const bn = c.book_name || ''
    if (!byType.has(bt)) byType.set(bt, new Map())
    const byName = byType.get(bt)!
    if (!byName.has(bn)) byName.set(bn, [])
    byName.get(bn)!.push(c)
  }
  const groups: BookGroup[] = []
  // Fixed order (not Map insertion order, which would depend on whatever
  // order chapters happen to arrive in) so tabs appear the same way here as
  // in the platform-admin curriculum page.
  for (const bt of ['textbook', 'handbook', 'workbook']) {
    const byName = byType.get(bt)
    if (!byName) continue
    const entries = Array.from(byName.entries())
    if (entries.length === 1) {
      const [bn, chs] = entries[0]
      groups.push({ key: bookGroupKey(bt, bn), label: BOOK_TYPE_LABELS[bt] || bt, chapters: chs })
    } else {
      let unnamedCount = 0
      for (const [bn, chs] of entries) {
        if (!bn) {
          unnamedCount += 1
          groups.push({ key: bookGroupKey(bt, bn), label: `${BOOK_TYPE_LABELS[bt] || bt} ${unnamedCount}`, chapters: chs })
        } else {
          groups.push({ key: bookGroupKey(bt, bn), label: bn, chapters: chs })
        }
      }
    }
  }
  return groups
}

type Subject = {
  subject: string
  total: number
  covered: number
  completion_pct: number
  chapters: Chapter[]
}

type Material = { id: number; material_type: 'textbook'; title: string; file_url: string }

type Props = {
  schoolId: number
  classId: number
  grade: string
}

function parseQuestions(raw: Topic['questions']): Question[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export default function StudentSyllabus({ schoolId, classId, grade }: Props) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSubject, setActiveSubject] = useState('')
  const [activeBookKey, setActiveBookKey] = useState('')
  const [activeTopic, setActiveTopic] = useState<Topic | null>(null)

  // Inline quiz-taking — ports the Ulearn prototype's openQuiz/submitQuiz: shuffle
  // the topic's approved question bank (master/school topics.questions), freeze a
  // subset of up to 3 for this attempt, score out of 10 on submit.
  const [quizTopic, setQuizTopic] = useState<Topic | null>(null)
  const [quizServed, setQuizServed] = useState<Question[]>([])
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({})
  // Session-only scoreboard: { [topicId]: score-out-of-10 }.
  // TODO: no backend endpoint exists to persist a topic-quiz attempt yet —
  // school_topic_progress has no score column and there is no
  // /api/.../quiz-attempt route (only the separate Weekly Test has a real
  // submission API). Scores here reset on page refresh; wire this to a real
  // endpoint once the backend adds one instead of fabricating one here.
  const [quizScores, setQuizScores] = useState<Record<number, number>>({})
  const [materials, setMaterials] = useState<Material[]>([])

  const { toast, flash } = useToast()

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

  function openQuiz(topic: Topic) {
    const bank = parseQuestions(topic.questions)
    const shuffled = [...bank]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    setQuizServed(shuffled.slice(0, Math.min(3, shuffled.length)))
    setQuizAnswers({})
    setQuizTopic(topic)
  }

  function closeQuiz() {
    setQuizTopic(null)
    setQuizServed([])
    setQuizAnswers({})
  }

  function submitQuiz() {
    if (!quizTopic || quizServed.length === 0) return
    const correct = quizServed.filter((q, i) => quizAnswers[i] === q.answer).length
    const score = Math.round((correct / quizServed.length) * 10)
    setQuizScores(prev => ({ ...prev, [quizTopic.id]: score }))
    flash(`Quiz submitted — ${score}/10 (${correct}/${quizServed.length} correct).`)
    closeQuiz()
  }

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

  // Books this subject actually has chapters for — only shown as a switcher
  // when there's more than one (subjects that were never split by book
  // render exactly like before).
  const bookGroups = computeBookGroups(subject.chapters)
  const effectiveBookKey = bookGroups.some(g => g.key === activeBookKey) ? activeBookKey : bookGroups[0]?.key ?? ''
  const effectiveGroup = bookGroups.find(g => g.key === effectiveBookKey) ?? null
  const chaptersForBook = bookGroups.length > 1 && effectiveGroup ? effectiveGroup.chapters : subject.chapters
  const bookTabLabel = (g: BookGroup) => {
    const badge = audienceBadge(g.chapters)
    return `${g.label}${badge ? ` · ${badge}` : ''}`
  }

  // Group chapters by semester when the subject uses them — falls back to a
  // single flat bucket (no header) for subjects that don't split by semester.
  const semesterGroups: { semester: string | null; chapters: Chapter[] }[] = chaptersForBook.some(c => c.semester)
    ? Object.values(
        chaptersForBook.reduce((acc, ch) => {
          const key = ch.semester || ' none'
          if (!acc[key]) acc[key] = { semester: ch.semester || null, chapters: [] }
          acc[key].chapters.push(ch)
          return acc
        }, {} as Record<string, { semester: string | null; chapters: Chapter[] }>)
      )
    : [{ semester: null, chapters: chaptersForBook }]

  // ── Quiz-taking panel ──
  if (quizTopic) {
    const answered = quizServed.length > 0 && quizServed.every((_, i) => quizAnswers[i] != null)
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <BackBtn onClick={closeQuiz} label={`${subject.subject} topics`} />
        <div>
          <h2 className="text-lg font-semibold" style={{ color: INK }}>Quiz &middot; {quizTopic.topic_name}</h2>
          <p className="text-sm text-gray-500">
            {quizServed.length} question{quizServed.length === 1 ? '' : 's'} from &quot;{quizTopic.chapter_name}&quot;. Pick one answer each.
          </p>
        </div>
        {quizServed.map((q, qi) => (
          <UlearnCard key={qi} className="p-4" borderColor={BORDER}>
            <div className="text-sm font-medium mb-3" style={{ color: INK }}>{qi + 1}. {q.q}</div>
            <div className="grid grid-cols-1 gap-1.5">
              {q.options.map((o, oi) => {
                const picked = quizAnswers[qi] === oi
                return (
                  <button
                    key={oi}
                    data-testid={`quiz-option-${qi}-${oi}`}
                    onClick={() => setQuizAnswers(prev => ({ ...prev, [qi]: oi }))}
                    className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border text-left transition-all"
                    style={{ background: picked ? '#E1F5EE' : 'white', borderColor: picked ? GREEN : BORDER, color: picked ? '#085041' : INK }}
                  >
                    <span className="w-4 h-4 rounded-full border flex items-center justify-center shrink-0" style={{ borderColor: picked ? GREEN : '#c9c6bd' }}>
                      {picked && <span className="w-2 h-2 rounded-full" style={{ background: GREEN }} />}
                    </span>
                    {o}
                  </button>
                )
              })}
            </div>
          </UlearnCard>
        ))}
        <button
          data-testid="quiz-submit-btn"
          onClick={submitQuiz}
          disabled={!answered}
          className="text-sm px-4 py-2 rounded-lg text-white font-medium disabled:opacity-40"
          style={{ background: GREEN }}
        >
          Submit quiz
        </button>
        <Toast message={toast} />
      </div>
    )
  }

  const allLocked = subject.chapters.every(c => c.topics.every(t => t.status !== 'covered'))

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="rounded-3xl p-4 sm:p-5" style={{ background: CREAM, border: `1px solid ${BORDER}` }}>
        <h2 className="text-lg font-semibold" style={{ color: INK }}>My learning</h2>
        <p className="text-sm text-gray-500 mt-0.5">Topics unlock as your teacher teaches them. Take the quiz once one&apos;s unlocked.</p>
      </div>

      <Pills items={subjectNames} value={activeSubject} onChange={setActiveSubject} color={GREEN} />

      {bookGroups.length > 1 && (
        <Pills
          items={bookGroups.map(g => bookTabLabel(g))}
          value={effectiveGroup ? bookTabLabel(effectiveGroup) : ''}
          onChange={(label) => {
            const g = bookGroups.find(x => bookTabLabel(x) === label)
            if (g) setActiveBookKey(g.key)
          }}
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
              const bank = parseQuestions(t.questions)
              const score = quizScores[t.id]
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
                  {score != null ? (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#E1F5EE', color: '#085041' }}>
                      your score {score}/10
                    </span>
                  ) : bank.length > 0 ? (
                    <button
                      data-testid={`topic-take-quiz-${t.id}`}
                      onClick={() => openQuiz(t)}
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg text-white font-medium"
                      style={{ background: GREEN }}
                    >
                      <HelpCircle size={12} /> Take quiz
                    </button>
                  ) : (
                    <QuizPill count={0} />
                  )}
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
      <Toast message={toast} />
    </div>
  )
}
