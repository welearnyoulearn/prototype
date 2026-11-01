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
  usage?: AIUsage,
  temperature = 0.7
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
    temperature,
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

/** Thrown when Groq is rate-limited or unavailable: the caller should stop and try again later. */
export class AIRetryLaterError extends Error {}

// ─── Quiz bank: blind answer check (#432) ─────────────────────────────────
// Groq answers each question without being told the key. A question is kept only when its answer matches
// the one Claude wrote — two different models agreeing catches far more wrong keys than one model
// checking itself. Platform-level work for the shared bank, so it is not metered against a school.
export async function answerMcqsBlind(
  items: { key: string; stem: string; options: string[] }[],
  context: { board: string; grade: string; subject: string }
): Promise<Map<string, number>> {
  if (items.length === 0) return new Map()
  const list = items.map(i => ({ id: i.key, question: i.stem, options: i.options.map((o, n) => `${n}: ${o}`) }))
  let raw: string
  try {
    raw = await callAI(
      `You are an expert ${context.board} Grade ${context.grade} ${context.subject} teacher checking quiz questions. For each question choose the single best option. Reply with JSON only: {"answers":[{"id":"<id>","answer":<0-3>}]}. If a question has no correct option or more than one, answer -1.`,
      JSON.stringify(list),
      Math.min(4000, 60 + items.length * 30),
      true,
      undefined,
      0
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/Groq API error (429|5\d\d)/.test(msg) || /fetch failed|ECONN|ETIMEDOUT/i.test(msg)) throw new AIRetryLaterError(msg)
    throw err
  }
  const answers = new Map<string, number>()
  try {
    const parsed = JSON.parse(raw) as { answers?: { id?: unknown; answer?: unknown }[] }
    for (const a of parsed.answers ?? []) {
      if (typeof a.id === 'string' && Number.isInteger(a.answer)) answers.set(a.id, a.answer as number)
    }
  } catch { /* unparseable reply: nothing agrees, so nothing from this chunk is kept */ }
  return answers
}

// ─── Daily Quiz: "Ask WLYL AI" about a reviewed question (#435) ───────────
// Only after the answers are out, so nothing is given away. Short, kind, at the student's level, in the
// question's language. Not metered against the school's AI plan: it is part of the Student Doubts feature
// and capped per student per day by the caller (lib/studentDoubts.ts).
export async function explainQuizDoubt(q: {
  grade: string; subject: string; language: string; stem: string; options: string[]
  correctIndex: number; explanation: string | null; chosenIndex: number | null; studentMessage: string | null
}): Promise<string> {
  const letters = ['A', 'B', 'C', 'D']
  const lang = q.language === 'telugu' ? 'Telugu' : q.language === 'hindi' ? 'Hindi' : 'simple English'
  const prompt = [
    `Question: ${q.stem}`,
    ...q.options.map((o, i) => `${letters[i]}. ${o}`),
    `Correct answer: ${letters[q.correctIndex]}. ${q.options[q.correctIndex]}`,
    q.chosenIndex === null ? 'The student did not answer.' : `The student chose: ${letters[q.chosenIndex]}. ${q.options[q.chosenIndex]}`,
    q.explanation ? `Book explanation: ${q.explanation}` : '',
    q.studentMessage ? `The student says: "${q.studentMessage}"` : 'The student read the explanation and is still confused.',
  ].filter(Boolean).join('\n')
  try {
    return await callAI(
      `You are WLYL's friendly tutor for a Grade ${q.grade} ${q.subject} student. Explain why the correct answer is right${q.chosenIndex !== null && q.chosenIndex !== q.correctIndex ? ' and why the student\'s choice is not' : ''}, using a simple everyday example. Write in ${lang}, in at most 120 words, no markdown headings. Never be discouraging. Only talk about this question and its topic.`,
      prompt,
      400,
      false,
      undefined,
      0.4,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/Groq API error (429|5\d\d)/.test(msg) || /fetch failed|ECONN|ETIMEDOUT/i.test(msg)) throw new AIRetryLaterError(msg)
    throw err
  }
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
