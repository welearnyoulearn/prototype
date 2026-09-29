export type Session = 'morning' | 'afternoon'
export type Status = 'present' | 'absent' | 'late'

export type NonWorking = { kind: 'holiday' | 'weekly_off'; title: string } | null

export type SessionState = {
  marked: boolean
  markedBy: string | null
  markedByRole: string | null
  markedAt: string | null
  byMe: boolean
  editedBy: string | null
  present: number
  late: number
  absent: number
}

export type OverviewClass = {
  id: number
  grade: string
  section: string
  classTeacher: string | null
  studentCount: number
  morning: SessionState
  afternoon: SessionState
}

export type Overview = {
  date: string
  today: string
  nonWorking: NonWorking
  canMark: boolean
  window: { ok: boolean; code?: string; message?: string }
  classes: OverviewClass[]
}

export type SheetStudent = { id: number; name: string; roll_number: string | null; status: Status | null }

export type Sheet = {
  class: { id: number; grade: string; section: string }
  date: string
  session: Session
  today: string
  students: SheetStudent[]
  counts: { present: number; late: number; absent: number }
  nonWorking: NonWorking
  window: { ok: boolean; code?: string; message?: string }
  lock: {
    markedBy: string; markedByRole: string; markedAt: string
    editedBy: string | null; editedAt: string | null; editCount: number; byMe: boolean
  } | null
  canMark: boolean
  canEdit: boolean
}

export const SESSION_LABEL: Record<Session, string> = { morning: 'Morning', afternoon: 'Afternoon' }

export function timeOf(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : ''
}

export function longDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}
