import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Base({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  )
}

const tint = { fill: 'currentColor', fillOpacity: 0.16, stroke: 'none' } as const

export function StudentIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path {...tint} d="M4 21.5c3.5-1.6 8-1.4 12 1 4-2.4 8.5-2.6 12-1V28c-3.5-1.6-8-1.4-12 1-4-2.4-8.5-2.6-12-1z" />
      <circle cx="16" cy="8" r="3.6" />
      <path d="M10.5 18.5c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5" />
      <path d="M4 21.5c3.5-1.6 8-1.4 12 1 4-2.4 8.5-2.6 12-1V28c-3.5-1.6-8-1.4-12 1-4-2.4-8.5-2.6-12-1z" />
      <path d="M16 22.5V29" />
    </Base>
  )
}

export function TeacherIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect {...tint} x="12" y="4" width="17" height="12" rx="2" />
      <rect x="12" y="4" width="17" height="12" rx="2" />
      <path d="M16 8.5h7M16 11.5h4" />
      <circle cx="8" cy="12" r="3" />
      <path d="M3 27v-3.5C3 20.5 5.2 18 8 18c1.6 0 3 .8 4 2l4-3" />
      <path d="M13 27v-5" />
    </Base>
  )
}

export function ParentIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path {...tint} d="M16 9.4c-1.2-2.4-4.6-2-4.6.7 0 2 2.6 3.7 4.6 5.2 2-1.5 4.6-3.2 4.6-5.2 0-2.7-3.4-3.1-4.6-.7z" />
      <path d="M16 9.4c-1.2-2.4-4.6-2-4.6.7 0 2 2.6 3.7 4.6 5.2 2-1.5 4.6-3.2 4.6-5.2 0-2.7-3.4-3.1-4.6-.7z" />
      <circle cx="7.5" cy="8" r="3" />
      <path d="M3 28v-8c0-2.8 2-5 4.5-5s4.5 2.2 4.5 5v1.5l4 2" />
      <circle cx="24" cy="15" r="2.4" />
      <path d="M16 23.5l4-1.5c.8-.8 2.2-1.5 4-1.5 2.2 0 4 1.8 4 4V28" />
    </Base>
  )
}

export function SchoolIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path {...tint} d="M6 14h20v14H6z" />
      <path d="M16 3v6M16 3.5h5l-1.2 1.6L21 6.5h-5" />
      <path d="M4 15l12-6 12 6" />
      <path d="M6 14v14h20V14" />
      <path d="M13.5 28v-5a2.5 2.5 0 0 1 5 0v5" />
      <path d="M9.5 18h2M20.5 18h2" />
      <path d="M3 28h26" />
    </Base>
  )
}
