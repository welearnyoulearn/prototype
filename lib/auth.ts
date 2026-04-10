import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'

const JWT_SECRET = process.env.JWT_SECRET || 'wlyl-super-secret-key-change-in-production'
const COOKIE_NAME = 'wlyl-auth'
const TEACHER_COOKIE_NAME = 'wlyl-teacher'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

// ─── Admin/platform JWT payload ───────────────────────────────────────────────
export type JWTPayload = {
  userId: number
  role: 'platform_admin' | 'school_admin'
  schoolId?: number
  schoolCode?: string
  firstLogin: boolean
  profileCompleted: boolean
}

// ─── Teacher JWT payload ───────────────────────────────────────────────────────
export type TeacherJWTPayload = {
  teacherId: number
  schoolId: number
  role: 'teacher'
  passwordChanged: boolean
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
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

// ─── JWT helpers ──────────────────────────────────────────────────────────────
export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    // Strip JWT standard claims (iat, exp, nbf) so they don't conflict
    // when the payload is spread into a new signToken call
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload & { iat?: number; exp?: number; nbf?: number }
    const { iat: _iat, exp: _exp, nbf: _nbf, ...payload } = decoded
    return payload as JWTPayload
  } catch {
    return null
  }
}

// ─── Cookie helpers (server components / route handlers) ──────────────────────
export async function setAuthCookie(payload: JWTPayload): Promise<void> {
  const token = signToken(payload)
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  })
}

export async function clearAuthCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

export async function getSession(): Promise<JWTPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifyToken(token)
}

// ─── Teacher cookie helpers ────────────────────────────────────────────────────
export function signTeacherToken(payload: TeacherJWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

export function verifyTeacherToken(token: string): TeacherJWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TeacherJWTPayload & { iat?: number; exp?: number }
    const { iat: _iat, exp: _exp, ...payload } = decoded
    return payload as TeacherJWTPayload
  } catch {
    return null
  }
}

export async function setTeacherAuthCookie(payload: TeacherJWTPayload): Promise<void> {
  const token = signTeacherToken(payload)
  const cookieStore = await cookies()
  cookieStore.set(TEACHER_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  })
}

export async function clearTeacherAuthCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(TEACHER_COOKIE_NAME)
}

export async function getTeacherSession(): Promise<TeacherJWTPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(TEACHER_COOKIE_NAME)?.value
  if (!token) return null
  return verifyTeacherToken(token)
}

export function getTeacherSessionFromRequest(req: NextRequest): TeacherJWTPayload | null {
  const token = req.cookies.get(TEACHER_COOKIE_NAME)?.value
  if (!token) return null
  return verifyTeacherToken(token)
}

// ─── Middleware token extraction (Edge runtime) ───────────────────────────────
export function getSessionFromRequest(req: NextRequest): JWTPayload | null {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifyToken(token)
}

// ─── School code generator ────────────────────────────────────────────────────
export function generateSchoolCode(schoolName: string, schoolId: number): string {
  const slug = schoolName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 20)
  return `wlyl-schl-${slug}-${schoolId}`
}

// ─── Platform Admin API guard ─────────────────────────────────────────────────
// Use in API route handlers to reject non-platform-admin requests.
export async function requirePlatformAdmin(): Promise<JWTPayload | null> {
  const session = await getSession()
  if (!session || session.role !== 'platform_admin') return null
  return session
}

// ─── School Admin API guard ───────────────────────────────────────────────────
export async function requireSchoolAdmin(): Promise<JWTPayload | null> {
  const session = await getSession()
  if (!session || session.role !== 'school_admin') return null
  return session
}

// ─── Reset token generator ────────────────────────────────────────────────────
export function generateResetToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < 48; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}
