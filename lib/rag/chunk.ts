// Splits extracted PDF pages into overlapping chunks for embedding (#407).
// Pure — no I/O — so the boundaries can be unit-tested.

export type PageText = { page: number; text: string }
export type Chunk = { page: number; chunkIndex: number; content: string }

const MIN_PAGE_CHARS = 40

// Keeps paragraph breaks ("\n\n"), folds every other whitespace run into one space, and
// collapses a phrase repeated back-to-back (running headers come out of the text layer as
// "Pastoralists in the Modern WorldPastoralists in the Modern World").
export function normalise(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/\n[ \t\f\v]*\n\s*/g, '\u0000')
    .replace(/\s+/g, ' ')
    .replace(/\u0000/g, '\n\n')
    .replace(/(\S.{9,79}?)\1+/g, '$1')
    .trim()
}

// Best place to end a chunk inside text[from, to): paragraph, then sentence, then word.
function breakPoint(text: string, from: number, to: number): number {
  const window = text.slice(from, to)
  const para = window.lastIndexOf('\n\n')
  if (para > 0) return from + para
  let sentence = -1
  for (const m of window.matchAll(/[.!?।]["')\]]?\s/g)) sentence = m.index + m[0].length - 1
  if (sentence > 0) return from + sentence
  const space = window.lastIndexOf(' ')
  return space > 0 ? from + space : to
}

export function chunkPages(
  pages: PageText[],
  opts: { size?: number; overlap?: number } = {},
): Chunk[] {
  const size = opts.size ?? 1000
  // Overlap must stay under half a chunk or the window could stop advancing.
  const overlap = Math.min(opts.overlap ?? 150, Math.floor(size / 2) - 1)
  const chunks: Chunk[] = []

  for (const { page, text: raw } of pages) {
    const text = normalise(raw)
    if (text.replace(/\s/g, '').length < MIN_PAGE_CHARS) continue

    let start = 0
    while (start < text.length) {
      let end = text.length
      if (end - start > size) end = breakPoint(text, start + Math.floor(size / 2), start + size)
      const content = text.slice(start, end).trim()
      if (content) chunks.push({ page, chunkIndex: chunks.length, content })
      if (end >= text.length) break
      // Step back by the overlap, then forward to the next word so no chunk starts mid-word.
      const back = end - overlap
      const space = text.indexOf(' ', back)
      start = space !== -1 && space < end ? space + 1 : back
    }
  }
  return chunks
}
