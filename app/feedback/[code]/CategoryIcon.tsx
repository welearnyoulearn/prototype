'use client'

import { useId } from 'react'
import MoodFace, { EMOJI_TO_RATING } from './MoodFace'

// 3D icon for a feedback category. Categories store a plain emoji (schools
// pick any), so this resolves it to the best 3D artwork available:
//   1. a custom-drawn 3D icon (school, bus, food, broom, people) — ./below
//   2. a Fluent 3D sticker already shipped in public/student-icons (MIT)
//   3. a 3D MoodFace for 😭 😞 😐 😊 🤩
//   4. otherwise the emoji itself, raised inside the same glossy tile
// Everything sits on a lit, glossy tile tinted to the icon, so the list reads
// as one family whatever the school picked.

const STICKERS: Record<string, string> = {
  '📚': 'books', '📖': 'open-book', '📓': 'notebook', '📔': 'notebook', '📝': 'memo', '✏️': 'pencil',
  '📢': 'megaphone', '📣': 'megaphone', '🔐': 'locked', '🔒': 'locked', '🔑': 'key', '🛡️': 'shield',
  '⚽': 'soccer-ball', '🏅': 'sports-medal', '🏆': 'trophy', '🎓': 'graduation-cap', '💻': 'laptop',
  '🧪': 'test-tube', '🔬': 'microscope', '🎨': 'artist-palette', '🎵': 'musical-notes', '🎶': 'musical-notes',
  '📅': 'spiral-calendar', '🗓️': 'spiral-calendar', '📆': 'calendar', '💡': 'light-bulb', '💬': 'speech-balloon',
  '🏠': 'house', '👋': 'waving-hand', '⭐': 'glowing-star', '🌟': 'glowing-star', '🎉': 'party-popper',
  '📍': 'pushpin', '📌': 'pushpin', '📋': 'clipboard', '🗂️': 'clipboard', '🧠': 'brain', '🌍': 'world-map',
  '🗺️': 'world-map', '🎁': 'wrapped-gift', '🚀': 'rocket', '🤖': 'robot', '🔍': 'magnifying-glass',
  '📈': 'chart-increasing', '⏰': 'hourglass', '⏳': 'hourglass', '🧮': 'abacus', '📐': 'triangular-ruler',
  '🌱': 'seedling', '🌳': 'seedling', '🪪': 'identification-card', '🧾': 'scroll',
  '🙈': 'thinking-face', '🤔': 'thinking-face', '🎊': 'confetti-ball', '✨': 'sparkles', '🔥': 'fire',
  '💯': 'hundred-points', '📊': 'chart-increasing', '🖋️': 'pencil', '🧑‍💻': 'laptop',
}

type Custom = 'school' | 'bus' | 'food' | 'broom' | 'person' | 'people' | 'student'
const CUSTOM: Record<string, Custom> = {
  '🏫': 'school', '🏢': 'school', '🏛️': 'school',
  '🚌': 'bus', '🚍': 'bus', '🚎': 'bus', '🚐': 'bus',
  '🍔': 'food', '🍽️': 'food', '🥗': 'food', '🍱': 'food', '🥪': 'food',
  '🧹': 'broom', '🧼': 'broom', '🚿': 'broom',
  '👩‍🏫': 'person', '🧑‍🏫': 'person', '👨‍🏫': 'person', '🙋': 'person', '🙋‍♀️': 'person', '🙋‍♂️': 'person', '👤': 'person',
  '👥': 'people', '🤝': 'people', '👨‍👩‍👧': 'people', '👪': 'people',
  '🧑‍🎓': 'student', '👨‍🎓': 'student', '👩‍🎓': 'student', '🎒': 'student',
}

// Tile tint per artwork (light → deeper), so the colour hints at the icon
const TINT: Record<string, [string, string]> = {
  school: ['#FFE7DC', '#FFC9B3'], bus: ['#FFF4CC', '#FFE08A'], food: ['#FFEBD6', '#FFD1A1'],
  broom: ['#E3F4FF', '#BFE3FB'], person: ['#E6F2EC', '#C6E6D4'], people: ['#EEE9FF', '#D8CCFB'], student: ['#E3F0FF', '#C3DAFB'],
  face: ['#FFF6D6', '#FFE6A3'], sticker: ['#F2F5F3', '#E1E8E3'],
}

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`g-red${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FF9A6E" /><stop offset="1" stopColor="#E0532A" /></linearGradient>
      <linearGradient id={`g-roof${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6E7FD6" /><stop offset="1" stopColor="#3F4FAE" /></linearGradient>
      <linearGradient id={`g-glass${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#E4F6FF" /><stop offset="1" stopColor="#7CC7F2" /></linearGradient>
      <linearGradient id={`g-yellow${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFE27A" /><stop offset="1" stopColor="#F2A600" /></linearGradient>
      <radialGradient id={`g-wheel${id}`} cx="40%" cy="35%" r="70%"><stop offset="0" stopColor="#5A5F66" /><stop offset="1" stopColor="#1E2226" /></radialGradient>
      <linearGradient id={`g-bun${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFC873" /><stop offset="1" stopColor="#E08A1E" /></linearGradient>
      <linearGradient id={`g-patty${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8A4B2A" /><stop offset="1" stopColor="#5A2C14" /></linearGradient>
      <linearGradient id={`g-wood${id}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#D89A5B" /><stop offset="1" stopColor="#9C5E26" /></linearGradient>
      <linearGradient id={`g-straw${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFE08A" /><stop offset="1" stopColor="#D9A21B" /></linearGradient>
      <radialGradient id={`g-skin${id}`} cx="38%" cy="32%" r="75%"><stop offset="0" stopColor="#F2C4A0" /><stop offset="1" stopColor="#B97B55" /></radialGradient>
      <linearGradient id={`g-shirt${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4FAE83" /><stop offset="1" stopColor="#1F6B4C" /></linearGradient>
      <linearGradient id={`g-shirt2${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8F84EE" /><stop offset="1" stopColor="#5646C4" /></linearGradient>
      <linearGradient id={`g-hair${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4A3428" /><stop offset="1" stopColor="#1E1410" /></linearGradient>
      <linearGradient id={`g-cap${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4A5670" /><stop offset="1" stopColor="#1B2233" /></linearGradient>
      <linearGradient id={`g-shirt3${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6FA3F2" /><stop offset="1" stopColor="#2F66C8" /></linearGradient>
      <radialGradient id={`g-shine${id}`} cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#fff" stopOpacity="0.9" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
    </defs>
  )
}

function Bust({ id, x, y, s = 1, shirt, hair = true }: { id: string; x: number; y: number; s?: number; shirt: string; hair?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-15 26 C-15 12 -8 6 0 6 C8 6 15 12 15 26 Z" fill={`url(#${shirt}${id})`} />
      <circle cx="0" cy="-5" r="10.5" fill={`url(#g-skin${id})`} />
      {hair && <path d="M-10.5 -6 C-11 -16 -4 -19 1 -19 C8 -19 12 -14 10.5 -6 C8 -11 3 -13 -1 -13 C-5 -13 -9 -10 -10.5 -6 Z" fill={`url(#g-hair${id})`} />}
      <circle cx="-3.6" cy="-4" r="1.2" fill="#3A2415" />
      <circle cx="3.6" cy="-4" r="1.2" fill="#3A2415" />
      <path d="M-3 1 Q0 3.4 3 1" stroke="#3A2415" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <ellipse cx="-4" cy="-11" rx="4" ry="2" fill="#fff" opacity="0.35" />
    </g>
  )
}

function CustomArt({ kind, id }: { kind: Custom; id: string }) {
  const u = (n: string) => `url(#${n}${id})`
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true" style={{ overflow: 'visible' }}>
      <Defs id={id} />
      <ellipse cx="32" cy="58" rx="20" ry="3" fill="#000" opacity="0.12" />
      {kind === 'school' && (
        <g>
          <rect x="10" y="26" width="44" height="30" rx="3" fill={u('g-red')} />
          <path d="M6 28 L32 12 L58 28 Z" fill={u('g-roof')} />
          <rect x="29" y="4" width="2" height="10" fill="#6B7280" />
          <path d="M31 4 L41 7 L31 10 Z" fill="#FFD84A" />
          <circle cx="32" cy="23" r="4.5" fill="#fff" />
          <path d="M32 20.5 L32 23 L34 24" stroke="#3F4FAE" strokeWidth="1.2" strokeLinecap="round" fill="none" />
          {[15, 42].map(x => <rect key={x} x={x} y="31" width="8" height="7" rx="1.5" fill={u('g-glass')} />)}
          {[15, 42].map(x => <rect key={`b${x}`} x={x} y="42" width="8" height="7" rx="1.5" fill={u('g-glass')} />)}
          <path d="M27 56 L27 42 Q32 37 37 42 L37 56 Z" fill="#7A3A1E" />
          <rect x="10" y="26" width="44" height="4" fill="#fff" opacity="0.2" />
        </g>
      )}
      {kind === 'bus' && (
        <g>
          <rect x="7" y="14" width="50" height="36" rx="8" fill={u('g-yellow')} />
          <rect x="7" y="14" width="50" height="7" rx="4" fill="#fff" opacity="0.25" />
          {[12, 25, 38].map(x => <rect key={x} x={x} y="20" width="11" height="11" rx="2.5" fill={u('g-glass')} />)}
          <rect x="7" y="35" width="50" height="4" fill="#E0531F" />
          <circle cx="52" cy="44" r="2.4" fill="#FFF7D6" />
          <rect x="7" y="46" width="50" height="4" rx="2" fill="#B97A00" />
          {[18, 46].map(x => (
            <g key={x}>
              <circle cx={x} cy="50" r="6.5" fill={u('g-wheel')} />
              <circle cx={x} cy="50" r="2.6" fill="#C9CED6" />
            </g>
          ))}
        </g>
      )}
      {kind === 'food' && (
        <g>
          <path d="M10 30 Q10 12 32 12 Q54 12 54 30 Z" fill={u('g-bun')} />
          {[[22, 19], [30, 16], [38, 18], [44, 23], [26, 25], [34, 23]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx="1.6" ry="0.9" fill="#FFF3D6" />)}
          <path d="M8 31 Q14 27 20 31 Q26 35 32 31 Q38 27 44 31 Q50 35 56 31 L56 34 L8 34 Z" fill="#5CC56B" />
          <path d="M11 34 L53 34 L50 38 L14 38 Z" fill="#FFD23F" />
          <rect x="9" y="36" width="46" height="8" rx="4" fill={u('g-patty')} />
          <path d="M10 45 L54 45 Q54 53 44 53 L20 53 Q10 53 10 45 Z" fill={u('g-bun')} />
          <ellipse cx="22" cy="18" rx="7" ry="3" fill="#fff" opacity="0.35" />
        </g>
      )}
      {kind === 'broom' && (
        <g>
          <rect x="30" y="2" width="5" height="34" rx="2.5" fill={u('g-wood')} transform="rotate(20 32 32)" />
          <path d="M14 38 L38 30 L50 54 L22 58 Z" fill={u('g-straw')} transform="rotate(8 32 44)" />
          <path d="M16 38 L38 31 L39 35 L17 42 Z" fill="#E0531F" transform="rotate(8 32 44)" />
          {[22, 28, 34, 40].map(x => <path key={x} d={`M${x} 42 L${x + 4} 56`} stroke="#B98010" strokeWidth="1" opacity="0.6" transform="rotate(8 32 44)" />)}
          {[[50, 14, 3], [56, 24, 2], [8, 20, 2.4]].map(([x, y, r], i) => (
            <path key={i} d={`M${x} ${y - r * 2} Q${x} ${y} ${x + r * 2} ${y} Q${x} ${y} ${x} ${y + r * 2} Q${x} ${y} ${x - r * 2} ${y} Q${x} ${y} ${x} ${y - r * 2} Z`} fill="#8FD3FF" />
          ))}
        </g>
      )}
      {kind === 'person' && <Bust id={id} x={32} y={30} s={1.2} shirt="g-shirt" />}
      {kind === 'student' && (
        <g>
          <Bust id={id} x={32} y={32} s={1.15} shirt="g-shirt3" hair={false} />
          {/* mortarboard */}
          <g transform="translate(32 14)">
            <path d="M-11 2 L-11 8 Q0 13 11 8 L11 2 Z" fill={u('g-cap')} />
            <path d="M-19 -2 L0 -10 L19 -2 L0 6 Z" fill={u('g-cap')} />
            <path d="M-19 -2 L0 -10 L19 -2" stroke="#fff" strokeOpacity="0.35" strokeWidth="1" fill="none" />
            <path d="M14 0 L15.5 12" stroke="#F2B84B" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="15.6" cy="13" r="2" fill="#F2B84B" />
          </g>
        </g>
      )}
      {kind === 'people' && (
        <g>
          <Bust id={id} x={22} y={32} s={0.95} shirt="g-shirt2" />
          <Bust id={id} x={42} y={34} s={1.02} shirt="g-shirt" />
        </g>
      )}
      <ellipse cx="22" cy="14" rx="10" ry="4" fill={u('g-shine')} opacity="0.5" transform="rotate(-20 22 14)" />
    </svg>
  )
}

export default function CategoryIcon({
  icon, size = 40, className = '', animated = false, shape = 'tile',
}: {
  icon: string | null | undefined
  size?: number
  className?: string
  animated?: boolean
  shape?: 'tile' | 'circle'
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const emoji = (icon ?? '').trim() || '🏷️'
  const custom = CUSTOM[emoji]
  const sticker = STICKERS[emoji]
  const face = EMOJI_TO_RATING[emoji]
  const [t1, t2] = TINT[custom ?? (face ? 'face' : 'sticker')]
  const inner = Math.round(size * (shape === 'circle' ? 0.66 : 0.72))
  const radius = shape === 'circle' ? size / 2 : size * 0.3

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: `linear-gradient(145deg, ${t1}, ${t2})`,
        boxShadow: `inset 0 1.5px 0 rgba(255,255,255,0.9), inset 0 -${Math.max(2, size * 0.06)}px ${Math.max(4, size * 0.12)}px rgba(0,0,0,0.08), 0 ${Math.max(2, size * 0.06)}px ${Math.max(6, size * 0.18)}px -${Math.max(2, size * 0.06)}px rgba(16,24,20,0.28)`,
      }}
      aria-hidden="true"
    >
      {/* glossy top sheen on the tile */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0))', borderRadius: `${radius}px ${radius}px 40% 40%` }} />
      <span className="relative flex items-center justify-center" style={{ width: inner, height: inner }}>
        {custom ? (
          <CustomArt kind={custom} id={id} />
        ) : face ? (
          <MoodFace rating={face} size={inner} animated={animated} />
        ) : sticker ? (
          // eslint-disable-next-line @next/next/no-img-element -- small static 3D sticker
          <img src={`/student-icons/${sticker}.png`} alt="" draggable={false} width={inner} height={inner} className="select-none drop-shadow-[0_2px_2px_rgba(0,0,0,0.18)]" />
        ) : (
          <span className="leading-none drop-shadow-[0_2px_2px_rgba(0,0,0,0.25)]" style={{ fontSize: inner * 0.8 }}>{emoji}</span>
        )}
      </span>
    </span>
  )
}

// Big round 3D badge for screen headers (category picker, identity, forms,
// thank-you, closed/not-found): the 3D icon on a glossy disc with a soft glow
// halo and a gentle float. `motion` picks the float style.
export function HeroIcon({
  icon, size = 76, motion = 'bob',
}: {
  icon: string | null | undefined
  size?: number
  motion?: 'bob' | 'excited' | 'sad' | 'none'
}) {
  const anim = { bob: 'anim-feedback-mascot-bob', excited: 'anim-feedback-mascot-jump', sad: 'anim-feedback-mascot-sway', none: '' }[motion]
  return (
    <div className="mb-3 flex justify-center">
      <span className={`relative inline-flex ${anim}`}>
        <span className="absolute -inset-3 rounded-full opacity-70 blur-xl" style={{ background: 'radial-gradient(circle, rgba(62,155,116,0.35), rgba(62,155,116,0) 70%)' }} aria-hidden="true" />
        <CategoryIcon icon={icon} size={size} shape="circle" animated />
      </span>
    </div>
  )
}
