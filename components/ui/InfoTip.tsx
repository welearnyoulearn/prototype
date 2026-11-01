'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Info } from 'lucide-react'

const MARGIN = 8

/**
 * A small "i" button that explains something in one sentence. The text opens on hover, on keyboard focus and on tap
 * (so it works on a phone), and Escape or a tap elsewhere closes it. It opens under the button and slides sideways to
 * stay inside the screen, so it never runs off the edge on a phone. `tone="onDark"` is for a purple or dark background.
 */
export default function InfoTip({ text, label, tone = 'default', testId }: {
  text: string
  /** What the tip is about, for screen readers: "About Needs questions". */
  label: string
  tone?: 'default' | 'onDark'
  testId?: string
}) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  // How far to move the text sideways (in px, from the button's left edge) to keep it on screen.
  const [shift, setShift] = useState(0)
  const root = useRef<HTMLSpanElement | null>(null)
  const tip = useRef<HTMLSpanElement | null>(null)
  const id = useId()
  const shown = open || pinned

  useLayoutEffect(() => {
    if (!shown || !root.current || !tip.current) return
    const b = root.current.getBoundingClientRect()
    const width = tip.current.offsetWidth
    const centred = b.left + b.width / 2 - width / 2
    const left = Math.min(Math.max(centred, MARGIN), Math.max(MARGIN, window.innerWidth - width - MARGIN))
    setShift(left - b.left)
  }, [shown])

  useEffect(() => {
    if (!shown) return
    const close = () => { setOpen(false); setPinned(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const onPointer = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) close() }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onPointer) }
  }, [shown])

  const icon = tone === 'onDark' ? 'text-white/80 hover:text-white focus-visible:text-white' : 'text-gray-400 hover:text-purple-700 focus-visible:text-purple-700'
  return (
    <span ref={root} className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={`About ${label}`}
        aria-expanded={shown}
        aria-controls={id}
        data-testid={testId}
        onClick={() => setPinned(p => !p)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-purple-400 ${icon}`}
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </button>
      <span
        id={id}
        ref={tip}
        role="tooltip"
        hidden={!shown}
        style={{ left: shift }}
        className="absolute top-full z-30 mt-2 w-64 max-w-[calc(100vw-16px)] rounded-lg bg-gray-900 px-3 py-2 text-left text-xs font-normal leading-5 text-white shadow-lg"
      >
        {text}
      </span>
    </span>
  )
}
