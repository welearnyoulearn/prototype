import { NextRequest, NextResponse } from 'next/server'
import { suggestHomework } from '@/lib/gemini'
import { getTextbookContext } from '@/lib/textbook-search'

// POST /api/ai/suggest-homework
// Body: { subject, chapter_name, topic_name, grade, school_id? }
// Returns: { title, instructions, task_type, max_marks, estimated_time_minutes }
export async function POST(req: NextRequest) {
  try {
    const { subject, chapter_name, topic_name, grade, school_id } = await req.json()

    if (!subject || !topic_name || !grade) {
      return NextResponse.json({ error: 'subject, topic_name, grade are required' }, { status: 400 })
    }

    // Search textbook for this specific topic — gives AI grounded content
    const query = `${chapter_name ?? ''} ${topic_name}`.trim()
    const textbookCtx = school_id
      ? await getTextbookContext(Number(school_id), String(grade), query, subject, 3)
      : ''

    const suggestion = await suggestHomework(
      subject,
      chapter_name || topic_name,
      topic_name,
      String(grade),
      textbookCtx || undefined
    )

    return NextResponse.json(suggestion)
  } catch (error) {
    console.error('suggest-homework error:', error)
    return NextResponse.json({ error: 'Failed to generate homework suggestion' }, { status: 500 })
  }
}
