import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'

// GET  /api/timetable-modes?school_id=X          — get mode for all classes in school
// POST /api/timetable-modes                       — set mode for a class

export async function GET(req: NextRequest) {
  await ensureDB()
  const school_id = new URL(req.url).searchParams.get('school_id')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  try {
    const { rows } = await pool.query(
      `SELECT ctm.class_id, ctm.mode, ctm.master_source_id, ctm.updated_at,
              c.grade, c.section,
              ms.grade AS master_grade, ms.section AS master_section
       FROM class_timetable_modes ctm
       JOIN classes c ON c.id = ctm.class_id
       LEFT JOIN classes ms ON ms.id = ctm.master_source_id
       WHERE ctm.school_id = $1
       ORDER BY c.grade, c.section`,
      [school_id]
    )
    return NextResponse.json(rows)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to fetch modes' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  await ensureDB()
  try {
    const { school_id, class_id, mode, master_source_id } = await req.json()
    if (!school_id || !class_id || !mode) {
      return NextResponse.json({ error: 'school_id, class_id, mode required' }, { status: 400 })
    }
    const validModes = ['master', 'slave', 'independent']
    if (!validModes.includes(mode)) {
      return NextResponse.json({ error: `mode must be one of: ${validModes.join(', ')}` }, { status: 400 })
    }

    // Slave mode: if master_source_id provided, validate it exists and is a master
    if (mode === 'slave' && master_source_id) {
      const { rows: masterCheck } = await pool.query(
        `SELECT mode FROM class_timetable_modes WHERE class_id=$1 AND school_id=$2`,
        [master_source_id, school_id]
      )
      if (masterCheck.length > 0 && masterCheck[0].mode !== 'master') {
        return NextResponse.json({ error: 'master_source_id must point to a class with MASTER mode' }, { status: 400 })
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO class_timetable_modes (class_id, school_id, mode, master_source_id, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (class_id) DO UPDATE
         SET mode=$3, master_source_id=$4, updated_at=NOW()
       RETURNING *`,
      [class_id, school_id, mode, master_source_id || null]
    )
    return NextResponse.json(rows[0])
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to set mode' }, { status: 500 })
  }
}
