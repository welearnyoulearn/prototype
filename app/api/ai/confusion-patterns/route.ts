// GET /api/ai/confusion-patterns?school_id=X&teacher_id=Y&days=7
// Fetches recent doubts for this teacher, clusters similar ones, returns patterns.

import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { analyzeDoubtPatterns } from '@/lib/gemini'

export async function GET(req: NextRequest) {
  const p          = req.nextUrl.searchParams
  const school_id  = p.get('school_id')
  const teacher_id = p.get('teacher_id')
  const days       = parseInt(p.get('days') || '7')

  if (!school_id || !teacher_id)
    return NextResponse.json({ error: 'school_id, teacher_id required' }, { status: 400 })
  if (!process.env.GROQ_API_KEY)
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  try {
    const { rows } = await pool.query(
      `SELECT d.question, d.subject, COUNT(*) OVER () AS total
       FROM doubts d
       WHERE d.school_id = $1
         AND d.answered_by = $2
         AND d.created_at >= NOW() - INTERVAL '${days} days'
       ORDER BY d.created_at DESC
       LIMIT 30`,
      [school_id, teacher_id]
    )

    if (rows.length < 3) return NextResponse.json({ patterns: [], count: rows.length })

    const patterns = await analyzeDoubtPatterns(rows.map(r => ({ question: r.question, subject: r.subject })))
    return NextResponse.json({ patterns, count: rows.length })
  } catch (err) {
    console.error('Confusion patterns error:', err)
    return NextResponse.json({ error: 'Failed to analyze patterns.' }, { status: 500 })
  }
}
