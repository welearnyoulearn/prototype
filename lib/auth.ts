import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { randomInt, randomUUID } from 'crypto'
import { cookies, headers } from 'next/headers'
import { NextRequest } from 'next/server'
import type { Pool as PgPool, PoolClient } from 'pg'
import pool from './db'
import { JWT_SECRET, COOKIE_ADMIN, COOKIE_PLATFORM, COOKIE_TEACHER, COOKIE_STUDENT, COOKIE_PARENT } from './auth-constants'

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days — teacher/student/parent/platform cookies

// School-staff sessions are short-lived and server-tracked (user_sessions table).
export const SESSION_IDLE_MINUTES = 20   // no authenticated activity for this long → logged out
export const SESSION_MAX_HOURS    = 12   // hard cap, however active the user is

// ─── Cookie names ─────────────────────────────────────────────────────────────
export { COOKIE_ADMIN, COOKIE_PLATFORM, COOKIE_TEACHER, COOKIE_STUDENT, COOKIE_PARENT }

// ─── JWT Payload types ────────────────────────────────────────────────────────
export type JWTPayload = {
  userId: number
  role: 'platform_admin' | 'school_admin' | 'principal' | 'vice_principal'
  schoolId?: number
  schoolCode?: string
  firstLogin: boolean
  profileCompleted: boolean
  sid?: string  // user_sessions.id — required for school-staff cookies, absent for platform admin
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

// Public feedback-form entry code — deliberately unrelated to school_code
// (the admin/teacher login identifier). This one gets printed on a QR
// poster anyone can scan or photograph, and must be freely rotatable
// without ever weakening or touching login.
export function generateFeedbackCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 10; i++) out += chars[randomInt(chars.length)]
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
function sign<T extends object>(payload: T, expiresIn: jwt.SignOptions['expiresIn'] = '7d'): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn })
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

// persistent=false writes a session cookie (no maxAge) that the browser drops on close.
async function setCookie(name: string, value: string, persistent = true) {
  const cookieStore = await cookies()
  cookieStore.set(name, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    ...(persistent ? { maxAge: COOKIE_MAX_AGE } : {}),
    path: '/',
  })
}

async function clearCookie(name: string) {
  const cookieStore = await cookies()
  cookieStore.delete(name)
}

// ─── Admin / Platform JWT ─────────────────────────────────────────────────────
export function signToken(payload: JWTPayload, expiresIn?: jwt.SignOptions['expiresIn']): string { return sign(payload, expiresIn) }
export function verifyToken(token: string): JWTPayload | null  { return verify<JWTPayload>(token) }
// COOKIE_ADMIN is for school-side staff only; Platform Admin uses COOKIE_PLATFORM
// (see lib/auth-constants.ts) so the two portals can't clobber each other's session.
// School-staff cookie: a browser-session cookie carrying a JWT that expires with the
// absolute session cap. Real validity is decided server-side in getSession().
export async function setAuthCookie(payload: JWTPayload) {
  await setCookie(COOKIE_ADMIN, signToken(payload, `${SESSION_MAX_HOURS}h`), false)
}
export async function clearAuthCookie()                        { await clearCookie(COOKIE_ADMIN) }
export async function setPlatformAuthCookie(payload: JWTPayload) { await setCookie(COOKIE_PLATFORM, signToken(payload)) }
export async function clearPlatformAuthCookie()                  { await clearCookie(COOKIE_PLATFORM) }

// ─── School-staff sessions (server-side, revocable) ───────────────────────────
export async function createStaffSession(userId: number): Promise<string> {
  const sid = randomUUID()
  const userAgent = (await headers()).get('user-agent')?.slice(0, 300) ?? null
  await pool.query(
    `INSERT INTO user_sessions (id, user_id, expires_at, user_agent)
     VALUES ($1, $2, NOW() + make_interval(hours => $3), $4)`,
    [sid, userId, SESSION_MAX_HOURS, userAgent]
  )
  return sid
}

export async function revokeSession(sid: string): Promise<void> {
  await pool.query(`UPDATE user_sessions SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL`, [sid])
}

// Ends every live session of a user (deactivation, password reset). exceptSid keeps
// the caller's own session alive when they change their own password.
export async function revokeUserSessions(userId: number, exceptSid?: string): Promise<void> {
  await pool.query(
    `UPDATE user_sessions SET revoked_at = NOW()
     WHERE user_id = $1 AND revoked_at IS NULL AND ($2::uuid IS NULL OR id <> $2::uuid)`,
    [userId, exceptSid ?? null]
  )
}

// Signature-only read of the cookie's session id — used by login/logout to end the
// previous session even when it has already idled out.
export async function getSessionIdFromCookie(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE_ADMIN)?.value
  if (!token) return null
  return verifyToken(token)?.sid ?? null
}

// `db` optionally reuses a caller's already-held PoolClient — see the matching
// note on schoolHasFeature above. requireFeeAccess() (below) routes through
// here for every school-staff fee request, so any fee route that calls
// pool.connect() before requireFeeAccess() must pass that client through, or
// this deadlocks itself waiting for a second connection on Vercel's max:1 pool.
async function validateStaffSession(touch: boolean, db: PgPool | PoolClient = pool): Promise<JWTPayload | null> {
  const token = (await cookies()).get(COOKIE_ADMIN)?.value
  if (!token) return null
  const payload = verifyToken(token)
  if (!payload?.sid) return null

  const { rows: [row] } = await db.query<{ stale: boolean }>(
    `SELECT (s.last_seen_at < NOW() - INTERVAL '30 seconds') AS stale
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.user_id = $2
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()
       AND s.last_seen_at > NOW() - make_interval(mins => $3)
       AND COALESCE(u.status, 'active') <> 'inactive'`,
    [payload.sid, payload.userId, SESSION_IDLE_MINUTES]
  )
  if (!row) return null

  if (touch && row.stale) {
    await db.query(`UPDATE user_sessions SET last_seen_at = NOW() WHERE id = $1`, [payload.sid])
  }
  return payload
}

// Validates the school-staff session: signed cookie, session row live (not revoked,
// not idle, not past the absolute cap) and the user still active.
// A normal call counts as user activity and pushes the idle timer forward. Background
// pollers (e.g. the notification bell) must pass { passive: true } — otherwise an
// abandoned tab would keep its session alive forever.
// `db` — see requireFeeAccess's matching parameter; threaded through to validateStaffSession.
export async function getSession(opts: { passive?: boolean; db?: PgPool | PoolClient } = {}): Promise<JWTPayload | null> {
  return validateStaffSession(!opts.passive, opts.db)
}

// Explicit activity ping, used by the browser heartbeat (POST /api/auth/session) for
// stretches where the user is reading/typing without triggering any API call.
export async function touchSession(): Promise<JWTPayload | null> {
  return validateStaffSession(true)
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
//
// `db` optionally reuses a caller's already-held PoolClient for the school-staff
// session check below (getSession -> validateStaffSession -> a real query). Any
// route that calls this AFTER its own pool.connect() must pass `client` here —
// otherwise, on Vercel's max:1 pool, this deadlocks requesting a second
// connection while the caller is still holding the only one.
export async function requireFeeAccess(requestedSchoolId: string | number | null | undefined, db?: PgPool | PoolClient):
  Promise<{ schoolId: number; role: string; userId: number; actor: string } | null> {
  // Platform admin: full access to any school (own cookie — see COOKIE_PLATFORM).
  // No pool access at all — just cookie verification — so `db` isn't needed here.
  const platformSession = await getPlatformSession()
  if (platformSession?.role === 'platform_admin') {
    const sid = requestedSchoolId != null ? Number(requestedSchoolId) : (platformSession.schoolId ?? 0)
    if (!sid) return null
    return { schoolId: sid, role: 'platform_admin', userId: platformSession.userId, actor: 'Platform Admin' }
  }

  // School staff (admin, principal, vice_principal): must match their own school
  const session = await getSession({ db })
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

// Tier hierarchy: premium includes standard includes basic — a feature only
// explicitly enabled at 'basic' must still read as enabled for a 'standard'
// or 'premium' school. Kept in exact sync with the TIER_INCLUDES map in
// GET /api/platform/features (the platform-admin config page and the
// school-admin sidebar's tier check both use that route's inheritance);
// schoolHasFeature used to check only the school's own literal tier, which
// silently disagreed with those two call sites for every feature enabled at
// a lower tier than the school's own — e.g. a premium school's student/parent
// nav would hide a feature that school-admin's own sidebar showed as on.
const TIER_INCLUDES: Record<string, string[]> = {
  basic: ['basic'],
  standard: ['basic', 'standard'],
  premium: ['basic', 'standard', 'premium'],
}

// ─── Per-school feature resolution ────────────────────────────────────────────
// Checks school_feature_overrides first (per-school, takes precedence), then
// falls back to the school's tier (plus everything it inherits) in
// plan_features. Unconfigured = disabled, matching the convention in
// GET /api/platform/features.
// `db` optionally reuses a caller's already-held PoolClient instead of asking
// the shared pool for a second connection. Required whenever a caller invokes
// this from inside a transaction it opened via pool.connect() — on Vercel's
// max:1 pool, calling this with the bare `pool` (the default) while a
// `client` is already held elsewhere in the same request deadlocks until
// connectionTimeoutMillis fails the whole request.
export async function schoolHasFeature(schoolId: number, featureKey: string, db: PgPool | PoolClient = pool): Promise<boolean> {
  const overrideRes = await db.query(
    `SELECT enabled FROM school_feature_overrides WHERE school_id = $1 AND feature_key = $2`,
    [schoolId, featureKey]
  )
  if (overrideRes.rows.length > 0) return overrideRes.rows[0].enabled

  const subRes = await db.query(
    `SELECT tier FROM school_subscriptions WHERE school_id = $1`,
    [schoolId]
  )
  if (subRes.rows.length === 0) return false
  const tiers = TIER_INCLUDES[subRes.rows[0].tier] ?? [subRes.rows[0].tier]

  const tierRes = await db.query(
    `SELECT bool_or(enabled) AS enabled FROM plan_features WHERE tier = ANY($1) AND feature_key = $2`,
    [tiers, featureKey]
  )
  return tierRes.rows[0]?.enabled === true
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
