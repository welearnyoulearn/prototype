import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    try {
      const { status } = await req.json()
      if (!['approved', 'rejected', 'pending'].includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      // Fetch current status before updating (to detect approved→rejected transition)
      const before = await pool.query('SELECT status FROM leave_requests WHERE id = $1', [id])
      const prevStatus = before.rows[0]?.status

      const result = await pool.query(
        `UPDATE leave_requests
         SET status = $1, reviewed_at = NOW()
         WHERE id = $2 RETURNING *`,
        [status, id]
      )
      if (result.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      const lr = result.rows[0]

      // When a previously-approved leave is rejected or reset to pending,
      // cascade-delete all substitute assignments tied to it
      if (prevStatus === 'approved' && status !== 'approved') {
        await pool.query(
          'DELETE FROM substitute_assignments WHERE leave_request_id = $1 AND school_id = $2',
          [id, lr.school_id]
        ).catch(() => {/* non-fatal */})
      }

      // Notify the teacher of the decision
      if (status !== 'pending') {
        await pool.query(
          `INSERT INTO notifications (school_id, recipient_teacher_id, type, title, message, data)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [lr.school_id, lr.teacher_id,
           status === 'approved' ? 'leave_approved' : 'leave_rejected',
           status === 'approved' ? 'Leave Request Approved' : 'Leave Request Rejected',
           `Your ${lr.leave_type} leave request (${lr.start_date?.toString().slice(0,10)} to ${lr.end_date?.toString().slice(0,10)}) has been ${status}.`,
           JSON.stringify({ leave_request_id: lr.id, leave_type: lr.leave_type, status })]
        ).catch(() => {/* non-fatal */})
      }

      return NextResponse.json(lr)
    } catch (error) {
      console.error(error)
      return NextResponse.json({ error: 'Failed to update leave request' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    try {
      await pool.query('DELETE FROM leave_requests WHERE id = $1', [id])
      return NextResponse.json({ success: true })
    } catch (error) {
      console.error(error)
      return NextResponse.json({ error: 'Failed to delete leave request' }, { status: 500 })
    }
} catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
