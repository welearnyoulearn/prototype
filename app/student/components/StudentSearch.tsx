'use client'

// Student Search (#538): Google's Programmable Search box with a Wikipedia summary above the results.
//
// Order matters. Every search is first saved by our server, which checks consent and the word list; only an
// accepted search is handed to Google. Enter and the search button are caught before Google's own listeners,
// because even its ad requests carry whatever words it is given.
import { useCallback, useEffect, useRef, useState } from 'react'
import { checkQuery, STUDENT_MESSAGES, type SearchFlag } from '@/lib/studentSearch/safety'
import { StudentPageIntro } from './StudentExperience'

type SearchElement = { execute: (query: string) => void }
type ElementConfig = { div: string; tag: string; gname: string; attributes: Record<string, string | boolean> }
type CseApi = { render: (...configs: ElementConfig[]) => void; getElement: (gname: string) => SearchElement | null }
type CseWindow = Window & {
  google?: { search?: { cse?: { element?: CseApi } } }
  __gcse?: { parsetags: 'explicit'; initializationCallback: () => void; searchCallbacks: { web: { starting: (gname: string, query: string) => string } } }
}
type Article = { title: string; extract: string; url: string; image: string | null }
type Status = 'loading' | 'ready' | 'off' | 'unavailable'

const GNAME = 'wlylSearch'
const BOX_ID = 'wlyl-search-box'
const RESULTS_ID = 'wlyl-search-results'
// Sent to Google if it ever starts a search we did not accept, so those words are not used for results.
const PLACEHOLDER = 'wlylblockedsearch'
const TOPICS = ['Photosynthesis', 'Water cycle', 'Fractions', 'Solar system']

// Google's script lives for the whole page, so the callback it holds reads the latest accepted words from here.
let accepted = ''

async function wikipediaSummary(query: string): Promise<Article | null> {
  const topic = query.replace(/^\s*(what|who|where)\s+(is|are|was|were)\s+((a|an|the)\s+)?/i, '').replace(/\?+\s*$/, '')
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*', generator: 'search', gsrsearch: topic, gsrlimit: '1',
    prop: 'extracts|pageimages|info', exintro: '1', explaintext: '1', exsentences: '2', piprop: 'thumbnail', pithumbsize: '320', inprop: 'url',
  })
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
    headers: { 'Api-User-Agent': 'WLYL-StudentSearch/1.0' }, referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Wikipedia returned ${res.status}`)
  const data: { query?: { pages?: { title: string; extract?: string; fullurl: string; thumbnail?: { source: string } }[] } } = await res.json()
  const page = data.query?.pages?.[0]
  // SafeSearch does not cover Wikipedia, so an innocent search that lands on an unsuitable article shows no card.
  if (!page?.extract || checkQuery(`${page.title} ${page.extract}`) === 'adult') return null
  return { title: page.title, extract: page.extract, url: page.fullurl, image: page.thumbnail?.source ?? null }
}

export default function StudentSearch() {
  const [status, setStatus] = useState<Status>('loading')
  const [engineId, setEngineId] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<SearchFlag | null>(null)
  const [article, setArticle] = useState<Article | null>(null)
  const [problem, setProblem] = useState('')
  const [searched, setSearched] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const latest = useRef(0)

  useEffect(() => {
    fetch('/api/student/search', { cache: 'no-store' })
      .then(async r => {
        if (!r.ok) throw new Error(`Search status returned ${r.status}`)
        const data: { allowed: boolean; engineId: string | null } = await r.json()
        if (!data.allowed) setStatus('off')
        else if (!data.engineId) setStatus('unavailable')
        else setEngineId(data.engineId)
      })
      .catch(err => { console.error('[student search]', err); setStatus('unavailable') })
  }, [])

  const submit = useCallback(async (raw: string) => {
    const text = raw.trim().slice(0, 200)
    if (!text) return
    const turn = ++latest.current
    setProblem('')
    setArticle(null)
    setBlocked(null)
    try {
      const res = await fetch('/api/student/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: text }) })
      const data: { flag?: SearchFlag | null; error?: string; code?: string } = await res.json()
      if (turn !== latest.current) return
      if (data.code === 'NO_CONSENT') { setStatus('off'); return }
      if (!res.ok) { setSearched(false); setProblem(data.error ?? 'Search didn’t work. Try again.'); return }
      if (data.flag) { setSearched(false); setBlocked(data.flag); return }
    } catch (err) {
      console.error('[student search]', err)
      setSearched(false)
      setProblem('Search didn’t work. Check your connection and try again.')
      return
    }
    accepted = text
    setSearched(true)
    ;(window as CseWindow).google?.search?.cse?.element?.getElement(GNAME)?.execute(text)
    wikipediaSummary(text)
      .then(found => { if (turn === latest.current) setArticle(found) })
      .catch(err => console.error('[student search] Wikipedia', err)) // the card is an extra
  }, [])

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
        searchCallbacks: { web: { starting: (_gname, query) => (query.trim() === accepted ? query : PLACEHOLDER) } },
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

  const pickTopic = (topic: string) => {
    const input = containerRef.current?.querySelector<HTMLInputElement>(`#${BOX_ID} input.gsc-input`)
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
            <strong>Your parents can see what you search.</strong> Searches are kept for 30 days and are sent to Google and Wikipedia. Don’t type your name, phone number or address.
          </p>
          {status === 'loading' && <p className="text-sm text-gray-600" role="status">Loading search…</p>}
          {status === 'unavailable' && <p className="rounded-2xl border bg-white p-4 text-sm" role="status" data-testid="student-search-unavailable">Search isn’t available right now. Please try again later.</p>}

          {/* Google draws inside these two; React never renders children into them. */}
          {/* The portal's own input styling must not draw a second box inside Google's. */}
          <style>{`#${BOX_ID} input.gsc-input { border: 0 !important; box-shadow: none !important; background-color: transparent !important; }`}</style>
          <div id={BOX_ID} data-testid="student-search-box" />
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
          {article && (
            <section className="flex flex-col gap-4 rounded-2xl border bg-white p-5 sm:flex-row" aria-label="From Wikipedia" data-testid="student-search-wikipedia">
              <div className="min-w-0 flex-1">
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs">From Wikipedia</span>
                <h2 className="mt-2 text-lg font-bold">{article.title}</h2>
                <p className="mt-1 text-sm leading-6">{article.extract}</p>
                <p className="mt-2 text-xs text-gray-600">
                  Text from Wikipedia (CC BY-SA 4.0). Picture credits are on the article.{' '}
                  <a href={article.url} target="_blank" rel="noopener noreferrer" className="underline" data-testid="student-search-wikipedia-link">Read on Wikipedia</a>
                </p>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {article.image && <img src={article.image} alt={article.title} className="h-auto w-36 self-start rounded-lg" />}
            </section>
          )}
          <div id={RESULTS_ID} hidden={!searched} data-testid="student-search-results" />
          <p className="text-xs text-gray-600">Websites you open are outside school search. Check important facts in your textbook.</p>
        </>
      )}
    </div>
  )
}
