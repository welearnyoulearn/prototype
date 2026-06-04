// POST /api/ai/lesson-plan
// Body: { subject, chapter, topic, grade }
// Returns: LessonPlan object

import { NextRequest, NextResponse } from 'next/server'
import { generateLessonPlan } from '@/lib/gemini'
import { getAnySession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!await getAnySession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { subject, chapter, topic, grade } = await req.json()
  if (!subject?.trim() || !topic?.trim() || !grade?.trim())
    return NextResponse.json({ error: 'subject, topic, grade required' }, { status: 400 })
  if (!process.env.GROQ_API_KEY)
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
  try {
    const plan = await generateLessonPlan(subject.trim(), chapter?.trim() || subject.trim(), topic.trim(), grade.trim())
    return NextResponse.json(plan)
  } catch (err) {
    console.error('Lesson plan error:', err)
    return NextResponse.json({ error: 'Failed to generate lesson plan.' }, { status: 500 })
  }
}
