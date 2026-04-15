import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// GET /api/class-timetable/validate?school_id=X
// Pre-generation readiness check. No curriculum dependency.
// A class is ready when it has subjects assigned (with or without curriculum template).
export async function GET(req: NextRequest) {

  const { searchParams } = new URL(req.url)
  const school_id = searchParams.get('school_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  try {
    const { rows: classes } = await pool.query<{
      id: number; grade: string; section: string
      class_teacher_id: number | null; class_teacher_name: string | null
      timetable_generated_at: string | null
    }>(
      `SELECT c.id, c.grade, c.section, c.class_teacher_id, c.timetable_generated_at,
              t.name AS class_teacher_name
       FROM classes c
       LEFT JOIN teachers t ON t.id = c.class_teacher_id
       WHERE c.school_id = $1
       ORDER BY (NULLIF(regexp_replace(c.grade,'[^0-9]','','g'),''))::int NULLS LAST, c.section`,
      [school_id]
    )

    if (classes.length === 0) {
      return NextResponse.json({
        classes: [],
        summary: { total: 0, ready: 0, has_timetable: 0, total_teachers: 0, issues: ['No classes found. Add classes first.'] },
      })
    }

    const classIds = classes.map(c => c.id)

    // Subjects per class
    const { rows: classSubjects } = await pool.query<{
      class_id: number; subject_name: string; teacher_id: number | null
      teacher_name: string | null; periods_per_week: number
    }>(
      `SELECT cs.class_id, cs.subject_name,
              cs.teacher_id, t.name AS teacher_name,
              COALESCE(cs.periods_per_week, 4) AS periods_per_week
       FROM class_subjects cs
       LEFT JOIN teachers t ON t.id = cs.teacher_id
       WHERE cs.class_id = ANY($1)
       ORDER BY cs.subject_name`,
      [classIds]
    )

    // All active teaching staff
    const { rows: allTeachers } = await pool.query<{
      id: number; name: string; subject: string
    }>(
      `SELECT id, name, subject FROM teachers
       WHERE school_id = $1 AND staff_type = 'teaching' AND status = 'active'
         AND subject IS NOT NULL AND subject != ''`,
      [school_id]
    )

    // Slot counts to detect already-generated classes
    const { rows: slotCounts } = await pool.query<{ class_id: number; cnt: string }>(
      `SELECT class_id, COUNT(*)::text AS cnt FROM class_timetable
       WHERE class_id = ANY($1) GROUP BY class_id`,
      [classIds]
    )
    const slotCountByClass = new Map(slotCounts.map(r => [r.class_id, parseInt(r.cnt)]))

    const globalIssues: string[] = []
    let readyCount = 0
    let hasTimetableCount = 0

    const classReports = classes.map(cls => {
      const subjects = classSubjects.filter(s => s.class_id === cls.id)
      const slotCount = slotCountByClass.get(cls.id) ?? 0
      const hasTimetable = slotCount > 0
      if (hasTimetable) hasTimetableCount++

      const subjectReports = subjects.map(sub => {
        const subjectKey = sub.subject_name.trim().toLowerCase()
        const potentialTeachers = allTeachers.filter(t => {
          const tKey = t.subject.trim().toLowerCase()
          return tKey === subjectKey || subjectKey.includes(tKey) || tKey.includes(subjectKey)
        }).map(t => ({ id: t.id, name: t.name }))

        let status: 'assigned' | 'available' | 'missing'
        if (sub.teacher_id) status = 'assigned'
        else if (potentialTeachers.length > 0) status = 'available'
        else status = 'missing'

        return {
          subject_name: sub.subject_name,
          periods_per_week: sub.periods_per_week,
          teacher_id: sub.teacher_id,
          teacher_name: sub.teacher_name,
          potential_teachers: potentialTeachers,
          status,
        }
      })

      const missingTeachers = subjectReports.filter(s => s.status === 'missing')
      const unassignedSubjects = subjectReports.filter(s => s.status === 'available')
      const totalPpw = subjects.reduce((sum, s) => sum + s.periods_per_week, 0)

      const issues: string[] = []
      if (subjects.length === 0) issues.push('No subjects added yet')
      if (!cls.class_teacher_id) issues.push('No class teacher assigned')
      missingTeachers.forEach(s => issues.push(`${s.subject_name}: no teacher in school`))
      unassignedSubjects.forEach(s => issues.push(`${s.subject_name}: teacher available but not assigned`))
      if (totalPpw > 60) issues.push(`Total periods/week (${totalPpw}) exceeds available slots`)

      // Ready = has subjects + no missing teachers (teacher availability optional)
      const ready = subjects.length > 0 && missingTeachers.length === 0 && !hasTimetable
      if (ready) readyCount++

      if (missingTeachers.length > 0) {
        globalIssues.push(`Grade ${cls.grade}-${cls.section}: no teacher for ${missingTeachers.map(s => s.subject_name).join(', ')}`)
      }

      return {
        id: cls.id,
        grade: cls.grade,
        section: cls.section,
        class_teacher_id: cls.class_teacher_id,
        class_teacher_name: cls.class_teacher_name,
        subjects: subjectReports,
        total_subjects: subjects.length,
        assigned_subjects: subjectReports.filter(s => s.status === 'assigned').length,
        unassigned_subjects: unassignedSubjects.length,
        missing_subjects: missingTeachers.length,
        total_periods_per_week: totalPpw,
        has_timetable: hasTimetable,
        timetable_slots: slotCount,
        timetable_generated_at: cls.timetable_generated_at,
        issues,
        ready,
        // can_generate: any class with subjects (whether first-time or regenerating)
        can_generate: subjects.length > 0,
      }
    })

    return NextResponse.json({
      classes: classReports,
      summary: {
        total: classes.length,
        ready: readyCount,
        has_timetable: hasTimetableCount,
        total_teachers: allTeachers.length,
        issues: [...new Set(globalIssues)].slice(0, 20),
      },
    })
  } catch (err) {
    console.error('GET /api/class-timetable/validate error:', err)
    return NextResponse.json({ error: 'Validation failed' }, { status: 500 })
  }
}
