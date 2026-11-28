// Rules for Teacher Chat that need no database. Used by the server and the browser.
import { checkQuery, matchesFlag } from '@/lib/studentSearch/safety'

export const MAX_OPEN_THREADS = 3
export const STUDENT_MESSAGES_PER_DAY = 30
export const MAX_STUDENT_MESSAGE = 1000
export const MAX_TEACHER_MESSAGE = 2000
export const AUTO_CLOSE_DAYS = 7

export type ChatSender = 'student' | 'teacher'
export type ChatStatus = 'open' | 'answered' | 'closed'
export type ChatFlag = 'support' | 'adult' | 'danger' | 'gambling'

const LINK = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]{2,}\.(com|in|org|net|me|io|ly|app|gg|co)\b(\/\S*)?/i

export type MessageCheck =
  | { ok: false; reason: string }
  | { ok: true; flag: ChatFlag | null }

/** Contact details and links are refused. Worrying wording is delivered, but marked for the school to review. */
export function checkMessage(body: string): MessageCheck {
  if (matchesFlag(body, 'personal')) return { ok: false, reason: 'Don’t share phone numbers, email addresses or ID numbers in chat.' }
  if (LINK.test(body.normalize('NFC'))) return { ok: false, reason: 'Links can’t be sent in chat.' }
  if (matchesFlag(body, 'support')) return { ok: true, flag: 'support' }
  const flag = checkQuery(body)
  return { ok: true, flag: flag === 'personal' ? null : flag }
}

export const SUPPORT_MESSAGE = 'You are not alone. Please talk to a parent, teacher or another adult you trust today. You can also call Childline on 1098, or Tele-MANAS on 14416 (free, in India). If you are in danger now, call 112.'

export type Tick = 'sent' | 'delivered' | 'read'

/** The tick under one of my messages, from how far the other side has got. */
export function tickFor(messageId: number, other: { deliveredId: number; readId: number }): Tick {
  if (messageId <= other.readId) return 'read'
  return messageId <= other.deliveredId ? 'delivered' : 'sent'
}

export const TICK_LABEL: Record<Tick, string> = { sent: 'Sent', delivered: 'Delivered', read: 'Read' }

export const STATUS_LABEL: Record<ChatStatus, string> = { open: 'Waiting for an answer', answered: 'Answered', closed: 'Closed' }
