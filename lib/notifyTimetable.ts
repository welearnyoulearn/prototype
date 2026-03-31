// Shared helper — sends timetable change notifications to affected teachers and class students.
// Accepts any pg client so it can run inside an existing transaction.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PgClient = { query: (text: string, values?: any[]) => Promise<{ rows: any[] }> }

export async function notifyTimetableChange(
  client: PgClient,
  {
    school_id,
    class_id,
    grade,
    section,
    teacher_ids,
    title,
    message,
  }: {
    school_id: number
    class_id?: number
    grade?: string
    section?: string
    teacher_ids?: (number | null | undefined)[]
    title: string
    message: string
  }
) {
  // Notify each unique affected teacher
  const tids = [...new Set((teacher_ids ?? []).filter((id): id is number => !!id))]
  for (const tid of tids) {
    await client.query(
      `INSERT INTO notifications (school_id, recipient_teacher_id, type, title, message)
       VALUES ($1,$2,'timetable',$3,$4)`,
      [school_id, tid, title, message]
    )
  }

  // Notify all students in the class
  if (class_id) {
    const { rows: students } = await client.query(
      `SELECT id FROM students WHERE class_id=$1 AND school_id=$2`,
      [class_id, school_id]
    )
    for (const s of students) {
      await client.query(
        `INSERT INTO notifications (school_id, recipient_student_id, type, title, message)
         VALUES ($1,$2,'timetable',$3,$4)`,
        [school_id, s.id, title, message]
      )
    }
  }
}
