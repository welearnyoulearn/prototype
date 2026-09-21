import { NextRequest, NextResponse } from 'next/server'
import pool from './db'
import { requireSchoolAdmin, getTeacherSession } from './auth'

// One guard for every timetable-management route (generate, conflicts, swap, publish, versions,
// templates, availability, schedule settings…). Before this, these routes had no sign-in check and trusted
// whatever school_id / class_id / teacher_id the request carried — anyone could regenerate another school's
// timetable or email its teachers.
//
//   • Sign-in: school admin / principal / vice principal. A teacher is admitted only where `allowTeacher`
//     is set (their own availability) and only for their own teacher id.
//   • The school comes from the login. A `school_id` in the request that differs is refused (403).
//   • Every id in the request (class, teacher, slot, template, version) must belong to that school —
//     otherwise it is answered as "not found" so ids of other schools cannot be probed.

export type TimetableActor = { schoolId: number; role: 'admin' | 'teacher'; teacherId?: number }

type IdKind = 'class' | 'template' | 'version'
type Options = {
  allowTeacher?: boolean          // teachers may call it, but only about themselves (teacher_id must be their own)
  idKind?: IdKind                 // what a bare `id` (query string or route param) refers to
  routeId?: string                // the `[id]` route parameter, if the route has one
}

const OWNER_TABLE: Record<string, string> = { class: 'classes', teacher: 'teachers', template: 'schedule_templates', version: 'timetable_versions', slot: 'class_timetable' }

async function owned(kind: keyof typeof OWNER_TABLE, id: unknown, schoolId: number): Promise<boolean> {
  const n = Number(id)
  if (!Number.isInteger(n) || n <= 0) return false
  const { rowCount } = await pool.query(`SELECT 1 FROM ${OWNER_TABLE[kind]} WHERE id = $1 AND school_id = $2`, [n, schoolId])
  return (rowCount ?? 0) > 0
}

const isSet = (v: unknown) => v !== undefined && v !== null && v !== '' && v !== 'default'

export async function guardTimetable(req: NextRequest, opts: Options = {}): Promise<TimetableActor | NextResponse> {
  try {
    const deny = (error: string, status: number) => NextResponse.json({ error }, { status })

    let actor: TimetableActor | null = null
    const admin = await requireSchoolAdmin()
    if (admin?.schoolId) actor = { schoolId: admin.schoolId, role: 'admin' }
    else if (opts.allowTeacher) {
      const t = await getTeacherSession()
      if (t) actor = { schoolId: t.schoolId, role: 'teacher', teacherId: t.teacherId }
    }
    if (!actor) return deny('Unauthorized', 401)

    // Everything the request names: query string plus JSON body.
    const input: Record<string, unknown> = Object.fromEntries(req.nextUrl.searchParams)
    if (!['GET', 'HEAD'].includes(req.method)) {
      const body = await req.clone().json().catch(() => null)
      if (body && typeof body === 'object') Object.assign(input, body)
    }

    if (isSet(input.school_id) && Number(input.school_id) !== actor.schoolId) return deny('Forbidden', 403)

    if (actor.role === 'teacher') {
      if (!isSet(input.teacher_id) || Number(input.teacher_id) !== actor.teacherId) return deny('Forbidden', 403)
    }

    const checks: [keyof typeof OWNER_TABLE, unknown][] = [
      ['class', input.class_id], ['class', input.master_source_id],
      ['teacher', input.teacher_id], ['teacher', input.new_teacher_id],
      ['template', input.template_id],
      ['slot', input.slot_id], ['slot', input.slot_a], ['slot', input.slot_b],
    ]
    if (opts.idKind && isSet(input.id)) checks.push([opts.idKind, input.id])
    if (opts.idKind && opts.routeId !== undefined) checks.push([opts.idKind, opts.routeId])

    for (const [kind, value] of checks) {
      if (isSet(value) && !(await owned(kind, value, actor.schoolId))) return deny('Not found', 404)
    }
    return actor
  } catch (err) {
    console.error('[timetable guard]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Roles allowed to change the timetable through the routes that use getAnySession(). */
export const TIMETABLE_WRITE_ROLES = ['school_admin', 'principal', 'vice_principal']
