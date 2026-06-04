// POST /api/ai/school-insights
// Generates a brief AI daily summary for school admins.
// Body: { date, teachers, students, classes, pendingLeaves, attendancePct?, uncoveredPeriods?, upcomingExams? }
// Returns: { insights: string }

import { NextRequest, NextResponse } from 'next/server'
import { generateSchoolInsights } from '@/lib/gemini'
import { getAnySession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!await getAnySession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()

  if (!process.env.GROQ_API_KEY)
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  try {
    const insights = await generateSchoolInsights(body)
    return NextResponse.json({ insights })
  } catch (err) {
    console.error('School insights error:', err)
    return NextResponse.json({ error: 'Failed to generate insights.' }, { status: 500 })
  }
}
