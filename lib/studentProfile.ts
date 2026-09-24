import pool from './db'
import { nonWorkingDaysMap } from './attendance'
import { schoolYearStart } from './attendanceStudentView'
import {
  countWorkingSessions, enumerateDates, monthBounds, summarizeCounts, todayIST,
  type SessionRecord,
} from './attendanceRules'

// Everything the school admin needs to talk to a parent about ONE student, for one academic year:
// who they are, attendance, marks, fees, engagement. Attendance uses the shared rules
// (lib/attendanceRules.ts), fees use the same balance formula as the fee screens
// (due − waiver − paid), so the numbers here match every other screen.

export type YearOption = { id: number | null; label: string; from: string; to: string; isCurrent: boolean; grade: string | null; section: string | null }

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v))

/** Academic years this student has data in (current + any year they were enrolled), newest first. */
async function studentYears(schoolId: number, studentId: number, today: string): Promise<YearOption[]> {
  const { rows } = await pool.query<{
    id: number; label: string; start_date: string; end_date: string; is_current: boolean; grade: string | null; section: string | null
  }>(
    `SELECT ay.id, ay.label, ay.start_date::text AS start_date, ay.end_date::text AS end_date, ay.is_current, sch.grade, sch.section
     FROM academic_years ay
     LEFT JOIN student_class_history sch ON sch.academic_year_id = ay.id AND sch.student_id = $2
     WHERE ay.school_id = $1 AND (ay.is_current OR sch.id IS NOT NULL)
     ORDER BY ay.start_date DESC`,
    [schoolId, studentId]
  )
  if (rows.length) {
    return rows.map(r => ({ id: r.id, label: r.label, from: r.start_date, to: r.end_date, isCurrent: r.is_current, grade: r.grade, section: r.section }))
  }
  // A school that has not set up academic years yet: use the Indian school year (April–March).
  const start = await schoolYearStart(schoolId, today)
  const y = Number(start.slice(0, 4))
  return [{ id: null, label: `${y}-${String(y + 1).slice(2)}`, from: start, to: `${y + 1}-03-31`, isCurrent: true, grade: null, section: null }]
}

export async function buildStudentProfile(schoolId: number, studentId: number, yearParam: string | null) {
  const today = todayIST()

  const { rows: [s] } = await pool.query<{
    id: number; name: string; email: string | null; grade: string | null; section: string | null
    roll_number: string | null; school_roll_number: number | null; status: string | null
    parent_name: string | null; parent_phone: string | null; parent_email: string | null; phone: string | null
    admitted: string; date_of_birth: string | null; join_date: string
  }>(
    `SELECT id, name, email, grade, section, roll_number, school_roll_number, status, parent_name, parent_phone, parent_email, phone,
            created_at::date::text AS admitted, date_of_birth::text AS date_of_birth, created_at::date::text AS join_date
     FROM students WHERE id = $1 AND school_id = $2`,
    [studentId, schoolId]
  )
  if (!s) return null

  const years = await studentYears(schoolId, studentId, today)
  const wanted = yearParam ? years.find(y => String(y.id) === yearParam) : undefined
  const year = wanted ?? years.find(y => y.isCurrent) ?? years[0]
  const grade = year.grade ?? s.grade
  const section = year.section ?? s.section
  const rangeTo = year.to < today ? year.to : today       // never look past today
  const inFuture = year.from > today

  const [parentsRes, teacherRes] = await Promise.all([
    pool.query<{ name: string | null; phone: string | null; email: string | null }>(
      `SELECT p.name, p.phone, p.email FROM student_parents sp JOIN parents p ON p.id = sp.parent_id
       WHERE sp.student_id = $1 AND p.school_id = $2 ORDER BY p.id`, [studentId, schoolId]),
    pool.query<{ name: string | null }>(
      `SELECT t.name FROM classes c LEFT JOIN teachers t ON t.id = c.class_teacher_id
       WHERE c.school_id = $1 AND c.grade = $2 AND c.section = $3 AND c.deleted_at IS NULL LIMIT 1`,
      [schoolId, grade, section]),
  ])
  const parents = parentsRes.rows.length
    ? parentsRes.rows
    : (s.parent_name || s.parent_phone ? [{ name: s.parent_name, phone: s.parent_phone, email: s.parent_email }] : [])

  // ── Attendance ─────────────────────────────────────────────────────────────
  const attendance = await (async () => {
    if (inFuture) return null
    const [recRes, nw] = await Promise.all([
      pool.query<SessionRecord>(
        `SELECT date::text AS date, session, status FROM attendance
         WHERE school_id = $1 AND student_id = $2 AND date BETWEEN $3::date AND $4::date`,
        [schoolId, studentId, year.from, rangeTo]),
      nonWorkingDaysMap(schoolId, year.from, rangeTo),
    ])
    const recs = recRes.rows
    const summary = summarizeCounts(countWorkingSessions(recs, nw, today, s.join_date))

    const months: { month: string; summary: ReturnType<typeof summarizeCounts> }[] = []
    for (let m = year.from.slice(0, 7); m <= rangeTo.slice(0, 7); m = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 1)).toISOString().slice(0, 7)) {
      const { from, to } = monthBounds(m)
      months.push({ month: m, summary: summarizeCounts(countWorkingSessions(recs.filter(r => r.date >= from && r.date <= to), nw, today, s.join_date)) })
    }

    // Absent days (latest first) and the current run of consecutive absent days.
    const usable = recs.filter(r => r.date <= today && !nw.has(r.date) && r.date >= s.join_date)
    const byDate = new Map<string, string[]>()
    for (const r of usable) byDate.set(r.date, [...(byDate.get(r.date) ?? []), `${r.session}:${r.status}`])
    const absentDates = [...byDate.entries()].filter(([, v]) => v.some(x => x.endsWith(':absent'))).map(([d]) => d).sort().reverse()
    const markedDays = enumerateDates(year.from, rangeTo).filter(d => byDate.has(d)).reverse()
    let streak = 0
    for (const d of markedDays) { if (absentDates.includes(d)) streak++; else break }

    return {
      summary, months,
      absentDayCount: absentDates.length,
      recentAbsences: absentDates.slice(0, 8).map(d => ({ date: d, sessions: (byDate.get(d) ?? []).filter(x => x.endsWith(':absent')).map(x => x.split(':')[0]) })),
      currentAbsentStreak: streak,
    }
  })()

  // ── Marks ──────────────────────────────────────────────────────────────────
  const marks = await (async () => {
    const { rows } = await pool.query<{
      exam_id: number; exam_name: string; exam_type: string; exam_date: string | null; status: string; passing_pct: number
      subject_name: string; marks_obtained: string | null; is_absent: boolean; max_marks: number | null; class_avg: string | null
    }>(
      `SELECT er.id AS exam_id, er.exam_name, er.exam_type, er.exam_date::text AS exam_date, er.status, er.passing_pct,
              em.subject_name, em.marks_obtained, em.is_absent, es.max_marks,
              (SELECT AVG(m2.marks_obtained) FROM exam_marks m2
                WHERE m2.exam_id = er.id AND m2.subject_name = em.subject_name AND m2.is_absent = FALSE AND m2.marks_obtained IS NOT NULL) AS class_avg
       FROM exam_marks em
       JOIN exam_records er ON er.id = em.exam_id AND er.school_id = $1
       LEFT JOIN exam_subjects es ON es.exam_id = er.id AND es.subject_name = em.subject_name
       WHERE em.school_id = $1 AND em.student_id = $2
         AND COALESCE(er.exam_date, er.created_at::date) BETWEEN $3::date AND $4::date
       ORDER BY er.exam_date NULLS LAST, er.id, em.subject_name`,
      [schoolId, studentId, year.from, year.to]
    )
    const remarks = await pool.query<{ exam_id: number; class_teacher_remark: string | null; conduct: string | null; next_term_advice: string | null }>(
      `SELECT exam_id, class_teacher_remark, conduct, next_term_advice FROM report_card_remarks WHERE school_id = $1 AND student_id = $2`,
      [schoolId, studentId])
    const remarkOf = new Map(remarks.rows.map(r => [r.exam_id, r]))

    type Subject = { subject: string; obtained: number | null; max: number; absent: boolean; pct: number | null; classAvgPct: number | null }
    const exams = new Map<number, {
      id: number; name: string; type: string; date: string | null; status: string; passingPct: number
      subjects: Subject[]; remark: { teacher: string | null; conduct: string | null; advice: string | null } | null
    }>()
    for (const r of rows) {
      const max = r.max_marks ?? 100
      const obtained = r.is_absent || r.marks_obtained === null ? null : num(r.marks_obtained)
      const e = exams.get(r.exam_id) ?? {
        id: r.exam_id, name: r.exam_name, type: r.exam_type, date: r.exam_date, status: r.status, passingPct: r.passing_pct, subjects: [],
        remark: remarkOf.has(r.exam_id) ? { teacher: remarkOf.get(r.exam_id)!.class_teacher_remark, conduct: remarkOf.get(r.exam_id)!.conduct, advice: remarkOf.get(r.exam_id)!.next_term_advice } : null,
      }
      e.subjects.push({
        subject: r.subject_name, obtained, max, absent: r.is_absent,
        pct: obtained === null ? null : Math.round((obtained / max) * 100),
        classAvgPct: r.class_avg === null ? null : Math.round((num(r.class_avg) / max) * 100),
      })
      exams.set(r.exam_id, e)
    }

    const list = [...exams.values()].map(e => {
      const scored = e.subjects.filter(x => x.obtained !== null)
      const obtained = scored.reduce((n, x) => n + (x.obtained ?? 0), 0)
      const max = scored.reduce((n, x) => n + x.max, 0)
      const pct = max ? Math.round((obtained / max) * 100) : null
      return { ...e, obtained, max, pct, passed: pct === null ? null : pct >= e.passingPct }
    })

    // Subject-wise across the year: average % and how the class did.
    const bySubject = new Map<string, { pcts: number[]; classPcts: number[] }>()
    for (const e of list) for (const x of e.subjects) {
      if (x.pct === null) continue
      const b = bySubject.get(x.subject) ?? { pcts: [], classPcts: [] }
      b.pcts.push(x.pct); if (x.classAvgPct !== null) b.classPcts.push(x.classAvgPct)
      bySubject.set(x.subject, b)
    }
    const avg = (a: number[]) => (a.length ? Math.round(a.reduce((n, v) => n + v, 0) / a.length) : null)
    const subjects = [...bySubject.entries()].map(([subject, b]) => ({ subject, avgPct: avg(b.pcts), classAvgPct: avg(b.classPcts), exams: b.pcts.length }))
      .sort((a, b) => (a.avgPct ?? 0) - (b.avgPct ?? 0))
    const scoredExams = list.filter(e => e.pct !== null)

    return {
      exams: list, subjects,
      averagePct: scoredExams.length ? Math.round(scoredExams.reduce((n, e) => n + (e.pct ?? 0), 0) / scoredExams.length) : null,
      weakest: subjects.length ? subjects[0] : null,
      strongest: subjects.length ? subjects[subjects.length - 1] : null,
      lastChange: scoredExams.length >= 2 ? (scoredExams[scoredExams.length - 1].pct ?? 0) - (scoredExams[scoredExams.length - 2].pct ?? 0) : null,
    }
  })()

  // ── Fees ───────────────────────────────────────────────────────────────────
  const fees = await (async () => {
    const [ledgerRes, payRes] = await Promise.all([
      pool.query<{
        id: number; category: string; period_label: string | null; amount_due: string; waiver_amount: string; amount_paid: string
        due_date: string | null; status: string
      }>(
        `SELECT l.id, c.name AS category, l.period_label, l.amount_due, COALESCE(l.waiver_amount, 0) AS waiver_amount, l.amount_paid,
                l.due_date::text AS due_date, l.status
         FROM student_fee_ledger l JOIN fee_categories c ON c.id = l.fee_category_id
         WHERE l.school_id = $1 AND l.student_id = $2 AND l.academic_year = $3
         ORDER BY l.due_date NULLS LAST, l.id`,
        [schoolId, studentId, year.label]),
      pool.query<{ id: number; receipt_number: string | null; amount: string; payment_mode: string; payment_status: string; paid_date: string; category: string }>(
        `SELECT p.id, p.receipt_number, p.amount, p.payment_mode, p.payment_status, p.paid_date::text AS paid_date, c.name AS category
         FROM fee_payments p
         JOIN student_fee_ledger l ON l.id = p.ledger_id
         JOIN fee_categories c ON c.id = l.fee_category_id
         WHERE p.school_id = $1 AND p.student_id = $2 AND l.academic_year = $3
         ORDER BY p.paid_date DESC, p.id DESC LIMIT 12`,
        [schoolId, studentId, year.label]),
    ])
    const items = ledgerRes.rows.map(r => {
      const due = num(r.amount_due), waived = num(r.waiver_amount), paid = num(r.amount_paid)
      const balance = r.status === 'waived' ? 0 : Math.max(due - waived - paid, 0)
      return { id: r.id, category: r.category, period: r.period_label, due, waived, paid, balance, dueDate: r.due_date, status: r.status, overdue: balance > 0 && !!r.due_date && r.due_date < today }
    })
    const sum = (k: 'due' | 'waived' | 'paid' | 'balance') => items.reduce((n, i) => n + i[k], 0)
    return {
      items,
      totals: { due: sum('due'), waived: sum('waived'), paid: sum('paid'), balance: sum('balance'), overdue: items.filter(i => i.overdue).reduce((n, i) => n + i.balance, 0) },
      payments: payRes.rows.map(p => ({ id: p.id, receipt: p.receipt_number, amount: num(p.amount), mode: p.payment_mode, status: p.payment_status, date: p.paid_date, category: p.category })),
    }
  })()

  // ── Engagement (student app) ───────────────────────────────────────────────
  const engagement = await (async () => {
    const [pts, badges, streak, act] = await Promise.all([
      pool.query<{ total: string }>(`SELECT COALESCE(SUM(points), 0) AS total FROM student_points WHERE school_id = $1 AND student_id = $2`, [schoolId, studentId]),
      pool.query<{ badge_type: string; earned_at: string }>(`SELECT badge_type, earned_at::text AS earned_at FROM student_badges WHERE school_id = $1 AND student_id = $2 ORDER BY earned_at DESC`, [schoolId, studentId]),
      pool.query<{ current_streak: number; longest_streak: number; last_activity_date: string | null }>(
        `SELECT current_streak, longest_streak, last_activity_date::text AS last_activity_date FROM student_streaks WHERE school_id = $1 AND student_id = $2`, [schoolId, studentId]),
      pool.query<{ last_seen: string | null; actions_30d: string }>(
        `SELECT MAX(created_at)::text AS last_seen, COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS actions_30d
         FROM student_portal_activity WHERE school_id = $1 AND student_id = $2`, [schoolId, studentId]),
    ])
    return {
      points: num(pts.rows[0]?.total),
      badges: badges.rows.map(b => ({ type: b.badge_type, earnedAt: b.earned_at })),
      streak: { current: streak.rows[0]?.current_streak ?? 0, longest: streak.rows[0]?.longest_streak ?? 0, lastDay: streak.rows[0]?.last_activity_date ?? null },
      lastSeen: act.rows[0]?.last_seen ?? null,
      actions30d: num(act.rows[0]?.actions_30d),
    }
  })()

  // ── Talking points: what to raise with the parent ──────────────────────────
  const flags: { level: 'red' | 'amber' | 'green'; text: string }[] = []
  if (attendance?.summary.marked) {
    const pct = attendance.summary.pct ?? 0
    if (attendance.summary.band === 'low' && attendance.summary.marked >= 4) flags.push({ level: 'red', text: `Attendance is ${pct}% — below the 75% line (${attendance.absentDayCount} day${attendance.absentDayCount === 1 ? '' : 's'} absent).` })
    else if (attendance.summary.band === 'watch' && attendance.summary.marked >= 4) flags.push({ level: 'amber', text: `Attendance is ${pct}% — a little low.` })
    if (attendance.currentAbsentStreak >= 3) flags.push({ level: 'red', text: `Absent ${attendance.currentAbsentStreak} school days in a row.` })
  }
  if (marks.lastChange !== null && marks.lastChange <= -10) flags.push({ level: 'amber', text: `Marks dropped ${Math.abs(marks.lastChange)} points in the latest exam.` })
  if (marks.weakest && marks.weakest.avgPct !== null && marks.weakest.avgPct < 40 && marks.subjects.length > 1) flags.push({ level: 'amber', text: `Weakest subject: ${marks.weakest.subject} (${marks.weakest.avgPct}% average).` })
  const failed = marks.exams.filter(e => e.passed === false)
  if (failed.length) flags.push({ level: 'red', text: `Below the pass mark in ${failed.map(e => e.name).slice(0, 2).join(', ')}${failed.length > 2 ? ` +${failed.length - 2} more` : ''}.` })
  if (fees.totals.overdue > 0) flags.push({ level: 'red', text: `₹${fees.totals.overdue.toLocaleString('en-IN')} of fees is overdue.` })
  else if (fees.totals.balance > 0) flags.push({ level: 'amber', text: `₹${fees.totals.balance.toLocaleString('en-IN')} of fees is still to be paid.` })
  if (!flags.length && (attendance?.summary.marked || marks.exams.length)) flags.push({ level: 'green', text: 'Nothing to worry about — attendance, marks and fees look on track.' })

  return {
    student: {
      id: s.id, name: s.name, status: s.status ?? 'active', email: s.email, phone: s.phone, dateOfBirth: s.date_of_birth,
      grade, section, currentGrade: s.grade, currentSection: s.section,
      rollNumber: s.school_roll_number, systemId: s.roll_number, admitted: s.admitted,
      classTeacher: teacherRes.rows[0]?.name ?? null,
    },
    parents,
    years: years.map(y => ({ id: y.id, label: y.label, isCurrent: y.isCurrent, grade: y.grade, section: y.section })),
    year: { id: year.id, label: year.label, from: year.from, to: year.to, isCurrent: year.isCurrent, upcoming: inFuture },
    today, flags, attendance, marks, fees, engagement,
    lowAttendancePct: 75, goodAttendancePct: 90,
  }
}
