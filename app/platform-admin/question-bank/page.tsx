'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useConfirm } from '@/components/ui/use-confirm'

// Platform Admin → Question Bank (#432): one-time preparation of the Daily Quiz MCQs per subject.
// Pick board + grade → a subject → Prepare (optionally from its textbook; the cost is shown first) →
// Claude writes in the background and Groq checks every answer → spot-check here → Publish.
// Only published subjects ever reach students. Student reports land in "Reported questions".

const BOARDS = [
  { key: 'CBSE', label: 'CBSE' }, { key: 'AP_SSC', label: 'AP SSC' }, { key: 'TS_SSC', label: 'TS SSC' },
]
const GRADES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
const POLL_MS = 15_000

type Subject = {
  id: number; subject_name: string; topics: number; topics_ready: number; questions: number
  status: 'idle' | 'generating' | 'checking' | 'ready'; published_at: string | null; last_error: string | null; has_textbook: boolean
}
type TopicCount = { topic_id: number; topic_name: string; active: number; retired: number; pulled: number }
type ChapterJob = { status: 'queued' | 'generated' | 'done' | 'failed'; attempts: number; generated_count: number; kept_count: number; last_error: string | null }
type Detail = {
  subject: { id: number; board: string; grade: string; subject_name: string; language: string }
  bank: { status: Subject['status']; use_textbook: boolean; material_id: number | null; textbook_tokens: number | null; batch_submitted_at: string | null; last_error: string | null; published_at: string | null }
  textbooks: { id: number; title: string }[]
  open_reports: number
  target_per_topic: number
  min_ready_per_topic: number
  chapters: { chapter_id: number; chapter_name: string; job: ChapterJob | null; topics: TopicCount[] }[]
}
type Estimate = { imported: number; topics: number; topics_needing: number; chapters: number; questions_needed: number; textbook_tokens: number | null; estimated_max_usd: number }
type Question = {
  id: number; stem: string; options: string[]; correct_index: number; explanation: string | null
  difficulty: 'easy' | 'medium' | 'hard'; source: 'ai' | 'import' | 'admin'; status: 'active' | 'retired' | 'pulled'
  report_count: number; open_reports: { reason: string; note: string | null; created_at: string }[]
  topic_name?: string; subject_name?: string; board?: string; grade?: string
}

const STATUS_TEXT: Record<Subject['status'], string> = { idle: 'Not prepared', generating: 'Claude is writing…', checking: 'Checking answers…', ready: 'Ready to review' }
const STATUS_BADGE: Record<Subject['status'], string> = {
  idle: 'bg-gray-100 text-gray-600 border-gray-200', generating: 'bg-blue-50 text-blue-700 border-blue-200',
  checking: 'bg-blue-50 text-blue-700 border-blue-200', ready: 'bg-amber-50 text-amber-700 border-amber-200',
}
const REASON_TEXT: Record<string, string> = { wrong_answer: 'Wrong answer', unclear: 'Unclear', typo: 'Typo', other: 'Other' }
const LETTERS = ['A', 'B', 'C', 'D']
const running = (s: Subject['status']) => s === 'generating' || s === 'checking'

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error ?? 'Request failed')
  return d as T
}
const jsonPost = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export default function QuestionBankPage() {
  const { confirm, ConfirmDialog } = useConfirm()
  const [tab, setTab] = useState<'subjects' | 'reports'>('subjects')
  const [board, setBoard] = useState('CBSE')
  const [grade, setGrade] = useState('6')
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<number | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [materialId, setMaterialId] = useState<number | null>(null)
  const [est, setEst] = useState<Estimate | null>(null)
  const [openTopic, setOpenTopic] = useState<number | null>(null)

  const loadSubjects = useCallback(async () => {
    try {
      const d = await call<{ subjects: Subject[] }>(`/api/platform/quiz-bank?board=${encodeURIComponent(board)}&grade=${encodeURIComponent(grade)}`)
      setSubjects(d.subjects)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load subjects') }
    finally { setLoading(false) }
  }, [board, grade])

  const loadDetail = useCallback(async (id: number) => {
    try { setDetail(await call<Detail>(`/api/platform/quiz-bank/subjects/${id}`)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load subject') }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setLoading(true); setSelected(null); setDetail(null); void loadSubjects() }, [loadSubjects])

  function openSubject(s: Subject) {
    setSelected(s.id); setDetail(null); setEst(null); setOpenTopic(null); setNotice(''); setError('')
    setMaterialId(null)
    void loadDetail(s.id)
  }

  // While anything in view is being prepared, move it forward every few seconds and refresh what is shown.
  // One request at a time; the daily cron finishes the job if this screen is closed.
  const inFlight = useRef(false)
  const anyRunning = subjects.some(s => running(s.status)) || (detail ? running(detail.bank.status) : false)
  useEffect(() => {
    if (!anyRunning) return
    const t = window.setInterval(async () => {
      if (inFlight.current) return
      inFlight.current = true
      try {
        await call('/api/platform/quiz-bank/advance', { method: 'POST' })
        await loadSubjects()
        if (selected) await loadDetail(selected)
      } catch { /* shown on the next successful refresh; the cron retries anyway */ }
      finally { inFlight.current = false }
    }, POLL_MS)
    return () => window.clearInterval(t)
  }, [anyRunning, loadSubjects, loadDetail, selected])

  async function checkCost() {
    if (!detail) return
    setBusy(true); setError(''); setNotice(''); setEst(null)
    try {
      setEst(await call<Estimate>(`/api/platform/quiz-bank/subjects/${detail.subject.id}/estimate`, jsonPost({ material_id: materialId })))
      await loadDetail(detail.subject.id)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not estimate') }
    finally { setBusy(false) }
  }

  async function startPrep() {
    if (!detail || !est) return
    const ok = await confirm(
      `Claude will write about ${est.questions_needed} questions for ${est.topics_needing} topics in ${est.chapters} chapters${materialId ? ', reading the textbook' : ''}. Maximum cost about $${est.estimated_max_usd.toFixed(2)} (usually much less). Results usually arrive within an hour; you can close this page.`,
      { title: `Prepare ${detail.subject.subject_name}?`, confirmText: 'Start preparation' },
    )
    if (!ok) return
    setBusy(true); setError(''); setNotice('')
    try {
      const r = await call<{ chapters: number; topics: number }>(`/api/platform/quiz-bank/subjects/${detail.subject.id}/start`, jsonPost({ material_id: materialId }))
      setNotice(`Started: ${r.chapters} chapters sent to Claude. This page updates by itself.`)
      setEst(null)
      await Promise.all([loadDetail(detail.subject.id), loadSubjects()])
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not start') }
    finally { setBusy(false) }
  }

  async function togglePublish() {
    if (!detail) return
    const publish = !detail.bank.published_at
    const low = detail.chapters.flatMap(c => c.topics).filter(t => t.active < detail.min_ready_per_topic).length
    const ok = await confirm(
      publish
        ? `Students will start getting ${detail.subject.subject_name} questions in the daily quiz.${low ? ` ${low} topic(s) have fewer than ${detail.min_ready_per_topic} questions — they will repeat sooner.` : ''} Have you spot-checked a sample?`
        : `${detail.subject.subject_name} questions will stop appearing in the daily quiz.`,
      { title: publish ? 'Publish this subject?' : 'Unpublish this subject?', confirmText: publish ? 'Publish' : 'Unpublish', destructive: !publish },
    )
    if (!ok) return
    setBusy(true); setError(''); setNotice('')
    try {
      await call(`/api/platform/quiz-bank/subjects/${detail.subject.id}/publish`, jsonPost({ published: publish }))
      setNotice(publish ? 'Published. The daily quiz can now use these questions.' : 'Unpublished.')
      await Promise.all([loadDetail(detail.subject.id), loadSubjects()])
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not change publishing') }
    finally { setBusy(false) }
  }

  const allTopics = detail?.chapters.flatMap(c => c.topics) ?? []
  const lowTopics = detail ? allTopics.filter(t => t.active < detail.min_ready_per_topic).length : 0

  return (
    <div className="p-6 max-w-6xl">
      {ConfirmDialog}
      <h1 className="text-xl font-bold text-gray-900">Question Bank</h1>
      <p className="text-sm text-gray-500 mt-1">
        One-time preparation of the Daily Quiz questions per subject. Claude writes them, Groq checks every answer, you spot-check and publish.
        Only published subjects reach students.
      </p>

      <div className="flex gap-2 mt-5" role="tablist">
        {(['subjects', 'reports'] as const).map(t => (
          <button key={t} role="tab" aria-selected={tab === t} data-testid={`qbank-tab-${t}`} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-full text-sm border ${tab === t ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
            {t === 'subjects' ? 'Subjects' : 'Reported questions'}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert" data-testid="qbank-error">{error}</p>}
      {notice && <p className="mt-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2" data-testid="qbank-notice">{notice}</p>}

      {tab === 'reports' ? <ReportsTab onError={setError} /> : (
        <>
          <div className="flex flex-wrap gap-4 mt-5">
            <label className="text-xs text-gray-600">Board
              <select data-testid="qbank-board" value={board} onChange={e => setBoard(e.target.value)} className="block mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                {BOARDS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-600">Grade
              <select data-testid="qbank-grade" value={grade} onChange={e => setGrade(e.target.value)} className="block mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                {GRADES.map(g => <option key={g} value={g}>Grade {g}</option>)}
              </select>
            </label>
          </div>

          {loading ? <p className="mt-6 text-sm text-gray-500">Loading…</p>
            : subjects.length === 0 ? <p className="mt-6 text-sm text-gray-500" data-testid="qbank-empty">No academic subjects for this board and grade yet. Add the syllabus in Master Syllabus first.</p>
            : (
              <div className="mt-5 overflow-x-auto bg-white border border-gray-200 rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 text-left">
                    <tr><th className="px-4 py-2">Subject</th><th className="px-4 py-2">Topics ready</th><th className="px-4 py-2">Questions</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Live</th></tr>
                  </thead>
                  <tbody>
                    {subjects.map(s => (
                      <tr key={s.id} data-testid={`qbank-subject-${s.id}`} onClick={() => openSubject(s)}
                        className={`border-t border-gray-100 cursor-pointer hover:bg-purple-50/40 ${selected === s.id ? 'bg-purple-50/60' : ''}`}>
                        <td className="px-4 py-2 font-medium text-gray-900">{s.subject_name}{s.has_textbook && <span className="ml-2 text-[11px] text-gray-500">📘 textbook</span>}</td>
                        <td className="px-4 py-2">{s.topics_ready}/{s.topics}</td>
                        <td className="px-4 py-2">{s.questions}</td>
                        <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGE[s.status]}`}>{STATUS_TEXT[s.status]}</span></td>
                        <td className="px-4 py-2">{s.published_at ? <span className="text-xs text-green-700">● Published</span> : <span className="text-xs text-gray-400">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          {selected && !detail && <p className="mt-6 text-sm text-gray-500">Loading subject…</p>}
          {detail && (
            <section className="mt-6 bg-white border border-gray-200 rounded-xl p-5" data-testid="qbank-detail">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{detail.subject.subject_name} · Grade {detail.subject.grade} · {detail.subject.board}</h2>
                  <p className="text-xs text-gray-500 mt-1">
                    Questions in <strong className="capitalize">{detail.subject.language}</strong> · target {detail.target_per_topic} per topic ·
                    {' '}{lowTopics} of {allTopics.length} topic(s) below {detail.min_ready_per_topic}
                    {detail.open_reports > 0 && <> · <strong className="text-red-700">{detail.open_reports} open report(s)</strong></>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGE[detail.bank.status]}`} data-testid="qbank-detail-status">{STATUS_TEXT[detail.bank.status]}</span>
                  <button data-testid="qbank-publish" onClick={togglePublish} disabled={busy || running(detail.bank.status)}
                    className={`px-4 py-2 rounded-lg text-sm disabled:opacity-60 ${detail.bank.published_at ? 'border border-gray-300 text-gray-700 hover:bg-gray-50' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                    {detail.bank.published_at ? 'Unpublish' : 'Publish'}
                  </button>
                </div>
              </div>
              {detail.bank.last_error && <p className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" data-testid="qbank-last-error">{detail.bank.last_error}</p>}

              {!running(detail.bank.status) && (
                <div className="mt-4 rounded-lg border border-purple-200 bg-purple-50/40 p-4" data-testid="qbank-prepare">
                  <p className="text-sm font-semibold text-gray-800">{allTopics.some(t => t.active > 0) ? 'Top up questions' : 'Prepare questions'}</p>
                  <p className="text-xs text-gray-500 mt-1">Only topics below {detail.target_per_topic} questions are sent. Questions typed into Master Syllabus are imported first.</p>
                  <div className="flex flex-wrap items-end gap-3 mt-3">
                    <label className="text-xs text-gray-600">Source
                      <select data-testid="qbank-material" value={materialId ?? ''} onChange={e => { setMaterialId(e.target.value ? Number(e.target.value) : null); setEst(null) }}
                        className="block mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                        <option value="">Syllabus topics only (no textbook)</option>
                        {detail.textbooks.map(t => <option key={t.id} value={t.id}>Textbook: {t.title}</option>)}
                      </select>
                    </label>
                    <button data-testid="qbank-estimate" onClick={checkCost} disabled={busy}
                      className="px-4 py-2 rounded-lg text-sm border border-purple-300 text-purple-700 bg-white hover:bg-purple-50 disabled:opacity-60">
                      {busy && !est ? 'Checking…' : 'Check what it will do'}
                    </button>
                  </div>
                  {est && (
                    <div className="mt-3 text-sm text-gray-700" data-testid="qbank-estimate-result">
                      {est.imported > 0 && <p>Imported {est.imported} question(s) from Master Syllabus.</p>}
                      {est.chapters === 0 ? <p>Every topic already has {detail.target_per_topic} questions — nothing to prepare.</p> : (
                        <>
                          <p>{est.topics_needing} of {est.topics} topics need questions · {est.chapters} chapters · about {est.questions_needed} questions to write.</p>
                          {est.textbook_tokens && <p className="text-xs text-gray-500">Textbook size: {est.textbook_tokens.toLocaleString('en-IN')} tokens.</p>}
                          <p>Maximum cost: <strong>${est.estimated_max_usd.toFixed(2)}</strong> <span className="text-xs text-gray-500">(upper estimate; usually much less)</span></p>
                          <button data-testid="qbank-start" onClick={startPrep} disabled={busy}
                            className="mt-2 px-4 py-2 rounded-lg text-sm bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60">Start preparation</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
              {running(detail.bank.status) && (
                <p className="mt-4 text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2" data-testid="qbank-running">
                  {detail.bank.status === 'generating' ? 'Claude is writing the questions in the background (usually under an hour).' : 'Checking every answer with a second AI. Only questions both agree on are kept.'}
                  {' '}You can leave this page — it finishes by itself.
                </p>
              )}

              <div className="mt-5 space-y-4">
                {detail.chapters.map(ch => (
                  <div key={ch.chapter_id} data-testid={`qbank-chapter-${ch.chapter_id}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-800">{ch.chapter_name}</h3>
                      {ch.job && <ChapterJobBadge job={ch.job} />}
                    </div>
                    {ch.job?.status === 'failed' && ch.job.last_error && <p className="text-xs text-red-700 mt-1">{ch.job.last_error}</p>}
                    <ul className="mt-2 divide-y divide-gray-100 border border-gray-100 rounded-lg">
                      {ch.topics.map(t => (
                        <li key={t.topic_id}>
                          <button data-testid={`qbank-topic-${t.topic_id}`} onClick={() => setOpenTopic(openTopic === t.topic_id ? null : t.topic_id)}
                            className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-50">
                            <span className="text-gray-800">{t.topic_name}</span>
                            <span className="flex items-center gap-2 text-xs">
                              {t.pulled > 0 && <span className="text-red-700">{t.pulled} pulled</span>}
                              <span className={t.active >= detail.min_ready_per_topic ? 'text-green-700' : 'text-amber-700 font-semibold'}>{t.active}/{detail.target_per_topic}</span>
                            </span>
                          </button>
                          {openTopic === t.topic_id && <TopicQuestions topicId={t.topic_id} onChanged={() => { void loadDetail(detail.subject.id); void loadSubjects() }} onError={setError} />}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function ChapterJobBadge({ job }: { job: ChapterJob }) {
  const text = job.status === 'done' ? `✓ ${job.kept_count} of ${job.generated_count} kept`
    : job.status === 'failed' ? 'Failed' : job.status === 'generated' ? 'Checking…' : 'Waiting for Claude…'
  const tone = job.status === 'done' ? 'text-green-700' : job.status === 'failed' ? 'text-red-700' : 'text-blue-700'
  return <span className={`text-xs ${tone}`}>{text}</span>
}

function TopicQuestions({ topicId, onChanged, onError }: { topicId: number; onChanged: () => void; onError: (m: string) => void }) {
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const load = useCallback(async () => {
    try { setQuestions((await call<{ questions: Question[] }>(`/api/platform/quiz-bank/topics/${topicId}/questions`)).questions) }
    catch (e) { onError(e instanceof Error ? e.message : 'Failed to load questions') }
  }, [topicId, onError])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])
  if (!questions) return <p className="px-3 py-2 text-xs text-gray-500">Loading questions…</p>
  if (questions.length === 0) return <p className="px-3 py-2 text-xs text-gray-500" data-testid={`qbank-topic-empty-${topicId}`}>No questions yet.</p>
  return (
    <div className="px-3 pb-3 space-y-2" data-testid={`qbank-topic-questions-${topicId}`}>
      {questions.map(q => <QuestionCard key={q.id} q={q} onSaved={() => { void load(); onChanged() }} onError={onError} />)}
    </div>
  )
}

function QuestionCard({ q, onSaved, onError }: { q: Question; onSaved: () => void; onError: (m: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ stem: q.stem, options: [...q.options], correct_index: q.correct_index, explanation: q.explanation ?? '', difficulty: q.difficulty })

  async function save(body: Record<string, unknown>) {
    setBusy(true)
    try {
      await call(`/api/platform/quiz-bank/questions/${q.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      setEditing(false)
      onSaved()
    } catch (e) { onError(e instanceof Error ? e.message : 'Could not save') }
    finally { setBusy(false) }
  }

  const tone = q.status === 'pulled' ? 'border-red-200 bg-red-50/40' : q.status === 'retired' ? 'border-gray-200 bg-gray-50 opacity-70' : 'border-gray-200 bg-white'
  return (
    <div className={`rounded-lg border p-3 ${tone}`} data-testid={`qbank-question-${q.id}`}>
      {q.subject_name && <p className="text-[11px] text-gray-500 mb-1">{q.board} · Grade {q.grade} · {q.subject_name} · {q.topic_name}</p>}
      {!editing ? (
        <>
          <p className="text-sm text-gray-900">{q.stem}</p>
          <ol className="mt-1 grid sm:grid-cols-2 gap-x-4 text-sm">
            {q.options.map((o, i) => (
              <li key={i} className={i === q.correct_index ? 'text-green-700 font-semibold' : 'text-gray-700'}>{LETTERS[i]}. {o}{i === q.correct_index ? ' ✓' : ''}</li>
            ))}
          </ol>
          {q.explanation ? <p className="mt-1 text-xs text-gray-600">💡 {q.explanation}</p> : <p className="mt-1 text-xs text-gray-400">No explanation</p>}
          <p className="mt-1 text-[11px] text-gray-500">{q.difficulty} · {q.source === 'ai' ? 'AI, checked' : q.source === 'import' ? 'from Master Syllabus' : 'edited by admin'} · {q.status}</p>
          {q.open_reports.length > 0 && (
            <ul className="mt-1 text-xs text-red-700">
              {q.open_reports.map((r, i) => <li key={i}>⚑ {REASON_TEXT[r.reason] ?? r.reason}{r.note ? ` — “${r.note}”` : ''}</li>)}
            </ul>
          )}
          <div className="flex flex-wrap gap-2 mt-2">
            <button data-testid={`qbank-edit-${q.id}`} onClick={() => setEditing(true)} disabled={busy} className="text-xs text-purple-700 underline disabled:opacity-60">Edit</button>
            {q.status !== 'active' && <button data-testid={`qbank-restore-${q.id}`} onClick={() => save({ status: 'active' })} disabled={busy} className="text-xs text-green-700 underline disabled:opacity-60">Restore</button>}
            {q.status !== 'retired' && <button data-testid={`qbank-retire-${q.id}`} onClick={() => save({ status: 'retired' })} disabled={busy} className="text-xs text-gray-600 underline disabled:opacity-60">Retire</button>}
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <textarea data-testid={`qbank-edit-stem-${q.id}`} value={form.stem} maxLength={600} rows={2} onChange={e => setForm({ ...form, stem: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          {form.options.map((o, i) => (
            <label key={i} className="flex items-center gap-2 text-sm">
              <input type="radio" name={`correct-${q.id}`} data-testid={`qbank-edit-correct-${q.id}-${i}`} checked={form.correct_index === i} onChange={() => setForm({ ...form, correct_index: i })} />
              <span className="w-4 text-gray-500">{LETTERS[i]}</span>
              <input data-testid={`qbank-edit-option-${q.id}-${i}`} value={o} maxLength={200}
                onChange={e => { const options = [...form.options]; options[i] = e.target.value; setForm({ ...form, options }) }}
                className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm" />
            </label>
          ))}
          <textarea data-testid={`qbank-edit-explanation-${q.id}`} value={form.explanation} maxLength={800} rows={2} placeholder="Explanation shown to the student after answering"
            onChange={e => setForm({ ...form, explanation: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <select data-testid={`qbank-edit-difficulty-${q.id}`} value={form.difficulty} onChange={e => setForm({ ...form, difficulty: e.target.value as Question['difficulty'] })}
            className="border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white">
            <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
          </select>
          <div className="flex gap-2">
            <button data-testid={`qbank-edit-save-${q.id}`} disabled={busy}
              onClick={() => save({ stem: form.stem, options: form.options, correct_index: form.correct_index, explanation: form.explanation.trim() || null, difficulty: form.difficulty })}
              className="px-3 py-1.5 rounded-lg text-sm bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button>
            <button data-testid={`qbank-edit-cancel-${q.id}`} onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

function ReportsTab({ onError }: { onError: (m: string) => void }) {
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const load = useCallback(async () => {
    try { setQuestions((await call<{ questions: Question[] }>('/api/platform/quiz-bank/reports')).questions) }
    catch (e) { onError(e instanceof Error ? e.message : 'Failed to load reports') }
  }, [onError])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])
  if (!questions) return <p className="mt-6 text-sm text-gray-500">Loading…</p>
  if (questions.length === 0) return <p className="mt-6 text-sm text-gray-500" data-testid="qbank-reports-empty">No open reports from students.</p>
  return (
    <div className="mt-5 space-y-3" data-testid="qbank-reports">
      <p className="text-xs text-gray-500">Pulled questions are out of the daily quiz until you Restore (after fixing) or Retire them. Either action closes the reports.</p>
      {questions.map(q => <QuestionCard key={q.id} q={q} onSaved={() => void load()} onError={onError} />)}
    </div>
  )
}
