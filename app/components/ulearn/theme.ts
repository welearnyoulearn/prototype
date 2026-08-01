// Ulearn palette — ported verbatim from the Ulearn prototype so the re-skinned
// syllabus screens share one identity across every portal. Screens style with
// inline hex (as the prototype does) rather than Tailwind tokens, which keeps
// the port faithful and self-contained.

export const INK = '#0F2A3F'
export const TEAL = '#2A7F8C'
export const GOLD = '#E8A33D'
export const CREAM = '#FBF7EF'
export const CORAL = '#D2603A'
export const GREEN = '#3E8E5A'
export const PURPLE = '#5B4E8A'

// Neutral borders / surfaces used throughout the prototype cards.
export const BORDER = '#E5E1D8'
export const SURFACE = '#FAFAF8'

// Per-role accent, matching the prototype's role switcher.
export const ROLE_COLOR = {
  platform: PURPLE,
  school: TEAL,
  teacher: GOLD,
  student: GREEN,
  parent: CORAL,
} as const

export type UlearnRole = keyof typeof ROLE_COLOR

// Status pill colours (taught / unlocked / locked).
export const STATUS_STYLE = {
  taught: { bg: '#E1F5EE', fg: '#085041', label: 'Taught' },
  unlocked: { bg: '#FCEBDB', fg: '#8A4B12', label: 'Unlocked' },
  locked: { bg: '#EFEDE6', fg: '#5F5E5A', label: 'Locked' },
} as const

export type TopicStatus = keyof typeof STATUS_STYLE
