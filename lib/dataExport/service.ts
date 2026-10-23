import pool from '@/lib/db'
import { schoolHasFeature } from '@/lib/auth'
import { gradeOrderSql } from '@/lib/grades'
import { BACKUP_KEYS, EXPORTS, GROUPS, MAX_ROWS, getExport, today } from './registry'
import { renderCsv, renderXlsx, tableRowCount } from './render'
import { ExportError, type Catalog, type CatalogEntry, type ExportDef, type ExportFormat, type ExportTable, type Params } from './types'

const BACKUP_ENTRY: CatalogEntry = {
  key: 'full-backup', group: 'backup', label: 'Full school backup (Excel)',
  description: 'One workbook with a sheet for every module your school uses: students, parents, staff, classes, fees, expenses, calendar and more. Keep a copy safe.',
  feature: null, formats: ['xlsx'], filters: [], personal: true,
}

async function enabledDefs(schoolId: number): Promise<ExportDef[]> {
  const keys = Array.from(new Set(EXPORTS.map(e => e.feature).filter((f): f is string => !!f)))
  const on = new Map<string, boolean>()
  await Promise.all(keys.map(async k => { on.set(k, await schoolHasFeature(schoolId, k)) }))
  return EXPORTS.filter(e => !e.feature || on.get(e.feature))
}

export async function buildCatalog(schoolId: number): Promise<Catalog> {
  const defs = await enabledDefs(schoolId)
  const [classes, exams, years, cats] = await Promise.all([
    pool.query<{ id: number; grade: string; section: string }>(
      `SELECT id, grade, section FROM classes WHERE school_id = $1 AND deleted_at IS NULL ORDER BY ${gradeOrderSql('grade')}, section`, [schoolId]),
    pool.query<{ id: number; exam_name: string; grade: string; section: string; exam_date: string | null }>(
      `SELECT e.id, e.exam_name, c.grade, c.section, e.exam_date::text AS exam_date
       FROM exam_records e JOIN classes c ON c.id = e.class_id WHERE e.school_id = $1
       ORDER BY e.exam_date DESC NULLS LAST, e.id DESC LIMIT 300`, [schoolId]),
    pool.query<{ label: string; is_current: boolean }>(`SELECT label, is_current FROM academic_years WHERE school_id = $1 ORDER BY start_date DESC`, [schoolId]),
    pool.query<{ id: number; name: string }>(`SELECT id, name FROM expense_categories WHERE school_id = $1 AND is_active = TRUE ORDER BY name`, [schoolId]).catch(() => ({ rows: [] as { id: number; name: string }[] })),
  ])
  const grades = Array.from(new Set(classes.rows.map(c => c.grade)))
  const sections = Array.from(new Set(classes.rows.map(c => c.section))).sort()
  const entries: CatalogEntry[] = defs.map(({ run: _run, filename: _fn, ...rest }) => {
    void _run; void _fn
    return {
      ...rest,
      filters: rest.filters.map(f => (f.key === 'section' ? { ...f, options: [{ value: '', label: 'All sections' }, ...sections.map(s => ({ value: s, label: s }))] } : f)),
    }
  })
  return {
    exports: [...entries, BACKUP_ENTRY],
    groups: GROUPS.filter(g => g.key === 'backup' || entries.some(e => e.group === g.key)),
    options: {
      classes: classes.rows.map(c => ({ value: String(c.id), label: `Grade ${c.grade}-${c.section}`, grade: c.grade })),
      grades: grades.map(g => ({ value: g, label: `Grade ${g}` })),
      exams: exams.rows.map(e => ({ value: String(e.id), label: `${e.exam_name} · ${e.grade}-${e.section}${e.exam_date ? ` · ${e.exam_date}` : ''}` })),
      years: years.rows.map(y => ({ value: y.label, label: y.is_current ? `${y.label} (current)` : y.label })),
      expenseCategories: cats.rows.map(c => ({ value: String(c.id), label: c.name })),
      currentYear: years.rows.find(y => y.is_current)?.label ?? null,
    },
  }
}

export type BuiltExport = { body: Buffer | string; contentType: string; filename: string; rows: number }

const CSV_TYPE = 'text/csv; charset=utf-8'
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

async function schoolName(schoolId: number): Promise<string> {
  const { rows: [s] } = await pool.query<{ name: string }>(`SELECT name FROM schools WHERE id = $1`, [schoolId])
  return s?.name ?? 'School'
}

// Runs one export (or the backup) for a school and renders it. Filters are validated by each export;
// the school always comes from the caller's login, never from the request.
export async function buildExport(schoolId: number, key: string, params: Params, format: ExportFormat): Promise<BuiltExport> {
  const ctx = { schoolId }
  let tables: ExportTable[]
  let baseName: string

  if (key === 'full-backup') {
    if (format !== 'xlsx') throw new ExportError(400, 'The backup is an Excel workbook')
    const defs = (await enabledDefs(schoolId)).filter(d => BACKUP_KEYS.includes(d.key))
    tables = []
    for (const d of defs) {
      // "all" variants: no filters. Students / staff include everyone so nothing is missing from a backup.
      const p: Params = d.key === 'students' ? { status: 'all' } : d.key === 'teachers' ? { status: 'all' } : {}
      const t = await d.run(ctx, p)
      tables.push(...t.map(x => ({ ...x, name: d.label.length <= 28 ? d.label : x.name })))
    }
    baseName = `school_backup_${today()}`
  } else {
    const def = getExport(key)
    if (!def) throw new ExportError(404, 'Unknown export')
    if (!(await enabledDefs(schoolId)).some(d => d.key === key)) throw new ExportError(403, 'This export is not part of your plan')
    if (!def.formats.includes(format)) throw new ExportError(400, `${def.label} is not available as ${format.toUpperCase()}`)
    for (const f of def.filters) {
      if (f.required && !params[f.key]) throw new ExportError(400, `${f.label} is required`)
      if (f.kind === 'select' && params[f.key] && f.key !== 'section' && f.options && !f.options.some(o => o.value === params[f.key])) throw new ExportError(400, `Invalid ${f.label}`)
    }
    tables = await def.run(ctx, params)
    baseName = def.filename(params)
  }

  const rows = tableRowCount(tables)
  if (tables.some(t => t.rows.length > MAX_ROWS)) throw new ExportError(413, 'Too many rows for one file. Narrow the filters (a class, a date range or a year) and try again.')

  if (format === 'csv') {
    return { body: renderCsv(tables[0]), contentType: CSV_TYPE, filename: `${baseName}.csv`, rows }
  }
  const body = await renderXlsx(tables, { schoolName: await schoolName(schoolId), title: baseName })
  return { body, contentType: XLSX_TYPE, filename: `${baseName}.xlsx`, rows }
}

export async function logExport(schoolId: number, key: string, format: ExportFormat, filters: Params, rows: number, byUserId: number | null, byName: string): Promise<void> {
  await pool.query(
    `INSERT INTO data_export_log (school_id, export_key, format, filters, row_count, by_user_id, by_name) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [schoolId, key, format, JSON.stringify(filters), rows, byUserId, byName]
  )
}
