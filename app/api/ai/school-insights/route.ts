// POST /api/ai/school-insights
// Generates a brief AI daily summary for school admins.
// Body: { date, teachers, students, classes, pendingLeaves, attendancePct?, uncoveredPeriods?, upcomingExams? }
// Returns: { insights: string }

import { NextRequest, NextResponse } from 'next/server'
import { generateSchoolInsights } from '@/lib/gemini'

export async function POST(req: NextRequest) {
  const body = await req.json()

  if (!process.env.GEMINI_API_KEY)
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  try {
    const insights = await generateSchoolInsights(body)
    return NextResponse.json({ insights })
  } catch (err) {
    console.error('School insights error:', err)
    return NextResponse.json({ error: 'Failed to generate insights.' }, { status: 500 })
  }
}
