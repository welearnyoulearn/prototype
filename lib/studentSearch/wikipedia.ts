// Which Wikipedia to ask, and what to ask it. Pure: used by the student search screen.
// The language is read from the letters typed, so a student chooses nothing. Telugu or Hindi typed in English
// letters looks like English and goes to English Wikipedia.

export type WikiLanguage = 'en' | 'te' | 'hi'

export function wikipediaLookup(query: string): { language: WikiLanguage; topic: string } {
  const language: WikiLanguage = /[ఀ-౿]/.test(query) ? 'te' : /[ऀ-ॿ]/.test(query) ? 'hi' : 'en'
  // A question finds the article better without its question words:
  // "what is photosynthesis?", "… అంటే ఏమిటి?" and "… क्या है?" all become the topic alone.
  const topic = query.trim()
    .replace(/[?？।\s]+$/, '')
    .replace(/^(what|who|where)\s+(is|are|was|were)\s+((a|an|the)\s+)?/i, '')
    .replace(/\s+(అంటే\s+)?(ఏమిటి|ఏంటి)$/, '')
    .replace(/\s+(क्या\s+(है|हैं|होता है|होती है))$/, '')
    .replace(/\s+किसे\s+कहते\s+(है|हैं)$/, '')
    .trim()
  return { language, topic: topic || query.trim() }
}

/** Removes template names that some articles leak into their summary, such as "మూస:Infobox chemical". */
export function cleanExtract(extract: string): string {
  return extract.replace(/(మూస|साँचा|ढाँचा|Template):[A-Za-z0-9 _-]*/g, '').replace(/\s+/g, ' ').trim()
}
