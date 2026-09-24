import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requirePlatformAdmin } from '@/lib/auth'
import { normalizeBookType, normalizeAudience, normalizeBookName, defaultAudienceForBookType } from '@/lib/syllabus/bulk-import-schema'

// GET /api/platform/subjects/[id]/chapters
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const { rows: chapters } = await pool.query(
      'SELECT * FROM master_chapters WHERE subject_id = $1 ORDER BY chapter_order, id',
      [id]
    )
    return NextResponse.json(chapters)
  } catch (err) {
    console.error('Platform chapters list GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch chapters' }, { status: 500 })
  }
}

// POST /api/platform/subjects/[id]/chapters
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: subjectId } = await params
  if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const { id, chapter_name, chapter_order = 0, description = '', semester = null, book_type, audience, book_name } = await req.json()
    if (!chapter_name) {
      return NextResponse.json({ error: 'chapter_name is required' }, { status: 400 })
    }
    const normalizedBookType = normalizeBookType(book_type)
    const normalizedAudience = normalizeAudience(audience)
    const normalizedBookName = normalizeBookName(book_name)

    let row;
    if (id) {
      // Update — preserve the existing book_type/audience if none was explicitly
      // passed, but book_name is directly assigned (not COALESCEd): unlike the
      // two required selects, it's meant to be freely clearable from the form.
      const res = await pool.query(
        `UPDATE master_chapters
         SET chapter_name = $1, chapter_order = $2, description = $3, semester = $6, book_type = COALESCE($7, book_type), audience = COALESCE($8, audience), book_name = $9
         WHERE id = $4 AND subject_id = $5
         RETURNING *`,
        [chapter_name, chapter_order, description, id, subjectId, semester || null, normalizedBookType, normalizedAudience, normalizedBookName]
      )
      row = res.rows[0]
    } else {
      // Insert
      const resolvedBookType = normalizedBookType ?? 'textbook'
      const res = await pool.query(
        `INSERT INTO master_chapters (subject_id, chapter_name, chapter_order, description, semester, book_type, audience, book_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [subjectId, chapter_name, chapter_order, description, semester || null, resolvedBookType, normalizedAudience ?? defaultAudienceForBookType(resolvedBookType), normalizedBookName]
      )
      row = res.rows[0]
    }

    return NextResponse.json({ chapter: row })
  } catch (err) {
    console.error('Platform chapters POST error:', err)
    return NextResponse.json({ error: 'Failed to save master chapter' }, { status: 500 })
  }
}

// DELETE /api/platform/subjects/[id]/chapters?book_type=textbook&book_name=Telugu%20Parimalam
//
// Deletes every chapter (and, via ON DELETE CASCADE, their topics) for one
// whole book on this subject — the "book" tab switcher's delete action.
// Scoped by (book_type, book_name) the same way bulk-import's replace mode
// scopes its clear, so deleting "Telugu Parimalam" never touches a different
// same-type book ("Second Language Telugu") on the same subject. book_name
// is compared case/whitespace-insensitively via IS NOT DISTINCT FROM so the
// unnamed-book bucket (NULL) matches correctly too.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: subjectId } = await params
  if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const bookType = normalizeBookType(req.nextUrl.searchParams.get('book_type') ?? undefined)
    if (!bookType) {
      return NextResponse.json({ error: 'book_type must be "textbook", "handbook", or "workbook"' }, { status: 400 })
    }
    const bookName = normalizeBookName(req.nextUrl.searchParams.get('book_name'))

    const { rowCount } = await pool.query(
      `DELETE FROM master_chapters WHERE subject_id = $1 AND book_type = $2 AND LOWER(TRIM(book_name)) IS NOT DISTINCT FROM LOWER(TRIM($3))`,
      [subjectId, bookType, bookName]
    )
    return NextResponse.json({ ok: true, chapters_deleted: rowCount })
  } catch (err) {
    console.error('Platform chapters DELETE error:', err)
    return NextResponse.json({ error: 'Failed to delete book' }, { status: 500 })
  }
}
