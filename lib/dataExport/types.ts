// Export Data — shared types. An export is DEFINED once (registry.ts): its label, the plan feature it
// needs, the filters it accepts and how to build its table(s). The catalog route, the download route and
// the screen are all driven by these definitions, so adding a feature's export means adding one entry.

export type ExportGroup = 'people' | 'academics' | 'attendance' | 'fees' | 'expenses' | 'other' | 'backup'
export type ExportFormat = 'csv' | 'xlsx'

// Cell values: numbers stay numeric in Excel; strings are made safe against spreadsheet formulas.
export type Cell = string | number | boolean | null

export type ExportTable = {
  name: string           // sheet name in Excel (and used in the CSV file name when there are several)
  header: string[]
  rows: Cell[][]
  // Optional lines above the header (e.g. "Unit Test 1 | 10-A | 2026-08-01") — rendered as plain rows
  title?: string[]
}

export type FilterKind = 'class' | 'grade' | 'exam' | 'year' | 'date' | 'month' | 'select' | 'expenseCategory'

export type FilterDef = {
  key: string
  label: string
  kind: FilterKind
  required?: boolean
  options?: Array<{ value: string; label: string }>   // for kind 'select'
  defaultValue?: string
  hint?: string
}

export type ExportContext = { schoolId: number }
export type Params = Record<string, string>

export type ExportDef = {
  key: string
  group: ExportGroup
  label: string
  description: string
  // Plan feature the school must have for this export to be offered (null = always)
  feature: string | null
  formats: ExportFormat[]
  filters: FilterDef[]
  // Contains personal data of students, parents or staff (shown as a hint on the screen)
  personal?: boolean
  filename: (p: Params) => string
  run: (ctx: ExportContext, p: Params) => Promise<ExportTable[]>
}

// Thrown by an export to return a friendly error (bad filter, nothing to export…)
export class ExportError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

// What the catalog route returns to the screen (no run function)
export type CatalogEntry = Omit<ExportDef, 'run' | 'filename'>
export type CatalogOptions = {
  classes: Array<{ value: string; label: string; grade: string }>
  grades: Array<{ value: string; label: string }>
  exams: Array<{ value: string; label: string }>
  years: Array<{ value: string; label: string }>
  expenseCategories: Array<{ value: string; label: string }>
  currentYear: string | null
}
export type Catalog = { exports: CatalogEntry[]; options: CatalogOptions; groups: Array<{ key: ExportGroup; label: string; description: string }> }
