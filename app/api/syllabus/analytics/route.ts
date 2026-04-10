import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// GET /api/syllabus/analytics?school_id=
// Returns school-wide syllabus coverage:
//   by_class   — per class: total, covered, pct, subjects breakdown
//   by_teacher — per teacher: total, covered, pct across all assigned classes
//   by_subject — per subject: total, covered, pct across school
export async function GET(req: NextRequest) {

  const { searchParams } = new URL(req.url)
  const school_id = searchParams.get('school_id')

  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  try {
    const [byClassRes, byTeacherRes, bySubjectRes] = await Promise.all([

      // Per class × subject coverage
      pool.query(`
        SELECT
          c.id          AS class_id,
          c.grade,
          c.section,
          st.subject,
          COUNT(st.id)::int                                              AS total,
          COUNT(st.id) FILTER (WHERE st.status = 'covered')::int        AS covered
        FROM classes c
        JOIN syllabus_topics st ON st.class_id = c.id AND st.school_id = $1
        WHERE c.school_id = $1
        GROUP BY c.id, c.grade, c.section, st.subject
        ORDER BY c.grade, c.section, st.subject
      `, [school_id]),

      // Per teacher: aggregate across all timetabled classes/subjects
      pool.query(`
        SELECT
          te.id         AS teacher_id,
          te.name       AS teacher_name,
          st.subject,
          COUNT(st.id)::int                                              AS total,
          COUNT(st.id) FILTER (WHERE st.status = 'covered')::int        AS covered
        FROM teachers te
        JOIN timetable_slots ts
          ON ts.teacher_id = te.id AND ts.school_id = $1 AND ts.slot_type = 'subject'
        JOIN syllabus_topics st
          ON st.class_id = ts.class_id
         AND st.subject  = ts.subject
         AND st.school_id = $1
        WHERE te.school_id = $1
        GROUP BY te.id, te.name, st.subject
        ORDER BY te.name, st.subject
      `, [school_id]),

      // Per subject across school
      pool.query(`
        SELECT
          st.subject,
          COUNT(st.id)::int                                              AS total,
          COUNT(st.id) FILTER (WHERE st.status = 'covered')::int        AS covered
        FROM syllabus_topics st
        WHERE st.school_id = $1
        GROUP BY st.subject
        ORDER BY st.subject
      `, [school_id]),
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
