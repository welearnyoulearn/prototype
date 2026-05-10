import { NextRequest, NextResponse } from 'next/server'

const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

// POST /api/hub/writing-score
// Body: { prompt, response }
// Returns: { score: 1-8, feedback: string }
export async function POST(req: NextRequest) {
  try {
    const { prompt, response } = await req.json()
    if (!prompt || !response) return NextResponse.json({ score: 5, feedback: 'Good effort!' })
    if (!process.env.GROQ_API_KEY) return NextResponse.json({ score: 5, feedback: 'Good effort! Keep writing.' })

    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{
          role: 'user',
          content: `You are a friendly teacher evaluating a school student's creative writing.

Writing prompt: "${prompt}"
Student's response: "${response}"

Score on creativity (originality), language (vocabulary, sentence structure), relevance (answers the prompt), and effort (length and detail). Give a score from 1 to 8 (8 = exceptional). Write one short encouraging sentence as feedback.

Return ONLY valid JSON: {"score":6,"feedback":"..."}`,
        }],
        temperature: 0.5,
        max_tokens: 120,
      }),
    })
    const data = await res.json()
    const text = data.choices?.[0]?.message?.content?.trim() ?? ''
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0])
      return NextResponse.json({
        score:    Math.min(8, Math.max(1, Math.round(parsed.score ?? 5))),
        feedback: parsed.feedback ?? 'Good work!',
      })
    }
    return NextResponse.json({ score: 5, feedback: 'Good effort! Keep writing creatively.' })
  } catch (err) {
    console.error('writing-score error:', err)
    return NextResponse.json({ score: 5, feedback: 'Good effort! Keep practising.' })
  }
}
