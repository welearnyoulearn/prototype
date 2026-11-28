'use client'

// Student Search (#538): Google's Programmable Search box with one card above the results: a maths or unit answer,
// a word meaning, or a Wikipedia summary. Under a Wikipedia summary comes a textbook card.
//
// Order matters. Every search is first saved by our server, which checks consent and the word list; only an
// accepted search is handed to Google. Enter and the search button are caught before Google's own listeners,
// because even its ad requests carry whatever words it is given.
import { useCallback, useEffect, useRef, useState } from 'react'
import { calculate, type Answer } from '@/lib/studentSearch/calculator'
import { readMeanings, wordRequest, type WordRequest } from '@/lib/studentSearch/dictionary'
import { checkQuery, STUDENT_MESSAGES, type SearchFlag } from '@/lib/studentSearch/safety'
import type { ChapterMatch } from '@/lib/studentSearch/textbooks'
import { cleanExtract, wikipediaLookup } from '@/lib/studentSearch/wikipedia'
import { AnswerCard, GoogleAiButton, TextbookCard, WordCard, type Word } from './SearchAnswerCards'
import SearchKeyboard from './SearchKeyboard'
import { StudentPageIntro } from './StudentExperience'
import WikipediaCard, { type Article } from './WikipediaCard'

type SearchElement = { execute: (query: string) => void }
type ElementConfig = { div: string; tag: string; gname: string; attributes: Record<string, string | boolean> }
type CseApi = { render: (...configs: ElementConfig[]) => void; getElement: (gname: string) => SearchElement | null }
type CseWindow = Window & {
  google?: { search?: { cse?: { element?: CseApi } } }
  wlylAcceptedSearch?: string
  __gcse?: { parsetags: 'explicit'; initializationCallback: () => void; searchCallbacks: { web: { starting: (gname: string, query: string) => string } } }
}
type Status = 'loading' | 'ready' | 'off' | 'unavailable'

const GNAME = 'wlylSearch'
const BOX_ID = 'wlyl-search-box'
const RESULTS_ID = 'wlyl-search-results'
// Sent to Google if it ever starts a search we did not accept, so those words are not used for results.
const PLACEHOLDER = 'wlylblockedsearch'
const TOPICS = ['Photosynthesis', 'Water cycle', 'Fractions', 'Solar system']

async function wikipediaSummary(query: string): Promise<Article | null> {
  const { language, topic } = wikipediaLookup(query)
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*', generator: 'search', gsrsearch: topic, gsrlimit: '1',
    prop: 'extracts|pageimages|info|pageprops', exintro: '1', explaintext: '1', piprop: 'thumbnail', pithumbsize: '320', inprop: 'url', ppprop: 'wikibase_item',
  })
  const res = await fetch(`https://${language}.wikipedia.org/w/api.php?${params}`, {
    headers: { 'Api-User-Agent': 'WLYL-StudentSearch/1.0' }, referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Wikipedia returned ${res.status}`)
  const data: { query?: { pages?: { title: string; extract?: string; fullurl: string; thumbnail?: { source: string }; pageprops?: { wikibase_item?: string } }[] } } = await res.json()
  const page = data.query?.pages?.[0]
  // SafeSearch does not cover Wikipedia, so an innocent search that lands on an unsuitable article shows no card.
  if (!page?.extract || checkQuery(`${page.title} ${page.extract}`) === 'adult') return null
  const paragraphs = page.extract.split('\n').map(cleanExtract).filter(Boolean)
  if (!paragraphs.length) return null
  return { language, title: page.title, paragraphs, url: page.fullurl, image: page.thumbnail?.source ?? null, item: page.pageprops?.wikibase_item ?? null }
}

async function wordMeanings({ word, language }: WordRequest): Promise<Word | null> {
  const res = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word.replace(/ /g, '_'))}`, {
    headers: { 'Api-User-Agent': 'WLYL-StudentSearch/1.0' }, referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(8000),
  })
  if (res.status === 404) return null // no such word
  if (!res.ok) throw new Error(`Wiktionary returned ${res.status}`)
  const meanings = readMeanings(await res.json(), language)
  return meanings.length ? { word, language, meanings } : null
}

async function schoolChapters(query: string): Promise<ChapterMatch[]> {
  const res = await fetch('/api/student/search/textbooks', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Textbook search returned ${res.status}`)
  const data: { chapters: ChapterMatch[] } = await res.json()
  return data.chapters
}

type Props = {
  /** False when the student may not open the Digital Library; only the NCERT link is shown then. */
  schoolBooks: boolean
  /** A question the AI Tutor could not answer, to search once. A new `id` means a new question. */
  tutorQuestion: { query: string; id: number } | null
  onBackToTutor: () => void
}

export default function StudentSearch({ schoolBooks, tutorQuestion, onBackToTutor }: Props) {
  const [status, setStatus] = useState<Status>('loading')
  const [engineId, setEngineId] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<SearchFlag | null>(null)
  const [article, setArticle] = useState<Article | null>(null)
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [word, setWord] = useState<Word | null>(null)
  // null = no textbook card (nothing searched yet, or the search has its own answer or meaning card).
  const [chapters, setChapters] = useState<ChapterMatch[] | null>(null)
  const [problem, setProblem] = useState('')
  const [searched, setSearched] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const latest = useRef(0)
  const [fromTutor, setFromTutor] = useState(false)
  // The Google AI button: whether this student may have it, and the accepted search it belongs to.
  const [aiButton, setAiButton] = useState(false)
  const [accepted, setAccepted] = useState<{ id: number; query: string } | null>(null)
  const tutorSearched = useRef(0)

  useEffect(() => {
    fetch('/api/student/search', { cache: 'no-store' })
      .then(async r => {
        if (!r.ok) throw new Error(`Search status returned ${r.status}`)
        const data: { allowed: boolean; aiButton: boolean; engineId: string | null } = await r.json()
        setAiButton(data.aiButton)
        if (!data.allowed) setStatus('off')
        else if (!data.engineId) setStatus('unavailable')
        else setEngineId(data.engineId)
      })
      .catch(err => { console.error('[student search]', err); setStatus('unavailable') })
  }, [])

  const submit = useCallback(async (raw: string, forTutor = false) => {
    const text = raw.trim().slice(0, 200)
    if (!text) return
    const turn = ++latest.current
    setFromTutor(forTutor)
    setProblem('')
    setArticle(null)
    setAnswer(null)
    setWord(null)
    setChapters(null)
    setBlocked(null)
    setAccepted(null)
    try {
      const res = await fetch('/api/student/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: text }) })
      const data: { id?: number; flag?: SearchFlag | null; error?: string; code?: string } = await res.json()
      if (turn !== latest.current) return
      if (data.code === 'NO_CONSENT') { setStatus('off'); return }
      if (!res.ok) { setSearched(false); setProblem(data.error ?? 'Search didn’t work. Try again.'); return }
      if (data.flag) { setSearched(false); setBlocked(data.flag); return }
      if (data.id) setAccepted({ id: data.id, query: text })
    } catch (err) {
      console.error('[student search]', err)
      setSearched(false)
      setProblem('Search didn’t work. Check your connection and try again.')
      return
    }
    // Google's script lives for the whole page, so the accepted words are kept on the page too, not in this module,
    // which a development reload replaces.
    ;(window as CseWindow).wlylAcceptedSearch = text
    setSearched(true)
    ;(window as CseWindow).google?.search?.cse?.element?.getElement(GNAME)?.execute(text)
    // One card at most. A sum is answered here, so its words go to no card service.
    const worked = calculate(text)
    if (worked) { setAnswer(worked); return }
    // The card is an extra: if its service fails, the search results still show.
    const asked = wordRequest(text)
    if (asked) {
      wordMeanings(asked)
        .then(found => { if (turn === latest.current) setWord(found) })
        .catch(err => console.error('[student search] Wiktionary', err))
      return
    }
    wikipediaSummary(text)
      .then(found => { if (turn === latest.current) setArticle(found) })
      .catch(err => console.error('[student search] Wikipedia', err))
    setChapters([])
    if (schoolBooks) {
      schoolChapters(text)
        .then(found => { if (turn === latest.current) setChapters(found) })
        .catch(err => console.error('[student search] textbooks', err))
    }
  }, [schoolBooks])

  // keepalive: the note is still sent if the phone switches straight to Google.
  const noteAiOpened = (id: number) => {
    fetch('/api/student/search/ai-open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }), keepalive: true })
      .then(r => {
        if (r.status === 403) setAiButton(false) // switched off since the screen loaded
        if (!r.ok) throw new Error(`Opening was not saved: ${r.status}`)
      })
      .catch(err => console.error('[student search] Google AI button', err))
  }

  // Load Google's element once the student is allowed to search.
  useEffect(() => {
    if (!engineId) return
    const page = window as CseWindow
    const timer = window.setTimeout(() => setStatus(s => (s === 'loading' ? 'unavailable' : s)), 10_000)
    const render = () => {
      const api = page.google?.search?.cse?.element
      if (!api || !document.getElementById(BOX_ID)) return
      const attributes = {
        safeSearch: 'active', enableHistory: false, enableAutoComplete: false, linkTarget: '_blank', overlayResults: false,
        queryParameterName: 'wlyl_search_q', // so nothing in the portal's address starts a search
        noResultsString: 'No results found. Try different or fewer words.',
      }
      api.render(
        { div: BOX_ID, tag: 'searchbox', gname: GNAME, attributes },
        { div: RESULTS_ID, tag: 'searchresults-only', gname: GNAME, attributes },
      )
      document.querySelector(`#${BOX_ID} input.gsc-input`)?.setAttribute('aria-label', 'Search')
      window.clearTimeout(timer)
      setStatus('ready')
    }
    // Google runs a search found in the address fragment as it loads, which would skip our check.
    if (window.location.hash.includes('gsc.')) history.replaceState(history.state, '', window.location.pathname + window.location.search)
    if (page.google?.search?.cse?.element) render()
    else {
      page.__gcse = {
        parsetags: 'explicit',
        initializationCallback: render,
        searchCallbacks: { web: { starting: (_gname, query) => (query.trim() === page.wlylAcceptedSearch ? query : PLACEHOLDER) } },
      }
      const script = document.createElement('script')
      script.async = true
      script.src = `https://cse.google.com/cse.js?cx=${encodeURIComponent(engineId)}`
      script.onerror = () => { window.clearTimeout(timer); setStatus('unavailable') }
      document.head.appendChild(script)
    }
    return () => window.clearTimeout(timer)
  }, [engineId])

  // Catch every typed search before Google's listeners see it.
  useEffect(() => {
    const guard = (event: Event) => {
      const box = containerRef.current?.querySelector(`#${BOX_ID}`)
      const target = event.target
      if (!box || !(target instanceof Element) || !box.contains(target)) return
      const enter = event instanceof KeyboardEvent && event.key === 'Enter'
      const button = event.type === 'click' && target.closest('button') !== null
      if (!enter && !button && event.type !== 'submit') return
      event.preventDefault()
      event.stopImmediatePropagation()
      // One key press raises several events; act on the first.
      if (event.type === 'keydown' || event.type === 'click') void submit(box.querySelector<HTMLInputElement>('input.gsc-input')?.value ?? '')
    }
    const types = ['keydown', 'keypress', 'keyup', 'click', 'submit'] as const
    types.forEach(type => window.addEventListener(type, guard, true))
    return () => types.forEach(type => window.removeEventListener(type, guard, true))
  }, [submit])

  // Google creates the input inside our container once its script has run.
  const searchInput = useCallback(() => containerRef.current?.querySelector<HTMLInputElement>(`#${BOX_ID} input.gsc-input`) ?? null, [])

  // The tutor's question goes through the same checks, consent and history as a typed search.
  useEffect(() => {
    if (status !== 'ready' || !tutorQuestion || tutorSearched.current === tutorQuestion.id) return
    tutorSearched.current = tutorQuestion.id
    const input = searchInput()
    if (input) input.value = tutorQuestion.query
    void submit(tutorQuestion.query, true)
  }, [status, tutorQuestion, searchInput, submit])

  const pickTopic = (topic: string) => {
    const input = searchInput()
    if (input) input.value = topic
    void submit(topic)
  }

  const message = blocked ? STUDENT_MESSAGES[blocked] : null

  return (
    <div ref={containerRef} className="mx-auto max-w-4xl space-y-5" data-testid="student-search">
      <StudentPageIntro eyebrow="Learning" title="Search" sticker="magnifying-glass" tone="blue" description="Look something up for your studies." />

      {status === 'off' ? (
        <p className="rounded-2xl border bg-white p-4 text-sm" role="status" data-testid="student-search-off">Search is turned off. Ask your parent to turn it on in the parent portal.</p>
      ) : (
        <>
          <p className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm" data-testid="student-search-notice">
            <strong>Your parents can see what you search.</strong> Searches are kept for 30 days and are sent to Google, and some to Wikipedia or its dictionary, Wiktionary. Don’t type your name, phone number or address.
          </p>
          {status === 'loading' && <p className="text-sm text-gray-600" role="status">Loading search…</p>}
          {status === 'unavailable' && <p className="rounded-2xl border bg-white p-4 text-sm" role="status" data-testid="student-search-unavailable">Search isn’t available right now. Please try again later.</p>}

          {fromTutor && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm" role="status" data-testid="student-search-from-tutor">
              <p><strong>AI Tutor couldn’t answer, so your question was searched.</strong> Your parents can see this search.</p>
              <button type="button" onClick={onBackToTutor} className="min-h-10 rounded-full border bg-white px-4 font-bold" data-testid="student-search-back-to-tutor">Back to AI Tutor</button>
            </div>
          )}
          {/* Google draws inside these two; React never renders children into them. */}
          {/* The portal's own input styling must not draw a second box inside Google's. */}
          <style>{`#${BOX_ID} input.gsc-input { border: 0 !important; box-shadow: none !important; background-color: transparent !important; }`}</style>
          <div id={BOX_ID} data-testid="student-search-box" />
          {status === 'ready' && <SearchKeyboard getInput={searchInput} onSearch={query => void submit(query)} />}
          {status === 'ready' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-600">Try:</span>
              {TOPICS.map(topic => (
                <button key={topic} type="button" onClick={() => pickTopic(topic)} className="min-h-10 rounded-full border bg-white px-4 text-sm hover:bg-gray-50"
                  data-testid={`student-search-topic-${topic.toLowerCase().replace(' ', '-')}`}>{topic}</button>
              ))}
            </div>
          )}

          {problem && <p className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm" role="alert" data-testid="student-search-problem">{problem}</p>}
          {message && (
            <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5" role="alert" data-testid="student-search-stopped">
              <h2 className="text-lg font-bold">{message.title}</h2>
              <p className="mt-1 text-sm">{message.body}</p>
            </section>
          )}
          {answer && <AnswerCard answer={answer} />}
          {word && <WordCard word={word} />}
          {article && <WikipediaCard key={article.url} article={article} />}
          {chapters && <TextbookCard chapters={chapters} />}
          {aiButton && accepted && <GoogleAiButton query={accepted.query} onOpen={() => noteAiOpened(accepted.id)} />}
          <div id={RESULTS_ID} hidden={!searched} data-testid="student-search-results" />
          <p className="text-xs text-gray-600">Websites you open are outside school search. Check important facts in your textbook.</p>
        </>
      )}
    </div>
  )
}
