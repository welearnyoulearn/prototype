// Shared name-field validation — staff, student, and parent name fields all
// use this same rule, front and back end, so a value that passes client-side
// can never be rejected by the API with a different rule (or vice versa).
//
// Letters, spaces, and the punctuation that appears in real names —
// apostrophe (O'Brien), hyphen (Anne-Marie), period (K. Ramesh) — are
// allowed. \p{M} (combining marks) sits alongside \p{L} because Indic
// scripts (Devanagari, Telugu, Tamil, ...) spell most names with vowel
// signs/matras that Unicode classifies as marks, not letters — e.g. सुनीता
// is स + ु(mark) + न + ी(mark) + त + ा(mark); \p{L} alone silently rejects
// nearly every real name in those scripts. Digits and any other symbol are
// still rejected: names shouldn't carry a stray "2" or "@" that usually
// means fat-fingered data-entry, not a real name.
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s.'-]*$/u

export function isValidName(value: string): boolean {
  const v = value.trim()
  if (!v) return false
  if (v.length > 100) return false
  return NAME_RE.test(v)
}

export const NAME_INVALID_MESSAGE = 'Only letters, spaces, and \' . - are allowed — no numbers or symbols'
