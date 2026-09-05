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
// pct is CHAPTER-WEIGHTED with partial credit, matching GET /api/syllabus's
// own completion_pct exactly: every ACTIVE chapter (for this class, per
// class_chapter_visibility) is an equal 1/N share of its subject (10 active
// chapters -> each worth 10%), and a chapter's own share is scaled by
// topics_covered/topic_count rather than being all-or-nothing — a chapter
// with 5 of 8 topics done contributes 5/8 of its 1/N share, not 0%.
//
// `total` MUST include every active chapter, even one with zero topics
// (topic_count = 0) — it still occupies its 1/N share and contributes 0 to
// the weighted sum, exactly like GET /api/syllabus's completion_pct does.
// Excluding zero-topic chapters from `total` (an earlier version of this
// route did, via `FILTER (WHERE topic_count > 0)`) shrinks the denominator
// and inflates pct — confirmed as a real bug: a class with 15 active
// chapters (6 of them genuinely empty) showed 47% on the teacher's own
// screen but 78% here, because this route's denominator silently dropped
// to 9. `covered` stays a stricter "fully complete, non-empty chapter"
// count (a zero-topic chapter is never "covered", it just isn't excluded
// from `total` either) — it's a display-only raw count, not what pct is
// derived from.
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
    //
    // Class Syllabus Setup: visibility is inherently class-scoped (a chapter
    // can be active for 9-A and inactive for 9-B), so both visibility joins
    // below are keyed on c.id — the same class the rest of this CTE is
    // already grouped by — never on subject or school alone. A chapter
    // deactivated for a class is excluded from this CTE's rows entirely (the
    // JOIN condition, not a WHERE filter, so it never contributes a
    // topic_count=0 row that GROUP BY would otherwise still produce). A
    // topic individually deactivated for a class is excluded only from that
    // chapter's own topic_count/topics_covered — same effect as Step 2's
    // GET /api/syllabus fix, except here there's no "must still display an
    // empty chapter" requirement, so the chapter naturally reads as
    // topic_count=0 and is excluded by the existing `topic_count > 0` filter
    // in every SELECT below, exactly like a genuinely empty chapter already is.
    const chapterCoverageCTE = `
      WITH chapter_coverage AS (
        SELECT
          c.id AS class_id,
          c.grade,
          c.section,
          ss.subject_name AS subject,
          sc.id AS chapter_id,
          COUNT(st.id) FILTER (WHERE COALESCE(ctv.is_active, TRUE)) AS topic_count,
          COUNT(st.id) FILTER (WHERE COALESCE(ctv.is_active, TRUE) AND stp.status = 'covered') AS topics_covered
        FROM classes c
        JOIN school_subjects ss ON ss.school_id = c.school_id AND ss.grade = c.grade AND ss.academic_year = $2
        JOIN school_chapters sc ON sc.school_subject_id = ss.id
        LEFT JOIN class_chapter_visibility ccv ON ccv.class_id = c.id AND ccv.school_chapter_id = sc.id
        LEFT JOIN school_topics st ON st.school_chapter_id = sc.id
        LEFT JOIN class_topic_visibility ctv ON ctv.class_id = c.id AND ctv.school_topic_id = st.id
        LEFT JOIN school_topic_progress stp ON stp.school_topic_id = st.id AND stp.class_id = c.id
        WHERE c.school_id = $1 AND COALESCE(ccv.is_active, TRUE)
        GROUP BY c.id, c.grade, c.section, ss.subject_name, sc.id
      )
    `

    const [byClassRes, byTeacherRes, bySubjectRes] = await Promise.all([
      // 1. Per class × subject chapter coverage, with the assigned teacher's
      //    name for that (class, subject) pair — class_subjects is the real
      //    source of truth for who teaches what; a subject with no
      //    class_subjects row yet (assigned via a path other than Class
      //    Management, or simply unassigned) surfaces teacher_name as NULL
      //    rather than dropping the subject from the response.
      pool.query(`
        ${chapterCoverageCTE}
        SELECT
          cc.class_id, cc.grade, cc.section, cc.subject,
          te.name AS teacher_name,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE cc.topic_count > 0 AND cc.topics_covered = cc.topic_count)::int AS covered,
          COALESCE(SUM(cc.topics_covered::numeric / NULLIF(cc.topic_count, 0)) FILTER (WHERE cc.topic_count > 0), 0) AS weighted_sum
        FROM chapter_coverage cc
        LEFT JOIN class_subjects cs ON cs.class_id = cc.class_id AND cs.subject_name = cc.subject
        LEFT JOIN teachers te ON te.id = cs.teacher_id
        GROUP BY cc.class_id, cc.grade, cc.section, cc.subject, te.name
        ORDER BY cc.grade, cc.section, cc.subject
      `, [school_id, academic_year]),

      // 2. Per teacher × (class, subject) assignment — one row per
      //    assignment, NOT merged across classes, so a teacher holding
      //    Mathematics in both 9-A and 9-B gets two separate rows here
      //    (class/grade shown for each) instead of one blended "Mathematics"
      //    total. Aggregate across all classes/subjects they're actually
      //    assigned via Class Management's class_subjects — the real source
      //    of truth (not a timetable, which may not exist for schools
      //    without that feature, or a class_id/subject the teacher was never
      //    assigned by the school admin).
      //    Same class-scoped visibility rules as chapter_coverage above:
      //    a chapter deactivated for cs.class_id is excluded via the JOIN
      //    condition (never counted at all, not even as topic_count=0);
      //    an individually-deactivated topic is excluded only from that
      //    chapter's own topic_count/covered_n.
      pool.query(`
        SELECT
          te.id AS teacher_id,
          te.name AS teacher_name,
          c.id AS class_id,
          c.grade,
          c.section,
          cs.subject_name AS subject,
          COUNT(sc.id)::int AS total,
          COUNT(sc.id) FILTER (WHERE topic_count.n > 0 AND topic_count.covered_n = topic_count.n)::int AS covered,
          COALESCE(SUM(topic_count.covered_n::numeric / NULLIF(topic_count.n, 0)) FILTER (WHERE topic_count.n > 0), 0) AS weighted_sum
        FROM teachers te
        JOIN class_subjects cs ON cs.teacher_id = te.id
        JOIN classes c ON c.id = cs.class_id
        JOIN school_subjects ss ON ss.school_id = $1 AND ss.grade = c.grade AND ss.subject_name = cs.subject_name AND ss.academic_year = $2
        JOIN school_chapters sc ON sc.school_subject_id = ss.id
        LEFT JOIN class_chapter_visibility ccv ON ccv.class_id = cs.class_id AND ccv.school_chapter_id = sc.id
        LEFT JOIN LATERAL (
          SELECT
            COUNT(st.id) FILTER (WHERE COALESCE(ctv.is_active, TRUE)) AS n,
            COUNT(st.id) FILTER (WHERE COALESCE(ctv.is_active, TRUE) AND stp.status = 'covered') AS covered_n
          FROM school_topics st
          LEFT JOIN class_topic_visibility ctv ON ctv.class_id = cs.class_id AND ctv.school_topic_id = st.id
          LEFT JOIN school_topic_progress stp ON stp.school_topic_id = st.id AND stp.class_id = cs.class_id
          WHERE st.school_chapter_id = sc.id
        ) topic_count ON TRUE
        WHERE te.school_id = $1 AND COALESCE(ccv.is_active, TRUE)
        GROUP BY te.id, te.name, c.id, c.grade, c.section, cs.subject_name
        ORDER BY te.name, c.grade, c.section, cs.subject_name
      `, [school_id, academic_year]),

      // 3. Per subject across school (sum over all classes in the grade)
      pool.query(`
        ${chapterCoverageCTE}
        SELECT
          subject,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE topic_count > 0 AND topics_covered = topic_count)::int AS covered,
          COALESCE(SUM(topics_covered::numeric / NULLIF(topic_count, 0)) FILTER (WHERE topic_count > 0), 0) AS weighted_sum
        FROM chapter_coverage
        GROUP BY subject
        ORDER BY subject
      `, [school_id, academic_year]),
    ])

    // Roll up by_class rows into class objects with a per-subject breakdown
    // that now also carries the assigned teacher's name. weighted_sum
    // accumulates separately from covered (chapter counts) — pct is always
    // weighted_sum/total, never covered/total, once a subject/class spans
    // more than one chapter with partial progress.
    const classMap: Record<number, {
      class_id: number; grade: string; section: string
      total: number; covered: number; weighted_sum: number
      subjects: { subject: string; teacher_name: string | null; total: number; covered: number; pct: number }[]
    }> = {}

    for (const r of byClassRes.rows) {
      if (!classMap[r.class_id]) {
        classMap[r.class_id] = {
          class_id: r.class_id,
          grade: r.grade,
          section: r.section,
          total: 0, covered: 0, weighted_sum: 0,
          subjects: [],
        }
      }
      const cls = classMap[r.class_id]
      cls.total        += r.total
      cls.covered       += r.covered
      cls.weighted_sum  += Number(r.weighted_sum)
      cls.subjects.push({
        subject: r.subject,
        teacher_name: r.teacher_name ?? null,
        total:   r.total,
        covered: r.covered,
        pct:     r.total > 0 ? Math.round((Number(r.weighted_sum) / r.total) * 100) : 0,
      })
    }

    // Roll up by_teacher rows — one entry per (class, subject) assignment,
    // NOT merged across classes, so the frontend can render a teacher's
    // Mathematics-in-9-A and Mathematics-in-9-B as two distinct rows.
    const teacherMap: Record<number, {
      teacher_id: number; teacher_name: string
      total: number; covered: number; weighted_sum: number
      assignments: { class_id: number; grade: string; section: string; subject: string; total: number; covered: number; pct: number }[]
    }> = {}

    for (const r of byTeacherRes.rows) {
      if (!teacherMap[r.teacher_id]) {
        teacherMap[r.teacher_id] = {
          teacher_id: r.teacher_id,
          teacher_name: r.teacher_name,
          total: 0, covered: 0, weighted_sum: 0,
          assignments: [],
        }
      }
      const t = teacherMap[r.teacher_id]
      t.total        += r.total
      t.covered       += r.covered
      t.weighted_sum  += Number(r.weighted_sum)
      t.assignments.push({
        class_id: r.class_id,
        grade: r.grade,
        section: r.section,
        subject: r.subject,
        total:   r.total,
        covered: r.covered,
        pct:     r.total > 0 ? Math.round((Number(r.weighted_sum) / r.total) * 100) : 0,
      })
    }

    return NextResponse.json({
      academic_year,
      by_class: Object.values(classMap).map(({ weighted_sum, ...c }) => ({
        ...c,
        pct: c.total > 0 ? Math.round((weighted_sum / c.total) * 100) : null,
      })),
      by_teacher: Object.values(teacherMap).map(({ weighted_sum, ...t }) => ({
        ...t,
        pct: t.total > 0 ? Math.round((weighted_sum / t.total) * 100) : null,
      })),
      by_subject: bySubjectRes.rows.map(r => ({
        subject: r.subject,
        total:   r.total,
        covered: r.covered,
        pct:     r.total > 0 ? Math.round((Number(r.weighted_sum) / r.total) * 100) : null,
      })),
    })
  } catch (err) {
    console.error('[syllabus/analytics]', err)
    return NextResponse.json({ error: 'Failed to fetch syllabus analytics' }, { status: 500 })
  }
}
