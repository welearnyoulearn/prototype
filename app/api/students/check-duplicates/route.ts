import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireSchoolAdmin } from '@/lib/auth'

type IncomingStudent = {
  name: string
  grade: string
  section: string
  school_roll_number?: number | null
  phone?: string | null
  parent_phone?: string | null
}

type ExistingMatch = {
  row: number
  name: string
  reason: 'roll_number' | 'phone' | 'name+parent_phone'
  matched_student: { id: number; name: string; created_at: string }
}

export async function POST(req: NextRequest) {
  const admin = await requireSchoolAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body: { school_id: number; students: IncomingStudent[] } = await req.json()
  const { school_id, students } = body
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  if (admin.schoolId !== school_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!Array.isArray(students) || students.length === 0) {
    return NextResponse.json({ existing: [], new_count: 0, existing_count: 0 })
  }

  const rollKeys = students
    .filter(s => s.school_roll_number && s.grade?.trim() && s.section?.trim())
    .map(s => ({ grade: s.grade.trim(), section: s.section.trim(), roll: s.school_roll_number as number }))

  const parentPhones = students.map(s => s.parent_phone?.trim()).filter(Boolean) as string[]
  const phones = students.map(s => s.phone?.trim()).filter(Boolean) as string[]

  const [rollRows, parentPhoneRows, phoneRows] = await Promise.all([
    rollKeys.length > 0
      ? pool.query<{ id: number; grade: string; section: string; school_roll_number: number; name: string; created_at: string }>(
          `SELECT id, grade, section, school_roll_number, name, created_at
           FROM students WHERE school_id = $1
           AND (grade, section, school_roll_number) IN (${rollKeys.map((_, i) => `($${i * 3 + 2},$${i * 3 + 3},$${i * 3 + 4})`).join(',')})
           AND status = 'active'`,
          [school_id, ...rollKeys.flatMap(r => [r.grade, r.section, r.roll])]
        )
      : Promise.resolve({ rows: [] as { id: number; grade: string; section: string; school_roll_number: number; name: string; created_at: string }[] }),
    parentPhones.length > 0
      ? pool.query<{ id: number; name: string; parent_phone: string; created_at: string }>(
          `SELECT id, name, parent_phone, created_at FROM students
           WHERE school_id = $1 AND parent_phone = ANY($2) AND status = 'active'`,
          [school_id, parentPhones]
        )
      : Promise.resolve({ rows: [] as { id: number; name: string; parent_phone: string; created_at: string }[] }),
    phones.length > 0
      ? pool.query<{ id: number; name: string; phone: string; created_at: string }>(
          `SELECT id, name, phone, created_at FROM students
           WHERE school_id = $1 AND phone = ANY($2) AND status = 'active'`,
          [school_id, phones]
        )
      : Promise.resolve({ rows: [] as { id: number; name: string; phone: string; created_at: string }[] }),
  ])

  const rollMap = new Map(
    rollRows.rows.map(r => [`${r.grade}|${r.section}|${r.school_roll_number}`, r])
  )
  const parentPhoneMap = new Map(
    parentPhoneRows.rows.map(r => [`${r.name}|${r.parent_phone}`, r])
  )
  const phoneMap = new Map(
    phoneRows.rows.map(r => [`${r.name}|${r.phone}`, r])
  )

  const existing: ExistingMatch[] = []
  const checkedRows = new Set<number>()

  students.forEach((s, idx) => {
    const row = idx + 1
    if (s.school_roll_number && s.grade?.trim() && s.section?.trim()) {
      const key = `${s.grade.trim()}|${s.section.trim()}|${s.school_roll_number}`
      const match = rollMap.get(key)
      if (match) {
        existing.push({ row, name: s.name, reason: 'roll_number', matched_student: { id: match.id, name: match.name, created_at: match.created_at } })
        checkedRows.add(idx)
        return
      }
    }
    if (!checkedRows.has(idx) && s.parent_phone?.trim()) {
      const key = `${s.name}|${s.parent_phone.trim()}`
      const match = parentPhoneMap.get(key)
      if (match) {
        existing.push({ row, name: s.name, reason: 'name+parent_phone', matched_student: { id: match.id, name: match.name, created_at: match.created_at } })
        checkedRows.add(idx)
        return
      }
    }
    if (!checkedRows.has(idx) && s.phone?.trim()) {
      const key = `${s.name}|${s.phone.trim()}`
      const match = phoneMap.get(key)
      if (match) {
        existing.push({ row, name: s.name, reason: 'phone', matched_student: { id: match.id, name: match.name, created_at: match.created_at } })
        checkedRows.add(idx)
      }
    }
  })

  return NextResponse.json({
    existing,
    new_count: students.length - existing.length,
    existing_count: existing.length,
  })
}
