// Ulearn palette — ported verbatim from the Ulearn prototype so the re-skinned
// syllabus screens share one identity across every portal. Screens style with
// inline hex (as the prototype does) rather than Tailwind tokens, which keeps
// the port faithful and self-contained.

export const INK = '#202A25'
export const TEAL = '#235B46'
export const GOLD = '#826322'
export const CREAM = '#F8F9F6'
export const CORAL = '#A34B36'
export const GREEN = '#235B46'
export const PURPLE = '#58655C'

// Neutral borders / surfaces used throughout the prototype cards.
export const BORDER = '#DCE3D9'
export const SURFACE = '#F8F9F6'

// Per-role accent, matching the prototype's role switcher.
export const ROLE_COLOR = {
  platform: TEAL,
  school: TEAL,
  teacher: TEAL,
  student: GREEN,
  parent: TEAL,
} as const

export type UlearnRole = keyof typeof ROLE_COLOR

// Status pill colours (taught / unlocked / locked).
export const STATUS_STYLE = {
  taught: { bg: '#E1F5EE', fg: '#085041', label: 'Taught' },
  unlocked: { bg: '#FCEBDB', fg: '#8A4B12', label: 'Unlocked' },
  locked: { bg: '#EFEDE6', fg: '#5F5E5A', label: 'Locked' },
} as const

export type TopicStatus = keyof typeof STATUS_STYLE
