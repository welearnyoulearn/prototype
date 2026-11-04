// Reading the allow-listed feeds: RSS/Atom parsing (no extra dependency) and, for items whose feed text is just a
// teaser, the article page itself. Every network call has a timeout and a size cap, and an article page is only
// fetched from the domains the source is allowed to use, so a feed cannot send the server anywhere else.
import type { FeedSource } from './sources'

export type FeedItem = {
  sourceId: string
  sourceName: string
  title: string
  link: string
  publishedAt: Date | null
  /** Plain text of the item: the feed's own text, or the article body when that was too short. */
  text: string
}

type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>

const FETCH_TIMEOUT_MS = 10_000
const MAX_BYTES = 1_500_000
export const MIN_TEXT_CHARS = 250
const MAX_TEXT_CHARS = 3_500
const USER_AGENT = 'WLYL-Newspaper/1.0 (+https://welearnyoulearn.com)'

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…' }

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => safeCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
}

function safeCodePoint(n: number): string {
  return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''
}

/** HTML to plain text: drop scripts and styles, turn tags into spaces, decode entities, collapse whitespace. */
export function htmlToText(html: string): string {
  const noCdata = html.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  return decodeEntities(
    noCdata
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim()
}

function firstTag(block: string, names: readonly string[]): string | null {
  for (const name of names) {
    const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block)
    if (m) return m[1]
  }
  return null
}

function atomLink(block: string): string | null {
  const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map(m => m[1])
  const pick = links.find(a => /rel=["']alternate["']/i.test(a)) ?? links.find(a => !/rel=/i.test(a)) ?? links[0]
  const href = pick ? /href=["']([^"']+)["']/i.exec(pick) : null
  return href ? decodeEntities(href[1]) : null
}

/** Parse an RSS 2.0 or Atom document into items. Items without a title or link are skipped. */
export function parseFeed(xml: string, source: Pick<FeedSource, 'id' | 'name'>): FeedItem[] {
  const blocks = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(m => m[2])
  const items: FeedItem[] = []
  for (const block of blocks) {
    const title = htmlToText(firstTag(block, ['title']) ?? '')
    const linkTag = firstTag(block, ['link'])
    const link = (linkTag ? htmlToText(linkTag) : '') || atomLink(block) || htmlToText(firstTag(block, ['guid', 'id']) ?? '')
    if (!title || !/^https?:\/\//i.test(link)) continue
    const dateRaw = htmlToText(firstTag(block, ['pubDate', 'published', 'updated', 'dc:date']) ?? '')
    const parsed = dateRaw ? new Date(dateRaw) : null
    const body = firstTag(block, ['content:encoded', 'content', 'description', 'summary']) ?? ''
    items.push({
      sourceId: source.id,
      sourceName: source.name,
      title,
      link,
      publishedAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed : null,
      text: htmlToText(body).slice(0, MAX_TEXT_CHARS),
    })
  }
  return items
}

/** Paragraph text of an article page (the long <p> blocks), for items whose feed text is only a teaser. */
export function articleText(html: string): string {
  const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(m => htmlToText(m[1]))
    .filter(p => p.length >= 60)
  return paragraphs.join(' ').slice(0, MAX_TEXT_CHARS)
}

/** True when the article page may be fetched: https, and a host that belongs to the source's own domains. */
export function isAllowedArticleUrl(link: string, source: Pick<FeedSource, 'domains'>): boolean {
  let u: URL
  try { u = new URL(link) } catch { return false }
  if (u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase()
  if (/^[\d.]+$/.test(host) || host.includes(':')) return false
  return source.domains.some(d => host === d || host.endsWith(`.${d}`))
}

async function getText(url: string, fetchImpl: FetchLike): Promise<string> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/html;q=0.9, */*;q=0.5' } })
  if (!res.ok) throw new Error(`${url} returned ${res.status}`)
  return (await res.text()).slice(0, MAX_BYTES)
}

export type FetchedFeeds = { items: FeedItem[]; errors: string[] }

/**
 * Fetch every source, keep the newest items of each (within `maxAgeHours`), and for items whose feed text is too
 * short fetch the article body from the source's own domain. One failing feed never fails the others.
 */
export async function fetchFeeds(
  sources: readonly FeedSource[],
  fetchImpl: FetchLike,
  now: Date,
  opts: { maxAgeHours?: number } = {},
): Promise<FetchedFeeds> {
  const maxAgeMs = (opts.maxAgeHours ?? 48) * 60 * 60 * 1000
  const errors: string[] = []

  const perSource = await Promise.all(sources.map(async source => {
    try {
      const xml = await getText(source.feedUrl, fetchImpl)
      const fresh = parseFeed(xml, source)
        .filter(it => !it.publishedAt || now.getTime() - it.publishedAt.getTime() <= maxAgeMs)
        .filter(it => !source.requireAny || source.requireAny.test(`${it.title} ${it.text}`))
        .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
        .slice(0, source.maxItems)
      return Promise.all(fresh.map(async it => {
        if (it.text.length >= MIN_TEXT_CHARS || !isAllowedArticleUrl(it.link, source)) return it
        try {
          const body = articleText(await getText(it.link, fetchImpl))
          return body.length > it.text.length ? { ...it, text: body } : it
        } catch (err) {
          errors.push(`${source.id} article: ${(err as Error).message}`)
          return it
        }
      }))
    } catch (err) {
      errors.push(`${source.id}: ${(err as Error).message}`)
      return []
    }
  }))

  return { items: perSource.flat(), errors }
}
