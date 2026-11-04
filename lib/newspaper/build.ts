// The overnight build: for each grade band that has no edition yet for the date, write notes from the day's real
// stories, check them blind, and store an edition of 3 or 4 notes. Anything short of 3 passing notes becomes the
// one-note fallback from the reviewed topic bank. Safe to run again: an edition that exists is never rebuilt, and
// the (date, band) unique key stops two runs from creating two.
import type { Pool, PoolClient } from 'pg'
import { GRADE_BANDS, type GradeBand } from '../newspaperBands'
import { checkNote } from './checker'
import { bankNote } from './bank'
import { fetchFeeds, type FeedItem } from './feed'
import { selectCandidates } from './filter'
import type { NewsModel } from './model'
import { FEED_SOURCES, type FeedSource } from './sources'
import { buildEditionDate } from './time'
import { writeNotes, type EditionNote } from './writer'

export const MIN_LIVE_NOTES = 3
export const MAX_NOTES = 4

type Db = Pick<Pool, 'query' | 'connect'>
type FetchImpl = Parameters<typeof fetchFeeds>[1]

export type BuildDeps = { db: Db; model: NewsModel; fetchImpl: FetchImpl; sources?: readonly FeedSource[]; now?: Date }
export type BuiltBand = { band: GradeBand; mode: 'live' | 'bank'; notes: number; rejected: string[]; reason?: string }
export type BuildReport = { date: string; built: BuiltBand[]; alreadyThere: GradeBand[]; feedErrors: string[]; candidates: number }

/** Up to MAX_NOTES notes, taking one of each category first so an edition is not four of the same kind. */
export function selectNotes(passed: readonly EditionNote[], max = MAX_NOTES): EditionNote[] {
  const picked: EditionNote[] = []
  const seen = new Set<string>()
  for (const n of passed) if (!seen.has(n.category) && picked.length < max) { seen.add(n.category); picked.push(n) }
  for (const n of passed) if (!picked.includes(n) && picked.length < max) picked.push(n)
  return picked
}

type LiveResult = { notes: EditionNote[]; rejected: string[] } | { error: string }

async function liveNotes(deps: BuildDeps, band: GradeBand, candidates: readonly FeedItem[]): Promise<LiveResult> {
  try {
    const { notes, sourceIds } = await writeNotes(deps.model, band, candidates)
    const checks = await Promise.all(notes.map((n, i) => checkNote(deps.model, band, n, candidates[sourceIds[i]])))
    const rejected = checks.flatMap((c, i) => (c.pass ? [] : [`${notes[i].headline}: ${c.reason}`]))
    return { notes: selectNotes(notes.filter((_, i) => checks[i].pass)), rejected }
  } catch (err) {
    return { error: (err as Error).message }
  }
}

async function saveEdition(db: Db, date: string, band: GradeBand, mode: 'live' | 'bank', notes: readonly EditionNote[]): Promise<boolean> {
  const client: PoolClient = await db.connect()
  try {
    await client.query('BEGIN')
    const ed = await client.query<{ id: number }>(
      `INSERT INTO news_editions (edition_date, grade_band, source_mode) VALUES ($1, $2, $3)
       ON CONFLICT (edition_date, grade_band) DO NOTHING RETURNING id`, [date, band, mode])
    if (ed.rows.length === 0) { await client.query('ROLLBACK'); return false }
    const editionId = ed.rows[0].id
    for (const [i, n] of notes.entries()) {
      const item = await client.query<{ id: number }>(
        `INSERT INTO news_items (edition_id, position, category, headline, note, why_it_matters, try_it, source_name, source_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [editionId, i + 1, n.category, n.headline, n.note, n.whyItMatters, n.tryIt, n.sourceName, n.sourceUrl])
      await client.query(
        `INSERT INTO news_questions (edition_id, item_id, stem, options, correct_index, explanation) VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
        [editionId, item.rows[0].id, n.question.stem, JSON.stringify(n.question.options), n.question.correctIndex, n.question.explanation])
    }
    await client.query('COMMIT')
    return true
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw err
  } finally {
    client.release()
  }
}

export async function buildEditions(deps: BuildDeps, opts: { date?: string } = {}): Promise<BuildReport> {
  const now = deps.now ?? new Date()
  const date = opts.date ?? buildEditionDate(now)
  const existing = await deps.db.query<{ grade_band: GradeBand }>('SELECT grade_band FROM news_editions WHERE edition_date = $1', [date])
  const have = new Set(existing.rows.map(r => r.grade_band))
  const missing = GRADE_BANDS.filter(b => !have.has(b))
  const report: BuildReport = { date, built: [], alreadyThere: GRADE_BANDS.filter(b => have.has(b)), feedErrors: [], candidates: 0 }
  if (missing.length === 0) return report

  const fetched = await fetchFeeds(deps.sources ?? FEED_SOURCES, deps.fetchImpl, now)
  const candidates = selectCandidates(fetched.items, now)
  report.feedErrors = fetched.errors
  report.candidates = candidates.length

  const results = await Promise.all(missing.map(async (band): Promise<BuiltBand> => {
    let live: LiveResult = { error: `only ${candidates.length} usable stories` }
    if (candidates.length >= MIN_LIVE_NOTES) live = await liveNotes(deps, band, candidates)
    if ('notes' in live && live.notes.length >= MIN_LIVE_NOTES) {
      await saveEdition(deps.db, date, band, 'live', live.notes)
      return { band, mode: 'live', notes: live.notes.length, rejected: live.rejected }
    }
    const reason = 'error' in live ? live.error : `only ${live.notes.length} notes passed the checks`
    await saveEdition(deps.db, date, band, 'bank', [bankNote(date)])
    return { band, mode: 'bank', notes: 1, rejected: 'rejected' in live ? live.rejected : [], reason }
  }))
  report.built = results
  return report
}
