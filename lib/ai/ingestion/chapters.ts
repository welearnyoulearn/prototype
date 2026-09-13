// Chapter boundary detection for the AI Hub syllabus ingestion pipeline.
//
// The PDFs in R2 are whole textbooks/semester bundles, not one file per
// chapter (confirmed against the real materials/ listing — filenames are
// book titles like "MATHEMATICS_SEM-1.pdf", "FIRST_FLIGHT.pdf", not
// "chapter-N.pdf"). Per user direction: the first ~5 pages carry an
// index/table of contents listing chapter names — we parse that to get the
// chapter list, then locate each chapter's heading inside the body pages to
// find where it actually starts, and chunk within those boundaries so no
// chunk ever spans two chapters.
//
// If no usable index can be parsed (non-standard layout, OCR noise, etc.),
// the caller falls back to treating the whole book as one chapter named
// after the book title — logged, never silent.

export type ChapterMarker = { title: string; order: number }
export type ChapterSection = { chapter: string; text: string }

const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-zA-Z]*'
const MONTH_RANGE = `${MONTH}(?:-${MONTH})?`

// Two TOC line shapes seen in real board textbooks:
//   "Chapter 1 Real Numbers June 2"          (AP_SSC style — trailing optional month(s))
//   "1. Real Numbers .......... 1"           (dotted-leader / generic style)
// Deliberately loose since formatting varies a lot across boards/subjects;
// each is tried per line, first match wins.
const TOC_LINE_PATTERNS = [
  new RegExp(`^\\s*Chapter\\s+(\\d{1,2})\\s+([A-Za-zऀ-ॿఀ-౿][^\\n]{1,90}?)\\s+(?:${MONTH_RANGE}\\s+)?(\\d{1,4})\\s*$`, 'i'),
  /^\s*(\d{1,2})[.\-:)]?\s+([A-Za-zऀ-ॿఀ-౿][^\n]{1,90}?)\s*[.\-\s]{2,}\s*(\d{1,4})\s*$/,
]

export function extractChapterListFromToc(tocText: string): ChapterMarker[] {
  const lines = tocText.split('\n')
  const markers: ChapterMarker[] = []
  let lastPage = 0
  let lastOrder = 0
  for (const rawLine of lines) {
    const line = rawLine.trim()
    for (const pattern of TOC_LINE_PATTERNS) {
      const match = pattern.exec(line)
      if (!match) continue
      const [, numStr, rawTitle, pageStr] = match
      const order = parseInt(numStr, 10)
      const page = parseInt(pageStr, 10)
      const title = rawTitle.trim().replace(/[.\s]+$/, '')
      // Sanity checks against a real TOC: chapter numbers and page numbers
      // should both increase monotonically. Reject anything that doesn't fit
      // rather than risk garbage boundaries.
      if (order <= lastOrder || page < lastPage || title.length < 2) continue
      markers.push({ title, order })
      lastOrder = order
      lastPage = page
      break
    }
  }
  return markers
}

function findTitleOccurrence(text: string, title: string, fromIndex: number): number {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  const re = new RegExp(escaped, 'i')
  const match = re.exec(text.slice(fromIndex))
  return match ? fromIndex + match.index : -1
}

// Splits `bodyText` (pages AFTER the index pages) into one section per
// chapter marker. Returns [] if fewer than 2 markers could be located in the
// body — the caller should fall back to a single whole-book chapter.
export function splitByChapters(bodyText: string, markers: ChapterMarker[]): ChapterSection[] {
  if (markers.length < 2) return []

  const found: { title: string; index: number }[] = []
  let searchFrom = 0
  for (const marker of markers) {
    const idx = findTitleOccurrence(bodyText, marker.title, searchFrom)
    if (idx === -1) continue
    found.push({ title: marker.title, index: idx })
    searchFrom = idx + marker.title.length
  }
  if (found.length < 2) return []

  const sections: ChapterSection[] = []
  for (let i = 0; i < found.length; i++) {
    const start = found[i].index
    const end = i + 1 < found.length ? found[i + 1].index : bodyText.length
    const text = bodyText.slice(start, end).trim()
    if (text.length > 0) sections.push({ chapter: found[i].title, text })
  }
  return sections
}
