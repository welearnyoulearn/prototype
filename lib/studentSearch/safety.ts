// Basic checks run on a student's search before it is sent anywhere. Pure: used by the browser and the server.
// This is a short English word list, NOT a content filter: it misses other languages, misspellings and indirect
// wording. Keep it narrow, so schoolwork such as "sex determination" or "drug abuse" still works.

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
]

/** The reason this search must not go ahead, or null when it may. */
export function checkQuery(query: string): SearchFlag | null {
  return RULES.find(rule => rule.pattern.test(query))?.flag ?? null
}

/** What the student is told when a search is stopped. */
export const STUDENT_MESSAGES: Record<SearchFlag, { title: string; body: string }> = {
  support: { title: 'You are not alone', body: 'It sounds like something may be hurting. Please talk to a parent, teacher or another adult you trust today. You can also call Childline on 1098, or Tele-MANAS on 14416 (free, in India). If you are in danger now, call 112.' },
  adult: { title: 'This search isn’t available', body: 'That topic is not suitable for school search.' },
  danger: { title: 'This search isn’t available', body: 'That could put you or others in danger. If you are worried about something, tell an adult you trust.' },
  gambling: { title: 'This search isn’t available', body: 'Betting and gambling are not suitable for school search.' },
  personal: { title: 'Keep your details private', body: 'Don’t type phone numbers, email addresses or ID numbers into search.' },
}
