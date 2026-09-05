import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { requireSyllabusWriteAccess } from '@/lib/auth'

// PATCH /api/syllabus/chapters/:id — rename a chapter.
// Body: { school_id, chapter_name }
//
// A teacher (or school admin) can rename any chapter in their school's own
// copy — board-mandated or custom. This only ever updates school_chapters,
// never the platform-wide master_chapters catalog other schools draw from,
// so it can't leak across schools. Originally scoped to custom-only
// (mainly for renaming the "Chapter 1"/"Chapter 2" placeholders
// POST /api/school/syllabus/bootstrap-chapters lays down), opened up to
// every chapter per explicit product direction — teachers get full editing
// control over their own school's syllabus copy.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDB()
    const { id } = await params
    const body = await req.json()
    const { school_id, chapter_name } = body

    if (!school_id || !chapter_name || !String(chapter_name).trim()) {
      return NextResponse.json({ error: 'school_id, chapter_name required' }, { status: 400 })
    }
    if (!await requireSyllabusWriteAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { rows } = await pool.query(
      `SELECT sc.id, sc.school_subject_id
       FROM school_chapters sc
       JOIN school_subjects ss ON ss.id = sc.school_subject_id
       WHERE sc.id = $1 AND ss.school_id = $2`,
      [id, school_id]
    )
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 })
    }

    const name = String(chapter_name).trim()
    const dupe = await pool.query(
      'SELECT id FROM school_chapters WHERE school_subject_id = $1 AND chapter_name = $2 AND id <> $3',
      [rows[0].school_subject_id, name, id]
    )
    if (dupe.rows.length > 0) {
      return NextResponse.json({ error: `A chapter named "${name}" already exists in this subject` }, { status: 409 })
    }

    const updated = await pool.query(
      'UPDATE school_chapters SET chapter_name = $1 WHERE id = $2 RETURNING *',
      [name, id]
    )
    return NextResponse.json({ chapter: updated.rows[0] })
  } catch (err) {
    console.error('Syllabus chapters PATCH error:', err)
    return NextResponse.json({ error: 'Failed to rename chapter' }, { status: 500 })
  }
}
