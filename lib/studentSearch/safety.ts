// Basic checks run on a student's search before it is sent anywhere. Pure: used by the browser and the server.
// This is a short English, Telugu and Hindi word list, NOT a content filter: it misses other languages,
// misspellings and indirect wording. Keep it narrow, so schoolwork such as "sex determination", "drug abuse" or
// "suicide prevention day" still works. The Telugu and Hindi phrases still need review by native speakers.

export const SEARCH_FLAGS = ['support', 'adult', 'danger', 'gambling', 'personal'] as const
export type SearchFlag = (typeof SEARCH_FLAGS)[number]

export const MAX_QUERY = 200

const RULES: readonly { flag: SearchFlag; pattern: RegExp }[] = [
  { flag: 'support', pattern: /\b(kill(ing)? myself|end(ing)? my life|want(ed)? to die|(hurt|cut)(ting)? myself|suicide (methods?|ways?)|how to (commit )?suicide|self[- ]?harm(ing)?)\b/i },
  { flag: 'adult', pattern: /\b(porn\w*|xxx|nudes?|sex ?(videos?|movies?|chat|stories)|hot videos?)\b/i },
  { flag: 'danger', pattern: /\bhow (to|do i|can i) (make|build|buy|get) (a |an )?(bomb|explosives?|gun|pistol|weapon|drugs|cigarettes?|alcohol)\b/i },
  { flag: 'gambling', pattern: /\b(satta|betting (apps?|sites?|tips)|online casino|rummy cash)\b/i },
  // Email address, Indian mobile number, or a 12-digit ID number.
  { flag: 'personal', pattern: /([\w.+-]+@[\w-]+\.\w{2,})|((\+?91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b)|(\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b)/ },
  // Telugu and Hindi, in their own script and as typed in English letters. No \b: it only knows English letters.
  { flag: 'support', pattern: /(చనిపోవాలని|చనిపోవాలి అనిపిస్త|నేను చనిపోతా|ఆత్మహత్య చేసుకోవాల|ఆత్మహత్య చేసుకోవడం ఎలా|ఆత్మహత్య ఎలా చేసుకో)/ },
  { flag: 'support', pattern: /(मरना चाहत|मर जाना चाहत|आत्महत्या कैसे|खुदकुशी कैसे|आत्महत्या करना चाहत|आत्महत्या करने का तरीक)/ },
  { flag: 'support', pattern: /\b(chani ?povalani|chani ?povali ani|marna chaht[ai]|mar jana chaht[ai]|khudkushi kaise)\b/i },
  { flag: 'adult', pattern: /(పోర్న్|సెక్స్ ?వీడియో|బూతు ?(వీడియో|సినిమా|కథ)|అశ్లీల ?(వీడియో|చిత్రాలు))/ },
  { flag: 'adult', pattern: /(पोर्न|सेक्स ?वीडियो|अश्लील ?(वीडियो|फिल्म|कहानी)|ब्लू ?फिल्म)/ },
  { flag: 'danger', pattern: /(బాంబు (ఎలా తయారు|తయారు చేయడం ఎలా)|తుపాకీ ఎలా (తయారు|కొనాలి))/ },
  { flag: 'danger', pattern: /(बम (कैसे बना|बनाने का तरीक)|बंदूक कैसे (बना|खरीद))/ },
  { flag: 'gambling', pattern: /(సట్టా|బెట్టింగ్ ?యాప్|सट्टा|सट्टेबाज़ी ऐप|बेटिंग ?ऐप)/ },
]

// Telugu and Devanagari digits become 0-9, so a phone number is recognised however it is typed. Invisible joining
// characters are dropped so they cannot split a word. (Rules and text are compared in the same composed form.)
const normalise = (query: string) => query.normalize('NFC')
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .replace(/[\u0C66-\u0C6F]/g, d => String(d.charCodeAt(0) - 0x0C66))
  .replace(/[\u0966-\u096F]/g, d => String(d.charCodeAt(0) - 0x0966))
  .replace(/\s+/g, ' ')

/** The reason this search must not go ahead, or null when it may. */
export function checkQuery(query: string): SearchFlag | null {
  const text = normalise(query)
  return RULES.find(rule => rule.pattern.test(text))?.flag ?? null
}

/** Whether the text matches any rule for one reason, even if an earlier rule matches too (Teacher Chat, #558). */
export function matchesFlag(query: string, flag: SearchFlag): boolean {
  const text = normalise(query)
  return RULES.some(rule => rule.flag === flag && rule.pattern.test(text))
}

/** What the student is told when a search is stopped. */
export const STUDENT_MESSAGES: Record<SearchFlag, { title: string; body: string }> = {
  support: { title: 'You are not alone', body: 'It sounds like something may be hurting. Please talk to a parent, teacher or another adult you trust today. You can also call Childline on 1098, or Tele-MANAS on 14416 (free, in India). If you are in danger now, call 112.' },
  adult: { title: 'This search isn’t available', body: 'That topic is not suitable for school search.' },
  danger: { title: 'This search isn’t available', body: 'That could put you or others in danger. If you are worried about something, tell an adult you trust.' },
  gambling: { title: 'This search isn’t available', body: 'Betting and gambling are not suitable for school search.' },
  personal: { title: 'Keep your details private', body: 'Don’t type phone numbers, email addresses or ID numbers into search.' },
}
