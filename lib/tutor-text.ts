// Client-safe helpers for showing tutor answers (#407): citation filtering and GFM table rows.

/** Excerpt numbers the answer cites: [1], [1, 3], [1][6]. */
export function citedNumbers(text: string): Set<number> {
  const cited = new Set<number>()
  for (const m of text.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) {
    for (const n of m[1].split(',')) cited.add(Number(n))
  }
  return cited
}

/** Only the sources the answer actually cites, in their original order. */
export function citedSources<T extends { n: number }>(sources: T[], text: string): T[] {
  const cited = citedNumbers(text)
  return sources.filter(s => cited.has(s.n))
}

/** A GFM table row: `| a | b |` → ['a', 'b']; null when the line isn't one. */
export function tableCells(line: string): string[] | null {
  const t = line.trim()
  if (!t.startsWith('|')) return null
  return t.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
}

/** The `|---|:--:|` line under a table header. */
export const isTableSeparator = (line: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line) && line.includes('|')
