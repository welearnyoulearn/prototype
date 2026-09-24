// Single source of truth for the 5 portal loading identities. Every loader
// component in this folder takes a `portal` prop and resolves its colors
// from this map — add a portal here once, every loader picks it up.
export type Portal = 'student' | 'teacher' | 'school-admin' | 'parent' | 'platform-admin'

export type PortalTheme = {
  /** CSS var name (see app/globals.css :root) for the solid accent color */
  accentVar: string
  /** CSS var name for the soft/tinted background used behind the accent */
  softVar: string
  /** Tailwind text-color utility matching accentVar, for contexts that can't use inline style */
  textClass: string
  /** Tailwind border-color utility matching accentVar */
  borderClass: string
  /** Tailwind bg-color utility matching accentVar */
  bgClass: string
  /** Tailwind bg-color utility matching softVar */
  softBgClass: string
  label: string
}

export const PORTAL_THEME: Record<Portal, PortalTheme> = {
  student: {
    accentVar: '--portal-student',
    softVar: '--portal-student-soft',
    textClass: 'text-blue-500',
    borderClass: 'border-blue-500',
    bgClass: 'bg-blue-500',
    softBgClass: 'bg-blue-50',
    label: 'Student Portal',
  },
  teacher: {
    accentVar: '--portal-teacher',
    softVar: '--portal-teacher-soft',
    textClass: 'text-blue-500',
    borderClass: 'border-blue-500',
    bgClass: 'bg-blue-500',
    softBgClass: 'bg-blue-50',
    label: 'Teacher Portal',
  },
  'school-admin': {
    accentVar: '--portal-school-admin',
    softVar: '--portal-school-admin-soft',
    textClass: 'text-violet-600',
    borderClass: 'border-violet-600',
    bgClass: 'bg-violet-600',
    softBgClass: 'bg-violet-50',
    label: 'School Admin Portal',
  },
  parent: {
    accentVar: '--portal-parent',
    softVar: '--portal-parent-soft',
    textClass: 'text-pink-500',
    borderClass: 'border-pink-500',
    bgClass: 'bg-pink-500',
    softBgClass: 'bg-pink-50',
    label: 'Parent Portal',
  },
  'platform-admin': {
    accentVar: '--portal-platform-admin',
    softVar: '--portal-platform-admin-soft',
    textClass: 'text-[#5b4e8a]',
    borderClass: 'border-[#5b4e8a]',
    bgClass: 'bg-[#5b4e8a]',
    softBgClass: 'bg-violet-50',
    label: 'Platform Admin',
  },
}
