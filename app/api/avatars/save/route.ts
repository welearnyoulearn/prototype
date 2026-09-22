import { NextRequest, NextResponse } from 'next/server'
import { CopyObjectCommand } from '@aws-sdk/client-s3'
import pool from '@/lib/db'
import { r2Config } from '@/lib/r2'
import { getStudentSession, getTeacherSession, getParentSession } from '@/lib/auth'

function sanitizeSegment(seg: string): string {
  return seg.replace(/[^a-zA-Z0-9-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'UNKNOWN'
}

const PRESET_RE = /^preset:(student|teacher|parent):(male|female|neutral):[1-5]$/

// PUT /api/avatars/save
// body: { role: 'student' | 'teacher' | 'parent', avatar_url: string | null }
//
// avatar_url is either a "preset:{role}:{gender}:{1-5}" string (matched
// against this exact role — a student can't save a teacher preset), or the
// "/api/avatars/file?key=..." URL for a photo just uploaded via
// /api/avatars/upload-sign — re-derived server-side from the session rather
// than trusted from the client, so a request can't point avatar_url at
// someone else's R2 object. null clears it back to no avatar.
export async function PUT(req: NextRequest) {
  try {
    const { role, avatar_url } = await req.json()
    if (role !== 'student' && role !== 'teacher' && role !== 'parent') {
      return NextResponse.json({ error: 'role must be "student", "teacher", or "parent"' }, { status: 400 })
    }
    if (avatar_url !== null && typeof avatar_url !== 'string') {
      return NextResponse.json({ error: 'avatar_url must be a string or null' }, { status: 400 })
    }

    if (avatar_url !== null && PRESET_RE.test(avatar_url) && !avatar_url.startsWith(`preset:${role}:`)) {
      return NextResponse.json({ error: 'avatar_url preset does not match role' }, { status: 400 })
    }

    if (role === 'teacher') {
      const session = await getTeacherSession()
      if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
      if (avatar_url !== null && !PRESET_RE.test(avatar_url)) {
        const expectedKey = `avatars/teachers/${session.schoolId}/${sanitizeSegment(session.name)}-${session.teacherId}/photo.webp`
        if (avatar_url !== `/api/avatars/file?key=${encodeURIComponent(expectedKey)}`) {
          return NextResponse.json({ error: 'avatar_url does not match an object uploaded for this account' }, { status: 400 })
        }
      }
      await pool.query(`UPDATE teachers SET avatar_url = $1 WHERE id = $2`, [avatar_url, session.teacherId])
      return NextResponse.json({ success: true, avatar_url })
    }

    if (role === 'student') {
      const session = await getStudentSession()
      if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
      if (avatar_url !== null && !PRESET_RE.test(avatar_url)) {
        const expectedKey = `avatars/students/${session.schoolId}/grade-${sanitizeSegment(session.grade)}/${sanitizeSegment(session.section)}/${sanitizeSegment(session.name)}-${session.studentId}/photo.webp`
        if (avatar_url !== `/api/avatars/file?key=${encodeURIComponent(expectedKey)}`) {
          return NextResponse.json({ error: 'avatar_url does not match an object uploaded for this account' }, { status: 400 })
        }
      }
      await pool.query(`UPDATE students SET avatar_url = $1 WHERE id = $2`, [avatar_url, session.studentId])
      return NextResponse.json({ success: true, avatar_url })
    }

    // parent
    const session = await getParentSession()
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const { rows: children } = await pool.query(
      `SELECT s.id, s.grade, s.section, s.name AS student_name
       FROM student_parents sp JOIN students s ON s.id = sp.student_id
       WHERE sp.parent_id = $1 ORDER BY s.id`,
      [session.parentId]
    )

    if (avatar_url !== null && !PRESET_RE.test(avatar_url)) {
      const primaryKey = children.length > 0
        ? `avatars/parents/${session.schoolId}/grade-${sanitizeSegment(children[0].grade)}/${sanitizeSegment(children[0].section)}/${sanitizeSegment(children[0].student_name)}/${sanitizeSegment(session.name)}-${session.parentId}/photo.webp`
        : `avatars/parents/${session.schoolId}/${sanitizeSegment(session.name)}-${session.parentId}/photo.webp`
      if (avatar_url !== `/api/avatars/file?key=${encodeURIComponent(primaryKey)}`) {
        return NextResponse.json({ error: 'avatar_url does not match an object uploaded for this account' }, { status: 400 })
      }

      // A parent with more than one linked child only ever gets a presigned
      // PUT for the first child's folder — copy that same object into every
      // other child's folder so the photo shows up under each of them too.
      if (children.length > 1) {
        try {
          const r2 = r2Config()
          for (const child of children.slice(1)) {
            const siblingKey = `avatars/parents/${session.schoolId}/grade-${sanitizeSegment(child.grade)}/${sanitizeSegment(child.section)}/${sanitizeSegment(child.student_name)}/${sanitizeSegment(session.name)}-${session.parentId}/photo.webp`
            await r2.client.send(new CopyObjectCommand({
              Bucket: r2.bucket,
              CopySource: `${r2.bucket}/${encodeURIComponent(primaryKey)}`,
              Key: siblingKey,
            }))
          }
        } catch (err) {
          // The primary copy already succeeded — a sibling-folder copy
          // failure shouldn't fail saving the parent's own avatar.
          console.error('avatars save: sibling copy failed:', err)
        }
      }
    }

    await pool.query(`UPDATE parents SET avatar_url = $1 WHERE id = $2`, [avatar_url, session.parentId])
    return NextResponse.json({ success: true, avatar_url })
  } catch (err) {
    console.error('avatars save PUT error:', err)
    return NextResponse.json({ error: 'Failed to save avatar' }, { status: 500 })
  }
}
