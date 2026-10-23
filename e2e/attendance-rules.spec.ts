import { test, expect } from '@playwright/test'
import {
  attendancePercent, attendanceBand, summarizeCounts, dayStatusFor, expandNonWorkingDays,
  buildStudentMonth, countWorkingSessions, checkMarkingWindow, todayIST, addDays, weekdayOf,
  monthBounds, enumerateDates, isValidDateStr, isValidMonthStr, isAttended,
  type SessionRecord, type CalendarHolidayRow,
} from '../lib/attendanceRules'

// Pure logic — no browser, no server, no database.

test.describe('percentage and bands', () => {
  test('late counts as attended; the formula is attended ÷ marked sessions', () => {
    const s = summarizeCounts({ present: 6, late: 2, absent: 2 })
    expect(s.marked).toBe(10)
    expect(s.attended).toBe(8)
    expect(s.pct).toBe(80)
    expect(isAttended('late')).toBe(true)
    expect(isAttended('absent')).toBe(false)
  })

  test('nothing marked is "no data", not 0% and not 100%', () => {
    expect(attendancePercent(0, 0)).toBeNull()
    expect(summarizeCounts({ present: 0, late: 0, absent: 0 }).band).toBe('none')
  })

  test('rounds to a whole number', () => {
    expect(attendancePercent(2, 3)).toBe(67)
    expect(attendancePercent(1, 3)).toBe(33)
  })

  test('bands: 90+ good, 75-89 watch, below 75 low', () => {
    expect(attendanceBand(100)).toBe('good')
    expect(attendanceBand(90)).toBe('good')
    expect(attendanceBand(89)).toBe('watch')
    expect(attendanceBand(75)).toBe('watch')
    expect(attendanceBand(74)).toBe('low')
    expect(attendanceBand(null)).toBe('none')
  })
})

test.describe('a day from its two sessions', () => {
  test('all combinations', () => {
    expect(dayStatusFor('present', 'present')).toBe('present')
    expect(dayStatusFor('present', 'late')).toBe('late')
    expect(dayStatusFor('late', null)).toBe('late')
    expect(dayStatusFor('absent', 'absent')).toBe('absent')
    expect(dayStatusFor('absent', null)).toBe('absent')
    expect(dayStatusFor('absent', 'present')).toBe('half')
    expect(dayStatusFor('present', 'absent')).toBe('half')
    expect(dayStatusFor('late', 'absent')).toBe('half')
    expect(dayStatusFor(null, null)).toBe('not_marked')
    expect(dayStatusFor(undefined, undefined)).toBe('not_marked')
  })
})

test.describe('dates', () => {
  test('validation', () => {
    expect(isValidDateStr('2026-09-20')).toBe(true)
    expect(isValidDateStr('2026-02-30')).toBe(false)
    expect(isValidDateStr('20-09-2026')).toBe(false)
    expect(isValidDateStr("2026-09-20'; DROP TABLE attendance;--")).toBe(false)
    expect(isValidDateStr(20260920)).toBe(false)
    expect(isValidMonthStr('2026-09')).toBe(true)
    expect(isValidMonthStr('2026-13')).toBe(false)
    expect(isValidMonthStr('2026-9')).toBe(false)
  })

  test('todayIST rolls over at 18:30 UTC, not at UTC midnight', () => {
    expect(todayIST(new Date('2026-09-20T18:29:00Z'))).toBe('2026-09-20')
    expect(todayIST(new Date('2026-09-20T18:31:00Z'))).toBe('2026-09-21')
    expect(todayIST(new Date('2026-12-31T20:00:00Z'))).toBe('2027-01-01')
  })

  test('arithmetic', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
    expect(weekdayOf('2026-09-20')).toBe(0)          // a Sunday
    expect(monthBounds('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(enumerateDates('2026-09-28', '2026-10-02')).toHaveLength(5)
  })
})

test.describe('holidays and weekly off', () => {
  const holiday = (id: number, title: string, event_date: string, end_date: string | null, event_type = 'holiday'): CalendarHolidayRow =>
    ({ id, title, event_type, event_date, end_date })

  test('single day, ranges, and weekly off are expanded; only "holiday" events block', () => {
    const map = expandNonWorkingDays(
      [
        holiday(1, 'Gandhi Jayanti', '2026-10-02', null),
        holiday(2, 'Dasara', '2026-10-19', '2026-10-21'),
        holiday(3, 'Unit Test', '2026-10-05', null, 'exam'),      // exams do NOT block attendance
        holiday(4, 'PTM', '2026-10-06', null, 'meeting'),
      ],
      [0],
      '2026-10-01', '2026-10-31',
    )
    expect(map.get('2026-10-02')).toMatchObject({ kind: 'holiday', title: 'Gandhi Jayanti' })
    for (const d of ['2026-10-19', '2026-10-20', '2026-10-21']) expect(map.get(d)).toMatchObject({ kind: 'holiday', title: 'Dasara' })
    expect(map.has('2026-10-05')).toBe(false)
    expect(map.has('2026-10-06')).toBe(false)
    expect(map.get('2026-10-04')).toMatchObject({ kind: 'weekly_off' })   // Sunday
    expect(map.get('2026-10-11')).toMatchObject({ kind: 'weekly_off' })
    expect(map.has('2026-10-03')).toBe(false)                              // a normal Saturday
  })

  test('a named holiday on a Sunday keeps its name', () => {
    const map = expandNonWorkingDays([holiday(1, 'Diwali', '2026-11-08', null)], [0], '2026-11-01', '2026-11-30')
    expect(map.get('2026-11-08')).toMatchObject({ kind: 'holiday', title: 'Diwali' })
  })

  test('events partly outside the window are clipped', () => {
    const map = expandNonWorkingDays([holiday(1, 'Summer break', '2026-04-20', '2026-06-10')], [], '2026-05-30', '2026-06-03')
    expect([...map.keys()]).toEqual(['2026-05-30', '2026-05-31', '2026-06-01', '2026-06-02', '2026-06-03'])
  })

  test('Saturday + Sunday weekly off', () => {
    const map = expandNonWorkingDays([], [0, 6], '2026-09-14', '2026-09-20')
    expect([...map.keys()].sort()).toEqual(['2026-09-19', '2026-09-20'])
  })
})

test.describe('one student, one month', () => {
  const rec = (date: string, session: string, status: string): SessionRecord => ({ date, session, status })
  const nonWorking = expandNonWorkingDays(
    [{ id: 1, title: 'Gandhi Jayanti', event_type: 'holiday', event_date: '2026-10-02', end_date: null }], [0], '2026-10-01', '2026-10-31')

  test('holidays are excluded even if attendance was recorded on them; unmarked working days are gaps, not absences', () => {
    const records = [
      rec('2026-10-01', 'morning', 'present'), rec('2026-10-01', 'afternoon', 'present'),
      rec('2026-10-02', 'morning', 'absent'),                      // recorded on a holiday → ignored
      rec('2026-10-03', 'morning', 'absent'), rec('2026-10-03', 'afternoon', 'absent'),
      rec('2026-10-05', 'morning', 'late'),                        // (4th is a Sunday)
      // 6th: working day nobody marked
      rec('2026-10-07', 'morning', 'absent'), rec('2026-10-07', 'afternoon', 'present'),
    ]
    const m = buildStudentMonth({ month: '2026-10', records, nonWorking, today: '2026-10-08' })

    const by = Object.fromEntries(m.days.map(d => [d.date, d]))
    expect(by['2026-10-01'].status).toBe('present')
    expect(by['2026-10-02']).toMatchObject({ status: 'holiday', title: 'Gandhi Jayanti', morning: null })
    expect(by['2026-10-03'].status).toBe('absent')
    expect(by['2026-10-04'].status).toBe('weekly_off')
    expect(by['2026-10-05'].status).toBe('late')
    expect(by['2026-10-06'].status).toBe('not_marked')
    expect(by['2026-10-07'].status).toBe('half')
    expect(by['2026-10-09'].status).toBe('future')

    // sessions: Oct1 P,P | Oct3 A,A | Oct5 L | Oct7 A,P  → present 3, late 1, absent 3
    expect(m.summary).toMatchObject({ present: 3, late: 1, absent: 3, marked: 7, attended: 4, pct: 57, band: 'low' })
    expect(m.daysMarked).toBe(4)
    expect(m.absentDays).toBe(1)
    expect(m.halfDays).toBe(1)
  })

  test('days before the student joined do not count', () => {
    const records = [rec('2026-10-01', 'morning', 'absent'), rec('2026-10-05', 'morning', 'present')]
    const m = buildStudentMonth({ month: '2026-10', records, nonWorking, today: '2026-10-08', joinDate: '2026-10-05' })
    expect(m.days.find(d => d.date === '2026-10-01')!.status).toBe('before_joining')
    expect(m.summary).toMatchObject({ present: 1, absent: 0, pct: 100 })
  })

  test('the same records give the same numbers whether summarised or built into a calendar', () => {
    const records = [
      rec('2026-10-01', 'morning', 'present'), rec('2026-10-01', 'afternoon', 'late'),
      rec('2026-10-05', 'morning', 'absent'), rec('2026-10-05', 'afternoon', 'absent'),
      rec('2026-10-02', 'morning', 'absent'),
    ]
    const counts = countWorkingSessions(records, nonWorking, '2026-10-08')
    const viaSummary = summarizeCounts(counts)
    const viaCalendar = buildStudentMonth({ month: '2026-10', records, nonWorking, today: '2026-10-08' }).summary
    expect(viaCalendar).toEqual(viaSummary)
    expect(viaSummary.pct).toBe(50)
  })
})

test.describe('who may mark which day', () => {
  const today = '2026-09-20'
  test('nobody marks the future', () => {
    expect(checkMarkingWindow('2026-09-21', today, 'admin')).toMatchObject({ ok: false, code: 'FUTURE' })
    expect(checkMarkingWindow('2026-09-21', today, 'teacher')).toMatchObject({ ok: false, code: 'FUTURE' })
  })
  test('teachers: today and the two days before; admin: any past day', () => {
    expect(checkMarkingWindow('2026-09-20', today, 'teacher').ok).toBe(true)
    expect(checkMarkingWindow('2026-09-18', today, 'teacher').ok).toBe(true)
    expect(checkMarkingWindow('2026-09-17', today, 'teacher')).toMatchObject({ ok: false, code: 'TOO_OLD' })
    expect(checkMarkingWindow('2026-01-05', today, 'admin').ok).toBe(true)
  })
})
