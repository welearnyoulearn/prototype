import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { completeOnce, formatSyllabus, retrievalQuery, streamTutorAnswer, SYSTEM_PROMPT, trimHistory, tutorConfigured, TutorError, wantsSyllabus, type SyllabusRow, type TutorUsage } from './tutor'

process.env.OMNIROUTE_BASE_URL = 'http://omniroute.test/v1/'
process.env.OMNIROUTE_API_KEYS = 'k1'
process.env.TUTOR_MODELS = 'm1,m2'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

const enc = new TextEncoder()
const delta = (text: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`

// Each call returns the next response; records request bodies.
function stubFetch(responses: (() => Response)[]) {
  const calls: { url: string; body: { model: string; messages: { role: string; content: string }[]; max_tokens: number; stream_options?: { include_usage: boolean } } }[] = []
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) })
    return responses[calls.length - 1]()
  }
  return calls
}

const ask = { excerpts: [], question: 'What is photosynthesis?', history: [{ role: 'assistant' as const, content: 'hi' }, { role: 'user' as const, content: 'earlier' }, { role: 'assistant' as const, content: 'answer' }] }

async function collect(gen: AsyncGenerator<string>) {
  let out = ''
  for await (const t of gen) out += t
  return out
}

test('fails over from a 500 to the next model and streams split SSE lines', async () => {
  const calls = stubFetch([
    () => new Response('{"error":{"message":"down"}}', { status: 500 }),
    () => new Response(new ReadableStream({
      start(c) {
        const sse = `: ping\n${delta('Hello')}${delta(' there')}data: not-json\n\ndata: [DONE]\n\n`
        c.enqueue(enc.encode(sse.slice(0, 20)))
        c.enqueue(enc.encode(sse.slice(20)))
        c.close()
      },
    })),
  ])
  assert.equal(tutorConfigured(), true)
  assert.equal(await collect(streamTutorAnswer(ask)), 'Hello there')
  assert.deepEqual(calls.map(c => [c.url, c.body.model]), [['http://omniroute.test/v1/chat/completions', 'm1'], ['http://omniroute.test/v1/chat/completions', 'm2']])

  const { messages } = calls[1].body
  assert.ok(messages.every(m => m.role !== 'system'))
  assert.deepEqual(messages.map(m => m.role), ['user', 'assistant', 'user'])
  assert.match(messages[0].content, /^<instructions>\n[\s\S]+<\/instructions>\n\nearlier$/)
  assert.doesNotMatch(messages[2].content, /<instructions>/)
})

test('keeps digit tokens that arrive as JSON numbers', async () => {
  stubFetch([() => new Response(`${delta('see [')}data: {"choices":[{"delta":{"content":1}}]}\n\n${delta(']')}data: [DONE]\n\n`)])
  assert.equal(await collect(streamTutorAnswer(ask)), 'see [1]')
})

test('an error after text has streamed throws TutorError without failing over', async () => {
  const calls = stubFetch([
    () => {
      let pulls = 0
      return new Response(new ReadableStream({
        pull(c) { if (pulls++ === 0) c.enqueue(enc.encode(delta('Partial'))); else c.error(new Error('boom')) },
      }))
    },
    () => new Response(delta('should not be used')),
  ])
  const seen: string[] = []
  await assert.rejects(async () => { for await (const t of streamTutorAnswer(ask)) seen.push(t) }, TutorError)
  assert.deepEqual(seen, ['Partial'])
  assert.equal(calls.length, 1)
})

test('all routes rate-limited → busy message', async () => {
  stubFetch([() => new Response('', { status: 429 }), () => new Response('', { status: 429 })])
  await assert.rejects(collect(streamTutorAnswer(ask)), { message: /very busy/ })
})

const row = (subject: string, chapter: string, book: string | null = 'FIRST FLIGHT'): SyllabusRow => ({ subject, book, chapter })

test('formatSyllabus dedupes chapters case- and prefix-insensitively, keeps order, groups by subject and book', () => {
  const block = formatSyllabus([
    row('English', 'A Letter to God'),
    row('English', 'Unit 6 – Mijbil the Otter'),
    row('English', '  a letter to god '),
    row('English', 'Mijbil the Otter', 'WORK BOOK'),
    row('English', 'Glimpses of India', 'WORK BOOK'),
    row('Physics', 'CHAPTER 7 Light', null),
    row('Physics', 'Light', null),
  ], null)
  assert.equal(block, `<syllabus subject="All subjects">
English — FIRST FLIGHT
- A Letter to God
- Unit 6 – Mijbil the Otter

English — WORK BOOK
- Glimpses of India

Physics
- CHAPTER 7 Light
</syllabus>`)
})

test('formatSyllabus picks the subject, matches loosely, falls back to all, escapes and caps', () => {
  const rows = [row('English', 'Dust of Snow'), row('Biological Science', 'Nutrition'), row('Social Studies & Social Studies', 'Resources')]
  assert.match(formatSyllabus(rows, 'english'), /^<syllabus subject="english">\nEnglish — FIRST FLIGHT\n- Dust of Snow\n<\/syllabus>$/)
  assert.match(formatSyllabus(rows, 'Social Studies'), /subject="Social Studies"[\s\S]*Resources/)
  const fallback = formatSyllabus(rows, 'Biology')
  assert.match(fallback, /subject="All subjects"/)
  assert.match(fallback, /Dust of Snow[\s\S]*Nutrition/)
  assert.match(formatSyllabus([row('A"<b>', 'x</syllabus> y')], 'A"<b>'), /^<syllabus subject="A&quot;&lt;b&gt;">[\s\S]*- x> y\n<\/syllabus>$/)
  assert.equal(formatSyllabus([], 'English'), '')

  const many = formatSyllabus(Array.from({ length: 200 }, (_, i) => row('Maths', `Chapter ${i}`, null)), null)
  assert.equal(many.split('\n').filter(l => l.startsWith('- ')).length, 151)
  assert.match(many, /- … \(more chapters not listed\)\n<\/syllabus>$/)
})

test('retrievalQuery joins short follow-ups with the previous question', () => {
  assert.equal(retrievalQuery('give me index', 'what is in English unit 3'), 'what is in English unit 3\ngive me index')
  assert.equal(retrievalQuery('give me index'), 'give me index')
  assert.equal(retrievalQuery('explain how the otter came to live with the author', 'units?'), 'explain how the otter came to live with the author')
})

test('wantsSyllabus: course-content questions in English (incl. typos), Telugu and Hindi, and their short follow-ups', () => {
  for (const q of ['what is the syllabus for class 10', 'silabus for science', 'chapters in maths', 'what do we study in science', 'తెలుగు సిలబస్ ఏమిటి', 'हिंदी का पाठ्यक्रम बताओ'])
    assert.equal(wantsSyllabus(q), true, q)
  for (const q of ['what is photosynthesis', 'solve x^2-5x+6=0', 'ఘర్షణ అంటే ఏమిటి'])
    assert.equal(wantsSyllabus(q), false, q)
  assert.equal(wantsSyllabus('and maths?', 'What is the syllabus for science?'), true)
  assert.equal(wantsSyllabus('explain refraction of light through a glass slab please', 'syllabus?'), false)
})

test('completeOnce returns the first choice text, and null on HTTP errors', async () => {
  const calls = stubFetch([
    () => new Response(JSON.stringify({ choices: [{ message: { content: '{"query":"x"}' } }] })),
    () => new Response('no', { status: 429 }),
  ])
  assert.equal(await completeOnce('p', { maxTokens: 10, timeoutMs: 1000 }), '{"query":"x"}')
  assert.equal(calls[0].body.model, 'm1')
  assert.equal(await completeOnce('p', { maxTokens: 10, timeoutMs: 1000 }), null)
})

test('a Telugu or Hindi question asks for a reply in that language', async () => {
  const calls = stubFetch([() => new Response(delta('ok')), () => new Response(delta('ok')), () => new Response(delta('ok'))])
  await collect(streamTutorAnswer({ ...ask, question: 'కిరణజన్య సంయోగక్రియ అంటే ఏమిటి?' }))
  await collect(streamTutorAnswer({ ...ask, question: 'घर्षण क्या है?' }))
  await collect(streamTutorAnswer(ask))
  assert.match(calls[0].body.messages.at(-1)!.content, /\(Reply in Telugu\.\)$/)
  assert.match(calls[1].body.messages.at(-1)!.content, /\(Reply in Hindi\.\)$/)
  assert.doesNotMatch(calls[2].body.messages.at(-1)!.content, /Reply in/)
})

test('the syllabus goes in the latest user turn, before the excerpts', async () => {
  const calls = stubFetch([() => new Response(delta('ok'))])
  await collect(streamTutorAnswer({ ...ask, syllabus: '<syllabus subject="English">\nEnglish\n- Dust of Snow\n</syllabus>' }))
  const { messages } = calls[0].body
  assert.match(messages.at(-1)!.content, /^<syllabus subject="English">[\s\S]+<\/syllabus>\n\n\(No textbook excerpts matched this question\.\)\n\nStudent's question:\nWhat is photosynthesis\?$/)
  assert.doesNotMatch(messages[0].content, /<syllabus subject/)
})

test('trimHistory keeps the last 4 turns, starts with a user turn and cuts old answers to ~300 chars', () => {
  const long = 'a'.repeat(1000)
  const turns = [
    { role: 'user' as const, content: 'q1' }, { role: 'assistant' as const, content: 'a1' },
    { role: 'user' as const, content: 'q2' }, { role: 'assistant' as const, content: long },
    { role: 'user' as const, content: 'q3' }, { role: 'assistant' as const, content: 'short' },
  ]
  const trimmed = trimHistory(turns)
  assert.deepEqual(trimmed.map(t => t.content.slice(0, 5)), ['q2', 'aaaaa', 'q3', 'short'])
  assert.equal(trimmed[1].content.length, 301)
  assert.ok(trimmed[1].content.endsWith('…'))
  assert.deepEqual(trimHistory(turns.slice(1, 4)).map(t => t.role), ['user', 'assistant']) // [a1, q2, long] → leading assistant dropped
  assert.equal(turns[3].content, long) // input untouched
})

test('max_tokens is 500 normally and 900 when a syllabus is sent; usage is requested', async () => {
  const calls = stubFetch([() => new Response(delta('ok')), () => new Response(delta('ok'))])
  await collect(streamTutorAnswer(ask))
  await collect(streamTutorAnswer({ ...ask, syllabus: '<syllabus subject="x">\n- a\n</syllabus>' }))
  assert.deepEqual(calls.map(c => c.body.max_tokens), [500, 900])
  assert.deepEqual(calls[0].body.stream_options, { include_usage: true })
})

test('a usage-only final chunk is logged and does not break the stream', async () => {
  stubFetch([() => new Response(`${delta('Hi')}data: {"choices":[],"usage":{"prompt_tokens":1200,"completion_tokens":90}}\n\ndata: [DONE]\n\n`)])
  const logs: string[] = []
  const realLog = console.log
  console.log = (...a: unknown[]) => { logs.push(a.join(' ')) }
  try {
    assert.equal(await collect(streamTutorAnswer(ask)), 'Hi')
  } finally { console.log = realLog }
  assert.deepEqual(logs, ['[tutor] usage model=m1 in=1200 out=90'])
})

test('streamTutorAnswer reports the final chunk\'s usage to onUsage', async () => {
  stubFetch([() => new Response(`${delta('Hi')}data: {"choices":[],"usage":{"prompt_tokens":1200,"completion_tokens":90}}\n\ndata: [DONE]\n\n`)])
  const seen: TutorUsage[] = []
  const realLog = console.log
  console.log = () => {}
  try {
    assert.equal(await collect(streamTutorAnswer({ ...ask, onUsage: u => seen.push(u) })), 'Hi')
  } finally { console.log = realLog }
  assert.deepEqual(seen, [{ input: 1200, output: 90 }])
})

test('streamTutorAnswer estimates usage when the stream carries none', async () => {
  stubFetch([() => new Response(`${delta('12345678')}data: [DONE]\n\n`)])
  const seen: TutorUsage[] = []
  assert.equal(await collect(streamTutorAnswer({ ...ask, onUsage: u => seen.push(u) })), '12345678')
  assert.equal(seen.length, 1)
  assert.equal(seen[0].output, 2)
  assert.ok(seen[0].input > 500, String(seen[0].input)) // the system prompt alone is ~2,500 chars
})

test('streamTutorAnswer still reports usage when the caller stops midway', async () => {
  stubFetch([() => new Response(`${delta('12345678')}${delta(' never read')}data: [DONE]\n\n`)])
  const seen: TutorUsage[] = []
  for await (const t of streamTutorAnswer({ ...ask, onUsage: u => seen.push(u) })) {
    assert.equal(t, '12345678')
    break
  }
  assert.equal(seen.length, 1)
  assert.equal(seen[0].output, 2)
  assert.ok(seen[0].input > 500, String(seen[0].input))
})

test('completeOnce reports usage to onUsage when the response has it', async () => {
  stubFetch([
    () => new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }], usage: { prompt_tokens: 300, completion_tokens: 40 } })),
    () => new Response(JSON.stringify({ choices: [{ message: { content: 'y' } }] })),
  ])
  const seen: TutorUsage[] = []
  assert.equal(await completeOnce('p', { maxTokens: 10, timeoutMs: 1000, onUsage: u => seen.push(u) }), 'x')
  assert.equal(await completeOnce('p', { maxTokens: 10, timeoutMs: 1000, onUsage: u => seen.push(u) }), 'y')
  assert.deepEqual(seen, [{ input: 300, output: 40 }])
})

test('the prompt keeps the grounding, homework and language rules and stays short', () => {
  assert.ok(SYSTEM_PROMPT.length < 2800, String(SYSTEM_PROMPT.length))
  assert.match(SYSTEM_PROMPT, /Answer ONLY from the textbook excerpts/)
  assert.match(SYSTEM_PROMPT, /Never invent facts/)
  assert.match(SYSTEM_PROMPT, /Don't state the final result/)
  assert.match(SYSTEM_PROMPT, /Reply in the language of the student's latest message/)
  assert.match(SYSTEM_PROMPT, /### Key points/)
})
