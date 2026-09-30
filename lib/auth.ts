import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { createHash, randomBytes, randomInt, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'crypto'
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
  sid?: string
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
  sid?: string
}

export type ParentJWTPayload = {
  parentId: number
  schoolId: number
  role: 'parent'
  passwordChanged: boolean
  name: string
  email: string
  sid?: string
}

// ─── Password helpers ─────────────────────────────────────────────────────────
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12)
}

function scryptAsync(
  plain: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(plain, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error)
      else resolve(derivedKey)
    })
  })
}
const PORTAL_SCRYPT_N = 32768
const PORTAL_SCRYPT_R = 8
const PORTAL_SCRYPT_P = 1
const PORTAL_SCRYPT_KEYLEN = 64

// Bulk admission can create dozens of portal credentials at once. bcryptjs is
// CPU-bound JavaScript and made an 11-student batch take ~30 seconds. scrypt is
// memory-hard and runs in Node's native worker pool, preserving a strong password
// hash while allowing independent credentials to be derived concurrently.
export async function hashPortalPassword(plain: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scryptAsync(plain, salt, PORTAL_SCRYPT_KEYLEN, {
    N: PORTAL_SCRYPT_N,
    r: PORTAL_SCRYPT_R,
    p: PORTAL_SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  })
  return `scrypt$${PORTAL_SCRYPT_N}$${PORTAL_SCRYPT_R}$${PORTAL_SCRYPT_P}$${salt.toString('hex')}$${derived.toString('hex')}`
}

async function verifyScryptPassword(plain: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [n, r, p] = parts.slice(1, 4).map(Number)
  if (n !== PORTAL_SCRYPT_N || r !== PORTAL_SCRYPT_R || p !== PORTAL_SCRYPT_P) return false
  const salt = Buffer.from(parts[4], 'hex')
  const expected = Buffer.from(parts[5], 'hex')
  if (salt.length !== 16 || expected.length !== PORTAL_SCRYPT_KEYLEN) return false
  const actual = await scryptAsync(plain, salt, expected.length, {
    N: n, r, p, maxmem: 64 * 1024 * 1024,
  })
  return timingSafeEqual(actual, expected)
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return hash.startsWith('scrypt$') ? verifyScryptPassword(plain, hash) : bcrypt.compare(plain, hash)
}

const DUMMY_PASSWORD_HASH = '$2b$12$gd232DmMflF.IPscOO49YOIHulvSZfj1S.bsdMIkiuUQnr7mSaVu6'
export function verifyPasswordForLogin(plain: string, hash?: string | null): Promise<boolean> {
  return hash ? verifyPassword(plain, hash) : bcrypt.compare(plain, DUMMY_PASSWORD_HASH)
}

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789',
  'qwerty123', 'admin123', 'welcome1', 'letmein1', 'student123',
])

export function validateNewPassword(password: unknown, identity?: string | null): string | null {
  if (typeof password !== 'string') return 'Password is required'
  if (password.length < 8) return 'Password must be at least 8 characters'
  if (password.length > 128) return 'Password must be no more than 128 characters'
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return 'Password must include uppercase, lowercase, and a number'
  }
  const normalized = password.toLowerCase()
  if (COMMON_PASSWORDS.has(normalized)) return 'Choose a less common password'
  if (identity && normalized === identity.trim().toLowerCase()) return 'Password cannot match your login identifier'
  return null
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

export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
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
    const payload = { ...decoded }
    delete payload.iat
    delete payload.exp
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
export async function setPlatformAuthCookie(payload: JWTPayload) { await setCookie(COOKIE_PLATFORM, signToken(payload, `${SESSION_MAX_HOURS}h`), false) }
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
export async function revokeUserSessions(userId: number, exceptSid?: string, db: PgPool | PoolClient = pool): Promise<void> {
  await db.query(
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

export async function getPlatformSessionIdFromCookie(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE_PLATFORM)?.value
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
export async function getSession(opts: { passive?: boolean; db?: PgPool | PoolClient; allowFirstLogin?: boolean } = {}): Promise<JWTPayload | null> {
  const session = await validateStaffSession(!opts.passive, opts.db)
  if (session?.firstLogin && !opts.allowFirstLogin) return null
  return session
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
  const payload = verifyToken(token)
  if (!payload?.sid || payload.role !== 'platform_admin') return null
  const { rows } = await pool.query(
    `SELECT 1 FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.user_id = $2
       AND s.revoked_at IS NULL AND s.expires_at > NOW()
       AND s.last_seen_at > NOW() - make_interval(mins => $3)
       AND u.role = 'platform_admin' AND COALESCE(u.status, 'active') = 'active'`,
    [payload.sid, payload.userId, SESSION_IDLE_MINUTES],
  )
  if (!rows.length) return null
  await pool.query(`UPDATE user_sessions SET last_seen_at = NOW() WHERE id = $1 AND last_seen_at < NOW() - INTERVAL '30 seconds'`, [payload.sid])
  return payload
}

export async function requirePlatformAdmin(): Promise<JWTPayload | null> {
  const session = await getPlatformSession()
  if (!session || session.role !== 'platform_admin' || session.firstLogin) return null
  return session
}

export async function requireSchoolAdmin(): Promise<JWTPayload | null> {
  const session = await getSession()
  if (!session) return null
  const SCHOOL_ROLES = ['school_admin', 'principal', 'vice_principal']
  if (!SCHOOL_ROLES.includes(session.role)) return null
  return session
}

type PortalActorType = 'teacher' | 'student' | 'parent'

export async function createPortalSession(actorType: PortalActorType, actorId: number, schoolId: number): Promise<string> {
  const sid = randomUUID()
  const userAgent = (await headers()).get('user-agent')?.slice(0, 300) ?? null
  await pool.query(
    `INSERT INTO portal_sessions (id, actor_type, actor_id, school_id, expires_at, user_agent)
     VALUES ($1, $2, $3, $4, NOW() + make_interval(hours => $5), $6)`,
    [sid, actorType, actorId, schoolId, SESSION_MAX_HOURS, userAgent],
  )
  return sid
}

export async function revokePortalSession(sid: string): Promise<void> {
  await pool.query(`UPDATE portal_sessions SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL`, [sid])
}

export async function revokePortalSessions(
  actorType: PortalActorType,
  actorId: number,
  exceptSid?: string,
  db: PgPool | PoolClient = pool,
): Promise<void> {
  await db.query(
    `UPDATE portal_sessions SET revoked_at = NOW()
      WHERE actor_type = $1 AND actor_id = $2 AND revoked_at IS NULL
        AND ($3::uuid IS NULL OR id <> $3::uuid)`,
    [actorType, actorId, exceptSid ?? null],
  )
}

async function validatePortalSession<T extends { sid?: string; schoolId: number }>(
  payload: T | null,
  actorType: PortalActorType,
  actorId: number,
): Promise<T | null> {
  if (!payload?.sid) return null
  const { rows } = await pool.query(
    `SELECT 1 FROM portal_sessions
      WHERE id = $1 AND actor_type = $2 AND actor_id = $3 AND school_id = $4
        AND revoked_at IS NULL AND expires_at > NOW()
        AND last_seen_at > NOW() - make_interval(mins => $5)`,
    [payload.sid, actorType, actorId, payload.schoolId, SESSION_IDLE_MINUTES],
  )
  if (!rows.length) return null
  await pool.query(`UPDATE portal_sessions SET last_seen_at = NOW() WHERE id = $1 AND last_seen_at < NOW() - INTERVAL '30 seconds'`, [payload.sid])
  return payload
}

export async function getPortalSessionIdFromCookie(actorType: PortalActorType): Promise<string | null> {
  const cookieStore = await cookies()
  if (actorType === 'teacher') return verifyTeacherToken(cookieStore.get(COOKIE_TEACHER)?.value || '')?.sid ?? null
  if (actorType === 'student') return verifyStudentToken(cookieStore.get(COOKIE_STUDENT)?.value || '')?.sid ?? null
  return verifyParentToken(cookieStore.get(COOKIE_PARENT)?.value || '')?.sid ?? null
}

// ─── Teacher JWT ──────────────────────────────────────────────────────────────
export function signTeacherToken(payload: TeacherJWTPayload): string              { return sign(payload) }
export function verifyTeacherToken(token: string): TeacherJWTPayload | null       { return verify<TeacherJWTPayload>(token) }
export async function setTeacherAuthCookie(payload: TeacherJWTPayload)            { await setCookie(COOKIE_TEACHER, sign(payload, `${SESSION_MAX_HOURS}h`), false) }
export async function clearTeacherAuthCookie()                                    { await clearCookie(COOKIE_TEACHER) }

export async function getTeacherSession(opts: { allowFirstLogin?: boolean } = {}): Promise<TeacherJWTPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_TEACHER)?.value
  if (!token) return null
  const payload = verifyTeacherToken(token)
  const validated = await validatePortalSession(payload, 'teacher', payload?.teacherId ?? 0)
  if (!validated) return null
  const { rows } = await pool.query(
    `SELECT 1 FROM teachers
     WHERE id = $1 AND school_id = $2 AND status = 'active' AND removed_at IS NULL`,
    [validated.teacherId, validated.schoolId],
  )
  if (!rows.length || (!validated.passwordChanged && !opts.allowFirstLogin)) return null
  return validated
}

export function getTeacherSessionFromRequest(req: NextRequest): TeacherJWTPayload | null {
  const token = req.cookies.get(COOKIE_TEACHER)?.value
  if (!token) return null
  return verifyTeacherToken(token)
}

// ─── Student JWT ──────────────────────────────────────────────────────────────
export function signStudentToken(payload: StudentJWTPayload): string              { return sign(payload) }
export function verifyStudentToken(token: string): StudentJWTPayload | null       { return verify<StudentJWTPayload>(token) }
export async function setStudentAuthCookie(payload: StudentJWTPayload)            { await setCookie(COOKIE_STUDENT, sign(payload, `${SESSION_MAX_HOURS}h`), false) }
export async function clearStudentAuthCookie()                                    { await clearCookie(COOKIE_STUDENT) }

export async function getStudentSession(opts: { allowFirstLogin?: boolean } = {}): Promise<StudentJWTPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_STUDENT)?.value
  if (!token) return null
  const payload = verifyStudentToken(token)
  const validated = await validatePortalSession(payload, 'student', payload?.studentId ?? 0)
  if (!validated) return null
  const { rows } = await pool.query(
    `SELECT 1 FROM students WHERE id = $1 AND school_id = $2 AND status = 'active'`,
    [validated.studentId, validated.schoolId],
  )
  if (!rows.length || (!validated.passwordChanged && !opts.allowFirstLogin)) return null
  return validated
}

export function getStudentSessionFromRequest(req: NextRequest): StudentJWTPayload | null {
  const token = req.cookies.get(COOKIE_STUDENT)?.value
  if (!token) return null
  return verifyStudentToken(token)
}

// ─── Parent JWT ───────────────────────────────────────────────────────────────
export function signParentToken(payload: ParentJWTPayload): string                { return sign(payload) }
export function verifyParentToken(token: string): ParentJWTPayload | null         { return verify<ParentJWTPayload>(token) }
export async function setParentAuthCookie(payload: ParentJWTPayload)              { await setCookie(COOKIE_PARENT, sign(payload, `${SESSION_MAX_HOURS}h`), false) }
export async function clearParentAuthCookie()                                     { await clearCookie(COOKIE_PARENT) }

export async function getParentSession(opts: { allowFirstLogin?: boolean } = {}): Promise<ParentJWTPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_PARENT)?.value
  if (!token) return null
  const payload = verifyParentToken(token)
  const validated = await validatePortalSession(payload, 'parent', payload?.parentId ?? 0)
  if (!validated) return null
  const { rows } = await pool.query(
    `SELECT 1 FROM parents WHERE id = $1 AND school_id = $2`,
    [validated.parentId, validated.schoolId],
  )
  if (!rows.length || (!validated.passwordChanged && !opts.allowFirstLogin)) return null
  return validated
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
  // An expired plan keeps its features: features are not downgraded; the school is locked instead (see proxy.ts).
  const tiers = TIER_INCLUDES[subRes.rows[0].tier] ?? [subRes.rows[0].tier]

  const tierRes = await db.query(
    `SELECT bool_or(enabled) AS enabled FROM plan_features WHERE tier = ANY($1) AND feature_key = $2`,
    [tiers, featureKey]
  )
  return tierRes.rows[0]?.enabled === true
}

export async function schoolHasAnyFeature(schoolId: number, featureKeys: readonly string[], db: PgPool | PoolClient = pool): Promise<boolean> {
  for (const featureKey of featureKeys) if (await schoolHasFeature(schoolId, featureKey, db)) return true
  return false
}

// Resolve portal navigation in bounded queries using the same override and
// inherited-tier rules as API authorization.
export async function enabledFeaturesForSchool(schoolId: number, featureKeys: readonly string[], db: PgPool | PoolClient = pool): Promise<string[]> {
  if (featureKeys.length === 0) return []
  const overrideRes = await db.query<{ feature_key: string; enabled: boolean }>(
    `SELECT feature_key, enabled FROM school_feature_overrides WHERE school_id=$1 AND feature_key=ANY($2)`,
    [schoolId, featureKeys],
  )
  const overrides = new Map(overrideRes.rows.map(row => [row.feature_key, row.enabled]))
  const subRes = await db.query<{ tier: string }>('SELECT tier FROM school_subscriptions WHERE school_id=$1', [schoolId])
  const tier = subRes.rows[0]?.tier
  if (!tier) return featureKeys.filter(key => overrides.get(key) === true)
  const tiers = TIER_INCLUDES[tier] ?? [tier]
  const planRes = await db.query<{ feature_key: string }>(
    `SELECT feature_key FROM plan_features WHERE tier=ANY($1) AND feature_key=ANY($2)
     GROUP BY feature_key HAVING bool_or(enabled)=TRUE`,
    [tiers, featureKeys],
  )
  const planEnabled = new Set(planRes.rows.map(row => row.feature_key))
  return featureKeys.filter(key => overrides.has(key) ? overrides.get(key) === true : planEnabled.has(key))
}

// schoolHasFeature for every school at once, inverted: school id → the given feature keys it
// does NOT have. Same resolution as above (override, else tier plus inherited tiers, else
// disabled), in three queries instead of three per school per key. Used by proxy.ts, through
// /api/internal/feature-denials, to refuse feature APIs a school is not entitled to (#253).
export async function disabledFeaturesBySchool(featureKeys: readonly string[], db: PgPool | PoolClient = pool): Promise<Record<number, string[]>> {
  const [schools, overrides, plan] = await Promise.all([
    db.query<{ id: number; tier: string | null }>(
      `SELECT s.id, ss.tier FROM schools s LEFT JOIN school_subscriptions ss ON ss.school_id = s.id WHERE s.deleted_at IS NULL`
    ),
    db.query<{ school_id: number; feature_key: string; enabled: boolean }>(
      `SELECT school_id, feature_key, enabled FROM school_feature_overrides WHERE feature_key = ANY($1)`, [featureKeys]
    ),
    db.query<{ tier: string; feature_key: string }>(
      `SELECT tier, feature_key FROM plan_features WHERE enabled = TRUE AND feature_key = ANY($1)`, [featureKeys]
    ),
  ])
  const override = new Map(overrides.rows.map(r => [`${r.school_id}:${r.feature_key}`, r.enabled]))
  const tierHas = new Set(plan.rows.map(r => `${r.tier}:${r.feature_key}`))

  const out: Record<number, string[]> = {}
  for (const s of schools.rows) {
    const tiers = s.tier ? (TIER_INCLUDES[s.tier] ?? [s.tier]) : []
    const denied = featureKeys.filter(key => {
      const o = override.get(`${s.id}:${key}`)
      if (o !== undefined) return !o
      return !tiers.some(t => tierHas.has(`${t}:${key}`))
    })
    if (denied.length) out[s.id] = denied
  }
  return out
}

// ─── Any authenticated session ────────────────────────────────────────────────
// Returns the schoolId and role for whichever session cookie is present.
// Used on routes accessible by teachers, students, and school admins alike.
export type SyllabusSession = {
  schoolId: number
  role: string
  actorId?: number
}

export async function getAnySession(): Promise<SyllabusSession | null> {
  // Prefer the school-staff cookie when multiple portal cookies coexist in
  // one browser. Otherwise a stale teacher/student cookie can shadow a valid
  // school-admin session and incorrectly downgrade legitimate admin requests.
  const admin = await getSession()
  if (admin && admin.schoolId) return { schoolId: admin.schoolId, role: admin.role, actorId: admin.userId }
  const teacher = await getTeacherSession()
  if (teacher) return { schoolId: teacher.schoolId, role: 'teacher', actorId: teacher.teacherId }
  const student = await getStudentSession()
  if (student) return { schoolId: student.schoolId, role: 'student', actorId: student.studentId }
  const parent = await getParentSession()
  if (parent) return { schoolId: parent.schoolId, role: 'parent', actorId: parent.parentId }
  return null
}

// ─── Syllabus tenant guard ──────────────────────────────────────────────────
// Mirrors requireFeeAccess's tenant-matching, but also admits teacher/student/
// parent sessions (getAnySession) since syllabus is read by every school role
// and written by teachers, not just school-admin staff.
export async function requireSyllabusAccess(requestedSchoolId: string | number | null | undefined):
  Promise<SyllabusSession | null> {
  const platformSession = await getPlatformSession()
  if (platformSession?.role === 'platform_admin') {
    const sid = requestedSchoolId != null ? Number(requestedSchoolId) : (platformSession.schoolId ?? 0)
    if (!sid) return null
    return { schoolId: sid, role: 'platform_admin', actorId: platformSession.userId }
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
  Promise<SyllabusSession | null> {
  const session = await requireSyllabusAccess(requestedSchoolId)
  if (!session) return null
  const WRITE_ROLES = ['teacher', 'school_admin', 'principal', 'vice_principal', 'platform_admin']
  if (!WRITE_ROLES.includes(session.role)) return null
  return session
}

// Enforces record-level syllabus access after the tenant/session guard above.
// A class teacher may manage every subject in their class; a subject teacher
// may manage only their assigned class+subject. Students may read only their
// own class and parents only classes containing one of their linked children.
// Staff admins and platform admins retain their intended school-wide access.
export async function canAccessSyllabusClass(
  session: SyllabusSession,
  classId: string | number,
  subject?: string | null,
): Promise<boolean> {
  const { rows: [classRow] } = await pool.query(
    `SELECT id, school_id, grade, section, class_teacher_id
       FROM classes
      WHERE id = $1 AND school_id = $2 AND deleted_at IS NULL`,
    [classId, session.schoolId],
  )
  if (!classRow) return false

  if (['platform_admin', 'school_admin', 'principal', 'vice_principal'].includes(session.role)) return true
  if (!session.actorId) return false

  if (session.role === 'teacher') {
    if (Number(classRow.class_teacher_id) === Number(session.actorId)) return true
    const params: Array<string | number> = [classId, session.actorId]
    let sql = `SELECT 1 FROM class_subjects
                WHERE class_id = $1 AND teacher_id = $2`
    if (subject) {
      params.push(subject)
      sql += ` AND LOWER(TRIM(subject_name)) = LOWER(TRIM($3))`
    }
    sql += ' LIMIT 1'
    return (await pool.query(sql, params)).rows.length > 0
  }

  if (session.role === 'student') {
    const { rows } = await pool.query(
      `SELECT 1 FROM students
        WHERE id = $1 AND school_id = $2 AND status = 'active'
          AND grade = $3 AND section = $4
        LIMIT 1`,
      [session.actorId, session.schoolId, classRow.grade, classRow.section],
    )
    return rows.length > 0
  }

  if (session.role === 'parent') {
    const { rows } = await pool.query(
      `SELECT 1
         FROM student_parents sp
         JOIN students s ON s.id = sp.student_id
        WHERE sp.parent_id = $1 AND s.school_id = $2 AND s.status = 'active'
          AND s.grade = $3 AND s.section = $4
        LIMIT 1`,
      [session.actorId, session.schoolId, classRow.grade, classRow.section],
    )
    return rows.length > 0
  }

  return false
}

export async function canWriteSyllabusClass(
  session: SyllabusSession,
  classId: string | number,
  subject?: string | null,
): Promise<boolean> {
  if (!['teacher', 'school_admin', 'principal', 'vice_principal', 'platform_admin'].includes(session.role)) return false
  return canAccessSyllabusClass(session, classId, subject)
}
