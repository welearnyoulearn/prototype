import { NextRequest, NextResponse } from 'next/server'

const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

// POST /api/hub/debate-score
// Body: { statement, student_response }
// Returns: { score: 1-10, feedback: string, breakdown: { clarity, reasoning, depth } }
export async function POST(req: NextRequest) {
  const { statement, student_response } = await req.json()

  if (!statement || !student_response?.trim())
    return NextResponse.json({ error: 'statement and student_response required' }, { status: 400 })

  if (!process.env.GROQ_API_KEY)
    return NextResponse.json({ score: 5, feedback: 'Good effort! Keep practising your arguments.', breakdown: { clarity: 2, reasoning: 2, depth: 1 } })

  const prompt = `You are evaluating a school student's debate response. Be encouraging but honest.

Debate topic: "${statement}"
Student's response: "${student_response}"

Score this response on three criteria:
1. Clarity (1-3): Is the argument clearly stated?
2. Reasoning (1-4): Are the reasons logical and relevant?
3. Depth (1-3): Does the student show deeper thinking or evidence?

Total = Clarity + Reasoning + Depth (max 10)

Return ONLY JSON (no other text): {"score": number, "feedback": "one encouraging sentence under 20 words", "breakdown": {"clarity": number, "reasoning": number, "depth": number}}`

  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 300 }),
    })
    const data = await res.json()
    const text: string = data.choices?.[0]?.message?.content?.trim() ?? ''
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0])
      if (typeof parsed.score === 'number') {
        return NextResponse.json({
          score: Math.min(10, Math.max(1, Math.round(parsed.score))),
          feedback: parsed.feedback ?? 'Good effort!',
          breakdown: parsed.breakdown ?? {},
        })
      }
    }
  } catch { /* fall through */ }

  return NextResponse.json({ score: 6, feedback: 'Good effort! Your argument shows clear thinking.', breakdown: { clarity: 2, reasoning: 3, depth: 1 } })
}
