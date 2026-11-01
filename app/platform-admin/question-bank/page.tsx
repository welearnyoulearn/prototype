'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, ChevronDown } from 'lucide-react'
import { useConfirm } from '@/components/ui/use-confirm'
import InfoTip from '@/components/ui/InfoTip'

// Platform Admin → Question Bank (#432): one-time preparation of the Daily Quiz MCQs per subject.
// Pick board + grade → a subject → Prepare (optionally from its textbook; the cost is shown first) →
// Claude writes in the background and Groq checks every answer → spot-check here → Publish.
// Only published subjects ever reach students. Student reports land in "Reported questions".
// "Needs questions" lists older syllabus that was never prepared, across every board and class (#463).

const BOARDS = [
  { key: 'CBSE', label: 'CBSE' }, { key: 'AP_SSC', label: 'AP SSC' }, { key: 'TS_SSC', label: 'TS SSC' },
]
const GRADES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
const POLL_MS = 15_000

const TABS = [
  { key: 'subjects', label: 'Subjects', tip: 'Every subject of the chosen board and grade, with how many of its topics already have enough questions; click one to review, edit, prepare or publish its questions.' },
  { key: 'needs', label: 'Needs questions', tip: 'Subjects on any board or grade whose topics still do not have enough questions, so you can start writing them by hand.' },
  { key: 'schools', label: 'Schools’ own topics', tip: 'Topics a school added itself (not from Master Syllabus), how many already have their own questions, and any that failed.' },
  { key: 'reports', label: 'Reported questions', tip: 'Questions students flagged as wrong, unclear or a typo; three reports take a question out of use until you fix or retire it.' },
] as const

/** Smooth scrolling, unless the person asked their device for less motion. */
function scrollToEl(el: HTMLElement | null) {
  if (!el) return
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}

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
  usage: { input_tokens: number; output_tokens: number; usd: number }
  target_per_topic: number
  min_ready_per_topic: number
  chapters: { chapter_id: number; chapter_name: string; job: ChapterJob | null; topics: TopicCount[] }[]
}
type Estimate = { provider: 'anthropic' | 'omniroute'; imported: number; topics: number; topics_needing: number; chapters: number; questions_needed: number; textbook_tokens: number | null; textbook_too_long: boolean; max_textbook_tokens: number; estimated_max_usd: number }
type NeedsRow = { id: number; board: string; grade: string; subject_name: string; topics: number; topics_ready: number; status: Subject['status'] }
type Question = {
  id: number; stem: string; options: string[]; correct_index: number; explanation: string | null
  difficulty: 'easy' | 'medium' | 'hard'; source: 'ai' | 'import' | 'admin'; status: 'active' | 'retired' | 'pulled'
  report_count: number; open_reports: { reason: string; note: string | null; created_at: string }[]
  topic_name?: string; subject_name?: string; board?: string; grade?: string
}

const STATUS_TEXT: Record<Subject['status'], string> = { idle: 'Not prepared', generating: 'Claude is writing…', checking: 'Checking answers…', ready: 'Ready' }
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
  const [tab, setTab] = useState<'subjects' | 'needs' | 'schools' | 'reports'>('subjects')
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
  // A subject picked on the "Needs questions" tab: open it as soon as its board/grade list has loaded.
  const pendingOpen = useRef<number | null>(null)
  // Clicking a subject opens its panel below the table, off screen on a long list: scroll to it (#480).
  const detailAnchor = useRef<HTMLDivElement | null>(null)
  const listAnchor = useRef<HTMLDivElement | null>(null)
  const scrolledDetail = useRef<number | null>(null)

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

  useEffect(() => {
    if (selected !== null) scrollToEl(detailAnchor.current)
  }, [selected])
  // Once the subject has loaded, the panel is its full height: scroll again so its top is what you see.
  useEffect(() => {
    if (detail && detail.subject.id === selected && scrolledDetail.current !== selected) {
      scrolledDetail.current = selected
      scrollToEl(detailAnchor.current)
    }
  }, [detail, selected])

  useEffect(() => {
    if (pendingOpen.current === null) return
    const s = subjects.find(x => x.id === pendingOpen.current)
    if (!s) return
    pendingOpen.current = null
    openSubject(s)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects])

  function openNeeded(r: NeedsRow) {
    pendingOpen.current = r.id
    setBoard(r.board); setGrade(r.grade); setTab('subjects')
  }

  function openSubject(s: Subject) {
    scrolledDetail.current = null
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
      `Claude will write about ${est.questions_needed} questions for ${est.topics_needing} topics in ${est.chapters} chapters${materialId && est.provider === 'anthropic' ? ', reading the textbook' : ''}. ${est.provider === 'omniroute' ? 'It goes through OmniRoute, so the cost is what your OmniRoute plan charges; the tokens used are shown on the subject afterwards.' : `Maximum cost about $${est.estimated_max_usd.toFixed(2)} (usually much less).`} Results usually arrive within an hour; you can close this page.`,
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

  async function changeLanguage(language: string) {
    if (!detail) return
    setBusy(true); setError(''); setNotice('')
    try {
      await call(`/api/platform/quiz-bank/subjects/${detail.subject.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language }) })
      setNotice('Language saved. New questions for this subject are written in it; existing ones keep theirs.')
      await loadDetail(detail.subject.id)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not change the language') }
    finally { setBusy(false) }
  }

  async function togglePublish() {
    if (!detail) return
    const publish = !detail.bank.published_at
    const low = detail.chapters.flatMap(c => c.topics).filter(t => t.active < detail.min_ready_per_topic).length
    const ok = await confirm(
      publish
        ? `Students will start getting ${detail.subject.subject_name} questions in the daily quiz.${low ? ` ${low} topic(s) have fewer than ${detail.min_ready_per_topic} questions — they will repeat sooner.` : ''} Have you spot-checked a sample?`
        : `${detail.subject.subject_name} questions will stop appearing in the daily quiz, and it stays offline until you publish it again (automatic publishing won’t bring it back).`,
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
      <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500">
        Questions are written automatically when topics are imported or added in Master Syllabus ({detail?.target_per_topic ?? 8} per topic), checked by a
        second AI model, and published once they pass. Use the tabs to watch progress, review and edit questions, and start older subjects by hand.
      </p>

      <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Question bank sections">
        {TABS.map(t => {
          const active = tab === t.key
          return (
            <div key={t.key} className={`inline-flex items-center rounded-full border transition-colors ${active ? 'border-purple-600 bg-purple-600' : 'border-gray-300 bg-white hover:bg-gray-50'}`}>
              <button role="tab" aria-selected={active} data-testid={`qbank-tab-${t.key}`} onClick={() => setTab(t.key)}
                className={`rounded-l-full py-1.5 pl-4 pr-1 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${active ? 'text-white' : 'text-gray-700'}`}>
                {t.label}
              </button>
              <span className="pr-1"><InfoTip label={t.label} text={t.tip} tone={active ? 'onDark' : 'default'} testId={`qbank-tip-${t.key}`} /></span>
            </div>
          )
        })}
      </div>

      {error && <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert" data-testid="qbank-error">{error}</p>}
      {notice && <p className="mt-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2" data-testid="qbank-notice">{notice}</p>}

      {tab === 'reports' ? <ReportsTab onError={setError} /> : tab === 'needs' ? <NeedsTab onError={setError} onOpen={openNeeded} /> : tab === 'schools' ? <SchoolTopicsTab onError={setError} /> : (
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
              <div ref={listAnchor} className="mt-5 scroll-mt-20">
                <p className="mb-2 text-xs text-gray-500">Click a subject to open its panel below: language, prepare or top up questions, publish, and every topic.</p>
                <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <tr>
                        <th scope="col" className="px-4 py-2.5">Subject</th>
                        <th scope="col" className="px-4 py-2.5">Topics ready</th>
                        <th scope="col" className="px-4 py-2.5">Questions</th>
                        <th scope="col" className="px-4 py-2.5">Status</th>
                        <th scope="col" className="px-4 py-2.5">Live</th>
                        <th scope="col" className="w-10 px-2 py-2.5"><span className="sr-only">Open</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {subjects.map(s => {
                        const pct = s.topics ? Math.round((s.topics_ready / s.topics) * 100) : 0
                        const isOpen = selected === s.id
                        return (
                          <tr key={s.id} data-testid={`qbank-subject-${s.id}`} onClick={() => openSubject(s)}
                            className={`cursor-pointer border-t border-gray-100 transition-colors hover:bg-purple-50/50 ${isOpen ? 'bg-purple-50/70 shadow-[inset_3px_0_0_#9333ea]' : ''}`}>
                            <td className="px-4 py-3">
                              <button type="button" aria-expanded={isOpen} onClick={e => { e.stopPropagation(); openSubject(s) }}
                                className="text-left font-semibold text-gray-900 outline-none hover:text-purple-700 focus-visible:underline">
                                {s.subject_name}
                              </button>
                              {s.has_textbook && <span className="ml-2 text-[11px] font-normal text-gray-500">📘 textbook</span>}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100" role="img" aria-label={`${s.topics_ready} of ${s.topics} topics ready`}>
                                  <div className={`h-full rounded-full ${pct >= 100 ? 'bg-green-500' : pct > 0 ? 'bg-amber-400' : 'bg-gray-300'}`} style={{ width: `${Math.max(pct, s.topics_ready > 0 ? 4 : 0)}%` }} />
                                </div>
                                <span className="tabular-nums text-xs text-gray-600">{s.topics_ready}/{s.topics}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 tabular-nums">{s.questions}</td>
                            <td className="px-4 py-3"><span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_BADGE[s.status]}`}>{STATUS_TEXT[s.status]}</span></td>
                            <td className="px-4 py-3">{s.published_at ? <span className="text-xs font-medium text-green-700">● Published</span> : <span className="text-xs text-gray-400">Not live</span>}</td>
                            <td className="px-2 py-3 text-gray-400"><ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180 text-purple-600' : ''}`} aria-hidden="true" /></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          {selected !== null && <div ref={detailAnchor} className="scroll-mt-20" />}
          {selected && !detail && (
            <div className="mt-6 min-h-[70vh] rounded-xl border border-dashed border-gray-200 bg-white/60 p-5" aria-busy="true">
              <p className="text-sm text-gray-500">Loading subject…</p>
            </div>
          )}
          {detail && (
            <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm" data-testid="qbank-detail">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <button type="button" onClick={() => scrollToEl(listAnchor.current)} data-testid="qbank-back-to-list"
                    className="mb-2 inline-flex items-center gap-1 rounded-full text-xs font-medium text-purple-700 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-purple-400">
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /> Back to the subject list
                  </button>
                  <h2 className="text-lg font-semibold text-gray-900">{detail.subject.subject_name} · Grade {detail.subject.grade} · {detail.subject.board}</h2>
                  <p className="text-xs text-gray-500 mt-1">
                    <label className="inline-flex items-center gap-1">Questions in
                      <select data-testid="qbank-language" value={detail.subject.language} disabled={busy} onChange={e => changeLanguage(e.target.value)}
                        className="border border-gray-300 rounded px-1 py-0.5 text-xs bg-white">
                        <option value="english">English</option><option value="telugu">Telugu</option><option value="hindi">Hindi</option>
                      </select>
                    </label>
                    {' '}· target {detail.target_per_topic} per topic ·
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
              {detail.usage.output_tokens > 0 && (
                <p className="mt-2 text-xs text-gray-500" data-testid="qbank-usage">
                  Claude has used {detail.usage.input_tokens.toLocaleString('en-IN')} input and {detail.usage.output_tokens.toLocaleString('en-IN')} output tokens
                  for this subject so far (about ${detail.usage.usd.toFixed(2)}).
                </p>
              )}
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
                          {est.textbook_too_long && <p className="text-xs text-red-700" data-testid="qbank-textbook-too-long">This textbook is longer than the {est.max_textbook_tokens.toLocaleString('en-IN')} tokens Claude can read here. Choose “Syllabus topics only”, or upload a shorter book.</p>}
                          {est.provider === 'omniroute'
                            ? <p className="text-xs text-gray-500">Written through OmniRoute (Claude Haiku 4.5), one topic at a time, with textbook excerpts found by search. Cost is what your OmniRoute plan charges; the tokens used show on the subject afterwards.</p>
                            : <p>Maximum cost: <strong>${est.estimated_max_usd.toFixed(2)}</strong> <span className="text-xs text-gray-500">(upper estimate; usually much less)</span></p>}
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

type SchoolTopicsRow = { school_id: number; school_name: string; topics: number; topics_ready: number; chapters_in_progress: number; chapters_failed: number; last_error: string | null }

/** Schools' own (custom) topics: questions are made for them automatically, for that school only (#444). */
function NeedsTab({ onError, onOpen }: { onError: (m: string) => void; onOpen: (r: NeedsRow) => void }) {
  const [rows, setRows] = useState<NeedsRow[] | null>(null)
  const load = useCallback(async () => {
    try { setRows((await call<{ subjects: NeedsRow[] }>('/api/platform/quiz-bank/needs')).subjects) }
    catch (e) { onError(e instanceof Error ? e.message : 'Failed to load subjects') }
  }, [onError])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])
  if (!rows) return <p className="mt-6 text-sm text-gray-500">Loading…</p>
  if (rows.length === 0) return <p className="mt-6 text-sm text-gray-500" data-testid="qbank-needs-empty">Every subject in Master Syllabus has questions.</p>
  return (
    <div className="mt-5 overflow-x-auto bg-white border border-gray-200 rounded-xl" data-testid="qbank-needs">
      <p className="px-4 pt-3 text-xs text-gray-500">Subjects whose topics don’t have enough questions yet (older syllabus, or a run that failed). Pick one to check the cost and start it.</p>
      <table className="w-full text-sm mt-2">
        <thead className="bg-gray-50 text-xs text-gray-500 text-left">
          <tr><th className="px-4 py-2">Subject</th><th className="px-4 py-2">Board</th><th className="px-4 py-2">Grade</th><th className="px-4 py-2">Topics ready</th><th className="px-4 py-2">Status</th></tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} data-testid={`qbank-needs-${r.id}`} onClick={() => onOpen(r)} className="border-t border-gray-100 cursor-pointer hover:bg-purple-50/40">
              <td className="px-4 py-2 font-medium text-gray-900">{r.subject_name}</td>
              <td className="px-4 py-2">{BOARDS.find(b => b.key === r.board)?.label ?? r.board}</td>
              <td className="px-4 py-2">{r.grade}</td>
              <td className="px-4 py-2">{r.topics_ready}/{r.topics}</td>
              <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGE[r.status]}`}>{STATUS_TEXT[r.status]}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SchoolTopicsTab({ onError }: { onError: (m: string) => void }) {
  const [rows, setRows] = useState<SchoolTopicsRow[] | null>(null)
  const load = useCallback(async () => {
    try { setRows((await call<{ schools: SchoolTopicsRow[] }>('/api/platform/quiz-bank/school-topics')).schools) }
    catch (e) { onError(e instanceof Error ? e.message : 'Failed to load schools’ topics') }
  }, [onError])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])
  if (!rows) return <p className="mt-6 text-sm text-gray-500">Loading…</p>
  if (rows.length === 0) return <p className="mt-6 text-sm text-gray-500" data-testid="qbank-schools-empty">No school has added its own topics yet.</p>
  return (
    <div className="mt-5 overflow-x-auto bg-white border border-gray-200 rounded-xl" data-testid="qbank-schools">
      <p className="px-4 pt-3 text-xs text-gray-500">Topics a school adds itself get their own questions (same Claude + Groq check), used only by that school. Failed chapters are retried automatically.</p>
      <table className="mt-2 w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500 text-left">
          <tr><th className="px-4 py-2">School</th><th className="px-4 py-2">Own topics ready</th><th className="px-4 py-2">Being prepared</th><th className="px-4 py-2">Problems</th></tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.school_id} className="border-t border-gray-100" data-testid={`qbank-school-${r.school_id}`}>
              <td className="px-4 py-2 font-medium text-gray-900">{r.school_name}</td>
              <td className="px-4 py-2">{r.topics_ready}/{r.topics}</td>
              <td className="px-4 py-2">{r.chapters_in_progress ? `${r.chapters_in_progress} chapter(s)` : '—'}</td>
              <td className="px-4 py-2">{r.chapters_failed ? <span className="text-amber-800" title={r.last_error ?? ''}>{r.chapters_failed} chapter(s) failed</span> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
