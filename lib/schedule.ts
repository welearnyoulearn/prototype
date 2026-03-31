// ─────────────────────────────────────────────────────────────────────────────
// Shared school schedule constants — single source of truth for ALL timetable
// operations across server API routes and client components.
//
// School day: 08:30 – 17:00
// Structure:  8 academic periods + 3 breaks = 11 slots per day
//             6 days per week (Mon–Sat)  →  48 academic slots per week
//
// Slot layout:
//   1  P1  08:30–09:25   academic
//   2  P2  09:25–10:20   academic
//   3  P3  10:20–11:15   academic
//   4  —   11:15–11:30   Morning Break
//   5  P4  11:30–12:25   academic
//   6  P5  12:25–13:20   academic
//   7  —   13:20–14:05   Lunch Break
//   8  P6  14:05–15:00   academic
//   9  P7  15:00–15:55   academic
//  10  —   15:55–16:05   Afternoon Break
//  11  P8  16:05–17:00   academic
// ─────────────────────────────────────────────────────────────────────────────

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
export type DayName = typeof DAYS[number]

export type ScheduleSlot = {
  /** Sequential slot number stored in class_timetable.period_number (1–11) */
  slot: number
  /** Human-readable label, e.g. "Period 1", "Lunch Break" */
  label: string
  /** Short display label, e.g. "P1", "Lunch" */
  short: string
  time_from: string
  time_to: string
  is_break: boolean
  break_label?: string
  /** Sequential academic period number 1–8 (undefined for break slots) */
  academic_period?: number
}

export const SCHEDULE: ScheduleSlot[] = [
  // ── Morning session ────────────────────────────────────────────────────────
  { slot: 1,  label: 'Period 1',        short: 'P1',    time_from: '08:30', time_to: '09:25', is_break: false, academic_period: 1 },
  { slot: 2,  label: 'Period 2',        short: 'P2',    time_from: '09:25', time_to: '10:20', is_break: false, academic_period: 2 },
  { slot: 3,  label: 'Period 3',        short: 'P3',    time_from: '10:20', time_to: '11:15', is_break: false, academic_period: 3 },
  { slot: 4,  label: 'Morning Break',   short: 'Break', time_from: '11:15', time_to: '11:30', is_break: true,  break_label: 'Morning Break'   },
  // ── Mid-morning session ────────────────────────────────────────────────────
  { slot: 5,  label: 'Period 4',        short: 'P4',    time_from: '11:30', time_to: '12:25', is_break: false, academic_period: 4 },
  { slot: 6,  label: 'Period 5',        short: 'P5',    time_from: '12:25', time_to: '13:20', is_break: false, academic_period: 5 },
  // ── Lunch ──────────────────────────────────────────────────────────────────
  { slot: 7,  label: 'Lunch Break',     short: 'Lunch', time_from: '13:20', time_to: '14:05', is_break: true,  break_label: 'Lunch Break'     },
  // ── Afternoon session ──────────────────────────────────────────────────────
  { slot: 8,  label: 'Period 6',        short: 'P6',    time_from: '14:05', time_to: '15:00', is_break: false, academic_period: 6 },
  { slot: 9,  label: 'Period 7',        short: 'P7',    time_from: '15:00', time_to: '15:55', is_break: false, academic_period: 7 },
  { slot: 10, label: 'Afternoon Break', short: 'Break', time_from: '15:55', time_to: '16:05', is_break: true,  break_label: 'Afternoon Break' },
  { slot: 11, label: 'Period 8',        short: 'P8',    time_from: '16:05', time_to: '17:00', is_break: false, academic_period: 8 },
]

/** All 8 academic (non-break) slots per day */
export const ACADEMIC_SLOTS = SCHEDULE.filter(s => !s.is_break)

/** The 3 break slots per day */
export const BREAK_SLOTS = SCHEDULE.filter(s => s.is_break)

/** Total academic slots per week across all 6 days */
export const TOTAL_ACADEMIC_PER_WEEK = ACADEMIC_SLOTS.length * DAYS.length // 48

/** Quick lookup: slot number → ScheduleSlot */
export const SLOT_BY_NUM = new Map<number, ScheduleSlot>(SCHEDULE.map(s => [s.slot, s]))

/** Slot numbers that are before lunch (academic periods 1–5, slots 1–6) */
export const BEFORE_LUNCH_SLOTS = new Set(ACADEMIC_SLOTS.filter(s => s.slot < 7).map(s => s.slot))

/** Subject keywords used to classify a subject as "core" for scheduling preference */
export const CORE_KEYWORDS = [
  'math', 'english', 'science', 'physics', 'chemistry', 'biology',
  'social', 'history', 'geography', 'language', 'hindi', 'telugu',
  'urdu', 'kannada', 'tamil', 'malayalam', 'literature', 'environmental',
]

export function isCore(subjectName: string): boolean {
  const s = subjectName.toLowerCase()
  return CORE_KEYWORDS.some(k => s.includes(k))
}

export function getRoom(subjectName: string, grade: string): string {
  const s = subjectName.toLowerCase()
  if (s.includes('computer')) return 'Computer Lab'
  if (s.includes('physics'))  return 'Physics Lab'
  if (s.includes('chemistry')) return 'Chemistry Lab'
  if (s.includes('biology'))  return 'Biology Lab'
  if (s.includes('lab'))      return 'Science Lab'
  const g = parseInt(grade) || 1
  return `Room ${100 + g}`
}

// ─── Dynamic schedule builder ─────────────────────────────────────────────────
// Builds a ScheduleSlot[] from configurable school settings.
// Handles any number of periods with configurable breaks.

export type SchoolScheduleSettings = {
  periods_per_day: number
  start_time: string          // "HH:MM"
  end_time: string            // "HH:MM" (used only for display / validation)
  morning_break_after_period: number
  morning_break_duration: number  // minutes
  lunch_after_period: number
  lunch_duration: number          // minutes
  afternoon_break_after_period: number
  afternoon_break_duration: number // minutes
}

export const DEFAULT_SCHEDULE_SETTINGS: SchoolScheduleSettings = {
  periods_per_day: 8,
  start_time: '08:30',
  end_time: '17:00',
  morning_break_after_period: 3,
  morning_break_duration: 15,
  lunch_after_period: 5,
  lunch_duration: 45,
  afternoon_break_after_period: 7,
  afternoon_break_duration: 10,
}

function _timeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function _minsToTime(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function buildScheduleFromSettings(s: SchoolScheduleSettings): ScheduleSlot[] {
  const totalMins = _timeToMins(s.end_time) - _timeToMins(s.start_time)
  const breakMins = s.morning_break_duration + s.lunch_duration + s.afternoon_break_duration
  const periodDuration = Math.max(30, Math.floor((totalMins - breakMins) / s.periods_per_day))

  let current = _timeToMins(s.start_time)
  const slots: ScheduleSlot[] = []
  let slotNum = 0

  for (let p = 1; p <= s.periods_per_day; p++) {
    slotNum++
    slots.push({
      slot: slotNum,
      label: `Period ${p}`,
      short: `P${p}`,
      time_from: _minsToTime(current),
      time_to: _minsToTime(current + periodDuration),
      is_break: false,
      academic_period: p,
    })
    current += periodDuration

    if (p === s.morning_break_after_period) {
      slotNum++
      slots.push({
        slot: slotNum, label: 'Morning Break', short: 'Break',
        time_from: _minsToTime(current), time_to: _minsToTime(current + s.morning_break_duration),
        is_break: true, break_label: 'Morning Break',
      })
      current += s.morning_break_duration
    }
    if (p === s.lunch_after_period) {
      slotNum++
      slots.push({
        slot: slotNum, label: 'Lunch Break', short: 'Lunch',
        time_from: _minsToTime(current), time_to: _minsToTime(current + s.lunch_duration),
        is_break: true, break_label: 'Lunch Break',
      })
      current += s.lunch_duration
    }
    if (p === s.afternoon_break_after_period) {
      slotNum++
      slots.push({
        slot: slotNum, label: 'Afternoon Break', short: 'Break',
        time_from: _minsToTime(current), time_to: _minsToTime(current + s.afternoon_break_duration),
        is_break: true, break_label: 'Afternoon Break',
      })
      current += s.afternoon_break_duration
    }
  }
  return slots
}
