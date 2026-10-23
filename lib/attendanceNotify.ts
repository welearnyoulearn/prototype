import pool from './db'
import { sendMail } from './email'
import { todayIST, type AttendanceSession } from './attendanceRules'

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Tells parents their child was marked absent. Runs after the response (see routes), never
 * blocks or fails a save, and only fires for today's attendance — a correction made days
 * later must not send a confusing "your child is absent" mail.
 * Recipients: the student's own parent email plus every linked parent account, de-duplicated.
 */
export async function notifyAbsentParents(params: {
  schoolId: number
  classId: number
  date: string
  session: AttendanceSession
  studentIds: number[]
}): Promise<number> {
  const { schoolId, classId, date, session, studentIds } = params
  if (studentIds.length === 0 || date !== todayIST()) return 0

  const { rows } = await pool.query<{
    student_name: string; grade: string; section: string; parent_name: string | null; emails: string[]
  }>(
    `SELECT s.name AS student_name, c.grade, c.section, s.parent_name,
            ARRAY_REMOVE(ARRAY(
              SELECT DISTINCT LOWER(e) FROM (
                SELECT s.parent_email AS e
                UNION ALL
                SELECT p.email FROM student_parents sp JOIN parents p ON p.id = sp.parent_id WHERE sp.student_id = s.id
              ) x WHERE e IS NOT NULL AND e <> ''
            ), NULL) AS emails
     FROM students s
     JOIN classes c ON c.id = $3
     WHERE s.id = ANY($1::int[]) AND s.school_id = $2`,
    [studentIds, schoolId, classId]
  )

  const sessionLabel = session === 'morning' ? 'Morning' : 'Afternoon'
  const dateLabel = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })

  let sent = 0
  for (const s of rows) {
    for (const to of s.emails) {
      try {
        await sendMail(
          to,
          `Attendance alert: ${s.student_name} was absent — ${sessionLabel} session, ${dateLabel}`,
          `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:20px">
             <div style="background:#dc2626;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">
               <h2 style="margin:0;font-size:18px">Attendance alert — ${sessionLabel} session</h2>
             </div>
             <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
               <p style="color:#374151;font-size:15px">Dear <strong>${esc(s.parent_name || 'Parent/Guardian')}</strong>,</p>
               <p style="color:#374151;font-size:15px">
                 Your child <strong>${esc(s.student_name)}</strong> was marked
                 <strong style="color:#dc2626">absent</strong> in the <strong>${sessionLabel} session</strong> of
                 <strong>Class ${esc(s.grade)}-${esc(s.section)}</strong> on <strong>${esc(dateLabel)}</strong>.
               </p>
               <p style="color:#6b7280;font-size:13px;margin-top:20px">
                 If this is a mistake, or you have already told the school, please contact the class teacher.
               </p>
               <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/>
               <p style="color:#9ca3af;font-size:12px">WLYL School Management System</p>
             </div>
           </div>`
        )
        sent++
      } catch (err) {
        console.error(`[attendance] absence email failed for student in class ${classId}:`, err instanceof Error ? err.message : err)
      }
    }
  }
  return sent
}
