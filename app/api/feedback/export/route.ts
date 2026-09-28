import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import pool from '@/lib/db'
import { requireFeeAccess } from '@/lib/auth'
import { feedbackSourceFilter, olderThanFilter } from '@/lib/feedback-source'
import { ADVANCED_FORM_TYPES, FEEDBACK_ROLES } from '@/lib/feedback-defaults'
import { ADVANCED_FORM_FIELDS, type AdvancedFormType } from '@/app/feedback/[code]/types'

const MOOD = ['', 'Terrible', 'Bad', 'Okay', 'Good', 'Amazing']

function ist(d: Date | string | null): string {
  if (!d) return ''
  return new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function styleHeader(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1)
  row.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF245B46' } }
    cell.alignment = { vertical: 'middle' }
  })
  row.height = 22
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } }
}

// GET /api/feedback/export?school_id=&source=&older_than_days=
// Excel of every submission in a folder (source — see lib/feedback-source.ts,
// including 'archived'), optionally only those older than N days. The Clear
// folder dialog requires this download before it will archive anything.
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const school_id = sp.get('school_id')
    if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

    const access = await requireFeeAccess(school_id)
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const params: unknown[] = [access.schoolId]
    const source = sp.get('source') ?? 'all'
    const src = feedbackSourceFilter(source, 's', params)
    const older = olderThanFilter(sp.get('older_than_days'), 's', params)
    if (src === null || older === null) return NextResponse.json({ error: 'Invalid filter' }, { status: 400 })

    const [{ rows: subs }, { rows: [school] }, { rows: [point] }] = await Promise.all([
      pool.query(
        `SELECT s.id, s.created_at, s.archived_at, s.role, s.is_anonymous, s.submitter_name, s.submitter_phone,
                s.quick_pick_tags, s.free_text, (s.voice_object_key IS NOT NULL) AS has_voice,
                s.advanced_form_type, s.advanced_form_data, p.title AS qr_point_title,
                COALESCE(json_agg(json_build_object('label', r.category_label, 'rating', r.rating, 'priority', r.priority, 'status', r.status)
                         ORDER BY r.id) FILTER (WHERE r.id IS NOT NULL), '[]') AS ratings
         FROM feedback_submissions s
         LEFT JOIN feedback_submission_ratings r ON r.submission_id = s.id
         LEFT JOIN feedback_qr_points p ON p.id = s.qr_point_id
         WHERE s.school_id = $1 ${src}${older}
         GROUP BY s.id, p.id
         ORDER BY s.created_at DESC`,
        params
      ),
      pool.query(`SELECT name FROM schools WHERE id = $1`, [access.schoolId]),
      /^\d+$/.test(source)
        ? pool.query(`SELECT title FROM feedback_qr_points WHERE id = $1 AND school_id = $2`, [source, access.schoolId])
        : Promise.resolve({ rows: [] as { title: string }[] }),
    ])

    const folderName = source === 'general' ? 'School-wide QR' : source === 'archived' ? 'Archive' : source === 'all' ? 'All feedback' : (point?.title ?? 'Folder')
    const roleLabel = (r: string) => FEEDBACK_ROLES.find(x => x.key === r)?.label ?? r

    const wb = new ExcelJS.Workbook()
    wb.creator = 'WeLearnYouLearn'
    wb.created = new Date()

    // Sheet 1 — one row per submission
    const ws = wb.addWorksheet('Feedback')
    ws.columns = [
      { header: 'Submitted (IST)', key: 'at', width: 22 },
      { header: 'Folder', key: 'folder', width: 22 },
      { header: 'Audience', key: 'role', width: 14 },
      { header: 'Name', key: 'name', width: 20 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Type', key: 'type', width: 22 },
      { header: 'Avg rating', key: 'avg', width: 11 },
      { header: 'Ratings', key: 'ratings', width: 48 },
      { header: 'Open issues', key: 'issues', width: 12 },
      { header: 'Tags', key: 'tags', width: 26 },
      { header: 'Comment', key: 'comment', width: 50 },
      { header: 'Form answers', key: 'answers', width: 60 },
      { header: 'Voice note', key: 'voice', width: 11 },
      ...(source === 'archived' ? [{ header: 'Archived (IST)', key: 'archived', width: 22 }] : []),
    ]
    for (const s of subs) {
      const ratings = s.ratings as { label: string; rating: number; priority: string | null; status: string }[]
      const avg = ratings.length ? ratings.reduce((a, r) => a + r.rating, 0) / ratings.length : null
      const formType = s.advanced_form_type as AdvancedFormType | null
      const answers = formType
        ? ADVANCED_FORM_FIELDS[formType]
            .filter(f => s.advanced_form_data?.[f.key])
            .map(f => `${f.label}: ${s.advanced_form_data[f.key]}`).join('\n')
        : ''
      const row = ws.addRow({
        at: ist(s.created_at),
        folder: s.qr_point_title ?? 'School-wide QR',
        role: roleLabel(s.role),
        name: s.is_anonymous ? 'Anonymous' : (s.submitter_name ?? ''),
        phone: s.is_anonymous ? '' : (s.submitter_phone ?? ''),
        type: formType ? (ADVANCED_FORM_TYPES.find(t => t.key === formType)?.label ?? formType) : 'Rating form',
        avg: avg != null ? Number(avg.toFixed(1)) : '',
        ratings: ratings.map(r => `${r.label}: ${r.rating}/5 (${MOOD[r.rating]})`).join('; '),
        issues: ratings.filter(r => r.priority && r.status === 'open').length || '',
        tags: s.quick_pick_tags ?? '',
        comment: s.free_text ?? '',
        answers,
        voice: s.has_voice ? 'Yes' : '',
        archived: ist(s.archived_at),
      })
      row.alignment = { vertical: 'top', wrapText: true }
    }
    styleHeader(ws)

    // Sheet 2 — one row per rating (easy to pivot / filter by category)
    const rs = wb.addWorksheet('Ratings')
    rs.columns = [
      { header: 'Submitted (IST)', key: 'at', width: 22 },
      { header: 'Folder', key: 'folder', width: 22 },
      { header: 'Audience', key: 'role', width: 14 },
      { header: 'Category', key: 'category', width: 24 },
      { header: 'Rating (1-5)', key: 'rating', width: 12 },
      { header: 'Mood', key: 'mood', width: 12 },
      { header: 'Issue', key: 'issue', width: 14 },
    ]
    for (const s of subs) {
      for (const r of s.ratings as { label: string; rating: number; priority: string | null; status: string }[]) {
        rs.addRow({
          at: ist(s.created_at), folder: s.qr_point_title ?? 'School-wide QR', role: roleLabel(s.role),
          category: r.label, rating: r.rating, mood: MOOD[r.rating],
          issue: r.priority ? `${r.priority} · ${r.status.replace('_', ' ')}` : '',
        })
      }
    }
    styleHeader(rs)

    // Sheet 3 — what this file contains
    const sum = wb.addWorksheet('Summary')
    sum.columns = [{ key: 'k', width: 22 }, { key: 'v', width: 50 }]
    const olderDays = sp.get('older_than_days')
    ;[
      ['School', school?.name ?? ''],
      ['Folder', folderName],
      ['Range', olderDays ? `Older than ${olderDays} days` : 'All submissions'],
      ['Submissions', subs.length],
      ['Exported (IST)', ist(new Date())],
    ].forEach(([k, v]) => { const r = sum.addRow({ k, v }); r.getCell(1).font = { bold: true } })

    const buffer = await wb.xlsx.writeBuffer()
    const slug = folderName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'feedback'
    const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="feedback-${slug}-${date}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err: unknown) {
    console.error('[API]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
