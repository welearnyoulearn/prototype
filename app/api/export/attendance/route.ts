import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { gradeOrderSql } from '@/lib/grades'
import { getAdminActor } from '@/lib/attendanceAuth'
import { getClassForSchool, nonWorkingDaysMap } from '@/lib/attendance'
import { addDays, isValidDateStr } from '@/lib/attendanceRules'

// School admins only. The school comes from the login; a class of another school is "not found".
//
// GET /api/export/attendance?class_id=&from=YYYY-MM-DD&to=YYYY-MM-DD
//   One row per student per marked day: Date, Student, Roll No, Grade, Section, Morning, Afternoon, Day type.
//   Holidays / weekly-off days are labelled — those records are ignored in every report.
//
// GET /api/export/attendance?mode=absentees&date=YYYY-MM-DD[&class_id=]
//   The day's absentee list (whole school, or one class): who was absent in which session, with the
//   parent's name and phone — for phoning home and for the printed daily register.

const MAX_RANGE_DAYS = 366

// A student name starting with = + - @ would be run as a formula when the CSV is opened in Excel.
function cell(v: unknown): string {
  let s = String(v ?? '')
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

function csv(header: string[], rows: unknown[][], filename: string) {
  const body = [header.map(cell).join(','), ...rows.map(r => r.map(cell).join(','))].join('\r\n')
  return new NextResponse('﻿' + body, {   // BOM: Excel reads Telugu/Hindi names correctly
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

export async function GET(req: NextRequest) {
  try {
    await ensureDB()
    const admin = await getAdminActor()
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const p = req.nextUrl.searchParams
    if (p.get('school_id') !== null && Number(p.get('school_id')) !== admin.schoolId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const schoolId = admin.schoolId

    // ── Daily absentee list
    if (p.get('mode') === 'absentees') {
      const date = p.get('date')
      if (!isValidDateStr(date)) return NextResponse.json({ error: 'date required as YYYY-MM-DD' }, { status: 400 })
      const classIdRaw = p.get('class_id')
      const classId = classIdRaw ? Number(classIdRaw) : null
      if (classIdRaw && (!Number.isInteger(classId) || classId! <= 0)) return NextResponse.json({ error: 'Invalid class_id' }, { status: 400 })
      if (classId && !(await getClassForSchool(schoolId, classId))) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

      const nw = (await nonWorkingDaysMap(schoolId, date, date)).get(date)
      if (nw) return NextResponse.json({ error: `${date} is not a working day (${nw.title}).` }, { status: 409 })

      const { rows } = await pool.query(
        `SELECT c.grade, c.section, s.roll_number, s.name AS student_name, s.parent_name, s.parent_phone,
                BOOL_OR(a.session = 'morning')   AS am,
                BOOL_OR(a.session = 'afternoon') AS pm
         FROM attendance a
         JOIN students s ON s.id = a.student_id AND s.school_id = $1
         JOIN classes c ON c.id = a.class_id AND c.school_id = $1
         WHERE a.school_id = $1 AND a.date = $2::date AND a.status = 'absent'
           AND ($3::int IS NULL OR a.class_id = $3)
         GROUP BY c.grade, c.section, s.id, s.roll_number, s.name, s.parent_name, s.parent_phone
         ORDER BY ${gradeOrderSql('c.grade')}, c.section, s.roll_number NULLS LAST, s.name`,
        [schoolId, date, classId]
      )
      return csv(
        ['Grade', 'Section', 'Roll No', 'Student', 'Absent in', 'Parent', 'Parent phone'],
        rows.map(r => [
          r.grade, r.section, r.roll_number ?? '', r.student_name,
          r.am && r.pm ? 'Morning + Afternoon' : r.am ? 'Morning' : 'Afternoon',
          r.parent_name ?? '', r.parent_phone ?? '',
        ]),
        `absentees_${date}.csv`
      )
    }

    // ── Class attendance register for a date range
    const classId = Number(p.get('class_id'))
    const from = p.get('from'), to = p.get('to')
    if (!Number.isInteger(classId) || classId <= 0 || !isValidDateStr(from) || !isValidDateStr(to)) {
      return NextResponse.json({ error: 'class_id, from and to (YYYY-MM-DD) are required' }, { status: 400 })
    }
    if (to < from) return NextResponse.json({ error: 'from must be on or before to' }, { status: 400 })
    if (addDays(from, MAX_RANGE_DAYS) < to) return NextResponse.json({ error: `Choose a range of at most ${MAX_RANGE_DAYS} days` }, { status: 400 })
    const cls = await getClassForSchool(schoolId, classId)
    if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

    const [{ rows }, nonWorking] = await Promise.all([
      pool.query(
        `SELECT s.name AS student_name, s.roll_number, c.grade, c.section, a.date::text AS date,
                MAX(CASE WHEN a.session = 'morning'   THEN a.status END) AS morning,
                MAX(CASE WHEN a.session = 'afternoon' THEN a.status END) AS afternoon
         FROM attendance a
         JOIN students s ON s.id = a.student_id AND s.school_id = $1
         JOIN classes c  ON c.id = a.class_id  AND c.school_id = $1
         WHERE a.school_id = $1 AND a.class_id = $2 AND a.date BETWEEN $3::date AND $4::date
           AND (s.status IS NULL OR s.status = 'active')
         GROUP BY s.id, s.name, s.roll_number, c.grade, c.section, a.date
         ORDER BY a.date, s.roll_number NULLS LAST, s.name`,
        [schoolId, classId, from, to]
      ),
      nonWorkingDaysMap(schoolId, from, to),
    ])

    return csv(
      ['Date', 'Student Name', 'Roll No', 'Grade', 'Section', 'Morning', 'Afternoon', 'Day type'],
      rows.map(r => {
        const nw = nonWorking.get(r.date)
        return [
          r.date, r.student_name, r.roll_number ?? '', r.grade, r.section,
          r.morning ?? 'not marked', r.afternoon ?? 'not marked',
          nw ? (nw.kind === 'holiday' ? `Holiday: ${nw.title} (ignored in reports)` : 'Weekly off (ignored in reports)') : 'Working day',
        ]
      }),
      `attendance_${from}_to_${to}.csv`
    )
  } catch (err) {
    console.error('[export/attendance]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
