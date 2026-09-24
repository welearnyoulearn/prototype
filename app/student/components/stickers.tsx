import type { CSSProperties } from 'react'

// 3D stickers from Microsoft Fluent Emoji (MIT) — see public/student-icons/NOTICE.md.
export const STICKER_NAMES = [
  'abacus', 'artist-palette', 'balloon', 'beach', 'birthday-cake', 'books', 'brain',
  'bust-in-silhouette', 'calendar', 'chart-increasing', 'check-mark-button', 'clipboard', 'confetti-ball',
  'fire', 'glowing-star', 'graduation-cap', 'hourglass', 'house',
  'hundred-points', 'identification-card', 'input-latin-letters', 'key', 'laptop', 'light-bulb', 'locked',
  'magnifying-glass', 'megaphone', 'memo', 'microscope', 'musical-notes', 'notebook', 'open-book',
  'paperclip', 'party-popper', 'pencil', 'pushpin', 'robot', 'rocket', 'scroll', 'seedling',
  'shield', 'sleeping-face', 'soccer-ball', 'sparkles', 'speech-balloon', 'spiral-calendar', 'sports-medal',
  'star-struck', 'test-tube', 'thinking-face', 'triangular-ruler', 'trophy', 'warning',
  'waving-hand', 'world-map', 'wrapped-gift',
] as const

export type StickerName = (typeof STICKER_NAMES)[number]
export type StickerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero'
export type Tone = 'yellow' | 'blue' | 'violet' | 'mint' | 'pink' | 'orange' | 'coral' | 'paper'

export function Sticker({ name, size = 'md', tilt = 0, className = '', style }: {
  name: StickerName
  size?: StickerSize
  tilt?: number
  className?: string
  style?: CSSProperties
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static decorative PNGs; next/image adds nothing here
    <img
      src={`/student-icons/${name}.png`}
      alt=""
      aria-hidden="true"
      draggable={false}
      data-size={size}
      className={`sb-sticker ${className}`}
      style={{ '--tilt': `${tilt}deg`, ...style } as CSSProperties}
    />
  )
}

const SUBJECT_RULES: [RegExp, StickerName][] = [
  [/geometr|trigono/, 'triangular-ruler'],
  [/math|algebra|arith|numer/, 'abacus'],
  [/chem/, 'test-tube'],
  [/bio|life science|botany|zoology/, 'microscope'],
  [/physic/, 'light-bulb'],
  [/evs|environment/, 'seedling'],
  [/science/, 'test-tube'],
  [/english|grammar|literature|phonics|reading/, 'input-latin-letters'],
  [/hindi|telugu|tamil|kannada|malayalam|marathi|sanskrit|urdu|bengali|gujarati|odia|punjabi|french|german|spanish|language/, 'memo'],
  [/history|civics|polit/, 'scroll'],
  [/social|geograph|econom/, 'world-map'],
  [/computer|coding|ict|\bit\b|robotic/, 'laptop'],
  [/art|drawing|craft|paint/, 'artist-palette'],
  [/music|dance/, 'musical-notes'],
  [/physical|\bpe\b|sport|games|yoga/, 'soccer-ball'],
  [/\bgk\b|general knowledge|moral|value/, 'brain'],
]

export function subjectSticker(subject: string): StickerName {
  const s = subject.toLowerCase()
  return SUBJECT_RULES.find(([re]) => re.test(s))?.[1] ?? 'books'
}

const SUBJECT_TONES: Tone[] = ['blue', 'yellow', 'violet', 'mint', 'pink', 'orange']

// Same subject always gets the same colour everywhere in the portal.
export function subjectTone(subject: string): Tone {
  let hash = 0
  for (let i = 0; i < subject.length; i++) hash = (hash * 31 + subject.charCodeAt(i)) | 0
  return SUBJECT_TONES[Math.abs(hash) % SUBJECT_TONES.length]
}
