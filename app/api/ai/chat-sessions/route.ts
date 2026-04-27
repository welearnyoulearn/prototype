// POST /api/ai/chat-sessions   — save or update a student AI chat session
// GET  /api/ai/chat-sessions   — parent reads child's AI chat sessions
// Body (POST): { school_id, student_id, subject, messages }
// Query (GET):  school_id, student_id, limit?

import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const { school_id, student_id, subject, messages } = await req.json()
    if (!school_id || !student_id || !Array.isArray(messages))
      return NextResponse.json({ error: 'school_id, student_id, messages required' }, { status: 400 })

    const { rows } = await pool.query(
      `INSERT INTO ai_chat_sessions (school_id, student_id, subject, messages, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id`,
      [school_id, student_id, subject || null, JSON.stringify(messages)]
    )
    return NextResponse.json({ id: rows[0].id })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const school_id  = p.get('school_id')
  const student_id = p.get('student_id')
  const limit      = parseInt(p.get('limit') || '20')
  if (!school_id || !student_id)
    return NextResponse.json({ error: 'school_id, student_id required' }, { status: 400 })

  try {
    const { rows } = await pool.query(
      `SELECT id, subject, messages, created_at
       FROM ai_chat_sessions
       WHERE school_id = $1 AND student_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [school_id, student_id, limit]
    )
    return NextResponse.json({ sessions: rows })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
