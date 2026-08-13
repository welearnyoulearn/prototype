import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { parseSyllabusBulk, normalizeBookType, normalizeAudience, normalizeBookName, defaultAudienceForBookType } from '@/lib/syllabus/bulk-import-schema'
import { requirePlatformAdmin } from '@/lib/auth'

// POST /api/platform/syllabus/bulk-import
// body: { subject_id: number, mode?: 'append' | 'replace', json: string, book_type?: string, audience?: string, book_name?: string }
//
// Validates the pasted syllabus JSON (chapters -> topics -> subtopics, each
// chapter optionally tagged with a semester, book type, audience, and/or book
// name) and writes it to master_chapters / master_topics under an existing
// master_subjects row. `book_type`/`audience`/`book_name` in the body are a
// fallback/override for chapters that don't self-declare one (e.g. plain
// flat-array JSON) — audience additionally falls back to a smart default
// derived from book_type (Hand Book -> teacher, else student) when neither
// the JSON nor the request specifies one; that default is just a
// convenience, never a forced rule. book_name has no such default — a
// subject can have two different books of the same book_type (e.g. two Text
// Books), and book_name is what actually keeps them from being treated as
// one — inventing a name would be worse than leaving it null.
//
// Ported from the Ulearn prototype's bulkImportSyllabus. Runs in a single
// transaction so a bad row rolls the whole import back.
export async function POST(req: NextRequest) {
  if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const client = await pool.connect()
  try {
    await ensureDB()
    const { subject_id, mode = 'append', json, book_type, audience, book_name } = await req.json()

    if (!subject_id || Number.isNaN(Number(subject_id))) {
      return NextResponse.json({ error: 'subject_id (number) is required' }, { status: 400 })
    }
    if (mode !== 'append' && mode !== 'replace') {
      return NextResponse.json({ error: 'mode must be "append" or "replace"' }, { status: 400 })
    }
    if (typeof json !== 'string') {
      return NextResponse.json({ error: 'json (string) is required' }, { status: 400 })
    }
    if (book_type !== undefined && normalizeBookType(book_type) === null) {
      return NextResponse.json({ error: 'book_type must be "textbook", "handbook", or "workbook"' }, { status: 400 })
    }
    if (audience !== undefined && normalizeAudience(audience) === null) {
      return NextResponse.json({ error: 'audience must be "teacher", "student", or "both"' }, { status: 400 })
    }
    const overrideBookType = normalizeBookType(book_type)
    const overrideAudience = normalizeAudience(audience)
    const overrideBookName = normalizeBookName(book_name)

    const parsed = parseSyllabusBulk(json)
    if (!parsed.ok) {
      // Surface the exact validation message so the curator can fix their JSON.
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const { chapters, foldedUnitsCount } = parsed.value
    const resolvedChapters = chapters.map((ch) => {
      const resolvedBookType = ch.book_type ?? overrideBookType ?? 'textbook' as const
      const resolvedAudience = ch.audience ?? overrideAudience ?? defaultAudienceForBookType(resolvedBookType)
      const resolvedBookName = ch.book_name ?? overrideBookName ?? null
      // Kept separately from the resolved value above: when updating an
      // *existing* chapter, only an audience the JSON itself declared should
      // overwrite it — the request-level override/smart-default exist to
      // seed brand-new chapters, not to silently reset a value someone
      // already customized by hand just because this re-import didn't
      // mention it. book_name doesn't need the same treatment since it's
      // part of the match key below — a matched row's book_name is already
      // equal to this one by definition.
      return { ...ch, book_type: resolvedBookType, audience: resolvedAudience, book_name: resolvedBookName, explicitAudience: ch.audience }
    })

    // Guard: the subject must exist (import targets an existing board/grade/subject).
    const subj = await client.query('SELECT id FROM master_subjects WHERE id = $1', [subject_id])
    if (subj.rowCount === 0) {
      return NextResponse.json({ error: `No master subject with id ${subject_id}` }, { status: 404 })
    }

    await client.query('BEGIN')

    if (mode === 'replace') {
      // Only clear the exact (book_type, book_name) pair(s) being (re)imported
      // — otherwise re-importing "Telugu Parimalam" would also wipe out a
      // different Text Book ("Second Language Telugu") sharing the same
      // book_type, or a Hand Book would wipe the subject's Text Book(s).
      // Cascades to master_topics via ON DELETE CASCADE.
      const booksInPlay = new Map<string, { book_type: string; book_name: string | null }>()
      for (const ch of resolvedChapters) booksInPlay.set(`${ch.book_type}::${ch.book_name ?? ''}`, { book_type: ch.book_type, book_name: ch.book_name })
      for (const { book_type: bt, book_name: bn } of booksInPlay.values()) {
        await client.query(
          `DELETE FROM master_chapters WHERE subject_id = $1 AND book_type = $2 AND LOWER(TRIM(book_name)) IS NOT DISTINCT FROM LOWER(TRIM($3))`,
          [subject_id, bt, bn],
        )
      }
    }

    const orderRes = await client.query(
      'SELECT COALESCE(MAX(chapter_order), -1) + 1 AS next FROM master_chapters WHERE subject_id = $1',
      [subject_id],
    )
    let chapterOrder: number = orderRes.rows[0].next

    let chaptersCreated = 0
    let chaptersUpdated = 0

    for (const ch of resolvedChapters) {
      // In append mode, re-importing the same book is common (a re-run, or a
      // corrected JSON) — match on (subject, book_type, book_name,
      // chapter_name) and replace that chapter's topics instead of inserting
      // a duplicate chapter every time. book_name is compared case/whitespace
      // -insensitively via IS NOT DISTINCT FROM so two NULLs (both books
      // "unnamed") still match, same as a normal string match would.
      // Skipped in replace mode since those exact books were already cleared
      // above, so nothing will match.
      const existingChapter = mode === 'append'
        ? await client.query(
            `SELECT id FROM master_chapters WHERE subject_id = $1 AND book_type = $2 AND LOWER(TRIM(book_name)) IS NOT DISTINCT FROM LOWER(TRIM($3)) AND LOWER(TRIM(chapter_name)) = LOWER(TRIM($4))`,
            [subject_id, ch.book_type, ch.book_name, ch.title],
          )
        : { rows: [] as { id: number }[] }

      let chapterId: number
      if (existingChapter.rows.length > 0) {
        chapterId = existingChapter.rows[0].id
        // Only overwrite semester/audience when THIS import's JSON actually
        // declares one — COALESCE keeps whatever's already on the row
        // otherwise, so re-importing a book that doesn't mention semester,
        // or relying on the request-level audience default, never clobbers
        // a value that was set some other way (manually, or by an earlier
        // import that did specify it). chapter_name/book_type stay fixed
        // since they're the match key.
        await client.query(
          'UPDATE master_chapters SET semester = COALESCE($1, semester), audience = COALESCE($2, audience) WHERE id = $3',
          [ch.semester, ch.explicitAudience, chapterId],
        )
        await client.query('DELETE FROM master_topics WHERE chapter_id = $1', [chapterId])
        chaptersUpdated += 1
      } else {
        const chRes = await client.query(
          `INSERT INTO master_chapters (subject_id, chapter_name, chapter_order, description, semester, book_type, audience, book_name)
           VALUES ($1, $2, $3, '', $4, $5, $6, $7) RETURNING id`,
          [subject_id, ch.title, chapterOrder, ch.semester, ch.book_type, ch.audience, ch.book_name],
        )
        chapterId = chRes.rows[0].id
        chapterOrder += 1
        chaptersCreated += 1
      }

      let topicOrder = 0
      for (const t of ch.topics) {
        await client.query(
          `INSERT INTO master_topics (chapter_id, topic_name, topic_order, subtopics)
           VALUES ($1, $2, $3, $4::jsonb)`,
          [chapterId, t.title, topicOrder, JSON.stringify(t.subtopics)],
        )
        topicOrder += 1
      }
    }

    await client.query('COMMIT')

    return NextResponse.json({
      ok: true,
      mode,
      chapters: chapters.length,
      chapters_created: chaptersCreated,
      chapters_updated: chaptersUpdated,
      topics: chapters.reduce((n, c) => n + c.topics.length, 0),
      // How many top-level sections the parser auto-folded into a preceding
      // chapter (mis-nested by the PDF extractor) — surfaced so an admin
      // seeing fewer chapters than expected can tell "repaired" from "lost".
      sections_merged: foldedUnitsCount,
    })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('bulk-import POST error:', err)
    const message = err instanceof Error && /timeout exceeded when trying to connect/.test(err.message)
      ? 'Database connection timed out — try again in a moment.'
      : 'Failed to import syllabus'
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    client.release()
  }
}
