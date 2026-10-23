import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { resolveAcademicYear } from '@/lib/academicYear'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/syllabus/analytics/trend?school_id=&class_id=&academic_year=
// GET /api/syllabus/analytics/trend?school_id=&teacher_id=&academic_year=
//
// Weekly coverage history for the Syllabus Tracking trend chart, read from
// syllabus_coverage_snapshots (populated by the weekly
// /api/cron/syllabus-coverage-snapshot job). Exactly one of class_id/teacher_id
// is required — class_id returns one series per subject taught to that class;
// teacher_id returns one series per (class, subject) assignment that teacher
// holds, labeled "{grade}-{section} · {subject}" so two classes of the same
// subject don't collide.
//
// Until enough weekly snapshots exist (e.g. a brand-new school, or one that
// just enabled this feature), this returns however many weeks are actually
// on record — never padded with fake/zero data points.
export async function GET(req: NextRequest) {
  const school_id = req.nextUrl.searchParams.get('school_id')
  const class_id = req.nextUrl.searchParams.get('class_id')
  const teacher_id = req.nextUrl.searchParams.get('teacher_id')

  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  if (!class_id && !teacher_id) return NextResponse.json({ error: 'class_id or teacher_id required' }, { status: 400 })
  if (class_id && teacher_id) return NextResponse.json({ error: 'Provide only one of class_id or teacher_id' }, { status: 400 })
  if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    await ensureDB()
    const academic_year = req.nextUrl.searchParams.get('academic_year') || await resolveAcademicYear(school_id)

    type SnapshotRow = {
      snapshot_date: string
      subject: string
      grade: string
      section: string
      total_chapters: number
      covered_chapters: number
    }

    let rows: SnapshotRow[]
    if (class_id) {
      const res = await pool.query<SnapshotRow>(
        `SELECT scs.snapshot_date::text, ss.subject_name AS subject, c.grade, c.section,
                scs.total_chapters, scs.covered_chapters
         FROM syllabus_coverage_snapshots scs
         JOIN school_subjects ss ON ss.id = scs.school_subject_id
         JOIN classes c ON c.id = scs.class_id
         WHERE scs.school_id = $1 AND scs.class_id = $2 AND scs.academic_year = $3
         ORDER BY scs.snapshot_date, ss.subject_name`,
        [school_id, class_id, academic_year]
      )
      rows = res.rows
    } else {
      const res = await pool.query<SnapshotRow>(
        `SELECT scs.snapshot_date::text, ss.subject_name AS subject, c.grade, c.section,
                scs.total_chapters, scs.covered_chapters
         FROM syllabus_coverage_snapshots scs
         JOIN school_subjects ss ON ss.id = scs.school_subject_id
         JOIN classes c ON c.id = scs.class_id
         JOIN class_subjects cs ON cs.class_id = scs.class_id AND cs.subject_name = ss.subject_name AND cs.teacher_id = $2
         WHERE scs.school_id = $1 AND scs.academic_year = $3
         ORDER BY scs.snapshot_date, c.grade, c.section, ss.subject_name`,
        [school_id, teacher_id, academic_year]
      )
      rows = res.rows
    }

    // Distinct sorted weeks across every series, and one series per
    // subject (class mode) or per "{grade}-{section} · {subject}" (teacher
    // mode) — each series' values are aligned to the shared `weeks` array by
    // index, with null for a week that series has no snapshot for yet
    // (e.g. a subject added to the class after tracking started).
    const weeks = Array.from(new Set(rows.map(r => r.snapshot_date))).sort()

    const seriesKey = (r: SnapshotRow) => class_id ? r.subject : `${r.grade}-${r.section} · ${r.subject}`
    const seriesMap = new Map<string, Map<string, number>>()
    for (const r of rows) {
      const key = seriesKey(r)
      if (!seriesMap.has(key)) seriesMap.set(key, new Map())
      const pct = r.total_chapters > 0 ? Math.round((r.covered_chapters / r.total_chapters) * 100) : 0
      seriesMap.get(key)!.set(r.snapshot_date, pct)
    }

    const series = Array.from(seriesMap.entries()).map(([subject, byWeek]) => ({
      subject,
      values: weeks.map(w => byWeek.get(w) ?? null),
    }))

    return NextResponse.json({ weeks, series })
  } catch (err) {
    console.error('[syllabus/analytics/trend]', err)
    return NextResponse.json({ error: 'Failed to fetch coverage trend' }, { status: 500 })
  }
}
