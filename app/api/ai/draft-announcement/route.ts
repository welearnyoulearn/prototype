// POST /api/ai/draft-announcement
// Generates a draft announcement title + content using Gemini.
// Body: { type, topic, audience }
// Returns: { title, content }

import { NextRequest, NextResponse } from 'next/server'
import { draftAnnouncement } from '@/lib/gemini'
import { getAnySession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!await getAnySession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { type = 'general', topic, audience = 'all' } = body

  if (!topic?.trim())
    return NextResponse.json({ error: 'topic required' }, { status: 400 })

  if (!process.env.GROQ_API_KEY)
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  try {
    const draft = await draftAnnouncement(type, topic.trim(), audience)
    return NextResponse.json(draft)
  } catch (err) {
    console.error('Announcement draft error:', err)
    return NextResponse.json({ error: 'Failed to generate draft. Try again.' }, { status: 500 })
  }
}
