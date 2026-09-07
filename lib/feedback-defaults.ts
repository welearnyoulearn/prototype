// Default feedback categories per role, seeded for every school (new schools
// at creation time in POST /api/schools, existing schools via a one-time
// backfill migration in lib/db.ts). Schools can edit/add/deactivate their own
// categories afterwards via /api/feedback/categories — this is only the
// starting set. Matches the SchoolPulse prototype's role→category mapping.
export type FeedbackRole = 'parent' | 'student' | 'teacher' | 'visitor' | 'other'

export const FEEDBACK_ROLES: { key: FeedbackRole; label: string; icon: string }[] = [
  { key: 'parent',  label: 'Parent',  icon: '👨‍👩‍👧' },
  { key: 'student', label: 'Student', icon: '🧑‍🎓' },
  { key: 'teacher', label: 'Teacher', icon: '👩‍🏫' },
  { key: 'visitor', label: 'Visitor', icon: '👋' },
  { key: 'other',   label: 'Other',   icon: '👨‍💼' },
]

export interface DefaultFeedbackCategory {
  role: FeedbackRole
  key: string
  label: string
  icon: string
  department: string
  sortOrder: number
}

export const DEFAULT_FEEDBACK_CATEGORIES: DefaultFeedbackCategory[] = [
  // ── Parent ──────────────────────────────────────────────────────────────
  { role: 'parent', key: 'academic-quality', label: 'Academic Quality', icon: '📚', department: 'Academics',      sortOrder: 0 },
  { role: 'parent', key: 'teachers',         label: 'Teachers',         icon: '👩‍🏫', department: 'Academics',      sortOrder: 1 },
  { role: 'parent', key: 'communication',    label: 'Communication',    icon: '📢', department: 'Administration', sortOrder: 2 },
  { role: 'parent', key: 'infrastructure',   label: 'Infrastructure',   icon: '🏫', department: 'Facilities',     sortOrder: 3 },
  { role: 'parent', key: 'transportation',   label: 'Transportation',   icon: '🚌', department: 'Transport',      sortOrder: 4 },
  { role: 'parent', key: 'food',             label: 'Food',             icon: '🍽️', department: 'Facilities',     sortOrder: 5 },

  // ── Student ─────────────────────────────────────────────────────────────
  { role: 'student', key: 'my-teachers', label: 'My Teachers', icon: '😊', department: 'Academics',  sortOrder: 0 },
  { role: 'student', key: 'learning',    label: 'Learning',    icon: '📚', department: 'Academics',  sortOrder: 1 },
  { role: 'student', key: 'campus',      label: 'Campus',      icon: '🏫', department: 'Facilities', sortOrder: 2 },
  { role: 'student', key: 'food',        label: 'Food',        icon: '🍔', department: 'Facilities', sortOrder: 3 },
  { role: 'student', key: 'activities',  label: 'Activities',  icon: '⚽', department: 'Activities', sortOrder: 4 },
  { role: 'student', key: 'transport',   label: 'Transport',   icon: '🚌', department: 'Transport',  sortOrder: 5 },

  // ── Teacher ─────────────────────────────────────────────────────────────
  { role: 'teacher', key: 'management-support', label: 'Management Support', icon: '👥', department: 'Administration', sortOrder: 0 },
  { role: 'teacher', key: 'resources',          label: 'Resources',          icon: '📚', department: 'Academics',      sortOrder: 1 },
  { role: 'teacher', key: 'infrastructure',     label: 'Infrastructure',     icon: '🏢', department: 'Facilities',     sortOrder: 2 },
  { role: 'teacher', key: 'work-culture',       label: 'Work Culture',       icon: '🤝', department: 'Administration', sortOrder: 3 },

  // ── Visitor ─────────────────────────────────────────────────────────────
  { role: 'visitor', key: 'reception',       label: 'Reception',       icon: '🙋', department: 'Administration', sortOrder: 0 },
  { role: 'visitor', key: 'cleanliness',     label: 'Cleanliness',     icon: '🧹', department: 'Facilities',     sortOrder: 1 },
  { role: 'visitor', key: 'staff-behaviour', label: 'Staff Behaviour', icon: '😊', department: 'Administration', sortOrder: 2 },
  { role: 'visitor', key: 'security',        label: 'Security',        icon: '🔐', department: 'Facilities',     sortOrder: 3 },

  // ── Other ───────────────────────────────────────────────────────────────
  { role: 'other', key: 'reception',       label: 'Reception',       icon: '🙋', department: 'Administration', sortOrder: 0 },
  { role: 'other', key: 'cleanliness',     label: 'Cleanliness',     icon: '🧹', department: 'Facilities',     sortOrder: 1 },
  { role: 'other', key: 'staff-behaviour', label: 'Staff Behaviour', icon: '😊', department: 'Administration', sortOrder: 2 },
  { role: 'other', key: 'security',        label: 'Security',        icon: '🔐', department: 'Facilities',     sortOrder: 3 },
  { role: 'other', key: 'communication',   label: 'Communication',   icon: '📢', department: 'Administration', sortOrder: 4 },
  { role: 'other', key: 'infrastructure',  label: 'Infrastructure',  icon: '🏫', department: 'Facilities',     sortOrder: 5 },
]

// Builds a parameterized bulk-insert for seeding one school's default
// categories. Pure function (no db import) so it has no circular dependency
// on lib/db.ts — callers (POST /api/schools) run it with whatever
// pool/client they already have in scope.
export function buildFeedbackCategorySeedQuery(schoolId: number): { sql: string; params: unknown[] } {
  const params: unknown[] = [schoolId]
  const rows = DEFAULT_FEEDBACK_CATEGORIES.map(c => {
    const i = params.length
    params.push(c.role, c.key, c.label, c.icon, c.department, c.sortOrder)
    return `($1, $${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, $${i + 6})`
  })
  return {
    sql: `
      INSERT INTO feedback_categories (school_id, role, key, label, icon, department, sort_order)
      VALUES ${rows.join(', ')}
      ON CONFLICT (school_id, role, key) DO NOTHING
    `,
    params,
  }
}

// Builds a single set-based query that backfills DEFAULT_FEEDBACK_CATEGORIES
// for every existing school at once (CROSS JOIN schools x defaults), for the
// one-time db.ts migration backfill — avoids one round-trip per school.
export function buildFeedbackCategoryBackfillAllQuery(): { sql: string; params: unknown[] } {
  const params: unknown[] = []
  // Explicit casts are required here (unlike the direct-INSERT seed query
  // above): VALUES is aliased as a subquery `v` feeding a SELECT rather than
  // being the INSERT's own source, so Postgres can't push the INSERT target
  // column types down to these placeholders and instead infers them as
  // `text`/`unknown` — sort_order in particular then fails to assign into
  // its integer column ("column is of type integer but expression is of
  // type text") unless cast explicitly.
  const rows = DEFAULT_FEEDBACK_CATEGORIES.map(c => {
    const i = params.length
    params.push(c.role, c.key, c.label, c.icon, c.department, c.sortOrder)
    return `($${i + 1}::varchar, $${i + 2}::varchar, $${i + 3}::varchar, $${i + 4}::varchar, $${i + 5}::varchar, $${i + 6}::integer)`
  })
  return {
    sql: `
      INSERT INTO feedback_categories (school_id, role, key, label, icon, department, sort_order)
      SELECT s.id, v.role, v.key, v.label, v.icon, v.department, v.sort_order
      FROM schools s
      CROSS JOIN (VALUES ${rows.join(', ')}) AS v(role, key, label, icon, department, sort_order)
      ON CONFLICT (school_id, role, key) DO NOTHING
    `,
    params,
  }
}
