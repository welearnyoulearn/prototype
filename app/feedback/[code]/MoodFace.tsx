'use client'

import { useId } from 'react'

// Custom 3D-style 1–5 mood faces (😭 😞 😐 😊 🤩) used everywhere a rating is
// shown — public form and admin alike. Inline SVG, so they look identical on
// every device (system emoji fonts differ wildly: Windows draws them flat with
// heavy outlines) and stay crisp at any size.
//
// 3D look: a spherical body (light from the top-left, deeper amber toward the
// bottom-right, an inner shadow along the lower edge, rim light), a glossy
// specular highlight, glassy eyes with catch-lights and a mouth with inner
// shading. `animated` turns on the idle personality (blink / tears /
// sparkles) plus a periodic gloss sweep; wrapper motion (pop, sway…) stays
// with the caller. All motion is disabled under prefers-reduced-motion (see
// the .mf-* rules in app/globals.css).

export const MOOD_LABEL: Record<number, string> = { 1: 'Terrible', 2: 'Bad', 3: 'Okay', 4: 'Good', 5: 'Amazing' }

// Native emoji → rating, so emoji-configured option lists can render faces
export const EMOJI_TO_RATING: Record<string, number> = { '😭': 1, '😞': 2, '😐': 3, '😊': 4, '🤩': 5 }

const INK = '#4A2A12'

function star(cx: number, cy: number, r: number): string {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const rad = (Math.PI / 5) * i - Math.PI / 2
    const rr = i % 2 === 0 ? r : r * 0.46
    pts.push(`${(cx + rr * Math.cos(rad)).toFixed(2)},${(cy + rr * Math.sin(rad)).toFixed(2)}`)
  }
  return `M${pts.join(' L')} Z`
}

function sparkle(cx: number, cy: number, r: number): string {
  return `M${cx} ${cy - r} Q${cx} ${cy} ${cx + r} ${cy} Q${cx} ${cy} ${cx} ${cy + r} Q${cx} ${cy} ${cx - r} ${cy} Q${cx} ${cy} ${cx} ${cy - r} Z`
}

export default function MoodFace({
  rating, size = 40, animated = false, className = '', title,
}: {
  rating: number
  size?: number
  animated?: boolean
  className?: string
  title?: string // when set, the face is announced; otherwise decorative
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const r = Math.min(5, Math.max(1, Math.round(rating)))
  const u = (name: string) => `url(#${name}${id})`

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={`${className}${animated ? '' : ' mf-still'}`}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ overflow: 'visible' }}
    >
      <defs>
        {/* Sphere body: bright top-left → deep amber bottom-right */}
        <radialGradient id={`body${id}`} cx="36%" cy="28%" r="80%">
          <stop offset="0" stopColor="#FFF6C2" />
          <stop offset="0.35" stopColor="#FFDD55" />
          <stop offset="0.72" stopColor="#FFB42B" />
          <stop offset="1" stopColor="#E3810F" />
        </radialGradient>
        {/* Inner shadow along the lower edge for volume */}
        <radialGradient id={`under${id}`} cx="50%" cy="20%" r="75%">
          <stop offset="0.72" stopColor="#B85F00" stopOpacity="0" />
          <stop offset="1" stopColor="#B85F00" stopOpacity="0.45" />
        </radialGradient>
        {/* Specular highlight */}
        <radialGradient id={`spec${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        {/* Rim light on the bottom-right edge */}
        <linearGradient id={`rim${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0.55" stopColor="#FFE9A6" stopOpacity="0" />
          <stop offset="1" stopColor="#FFF4CF" stopOpacity="0.9" />
        </linearGradient>
        <radialGradient id={`cheek${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#FF5E7A" stopOpacity="0.55" />
          <stop offset="1" stopColor="#FF5E7A" stopOpacity="0" />
        </radialGradient>
        {/* Glassy eye + mouth depth */}
        <radialGradient id={`eye${id}`} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#6B4020" />
          <stop offset="1" stopColor="#2A1406" />
        </radialGradient>
        <linearGradient id={`mouth${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2A1406" />
          <stop offset="1" stopColor="#6A3515" />
        </linearGradient>
        <radialGradient id={`star${id}`} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#FF9AB0" />
          <stop offset="0.55" stopColor="#FF4470" />
          <stop offset="1" stopColor="#D11F4B" />
        </radialGradient>
        <linearGradient id={`tear${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#D8F1FF" />
          <stop offset="0.5" stopColor="#6CC3FF" />
          <stop offset="1" stopColor="#2F8FE6" />
        </linearGradient>
        {/* Gloss sweep band, clipped to the face */}
        <linearGradient id={`sweep${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`clip${id}`}>
          <circle cx="32" cy="31" r="27" />
        </clipPath>
      </defs>

      {/* Floating contact shadow */}
      <ellipse className="mf-shadow" cx="32" cy="61" rx="18" ry="2.8" fill="#3A2200" opacity="0.18" />

      {/* Sphere */}
      <circle cx="32" cy="31" r="27" fill={u('body')} />
      <circle cx="32" cy="31" r="27" fill={u('under')} />
      <circle cx="32" cy="31" r="26.2" fill="none" stroke={u('rim')} strokeWidth="1.6" />
      <circle cx="32" cy="31" r="27" fill="none" stroke="#C86A00" strokeOpacity="0.28" strokeWidth="0.8" />

      {/* Cheeks */}
      {r >= 4 && (
        <>
          <ellipse cx="16.5" cy="37.5" rx="6.5" ry="5" fill={u('cheek')} />
          <ellipse cx="47.5" cy="37.5" rx="6.5" ry="5" fill={u('cheek')} />
        </>
      )}

      {/* ---------- Features ---------- */}
      {r === 1 && (
        <g>
          <path d="M15.5 20.5 Q21 16.5 26.5 21" stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none" />
          <path d="M48.5 20.5 Q43 16.5 37.5 21" stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none" />
          <path d="M17.5 25 L26 28.5 L17.5 32" stroke={INK} strokeWidth="2.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M46.5 25 L38 28.5 L46.5 32" stroke={INK} strokeWidth="2.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M20.5 48.5 Q32 31.5 43.5 48.5 Q32 53.5 20.5 48.5 Z" fill={u('mouth')} />
          <path d="M26 49 Q32 44.2 38 49 Q32 52.2 26 49 Z" fill="#FF7189" />
          <path d="M24 44 Q32 37 40 44" stroke="#fff" strokeOpacity="0.25" strokeWidth="1.2" fill="none" />
          {/* 3D tear streams + drops */}
          <path d="M17 32 Q13.5 44 14.8 55.5" stroke={u('tear')} strokeWidth="5" strokeLinecap="round" fill="none" />
          <path d="M47 32 Q50.5 44 49.2 55.5" stroke={u('tear')} strokeWidth="5" strokeLinecap="round" fill="none" />
          <path d="M16.2 35 Q14.6 42 15.4 49" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.1" strokeLinecap="round" fill="none" />
          <path d="M47.8 35 Q49.4 42 48.6 49" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.1" strokeLinecap="round" fill="none" />
          <g className="mf-tear">
            <path d="M14 50 Q10.5 55.5 14 58.3 Q17.5 55.5 14 50 Z" fill={u('tear')} />
            <circle cx="13" cy="55" r="0.9" fill="#fff" opacity="0.85" />
          </g>
          <g className="mf-tear mf-tear-2">
            <path d="M50 50 Q46.5 55.5 50 58.3 Q53.5 55.5 50 50 Z" fill={u('tear')} />
            <circle cx="49" cy="55" r="0.9" fill="#fff" opacity="0.85" />
          </g>
        </g>
      )}

      {r === 2 && (
        <g>
          <path d="M16.5 22.5 L26 19" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M47.5 22.5 L38 19" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
          <g className="mf-blink">
            <ellipse cx="24" cy="29.5" rx="3" ry="3.8" fill={u('eye')} />
            <ellipse cx="40" cy="29.5" rx="3" ry="3.8" fill={u('eye')} />
            <circle cx="25" cy="28" r="1.1" fill="#fff" />
            <circle cx="41" cy="28" r="1.1" fill="#fff" />
          </g>
          <path d="M22 46.5 Q32 38 42 46.5" stroke={INK} strokeWidth="3.3" strokeLinecap="round" fill="none" />
          <g>
            <path d="M50.5 12.5 Q46.4 19.4 50.5 22.8 Q54.6 19.4 50.5 12.5 Z" fill={u('tear')} />
            <circle cx="49.4" cy="19" r="0.9" fill="#fff" opacity="0.9" />
          </g>
        </g>
      )}

      {r === 3 && (
        <g>
          <g className="mf-blink">
            <ellipse cx="24" cy="28" rx="3.3" ry="4.1" fill={u('eye')} />
            <ellipse cx="40" cy="28" rx="3.3" ry="4.1" fill={u('eye')} />
            <circle cx="25.2" cy="26.4" r="1.2" fill="#fff" />
            <circle cx="41.2" cy="26.4" r="1.2" fill="#fff" />
          </g>
          <path d="M22.5 43.5 L41.5 43.5" stroke={INK} strokeWidth="3.3" strokeLinecap="round" />
        </g>
      )}

      {r === 4 && (
        <g>
          <path d="M17.5 30 Q24 22.5 30.5 30" stroke={INK} strokeWidth="3.1" strokeLinecap="round" fill="none" />
          <path d="M33.5 30 Q40 22.5 46.5 30" stroke={INK} strokeWidth="3.1" strokeLinecap="round" fill="none" />
          <path d="M19.5 38.5 Q32 53.5 44.5 38.5 Q32 44.5 19.5 38.5 Z" fill={u('mouth')} />
          <path d="M26 44.6 Q32 42.8 38 44.6 Q32 48.4 26 44.6 Z" fill="#FF7189" />
        </g>
      )}

      {r === 5 && (
        <g>
          <g className="mf-star-eyes">
            <path d={star(23.5, 27, 7.6)} fill={u('star')} stroke="#B8173F" strokeWidth="0.7" strokeLinejoin="round" />
            <path d={star(40.5, 27, 7.6)} fill={u('star')} stroke="#B8173F" strokeWidth="0.7" strokeLinejoin="round" />
            <circle cx="21.5" cy="24.6" r="1.4" fill="#fff" opacity="0.85" />
            <circle cx="38.5" cy="24.6" r="1.4" fill="#fff" opacity="0.85" />
          </g>
          <path d="M17.5 37 Q32 59 46.5 37 Z" fill={u('mouth')} />
          <path d="M20 37.6 L44 37.6 Q43.4 41.2 42.2 42.8 L21.8 42.8 Q20.6 41.2 20 37.6 Z" fill="#fff" />
          <path d="M25 49.5 Q32 44.8 39 49.5 Q32 53.6 25 49.5 Z" fill="#FF7189" />
          <path className="mf-twinkle" d={sparkle(58.5, 9.5, 5.2)} fill="#FFC93D" />
          <path className="mf-twinkle mf-twinkle-2" d={sparkle(4.5, 18, 4)} fill="#FF8FB1" />
          <path className="mf-twinkle mf-twinkle-3" d={sparkle(59.5, 44, 3.6)} fill="#7CC7FA" />
        </g>
      )}

      {/* ---------- Shine (on top of everything) ---------- */}
      <ellipse cx="22.5" cy="15.5" rx="11.5" ry="6" fill={u('spec')} opacity="0.85" transform="rotate(-24 22.5 15.5)" />
      <ellipse cx="15.5" cy="24" rx="2.2" ry="3.4" fill="#fff" opacity="0.55" transform="rotate(-24 15.5 24)" />
      <g clipPath={u('clip')}>
        <g transform="rotate(20 32 32)">
          <rect className="mf-sweep" x="-30" y="-6" width="18" height="76" fill={u('sweep')} />
        </g>
      </g>
    </svg>
  )
}
