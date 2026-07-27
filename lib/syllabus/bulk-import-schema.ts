// Bulk-import validation for syllabus JSON: chapters -> topics -> optional quiz.
//
// Ported from the Ulearn prototype (bulkImportSyllabus / parseQuizArray) as pure,
// dependency-free functions so the API route and the admin UI can share exactly
// the same validation and error messages. No DB access here.
//
// Question shape is kept as { q, options, correct, source } to match the existing
// `master_topics.questions` JSONB column, so parsed output writes straight in.

export interface QuizQuestion {
  q: string
  options: string[]
  correct: number // 0-based index into options
  source: string
}

export interface TopicInput {
  title: string
  quiz?: unknown
}

export interface ChapterInput {
  title: string
  topics?: unknown
}

export interface NormalisedTopic {
  title: string
  quiz: QuizQuestion[]
}

export interface NormalisedChapter {
  title: string
  topics: NormalisedTopic[]
}

export interface BulkParse {
  chapters: NormalisedChapter[]
  questionCount: number
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

/** Validate + normalise an array of quiz questions. */
export function parseQuizArray(arr: unknown, where: string): ParseResult<QuizQuestion[]> {
  if (!Array.isArray(arr)) return { ok: false, error: `${where}: "quiz" must be an array of questions.` }
  const out: QuizQuestion[] = []
  for (let i = 0; i < arr.length; i++) {
    const q = arr[i] as Partial<QuizQuestion>
    const at = `${where}, question ${i + 1}`
    if (!q || typeof q.q !== 'string' || !q.q.trim()) {
      return { ok: false, error: `${at}: needs a non-empty "q".` }
    }
    if (!Array.isArray(q.options) || q.options.length < 2) {
      return { ok: false, error: `${at}: "options" must be an array of at least 2.` }
    }
    if (!q.options.every((o) => typeof o === 'string' && o.trim())) {
      return { ok: false, error: `${at}: every option must be a non-empty string.` }
    }
    if (!Number.isInteger(q.correct) || (q.correct as number) < 0 || (q.correct as number) >= q.options.length) {
      return { ok: false, error: `${at}: "correct" must be an option index (0–${q.options.length - 1}).` }
    }
    out.push({
      q: q.q,
      options: q.options,
      correct: q.correct as number,
      source: typeof q.source === 'string' && q.source.trim() ? q.source : '',
    })
  }
  return { ok: true, value: out }
}

/**
 * Parse a bulk-import JSON string into normalised chapters/topics/questions.
 * A topic may be a plain string, or `{ title, quiz? }`.
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
  if (!Array.isArray(parsed)) return { ok: false, error: 'The top level must be an array of chapters (or an object with a "chapters" array).' }
  if (parsed.length === 0) return { ok: false, error: 'The array is empty — add at least one chapter.' }

  const chapters: NormalisedChapter[] = []
  let questionCount = 0

  for (let i = 0; i < parsed.length; i++) {
    const ch = parsed[i] as ChapterInput
    if (!ch || typeof ch.title !== 'string' || !ch.title.trim()) {
      return { ok: false, error: `Chapter ${i + 1}: needs a non-empty "title".` }
    }
    const rawTopics = ch.topics ?? []
    if (!Array.isArray(rawTopics)) {
      return { ok: false, error: `Chapter ${i + 1} ("${ch.title}"): "topics" must be an array.` }
    }
    const topics: NormalisedTopic[] = []
    for (let j = 0; j < rawTopics.length; j++) {
      const tp = rawTopics[j] as string | TopicInput
      const title = typeof tp === 'string' ? tp : tp?.title
      if (typeof title !== 'string' || !title.trim()) {
        return { ok: false, error: `Chapter ${i + 1}, topic ${j + 1}: each topic needs a title (string, or { "title": "..." }).` }
      }
      let quiz: QuizQuestion[] = []
      if (tp && typeof tp === 'object' && tp.quiz != null) {
        const res = parseQuizArray(tp.quiz, `Chapter ${i + 1}, topic ${j + 1} ("${title}")`)
        if (!res.ok) return res
        quiz = res.value
        questionCount += quiz.length
      }
      topics.push({ title, quiz })
    }
    chapters.push({ title: ch.title, topics })
  }

  return { ok: true, value: { chapters, questionCount } }
}
