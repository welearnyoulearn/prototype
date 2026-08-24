import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { resolveAcademicYear } from '@/lib/academicYear'
import { requireFeeAccess } from '@/lib/auth'

// GET /api/syllabus/analytics?school_id=
// Returns school-wide syllabus coverage metrics using the new copy-on-subscribe hierarchical tables:
//   by_class   — per class: total, covered, pct, subjects breakdown
//   by_teacher — per teacher: total, covered, pct across all assigned classes
//   by_subject — per subject: total, covered, pct across school
//
// Coverage is counted in CHAPTERS, not topics — a chapter counts as
// "covered" only once every one of its topics is marked covered (a chapter
// with zero topics is never covered), the same definition the teacher's own
// Syllabus tab already uses for its per-chapter "Done" badge
// (ClassView.tsx: pct === 100 when ch.covered === ch.total). This holds
// regardless of which bootstrap path populated the chapter — a JSON import
// or a manual "how many chapters" count both just create real
// school_chapters/school_topics rows, so the same chapter-covered logic
// applies uniformly either way.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const school_id = searchParams.get('school_id')

  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  if (!await requireFeeAccess(school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    await ensureDB()

    // Every query below joins school_subjects by school_id + grade only, so
    // without an academic_year filter a school that has re-subscribed the
    // same subject in a later year (normal after Year Rollover) would have
    // that subject's chapters counted once per year — inflating totals and
    // skewing every percentage. Resolve the single active year the same way
    // every other feature does and scope all three queries to it.
    const academic_year = req.nextUrl.searchParams.get('academic_year') || await resolveAcademicYear(school_id)

    // Per (class, chapter) coverage — one row per chapter, pre-aggregated
    // from topics up to chapter level (a chapter is covered iff every one of
    // its topics is covered, and it has at least one topic). Shared by all
    // three rollups below via three different GROUP BYs over the same base.
    const chapterCoverageCTE = `
      WITH chapter_coverage AS (
        SELECT
          c.id AS class_id,
          c.grade,
          c.section,
          ss.subject_name AS subject,
          sc.id AS chapter_id,
          COUNT(st.id) AS topic_count,
          COUNT(st.id) FILTER (WHERE stp.status = 'covered') AS topics_covered
        FROM classes c
        JOIN school_subjects ss ON ss.school_id = c.school_id AND ss.grade = c.grade AND ss.academic_year = $2
        JOIN school_chapters sc ON sc.school_subject_id = ss.id
        LEFT JOIN school_topics st ON st.school_chapter_id = sc.id
        LEFT JOIN school_topic_progress stp ON stp.school_topic_id = st.id AND stp.class_id = c.id
        WHERE c.school_id = $1
        GROUP BY c.id, c.grade, c.section, ss.subject_name, sc.id
      )
    `

    const [byClassRes, byTeacherRes, bySubjectRes] = await Promise.all([
      // 1. Per class × subject chapter coverage
      pool.query(`
        ${chapterCoverageCTE}
        SELECT
          class_id, grade, section, subject,
          COUNT(*) FILTER (WHERE topic_count > 0)::int AS total,
          COUNT(*) FILTER (WHERE topic_count > 0 AND topics_covered = topic_count)::int AS covered
        FROM chapter_coverage
        GROUP BY class_id, grade, section, subject
        ORDER BY grade, section, subject
      `, [school_id, academic_year]),

      // 2. Per teacher: aggregate across all classes/subjects they're
      //    actually assigned via Class Management's class_subjects — the
      //    real source of truth (not a timetable, which may not exist for
      //    schools without that feature, or a class_id/subject the teacher
      //    was never assigned by the school admin).
      pool.query(`
        SELECT
          te.id AS teacher_id,
          te.name AS teacher_name,
          cs.subject_name AS subject,
          COUNT(sc.id) FILTER (WHERE topic_count.n > 0)::int AS total,
          COUNT(sc.id) FILTER (WHERE topic_count.n > 0 AND topic_count.covered_n = topic_count.n)::int AS covered
        FROM teachers te
        JOIN class_subjects cs ON cs.teacher_id = te.id
        JOIN classes c ON c.id = cs.class_id
        JOIN school_subjects ss ON ss.school_id = $1 AND ss.grade = c.grade AND ss.subject_name = cs.subject_name AND ss.academic_year = $2
        JOIN school_chapters sc ON sc.school_subject_id = ss.id
        LEFT JOIN LATERAL (
          SELECT
            COUNT(st.id) AS n,
            COUNT(st.id) FILTER (WHERE stp.status = 'covered') AS covered_n
          FROM school_topics st
          LEFT JOIN school_topic_progress stp ON stp.school_topic_id = st.id AND stp.class_id = cs.class_id
          WHERE st.school_chapter_id = sc.id
        ) topic_count ON TRUE
        WHERE te.school_id = $1
        GROUP BY te.id, te.name, cs.subject_name
        ORDER BY te.name, cs.subject_name
      `, [school_id, academic_year]),

      // 3. Per subject across school (sum over all classes in the grade)
      pool.query(`
        ${chapterCoverageCTE}
        SELECT
          subject,
          COUNT(*) FILTER (WHERE topic_count > 0)::int AS total,
          COUNT(*) FILTER (WHERE topic_count > 0 AND topics_covered = topic_count)::int AS covered
        FROM chapter_coverage
        GROUP BY subject
        ORDER BY subject
      `, [school_id, academic_year]),
    ])

    // Roll up by_class rows into class objects with subject breakdown
    const classMap: Record<number, {
      class_id: number; grade: string; section: string
      total: number; covered: number
      subjects: { subject: string; total: number; covered: number; pct: number }[]
    }> = {}

    for (const r of byClassRes.rows) {
      if (!classMap[r.class_id]) {
        classMap[r.class_id] = {
          class_id: r.class_id,
          grade: r.grade,
          section: r.section,
          total: 0, covered: 0,
          subjects: [],
        }
      }
      const cls = classMap[r.class_id]
      cls.total   += r.total
      cls.covered += r.covered
      cls.subjects.push({
        subject: r.subject,
        total:   r.total,
        covered: r.covered,
        pct:     r.total > 0 ? Math.round((r.covered / r.total) * 100) : 0,
      })
    }

    // Roll up by_teacher rows
    const teacherMap: Record<number, {
      teacher_id: number; teacher_name: string
      total: number; covered: number
      subjects: { subject: string; total: number; covered: number; pct: number }[]
    }> = {}

    for (const r of byTeacherRes.rows) {
      if (!teacherMap[r.teacher_id]) {
        teacherMap[r.teacher_id] = {
          teacher_id: r.teacher_id,
          teacher_name: r.teacher_name,
          total: 0, covered: 0,
          subjects: [],
        }
      }
      const t = teacherMap[r.teacher_id]
      t.total   += r.total
      t.covered += r.covered
      t.subjects.push({
        subject: r.subject,
        total:   r.total,
        covered: r.covered,
        pct:     r.total > 0 ? Math.round((r.covered / r.total) * 100) : 0,
      })
    }

    return NextResponse.json({
      academic_year,
      by_class: Object.values(classMap).map(c => ({
        ...c,
        pct: c.total > 0 ? Math.round((c.covered / c.total) * 100) : null,
      })),
      by_teacher: Object.values(teacherMap).map(t => ({
        ...t,
        pct: t.total > 0 ? Math.round((t.covered / t.total) * 100) : null,
      })),
      by_subject: bySubjectRes.rows.map(r => ({
        subject: r.subject,
        total:   r.total,
        covered: r.covered,
        pct:     r.total > 0 ? Math.round((r.covered / r.total) * 100) : null,
      })),
    })
  } catch (err) {
    console.error('[syllabus/analytics]', err)
    return NextResponse.json({ error: 'Failed to fetch syllabus analytics' }, { status: 500 })
  }
}
