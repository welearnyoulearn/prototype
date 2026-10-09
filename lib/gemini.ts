// AI powered by Groq (llama-3.3-70b-versatile) — free tier: 14,400 req/day
// Key: https://console.groq.com → API Keys → add as GROQ_API_KEY env var

import { checkAllowance, recordUsage } from './usage'

const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

// Which school an AI call is metered against (#358). Omitted = not metered.
export type AIUsage = { schoolId: number; source: string }

// ─── Internal helpers ──────────────────────────────────────────────────────

async function callAI(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 1024,
  jsonMode = false,
  usage?: AIUsage
): Promise<string> {
  const key = process.env.GROQ_API_KEY
  if (!key) throw new Error('GROQ_API_KEY not set')
  if (usage) {
    const allowance = await checkAllowance(usage.schoolId, 'ai.tokens', 1)
    if (!allowance.allowed) {
      throw new Error(allowance.reason === 'not_in_plan' ? 'AI is not included in your plan.' : 'This month\'s AI limit is reached.')
    }
  }

  const body: Record<string, unknown> = {
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ],
    max_tokens: maxTokens,
    temperature: 0.7,
  }
  if (jsonMode) body.response_format = { type: 'json_object' }

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Groq API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  if (usage) {
    const totalTokens = Number(data.usage?.total_tokens)
    await recordUsage({ schoolId: usage.schoolId, meterKey: 'ai.request', quantity: 1, source: usage.source })
    if (totalTokens > 0) await recordUsage({ schoolId: usage.schoolId, meterKey: 'ai.tokens', quantity: totalTokens, source: usage.source })
  }
  return (data.choices?.[0]?.message?.content ?? '').trim()
}


// ─── 4. Announcement Drafter ──────────────────────────────────────────────

export async function draftAnnouncement(
  type: string,
  topic: string,
  audience: string,
  usage?: AIUsage
): Promise<{ title: string; content: string }> {
  const raw = await callAI(
    'You are a school administrator. Write professional but warm school announcements. Always respond with valid JSON only.',
    `Write a school announcement.
Type: ${type}
Topic: ${topic}
Audience: ${audience}

Return a JSON object:
{
  "title": "Short clear title under 10 words",
  "content": "50-80 word announcement body, professional but warm, no markdown"
}`,
    400,
    true,  // json mode
    usage
  )
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  return JSON.parse(cleaned) as { title: string; content: string }
}

// ─── 5. School Admin Daily Insights ───────────────────────────────────────

export async function generateSchoolInsights(context: {
  date: string
  teachers: number
  students: number
  classes: number
  pendingLeaves: number
  attendancePct?: number
  uncoveredPeriods?: number
  upcomingExams?: number
}, usage?: AIUsage): Promise<string> {
  const lines = [
    `${context.teachers} teachers, ${context.students} students, ${context.classes} classes`,
    `Pending leave requests: ${context.pendingLeaves}`,
    context.attendancePct !== undefined ? `Today's attendance: ${context.attendancePct}%` : null,
    context.uncoveredPeriods        ? `Uncovered periods today: ${context.uncoveredPeriods}` : null,
    context.upcomingExams           ? `Exams scheduled this week: ${context.upcomingExams}` : null,
  ].filter(Boolean).join('\n')

  return callAI(
    'You are a school management assistant. Write concise, actionable summaries for school principals. Plain text only, no markdown.',
    `Generate a brief daily summary for ${context.date}.\n\nSchool data:\n${lines}\n\nWrite 3-4 sentences: highlight what needs immediate attention, what looks good, and one suggested action for the day.`,
    200,
    false,
    usage
  )
}

// ─── 9. Leave Coverage Suggestion ──────────────────────────────────────────

export async function generateCoverageSuggestion(
  absentTeacher: string,
  subject: string,
  periods: { class: string; day: string; time: string }[],
  availableTeachers: { name: string; subject: string }[],
  usage?: AIUsage
): Promise<string> {
  const periodsList = periods.map(p => `  - ${p.class} on ${p.day} at ${p.time}`).join('\n')
  const teachersList = availableTeachers.map(t => `  - ${t.name} (teaches ${t.subject})`).join('\n')

  return callAI(
    'You are a school admin assistant. Write brief, actionable coverage suggestions for the principal. Plain text only, no markdown.',
    `${absentTeacher} (${subject} teacher) is on leave. Uncovered periods:
${periodsList}

Available teachers:
${teachersList}

Write 2-3 sentences: suggest the best coverage arrangement, mention any subject mismatch risks, and recommend any self-study alternatives if no suitable cover is available.`,
    180,
    false,
    usage
  )
}

// ─── 10. Personalised Parent Message ────────────────────────────────────────

export async function generateParentMessage(
  studentName: string,
  grade: string,
  stats: {
    attendancePct?: number
    recentScore?: number
    pendingTasks?: number
    lastActive?: string
    concern?: string
  },
  usage?: AIUsage
): Promise<string> {
  const lines = [
    stats.attendancePct !== undefined ? `Attendance this month: ${stats.attendancePct}%` : null,
    stats.recentScore !== undefined ? `Latest test score: ${stats.recentScore}%` : null,
    stats.pendingTasks ? `Pending tasks: ${stats.pendingTasks}` : null,
    stats.lastActive ? `Last active on portal: ${stats.lastActive}` : null,
    stats.concern ? `Specific concern: ${stats.concern}` : null,
  ].filter(Boolean).join('\n')

  return callAI(
    'You are a school class teacher writing a brief, warm, professional message to a parent. Plain text only, no markdown, no Dear/From salutation.',
    `Write a personalised parent message for ${studentName} in Grade ${grade}.

Student data:
${lines}

Write 2-3 sentences: start with something positive, mention any concern naturally, end with one actionable suggestion for the parent. Warm but professional tone.`,
    160,
    false,
    usage
  )
}

// ─── 11. School Weekly Health Report ────────────────────────────────────────

export async function generateSchoolHealthReport(data: {
  weekLabel: string
  avgAttendancePct: number
  absentTeachers: number
  totalTeachers: number
  doubtsRaised: number
  doubtsAnswered: number
  tasksAssigned: number
  tasksSubmitted: number
  testsCompleted: number
  feeCollected?: number
  feeOutstanding?: number
}, usage?: AIUsage): Promise<string> {
  const lines = [
    `Week: ${data.weekLabel}`,
    `Teacher attendance: ${data.totalTeachers - data.absentTeachers}/${data.totalTeachers} present (${Math.round(((data.totalTeachers - data.absentTeachers) / data.totalTeachers) * 100)}%)`,
    `Student attendance: ${data.avgAttendancePct}% average`,
    `Doubts: ${data.doubtsRaised} raised, ${data.doubtsAnswered} answered`,
    `Tasks: ${data.tasksAssigned} assigned, ${data.tasksSubmitted} submitted`,
    `Weekly tests completed: ${data.testsCompleted}`,
    data.feeCollected !== undefined ? `Fee collected this week: ₹${data.feeCollected}` : null,
    data.feeOutstanding !== undefined ? `Outstanding fees: ₹${data.feeOutstanding}` : null,
  ].filter(Boolean).join('\n')

  return callAI(
    'You are a school management consultant. Write concise weekly school health summaries for principals. Plain text only, no markdown, no bullet points.',
    `Generate a weekly school health summary.\n\n${lines}\n\nWrite 4-5 sentences covering: what went well, what needs attention, the top priority for next week, and end with one data-driven observation that would surprise most principals.`,
    220,
    false,
    usage
  )
}

// ─── PDF Syllabus Extractor ───────────────────────────────────────────────────

export interface SyllabusChapter {
  name: string
  order: number
  topics: { name: string; order: number }[]
}

export async function extractSyllabusFromPDF(
  pdfText: string,
  subject: string,
  grade: string,
  usage?: AIUsage
): Promise<SyllabusChapter[]> {
  // Trim to fit in context while keeping enough to identify all chapters
  const text = pdfText.slice(0, 40000)

  const raw = await callAI(
    'You are an expert curriculum analyst. Extract the complete chapter and topic structure from the given textbook content. Always respond with valid JSON only, no markdown, no code fences.',
    `Extract the full syllabus structure from this Grade ${grade} ${subject} textbook content.

Textbook content:
${text}

Return a JSON array of chapters:
[
  {
    "name": "Chapter name exactly as in textbook",
    "order": 1,
    "topics": [
      { "name": "Topic or section name", "order": 1 },
      { "name": "Topic or section name", "order": 2 }
    ]
  }
]

Rules:
- Extract real chapter names and topics as they appear in the textbook
- Each chapter should have 3-12 topics (key concepts, sections, or subtopics)
- Topics should be specific enough to track teaching progress
- Order chapters and topics as they appear in the book
- Return all chapters found — do not truncate
- If exact chapters cannot be identified, group related topics logically into chapters`,
    3000,
    true,
    usage
  )

  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  return JSON.parse(cleaned) as SyllabusChapter[]
}
