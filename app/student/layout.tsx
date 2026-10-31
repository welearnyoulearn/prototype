import type { ReactNode } from 'react'
import { Bricolage_Grotesque, Caveat, Cormorant_Garamond } from 'next/font/google'
import StudentFontScope from './StudentFontScope'
import PlanNotice from '@/components/PlanNotice'

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-sb-display', display: 'swap' })
const hand = Caveat({ subsets: ['latin'], variable: '--font-sb-hand', display: 'swap' })
const dialNumerals = Cormorant_Garamond({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-dial-display', display: 'swap' })

export default function StudentLayout({ children }: { children: ReactNode }) {
  return <StudentFontScope className={`${display.variable} ${hand.variable} ${dialNumerals.variable}`}>{children}<PlanNotice /></StudentFontScope>
}
