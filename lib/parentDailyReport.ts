// Parent Daily Report (#450): one place for a parent to see how their child's school day went — attendance,
// the Daily Quiz (done or not, never points or rank), doubts still open, and what was taught in class.
// Each part appears only when the school has that feature switched on.

import pool from '@/lib/db'
import { schoolHasFeature } from '@/lib/auth'
import { addDays, istNow } from '@/lib/dailyQuizRules'
import { attendanceDay, quizDayStatus, type AttendanceDay, type QuizDayStatus } from '@/lib/parentDailyReportRules'

export type DailyReport = {
  date: string
  today: string
  child: { name: string; grade: string; section: string }
  attendance: AttendanceDay | null
  quiz: { status: QuizDayStatus; subjects: string[]; closesAt: string | null } | null
  quizWeek: { date: string; status: QuizDayStatus }[] | null
  doubts: { waiting: number; answered: number; items: { id: number; subject: string; question: string; status: 'open' | 'explained'; askedAt: string }[] } | null
  taught: { subject: string; topic: string }[] | null
}

type QuizRow = { id: number; quiz_date: string; opens_at: Date; closes_at: Date; attempt_status: 'in_progress' | 'submitted' | null; is_late: boolean | null; subjects: string[] }

/** The child's report for `date` (YYYY-MM-DD, India time). The caller has checked the parent owns the child. */
export async function dailyReport(studentId: number, schoolId: number, date: string, now: Date = new Date()): Promise<DailyReport> {
  const { rows: [child] } = await pool.query<{ name: string; grade: string; section: string; class_id: number | null }>(`
    SELECT s.name, s.grade, s.section,
           (SELECT c.id FROM classes c WHERE c.school_id = s.school_id AND c.grade = s.grade AND c.section = s.section AND c.deleted_at IS NULL ORDER BY c.id LIMIT 1) AS class_id
    FROM students s WHERE s.id = $1 AND s.school_id = $2
  `, [studentId, schoolId])
  if (!child) throw new Error('Student not found')
  const [quizOn, doubtsOn, attendanceOn, syllabusOn] = await Promise.all(
    ['daily-quiz', 'student-doubts', 'attendance', 'curriculum'].map(k => schoolHasFeature(schoolId, k)))
  const report: DailyReport = {
    date, today: istNow(now).date, child: { name: child.name, grade: child.grade, section: child.section },
    attendance: null, quiz: null, quizWeek: null, doubts: null, taught: null,
  }
  const classId = child.class_id

  await Promise.all([
    attendanceOn && classId !== null && (async () => {
      const { rows } = await pool.query<{ status: string }>(`SELECT status FROM attendance WHERE student_id = $1 AND date = $2`, [studentId, date])
      report.attendance = attendanceDay(rows.map(r => r.status))
    })(),

    quizOn && classId !== null && (async () => {
      // The day itself and the 6 quiz days before it, with this child's attempt on each.
      const { rows } = await pool.query<QuizRow>(`
        SELECT z.id, TO_CHAR(z.quiz_date, 'YYYY-MM-DD') AS quiz_date, z.opens_at, z.closes_at,
               t.status AS attempt_status, t.is_late,
               ARRAY(SELECT i.subject_name FROM daily_quiz_items i WHERE i.quiz_id = z.id ORDER BY i.position) AS subjects
        FROM daily_quizzes z
        LEFT JOIN daily_quiz_attempts t ON t.quiz_id = z.id AND t.student_id = $2
        WHERE z.class_id = $1 AND z.quiz_date <= $3::date AND z.quiz_date > $3::date - 21
        ORDER BY z.quiz_date DESC
        LIMIT 7
      `, [classId, studentId, date])
      const statusOf = (r: QuizRow) => quizDayStatus({
        quiz: { opensAt: r.opens_at, closesAt: r.closes_at },
        attempt: r.attempt_status ? { status: r.attempt_status, isLate: !!r.is_late } : null,
      }, now)
      const day = rows.find(r => r.quiz_date === date)
      report.quiz = day
        ? { status: statusOf(day), subjects: day.subjects, closesAt: day.closes_at.toISOString() }
        : { status: 'no_quiz', subjects: [], closesAt: null }
      report.quizWeek = rows.map(r => ({ date: r.quiz_date, status: statusOf(r) })).reverse()
    })(),

    quizOn && doubtsOn && (async () => {
      // Doubts still open today, whatever day they were asked.
      const { rows } = await pool.query<{ id: number; subject_name: string; stem: string; status: 'open' | 'explained'; created_at: Date }>(`
        SELECT d.id, d.subject_name, q.stem, d.status, d.created_at
        FROM student_doubts d JOIN quiz_questions q ON q.id = d.question_id
        WHERE d.student_id = $1 AND d.status <> 'clarified'
        ORDER BY d.created_at DESC
        LIMIT 20
      `, [studentId])
      report.doubts = {
        waiting: rows.filter(r => r.status === 'open').length,
        answered: rows.filter(r => r.status === 'explained').length,
        items: rows.map(r => ({ id: r.id, subject: r.subject_name, question: r.stem.length > 160 ? `${r.stem.slice(0, 157)}…` : r.stem, status: r.status, askedAt: r.created_at.toISOString() })),
      }
    })(),

    syllabusOn && classId !== null && (async () => {
      const { rows } = await pool.query<{ subject: string; topic: string }>(`
        SELECT ss.subject_name AS subject, st.topic_name AS topic
        FROM school_topic_progress p
        JOIN school_topics st ON st.id = p.school_topic_id
        JOIN school_chapters sc ON sc.id = st.school_chapter_id
        JOIN school_subjects ss ON ss.id = sc.school_subject_id
        WHERE p.class_id = $1 AND p.status = 'covered' AND p.covered_date = $2::date
        ORDER BY ss.subject_name, sc.chapter_order, st.topic_order
      `, [classId, date])
      report.taught = rows
    })(),
  ])
  return report
}

/** A valid report date: YYYY-MM-DD, not in the future, at most `maxBack` days ago. Null when not acceptable. */
export function reportDate(raw: string | null, now: Date, maxBack: number): string | null {
  const today = istNow(now).date
  if (!raw) return today
  const parsed = new Date(`${raw}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) return null
  if (raw > today || raw < addDays(today, -maxBack)) return null
  return raw
}
