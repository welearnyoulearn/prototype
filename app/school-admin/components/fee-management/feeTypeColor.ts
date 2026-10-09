// A stable colour per fee type, so Tuition / Transport / etc. are easy to tell apart.
// Classes are written out in full so Tailwind picks them up.
const FEE_TYPE_COLORS = [
  { dot: 'bg-blue-500',    text: 'text-blue-700',    border: 'border-blue-400',    tint: 'bg-blue-50',    tintHover: 'hover:bg-blue-100' },
  { dot: 'bg-emerald-500', text: 'text-emerald-700', border: 'border-emerald-400', tint: 'bg-emerald-50', tintHover: 'hover:bg-emerald-100' },
  { dot: 'bg-violet-500',  text: 'text-violet-700',  border: 'border-violet-400',  tint: 'bg-violet-50',  tintHover: 'hover:bg-violet-100' },
  { dot: 'bg-rose-500',    text: 'text-rose-700',    border: 'border-rose-400',    tint: 'bg-rose-50',    tintHover: 'hover:bg-rose-100' },
  { dot: 'bg-teal-500',    text: 'text-teal-700',    border: 'border-teal-400',    tint: 'bg-teal-50',    tintHover: 'hover:bg-teal-100' },
  { dot: 'bg-orange-500',  text: 'text-orange-700',  border: 'border-orange-400',  tint: 'bg-orange-50',  tintHover: 'hover:bg-orange-100' },
  { dot: 'bg-cyan-500',    text: 'text-cyan-700',    border: 'border-cyan-400',    tint: 'bg-cyan-50',    tintHover: 'hover:bg-cyan-100' },
  { dot: 'bg-pink-500',    text: 'text-pink-700',    border: 'border-pink-400',    tint: 'bg-pink-50',    tintHover: 'hover:bg-pink-100' },
]

export function feeTypeColor(name: string) {
  let h = 0
  for (const ch of (name || '').toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return FEE_TYPE_COLORS[h % FEE_TYPE_COLORS.length]
}
