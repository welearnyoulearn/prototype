import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getViewer, readerCanSee, type Reader } from '@/lib/announcementAudience'
import type { TargetClass } from '@/lib/announcements'

// Shared by POST /api/announcements/{id}/read and /ack: the reader must be a teacher / student / parent
// of the notice's school, and the notice must be published, not deleted, already visible and addressed to them.
export async function markNotice(idParam: string, mode: 'seen' | 'ack'): Promise<NextResponse> {
  if (!/^\d+$/.test(idParam)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const viewer = await getViewer()
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // School staff write the notices; there is nothing for them to "see" or acknowledge
  if (viewer.kind === 'staff') return NextResponse.json({ ok: true, skipped: true })
  const reader: Reader = viewer.reader

  const { rows: [ann] } = await pool.query<{ id: number; target_audience: string; target_classes: TargetClass[] | null; requires_ack: boolean }>(
    `SELECT id, target_audience, target_classes, requires_ack FROM announcements
     WHERE id = $1 AND school_id = $2 AND status = 'published' AND deleted_at IS NULL AND (publish_at IS NULL OR publish_at <= NOW())`,
    [idParam, reader.schoolId]
  )
  // Not found and not-for-you look the same
  if (!ann || !readerCanSee(reader, ann)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (mode === 'ack') {
    if (!ann.requires_ack) return NextResponse.json({ error: 'This announcement does not ask for acknowledgement' }, { status: 400 })
    await pool.query(
      `INSERT INTO announcement_reads (announcement_id, reader_type, reader_id, acked_at) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (announcement_id, reader_type, reader_id) DO UPDATE SET acked_at = COALESCE(announcement_reads.acked_at, NOW())`,
      [ann.id, reader.role, reader.id]
    )
  } else {
    await pool.query(
      `INSERT INTO announcement_reads (announcement_id, reader_type, reader_id) VALUES ($1, $2, $3)
       ON CONFLICT (announcement_id, reader_type, reader_id) DO NOTHING`,
      [ann.id, reader.role, reader.id]
    )
  }
  return NextResponse.json({ ok: true })
}
