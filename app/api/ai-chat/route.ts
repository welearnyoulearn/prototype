// POST /api/ai-chat
// Multi-turn AI chatbot for students to resolve doubts interactively.
// Body: { messages: [{role, content}], subject, grade }
// Returns: { reply: string }

import { NextRequest, NextResponse } from 'next/server'
import { chatWithAI } from '@/lib/gemini'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { messages, subject, grade } = body

  if (!Array.isArray(messages) || messages.length === 0)
    return NextResponse.json({ error: 'messages required' }, { status: 400 })
  if (!subject?.trim() || !grade?.trim())
    return NextResponse.json({ error: 'subject and grade required' }, { status: 400 })

  if (!process.env.GROQ_API_KEY)
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  try {
    const reply = await chatWithAI(messages, subject.trim(), grade.trim())
    return NextResponse.json({ reply })
  } catch (err) {
    console.error('AI chat error:', err)
    return NextResponse.json({ error: 'AI unavailable. Please try again.' }, { status: 500 })
  }
}
