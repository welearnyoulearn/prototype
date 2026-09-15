import confetti from 'canvas-confetti'

// Two presets: a friendly little burst from wherever the user's eye already
// is (e.g. next to a stat that just ticked up), and a fuller celebration for
// something rarer (a brand-new badge). Colors match the student portal's
// existing warm orange identity rather than confetti's default rainbow, so
// it reads as "this app celebrated you" rather than "a library fired."
const BRAND_COLORS = ['#f97316', '#fb923c', '#f59e0b', '#facc15', '#fde047']

export function burstFrom(el: HTMLElement | null) {
  const origin = el
    ? (() => {
        const r = el.getBoundingClientRect()
        return { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight }
      })()
    : { x: 0.5, y: 0.4 }

  confetti({
    particleCount: 40,
    spread: 55,
    startVelocity: 28,
    gravity: 1.1,
    scalar: 0.8,
    colors: BRAND_COLORS,
    origin,
  })
}

export function celebrate() {
  const duration = 1200
  const end = Date.now() + duration
  ;(function frame() {
    confetti({ particleCount: 4, angle: 60, spread: 60, origin: { x: 0 }, colors: BRAND_COLORS })
    confetti({ particleCount: 4, angle: 120, spread: 60, origin: { x: 1 }, colors: BRAND_COLORS })
    if (Date.now() < end) requestAnimationFrame(frame)
  })()
}
