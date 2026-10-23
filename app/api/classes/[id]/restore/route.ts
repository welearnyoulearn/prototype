import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { ClassWorkflowError, ensureClassWithSetup } from '@/lib/classManagement'
import { invalidateCache } from '@/lib/responseCache'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid class ID' }, { status: 400 })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: [cls] } = await client.query<{
      school_id: number
      grade: string
      section: string
      deleted_at: string | null
    }>('SELECT school_id, grade, section, deleted_at FROM classes WHERE id = $1 FOR UPDATE', [id])
    if (!cls) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }
    if (!cls.deleted_at) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Class is already active' }, { status: 409 })
    }
    if (!await requireFeeAccess(cls.school_id, client)) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const setup = await ensureClassWithSetup(client, {
      schoolId: cls.school_id,
      grade: cls.grade,
      section: cls.section,
      restoreDeleted: true,
    })
    await client.query('COMMIT')
    invalidateCache(`classes:${cls.school_id}`)
    invalidateCache(`subjects:class:${id}`)
    invalidateCache(`health:${cls.school_id}`)
    return NextResponse.json({
      ...setup.classRow,
      subjects_assigned: setup.subjectsAssigned,
      unmatched_subjects: setup.unmatchedSubjects,
    })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    if (error instanceof ClassWorkflowError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[classes/:id/restore POST]', error)
    return NextResponse.json({ error: 'Failed to restore class' }, { status: 500 })
  } finally {
    client.release()
  }
}
