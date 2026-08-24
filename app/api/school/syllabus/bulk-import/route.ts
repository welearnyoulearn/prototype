import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { resolveAcademicYear } from '@/lib/academicYear'
import { requireSyllabusWriteAccess } from '@/lib/auth'
import { parseSyllabusBulk, normalizeBookType, normalizeAudience, normalizeBookName, defaultAudienceForBookType } from '@/lib/syllabus/bulk-import-schema'

// POST /api/school/syllabus/bulk-import
// body: { school_id, class_id, subject, json, book_type?, audience?, book_name? }
//
// Teacher-facing twin of /api/platform/syllabus/bulk-import — same JSON
// shape, same parser (lib/syllabus/bulk-import-schema.ts), same
// copy-a-ChatGPT-prompt workflow, but writes into a SCHOOL's own
// school_chapters/school_topics instead of the global master_* catalog, and
// resolves its target subject from (school_id, grade, subject_name,
// academic_year) the same way POST /api/syllabus already does — not from a
// master_subject_id, since this exists specifically for subjects that have
// no master-catalog backing at all (a school-created custom subject, or one
// whose master import came in empty).
//
// Deliberately append-only (no replace mode): a teacher bootstrapping their
// own subject from a textbook has nothing to safely "replace" yet, and
// giving this endpoint destructive power over a school's local content is a
// bigger blast radius than the platform-admin route's replace mode, which
// only ever affects the shared master catalog before any school has copied
// it.
export async function POST(req: NextRequest) {
  const client = await pool.connect()
  try {
    await ensureDB()
    const { school_id, class_id, subject, json, book_type, audience, book_name } = await req.json()

    if (!school_id || !class_id || !subject) {
      return NextResponse.json({ error: 'school_id, class_id, subject required' }, { status: 400 })
    }
    if (!await requireSyllabusWriteAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const { chapters, foldedUnitsCount } = parsed.value
    const resolvedChapters = chapters.map((ch) => {
      const resolvedBookType = ch.book_type ?? overrideBookType ?? 'textbook' as const
      const resolvedAudience = ch.audience ?? overrideAudience ?? defaultAudienceForBookType(resolvedBookType)
      const resolvedBookName = ch.book_name ?? overrideBookName ?? null
      return { ...ch, book_type: resolvedBookType, audience: resolvedAudience, book_name: resolvedBookName }
    })

    const classRes = await client.query(
      'SELECT grade FROM classes WHERE id = $1 AND school_id = $2',
      [class_id, school_id]
    )
    if (classRes.rows.length === 0) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }
    const { grade } = classRes.rows[0]
    const academic_year = req.nextUrl.searchParams.get('academic_year') || await resolveAcademicYear(school_id)

    await client.query('BEGIN')

    // Find or create the school subject — same as POST /api/syllabus.
    let school_subject_id: number
    const subjectRes = await client.query(
      'SELECT id FROM school_subjects WHERE school_id = $1 AND grade = $2 AND subject_name = $3 AND academic_year = $4',
      [school_id, grade, subject, academic_year]
    )
    if (subjectRes.rows.length === 0) {
      const insertSubj = await client.query(
        'INSERT INTO school_subjects (school_id, grade, subject_name, academic_year) VALUES ($1, $2, $3, $4) RETURNING id',
        [school_id, grade, subject, academic_year]
      )
      school_subject_id = insertSubj.rows[0].id
    } else {
      school_subject_id = subjectRes.rows[0].id
    }

    const orderRes = await client.query(
      'SELECT COALESCE(MAX(chapter_order), -1) + 1 AS next FROM school_chapters WHERE school_subject_id = $1',
      [school_subject_id],
    )
    let chapterOrder: number = orderRes.rows[0].next

    let chaptersCreated = 0
    let chaptersUpdated = 0

    for (const ch of resolvedChapters) {
      // Re-importing the same book (a re-run, or a corrected paste) matches on
      // (subject, book_type, book_name, chapter_name) and replaces that
      // chapter's topics instead of duplicating it — same append-mode
      // matching the platform route uses.
      const existingChapter = await client.query(
        `SELECT id FROM school_chapters WHERE school_subject_id = $1 AND book_type = $2 AND LOWER(TRIM(COALESCE(book_name, ''))) = LOWER(TRIM(COALESCE($3, ''))) AND LOWER(TRIM(chapter_name)) = LOWER(TRIM($4))`,
        [school_subject_id, ch.book_type, ch.book_name, ch.title],
      )

      let chapterId: number
      if (existingChapter.rows.length > 0) {
        chapterId = existingChapter.rows[0].id
        await client.query(
          'UPDATE school_chapters SET semester = COALESCE($1, semester), audience = COALESCE($2, audience) WHERE id = $3',
          [ch.semester, ch.audience, chapterId],
        )
        await client.query('DELETE FROM school_topics WHERE school_chapter_id = $1', [chapterId])
        chaptersUpdated += 1
      } else {
        const chRes = await client.query(
          `INSERT INTO school_chapters (school_subject_id, chapter_name, chapter_order, semester, book_type, audience, book_name, is_custom)
           VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE) RETURNING id`,
          [school_subject_id, ch.title, chapterOrder, ch.semester, ch.book_type, ch.audience, ch.book_name],
        )
        chapterId = chRes.rows[0].id
        chapterOrder += 1
        chaptersCreated += 1
      }

      let topicOrder = 0
      for (const t of ch.topics) {
        await client.query(
          `INSERT INTO school_topics (school_chapter_id, topic_name, topic_order, subtopics, is_custom)
           VALUES ($1, $2, $3, $4::jsonb, TRUE)`,
          [chapterId, t.title, topicOrder, JSON.stringify(t.subtopics)],
        )
        topicOrder += 1
      }
    }

    await client.query('COMMIT')

    return NextResponse.json({
      ok: true,
      chapters: chapters.length,
      chapters_created: chaptersCreated,
      chapters_updated: chaptersUpdated,
      topics: chapters.reduce((n, c) => n + c.topics.length, 0),
      sections_merged: foldedUnitsCount,
    })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('school/syllabus/bulk-import POST error:', err)
    const message = err instanceof Error && /timeout exceeded when trying to connect/.test(err.message)
      ? 'Database connection timed out — try again in a moment.'
      : 'Failed to import syllabus'
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    client.release()
  }
}
