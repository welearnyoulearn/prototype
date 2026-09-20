import { z } from 'zod'
import { addDays, isValidDateStr } from './attendanceRules'

// Academic Calendar: the shapes and rules shared by the create / edit routes.

export const CALENDAR_TYPES = ['holiday', 'exam', 'event', 'meeting', 'other'] as const
export type CalendarType = (typeof CALENDAR_TYPES)[number]

export const CALENDAR_AUDIENCES = ['everyone', 'staff'] as const
export type CalendarAudience = (typeof CALENDAR_AUDIENCES)[number]

// One colour per type, decided here so every portal shows the same thing.
export const CALENDAR_TYPE_COLOR: Record<CalendarType, string> = {
  holiday: 'red', exam: 'orange', event: 'blue', meeting: 'purple', other: 'gray',
}

export const MAX_RANGE_DAYS = 366

const dateField = z.string().refine(isValidDateStr, 'Dates must look like YYYY-MM-DD')

export const calendarBase = z.object({
  title: z.string().trim().min(1, 'Please enter a title.').max(120, 'Title is too long (120 characters max).'),
  event_type: z.enum(CALENDAR_TYPES),
  event_date: dateField,
  end_date: dateField.nullable().optional(),
  audience: z.enum(CALENDAR_AUDIENCES).default('everyone'),
  description: z.string().trim().max(500, 'Description is too long (500 characters max).').nullable().optional(),
  // The admin has seen the "N sessions are already marked on these dates" warning and accepts it.
  acknowledge_existing_attendance: z.boolean().optional(),
})

/** Cross-field rules, applied to the final (merged) values of a create or an edit. */
export function checkCalendarRules(v: { event_date: string; end_date?: string | null }): string | null {
  const end = v.end_date ?? v.event_date
  if (end < v.event_date) return 'The end date cannot be before the start date.'
  if (addDays(v.event_date, MAX_RANGE_DAYS) < end) return `A single entry can span at most ${MAX_RANGE_DAYS} days.`
  return null
}

export const weeklyOffBody = z.object({
  weekly_off_days: z.array(z.number().int().min(0).max(6)).max(6, 'At least one day of the week must be a working day.')
    .refine(a => new Set(a).size === a.length, 'Each day can only be listed once.'),
})
