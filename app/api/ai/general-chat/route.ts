// POST /api/ai/general-chat
// General-purpose AI chat — not restricted to doubts.
// Body: { messages: [{role, content}], mode: 'student' | 'teacher', grade?, name?, school_id?, subject? }
// Returns: { reply: string }

import { NextRequest, NextResponse } from 'next/server'
import { getTextbookContext } from '@/lib/textbook-search'

const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

export async function POST(req: NextRequest) {
  const { messages, mode, grade, name, syllabusContext, school_id, subject } = await req.json()

  if (!Array.isArray(messages) || messages.length === 0)
    return NextResponse.json({ error: 'messages required' }, { status: 400 })

  if (!process.env.GROQ_API_KEY)
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  // Fetch relevant textbook content for the last student message
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''
  const textbookCtx = (school_id && grade && lastUserMsg)
    ? await getTextbookContext(Number(school_id), String(grade), lastUserMsg, subject ?? null, 3)
    : ''

  const youtubeRule = `When asked for YouTube videos or links, always give real clickable YouTube search URLs like this: https://www.youtube.com/results?search_query=topic+words+here (use + between words, keep it short and specific). Give 2-3 different search URLs for different angles. Never describe channels without a URL.`

  const textbookSection = textbookCtx
    ? `\n\nRelevant passages from the student's textbook:\n${textbookCtx}\n\nUse these passages to give accurate, curriculum-aligned answers. Cite which subject/textbook if helpful.`
    : ''

  const systemPrompt = mode === 'teacher'
    ? `You are a smart, experienced school assistant helping a teacher. You can help with anything they ask — lesson ideas, teaching strategies, student management, writing notices, explaining concepts, general knowledge, current events, or any professional question. Be concise, practical, and direct. Plain text only, no markdown. ${youtubeRule}`
    : `You are a friendly, helpful AI tutor for ${name ? name : 'a student'}${grade ? ` in Grade ${grade}` : ''}. You can help with anything — school subjects, homework, general knowledge, career questions, life advice, fun facts, creative writing, coding, or just a chat. Be conversational, encouraging and easy to understand. Plain text only, no markdown. ${youtubeRule}${syllabusContext ? `\n\n${syllabusContext}\n\nUse this to give relevant help. Don't mention coverage percentages directly unless asked.` : ''}${textbookSection}`

  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        max_tokens: 512,
        temperature: 0.7,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Groq error ${res.status}: ${err}`)
    }

    const data = await res.json()
    const reply = (data.choices?.[0]?.message?.content ?? '').trim()
    return NextResponse.json({ reply })
  } catch (err) {
    console.error('General chat error:', err)
    return NextResponse.json({ error: 'AI unavailable. Please try again.' }, { status: 500 })
  }
}
