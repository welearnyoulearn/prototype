import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { computeRecipients, type Person } from '@/lib/announcementAudience'
import type { TargetClass } from '@/lib/announcements'

const LIST_CAP = 300

// GET /api/announcements/[id]/stats
// Who a notice reaches and who has seen / acknowledged it: counts per role, the people who have NOT
// seen it (and, for acknowledgement notices, not acknowledged it), and the notice's audit history.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    const { rows: [ann] } = await pool.query<{ school_id: number; target_audience: string; target_classes: TargetClass[] | null; requires_ack: boolean }>(
      `SELECT school_id, target_audience, target_classes, requires_ack FROM announcements WHERE id = $1`, [id]
    )
    if (!await requireFeeAccess(ann?.school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!ann) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const recipients = await computeRecipients(ann.school_id, ann.target_audience, ann.target_classes)
    const { rows: reads } = await pool.query<{ reader_type: 'teacher' | 'student' | 'parent'; reader_id: number; acked_at: string | null }>(
      `SELECT reader_type, reader_id, acked_at FROM announcement_reads WHERE announcement_id = $1`, [id]
    )
    const seen = new Set(reads.map(r => `${r.reader_type}:${r.reader_id}`))
    const acked = new Set(reads.filter(r => r.acked_at).map(r => `${r.reader_type}:${r.reader_id}`))

    const groups = [
      { key: 'teachers', type: 'teacher', people: recipients.teachers },
      { key: 'students', type: 'student', people: recipients.students },
      { key: 'parents', type: 'parent', people: recipients.parents },
    ] as const
    const byRole: Record<string, { recipients: number; seen: number; acked: number }> = {}
    const notSeen: Array<Person & { role: string }> = []
    const notAcked: Array<Person & { role: string }> = []
    let total = 0, seenTotal = 0, ackTotal = 0
    for (const g of groups) {
      let s = 0, a = 0
      for (const p of g.people) {
        const k = `${g.type}:${p.id}`
        if (seen.has(k)) s++; else notSeen.push({ ...p, role: g.type })
        if (acked.has(k)) a++; else if (ann.requires_ack) notAcked.push({ ...p, role: g.type })
      }
      byRole[g.key] = { recipients: g.people.length, seen: s, acked: a }
      total += g.people.length; seenTotal += s; ackTotal += a
    }

    const { rows: history } = await pool.query(
      `SELECT action, by_name, details, created_at FROM announcement_audit WHERE announcement_id = $1 ORDER BY created_at DESC, id DESC LIMIT 50`, [id]
    )
    return NextResponse.json({
      recipients: total, seen: seenTotal, acknowledged: ann.requires_ack ? ackTotal : null,
      requires_ack: ann.requires_ack, by_role: byRole,
      not_seen: notSeen.slice(0, LIST_CAP), not_seen_total: notSeen.length,
      not_acknowledged: ann.requires_ack ? notAcked.slice(0, LIST_CAP) : [],
      history,
    })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
