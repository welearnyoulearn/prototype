// Numbers behind the teacher's class overview (#503), computed from the same responses the rest of the
// portal uses: released exams' marks and the class's attendance records.
import { attendancePercent, isAttended } from './attendanceRules'

export type ReleasedExamMarks = {
  id: number
  name: string
  date: string | null
  passingPct: number
  students: Array<{ student_id: number; percentage: number | null; pass: boolean | null }>
  subjects: Array<{ subject_name: string; avg_marks: number | null; max_marks: number }>
}

export type ExamInsights = {
  classAvgPct: number | null
  /** Average percentage per student, across the released exams they have a result in. */
  studentAvg: Map<number, number>
  /** Students whose average is below the average pass mark of their exams. */
  atRisk: number[]
  subjectAvg: Map<string, number>
  /** Newest first. */
  recent: Array<{ id: number; name: string; date: string | null; avgPct: number | null; passCount: number; failCount: number }>
}

const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
const round1 = (v: number) => Math.round(v * 10) / 10

export function examInsights(exams: ReleasedExamMarks[]): ExamInsights {
  const byStudent = new Map<number, { pct: number[]; passMark: number[] }>()
  const bySubject = new Map<string, number[]>()
  const recent: ExamInsights['recent'] = []
  const examAverages: number[] = []

  for (const exam of exams) {
    const scored = exam.students.filter((s): s is typeof s & { percentage: number } => s.percentage !== null)
    const avg = mean(scored.map(s => s.percentage))
    if (avg !== null) examAverages.push(avg)
    recent.push({
      id: exam.id, name: exam.name, date: exam.date, avgPct: avg === null ? null : round1(avg),
      passCount: exam.students.filter(s => s.pass === true).length,
      failCount: exam.students.filter(s => s.pass === false).length,
    })
    for (const s of scored) {
      const entry = byStudent.get(s.student_id) ?? { pct: [], passMark: [] }
      entry.pct.push(s.percentage)
      entry.passMark.push(exam.passingPct)
      byStudent.set(s.student_id, entry)
    }
    for (const sub of exam.subjects) {
      if (sub.avg_marks === null || sub.max_marks <= 0) continue
      const list = bySubject.get(sub.subject_name) ?? []
      list.push((sub.avg_marks / sub.max_marks) * 100)
      bySubject.set(sub.subject_name, list)
    }
  }

  const studentAvg = new Map<number, number>()
  const atRisk: number[] = []
  for (const [id, e] of byStudent) {
    const avg = mean(e.pct)!
    studentAvg.set(id, round1(avg))
    if (avg < mean(e.passMark)!) atRisk.push(id)
  }
  const classAvg = mean(examAverages)
  return {
    classAvgPct: classAvg === null ? null : round1(classAvg),
    studentAvg,
    atRisk,
    subjectAvg: new Map([...bySubject].map(([name, list]) => [name, round1(mean(list)!)])),
    recent: recent.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.id - a.id),
  }
}

/** Percentage attended on each working day that has attendance (late counts as attended). */
export function dailyAttendance(
  records: Array<{ date: string; status: string }>,
  nonWorkingDates: Iterable<string> = [],
): Map<string, number> {
  const off = new Set(nonWorkingDates)
  const days = new Map<string, { attended: number; marked: number }>()
  for (const r of records) {
    const date = String(r.date).slice(0, 10)
    if (off.has(date)) continue
    const d = days.get(date) ?? { attended: 0, marked: 0 }
    d.marked++
    if (isAttended(r.status)) d.attended++
    days.set(date, d)
  }
  return new Map([...days].map(([date, d]) => [date, attendancePercent(d.attended, d.marked)!]))
}
