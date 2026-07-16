// Builds the copy-paste prompt a curator pastes into ChatGPT to produce the
// bulk-import JSON from an official chapter PDF. Ported from the Ulearn prototype.
//
// The wording deliberately handles the "no PDF attached" case (tell the model to
// use its own knowledge and NOT stop to ask for an upload) and relaxes "source"
// to a short supporting sentence, which is what unblocked ChatGPT in testing.

export function syllabusPrompt(board: string, grade: string | number, subject: string): string {
  return `Build a structured syllabus for an EdTech app: Class ${grade}, ${subject}, following the official ${board} / NCERT curriculum.

Use the standard ${board} / NCERT Class ${grade} ${subject} textbook. If a chapter PDF is attached, use it; if NOT, do NOT ask me to upload anything and do NOT stop — just use your own knowledge of that official textbook and proceed. You may look up the official chapter list if unsure.

Output a single JSON array and NOTHING else — no explanation, no markdown, no code fences — in EXACTLY this shape:

[
  {
    "title": "<chapter name>",
    "topics": [
      {
        "title": "<topic / sub-topic name>",
        "quiz": [
          { "q": "<multiple-choice question>", "options": ["<A>", "<B>", "<C>", "<D>"], "correct": 0, "source": "<one short sentence stating the supporting fact>" }
        ]
      }
    ]
  }
]

Rules:
- Cover the official chapters for Class ${grade} ${subject} and their main sub-topics, in order.
- 3–4 multiple-choice questions per topic, each with exactly 4 options.
- "correct" is the ZERO-based index of the right option (0 = the first option).
- Each question must be factually correct and based on the chapter content.
- "source" is ONE short sentence stating the supporting fact — a brief factual note is enough; do not reproduce long passages and do not invent facts.
- Output valid JSON only: double quotes, no trailing commas, no comments.`
}

// Placeholder JSON shown in the bulk-import textarea + loaded by "Load example".
export const SYLLABUS_EXAMPLE = JSON.stringify(
  [
    {
      title: 'Force and pressure',
      topics: [
        'Pressure in fluids',
        {
          title: 'Frictional force',
          quiz: [
            {
              q: 'The force that opposes motion between two surfaces is —',
              options: ['gravity', 'friction', 'magnetism', 'tension'],
              correct: 1,
              source: 'Friction opposes the relative motion between two surfaces in contact.',
            },
          ],
        },
      ],
    },
    { title: 'Sound', topics: ['How sound is produced', 'Frequency and pitch'] },
  ],
  null,
  2,
)

export const QUIZ_EXAMPLE = JSON.stringify(
  [
    {
      q: 'Your question text?',
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correct: 0,
      source: 'The sentence from the chapter this question is grounded in.',
    },
  ],
  null,
  2,
)

export function quizPrompt(chapter: string, topic: string, grade: string | number, subject: string): string {
  return `Write quiz questions for an EdTech app: Class ${grade}, ${subject} — chapter "${chapter}", topic "${topic}" (official CBSE / NCERT curriculum).

Use the standard NCERT Class ${grade} ${subject} textbook. If a chapter PDF is attached, use it; if NOT, do NOT ask me to upload anything and do NOT stop — just use your own knowledge of that chapter and proceed.

Output a single JSON array of questions and NOTHING else — no explanation, no markdown, no code fences — in EXACTLY this shape:

[
  { "q": "<multiple-choice question>", "options": ["<A>", "<B>", "<C>", "<D>"], "correct": 0, "source": "<one short sentence stating the supporting fact>" }
]

Rules:
- Write 5–8 multiple-choice questions about "${topic}", each with exactly 4 options.
- "correct" is the ZERO-based index of the right option (0 = the first option).
- Each question must be factually correct and based on the chapter content.
- "source" is ONE short sentence stating the supporting fact; do not reproduce long passages and do not invent facts.`
}
