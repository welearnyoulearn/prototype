// Reads what Wikipedia and Wikidata send for the student search card: extra pictures and a few facts. Pure.

export type Picture = { src: string; caption: string; page: string }
export type FactValue = { text: string } | { item: string }
export type Fact = { label: string; values: FactValue[] }

const MAX_PICTURES = 4
const MAX_FACTS = 6

const record = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null ? value as Record<string, unknown> : {})
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const string = (value: unknown): string => (typeof value === 'string' ? value : '')

// SafeSearch does not cover Wikipedia. On topics like these only the text is shown, never pictures. A word list
// cannot recognise what is IN a picture, so this lowers the risk and does not remove it.
const NO_PICTURES = /\b(sex\w*|reproducti\w*|puberty|penis|vagina|vulva|breasts?|testic\w*|genital\w*|nud(e|ity|ism)|naked|anatomy|childbirth|pregnan\w*|porn\w*|erotic\w*|prostitut\w*|rape|torture|massacre|genocide|holocaust|execution|murder\w*|suicide|corpses?|autopsy|injur(y|ies)|wounds?|disease|infection|war)\b|శృంగార|లైంగిక|నగ్న|यौन|नग्न|बलात्कार|हत्या/i

// Only the title and opening paragraph are judged: they say what an article is about, while later paragraphs mention
// such words in passing (the article on cars speaks of injuries and a world war).
/** False when an article's title or opening suggests its pictures may not suit a school search. */
export const picturesAllowed = (title: string, opening: string) => !NO_PICTURES.test(`${title} ${opening}`)

/** Up to four more pictures, in article order, from Wikipedia's media list. The first (lead) picture is left out. */
export function readPictures(reply: unknown, wiki: string): Picture[] {
  const pictures: Picture[] = []
  for (const item of list(record(reply).items).map(record)) {
    if (item.type !== 'image' || item.showInGallery !== true || item.leadImage === true) continue
    const title = string(item.title)
    const source = string(record(list(item.srcset)[0]).src)
    const src = source.startsWith('//') ? `https:${source}` : source
    // Only pictures served by Wikimedia.
    if (!title || !/^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(src)) continue
    const caption = string(record(item.caption).text).replace(/\s+/g, ' ').trim()
    if (NO_PICTURES.test(`${title.replace(/[_.-]/g, ' ')} ${caption}`)) continue
    pictures.push({ src, caption, page: `${wiki}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}` })
    if (pictures.length === MAX_PICTURES) break
  }
  return pictures
}

type Kind = 'item' | 'items' | 'quantity' | 'date' | 'text'
// The facts a student is likely to want, in the order shown. Anything else in Wikidata is ignored.
const FACTS: readonly { property: string; label: string; kind: Kind }[] = [
  { property: 'P36', label: 'Capital', kind: 'item' },
  { property: 'P1082', label: 'Population', kind: 'quantity' },
  { property: 'P2046', label: 'Area', kind: 'quantity' },
  { property: 'P37', label: 'Official language', kind: 'items' },
  { property: 'P38', label: 'Money', kind: 'items' },
  { property: 'P30', label: 'Continent', kind: 'items' },
  { property: 'P17', label: 'Country', kind: 'item' },
  { property: 'P569', label: 'Born', kind: 'date' },
  { property: 'P570', label: 'Died', kind: 'date' },
  { property: 'P27', label: 'Citizen of', kind: 'items' },
  { property: 'P106', label: 'Work', kind: 'items' },
  { property: 'P571', label: 'Started', kind: 'date' },
  { property: 'P246', label: 'Chemical symbol', kind: 'text' },
  { property: 'P1086', label: 'Atomic number', kind: 'quantity' },
  { property: 'P274', label: 'Chemical formula', kind: 'text' },
  { property: 'P225', label: 'Scientific name', kind: 'text' },
  { property: 'P2044', label: 'Height above sea level', kind: 'quantity' },
  { property: 'P2043', label: 'Length', kind: 'quantity' },
]

// A number is shown only when its unit is one of these ("1" = a plain count).
const UNITS: Record<string, string> = { '1': '', Q712226: ' km²', Q828224: ' km', Q11573: ' m' }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function date(value: unknown): string | null {
  const { time, precision } = record(value)
  const parts = string(time).match(/^([+-])0*(\d+)-(\d\d)-(\d\d)T/)
  if (!parts || typeof precision !== 'number' || precision < 9) return null // vaguer than a year
  const [, sign, year, month, day] = parts
  const era = sign === '-' ? ' BC' : ''
  const name = MONTHS[Number(month) - 1]
  if (precision >= 11 && name && Number(day)) return `${Number(day)} ${name} ${year}${era}`
  if (precision === 10 && name) return `${name} ${year}${era}`
  return `${year}${era}`
}

const statementValue = (statement: unknown) => record(record(record(statement).mainsnak).datavalue).value
const pointInTime = (statement: unknown) => string(record(record(record(list(record(record(statement).qualifiers).P585)[0]).datavalue).value).time)

/** The statements to believe: those marked preferred, otherwise every one not marked wrong. Past ones are dropped. */
function current(statements: unknown[]): unknown[] {
  const usable = statements.filter(s => record(s).rank !== 'deprecated' && !list(record(record(s).qualifiers).P582).length)
  const preferred = usable.filter(s => record(s).rank === 'preferred')
  return preferred.length ? preferred : usable
}

function factValues(statements: unknown[], kind: Kind): FactValue[] {
  if (kind === 'item' || kind === 'items') {
    return statements.map(s => string(record(statementValue(s)).id)).filter(id => /^Q\d+$/.test(id))
      .slice(0, kind === 'item' ? 1 : 3).map(item => ({ item }))
  }
  // For a number that changes over time, such as population, the newest dated one.
  const statement = [...statements].sort((a, b) => pointInTime(b).localeCompare(pointInTime(a)))[0]
  const value = statementValue(statement)
  if (kind === 'text') return string(value) ? [{ text: string(value) }] : []
  if (kind === 'date') {
    const shown = date(value)
    return shown ? [{ text: shown }] : []
  }
  const amount = Number(record(value).amount)
  const unit = UNITS[string(record(value).unit).replace(/^.*\//, '')]
  if (!Number.isFinite(amount) || unit === undefined) return []
  const year = pointInTime(statement).match(/^\+0*(\d+)/)?.[1]
  const number = Math.abs(amount) >= 10_000 ? amount.toLocaleString('en-IN') : String(amount)
  return [{ text: `${number}${unit}${year ? ` (${year})` : ''}` }]
}

/** Up to six facts from Wikidata's reply for one item. Values that are other items still need their names. */
export function readFacts(reply: unknown, id: string): Fact[] {
  const claims = record(record(record(reply).entities)[id]).claims
  return FACTS.flatMap(({ property, label, kind }) => {
    const values = factValues(current(list(record(claims)[property])), kind)
    return values.length ? [{ label, values }] : []
  }).slice(0, MAX_FACTS)
}

/** The items whose names must be asked for. */
export const itemsToName = (facts: Fact[]) => [...new Set(facts.flatMap(f => f.values.flatMap(v => ('item' in v ? [v.item] : []))))]

/** Facts as text, using Wikidata's reply with item names: the article's language first, then English. */
export function nameFacts(facts: Fact[], reply: unknown, language: string): { label: string; text: string }[] {
  const entities = record(record(reply).entities)
  return facts.flatMap(({ label, values }) => {
    const names = values.flatMap(value => {
      if ('text' in value) return [value.text]
      const labels = record(record(entities[value.item]).labels)
      const name = string(record(labels[language]).value) || string(record(labels.en).value)
      return name ? [name] : []
    })
    return names.length ? [{ label, text: names.join(', ') }] : []
  })
}
