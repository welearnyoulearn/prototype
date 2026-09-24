import { CalendarClock, FileText, GraduationCap, PartyPopper } from 'lucide-react'
import { TEAL, GOLD, CORAL, PURPLE } from '@/app/components/ulearn/theme'
import { AdvancedFormType } from './types'

export const ADVANCED_TYPE_VISUAL: Record<AdvancedFormType, { Icon: typeof CalendarClock; color: string }> = {
  meeting:  { Icon: CalendarClock, color: TEAL },
  event:    { Icon: PartyPopper,   color: CORAL },
  exam:     { Icon: FileText,      color: PURPLE },
  academic: { Icon: GraduationCap, color: GOLD },
}
