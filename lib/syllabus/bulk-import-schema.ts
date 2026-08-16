// Bulk-import validation for syllabus JSON: chapters -> topics -> subtopics.
//
// Ported from the Ulearn prototype (bulkImportSyllabus) as pure,
// dependency-free functions so the API route and the admin UI can share exactly
// the same validation and error messages. No DB access here.

export interface SubtopicInput {
  title: string
}

export interface TopicInput {
  title: string
  subtopics?: unknown
}

export interface ChapterInput {
  title: string
  topics?: unknown
}

export interface SemesterGroupInput {
  semester: string
  chapters?: unknown
}

// "Book extraction" shape (e.g. PDF-derived syllabus JSON): a top-level object
// with `units` instead of `chapters`, where each unit/subtopic can nest
// subtopics arbitrarily deep and carries a `page` we don't track.
export interface BookUnitInput {
  title: string
  page?: number
  subtopics?: BookUnitInput[]
}

export interface BookInput {
  units: BookUnitInput[]
  book?: string
  book_type?: string
  audience?: string
}

export type BookType = 'textbook' | 'handbook' | 'workbook'
export type Audience = 'teacher' | 'student' | 'both'

/** Map free-text book-type labels ("Text Book", "Hand Book", ...) to our enum. */
export function normalizeBookType(raw?: string): BookType | null {
  if (typeof raw !== 'string') return null
  const key = raw.trim().toLowerCase().replace(/\s+/g, '')
  if (key === 'textbook') return 'textbook'
  if (key === 'handbook') return 'handbook'
  if (key === 'workbook') return 'workbook'
  return null
}

/** Map free-text audience labels ("Teacher", "Teacher Edition", ...) to our enum. */
export function normalizeAudience(raw?: string): Audience | null {
  if (typeof raw !== 'string') return null
  const key = raw.trim().toLowerCase()
  if (key === 'teacher' || key === 'teachers' || key.includes('teacher')) return 'teacher'
  if (key === 'both' || key === 'all' || key === 'everyone') return 'both'
  if (key === 'student' || key === 'students' || key.includes('student')) return 'student'
  return null
}

/** Convenience default only — an explicit audience always wins over this. */
export function defaultAudienceForBookType(bookType: BookType | null): Audience {
  return bookType === 'handbook' ? 'teacher' : 'student'
}

/** Trims free-text book names down to null-or-non-empty — no enum, unlike book_type/audience. */
export function normalizeBookName(raw?: string | null): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed || null
}

/** Recursively collect every descendant title (depth-first) into a flat list. */
function collectTitles(nodes: BookUnitInput[]): string[] {
  const titles: string[] = []
  for (const node of nodes) {
    if (node && typeof node.title === 'string' && node.title.trim()) titles.push(node.title)
    if (node && Array.isArray(node.subtopics) && node.subtopics.length) {
      titles.push(...collectTitles(node.subtopics))
    }
  }
  return titles
}

// Matches a title that looks like a genuine chapter heading: "Chapter 3 ...",
// "Chapter I ...", "Unit 5 ...", "UNIT -1", "UNIT - 2" (a hyphen between the
// word and the number is common too), a leading "5. " / "5.Title" number
// style, or a bare "5 Title" (number then space, no period at all) — all
// conventions seen across real book-extraction files. The digit-only
// alternative deliberately excludes a *multi-segment* number ("1.2 ...") —
// that's topic-level numbering that leaked to the top, handled separately
// by SUB_NUMBERED_RE below, not a chapter heading itself.
const CHAPTER_HEADING_RE = /^(chapter\s*-?\s*[ivxlcdm]+\b|chapter\s*-?\s*\d+\b|unit\s*-?\s*\d+\b|\d+\.(?!\d)|\d+\s)/i

// A title starting with a multi-segment number ("1.2 Features of
// Democracy", "4.3 Physical and Chemical Changes") is topic-level content
// that leaked to the top of `units` — a real chapter is never itself
// numbered "1.2" — so it always gets folded into the preceding chapter as
// one of its topics, regardless of whether it has subtopics of its own.
const SUB_NUMBERED_RE = /^\d+\.\d+/

/**
 * Some PDF-extraction tools fail to keep a chapter's later sub-sections
 * nested and instead emit them as separate top-level `units` entries — e.g.
 * "FORMAL SECTOR CREDIT IN INDIA" sitting as a sibling of "CHAPTER 3 MONEY
 * AND CREDIT" instead of inside its `subtopics`, or "1.2 FEATURES OF
 * DEMOCRACY" (topic-level numbering) sitting as a sibling of "CHAPTER 3"
 * instead of nested inside one of its topics. Detect these and fold them
 * back into the immediately preceding chapter-looking unit's own
 * subtopics, repairing the nesting the extractor dropped — so this
 * self-corrects on import instead of requiring a hand-edited JSON.
 *
 * Critically, a unit that doesn't look like a chapter heading but *does*
 * have real subtopics of its own (a "Supplementary Reader" section, a
 * "BEEHIVE"/"MOMENTS" reader, a "Unit I" in a different language block of a
 * combined-language book) is left as its own chapter — folding it in would
 * destroy real content just because it lacks a number. Only a unit with no
 * content of its own (or one that's clearly topic-level numbering) gets
 * folded.
 *
 * Only kicks in when at least one unit in the book *does* match the
 * chapter-heading pattern — a book that never uses "Chapter N"/"N." style
 * titles at all (headings are plain names throughout) is left completely
 * untouched, since there's no convention to detect a break from.
 */
function repairOrphanedUnits(units: BookUnitInput[]): { units: BookUnitInput[]; foldedCount: number } {
  const anyLooksLikeChapter = units.some((u) => typeof u.title === 'string' && CHAPTER_HEADING_RE.test(u.title.trim()))
  if (!anyLooksLikeChapter) return { units, foldedCount: 0 }

  const repaired: BookUnitInput[] = []
  let foldedCount = 0
  for (const unit of units) {
    const title = typeof unit.title === 'string' ? unit.title.trim() : ''
    const looksLikeChapter = CHAPTER_HEADING_RE.test(title)
    const looksSubNumbered = SUB_NUMBERED_RE.test(title)
    const hasOwnContent = Array.isArray(unit.subtopics) && unit.subtopics.length > 0
    const prev = repaired[repaired.length - 1]
    const shouldFold = !!prev && !looksLikeChapter && (looksSubNumbered || !hasOwnContent)
    if (shouldFold) {
      prev.subtopics = [...(prev.subtopics ?? []), unit]
      foldedCount += 1
    } else {
      repaired.push({ ...unit, subtopics: unit.subtopics ? [...unit.subtopics] : [] })
    }
  }
  return { units: repaired, foldedCount }
}

/**
 * Convert a book's `units` (unit -> subtopic -> subtopic -> ...) into flat
 * chapters (chapter -> topic -> subtopics[]): each unit becomes a chapter,
 * each unit's direct subtopic becomes a topic, and anything nested deeper
 * than that is flattened into that topic's `subtopics` string list.
 */
function transformBookUnitsToChapters(units: BookUnitInput[]): { chapters: ChapterInput[]; foldedCount: number } {
  const { units: repaired, foldedCount } = repairOrphanedUnits(units)
  const chapters = repaired.map((unit) => ({
    title: unit.title,
    topics: (unit.subtopics ?? []).map((topic) => ({
      title: topic.title,
      subtopics: collectTitles(topic.subtopics ?? []),
    })),
  }))
  return { chapters, foldedCount }
}

export interface NormalisedTopic {
  title: string
  subtopics: string[]
}

export interface NormalisedChapter {
  title: string
  semester: string | null
  book_type: BookType | null
  audience: Audience | null
  book_name: string | null
  topics: NormalisedTopic[]
}

export interface BulkParse {
  chapters: NormalisedChapter[]
  /**
   * Count of top-level `units` entries that repairOrphanedUnits() folded into
   * a preceding chapter as a topic, instead of leaving as their own chapter —
   * i.e. how much auto-repair happened on this import. 0 for flat/semester-
   * group JSON (no `units` shape, so no repair pass runs at all) and for a
   * book-shape JSON where nothing needed folding.
   */
  foldedUnitsCount: number
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

/** Parse a single chapter object (title + topics) into a NormalisedChapter. */
function parseChapter(ch: ChapterInput, label: string, semester: string | null, bookType: BookType | null, audience: Audience | null, bookName: string | null): ParseResult<NormalisedChapter> {
  if (!ch || typeof ch.title !== 'string' || !ch.title.trim()) {
    return { ok: false, error: `${label}: needs a non-empty "title".` }
  }
  const rawTopics = ch.topics ?? []
  if (!Array.isArray(rawTopics)) {
    return { ok: false, error: `${label} ("${ch.title}"): "topics" must be an array.` }
  }
  const topics: NormalisedTopic[] = []
  for (let j = 0; j < rawTopics.length; j++) {
    const tp = rawTopics[j] as string | TopicInput
    const title = typeof tp === 'string' ? tp : tp?.title
    if (typeof title !== 'string' || !title.trim()) {
      return { ok: false, error: `${label}, topic ${j + 1}: each topic needs a title (string, or { "title": "..." }).` }
    }
    const subtopics: string[] = []
    if (tp && typeof tp === 'object' && tp.subtopics != null) {
      if (!Array.isArray(tp.subtopics)) {
        return { ok: false, error: `${label}, topic ${j + 1} ("${title}"): "subtopics" must be an array of strings.` }
      }
      for (let k = 0; k < tp.subtopics.length; k++) {
        const st = tp.subtopics[k] as string | SubtopicInput
        const stTitle = typeof st === 'string' ? st : st?.title
        if (typeof stTitle !== 'string' || !stTitle.trim()) {
          return { ok: false, error: `${label}, topic ${j + 1} ("${title}"), subtopic ${k + 1}: needs a non-empty title (string, or { "title": "..." }).` }
        }
        subtopics.push(stTitle)
      }
    }
    topics.push({ title, subtopics })
  }
  return { ok: true, value: { title: ch.title, semester, book_type: bookType, audience, book_name: bookName, topics } }
}

/**
 * Parse a bulk-import JSON string into normalised chapters/topics/subtopics.
 * A topic may be a plain string, or `{ title, subtopics? }`; a subtopic may
 * be a plain string, or `{ title }`.
 *
 * Two top-level shapes are accepted, auto-detected per item so a curator never
 * has to declare which mode they're in:
 *  - a flat chapter: `{ title, topics }` (unchanged, semester stays null)
 *  - a semester group: `{ semester, chapters: [...] }`, whose chapters are
 *    each parsed the same way and tagged with that semester
 * Only some subjects split by semester, so the two can even be mixed in one
 * paste — whatever's absent just comes out null and renders as a flat list.
 */
export function parseSyllabusBulk(json: string): ParseResult<BulkParse> {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (e) {
    return { ok: false, error: `That isn't valid JSON — ${(e as Error).message}` }
  }
  // ChatGPT sometimes wraps the array in an object (e.g. { class, subject,
  // chapters: [...] }) despite the prompt asking for a bare array — unwrap it
  // rather than reject a syllabus that's otherwise perfectly usable.
  if (!Array.isArray(parsed) && parsed && typeof parsed === 'object' && Array.isArray((parsed as { chapters?: unknown }).chapters)) {
    parsed = (parsed as { chapters: unknown[] }).chapters
  }
  // Book-extraction shape: { book, subject, book_type, units: [...] } — units
  // nest subtopics arbitrarily deep and carry page numbers we don't track.
  let bookType: BookType | null = null
  let audience: Audience | null = null
  let bookName: string | null = null
  let foldedUnitsCount = 0
  if (!Array.isArray(parsed) && parsed && typeof parsed === 'object' && Array.isArray((parsed as BookInput).units)) {
    bookType = normalizeBookType((parsed as BookInput).book_type)
    audience = normalizeAudience((parsed as BookInput).audience)
    bookName = normalizeBookName((parsed as BookInput).book)
    const transformed = transformBookUnitsToChapters((parsed as BookInput).units)
    parsed = transformed.chapters
    foldedUnitsCount = transformed.foldedCount
  }
  if (!Array.isArray(parsed)) return { ok: false, error: 'The top level must be an array of chapters (or an object with a "chapters" array).' }
  if (parsed.length === 0) return { ok: false, error: 'The array is empty — add at least one chapter.' }

  const chapters: NormalisedChapter[] = []

  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i] as ChapterInput | SemesterGroupInput

    if (item && typeof item === 'object' && Array.isArray((item as SemesterGroupInput).chapters)) {
      const group = item as SemesterGroupInput
      if (typeof group.semester !== 'string' || !group.semester.trim()) {
        return { ok: false, error: `Group ${i + 1}: needs a non-empty "semester" (e.g. "Sem 1").` }
      }
      const rawChapters = group.chapters as unknown[]
      if (rawChapters.length === 0) {
        return { ok: false, error: `Group ${i + 1} ("${group.semester}"): "chapters" is empty — add at least one.` }
      }
      for (let k = 0; k < rawChapters.length; k++) {
        const res = parseChapter(rawChapters[k] as ChapterInput, `Group ${i + 1} ("${group.semester}"), chapter ${k + 1}`, group.semester, bookType, audience, bookName)
        if (!res.ok) return res
        chapters.push(res.value)
      }
    } else {
      const res = parseChapter(item as ChapterInput, `Chapter ${i + 1}`, null, bookType, audience, bookName)
      if (!res.ok) return res
      chapters.push(res.value)
    }
  }

  return { ok: true, value: { chapters, foldedUnitsCount } }
}
