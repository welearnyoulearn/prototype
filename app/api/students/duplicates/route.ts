import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireSchoolAdmin } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const admin = await requireSchoolAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const school_id = parseInt(searchParams.get('school_id') ?? '')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  if (admin.schoolId !== school_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const result = await pool.query<{
      dup_id: number; keep_id: number; reason: string
      dup_name: string; dup_grade: string; dup_section: string; dup_school_roll_number: number | null
      dup_roll_number: string; dup_phone: string; dup_parent_phone: string; dup_parent_name: string
      dup_created_at: string; dup_status: string
      keep_name: string; keep_grade: string; keep_section: string; keep_school_roll_number: number | null
      keep_roll_number: string; keep_phone: string; keep_parent_phone: string; keep_parent_name: string
      keep_created_at: string; keep_status: string
    }>(`
      WITH roll_dups AS (
        SELECT id, school_id, name, grade, section, school_roll_number, roll_number,
               phone, parent_phone, parent_name, created_at, status,
               ROW_NUMBER() OVER (
                 PARTITION BY school_id, grade, section, school_roll_number
                 ORDER BY created_at ASC
               ) AS rn
        FROM students
        WHERE school_id = $1 AND school_roll_number IS NOT NULL AND status = 'active'
      ),
      roll_dup_pairs AS (
        SELECT d.id AS dup_id, k.id AS keep_id, 'roll_number' AS reason,
               d.name AS dup_name, d.grade AS dup_grade, d.section AS dup_section,
               d.school_roll_number AS dup_school_roll_number, d.roll_number AS dup_roll_number,
               d.phone AS dup_phone, d.parent_phone AS dup_parent_phone, d.parent_name AS dup_parent_name,
               d.created_at AS dup_created_at, d.status AS dup_status,
               k.name AS keep_name, k.grade AS keep_grade, k.section AS keep_section,
               k.school_roll_number AS keep_school_roll_number, k.roll_number AS keep_roll_number,
               k.phone AS keep_phone, k.parent_phone AS keep_parent_phone, k.parent_name AS keep_parent_name,
               k.created_at AS keep_created_at, k.status AS keep_status
        FROM roll_dups d
        JOIN roll_dups k ON k.school_id = d.school_id AND k.grade = d.grade
          AND k.section = d.section AND k.school_roll_number = d.school_roll_number AND k.rn = 1
        WHERE d.rn > 1
      ),
      parent_phone_dups AS (
        SELECT id, school_id, name, grade, section, school_roll_number, roll_number,
               phone, parent_phone, parent_name, created_at, status,
               ROW_NUMBER() OVER (
                 PARTITION BY school_id, name, parent_phone
                 ORDER BY created_at ASC
               ) AS rn
        FROM students
        WHERE school_id = $1 AND parent_phone IS NOT NULL AND status = 'active'
      ),
      parent_phone_dup_pairs AS (
        SELECT d.id AS dup_id, k.id AS keep_id, 'name+parent_phone' AS reason,
               d.name AS dup_name, d.grade AS dup_grade, d.section AS dup_section,
               d.school_roll_number AS dup_school_roll_number, d.roll_number AS dup_roll_number,
               d.phone AS dup_phone, d.parent_phone AS dup_parent_phone, d.parent_name AS dup_parent_name,
               d.created_at AS dup_created_at, d.status AS dup_status,
               k.name AS keep_name, k.grade AS keep_grade, k.section AS keep_section,
               k.school_roll_number AS keep_school_roll_number, k.roll_number AS keep_roll_number,
               k.phone AS keep_phone, k.parent_phone AS keep_parent_phone, k.parent_name AS keep_parent_name,
               k.created_at AS keep_created_at, k.status AS keep_status
        FROM parent_phone_dups d
        JOIN parent_phone_dups k ON k.school_id = d.school_id AND k.name = d.name
          AND k.parent_phone = d.parent_phone AND k.rn = 1
        WHERE d.rn > 1
      ),
      phone_dups AS (
        SELECT id, school_id, name, grade, section, school_roll_number, roll_number,
               phone, parent_phone, parent_name, created_at, status,
               ROW_NUMBER() OVER (
                 PARTITION BY school_id, name, phone
                 ORDER BY created_at ASC
               ) AS rn
        FROM students
        WHERE school_id = $1 AND phone IS NOT NULL AND status = 'active'
      ),
      phone_dup_pairs AS (
        SELECT d.id AS dup_id, k.id AS keep_id, 'name+phone' AS reason,
               d.name AS dup_name, d.grade AS dup_grade, d.section AS dup_section,
               d.school_roll_number AS dup_school_roll_number, d.roll_number AS dup_roll_number,
               d.phone AS dup_phone, d.parent_phone AS dup_parent_phone, d.parent_name AS dup_parent_name,
               d.created_at AS dup_created_at, d.status AS dup_status,
               k.name AS keep_name, k.grade AS keep_grade, k.section AS keep_section,
               k.school_roll_number AS keep_school_roll_number, k.roll_number AS keep_roll_number,
               k.phone AS keep_phone, k.parent_phone AS keep_parent_phone, k.parent_name AS keep_parent_name,
               k.created_at AS keep_created_at, k.status AS keep_status
        FROM phone_dups d
        JOIN phone_dups k ON k.school_id = d.school_id AND k.name = d.name
          AND k.phone = d.phone AND k.rn = 1
        WHERE d.rn > 1
      ),
      all_pairs AS (
        SELECT * FROM roll_dup_pairs
        UNION
        SELECT * FROM parent_phone_dup_pairs
        UNION
        SELECT * FROM phone_dup_pairs
      )
      SELECT DISTINCT ON (dup_id) * FROM all_pairs
      ORDER BY dup_id, reason
    `, [school_id])

    const groupMap = new Map<number, {
      keep: {
        id: number; name: string; grade: string; section: string
        school_roll_number: number | null; roll_number: string
        phone: string; parent_phone: string; parent_name: string
        created_at: string; status: string
      }
      duplicates: {
        id: number; name: string; grade: string; section: string
        school_roll_number: number | null; roll_number: string
        phone: string; parent_phone: string; parent_name: string
        created_at: string; status: string; reason: string
      }[]
      reason: string
    }>()

    for (const row of result.rows) {
      if (!groupMap.has(row.keep_id)) {
        groupMap.set(row.keep_id, {
          keep: {
            id: row.keep_id,
            name: row.keep_name,
            grade: row.keep_grade,
            section: row.keep_section,
            school_roll_number: row.keep_school_roll_number,
            roll_number: row.keep_roll_number,
            phone: row.keep_phone,
            parent_phone: row.keep_parent_phone,
            parent_name: row.keep_parent_name,
            created_at: row.keep_created_at,
            status: row.keep_status,
          },
          duplicates: [],
          reason: row.reason,
        })
      }
      groupMap.get(row.keep_id)!.duplicates.push({
        id: row.dup_id,
        name: row.dup_name,
        grade: row.dup_grade,
        section: row.dup_section,
        school_roll_number: row.dup_school_roll_number,
        roll_number: row.dup_roll_number,
        phone: row.dup_phone,
        parent_phone: row.dup_parent_phone,
        parent_name: row.dup_parent_name,
        created_at: row.dup_created_at,
        status: row.dup_status,
        reason: row.reason,
      })
    }

    const groups = Array.from(groupMap.values())
    const totalDuplicates = groups.reduce((sum, g) => sum + g.duplicates.length, 0)

    return NextResponse.json({ groups, total_duplicates: totalDuplicates, total_groups: groups.length })
  } catch (err) {
    console.error('[duplicates]', err)
    return NextResponse.json({ error: 'Failed to find duplicates' }, { status: 500 })
  }
}
