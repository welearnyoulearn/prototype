// Which stories may reach children. A deliberately cautious block-list: losing a good story costs nothing (there are
// many candidates each day); letting a bad one through does. The blind checker is a second line of defence.
import { MIN_TEXT_CHARS, type FeedItem } from './feed'

const BLOCKED = new RegExp(
  '\\b(' + [
    'kill(?:ed|ing|s)?', 'murder\\w*', 'rape\\w*', 'suicid\\w*', 'terror\\w*', 'bomb\\w*', 'shooting', 'massacre', 'war', 'warfare', 'invasion',
    'dead', 'death\\w*', 'died', 'dying', 'casualt\\w*', 'fatal\\w*', 'crash(?:ed|es)?', 'victims?',
    'election\\w*', 'voters?', 'political\\w*', 'protest\\w*', 'riots?', 'arrest\\w*', 'crime\\w*', 'criminal\\w*', 'scam\\w*', 'fraud\\w*',
    'drugs?', 'alcohol\\w*', 'tobacco', 'cigarette\\w*', 'casino\\w*', 'gambl\\w*', 'sex\\w*', 'porn\\w*', 'nude', 'abuse\\w*', 'assault\\w*',
    'outbreaks?', 'epidemic', 'pandemic', 'cancer\\w*', 'tumou?rs?', 'obesity', 'diabet\\w*', 'overdose', 'lawsuit', 'sued', 'weapons?', 'missile\\w*', 'military',
  ].join('|') + ')\\b',
  'i',
)

/** True when neither the title nor the text contains anything on the block-list. */
export function isSafeForStudents(title: string, text: string): boolean {
  return !BLOCKED.test(`${title} ${text}`)
}

function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * The stories the writer may use: recent, safe, with enough text to write from, no repeats of the same headline,
 * newest first, and at most `limit`.
 */
export function selectCandidates(items: readonly FeedItem[], now: Date, opts: { maxAgeHours?: number; limit?: number } = {}): FeedItem[] {
  const maxAgeMs = (opts.maxAgeHours ?? 48) * 60 * 60 * 1000
  const seen = new Set<string>()
  const out: FeedItem[] = []
  const sorted = [...items].sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
  for (const it of sorted) {
    if (it.text.length < MIN_TEXT_CHARS) continue
    if (it.publishedAt && now.getTime() - it.publishedAt.getTime() > maxAgeMs) continue
    if (!isSafeForStudents(it.title, it.text)) continue
    const key = normalizeTitle(it.title)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(it)
    if (out.length >= (opts.limit ?? 18)) break
  }
  return out
}
