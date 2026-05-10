// AI powered by Groq (llama-3.3-70b-versatile) — free tier: 14,400 req/day
// Key: https://console.groq.com → API Keys → add as GROQ_API_KEY env var

const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

// ─── Internal helpers ──────────────────────────────────────────────────────

async function callAI(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 1024,
  jsonMode = false
): Promise<string> {
  const key = process.env.GROQ_API_KEY
  if (!key) throw new Error('GROQ_API_KEY not set')

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
  return (data.choices?.[0]?.message?.content ?? '').trim()
}

async function callAIChat(
  systemPrompt: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  maxTokens = 512
): Promise<string> {
  const key = process.env.GROQ_API_KEY
  if (!key) throw new Error('GROQ_API_KEY not set')

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Groq API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  return (data.choices?.[0]?.message?.content ?? '').trim()
}

// ─── 1. Doubt AI Answer ────────────────────────────────────────────────────

export async function generateDoubtAnswer(
  subject: string,
  question: string,
  grade: string,
  textbookContext?: string
): Promise<string> {
  const tbSection = textbookContext
    ? `\n\nRelevant textbook content:\n${textbookContext}\n\nUse this to give a curriculum-aligned answer.`
    : ''
  return callAI(
    `You are a helpful school teacher. Give clear, simple answers suitable for Grade ${grade} students. Keep answers under 150 words. Plain text only, no markdown.${tbSection}`,
    `A Grade ${grade} student asked this ${subject} question: "${question}"`,
    350
  )
}

// ─── 2. Daily Newspaper ────────────────────────────────────────────────────

export interface GeminiNewspaper {
  title: string
  subtitle: string
  content: string
  fun_fact: string
  quiz_question: string
  quiz_answer: string
  quiz_options: string[]   // [correct, wrong1, wrong2, wrong3]
  topic: string
  category: string
}

const NEWSPAPER_CATEGORIES = [
  { topic: 'Space & Astronomy',       category: 'Science & Tech' },
  { topic: 'Human Body & Health',     category: 'Science & Tech' },
  { topic: 'World History',           category: 'History' },
  { topic: 'Geography & Earth',       category: 'Environment' },
  { topic: 'Mathematics',             category: 'Math & Logic' },
  { topic: 'Technology & AI',         category: 'Science & Tech' },
  { topic: 'Animals & Wildlife',      category: 'Nature' },
  { topic: 'Indian History',          category: 'History' },
  { topic: 'Environment & Climate',   category: 'Environment' },
  { topic: 'Sports & Records',        category: 'General Knowledge' },
  { topic: 'Famous Scientists',       category: 'Science & Tech' },
  { topic: 'World Cultures',          category: 'General Knowledge' },
  { topic: 'Physics Concepts',        category: 'Science & Tech' },
  { topic: 'Chemistry in Daily Life', category: 'Science & Tech' },
]

export async function generateNewspaper(date: string): Promise<GeminiNewspaper> {
  const dayOfYear = Math.floor(
    (new Date(date).getTime() - new Date(new Date(date).getFullYear(), 0, 0).getTime()) /
    86400000
  )
  const cat = NEWSPAPER_CATEGORIES[dayOfYear % NEWSPAPER_CATEGORIES.length]

  const raw = await callAI(
    'You are an educational content writer for Indian school students (grades 6-12). Always respond with valid JSON only, no markdown, no code fences.',
    `Generate a daily knowledge article on the topic: "${cat.topic}".

Return a JSON object with exactly these fields:
{
  "title": "Engaging headline under 10 words",
  "subtitle": "One sentence teaser under 15 words",
  "content": "180-200 word article, factual, engaging, age-appropriate for grades 6-12",
  "fun_fact": "One surprising fact (1-2 sentences)",
  "quiz_question": "One multiple-choice question about the article",
  "quiz_answer": "The exact correct answer (must match quiz_options[0])",
  "quiz_options": ["correct answer", "wrong option 1", "wrong option 2", "wrong option 3"]
}`,
    900,
    true  // json mode
  )

  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  const parsed = JSON.parse(cleaned) as GeminiNewspaper
  parsed.topic    = cat.topic
  parsed.category = cat.category
  return parsed
}

// ─── 3. Student AI Chatbot (multi-turn) ───────────────────────────────────

export async function chatWithAI(
  messages: { role: 'user' | 'assistant'; content: string }[],
  subject: string,
  grade: string
): Promise<string> {
  return callAIChat(
    `You are a friendly, patient school tutor helping a Grade ${grade} student understand a doubt in ${subject}. Give clear explanations using simple language appropriate for Grade ${grade}. Number steps when explaining a process. Use real-life examples when helpful. Keep each reply under 150 words. Be encouraging. No markdown, no asterisks, plain text only.`,
    messages,
    400
  )
}

// ─── 4. Announcement Drafter ──────────────────────────────────────────────

export async function draftAnnouncement(
  type: string,
  topic: string,
  audience: string
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
    true  // json mode
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
}): Promise<string> {
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
    200
  )
}

// ─── 6. Lesson Plan Generator ──────────────────────────────────────────────

export interface LessonPlan {
  objectives: string[]
  duration_minutes: number
  sections: { title: string; duration: string; activity: string; notes: string }[]
  materials: string[]
  assessment: string
  homework: string
}

export async function generateLessonPlan(
  subject: string,
  chapter: string,
  topic: string,
  grade: string
): Promise<LessonPlan> {
  const raw = await callAI(
    'You are an experienced school teacher creating lesson plans for Indian schools. Always respond with valid JSON only, no markdown.',
    `Create a detailed lesson plan for Grade ${grade}, ${subject}.
Chapter: ${chapter}
Topic: ${topic}

Return a JSON object:
{
  "objectives": ["3 learning objectives"],
  "duration_minutes": 45,
  "sections": [
    { "title": "Introduction", "duration": "5 min", "activity": "what to do", "notes": "tips" },
    { "title": "Main Teaching", "duration": "25 min", "activity": "what to do", "notes": "tips" },
    { "title": "Practice", "duration": "10 min", "activity": "what to do", "notes": "tips" },
    { "title": "Wrap-up", "duration": "5 min", "activity": "what to do", "notes": "tips" }
  ],
  "materials": ["list of materials needed"],
  "assessment": "how to assess understanding (1-2 sentences)",
  "homework": "suggested homework (1 sentence)"
}`,
    800,
    true
  )
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  return JSON.parse(cleaned) as LessonPlan
}

// ─── 7. Confusion Pattern Detection ────────────────────────────────────────

export async function analyzeDoubtPatterns(
  doubts: { question: string; subject: string; count?: number }[]
): Promise<{ pattern: string; affected_count: number; suggested_action: string; concept: string }[]> {
  if (doubts.length === 0) return []
  const list = doubts.map((d, i) => `${i + 1}. [${d.subject}] ${d.question}`).join('\n')
  const raw = await callAI(
    'You are a teacher analyzing student doubts. Find patterns and group similar questions. Always respond with valid JSON only.',
    `Analyze these student doubts and identify confusion patterns:

${list}

Return a JSON array of patterns found:
[
  {
    "pattern": "brief description of the confusion pattern",
    "concept": "the specific concept students are confused about",
    "affected_count": number_of_doubts_related,
    "suggested_action": "1 specific teaching action to resolve this"
  }
]
Return at most 3 patterns. Focus on real conceptual gaps, not surface-level similarities.`,
    500,
    true
  )
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  return JSON.parse(cleaned)
}

// ─── 8. Post-Test AI Diagnosis ──────────────────────────────────────────────

export async function generateTestDiagnosis(
  grade: string,
  score: number,
  maxScore: number,
  wrongQuestions: { question: string; subject: string; correct: string; chosen: string }[],
  rightCount: number
): Promise<string> {
  const pct = Math.round((score / maxScore) * 100)
  const wrongList = wrongQuestions.slice(0, 5)
    .map(q => `- ${q.subject}: "${q.question}" (chose "${q.chosen}", correct: "${q.correct}")`)
    .join('\n')

  return callAI(
    `You are a caring, encouraging school tutor giving a Grade ${grade} student personalised feedback on their weekly test. Write in second person ("You..."). Be warm and specific. Plain text only, no markdown, no bullet points. Under 80 words.`,
    `Test result: ${score}/${maxScore} (${pct}%)
Got right: ${rightCount}
Wrong answers:
${wrongList || 'None — perfect score!'}

Write 2-3 sentences: acknowledge their score warmly, identify the 1-2 topics they should review, and end with one specific encouragement.`,
    180
  )
}

// ─── 9. Leave Coverage Suggestion ──────────────────────────────────────────

export async function generateCoverageSuggestion(
  absentTeacher: string,
  subject: string,
  periods: { class: string; day: string; time: string }[],
  availableTeachers: { name: string; subject: string }[]
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
    180
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
  }
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
    160
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
}): Promise<string> {
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
    220
  )
}

// ─── 12. Weekly MCQ Test ───────────────────────────────────────────────────

export interface MCQQuestion {
  question: string
  options: string[]      // [correct, wrong1, wrong2, wrong3]
  answer: string         // exact correct answer
  subject: string
  difficulty: 'easy' | 'medium' | 'hard'
}

export interface WeeklyTestContext {
  taskSubjects: string[]    // subjects that had tasks assigned this week
  doubtSubjects: string[]   // subjects where students raised doubts this week
}

export async function generateWeeklyTest(
  grade: string,
  topics: { subject: string; chapter: string; topic: string }[],
  weekSeed = 0,   // used by cron to vary which topics are picked each week
  weekContext?: WeeklyTestContext
): Promise<MCQQuestion[]> {
  if (topics.length === 0) throw new Error('No topics provided')

  // Pick up to 10 topics; rotate starting point each week so different topics
  // are tested each week across the full covered syllabus
  const offset  = (weekSeed * 7) % Math.max(topics.length, 1)
  const rotated = [...topics.slice(offset), ...topics.slice(0, offset)]
  const selected = rotated.slice(0, 10)

  const topicsList = selected
    .map((t, i) => `${i + 1}. ${t.subject} — ${t.chapter}: ${t.topic}`)
    .join('\n')

  // Build context hints from this week's activity
  const contextLines: string[] = []
  if (weekContext?.taskSubjects?.length) {
    contextLines.push(`Subjects with tasks assigned this week (increase question weight): ${[...new Set(weekContext.taskSubjects)].join(', ')}`)
  }
  if (weekContext?.doubtSubjects?.length) {
    contextLines.push(`Subjects where students raised doubts this week (students struggled here — include clarifying questions): ${[...new Set(weekContext.doubtSubjects)].join(', ')}`)
  }
  const contextBlock = contextLines.length
    ? `\nWeekly activity context:\n${contextLines.join('\n')}\n`
    : ''

  const raw = await callAI(
    'You are an experienced school teacher creating multiple-choice exam questions. Always respond with a valid JSON array only, no markdown, no code fences.',
    `Generate ${selected.length} multiple-choice questions for Grade ${grade} students based on these topics covered this week:

${topicsList}
${contextBlock}
Return a JSON array where each element has:
{
  "question": "Question text?",
  "options": ["correct answer", "wrong 1", "wrong 2", "wrong 3"],
  "answer": "correct answer",
  "subject": "Subject name",
  "difficulty": "easy or medium or hard"
}

Rules:
- One question per topic, directly testing that specific topic
- options[0] must be the correct answer
- Mix: 40% easy, 40% medium, 20% hard
- Language appropriate for Grade ${grade}
- For subjects where students had doubts, make questions that clarify common misconceptions`,
    1500,
    true  // json mode
  )

  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  return JSON.parse(cleaned) as MCQQuestion[]
}

// ─── Homework suggestion ──────────────────────────────────────────────────────

export type HomeworkSuggestion = {
  title: string
  instructions: string
  task_type: 'homework'
  max_marks: number
  estimated_time_minutes: number
}

export async function suggestHomework(
  subject: string,
  chapterName: string,
  topicName: string,
  grade: string,
  textbookContext?: string
): Promise<HomeworkSuggestion> {
  const tbSection = textbookContext
    ? `\n\nRelevant passage from the student's textbook:\n${textbookContext}\n\nUse this content to create homework that references specific examples, definitions, or exercises from the textbook. If there are exercise numbers (e.g. Exercise 1.1 Q3), mention them in the instructions.`
    : ''

  const raw = await callAI(
    `You are an experienced school teacher creating homework assignments for Indian school students. Always respond with valid JSON only, no markdown.${tbSection}`,
    `Create a homework assignment for:
- Grade: ${grade}
- Subject: ${subject}
- Chapter: ${chapterName}
- Topic just covered in class: ${topicName}

Return JSON with exactly these fields:
{
  "title": "Short homework title (max 60 chars)",
  "instructions": "Clear homework instructions (2-4 sentences, practical and specific to this topic${textbookContext ? ', referencing the textbook content where relevant' : ''})",
  "task_type": "homework",
  "max_marks": 10,
  "estimated_time_minutes": 20
}

Rules:
- Instructions should be practical and directly reinforce today's topic
- Appropriate difficulty for Grade ${grade}
- max_marks between 5 and 20 based on complexity
- estimated_time_minutes between 15 and 45
${textbookContext ? '- Reference specific textbook content (examples, exercises, definitions) in the instructions' : ''}`,
    600,
    true
  )

  const c = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  return { ...JSON.parse(c), task_type: 'homework' } as HomeworkSuggestion
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
  grade: string
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
    true
  )

  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  return JSON.parse(cleaned) as SyllabusChapter[]
}
