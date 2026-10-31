// Splits extracted PDF pages into overlapping chunks for embedding (#407).
// Pure — no I/O — so the boundaries can be unit-tested.

export type PageText = { page: number; text: string }
export type Chunk = { page: number; chunkIndex: number; content: string }

const MIN_PAGE_CHARS = 40
// A chunk is kept only if at least this share of its non-space characters are real words.
const MIN_WORD_SHARE = 0.5

// Many AP Telugu/Sanskrit (and some maths) PDFs use legacy non-Unicode fonts whose text layer
// extracts as Latin-1/Latin-Extended letters and stray symbols ("Á|üuÛÑT‘·«+"). Words containing
// these are dropped; legitimate maths symbols (° ± ² ³ × ÷ ≤ ≥ √) are left alone.
const LEGACY_FONT_CHAR = /[\u00A1-\u00AF\u00B4\u00B6\u00B8-\u00BB\u00BF-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u2039\u203A\u2206\u220F\u2211\u222B\u25CA\uF8FF]/

export function dropLegacyFontWords(text: string): string {
  return text.split(/(\s+)/).filter((tok) => !LEGACY_FONT_CHAR.test(tok)).join('').replace(/[ \t]{2,}/g, ' ').trim()
}

// Real words: ASCII words with a vowel, or words wholly in an Indic or Greek script.
function isRealWord(w: string): boolean {
  if (/^[A-Za-z]+$/.test(w)) return /[aeiouy]/i.test(w) && (w.length >= 2 || /^[aAI]$/.test(w))
  return /^[\u0900-\u0DFF]+$/.test(w) || /^[\u0370-\u03FF]+$/.test(w)
}

// Share of non-space characters that sit in real words — low for garbled font output
// like "F22222F222222" or "2Q2X2e2222", high for prose in any of the textbook scripts.
export function wordShare(text: string): number {
  const total = text.replace(/\s/g, '').length
  if (total === 0) return 0
  let real = 0
  for (const [w] of text.matchAll(/[\p{L}\p{M}]+/gu)) if (isRealWord(w)) real += w.length
  return real / total
}

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
    const text = dropLegacyFontWords(normalise(raw))
    if (text.replace(/\s/g, '').length < MIN_PAGE_CHARS) continue

    let start = 0
    while (start < text.length) {
      let end = text.length
      if (end - start > size) end = breakPoint(text, start + Math.floor(size / 2), start + size)
      const content = text.slice(start, end).trim()
      if (content && wordShare(content) >= MIN_WORD_SHARE) chunks.push({ page, chunkIndex: chunks.length, content })
      if (end >= text.length) break
      // Step back by the overlap, then forward to the next word so no chunk starts mid-word.
      const back = end - overlap
      const space = text.indexOf(' ', back)
      start = space !== -1 && space < end ? space + 1 : back
    }
  }
  return chunks
}
