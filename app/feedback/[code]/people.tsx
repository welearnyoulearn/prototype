// Hand-built flat illustrations of people for the public feedback form —
// inline SVG, so they are sharp at any size, need no image downloads, and
// use a range of (South Asian) skin tones, hair and outfits. Every scene is
// decorative (aria-hidden); the card's text carries the meaning.

type Hair = 'short' | 'long' | 'bun' | 'curly' | 'bob'

interface PersonProps {
  x: number
  y: number
  scale?: number
  skin: string
  hair: string
  hairStyle: Hair
  shirt: string
  glasses?: boolean
  lanyard?: string
  backpack?: string
  armUp?: boolean
}

const INK = '#2A2320'

// One person, drawn in a 100×120 box anchored at the shoulders' bottom edge.
function Person({ x, y, scale = 1, skin, hair, hairStyle, shirt, glasses, lanyard, backpack, armUp }: PersonProps) {
  const shade = 'rgba(0,0,0,0.12)'
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {/* Hair behind the head for long styles */}
      {hairStyle === 'long' && <path d="M29 52 C25 27 40 19 51 19 C64 19 75 28 71 54 L73 84 C63 90 37 90 27 84 Z" fill={hair} />}
      {hairStyle === 'bob' && <path d="M30 52 C27 29 40 21 51 21 C63 21 74 29 71 53 L72 66 C64 70 36 70 29 66 Z" fill={hair} />}

      {/* Backpack peeking over the shoulder */}
      {backpack && <rect x="62" y="72" width="26" height="36" rx="9" fill={backpack} />}

      {/* Raised waving arm (behind the body) */}
      {armUp && (
        <g>
          <path d="M71 90 C82 82 86 66 84 52" stroke={shirt} strokeWidth="11" strokeLinecap="round" fill="none" />
          <circle cx="84" cy="47" r="7" fill={skin} />
        </g>
      )}

      {/* Body */}
      <path d="M18 120 C18 90 32 76 50 76 C68 76 82 90 82 120 Z" fill={shirt} />
      <path d="M42 76 L50 88 L58 76 Z" fill={shade} />
      {/* Backpack straps */}
      {backpack && (
        <g stroke={backpack} strokeWidth="5" strokeLinecap="round">
          <path d="M34 82 L32 118" />
          <path d="M66 82 L68 118" />
        </g>
      )}
      {/* Lanyard + visitor badge */}
      {lanyard && (
        <g>
          <path d="M42 78 L50 96 L58 78" stroke={lanyard} strokeWidth="2.5" fill="none" />
          <rect x="43" y="95" width="14" height="17" rx="2.5" fill="#fff" stroke={lanyard} strokeWidth="1.5" />
          <rect x="46" y="100" width="8" height="2" rx="1" fill={lanyard} />
          <rect x="46" y="104" width="6" height="2" rx="1" fill={lanyard} opacity="0.5" />
        </g>
      )}

      {/* Neck + head */}
      <rect x="44" y="62" width="12" height="17" rx="5" fill={skin} />
      <rect x="44" y="70" width="12" height="5" fill={shade} />
      <circle cx="32.5" cy="50" r="4" fill={skin} />
      <circle cx="67.5" cy="50" r="4" fill={skin} />
      <ellipse cx="50" cy="47" rx="17.5" ry="19.5" fill={skin} />

      {/* Front hair */}
      {hairStyle === 'short' && <path d="M32 47 C29 28 41 22 51 22 C63 22 71 29 68 46 C64 37 57 33 49 34 C41 35 35 39 32 47 Z" fill={hair} />}
      {(hairStyle === 'long' || hairStyle === 'bob') && <path d="M32 48 C30 29 41 23 51 23 C62 23 71 30 69 47 C63 39 55 32 44 34 C39 36 35 41 32 48 Z" fill={hair} />}
      {hairStyle === 'bun' && (
        <g fill={hair}>
          <circle cx="50" cy="21" r="8.5" />
          <path d="M32 47 C30 30 41 25 51 25 C62 25 71 31 68 46 C63 38 57 35 50 35 C42 35 36 39 32 47 Z" />
        </g>
      )}
      {hairStyle === 'curly' && (
        <g fill={hair}>
          {[[36, 34], [43, 27], [51, 25], [59, 27], [65, 34], [33, 42], [68, 42]].map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r="7.5" />)}
        </g>
      )}

      {/* Face */}
      <circle cx="43.5" cy="49" r="1.9" fill={INK} />
      <circle cx="56.5" cy="49" r="1.9" fill={INK} />
      <path d="M45 57 Q50 61.5 55 57" stroke={INK} strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <circle cx="39" cy="55" r="3" fill="#F28B82" opacity="0.35" />
      <circle cx="61" cy="55" r="3" fill="#F28B82" opacity="0.35" />
      {glasses && (
        <g stroke={INK} strokeWidth="1.6" fill="rgba(255,255,255,0.25)">
          <circle cx="43.5" cy="49" r="5.2" />
          <circle cx="56.5" cy="49" r="5.2" />
          <path d="M48.7 49 L51.3 49" />
        </g>
      )}
    </g>
  )
}

const SKIN = { light: '#E8B48F', medium: '#C98F6B', tan: '#B27655', deep: '#8A5A3F' }
const HAIR = { black: '#23191A', brown: '#4A3226', dark: '#2F2420' }

// Soft backdrop blob shared by every scene
function Backdrop({ a, b }: { a: string; b: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`bg-${a.slice(1)}-${b.slice(1)}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <rect width="160" height="120" fill={`url(#bg-${a.slice(1)}-${b.slice(1)})`} />
      <circle cx="132" cy="18" r="30" fill="#fff" opacity="0.35" />
      <circle cx="18" cy="112" r="24" fill="#fff" opacity="0.25" />
    </>
  )
}

export function ParentScene({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={className} aria-hidden="true" preserveAspectRatio="xMidYMax slice">
      <Backdrop a="#FFF1EA" b="#FFD9C8" />
      {/* heart */}
      <path d="M80 30 C80 24 72 22 70 28 C68 22 60 24 60 30 C60 37 70 42 70 42 C70 42 80 37 80 30 Z" fill="#F07B6B" opacity="0.9" transform="translate(4 -6)" />
      <Person x={14} y={8} scale={0.94} skin={SKIN.medium} hair={HAIR.black} hairStyle="long" shirt="#E07A5F" />
      <Person x={82} y={46} scale={0.62} skin={SKIN.medium} hair={HAIR.black} hairStyle="bob" shirt="#F2B84B" />
      {/* holding hands */}
      <path d="M80 108 C86 104 90 104 96 106" stroke={SKIN.medium} strokeWidth="6" strokeLinecap="round" fill="none" />
    </svg>
  )
}

export function StudentScene({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={className} aria-hidden="true" preserveAspectRatio="xMidYMax slice">
      <Backdrop a="#EAF8F0" b="#C6EBD6" />
      {/* book stack */}
      <g transform="translate(106 74)">
        <rect x="0" y="28" width="40" height="10" rx="2" fill="#4A7BD0" />
        <rect x="4" y="18" width="34" height="10" rx="2" fill="#E07A5F" />
        <rect x="2" y="8" width="36" height="10" rx="2" fill="#F2B84B" />
        <rect x="6" y="11" width="24" height="2" rx="1" fill="#fff" opacity="0.6" />
      </g>
      {/* sparkle */}
      <path d="M128 36 L131 44 L139 47 L131 50 L128 58 L125 50 L117 47 L125 44 Z" fill="#2F7A5C" opacity="0.8" />
      <Person x={22} y={8} scale={0.94} skin={SKIN.tan} hair={HAIR.black} hairStyle="short" shirt="#2F7A5C" backpack="#F2B84B" />
    </svg>
  )
}

export function TeacherScene({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={className} aria-hidden="true" preserveAspectRatio="xMidYMax slice">
      <Backdrop a="#FFF8E6" b="#FBE3AE" />
      {/* mini board */}
      <g transform="translate(88 20)">
        <rect x="0" y="0" width="60" height="44" rx="6" fill="#2F7A5C" />
        <rect x="3" y="3" width="54" height="38" rx="4" fill="#245B46" />
        <path d="M10 14 L30 14 M10 22 L40 22 M10 30 L26 30" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
        <text x="46" y="33" fontSize="11" fontWeight="800" fill="#F2B84B" textAnchor="middle" fontFamily="sans-serif">A+</text>
        <path d="M14 44 L10 60 M46 44 L50 60" stroke="#8A6A3A" strokeWidth="3" strokeLinecap="round" />
      </g>
      <Person x={10} y={8} scale={0.94} skin={SKIN.light} hair={HAIR.dark} hairStyle="bun" shirt="#4A7BD0" glasses />
    </svg>
  )
}

export function VisitorScene({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={className} aria-hidden="true" preserveAspectRatio="xMidYMax slice">
      <Backdrop a="#EEF4FF" b="#CFE0FF" />
      {/* "hello" speech bubble */}
      <g transform="translate(96 16)">
        <rect x="0" y="0" width="52" height="26" rx="13" fill="#fff" />
        <path d="M12 24 L8 34 L20 25 Z" fill="#fff" />
        <text x="26" y="17.5" fontSize="11" fontWeight="800" fill="#4A7BD0" textAnchor="middle" fontFamily="sans-serif">Hello!</text>
      </g>
      <Person x={28} y={8} scale={0.94} skin={SKIN.deep} hair={HAIR.black} hairStyle="curly" shirt="#7C6AD6" lanyard="#E07A5F" armUp />
    </svg>
  )
}

export function RequestScene({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={className} aria-hidden="true" preserveAspectRatio="xMidYMax slice">
      <Backdrop a="#F4F0FF" b="#DCD2FB" />
      {/* calendar bubble */}
      <g transform="translate(104 14)">
        <rect x="0" y="0" width="40" height="38" rx="8" fill="#fff" />
        <rect x="0" y="0" width="40" height="11" rx="8" fill="#E07A5F" />
        <rect x="0" y="6" width="40" height="5" fill="#E07A5F" />
        {[0, 1, 2].map(r => [0, 1, 2].map(c => (
          <rect key={`${r}${c}`} x={7 + c * 10} y={16 + r * 7} width="6" height="4" rx="1.5" fill={r === 1 && c === 1 ? '#2F7A5C' : '#D8D3EA'} />
        )))}
      </g>
      <Person x={20} y={8} scale={0.94} skin={SKIN.medium} hair={HAIR.brown} hairStyle="short" shirt="#245B46" />
      {/* clipboard held in front */}
      <g transform="translate(46 84) rotate(-6)">
        <rect x="0" y="0" width="26" height="32" rx="3" fill="#C9884A" />
        <rect x="3" y="4" width="20" height="26" rx="2" fill="#fff" />
        <rect x="8" y="-2" width="10" height="6" rx="2" fill="#8A6A3A" />
        <path d="M6 11 L20 11 M6 17 L18 17 M6 23 L16 23" stroke="#B9B3CC" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  )
}

// A small group — used on the desktop side panel
export function CommunityScene({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 170" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="community-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E7F5EC" />
          <stop offset="1" stopColor="#FDEBDD" />
        </linearGradient>
      </defs>
      <rect width="320" height="170" rx="28" fill="url(#community-bg)" />
      <circle cx="270" cy="34" r="40" fill="#fff" opacity="0.45" />
      <g transform="translate(118 18)">
        <rect x="0" y="0" width="84" height="30" rx="15" fill="#fff" />
        <path d="M34 28 L30 40 L44 29 Z" fill="#fff" />
        <text x="42" y="20" fontSize="13" fontWeight="800" fill="#245B46" textAnchor="middle" fontFamily="sans-serif">😊 🤩 😊</text>
      </g>
      <Person x={8} y={58} scale={0.9} skin={SKIN.medium} hair={HAIR.black} hairStyle="long" shirt="#E07A5F" />
      <Person x={84} y={78} scale={0.72} skin={SKIN.tan} hair={HAIR.black} hairStyle="short" shirt="#2F7A5C" backpack="#F2B84B" />
      <Person x={150} y={56} scale={0.92} skin={SKIN.light} hair={HAIR.dark} hairStyle="bun" shirt="#4A7BD0" glasses />
      <Person x={228} y={60} scale={0.88} skin={SKIN.deep} hair={HAIR.black} hairStyle="curly" shirt="#7C6AD6" lanyard="#E07A5F" armUp />
    </svg>
  )
}
