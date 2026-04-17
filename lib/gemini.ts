// Gemini 2.0 Flash — free tier: 1,500 req/day, 1M tokens/min
// Key: https://aistudio.google.com → Get API Key → add as GEMINI_API_KEY env var

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

async function callGemini(prompt: string, maxTokens = 1024): Promise<string> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY not set')

  const res = await fetch(`${GEMINI_URL}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  return text.trim()
}

// ─── 1. Doubt AI Answer ────────────────────────────────────────────────────

export async function generateDoubtAnswer(
  subject: string,
  question: string,
  grade: string
): Promise<string> {
  const prompt = `You are a helpful school teacher. A Grade ${grade} student asked this ${subject} question:

"${question}"

Give a clear, simple answer suitable for a Grade ${grade} student. Keep it under 120 words. Do not use markdown formatting — plain text only.`

  return callGemini(prompt, 300)
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
  { topic: 'Space & Astronomy',   category: 'Science & Tech' },
  { topic: 'Human Body & Health', category: 'Science & Tech' },
  { topic: 'World History',       category: 'History' },
  { topic: 'Geography & Earth',   category: 'Environment' },
  { topic: 'Mathematics',         category: 'Math & Logic' },
  { topic: 'Technology & AI',     category: 'Science & Tech' },
  { topic: 'Animals & Wildlife',  category: 'Nature' },
  { topic: 'Indian History',      category: 'History' },
  { topic: 'Environment & Climate', category: 'Environment' },
  { topic: 'Sports & Records',    category: 'General Knowledge' },
  { topic: 'Famous Scientists',   category: 'Science & Tech' },
  { topic: 'World Cultures',      category: 'General Knowledge' },
  { topic: 'Physics Concepts',    category: 'Science & Tech' },
  { topic: 'Chemistry in Daily Life', category: 'Science & Tech' },
]

export async function generateNewspaper(date: string): Promise<GeminiNewspaper> {
  // Pick category based on date so every day is different
  const dayOfYear = Math.floor(
    (new Date(date).getTime() - new Date(new Date(date).getFullYear(), 0, 0).getTime()) /
    86400000
  )
  const cat = NEWSPAPER_CATEGORIES[dayOfYear % NEWSPAPER_CATEGORIES.length]

  const prompt = `Generate a daily knowledge article for Indian school students (grades 6-12) on the topic: "${cat.topic}".

Return ONLY valid JSON in this exact format (no markdown, no code block):
{
  "title": "Engaging headline under 10 words",
  "subtitle": "One sentence teaser under 15 words",
  "content": "180-200 word article — factual, engaging, age-appropriate for grades 6-12",
  "fun_fact": "One surprising fact about this topic (1-2 sentences)",
  "quiz_question": "One multiple-choice question about the article",
  "quiz_answer": "The exact correct answer (must match one of quiz_options)",
  "quiz_options": ["correct answer", "wrong option 1", "wrong option 2", "wrong option 3"]
}

Rules:
- Content must be factual and accurate
- Language should be simple but engaging
- quiz_options[0] must always be the correct answer
- Do not use markdown in any field
- Return only the JSON object, nothing else`

  const raw = await callGemini(prompt, 800)

  // Strip any accidental markdown code fences
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  const parsed = JSON.parse(cleaned) as GeminiNewspaper

  // Ensure topic and category are set
  parsed.topic = cat.topic
  parsed.category = cat.category

  return parsed
}

// ─── 3. Weekly MCQ Test ────────────────────────────────────────────────────

export interface MCQQuestion {
  question: string
  options: string[]      // [correct, wrong1, wrong2, wrong3]
  answer: string         // exact correct answer
  subject: string
  difficulty: 'easy' | 'medium' | 'hard'
}

export async function generateWeeklyTest(
  grade: string,
  topics: { subject: string; chapter: string; topic: string }[]
): Promise<MCQQuestion[]> {
  if (topics.length === 0) throw new Error('No topics provided')

  // Pick up to 10 topics, spread across subjects
  const selected = topics.slice(0, 10)
  const topicsList = selected
    .map((t, i) => `${i + 1}. ${t.subject} — ${t.chapter}: ${t.topic}`)
    .join('\n')

  const prompt = `Generate ${selected.length} multiple-choice questions for Grade ${grade} students based on these recently covered topics:

${topicsList}

Return ONLY valid JSON array (no markdown, no code block):
[
  {
    "question": "Question text?",
    "options": ["correct answer", "wrong 1", "wrong 2", "wrong 3"],
    "answer": "correct answer",
    "subject": "Subject name",
    "difficulty": "easy" | "medium" | "hard"
  }
]

Rules:
- One question per topic
- options[0] must always be the correct answer
- Difficulty: mix of easy (40%), medium (40%), hard (20%)
- Questions must be directly based on the given topic
- Language appropriate for Grade ${grade}
- Return only the JSON array, nothing else`

  const raw = await callGemini(prompt, 1500)
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  return JSON.parse(cleaned) as MCQQuestion[]
}
