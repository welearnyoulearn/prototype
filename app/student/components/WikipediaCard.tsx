'use client'

// Student Search (#538): the Wikipedia card. The summary comes with the search; more pictures and facts are
// asked for afterwards, and the card works without them.
import { useEffect, useState } from 'react'
import { itemsToName, nameFacts, picturesAllowed, readFacts, readPictures, type Picture } from '@/lib/studentSearch/wikiArticle'
import type { WikiLanguage } from '@/lib/studentSearch/wikipedia'

export type Article = { language: WikiLanguage; title: string; paragraphs: string[]; url: string; image: string | null; item: string | null }
type NamedFact = { label: string; text: string }

async function ask(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { 'Api-User-Agent': 'WLYL-StudentSearch/1.0' }, referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`Wikimedia returned ${res.status}`)
  return res.json()
}

const wikidata = (params: Record<string, string>) =>
  ask(`https://www.wikidata.org/w/api.php?${new URLSearchParams({ action: 'wbgetentities', format: 'json', origin: '*', ...params })}`)

async function articleFacts(item: string, language: WikiLanguage): Promise<NamedFact[]> {
  const facts = readFacts(await wikidata({ ids: item, props: 'claims' }), item)
  const ids = itemsToName(facts)
  const names = ids.length ? await wikidata({ ids: ids.join('|'), props: 'labels', languages: `${language}|en` }) : {}
  return nameFacts(facts, names, language)
}

/** Give this a `key` of the article's address, so a new article starts closed and empty. */
export default function WikipediaCard({ article }: { article: Article }) {
  const [open, setOpen] = useState(false)
  const [pictures, setPictures] = useState<Picture[]>([])
  const [facts, setFacts] = useState<NamedFact[]>([])
  const showPictures = picturesAllowed(article.title, article.paragraphs[0])
  // Roughly more than the six lines that show while closed.
  const long = article.paragraphs.length > 1 || article.paragraphs[0].length > 300

  useEffect(() => {
    let live = true
    const wiki = `https://${article.language}.wikipedia.org`
    if (showPictures) {
      ask(`${wiki}/api/rest_v1/page/media-list/${encodeURIComponent(article.title.replace(/ /g, '_'))}`)
        .then(reply => { if (live) setPictures(readPictures(reply, wiki)) })
        .catch(err => console.error('[student search] Wikipedia pictures', err))
    }
    if (article.item) {
      articleFacts(article.item, article.language)
        .then(found => { if (live) setFacts(found) })
        .catch(err => console.error('[student search] Wikidata', err))
    }
    return () => { live = false }
  }, [article, showPictures])

  return (
    <section className="space-y-4 rounded-2xl border bg-white p-5" aria-label="From Wikipedia" data-testid="student-search-wikipedia">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="min-w-0 flex-1">
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs">From Wikipedia</span>
          <h2 lang={article.language} className="mt-2 text-lg font-bold">{article.title}</h2>
          <div id="wlyl-search-summary" lang={article.language} className={`mt-1 text-sm leading-6 ${open ? 'space-y-2' : 'line-clamp-6'}`} data-testid="student-search-wikipedia-text">
            {open ? article.paragraphs.map((text, i) => <p key={i}>{text}</p>) : article.paragraphs.join(' ')}
          </div>
          {long && (
            <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="wlyl-search-summary"
              className="mt-2 min-h-10 rounded-full border px-4 text-sm font-bold" data-testid="student-search-wikipedia-more">{open ? 'Show less' : 'Show more'}</button>
          )}
        </div>
        {showPictures && article.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={article.image} alt={article.title} className="h-auto w-40 self-start rounded-lg" />
        )}
      </div>

      {pictures.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Pictures" data-testid="student-search-wikipedia-pictures">
          {pictures.map(picture => (
            <li key={picture.src}>
              <figure>
                <a href={picture.page} target="_blank" rel="noopener noreferrer" data-testid="student-search-wikipedia-picture">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={picture.src} alt={picture.caption || article.title} loading="lazy" referrerPolicy="no-referrer" className="h-28 w-full rounded-lg bg-gray-100 object-contain" />
                </a>
                {picture.caption && <figcaption lang={article.language} className="mt-1 line-clamp-2 text-xs text-gray-600">{picture.caption}</figcaption>}
              </figure>
            </li>
          ))}
        </ul>
      )}

      {facts.length > 0 && (
        <div className="rounded-xl border bg-gray-50 p-4" data-testid="student-search-facts">
          <h3 className="text-sm font-bold">Quick facts</h3>
          <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {facts.map(fact => (
              <div key={fact.label}>
                <dt className="text-gray-600">{fact.label}</dt>
                <dd className="break-words font-medium">{fact.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <p className="text-xs text-gray-600">
        Text from Wikipedia (CC BY-SA 4.0){facts.length > 0 && '; facts from Wikidata'}. Select a picture for its credit.{' '}
        <a href={article.url} target="_blank" rel="noopener noreferrer" className="underline" data-testid="student-search-wikipedia-link">Read on Wikipedia</a>
      </p>
    </section>
  )
}
