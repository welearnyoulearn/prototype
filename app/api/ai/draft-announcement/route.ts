// POST /api/ai/draft-announcement
// Generates a draft announcement title + content using Gemini.
// Body: { type, topic, audience }
// Returns: { title, content }

import { NextRequest, NextResponse } from 'next/server'
import { draftAnnouncement } from '@/lib/gemini'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { type = 'general', topic, audience = 'all' } = body

  if (!topic?.trim())
    return NextResponse.json({ error: 'topic required' }, { status: 400 })

  if (!process.env.GEMINI_API_KEY)
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  try {
    const draft = await draftAnnouncement(type, topic.trim(), audience)
    return NextResponse.json(draft)
  } catch (err) {
    console.error('Announcement draft error:', err)
    return NextResponse.json({ error: 'Failed to generate draft. Try again.' }, { status: 500 })
  }
}
