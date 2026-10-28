// Test support for the newspaper pipeline: a fake model, fake feeds and note builders. Not used by the app.
import type { FetchedFeeds } from './feed'
import { fetchFeeds } from './feed'
import type { NewsModel, ModelRequest } from './model'
import { CHECKER_SYSTEM } from './checker'
import { NEWS_CATEGORIES, type FeedSource } from './sources'
import { WRITER_SYSTEM, type EditionNote } from './writer'

export type FetchImpl = Parameters<typeof fetchFeeds>[1]

/** A fetch that answers from a table of url -> body (or an Error to throw); any other url is a 404. */
export function fakeFetch(routes: Record<string, string | Error>): FetchImpl {
  return async url => {
    const r = routes[url]
    if (r === undefined) return { ok: false, status: 404, text: async () => '' }
    if (r instanceof Error) throw r
    return { ok: true, status: 200, text: async () => r }
  }
}

export const TEST_FEED_URL = 'https://news.test/feed'
export const TEST_SOURCES: readonly FeedSource[] = [
  { id: 'test', name: 'Test News', feedUrl: TEST_FEED_URL, domains: ['news.test'], categoryHint: 'Science & Space', maxItems: 12 },
]

export const storyText = (i: number) =>
  `A research team announced result ${i} in a new study published this week. The study describes a method, the people involved and the results measured in the laboratory, with details about how the work was done and what comes next for the field. Independent experts who were not part of the work reviewed the findings and agreed that the approach is sound and could be repeated by other groups around the world.`

export function rssXml(items: { title: string; link: string; date: Date; text: string }[]): string {
  const body = items.map(it =>
    `<item><title>${it.title}</title><link>${it.link}</link><pubDate>${it.date.toUTCString()}</pubDate>` +
    `<description><![CDATA[<p>${it.text}</p>]]></description></item>`).join('')
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Test</title>${body}</channel></rss>`
}

/** A feed of `count` fresh, safe stories published an hour before `now`. */
export function freshFeed(count: number, now: Date): string {
  return rssXml(Array.from({ length: count }, (_, i) => ({
    title: `Researchers report result ${i}`, link: `https://news.test/story-${i}`, date: new Date(now.getTime() - (i + 1) * 3_600_000), text: storyText(i),
  })))
}

export const noteText = (id: number) =>
  `Scientists explored idea number ${id}. Here is what they found and why it is useful for students in daily life. Think about a simple example at home. When you notice it, you will understand the idea better and remember it for a long time at school.`

export function validNote(overrides: Partial<EditionNote> = {}): EditionNote {
  return {
    category: 'Science & Space', headline: 'A clear new idea for students', note: noteText(1),
    whyItMatters: 'It helps you understand the world around you.', tryIt: 'Look around at home and spot one example today.',
    sourceName: 'Test News', sourceUrl: 'https://news.test/story-1',
    question: { stem: 'What did the scientists explore?', options: ['An idea', 'A song', 'A game', 'A recipe'], correctIndex: 0, explanation: 'They explored an idea.' },
    ...overrides,
  }
}

export type Verdict = 'ok' | 'unsupported' | 'wrong_answer' | 'unsafe_activity' | 'not_age_appropriate'

/**
 * A model that behaves like the real writer and checker: it writes one note per source it is shown (up to
 * `notesPerReply`), remembers each note's right answer, and as the checker answers from that memory unless told to
 * find a fault (`verdictFor` is given the note's headline).
 */
export function fakeModel(opts: {
  notesPerReply?: number
  verdictFor?: (headline: string) => Verdict
  failWriter?: boolean
  failChecker?: boolean
  calls?: ModelRequest[]
} = {}): NewsModel {
  const answers = new Map<string, number>()
  return {
    async complete(req) {
      opts.calls?.push(req)
      if (req.system === WRITER_SYSTEM) {
        if (opts.failWriter) throw new Error('writer is down')
        const sources = (req.user.match(/^SOURCE \d+ /gm) ?? []).length
        const notes = Array.from({ length: Math.min(sources, opts.notesPerReply ?? 6) }, (_, id) => {
          const headline = `Note about idea ${id} today`
          const correct = id % 4
          answers.set(headline, correct)
          return {
            source_id: id, category: NEWS_CATEGORIES[id % NEWS_CATEGORIES.length], headline, note: noteText(id),
            why_it_matters: 'It helps you understand the world around you.', try_it: 'Look around at home and spot one example today.',
            question: { stem: `What did the scientists explore in note ${id}?`, options: ['An idea', 'A song', 'A game', 'A recipe'], correct_index: correct, explanation: 'They explored an idea.' },
          }
        })
        return JSON.stringify({ notes })
      }
      if (req.system === CHECKER_SYSTEM) {
        if (opts.failChecker) throw new Error('checker is down')
        const headline = /^Headline: (.*)$/m.exec(req.user)?.[1] ?? ''
        const verdict = opts.verdictFor?.(headline) ?? 'ok'
        const right = answers.get(headline) ?? 0
        return JSON.stringify({
          unsupported_claims: verdict === 'unsupported' ? ['a claim that is not in the source'] : [],
          age_appropriate: verdict !== 'not_age_appropriate',
          safe_activity: verdict !== 'unsafe_activity',
          answer_index: verdict === 'wrong_answer' ? (right + 1) % 4 : right,
        })
      }
      throw new Error('unexpected prompt')
    },
  }
}

export type { FetchedFeeds }
