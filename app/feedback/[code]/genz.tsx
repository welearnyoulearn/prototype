import { Clock3, Lock, Mic, Send } from 'lucide-react'
import { TEAL } from '@/app/components/ulearn/theme'
import { VOICE_LIMIT_SHORT } from '@/lib/feedback-defaults'
import { CommunityScene } from './people'

// Visual language for the public feedback form: clean, modern cards (soft
// depth, generous radius, no heavy outlines) with hand-built illustrations of
// people (see ./people.tsx) and the school's green as the accent.
export const GZ_INK = '#17201B'
export const GZ_MUTED = '#5E6A63'
export const GZ_CARD_SHADOW = '0 1px 2px rgba(16,24,20,0.06), 0 12px 32px -12px rgba(16,24,20,0.18)'
export const GZ_CARD_SHADOW_HOVER = '0 2px 4px rgba(16,24,20,0.06), 0 20px 40px -14px rgba(36,91,70,0.35)'

// Desktop-only left panel: people, why this matters and what to expect.
// Hidden on phones, where the form itself is the whole screen.
export function GzBrandPanel({ schoolName }: { schoolName: string }) {
  const points = [
    { Icon: Clock3, title: 'About a minute', text: 'Tap a few faces — typing is optional.' },
    { Icon: Lock, title: 'Anonymous if you like', text: 'Name and number are always optional.' },
    { Icon: Mic, title: 'Say it out loud', text: `Voice notes up to ${VOICE_LIMIT_SHORT}.` },
    { Icon: Send, title: 'Reaches the right team', text: 'Concerns go straight to who can fix them.' },
  ]
  return (
    <aside className="sticky top-10 hidden max-w-[460px] flex-1 lg:block">
      <p className="text-xs font-bold uppercase tracking-[0.22em]" style={{ color: TEAL }}>Your voice matters</p>
      <h2 className="mt-3 text-[44px] font-extrabold leading-[1.05] tracking-tight" style={{ color: GZ_INK }}>
        Help shape{' '}
        <span className="bg-gradient-to-r from-[#245B46] to-[#3E9B74] bg-clip-text text-transparent">{schoolName || 'your school'}</span>
      </h2>
      <p className="mt-3 text-base" style={{ color: GZ_MUTED }}>Parents, students, teachers and visitors — every honest answer makes school a little better.</p>

      <CommunityScene className="mt-7 block h-auto w-full drop-shadow-sm" />

      <ul className="mt-7 grid grid-cols-2 gap-3">
        {points.map(({ Icon, title, text }) => (
          <li key={title} className="rounded-2xl bg-white/70 p-3.5 backdrop-blur" style={{ boxShadow: GZ_CARD_SHADOW }}>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: '#E6F2EC', color: TEAL }}>
              <Icon size={18} strokeWidth={2.2} aria-hidden="true" />
            </span>
            <span className="mt-2 block text-sm font-bold" style={{ color: GZ_INK }}>{title}</span>
            <span className="block text-xs" style={{ color: GZ_MUTED }}>{text}</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
