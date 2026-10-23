import type { ReactNode } from 'react'
import { Bricolage_Grotesque, Caveat } from 'next/font/google'
import StudentFontScope from './StudentFontScope'
import PlanNotice from '@/components/PlanNotice'

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-sb-display', display: 'swap' })
const hand = Caveat({ subsets: ['latin'], variable: '--font-sb-hand', display: 'swap' })

export default function StudentLayout({ children }: { children: ReactNode }) {
  return <StudentFontScope className={`${display.variable} ${hand.variable}`}>{children}<PlanNotice /></StudentFontScope>
}
