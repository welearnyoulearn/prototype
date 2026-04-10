import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import { DEFAULT_SCHEDULE_SETTINGS } from '@/lib/schedule'

export async function GET(req: NextRequest) {

  const school_id = new URL(req.url).searchParams.get('school_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  try {
    const { rows } = await pool.query(
      'SELECT * FROM school_schedule_settings WHERE school_id=$1',
      [school_id]
    )
    return NextResponse.json(rows[0] ?? { ...DEFAULT_SCHEDULE_SETTINGS, school_id: parseInt(school_id) })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {

  const body = await req.json()
  const {
    school_id, periods_per_day, start_time, end_time,
    morning_break_after_period, morning_break_duration,
    lunch_after_period, lunch_duration,
    afternoon_break_after_period, afternoon_break_duration,
  } = body
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  try {
    const { rows } = await pool.query(
      `INSERT INTO school_schedule_settings
         (school_id, periods_per_day, start_time, end_time,
          morning_break_after_period, morning_break_duration,
          lunch_after_period, lunch_duration,
          afternoon_break_after_period, afternoon_break_duration, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT (school_id) DO UPDATE
       SET periods_per_day=$2, start_time=$3, end_time=$4,
           morning_break_after_period=$5, morning_break_duration=$6,
           lunch_after_period=$7, lunch_duration=$8,
           afternoon_break_after_period=$9, afternoon_break_duration=$10,
           updated_at=NOW()
       RETURNING *`,
      [school_id, periods_per_day, start_time, end_time,
       morning_break_after_period, morning_break_duration,
       lunch_after_period, lunch_duration,
       afternoon_break_after_period, afternoon_break_duration]
    )
    return NextResponse.json(rows[0])
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
