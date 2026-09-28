'use client'

import { INK, TEAL, GOLD, CORAL, GREEN } from '@/app/components/ulearn/theme'
import { PrimaryButton } from './WizardButtons'
import CategoryIcon, { HeroIcon } from '../CategoryIcon'

const CONFETTI_COLORS = [TEAL, CORAL, GREEN, GOLD]

export default function ThankYouStep({ onRestart }: { onRestart: () => void }) {
  const pieces = Array.from({ length: 24 }, (_, i) => ({
    left: `${Math.round((i / 24) * 100)}%`,
    delay: `${(i % 6) * 0.12}s`,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  }))

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 z-10">
        {pieces.map((p, i) => (
          <span
            key={i}
            className="anim-feedback-confetti-fall absolute top-[-10px] h-3 w-1.5"
            style={{ left: p.left, animationDelay: p.delay, backgroundColor: p.color }}
          />
        ))}
      </div>
      <HeroIcon icon="🎉" size={88} motion="excited" />
      <h1 className="text-center text-xl font-bold mb-1" style={{ color: INK }} data-testid="feedback-thankyou-heading">Thank you!</h1>
      <p className="text-center text-sm mb-1" style={{ color: '#6B7280' }}>Your feedback is helping our school grow 🌱</p>
      <div className="mt-4 flex items-center justify-center gap-2" aria-hidden="true">
        <CategoryIcon icon="🌱" size={30} />
        <span className="text-sm font-bold" style={{ color: '#9CB5A6' }}>›</span>
        <CategoryIcon icon="🌳" size={38} />
        <span className="text-sm font-bold" style={{ color: '#9CB5A6' }}>›</span>
        <CategoryIcon icon="⭐" size={46} animated />
      </div>
      <div className="mt-6">
        <PrimaryButton data-testid="feedback-give-more-btn" onClick={onRestart} className="w-full">
          Give more feedback
        </PrimaryButton>
      </div>
      <p className="mt-4 flex items-center justify-center gap-1.5 text-xs font-semibold" style={{ color: '#8A948E' }}><CategoryIcon icon="🏅" size={22} />Feedback Champion badge earned</p>
    </div>
  )
}
