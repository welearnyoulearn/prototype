import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const teacher_id = searchParams.get('teacher_id')
  const school_id = searchParams.get('school_id')
  const day = searchParams.get('day')

  if (!teacher_id) return NextResponse.json({ error: 'teacher_id required' }, { status: 400 })

  try {
    let q = 'SELECT * FROM timetable WHERE teacher_id = $1'
    const vals: (string | number)[] = [teacher_id]
    if (school_id) { q += ` AND school_id = $${vals.length + 1}`; vals.push(school_id) }
    if (day) { q += ` AND day_of_week = $${vals.length + 1}`; vals.push(day) }
    q += ' ORDER BY day_of_week, period_number'
    const result = await pool.query(q, vals)
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to fetch timetable' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { teacher_id, school_id, periods, replace } = await req.json()
    if (!teacher_id || !school_id || !Array.isArray(periods)) {
      return NextResponse.json({ error: 'teacher_id, school_id, periods required' }, { status: 400 })
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // If replace=true, clear existing timetable for this teacher
      if (replace) {
        await client.query('DELETE FROM timetable WHERE teacher_id = $1 AND school_id = $2', [teacher_id, school_id])
      }

      const inserted = []
      for (const p of periods) {
        if (!p.day_of_week) continue
        const res = await client.query(
          `INSERT INTO timetable (teacher_id, school_id, day_of_week, period_number, time_from, time_to, subject, grade, section, room)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [teacher_id, school_id, p.day_of_week, p.period_number || null, p.time_from || null, p.time_to || null,
           p.subject || null, p.grade || null, p.section || null, p.room || null]
        )
        inserted.push(res.rows[0])
      }

      await client.query('COMMIT')
      return NextResponse.json({ inserted: inserted.length, periods: inserted }, { status: 201 })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to save timetable' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const teacher_id = searchParams.get('teacher_id')
  const school_id = searchParams.get('school_id')
  if (!teacher_id || !school_id) return NextResponse.json({ error: 'teacher_id and school_id required' }, { status: 400 })
  try {
    await pool.query('DELETE FROM timetable WHERE teacher_id = $1 AND school_id = $2', [teacher_id, school_id])
    return NextResponse.json({ message: 'Timetable cleared' })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to delete timetable' }, { status: 500 })
  }
}
