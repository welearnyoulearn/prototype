// Single source of truth for all plan-gated features across every portal.
// `portals` lists every portal this feature key controls — most features are
// school-admin-only (the historical default before this field existed), but
// some (Digital Library, Syllabus) are genuinely shared capabilities that
// should also gate the Student/Parent app sidebars, not just the school-admin
// one. Add a portal to a feature's list to make it gate that portal too — no
// other plumbing needed, the enabled-features endpoint and each portal's nav
// filter both read this array directly.
export type Portal = 'school-admin' | 'student' | 'parent'

export const ALL_FEATURES: { key: string; label: string; category: string; portals: Portal[] }[] = [
  // ── Core ─────────────────────────────────────────────────────────────────────
  { key: 'overview',           label: 'Overview Dashboard',              category: 'Core', portals: ['school-admin'] },
  { key: 'staff',              label: 'Staff Directory & Onboarding',    category: 'Core', portals: ['school-admin'] },
  { key: 'students',           label: 'Students List & Onboarding',      category: 'Core', portals: ['school-admin'] },
  { key: 'class-management',   label: 'Class Management',                category: 'Core', portals: ['school-admin'] },
  { key: 'student-portal',     label: 'Student Portal Access',           category: 'Core', portals: ['school-admin'] },
  { key: 'parent-portal',      label: 'Parent Portal Access',            category: 'Core', portals: ['school-admin'] },
  { key: 'library',            label: 'WLYL Digital Library',            category: 'Core', portals: ['school-admin', 'student', 'parent'] },

  // ── Scheduling ───────────────────────────────────────────────────────────────
  { key: 'attendance',         label: 'Attendance Tracking',             category: 'Scheduling', portals: ['school-admin'] },
  { key: 'leave-requests',     label: 'Leave Requests',                  category: 'Scheduling', portals: ['school-admin'] },
  { key: 'emergency-cover',    label: 'Emergency Cover',                 category: 'Scheduling', portals: ['school-admin'] },
  { key: 'timetable',          label: 'Timetable Management',            category: 'Scheduling', portals: ['school-admin'] },
  { key: 'curriculum',         label: 'Syllabus Customizer',             category: 'Scheduling', portals: ['school-admin', 'student', 'parent'] },
  { key: 'exam-schedule',      label: 'Exam Schedule',                   category: 'Scheduling', portals: ['school-admin'] },

  // ── Analytics & Intelligence ─────────────────────────────────────────────────
  { key: 'briefing',           label: 'Daily Briefing',                  category: 'Analytics', portals: ['school-admin'] },
  { key: 'analysis',           label: 'Student–Teacher Analysis',        category: 'Analytics', portals: ['school-admin'] },
  { key: 'class-analytics',    label: 'Class Analytics',                 category: 'Analytics', portals: ['school-admin'] },

  // ── Communication ────────────────────────────────────────────────────────────
  { key: 'announcements',      label: 'Announcement Board',              category: 'Communication', portals: ['school-admin'] },
  { key: 'notifications',      label: 'Notification Center',             category: 'Communication', portals: ['school-admin'] },
  { key: 'parent-engagement',  label: 'Parent Engagement',               category: 'Communication', portals: ['school-admin'] },
  { key: 'school-feedback',    label: 'School Feedback',                 category: 'Communication', portals: ['school-admin'] },

  // ── Finance ──────────────────────────────────────────────────────────────────
  { key: 'fee-management',     label: 'Fee Management',                  category: 'Finance', portals: ['school-admin'] },
  { key: 'expenses',           label: 'Expense Tracking',                category: 'Finance', portals: ['school-admin'] },

  // ── Administration ───────────────────────────────────────────────────────────
  { key: 'calendar',           label: 'Academic Calendar',               category: 'Administration', portals: ['school-admin'] },
  { key: 'leaderboard',        label: 'Student Leaderboard',             category: 'Administration', portals: ['school-admin'] },
  { key: 'export',             label: 'Export & Reports',                category: 'Administration', portals: ['school-admin'] },
  { key: 'settings',           label: 'School Settings',                 category: 'Administration', portals: ['school-admin'] },
  { key: 'year-rollover',      label: 'Year Rollover',                   category: 'Administration', portals: ['school-admin'] },
  { key: 'year-review',        label: 'Year-in-Review Report',           category: 'Administration', portals: ['school-admin'] },
  { key: 'api-monitoring',   label: 'Watchline (API Monitoring)',       category: 'Administration', portals: ['school-admin'] },
]

export const CATEGORY_ORDER = ['Core', 'Scheduling', 'Analytics', 'Finance', 'Communication', 'Administration']

// Features that can be overridden per-school via school_feature_overrides,
// taking precedence over the tier-level plan_features setting.
export const OVERRIDABLE_FEATURE_KEYS = ['student-portal', 'parent-portal', 'api-monitoring']

// A portal's nav key doesn't always match the ALL_FEATURES key that gates it
// (e.g. student/parent portals call it 'syllabus', school-admin calls the
// same underlying capability 'curriculum'). This is the single place that
// mapping lives — every portal's nav filter and the enabled-features
// endpoint both resolve through it, so a rename never needs to happen twice.
export const PORTAL_NAV_KEY_ALIASES: Record<string, string> = {
  'syllabus-tracking': 'curriculum',  // school-admin's own alias, pre-existing
  'syllabus': 'curriculum',           // student/parent portals' nav key for the same capability
}
