// Word meanings for the student search screen, from English Wiktionary (CC BY-SA). Pure: the screen does the request.
// Only a search that clearly asks for a meaning is looked up. Telugu and Hindi words get their English meaning.

export type WordLanguage = 'en' | 'te' | 'hi'
export type WordRequest = { word: string; language: WordLanguage }
export type Meaning = { partOfSpeech: string; definitions: { text: string; example: string | null }[] }

const ASKS: readonly RegExp[] = [
  /^(?:what is )?(?:the )?(?:meaning|definition) of (?:the word )?(.+)$/i,
  /^define (?:the word )?(.+)$/i,
  /^what does (?:the word )?(.+?) mean$/i,
  /^(.+?) (?:word )?meaning(?: in english)?$/i,
  /^(.+?) (?:అంటే )?అర్థం(?: ఏమిటి| ఏంటి)?$/,
  /^(.+?) (?:का|की) (?:अर्थ|मतलब)(?: क्या है)?$/,
]

/** The word this search asks the meaning of, or null when it is not asking for one. */
export function wordRequest(query: string): WordRequest | null {
  const text = query.normalize('NFC').replace(/\s+/g, ' ').trim().replace(/[?？।.\s]+$/, '')
  for (const ask of ASKS) {
    const found = text.match(ask)?.[1]?.replace(/^["'“‘]+|["'”’]+$/g, '').trim()
    if (!found || found.length > 40 || found.split(' ').length > 3) continue
    const language: WordLanguage | null = /^[ఀ-౿‌‍ ]+$/.test(found) ? 'te'
      : /^[ऀ-ॿ‌‍ ]+$/.test(found) ? 'hi'
      : /^[A-Za-z][A-Za-z' -]*$/.test(found) ? 'en' : null
    // Wiktionary's page names are case-sensitive and ordinary words are in small letters.
    if (language) return { word: found.toLowerCase(), language }
  }
  return null
}

// Wiktionary is written for adults. Senses marked or worded like these are left out; this is not a complete filter.
const UNSUITABLE_LABEL = /\([^)]*\b(vulgar|offensive|derogatory|slur|slang|obscene|pejorative)\b[^)]*\)/i
const UNSUITABLE_WORDS = /\b(sex|sexual|sexually|intercourse|penis|vagina|genitals?|genitalia|breasts?|buttocks|anus|orgasm|masturbat\w*|prostitut\w*|porn\w*|erotic\w*|lewd|obscene|vulgar)\b/i

// Grammar notes ("inflection of …") are not meanings and only confuse.
const GRAMMAR_NOTE = /^(inflection of\b|stem$)/i

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ', ndash: '–', mdash: '—' }

/** Wiktionary sends small pieces of HTML. Only their text is kept; it is shown as text, never as HTML. */
export function plainText(html: string): string {
  return html
    .replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => {
      if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? whole
      const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1))
      return code <= 0x10FFFF ? String.fromCodePoint(code) : whole
    })
    .replace(/\s+/g, ' ').trim()
}

const record = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null ? value as Record<string, unknown> : {})
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const text = (value: unknown): string => (typeof value === 'string' ? plainText(value) : '')

/**
 * Up to three parts of speech with two meanings each, from Wiktionary's reply for one word.
 * Empty when there is nothing suitable. A word whose first meaning is unsuitable shows nothing at all.
 */
export function readMeanings(reply: unknown, language: WordLanguage): Meaning[] {
  const entries = list(record(reply)[language]).map(entry => ({
    partOfSpeech: text(record(entry).partOfSpeech),
    senses: list(record(entry).definitions).map(sense => ({
      text: text(record(sense).definition),
      example: text(list(record(sense).examples)[0]) || null,
    })).filter(sense => sense.text && !GRAMMAR_NOTE.test(sense.text)),
  })).filter(entry => entry.senses.length)

  const unsuitable = (value: string) => UNSUITABLE_LABEL.test(value) || UNSUITABLE_WORDS.test(value)
  const first = entries[0]?.senses[0]
  if (!first || /\([^)]*\b(vulgar|obscene)\b/i.test(first.text)) return []

  return entries.map(entry => ({
    partOfSpeech: entry.partOfSpeech,
    definitions: entry.senses
      .filter(sense => !unsuitable(sense.text))
      .slice(0, 2)
      .map(sense => ({ text: sense.text, example: sense.example && !unsuitable(sense.example) ? sense.example : null })),
  })).filter(entry => entry.definitions.length).slice(0, 3)
}
