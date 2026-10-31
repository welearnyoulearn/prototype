// Offline question bank (#470): write the Daily Quiz questions with a model running in a Claude Code session
// instead of the Anthropic API, grounded in the textbook chunks stored for the tutor (material_chunks).
//
//   DATABASE_URL=… npx tsx scripts/quiz-bank-offline.ts export --db-ref <supabase ref> --board AP_SSC --grade 10 --out <dir>
//     [--topics 4] [--per-topic 5] [--passages 4] [--subjects 436,437]
//   → writes <dir>/manifest.json and one <dir>/subject-<id>.prompt.md per subject. A model writes
//     <dir>/subject-<id>.questions.json from each prompt.
//   … blind --out <dir>
//   → writes <dir>/subject-<id>.blind.json (questions without answers). An independent model answers them into
//     <dir>/subject-<id>.answers.json as { "<key>": 0-3 }.
//   … import --db-ref <ref> --out <dir> [--publish]
//   → keeps only questions the checker answered the same way, saves them into quiz_questions, marks each subject
//     ready (and live with --publish unless an admin took it offline). Needs the question-bank tables.
//
// --db-ref must appear in DATABASE_URL, so a command can never run against a database you did not name.
import fs from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'
import { SYSTEM_PROMPT, buildChapterPrompt, fingerprint, spreadAnswerPosition, subjectLanguage } from '../lib/quizBankRules'
import { acceptQuestions, blindItems, parseAnswers, passageQuery, pickTopics } from '../lib/quizBankOffline'

const die = (m: string): never => { console.error(`ERROR: ${m}`); process.exit(1) }
const args = process.argv.slice(3)
const flag = (name: string): string | undefined => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined }
const has = (name: string) => args.includes(`--${name}`)
const outDir = path.resolve(flag('out') ?? die('--out <dir> is required'))
const manifestFile = path.join(outDir, 'manifest.json')

type ManifestTopic = { id: number; name: string; chapter_id: number; chapter_name: string; need: number }
type ManifestSubject = { id: number; name: string; language: string; topics: ManifestTopic[] }
type Manifest = { board: string; grade: string; per_topic: number; subjects: ManifestSubject[] }

async function connect(): Promise<Client> {
  const ref = flag('db-ref') ?? die('--db-ref <project ref> is required')
  const url = process.env.DATABASE_URL ?? die('DATABASE_URL is not set')
  if (!url.includes(ref)) die('DATABASE_URL is not the database named by --db-ref; refusing to run')
  const c = new Client({ connectionString: url, ssl: /supabase\.(co|com)/.test(url) ? { rejectUnauthorized: false } : undefined })
  await c.connect()
  return c
}

const tableExists = async (c: Client, name: string) => (await c.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [`public.${name}`])).rows[0].ok as boolean

async function exportPrompts() {
  const board = flag('board') ?? die('--board is required')
  const grade = flag('grade') ?? die('--grade is required')
  const limit = Number(flag('topics') ?? 4)
  const perTopic = Number(flag('per-topic') ?? 5)
  const passages = Number(flag('passages') ?? 4)
  const only = flag('subjects')?.split(',').map(Number)
  const c = await connect()
  try {
    const haveQuestions = await tableExists(c, 'quiz_questions')
    const haveChunks = await tableExists(c, 'material_chunks')
    const { rows: subjects } = await c.query<{ id: number; subject_name: string; quiz_language: string | null }>(
      `SELECT ms.id, ms.subject_name, to_jsonb(ms)->>'quiz_language' AS quiz_language
       FROM master_subjects ms WHERE ms.board = $1 AND ms.grade = $2 AND ms.category = 'academic' ORDER BY ms.subject_name`, [board, grade])
    fs.mkdirSync(outDir, { recursive: true })
    const manifest: Manifest = { board, grade, per_topic: perTopic, subjects: [] }
    for (const s of subjects) {
      if (only && !only.includes(s.id)) continue
      const { rows } = await c.query(`
        SELECT mt.id, mt.topic_name, mt.subtopics, mt.content_text, mt.topic_order, mc.id AS chapter_id, mc.chapter_name, mc.chapter_order,
               ${haveQuestions ? `(SELECT COUNT(*)::int FROM quiz_questions q WHERE q.master_topic_id = mt.id AND q.status = 'active')` : '0'} AS active
        FROM master_topics mt JOIN master_chapters mc ON mc.id = mt.chapter_id WHERE mc.subject_id = $1`, [s.id])
      const picked = pickTopics(rows.map(r => ({ id: r.id, chapterId: r.chapter_id, chapterOrder: r.chapter_order, topicOrder: r.topic_order, active: r.active })), limit, perTopic)
      if (!picked.length) { console.log(`- ${s.subject_name}: nothing to write`); continue }
      const byId = new Map(rows.map(r => [r.id as number, r]))
      const language = subjectLanguage(s.quiz_language, s.subject_name)
      const chapterIds = [...new Set(picked.map(p => p.chapterId))]
      let md = `# Quiz questions for ${s.subject_name} (${board} Grade ${grade})\n\n## Rules\n\n${SYSTEM_PROMPT}\n\n`
      md += `## Output\n\nWrite ONE JSON file, exactly this shape, and nothing else in it:\n\n\`\`\`json\n{ "topics": [ { "topic_id": 123, "questions": [ { "stem": "…", "options": ["A","B","C","D"], "correct_index": 0, "explanation": "…", "difficulty": "easy" } ] } ] }\n\`\`\`\n\n`
      md += `One entry per topic_id below with exactly the number of questions asked for. Use the textbook passages to make the questions match what the book teaches; use your own knowledge only to fill gaps. Do not copy sentences from the passages into the question stem.\n\n`
      for (const chapterId of chapterIds) {
        const topics = picked.filter(p => p.chapterId === chapterId)
        const first = byId.get(topics[0].id)
        md += `---\n\n${buildChapterPrompt({
          board, grade, subject: s.subject_name, language, chapterName: first.chapter_name, withTextbook: false,
          topics: topics.map(t => {
            const r = byId.get(t.id)
            return {
              topicId: t.id, name: r.topic_name,
              subtopics: Array.isArray(r.subtopics) ? r.subtopics.filter((x: unknown): x is string => typeof x === 'string') : [],
              notes: r.content_text?.trim() ? String(r.content_text).trim().slice(0, 2000) : null,
              need: t.need, existingStems: [],
            }
          }),
        })}\n\n`
        for (const t of topics) {
          const r = byId.get(t.id)
          const query = passageQuery(r.topic_name, r.chapter_name)
          const { rows: chunks } = haveChunks && query
            ? await c.query<{ page: number; content: string }>(
              `SELECT page, content FROM material_chunks WHERE board = $1 AND grade = $2 AND subject = $3 AND tsv @@ to_tsquery('simple', $4)
               ORDER BY ts_rank_cd(tsv, to_tsquery('simple', $4)) DESC LIMIT $5`, [board, grade, s.subject_name, query, passages])
            : { rows: [] as { page: number; content: string }[] }
          md += `### Textbook passages for topic_id ${t.id} "${r.topic_name}"\n\n`
          md += chunks.length ? chunks.map((ch, i) => `${i + 1}. (page ${ch.page}) ${ch.content.replace(/\s+/g, ' ').trim().slice(0, 1200)}`).join('\n\n') : '(none found: use the standard syllabus for this topic)'
          md += '\n\n'
        }
      }
      fs.writeFileSync(path.join(outDir, `subject-${s.id}.prompt.md`), md)
      manifest.subjects.push({
        id: s.id, name: s.subject_name, language,
        topics: picked.map(p => ({ id: p.id, name: byId.get(p.id).topic_name, chapter_id: p.chapterId, chapter_name: byId.get(p.id).chapter_name, need: p.need })),
      })
      console.log(`- ${s.subject_name}: ${picked.length} topics, ${picked.reduce((n, p) => n + p.need, 0)} questions to write`)
    }
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2))
    console.log(`manifest + ${manifest.subjects.length} prompt file(s) in ${outDir}`)
  } finally { await c.end() }
}

const readManifest = (): Manifest => JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as Manifest
const readJson = (file: string): unknown => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null)

function blind() {
  const m = readManifest()
  for (const s of m.subjects) {
    const out = readJson(path.join(outDir, `subject-${s.id}.questions.json`))
    if (!out) { console.log(`- ${s.name}: no questions file yet`); continue }
    const items = blindItems(out, new Set(s.topics.map(t => t.id)))
    fs.writeFileSync(path.join(outDir, `subject-${s.id}.blind.json`), JSON.stringify(items, null, 1))
    console.log(`- ${s.name}: ${items.length} questions to check`)
  }
}

async function importQuestions() {
  const m = readManifest()
  const publish = has('publish')
  const c = await connect()
  try {
    if (!await tableExists(c, 'quiz_questions') || !await tableExists(c, 'quiz_bank_subjects')) die('the question-bank tables do not exist in this database')
    const rows: Record<string, string | number>[] = []
    for (const s of m.subjects) {
      const out = readJson(path.join(outDir, `subject-${s.id}.questions.json`))
      if (!out) { console.log(`- ${s.name}: no questions file, skipped`); continue }
      const answersRaw = readJson(path.join(outDir, `subject-${s.id}.answers.json`))
      if (!answersRaw && !has('no-check')) { console.log(`- ${s.name}: no checker answers, skipped (use --no-check to load unchecked)`); continue }
      const ids = new Set(s.topics.map(t => t.id))
      const { rows: fps } = await c.query<{ fingerprint: string }>(`SELECT fingerprint FROM quiz_questions WHERE master_topic_id = ANY($1::int[])`, [[...ids]])
      const r = acceptQuestions(out, ids, new Set(fps.map(f => f.fingerprint)), answersRaw ? parseAnswers(answersRaw) : null)
      let saved = 0
      await c.query('BEGIN')
      try {
        for (const [topicId, drafts] of r.byTopic) {
          for (const raw of drafts) {
            const d = spreadAnswerPosition(raw)
            const res = await c.query(`
              INSERT INTO quiz_questions (master_subject_id, master_topic_id, language, stem, options, correct_index, explanation, difficulty, source, fingerprint)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ai', $9)
              ON CONFLICT (master_topic_id, fingerprint) WHERE master_topic_id IS NOT NULL DO NOTHING`,
            [s.id, topicId, s.language, d.stem, JSON.stringify(d.options), d.correct_index, d.explanation, d.difficulty, fingerprint(d.stem)])
            saved += res.rowCount ?? 0
          }
        }
        await c.query(`INSERT INTO quiz_bank_subjects (master_subject_id, status) VALUES ($1, 'ready')
                       ON CONFLICT (master_subject_id) DO UPDATE SET status = 'ready', last_error = NULL, updated_at = NOW()`, [s.id])
        if (publish) await c.query(`UPDATE quiz_bank_subjects SET published_at = COALESCE(published_at, NOW()), updated_at = NOW() WHERE master_subject_id = $1 AND unpublished_at IS NULL`, [s.id])
        await c.query('COMMIT')
      } catch (err) { await c.query('ROLLBACK'); throw err }
      rows.push({ subject: s.name, written: r.written, valid: r.valid, agreed: r.agreed, saved })
    }
    console.table(rows)
  } finally { await c.end() }
}

const cmd = process.argv[2]
if (cmd === 'export') void exportPrompts().catch(e => die(e instanceof Error ? e.message : String(e)))
else if (cmd === 'blind') blind()
else if (cmd === 'import') void importQuestions().catch(e => die(e instanceof Error ? e.message : String(e)))
else die('usage: quiz-bank-offline.ts export|blind|import --out <dir> …  (see the header of this file)')
