import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { resolveAcademicYear } from '@/lib/academicYear'
import { requireSyllabusAccess, schoolHasFeature } from '@/lib/auth'
import { gradeOrderSql } from '@/lib/grades'

// GET /api/school/library?school_id=&academic_year=
//
// WLYL Digital Library: every textbook/handbook uploaded (once, platform-side)
// against any subject this school is subscribed to, across every grade — a
// standalone browsing view, unlike /api/school/subjects/materials which is
// scoped to one (grade, subject_name) pair for the embedded syllabus panel.
// Visible to every school role (school admin/principal/VP, teacher, student,
// parent) with no textbook/handbook restriction — the library is meant to be
// browsable by everyone, unlike the syllabus view's staff-only handbooks.
export async function GET(req: NextRequest) {
  const school_id = req.nextUrl.searchParams.get('school_id')
  if (!school_id) {
    return NextResponse.json({ error: 'school_id is required' }, { status: 400 })
  }

  const access = await requireSyllabusAccess(school_id)
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // requireSyllabusAccess only checks tenant/role — the library toggle itself
  // (plan tier or per-school override) is a separate gate, same as every
  // other feature-gated route. platform_admin previewing a school bypasses
  // this the same way requireSyllabusAccess already lets it bypass tenancy.
  if (access.role !== 'platform_admin' && !(await schoolHasFeature(Number(school_id), 'library'))) {
    return NextResponse.json({ error: 'Digital Library is not enabled for this school' }, { status: 403 })
  }

  try {
    await ensureDB()
    const academic_year = req.nextUrl.searchParams.get('academic_year') || await resolveAcademicYear(school_id)

    const { rows } = await pool.query(
      `SELECT ss.master_subject_id AS subject_id, ss.board, ss.grade, ss.subject_name, ss.category,
              m.id AS material_id, m.material_type, m.title, m.file_url, m.created_at
       FROM school_subjects ss
       JOIN master_subject_materials m ON m.subject_id = ss.master_subject_id
       WHERE ss.school_id = $1 AND ss.academic_year = $2
       ORDER BY ${gradeOrderSql('ss.grade')}, ss.subject_name, m.material_type, m.created_at`,
      [school_id, academic_year]
    )
    return NextResponse.json(rows)
  } catch (err) {
    console.error('School library GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch library' }, { status: 500 })
  }
}
