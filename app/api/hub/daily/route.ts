import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { ensureDB } from '@/lib/db'

const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

type GKQuestion    = { q: string; options: string[]; answer: number }
type FactMythItem  = { statement: string; answer: boolean; explanation: string }
type ReadingPassage = { passage: string; questions: { q: string; options: string[]; answer: number }[] }
type WritingPrompt  = { prompt: string; theme: string }
type SpeakingSentence = { sentence: string; topic: string }

// ── Word of Day list (lower classes) ─────────────────────────────────────────
const WORDS = [
  { word: 'Perseverance', pronunciation: 'per-suh-VEE-rence', meaning: 'Continued effort to do something despite difficulty or failure', example: 'Her perseverance in practicing daily helped her win the competition.' },
  { word: 'Eloquent', pronunciation: 'EL-oh-kwent', meaning: 'Fluent and persuasive in speaking or writing', example: 'The student gave an eloquent speech that inspired the whole class.' },
  { word: 'Tenacious', pronunciation: 'teh-NAY-shus', meaning: 'Holding on firmly; not giving up easily', example: 'He was tenacious in his effort to solve the difficult problem.' },
  { word: 'Diligent', pronunciation: 'DIL-ih-jent', meaning: 'Having or showing care and effort in work', example: 'The diligent student always finished her assignments on time.' },
  { word: 'Versatile', pronunciation: 'VER-suh-til', meaning: 'Able to do many different things or adapt to many situations', example: 'She is a versatile athlete who plays both cricket and badminton.' },
  { word: 'Resilient', pronunciation: 'reh-ZIL-ee-ent', meaning: 'Able to recover quickly from difficulties', example: 'Despite failing the test, he was resilient and studied harder next time.' },
  { word: 'Inquisitive', pronunciation: 'in-KWIZ-ih-tiv', meaning: 'Curious; eager to learn or know things', example: 'An inquisitive student always asks questions to understand better.' },
  { word: 'Meticulous', pronunciation: 'meh-TIK-yoo-lus', meaning: 'Very careful and precise about details', example: 'She was meticulous in checking every answer before submitting her paper.' },
  { word: 'Ambiguous', pronunciation: 'am-BIG-yoo-us', meaning: 'Having more than one possible meaning; unclear', example: 'The teacher asked the student to clarify his ambiguous answer.' },
  { word: 'Benevolent', pronunciation: 'beh-NEV-oh-lent', meaning: 'Kind and generous; wishing good for others', example: 'The benevolent principal helped students who could not afford school supplies.' },
  { word: 'Candid', pronunciation: 'KAN-did', meaning: 'Truthful and straightforward; frank', example: 'She gave a candid answer about why she had not done her homework.' },
  { word: 'Deduce', pronunciation: 'deh-DYOOS', meaning: 'Arrive at a conclusion by reasoning', example: 'From the clues, he could deduce who had solved the mystery.' },
  { word: 'Empathy', pronunciation: 'EM-puh-thee', meaning: 'The ability to understand and share the feelings of another', example: 'Showing empathy, she comforted her friend when he was upset.' },
  { word: 'Frugal', pronunciation: 'FROO-gul', meaning: 'Careful not to waste money or resources', example: 'By being frugal with pocket money, she saved enough to buy a book.' },
  { word: 'Gracious', pronunciation: 'GRAY-shus', meaning: 'Courteous, kind, and pleasant', example: 'The gracious student thanked her teacher for the extra help.' },
  { word: 'Hypothesis', pronunciation: 'hy-POTH-eh-sis', meaning: 'An idea or explanation tested through experiment', example: 'The scientist formed a hypothesis and conducted experiments to test it.' },
  { word: 'Integrity', pronunciation: 'in-TEG-rih-tee', meaning: 'The quality of being honest and having strong moral principles', example: 'A person of integrity does the right thing even when no one is watching.' },
  { word: 'Jovial', pronunciation: 'JOH-vee-ul', meaning: 'Cheerful and friendly', example: 'The jovial teacher made every class fun and interesting.' },
  { word: 'Keen', pronunciation: 'KEEN', meaning: 'Having an eager interest; enthusiastic', example: 'She was keen to learn new things and read every book she could find.' },
  { word: 'Lucid', pronunciation: 'LOO-sid', meaning: 'Clear and easy to understand', example: 'His lucid explanation helped everyone understand the difficult topic.' },
  { word: 'Manifest', pronunciation: 'MAN-ih-fest', meaning: 'To clearly show or demonstrate', example: 'His hard work will manifest in excellent exam results.' },
  { word: 'Nimble', pronunciation: 'NIM-bul', meaning: 'Quick and light in movement; agile', example: 'The nimble player dodged all the opponents and scored a goal.' },
  { word: 'Optimist', pronunciation: 'OP-tih-mist', meaning: 'A person who always expects good things to happen', example: 'An optimist believes that every challenge brings an opportunity.' },
  { word: 'Prudent', pronunciation: 'PROO-dent', meaning: 'Wise and careful in practical matters', example: 'It was prudent to review the notes before the examination.' },
  { word: 'Quirky', pronunciation: 'KWER-kee', meaning: 'Having unusual or unexpected traits', example: 'Her quirky ideas often led to the most creative project solutions.' },
  { word: 'Radiant', pronunciation: 'RAY-dee-ent', meaning: 'Sending out light; looking very happy', example: 'She was radiant with joy when she received her award.' },
  { word: 'Sincere', pronunciation: 'sin-SEER', meaning: 'Genuine; not pretending', example: 'He gave a sincere apology and promised to behave better.' },
  { word: 'Tactful', pronunciation: 'TAKT-ful', meaning: 'Careful not to offend or upset others', example: 'A tactful person thinks before speaking so as not to hurt feelings.' },
  { word: 'Unique', pronunciation: 'yoo-NEEK', meaning: 'Being the only one of its kind; very special', example: 'Every student fingerprint is unique — no two are the same.' },
  { word: 'Vivid', pronunciation: 'VIV-id', meaning: 'Producing powerful mental images; bright and clear', example: 'She wrote a vivid description of her summer holiday.' },
  { word: 'Wistful', pronunciation: 'WIST-ful', meaning: 'Having a feeling of longing for something past', example: 'He felt wistful as he looked at old photos from his first day of school.' },
  { word: 'Zealous', pronunciation: 'ZEL-us', meaning: 'Very enthusiastic and determined', example: 'She was zealous about studying and never missed a single class.' },
  { word: 'Abundant', pronunciation: 'uh-BUN-dent', meaning: 'More than enough; plentiful', example: 'The library had an abundant supply of books on every topic.' },
  { word: 'Baffled', pronunciation: 'BAF-uld', meaning: 'Completely confused', example: 'He was baffled by the tricky riddle until he read it carefully.' },
  { word: 'Composed', pronunciation: 'com-POZED', meaning: 'Calm and in control of your feelings', example: 'Despite the pressure, she remained composed during the interview.' },
  { word: 'Deliberate', pronunciation: 'deh-LIB-er-it', meaning: 'Done consciously and intentionally', example: 'Every deliberate practice session improved his skill.' },
  { word: 'Elaborate', pronunciation: 'ih-LAB-er-it', meaning: 'Involving many careful details; complex', example: 'She made an elaborate chart to explain the water cycle.' },
  { word: 'Fervent', pronunciation: 'FER-vent', meaning: 'Very enthusiastic and passionate', example: 'She was a fervent reader who finished two books every week.' },
  { word: 'Genuine', pronunciation: 'JEN-yoo-in', meaning: 'Truly what it appears to be; real', example: 'His genuine interest in science led him to join the robotics club.' },
  { word: 'Humble', pronunciation: 'HUM-bul', meaning: 'Not thinking of yourself as better than others', example: 'The topper was humble about his success and helped other students.' },
  { word: 'Immense', pronunciation: 'ih-MENS', meaning: 'Extremely large or great', example: 'The student felt immense pride when she won the science fair.' },
  { word: 'Jubilant', pronunciation: 'JOO-bih-lunt', meaning: 'Feeling or expressing great happiness', example: 'The whole school was jubilant when their team won the championship.' },
  { word: 'Kindle', pronunciation: 'KIN-dul', meaning: 'To start a fire; to arouse a feeling', example: 'A good teacher can kindle a love of learning in every student.' },
  { word: 'Lofty', pronunciation: 'LAWF-tee', meaning: 'High; noble or grand in aims', example: 'She had lofty goals of becoming a doctor one day.' },
  { word: 'Marvellous', pronunciation: 'MAR-veh-lus', meaning: 'Causing great wonder; extraordinary', example: 'The marvellous experiment amazed everyone in the science lab.' },
  { word: 'Noble', pronunciation: 'NOH-bul', meaning: 'Having high moral qualities; grand', example: 'It was noble of him to share his lunch with a classmate who had none.' },
  { word: 'Overcome', pronunciation: 'oh-ver-KUM', meaning: 'To succeed in dealing with a problem', example: 'She worked hard to overcome her fear of speaking in public.' },
  { word: 'Patience', pronunciation: 'PAY-shens', meaning: 'The ability to wait calmly; tolerance', example: 'With patience, even the most difficult sums can be solved.' },
  { word: 'Quest', pronunciation: 'KWEST', meaning: 'A long search for something important', example: 'His quest for knowledge led him to read books every single day.' },
  { word: 'Resolve', pronunciation: 'reh-ZOLV', meaning: 'To settle a problem; firm determination', example: 'She resolved to study harder after her poor performance in the exam.' },
  { word: 'Steadfast', pronunciation: 'STED-fast', meaning: 'Firm and unwavering; loyal', example: 'He was steadfast in his decision to complete the project no matter what.' },
  { word: 'Tranquil', pronunciation: 'TRAN-kwil', meaning: 'Calm, peaceful, and quiet', example: 'She needed a tranquil environment to focus on her studies.' },
  { word: 'Valor', pronunciation: 'VAL-er', meaning: 'Great courage, especially in battle', example: 'The valor of freedom fighters inspires us to work hard for our country.' },
  { word: 'Wisdom', pronunciation: 'WIZ-dum', meaning: 'The ability to make good decisions based on knowledge and experience', example: 'Reading widely helps develop wisdom beyond just textbook knowledge.' },
  { word: 'Yearn', pronunciation: 'YERN', meaning: 'To have a strong desire for something', example: 'She yearned to visit the science museum and learn about space.' },
  { word: 'Zeal', pronunciation: 'ZEEL', meaning: 'Great energy or enthusiasm for a cause', example: 'Her zeal for mathematics made her practice problems every evening.' },
  { word: 'Admirable', pronunciation: 'AD-mer-uh-bul', meaning: 'Deserving respect and approval', example: 'It was admirable that she helped the new student settle into school.' },
  { word: 'Brilliant', pronunciation: 'BRIL-yent', meaning: 'Very intelligent or talented; very bright', example: 'She came up with a brilliant idea for the school science project.' },
  { word: 'Courageous', pronunciation: 'kuh-RAY-jus', meaning: 'Not deterred by danger or pain; brave', example: 'It was courageous of him to stand up for his friend when others teased him.' },
  { word: 'Dynamic', pronunciation: 'dy-NAM-ik', meaning: 'Energetic and full of new ideas', example: 'The dynamic class captain motivated everyone to participate.' },
  { word: 'Earnest', pronunciation: 'ER-nest', meaning: 'Serious and sincere in intention', example: 'Her earnest effort in every subject earned her top marks.' },
]

// ── Fallback content ──────────────────────────────────────────────────────────
const FALLBACK_GK: GKQuestion[] = [
  { q: 'What is the capital of India?', options: ['Mumbai', 'New Delhi', 'Kolkata', 'Chennai'], answer: 1 },
  { q: 'Which planet is known as the Red Planet?', options: ['Venus', 'Jupiter', 'Mars', 'Saturn'], answer: 2 },
  { q: 'What is the largest ocean on Earth?', options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], answer: 3 },
  { q: 'Who wrote the national anthem of India?', options: ['Bankim Chandra', 'Rabindranath Tagore', 'Mahatma Gandhi', 'Jawaharlal Nehru'], answer: 1 },
  { q: 'How many sides does a hexagon have?', options: ['5', '6', '7', '8'], answer: 1 },
]

const FALLBACK_RIDDLE = {
  riddle: 'I have hands but cannot clap. I have a face but no eyes, nose or mouth. What am I?',
  answer: 'A clock',
  hint: 'It tells you something important every minute.',
}

const FALLBACK_FACT_MYTH: FactMythItem[] = [
  { statement: 'Lightning never strikes the same place twice.', answer: false, explanation: 'Lightning can and does strike the same place multiple times — tall buildings are struck repeatedly.' },
  { statement: 'A day on Venus is longer than a year on Venus.', answer: true, explanation: 'Venus rotates so slowly that it takes 243 Earth days to spin once, but only 225 Earth days to orbit the Sun.' },
  { statement: 'Water always boils at 100°C.', answer: false, explanation: 'Water boils at lower temperatures at higher altitudes due to lower atmospheric pressure.' },
  { statement: 'The Great Wall of China is visible from space with the naked eye.', answer: false, explanation: 'This is a common myth. Astronauts confirm it is too narrow to be seen from space without aid.' },
  { statement: 'Honey never spoils — archaeologists found 3000-year-old honey still edible.', answer: true, explanation: 'Honey\'s low moisture and natural acidity prevent bacterial growth, making it last indefinitely.' },
  { statement: 'India has the most number of post offices in the world.', answer: true, explanation: 'India has over 1.5 lakh post offices — the largest postal network in the world.' },
  { statement: 'Sound travels faster than light.', answer: false, explanation: 'Light travels at 3×10⁸ m/s while sound travels at only ~343 m/s in air.' },
  { statement: 'Bamboo is the fastest growing plant in the world.', answer: true, explanation: 'Some bamboo species can grow up to 90 cm in a single day.' },
  { statement: 'Humans use only 10% of their brain.', answer: false, explanation: 'Brain imaging shows we use virtually all parts of the brain, and most of it is active almost all the time.' },
  { statement: 'The Sun is a star, not a planet.', answer: true, explanation: 'The Sun is a medium-sized star at the center of our solar system.' },
]

const FALLBACK_DEBATE = {
  statement: 'Mobile phones should be completely banned in schools.',
  context: 'Mobile phones are increasingly common among school students and can both help learning and cause distractions.',
}

const FALLBACK_CHALLENGE = {
  problem: 'A train 300 m long passes a stationary pole in 15 seconds. What is the speed of the train in km/h?',
  answer: '72',
  explanation: 'Speed = Distance / Time = 300 / 15 = 20 m/s. Convert to km/h: 20 × (18/5) = 72 km/h.',
}

const FALLBACK_READING: ReadingPassage = {
  passage: 'The Amazon rainforest, often called the "lungs of the Earth," produces about 20% of the world\'s oxygen. Spanning nine countries in South America, it is home to more than 10% of all species on Earth. The Amazon River, which flows through this vast forest, is the world\'s largest river by water volume. Indigenous communities have lived in harmony with this ecosystem for thousands of years. However, deforestation driven by agriculture, logging, and mining has destroyed millions of hectares of this irreplaceable forest. Scientists warn that if deforestation continues at the current rate, the Amazon could lose its ability to generate its own rainfall, turning into a dry savanna within decades. Protecting the Amazon is not just a regional concern — it is critical for regulating the global climate and preserving biodiversity for future generations.',
  questions: [
    { q: 'Why is the Amazon rainforest called the "lungs of the Earth"?', options: ['It absorbs carbon dioxide', 'It produces 20% of the world\'s oxygen', 'It is the largest forest', 'It contains the most rivers'], answer: 1 },
    { q: 'How many countries does the Amazon rainforest span?', options: ['5', '7', '9', '12'], answer: 2 },
    { q: 'What percentage of Earth\'s species live in the Amazon?', options: ['5%', '10%', '15%', '20%'], answer: 1 },
    { q: 'What is the main threat to the Amazon rainforest?', options: ['Floods', 'Earthquakes', 'Deforestation', 'Pollution'], answer: 2 },
    { q: 'What could happen if deforestation continues at the current rate?', options: ['The forest could become a desert', 'The forest could turn into a savanna', 'The river could dry up', 'The oxygen level could rise'], answer: 1 },
  ],
}

const FALLBACK_WRITING: WritingPrompt = {
  prompt: 'Imagine you discovered a small island that no one knows about. Describe what you would find there and what you would do.',
  theme: 'Adventure & Imagination',
}

const FALLBACK_SPEAKING: SpeakingSentence[] = [
  { sentence: 'Education is the most powerful weapon which you can use to change the world.', topic: 'Education' },
  { sentence: 'The greatest glory in living lies not in never falling, but in rising every time we fall.', topic: 'Perseverance' },
  { sentence: 'Science and technology are transforming every aspect of human life at an extraordinary pace.', topic: 'Technology' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function getDayOfYear(): number {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  return Math.floor((now.getTime() - start.getTime()) / 86400000)
}

async function groq(prompt: string, maxTokens = 900): Promise<string> {
  if (!process.env.GROQ_API_KEY) return ''
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.75,
      max_tokens: maxTokens,
    }),
  })
  const data = await res.json()
  return data.choices?.[0]?.message?.content?.trim() ?? ''
}

function parseJSON<T>(text: string, arrayMatch = false): T | null {
  try {
    const pattern = arrayMatch ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/
    const match = text.match(pattern)
    if (match) return JSON.parse(match[0]) as T
  } catch { /* fall through */ }
  return null
}

async function generateGKQuestions(): Promise<GKQuestion[]> {
  try {
    const text = await groq(
      'Generate 5 general knowledge quiz questions for school students aged 10-16 in India. Mix topics: current affairs, science, history, geography, sports. Return ONLY a JSON array, no other text: [{"q":"...","options":["A","B","C","D"],"answer":0}] where answer is the 0-based index of the correct option.'
    )
    const parsed = parseJSON<GKQuestion[]>(text, true)
    if (Array.isArray(parsed) && parsed.length >= 5) return parsed.slice(0, 5)
  } catch { /* fall through */ }
  return FALLBACK_GK
}

async function generateRiddle() {
  try {
    const text = await groq(
      'Generate one clever riddle for school students aged 11-17. It should be logical, fun, and solvable. Return ONLY JSON: {"riddle":"...","answer":"...","hint":"..."}'
    )
    const parsed = parseJSON<typeof FALLBACK_RIDDLE>(text)
    if (parsed?.riddle && parsed?.answer) return parsed
  } catch { /* fall through */ }
  return FALLBACK_RIDDLE
}

async function generateFactMyth(): Promise<FactMythItem[]> {
  try {
    const text = await groq(
      'Generate 10 True or False statements for school students aged 11-17 in India. Mix science, history, geography, technology, sports. Make them interesting and surprising — not too obvious. Return ONLY a JSON array: [{"statement":"...","answer":true,"explanation":"..."}]',
      1200
    )
    const parsed = parseJSON<FactMythItem[]>(text, true)
    if (Array.isArray(parsed) && parsed.length >= 8) return parsed.slice(0, 10)
  } catch { /* fall through */ }
  return FALLBACK_FACT_MYTH
}

async function generateDebate() {
  try {
    const text = await groq(
      'Give one thought-provoking debate topic for school students aged 11-17 in India. It should be relevant, engaging and have valid arguments on both sides. Return ONLY JSON: {"statement":"...","context":"...one sentence of context..."}'
    )
    const parsed = parseJSON<typeof FALLBACK_DEBATE>(text)
    if (parsed?.statement) return parsed
  } catch { /* fall through */ }
  return FALLBACK_DEBATE
}

async function generateChallenge() {
  try {
    const text = await groq(
      'Generate one challenging math or science problem for Indian school students in grades 8-10. It should require real thinking but be solvable with school knowledge. Include a clear numerical or one-word answer. Return ONLY JSON: {"problem":"...","answer":"...","explanation":"...step by step..."}'
    )
    const parsed = parseJSON<typeof FALLBACK_CHALLENGE>(text)
    if (parsed?.problem && parsed?.answer) return parsed
  } catch { /* fall through */ }
  return FALLBACK_CHALLENGE
}

async function generateReadingPassage(): Promise<ReadingPassage> {
  try {
    const text = await groq(
      'Generate a short reading comprehension passage (160-200 words) for Indian school students aged 11-17, on any educational topic (nature, science, history, sports, or technology). Then write 5 multiple-choice questions based ONLY on the passage. Return ONLY valid JSON: {"passage":"...","questions":[{"q":"...","options":["A","B","C","D"],"answer":0}]} where answer is the 0-based index of the correct option.',
      1200
    )
    const parsed = parseJSON<ReadingPassage>(text)
    if (parsed?.passage && Array.isArray(parsed?.questions) && parsed.questions.length >= 4) return parsed
  } catch { /* fall through */ }
  return FALLBACK_READING
}

async function generateWritingPrompt(): Promise<WritingPrompt> {
  try {
    const text = await groq(
      'Generate one creative writing prompt for school students aged 11-17 in India. It should spark imagination and be open-ended. Return ONLY JSON: {"prompt":"...","theme":"...one or two words describing the theme..."}'
    )
    const parsed = parseJSON<WritingPrompt>(text)
    if (parsed?.prompt) return parsed
  } catch { /* fall through */ }
  return FALLBACK_WRITING
}

async function generateSpeakingSentences(): Promise<SpeakingSentence[]> {
  try {
    const text = await groq(
      'Generate 3 English speaking practice sentences for school students aged 11-17 in India. Each should be an inspiring or educational sentence, 15-25 words long, clearly pronounceable. Return ONLY a JSON array: [{"sentence":"...","topic":"..."}]',
      400
    )
    const parsed = parseJSON<SpeakingSentence[]>(text, true)
    if (Array.isArray(parsed) && parsed.length >= 2) return parsed.slice(0, 3)
  } catch { /* fall through */ }
  return FALLBACK_SPEAKING
}

// ── GET /api/hub/daily?student_id=X&school_id=Y&grade=Z ──────────────────────
export async function GET(req: NextRequest) {
  await ensureDB()
  const sp         = req.nextUrl.searchParams
  const student_id = sp.get('student_id')
  const school_id  = sp.get('school_id')
  const grade      = parseInt(sp.get('grade') ?? '1')

  if (!student_id || !school_id)
    return NextResponse.json({ error: 'student_id and school_id required' }, { status: 400 })

  const today      = new Date().toISOString().slice(0, 10)
  const isHighGrade = grade >= 6

  try {
    let { rows: [cached] } = await pool.query(
      `SELECT * FROM hub_daily_content WHERE content_date = $1`,
      [today]
    )

    if (!cached) {
      // First access of the day — generate everything in parallel
      const dayIdx  = getDayOfYear()
      const word    = WORDS[dayIdx % WORDS.length]
      const [gkQs, riddle, factMyth, debate, challenge, reading, writing, speaking] = await Promise.all([
        generateGKQuestions(),
        generateRiddle(),
        generateFactMyth(),
        generateDebate(),
        generateChallenge(),
        generateReadingPassage(),
        generateWritingPrompt(),
        generateSpeakingSentences(),
      ])

      const { rows: [row] } = await pool.query(
        `INSERT INTO hub_daily_content
           (content_date, gk_questions, word_of_day, riddle, fact_myth_questions, debate_statement, challenge_problem, reading_passage, writing_prompt, speaking_sentences)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (content_date) DO UPDATE
           SET gk_questions        = EXCLUDED.gk_questions,
               word_of_day         = EXCLUDED.word_of_day,
               riddle              = EXCLUDED.riddle,
               fact_myth_questions = EXCLUDED.fact_myth_questions,
               debate_statement    = EXCLUDED.debate_statement,
               challenge_problem   = EXCLUDED.challenge_problem,
               reading_passage     = EXCLUDED.reading_passage,
               writing_prompt      = EXCLUDED.writing_prompt,
               speaking_sentences  = EXCLUDED.speaking_sentences
         RETURNING *`,
        [today, JSON.stringify(gkQs), JSON.stringify(word),
         JSON.stringify(riddle), JSON.stringify(factMyth),
         JSON.stringify(debate), JSON.stringify(challenge),
         JSON.stringify(reading), JSON.stringify(writing), JSON.stringify(speaking)]
      )
      cached = row
    } else if (isHighGrade && !cached.riddle) {
      // Cached from a lower-grade first access — backfill higher-class content
      const [riddle, factMyth, debate, challenge, reading, writing, speaking] = await Promise.all([
        generateRiddle(), generateFactMyth(), generateDebate(), generateChallenge(),
        generateReadingPassage(), generateWritingPrompt(), generateSpeakingSentences(),
      ])
      const { rows: [row] } = await pool.query(
        `UPDATE hub_daily_content
         SET riddle = $1, fact_myth_questions = $2, debate_statement = $3, challenge_problem = $4,
             reading_passage = $5, writing_prompt = $6, speaking_sentences = $7
         WHERE content_date = $8 RETURNING *`,
        [JSON.stringify(riddle), JSON.stringify(factMyth),
         JSON.stringify(debate), JSON.stringify(challenge),
         JSON.stringify(reading), JSON.stringify(writing), JSON.stringify(speaking), today]
      )
      cached = row
    } else if (isHighGrade && !cached.reading_passage) {
      // High-grade content exists but phase-6 content missing — backfill
      const [reading, writing, speaking] = await Promise.all([
        generateReadingPassage(), generateWritingPrompt(), generateSpeakingSentences(),
      ])
      const { rows: [row] } = await pool.query(
        `UPDATE hub_daily_content
         SET reading_passage = $1, writing_prompt = $2, speaking_sentences = $3
         WHERE content_date = $4 RETURNING *`,
        [JSON.stringify(reading), JSON.stringify(writing), JSON.stringify(speaking), today]
      )
      cached = row
    }

    // Today's completions
    const { rows: completionRows } = await pool.query(
      `SELECT activity_type, points_earned FROM student_hub_completions
       WHERE student_id = $1 AND completed_date = $2`,
      [student_id, today]
    )
    const completions: Record<string, { done: boolean; points: number }> = {}
    for (const r of completionRows) completions[r.activity_type] = { done: true, points: r.points_earned }

    return NextResponse.json({
      gk_questions:        cached.gk_questions,
      word_of_day:         cached.word_of_day,
      riddle:              cached.riddle,
      fact_myth_questions: cached.fact_myth_questions,
      debate_statement:    cached.debate_statement,
      challenge_problem:   cached.challenge_problem,
      reading_passage:     cached.reading_passage,
      writing_prompt:      cached.writing_prompt,
      speaking_sentences:  cached.speaking_sentences,
      completions,
    })
  } catch (err) {
    console.error('hub/daily error:', err)
    return NextResponse.json({ error: 'Failed to load hub content' }, { status: 500 })
  }
}
