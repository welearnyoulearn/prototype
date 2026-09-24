'use client'

import { INK, TEAL, GOLD, CORAL, GREEN } from '@/app/components/ulearn/theme'
import { PrimaryButton } from './WizardButtons'

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
      <div className="text-center text-6xl mb-1">🎉</div>
      <h1 className="text-center text-xl font-bold mb-1" style={{ color: INK }} data-testid="feedback-thankyou-heading">Thank you!</h1>
      <p className="text-center text-sm mb-1" style={{ color: '#6B7280' }}>Your feedback is helping our school grow 🌱</p>
      <div className="mt-3 text-center text-2xl tracking-[6px]">🌱 → 🌿 → 🌳 → ⭐</div>
      <div className="mt-6">
        <PrimaryButton data-testid="feedback-give-more-btn" onClick={onRestart} className="w-full">
          Give more feedback
        </PrimaryButton>
      </div>
      <p className="mt-4 text-center text-xs" style={{ color: '#C7CDD6' }}>🏅 Feedback Champion badge earned</p>
    </div>
  )
}
