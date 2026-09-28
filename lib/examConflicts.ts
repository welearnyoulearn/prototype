import type { PoolClient } from 'pg'
import pool from './db'

// Shared conflict-detection used by both exam creation (POST /api/exams/schedule)
// and reschedule (PUT /api/exams/[id]) — "the same student already has another
// exam at this date/time" from the spec. Works regardless of how the new exam
// targets students (whole class via student_scope='all', or a specific list via
// exam_applicable_students), by resolving conflicts against the actual affected
// student set of every *other* exam, not just class_id equality.
export type ExamConflict = {
  exam_id: number
  exam_name: string
  exam_date: string
  start_time: string | null
  end_time: string | null
  grade: string
  section: string
}

// studentIds: the students the exam-in-progress will apply to (the class
// roster, or the specific list). excludeExamId: pass the exam's own id when
// rescheduling so it doesn't conflict with itself.
export async function findExamConflicts(
  db: PoolClient | typeof pool,
  schoolId: number,
  studentIds: number[],
  examDate: string,
  startTime: string | null,
  endTime: string | null,
  excludeExamId?: number
): Promise<ExamConflict[]> {
  if (studentIds.length === 0 || !examDate) return []

  const { rows } = await db.query(`
    SELECT DISTINCT e.id AS exam_id, e.exam_name,
      TO_CHAR(e.exam_date, 'YYYY-MM-DD') AS exam_date,
      e.start_time, e.end_time, c.grade, c.section
    FROM exam_records e
    JOIN classes c ON c.id = e.class_id
    JOIN students st ON st.id = ANY($3::int[])
    WHERE e.school_id = $1
      AND e.exam_date = $2::date
      AND e.status != 'cancelled'
      AND ($6::int IS NULL OR e.id != $6)
      AND (
        (e.student_scope = 'all' AND c.grade = st.grade AND c.section = st.section)
        OR (e.student_scope = 'specific' AND EXISTS (
          SELECT 1 FROM exam_applicable_students eas WHERE eas.exam_id = e.id AND eas.student_id = st.id
        ))
      )
      AND (
        $4::time IS NULL OR $5::time IS NULL OR e.start_time IS NULL OR e.end_time IS NULL
        OR (e.start_time, e.end_time) OVERLAPS ($4::time, $5::time)
      )
    ORDER BY e.exam_name
  `, [schoolId, examDate, studentIds, startTime, endTime, excludeExamId ?? null])

  return rows
}
