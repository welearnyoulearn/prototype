// POST /api/ai/test-diagnosis
// Body: { grade, score, max_score, wrong_questions: [{question, subject, correct, chosen}] }
// Returns: { diagnosis: string }

import { NextRequest, NextResponse } from 'next/server'
import { generateTestDiagnosis } from '@/lib/gemini'
import { getAnySession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!await getAnySession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { grade, score, max_score, wrong_questions } = await req.json()
  if (!grade || score === undefined || !max_score)
    return NextResponse.json({ error: 'grade, score, max_score required' }, { status: 400 })
  if (!process.env.GROQ_API_KEY)
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
  try {
    const diagnosis = await generateTestDiagnosis(
      grade, score, max_score,
      Array.isArray(wrong_questions) ? wrong_questions : [],
      max_score - (wrong_questions?.length || 0)
    )
    return NextResponse.json({ diagnosis })
  } catch (err) {
    console.error('Test diagnosis error:', err)
    return NextResponse.json({ error: 'Failed to generate diagnosis.' }, { status: 500 })
  }
}
