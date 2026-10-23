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
  { dot: 'bg-lime-600',    text: 'text-lime-700',    border: 'border-lime-500',    tint: 'bg-lime-50',    tintHover: 'hover:bg-lime-100' },
  { dot: 'bg-fuchsia-500', text: 'text-fuchsia-700', border: 'border-fuchsia-400', tint: 'bg-fuchsia-50', tintHover: 'hover:bg-fuchsia-100' },
  { dot: 'bg-sky-500',     text: 'text-sky-700',     border: 'border-sky-400',     tint: 'bg-sky-50',     tintHover: 'hover:bg-sky-100' },
  { dot: 'bg-yellow-500',  text: 'text-yellow-700',  border: 'border-yellow-400',  tint: 'bg-yellow-50',  tintHover: 'hover:bg-yellow-100' },
]

export function feeTypeColor(name: string) {
  let h = 0
  for (const ch of (name || '').toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return FEE_TYPE_COLORS[h % FEE_TYPE_COLORS.length]
}

// Colours for a set of fee names shown together: every distinct name gets its own colour
// (a name that hashes onto a taken colour moves to the next free one), so two fees in the same
// list never look alike. Deterministic: the result doesn't depend on the order of `names`.
export function feeColorMap(names: string[]) {
  const sorted = [...new Set(names.map(n => n || ''))].sort()
  const taken = new Set<number>()
  const byName = new Map<string, (typeof FEE_TYPE_COLORS)[number]>()
  for (const n of sorted) {
    let h = 0
    for (const ch of n.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    let idx = h % FEE_TYPE_COLORS.length
    if (taken.size < FEE_TYPE_COLORS.length) while (taken.has(idx)) idx = (idx + 1) % FEE_TYPE_COLORS.length
    taken.add(idx)
    byName.set(n, FEE_TYPE_COLORS[idx])
  }
  return (name: string) => byName.get(name || '') ?? feeTypeColor(name)
}
