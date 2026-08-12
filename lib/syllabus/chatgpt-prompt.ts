// Builds the copy-paste prompt a curator pastes into ChatGPT to produce the
// bulk-import JSON from an official chapter PDF. Ported from the Ulearn prototype.
//
// The wording deliberately handles the "no PDF attached" case (tell the model to
// use its own knowledge and NOT stop to ask for an upload) and relaxes "source"
// to a short supporting sentence, which is what unblocked ChatGPT in testing.

export function syllabusPrompt(board: string, grade: string | number, subject: string): string {
  return `Build a structured syllabus index for an EdTech app: Class ${grade}, ${subject}, following the official ${board} / NCERT curriculum.

Use the standard ${board} / NCERT Class ${grade} ${subject} textbook. If a chapter PDF is attached, use it; if NOT, do NOT ask me to upload anything and do NOT stop — just use your own knowledge of that official textbook and proceed. You may look up the official chapter list if unsure.

Output a single JSON array and NOTHING else — no explanation, no markdown, no code fences.

If the Class ${grade} ${subject} syllabus is split into semesters/terms (Sem 1, Sem 2, etc.), output an array of semester groups in EXACTLY this shape:

[
  {
    "semester": "Sem 1",
    "chapters": [
      {
        "title": "<chapter name>",
        "topics": [
          {
            "title": "<topic / sub-topic name>",
            "subtopics": ["<sub-topic or exercise name>", "<sub-topic or exercise name>"]
          }
        ]
      }
    ]
  }
]

If it is NOT split into semesters, skip the semester grouping and output a flat array of chapters in EXACTLY this shape instead:

[
  {
    "title": "<chapter name>",
    "topics": [
      {
        "title": "<topic / sub-topic name>",
        "subtopics": ["<sub-topic or exercise name>", "<sub-topic or exercise name>"]
      }
    ]
  }
]

Rules:
- Cover the official chapters for Class ${grade} ${subject} and their main topics, in order.
- "subtopics" is optional — only include it where the textbook actually breaks a topic down further (e.g. a poem + a supplementary reader under one unit). Omit it, or leave it an empty array, when there's nothing to nest.
- Do NOT generate quiz questions or any assessment content — titles only.
- Output valid JSON only: double quotes, no trailing commas, no comments.`
}

// Placeholder JSON shown in the bulk-import textarea + loaded by "Load example".
export const SYLLABUS_EXAMPLE = JSON.stringify(
  [
    {
      semester: 'Sem 1',
      chapters: [
        {
          title: 'Force and pressure',
          topics: [
            'Pressure in fluids',
            { title: 'Frictional force', subtopics: ['Static friction', 'Kinetic friction'] },
          ],
        },
        { title: 'Sound', topics: ['How sound is produced', 'Frequency and pitch'] },
      ],
    },
  ],
  null,
  2,
)
