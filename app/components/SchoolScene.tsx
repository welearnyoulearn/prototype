'use client'

import { useSyncExternalStore, type CSSProperties } from 'react'

export type DayPart = 'morning' | 'afternoon' | 'evening'

function subscribeToClock(onTick: () => void) {
  const id = window.setInterval(onTick, 30_000)
  return () => window.clearInterval(id)
}

function readMinuteOfDay() {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

const bubbles: Array<{ portal: string; text: string; color: string }> = [
  { portal: 'student', text: 'Homework submitted!', color: '#a85f16' },
  { portal: 'teacher', text: 'Attendance marked ✓', color: '#21686a' },
  { portal: 'parent', text: 'New update from school', color: '#a44f3c' },
  { portal: 'admin', text: 'All classes running', color: '#245b46' },
]

const layer = (depth: number) => ({ '--d': `${depth}px` }) as CSSProperties

// Decorative, code-drawn school illustration. Layers shift at different depths
// with the pointer (via --mx/--my set on .pl-shell), the sky follows the real
// time of day, and the clock shows the real time.
export default function SchoolScene({ dayPart }: { dayPart: DayPart | null }) {
  const minute = useSyncExternalStore(subscribeToClock, readMinuteOfDay, () => null)
  const part = dayPart ?? 'afternoon'
  const hourAngle = minute === null ? 0 : ((minute / 60) % 12) * 30
  const minuteAngle = minute === null ? 0 : (minute % 60) * 6

  return (
    <div className="pl-scene" data-part={part} aria-hidden="true">
      <svg viewBox="0 0 520 340" preserveAspectRatio="xMidYMid slice">
        <g className="pl-layer" style={layer(-6)}>
          <g className="pl-stars">
            {[[60, 40], [130, 70], [210, 30], [300, 58], [360, 26], [470, 110], [30, 110], [250, 84]].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.8 : 1.2} style={{ animationDelay: `${i * 0.45}s` }} />
            ))}
          </g>
          <circle className="pl-sun" cx={part === 'morning' ? 462 : 420} cy={part === 'morning' ? 118 : 72} r="30" />
          <circle className="pl-sun-halo" cx={part === 'morning' ? 462 : 420} cy={part === 'morning' ? 118 : 72} r="46" />
          <path className="pl-moon" d="M432 44a34 34 0 1 0 22 60a28 28 0 1 1-22-60z" />
        </g>

        <g className="pl-layer" style={layer(-12)}>
          <g className="pl-cloud" style={{ '--dur': '46s', animationDelay: '-8s' } as CSSProperties}>
            <ellipse cx="0" cy="70" rx="34" ry="12" /><ellipse cx="16" cy="62" rx="20" ry="13" /><ellipse cx="-14" cy="66" rx="14" ry="9" />
          </g>
          <g className="pl-cloud" style={{ '--dur': '62s', animationDelay: '-34s' } as CSSProperties}>
            <ellipse cx="0" cy="118" rx="28" ry="10" /><ellipse cx="12" cy="111" rx="16" ry="11" />
          </g>
          <g className="pl-birds">
            <path d="M0 96q5-5 10 0q5-5 10 0" /><path d="M18 84q4-4 8 0q4-4 8 0" /><path d="M-14 88q4-4 8 0q4-4 8 0" />
          </g>
        </g>

        <g className="pl-layer" style={layer(8)}>
          <path className="pl-hill-back" d="M0 246Q120 186 250 232T520 214V340H0Z" />
        </g>

        <g className="pl-layer" style={layer(16)}>
          {bubbles.map(b => (
            <g key={b.portal} className="pl-bubble" data-portal={b.portal}>
              <rect x="164" y="34" width="192" height="34" rx="17" />
              <path d="M252 67l8 9 8-9z" />
              <circle cx="183" cy="51" r="8" fill={b.color} />
              <text x="270" y="55.5" textAnchor="middle">{b.text}</text>
            </g>
          ))}

          <line className="pl-pole" x1="96" y1="118" x2="96" y2="274" />
          <path className="pl-flag" d="M97 122q14-6 28 0t28 0v24q-14-6-28 0t-28 0z" />

          <rect className="pl-wing" x="113" y="184" width="64" height="88" />
          <rect className="pl-wing" x="343" y="184" width="64" height="88" />
          <rect className="pl-wing-roof" x="109" y="176" width="72" height="10" rx="2" />
          <rect className="pl-wing-roof" x="339" y="176" width="72" height="10" rx="2" />
          <rect className="pl-wall" x="175" y="150" width="170" height="122" />
          <path className="pl-roof" d="M163 153L260 98l97 55z" />

          <circle className="pl-clock" cx="260" cy="132" r="13" />
          {minute !== null && (
            <g className="pl-clock-hands">
              <line x1="260" y1="132" x2="260" y2="125" transform={`rotate(${hourAngle} 260 132)`} />
              <line x1="260" y1="132" x2="260" y2="122" transform={`rotate(${minuteAngle} 260 132)`} />
            </g>
          )}

          {[[192, 164], [248, 164], [304, 164], [192, 198], [304, 198], [128, 204], [152, 204], [356, 204], [380, 204]].map(([x, y], i) => (
            <rect key={i} className="pl-window" x={x} y={y} width={x < 175 || x > 340 ? 16 : 24} height="22" rx="2" style={{ animationDelay: `${i * 0.7}s` }} />
          ))}
          <path className="pl-door" d="M245 272v-34a15 15 0 0 1 30 0v34z" />
          <rect className="pl-step" x="238" y="270" width="44" height="5" rx="1" />
        </g>

        <g className="pl-layer" style={layer(26)}>
          <path className="pl-ground" d="M0 276Q260 258 520 278V340H0Z" />
          <path className="pl-path" d="M248 275h24l34 65h-92z" />
          <g className="pl-tree">
            <rect x="57" y="238" width="6" height="38" rx="2" className="pl-trunk" />
            <circle cx="60" cy="226" r="22" /><circle cx="46" cy="238" r="14" /><circle cx="74" cy="236" r="15" />
          </g>
          <g className="pl-tree" style={{ animationDelay: '-2.5s' }}>
            <rect x="455" y="232" width="7" height="46" rx="2" className="pl-trunk" />
            <circle cx="458" cy="214" r="27" /><circle cx="440" cy="230" r="17" /><circle cx="477" cy="228" r="18" />
          </g>
          <ellipse className="pl-bush" cx="200" cy="276" rx="22" ry="9" />
          <ellipse className="pl-bush" cx="322" cy="276" rx="24" ry="9" />
        </g>
      </svg>
    </div>
  )
}
