import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { randomInt } from 'crypto'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import pool from './db'
import { JWT_SECRET, COOKIE_ADMIN, COOKIE_PLATFORM, COOKIE_TEACHER, COOKIE_STUDENT, COOKIE_PARENT } from './auth-constants'

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

// ─── Cookie names ─────────────────────────────────────────────────────────────
export { COOKIE_ADMIN, COOKIE_PLATFORM, COOKIE_TEACHER, COOKIE_STUDENT, COOKIE_PARENT }

// ─── JWT Payload types ────────────────────────────────────────────────────────
export type JWTPayload = {
  userId: number
  role: 'platform_admin' | 'school_admin'
  schoolId?: number
  schoolCode?: string
  firstLogin: boolean
  profileCompleted: boolean
}

export type TeacherJWTPayload = {
  teacherId: number
  schoolId: number
  role: 'teacher'
  passwordChanged: boolean
  name: string
  email: string
}

export type StudentJWTPayload = {
  studentId: number
  schoolId: number
  role: 'student'
  passwordChanged: boolean
  name: string
  grade: string
  section: string
  rollNumber: string
}

export type ParentJWTPayload = {
  parentId: number
  schoolId: number
  role: 'parent'
  passwordChanged: boolean
  name: string
  email: string
}

// ─── Password helpers ─────────────────────────────────────────────────────────
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12)
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export function generateTempPassword(length = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < length; i++) out += chars[randomInt(chars.length)]
  return out
}

export function generateResetToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < 48; i++) out += chars[randomInt(chars.length)]
  return out
}

export function generateSchoolCode(schoolName: string, schoolId: number): string {
  const slug = schoolName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 20)
  return `wlyl-schl-${slug}-${schoolId}`
}

// ─── Generic JWT helpers ──────────────────────────────────────────────────────
function sign<T extends object>(payload: T): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

function verify<T extends object>(token: string): T | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as T & { iat?: number; exp?: number }
    const { iat: _i, exp: _e, ...payload } = decoded as T & { iat?: number; exp?: number }
    return payload as T
  } catch {
    return null
  }
}

async function setCookie(name: string, value: string) {
  const cookieStore = await cookies()
  cookieStore.set(name, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  })
}

async function clearCookie(name: string) {
  const cookieStore = await cookies()
  cookieStore.delete(name)
}

// ─── Admin / Platform JWT ─────────────────────────────────────────────────────
export function signToken(payload: JWTPayload): string         { return sign(payload) }
export function verifyToken(token: string): JWTPayload | null  { return verify<JWTPayload>(token) }
// COOKIE_ADMIN is for school-side staff only; Platform Admin uses COOKIE_PLATFORM
// (see lib/auth-constants.ts) so the two portals can't clobber each other's session.
export async function setAuthCookie(payload: JWTPayload)       { await setCookie(COOKIE_ADMIN, signToken(payload)) }
export async function clearAuthCookie()                        { await clearCookie(COOKIE_ADMIN) }
export async function setPlatformAuthCookie(payload: JWTPayload) { await setCookie(COOKIE_PLATFORM, signToken(payload)) }
export async function clearPlatformAuthCookie()                  { await clearCookie(COOKIE_PLATFORM) }

export async function getSession(): Promise<JWTPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_ADMIN)?.value
  if (!token) return null
  return verifyToken(token)
}

export function getSessionFromRequest(req: NextRequest): JWTPayload | null {
  const token = req.cookies.get(COOKIE_ADMIN)?.value
  if (!token) return null
  return verifyToken(token)
}

export async function getPlatformSession(): Promise<JWTPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_PLATFORM)?.value
  if (!token) return null
  return verifyToken(token)
}

export async function requirePlatformAdmin(): Promise<JWTPayload | null> {
  const session = await getPlatformSession()
  if (!session || session.role !== 'platform_admin') return null
  return session
}

export async function requireSchoolAdmin(): Promise<JWTPayload | null> {
  const session = await getSession()
  if (!session) return null
  const SCHOOL_ROLES = ['school_admin', 'principal', 'vice_principal']
  if (!SCHOOL_ROLES.includes(session.role)) return null
  return session
}

// ─── Teacher JWT ──────────────────────────────────────────────────────────────
export function signTeacherToken(payload: TeacherJWTPayload): string              { return sign(payload) }
export function verifyTeacherToken(token: string): TeacherJWTPayload | null       { return verify<TeacherJWTPayload>(token) }
export async function setTeacherAuthCookie(payload: TeacherJWTPayload)            { await setCookie(COOKIE_TEACHER, signTeacherToken(payload)) }
export async function clearTeacherAuthCookie()                                    { await clearCookie(COOKIE_TEACHER) }

export async function getTeacherSession(): Promise<TeacherJWTPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_TEACHER)?.value
  if (!token) return null
  return verifyTeacherToken(token)
}

export function getTeacherSessionFromRequest(req: NextRequest): TeacherJWTPayload | null {
  const token = req.cookies.get(COOKIE_TEACHER)?.value
  if (!token) return null
  return verifyTeacherToken(token)
}

// ─── Student JWT ──────────────────────────────────────────────────────────────
export function signStudentToken(payload: StudentJWTPayload): string              { return sign(payload) }
export function verifyStudentToken(token: string): StudentJWTPayload | null       { return verify<StudentJWTPayload>(token) }
export async function setStudentAuthCookie(payload: StudentJWTPayload)            { await setCookie(COOKIE_STUDENT, signStudentToken(payload)) }
export async function clearStudentAuthCookie()                                    { await clearCookie(COOKIE_STUDENT) }

export async function getStudentSession(): Promise<StudentJWTPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_STUDENT)?.value
  if (!token) return null
  return verifyStudentToken(token)
}

export function getStudentSessionFromRequest(req: NextRequest): StudentJWTPayload | null {
  const token = req.cookies.get(COOKIE_STUDENT)?.value
  if (!token) return null
  return verifyStudentToken(token)
}

// ─── Parent JWT ───────────────────────────────────────────────────────────────
export function signParentToken(payload: ParentJWTPayload): string                { return sign(payload) }
export function verifyParentToken(token: string): ParentJWTPayload | null         { return verify<ParentJWTPayload>(token) }
export async function setParentAuthCookie(payload: ParentJWTPayload)              { await setCookie(COOKIE_PARENT, signParentToken(payload)) }
export async function clearParentAuthCookie()                                     { await clearCookie(COOKIE_PARENT) }

export async function getParentSession(): Promise<ParentJWTPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_PARENT)?.value
  if (!token) return null
  return verifyParentToken(token)
}

export function getParentSessionFromRequest(req: NextRequest): ParentJWTPayload | null {
  const token = req.cookies.get(COOKIE_PARENT)?.value
  if (!token) return null
  return verifyParentToken(token)
}

// ─── Fee-module access guard (tenant isolation) ───────────────────────────────
// Requires a school-admin (or platform-admin) session AND verifies the requested
// school_id belongs to that admin's school. Platform admins may access any school.
// Returns the resolved { schoolId, role, userId, name } or null if denied.
//
// Usage in a fee route:
//   const access = await requireFeeAccess(requestedSchoolId)
//   if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
//   // use access.schoolId (trusted) and access.actor for audit fields
export async function requireFeeAccess(requestedSchoolId: string | number | null | undefined):
  Promise<{ schoolId: number; role: string; userId: number; actor: string } | null> {
  // Platform admin: full access to any school (own cookie — see COOKIE_PLATFORM)
  const platformSession = await getPlatformSession()
  if (platformSession?.role === 'platform_admin') {
    const sid = requestedSchoolId != null ? Number(requestedSchoolId) : (platformSession.schoolId ?? 0)
    if (!sid) return null
    return { schoolId: sid, role: 'platform_admin', userId: platformSession.userId, actor: 'Platform Admin' }
  }

  // School staff (admin, principal, vice_principal): must match their own school
  const session = await getSession()
  if (!session) return null

  const SCHOOL_ROLES = ['school_admin', 'principal', 'vice_principal']
  if (SCHOOL_ROLES.includes(session.role) && session.schoolId) {
    if (requestedSchoolId != null && Number(requestedSchoolId) !== Number(session.schoolId)) {
      return null   // cross-tenant attempt
    }
    return { schoolId: session.schoolId, role: session.role, userId: session.userId, actor: 'School Admin' }
  }

  return null
}

// ─── Per-school feature resolution ────────────────────────────────────────────
// Checks school_feature_overrides first (per-school, takes precedence), then
// falls back to the school's tier in plan_features. Unconfigured = disabled,
// matching the convention in GET /api/platform/features.
export async function schoolHasFeature(schoolId: number, featureKey: string): Promise<boolean> {
  const overrideRes = await pool.query(
    `SELECT enabled FROM school_feature_overrides WHERE school_id = $1 AND feature_key = $2`,
    [schoolId, featureKey]
  )
  if (overrideRes.rows.length > 0) return overrideRes.rows[0].enabled

  const tierRes = await pool.query(
    `SELECT sub.tier, pf.enabled
     FROM school_subscriptions sub
     LEFT JOIN plan_features pf ON pf.tier = sub.tier AND pf.feature_key = $2
     WHERE sub.school_id = $1`,
    [schoolId, featureKey]
  )
  if (tierRes.rows.length === 0) return false
  return tierRes.rows[0].enabled === true
}

// ─── Any authenticated session ────────────────────────────────────────────────
// Returns the schoolId and role for whichever session cookie is present.
// Used on routes accessible by teachers, students, and school admins alike.
export async function getAnySession(): Promise<{ schoolId: number; role: string } | null> {
  const teacher = await getTeacherSession()
  if (teacher) return { schoolId: teacher.schoolId, role: 'teacher' }
  const student = await getStudentSession()
  if (student) return { schoolId: student.schoolId, role: 'student' }
  const parent = await getParentSession()
  if (parent) return { schoolId: parent.schoolId, role: 'parent' }
  const admin = await getSession()
  if (admin && admin.schoolId) return { schoolId: admin.schoolId, role: admin.role }
  return null
}

// ─── Syllabus tenant guard ──────────────────────────────────────────────────
// Mirrors requireFeeAccess's tenant-matching, but also admits teacher/student/
// parent sessions (getAnySession) since syllabus is read by every school role
// and written by teachers, not just school-admin staff.
export async function requireSyllabusAccess(requestedSchoolId: string | number | null | undefined):
  Promise<{ schoolId: number; role: string } | null> {
  const platformSession = await getPlatformSession()
  if (platformSession?.role === 'platform_admin') {
    const sid = requestedSchoolId != null ? Number(requestedSchoolId) : (platformSession.schoolId ?? 0)
    if (!sid) return null
    return { schoolId: sid, role: 'platform_admin' }
  }

  const session = await getAnySession()
  if (!session) return null
  if (requestedSchoolId != null && Number(requestedSchoolId) !== Number(session.schoolId)) {
    return null   // cross-tenant attempt
  }
  return session
}

// Write-capable roles only (teacher, school admin/principal/VP) — students and
// parents get requireSyllabusAccess for reads but must never mark/add/delete.
export async function requireSyllabusWriteAccess(requestedSchoolId: string | number | null | undefined):
  Promise<{ schoolId: number; role: string } | null> {
  const session = await requireSyllabusAccess(requestedSchoolId)
  if (!session) return null
  const WRITE_ROLES = ['teacher', 'school_admin', 'principal', 'vice_principal', 'platform_admin']
  if (!WRITE_ROLES.includes(session.role)) return null
  return session
}
