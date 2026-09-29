'use client'

import type { CSSProperties } from 'react'
import type { AnnouncementTemplate, Motif } from '@/lib/announcementTemplates'

// The animated card a festive / greeting announcement opens as. Used for the composer's live preview
// (what the admin sees before sending) AND for the card teachers, students and parents see when they
// tap the notice — so the preview is exactly what people get. Art is emoji + gradients + CSS motion,
// deterministic (no Math.random) so it renders identically on server and client.

type Movement = 'rise' | 'fall' | 'twinkle'
const MOTIFS: Record<Motif, { emoji: string[]; move: Movement }> = {
  lamps:    { emoji: ['🪔', '✨', '🪔', '⭐'], move: 'rise' },
  confetti: { emoji: ['🎉', '🎊', '✨', '⭐', '🎈'], move: 'fall' },
  kites:    { emoji: ['🪁', '☁️', '🪁', '✨'], move: 'rise' },
  petals:   { emoji: ['🌸', '🌼', '🍃', '🌺'], move: 'fall' },
  sparkles: { emoji: ['✨', '⭐', '💫', '✨'], move: 'twinkle' },
  balloons: { emoji: ['🎈', '🎈', '⭐', '🎈'], move: 'rise' },
  snow:     { emoji: ['❄️', '⭐', '❄️', '✨'], move: 'fall' },
  tricolor: { emoji: ['🕊️', '✨', '⭐', '🕊️'], move: 'rise' },
  crescent: { emoji: ['🌙', '⭐', '✨', '⭐'], move: 'twinkle' },
  books:    { emoji: ['📚', '✏️', '🎓', '⭐'], move: 'rise' },
  alert:    { emoji: ['⚠️', '🚨', '⚠️'], move: 'twinkle' },
  sun:      { emoji: ['☀️', '🌾', '✨', '🌻'], move: 'twinkle' },
  stars:    { emoji: ['⭐', '✨', '🎆', '💫'], move: 'twinkle' },
  colors:   { emoji: ['🎨', '💜', '💙', '💛', '💚', '💖'], move: 'fall' },
}

const CSS = `
@keyframes ann-rise { 0% { transform: translateY(0) rotate(-6deg); opacity: 0 } 12% { opacity: .95 } 100% { transform: translateY(-115%) rotate(8deg); opacity: 0 } }
@keyframes ann-fall { 0% { transform: translateY(-20%) rotate(0deg); opacity: 0 } 10% { opacity: .95 } 100% { transform: translateY(115%) rotate(300deg); opacity: 0 } }
@keyframes ann-twinkle { 0%, 100% { transform: scale(.6); opacity: .15 } 50% { transform: scale(1.25); opacity: 1 } }
@keyframes ann-float { 0%, 100% { transform: translateY(0) scale(1) } 50% { transform: translateY(-10px) scale(1.06) } }
@keyframes ann-pop { 0% { transform: scale(.85); opacity: 0 } 100% { transform: scale(1); opacity: 1 } }
@keyframes ann-glow { 0%, 100% { opacity: .35; transform: scale(1) } 50% { opacity: .6; transform: scale(1.12) } }
.ann-rise { animation-name: ann-rise; animation-timing-function: ease-in; animation-iteration-count: infinite }
.ann-fall { animation-name: ann-fall; animation-timing-function: linear; animation-iteration-count: infinite }
.ann-twinkle { animation-name: ann-twinkle; animation-timing-function: ease-in-out; animation-iteration-count: infinite }
.ann-in { animation: ann-pop .5s cubic-bezier(.2,.8,.2,1) both }
@media (prefers-reduced-motion: reduce) { .ann-rise, .ann-fall, .ann-twinkle, .ann-float, .ann-glow { animation: none !important; opacity: .5 } }
`

function Particles({ motif, count }: { motif: Motif; count: number }) {
  const m = MOTIFS[motif]
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: count }).map((_, i) => {
        const style: CSSProperties = {
          position: 'absolute',
          left: `${(i * 37 + 11) % 96}%`,
          top: m.move === 'twinkle' ? `${(i * 53 + 7) % 90}%` : m.move === 'rise' ? '96%' : '-6%',
          fontSize: `${14 + ((i * 7) % 18)}px`,
          animationDuration: `${m.move === 'twinkle' ? 2.4 + (i % 4) * 0.7 : 6 + ((i * 17) % 50) / 10}s`,
          animationDelay: `${((i * 63) % 60) / 10}s`,
          lineHeight: 1,
          userSelect: 'none',
        }
        return <span key={i} className={`ann-${m.move}`} style={style}>{m.emoji[i % m.emoji.length]}</span>
      })}
    </div>
  )
}

export default function GreetingCard({
  template, headline, message, schoolName, variant = 'card', compact = false,
}: {
  template: AnnouncementTemplate
  headline: string
  message?: string
  schoolName?: string
  // card: the full greeting (emoji, headline, message). banner: just the coloured header used above a notice's text.
  variant?: 'card' | 'banner'
  // smaller type and fewer particles — for the composer's preview and template thumbnails
  compact?: boolean
}) {
  const [c1, c2, c3] = template.gradient
  const text = template.dark ? '#ffffff' : '#1f2937'
  const banner = variant === 'banner'
  return (
    <div
      data-testid="greeting-card" data-template={template.key}
      className="ann-in relative overflow-hidden rounded-3xl text-center shadow-lg"
      style={{ background: `linear-gradient(135deg, ${c1} 0%, ${c2} 55%, ${c3} 100%)`, color: text }}
    >
      <style>{CSS}</style>
      <Particles motif={template.motif} count={compact || banner ? 9 : 16} />
      <div aria-hidden className="ann-glow absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{ width: compact ? 140 : 260, height: compact ? 140 : 260, background: 'rgba(255,255,255,.55)', animation: 'ann-glow 4s ease-in-out infinite' }} />
      <div className={`relative flex flex-col items-center ${banner ? 'px-6 py-6' : compact ? 'px-5 py-6' : 'px-6 py-10 sm:px-10 sm:py-14'}`}>
        <div className="ann-float leading-none drop-shadow-lg" style={{ fontSize: banner ? 44 : compact ? 52 : 92, animation: 'ann-float 3.2s ease-in-out infinite' }}>
          {template.emoji}
        </div>
        <h2 data-testid="greeting-headline" className="font-extrabold tracking-tight drop-shadow-sm"
          style={{ fontSize: banner ? 22 : compact ? 22 : 'clamp(28px, 6vw, 44px)', lineHeight: 1.1, marginTop: banner ? 8 : compact ? 10 : 18, textShadow: template.dark ? '0 2px 12px rgba(0,0,0,.25)' : 'none' }}>
          {headline}
        </h2>
        {!banner && message && (
          <p className="whitespace-pre-line leading-relaxed" style={{ marginTop: compact ? 8 : 16, maxWidth: 520, fontSize: compact ? 12 : 16, opacity: .95 }}>
            {message}
          </p>
        )}
        {!banner && !message && schoolName && (
          <p className="mt-2 text-xs font-semibold tracking-widest uppercase opacity-80">{schoolName}</p>
        )}
      </div>
    </div>
  )
}
