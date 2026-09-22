import { NextRequest, NextResponse } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import pool from '@/lib/db'
import { r2Config } from '@/lib/r2'
import { getStudentSession, getTeacherSession, getParentSession } from '@/lib/auth'

function sanitizeSegment(seg: string): string {
  return seg.replace(/[^a-zA-Z0-9-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'UNKNOWN'
}

// POST /api/avatars/upload-sign
// body: { role: 'student' | 'teacher' | 'parent', content_type?: string }
//
// One shared route for all three self-service roles rather than tripling the
// same presign logic — the key is always built server-side from the
// authenticated session (never from client-supplied names), same pattern as
// /api/platform/materials/upload-sign. Always a fixed "photo.webp" filename
// (one avatar per person, overwritten on re-upload) — the client compresses
// to WebP before calling this.
//
// materials/{board}/... key structure doesn't apply here (avatars aren't
// curriculum content) — instead:
//   avatars/teachers/{school_id}/{name}-{teacherId}/photo.webp
//   avatars/students/{school_id}/grade-{grade}/{section}/{name}-{studentId}/photo.webp
//   avatars/parents/{school_id}/grade-{grade}/{section}/{child_name}/{name}-{parentId}/photo.webp
// A parent with several children gets copied to every child's folder in
// /api/avatars/save, once the upload itself is confirmed.
export async function POST(req: NextRequest) {
  try {
    const { role, content_type } = await req.json()
    if (role !== 'student' && role !== 'teacher' && role !== 'parent') {
      return NextResponse.json({ error: 'role must be "student", "teacher", or "parent"' }, { status: 400 })
    }

    let key: string
    if (role === 'teacher') {
      const session = await getTeacherSession()
      if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
      key = `avatars/teachers/${session.schoolId}/${sanitizeSegment(session.name)}-${session.teacherId}/photo.webp`
    } else if (role === 'student') {
      const session = await getStudentSession()
      if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
      key = `avatars/students/${session.schoolId}/grade-${sanitizeSegment(session.grade)}/${sanitizeSegment(session.section)}/${sanitizeSegment(session.name)}-${session.studentId}/photo.webp`
    } else {
      const session = await getParentSession()
      if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
      const { rows } = await pool.query(
        `SELECT s.grade, s.section, s.name AS student_name
         FROM student_parents sp JOIN students s ON s.id = sp.student_id
         WHERE sp.parent_id = $1 ORDER BY s.id LIMIT 1`,
        [session.parentId]
      )
      if (rows.length === 0) {
        // No linked child yet (shouldn't normally happen) — fall back to a
        // flat parent folder rather than failing the upload outright.
        key = `avatars/parents/${session.schoolId}/${sanitizeSegment(session.name)}-${session.parentId}/photo.webp`
      } else {
        const { grade, section, student_name } = rows[0]
        key = `avatars/parents/${session.schoolId}/grade-${sanitizeSegment(grade)}/${sanitizeSegment(section)}/${sanitizeSegment(student_name)}/${sanitizeSegment(session.name)}-${session.parentId}/photo.webp`
      }
    }

    const r2 = r2Config()
    const uploadUrl = await getSignedUrl(
      r2.client,
      new PutObjectCommand({
        Bucket: r2.bucket,
        Key: key,
        ContentType: typeof content_type === 'string' && content_type ? content_type : 'image/webp',
      }),
      { expiresIn: 600 },
    )

    return NextResponse.json({ uploadUrl, key })
  } catch (err) {
    console.error('avatars upload-sign POST error:', err)
    const message = err instanceof Error && err.message.startsWith('R2 not configured')
      ? err.message
      : 'Failed to prepare upload'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
