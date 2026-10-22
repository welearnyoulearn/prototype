// One hue per navigation section, shared by the sidebar and the "All features" window so a section
// keeps its colour in both. Full class strings so Tailwind can see them.
export const HUES = [
  { badge: 'bg-emerald-600 text-white', head: 'text-emerald-800', rule: 'bg-emerald-200', icon: 'bg-emerald-100 text-emerald-700', tile: 'border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50', active: 'border-emerald-600 bg-emerald-50', solid: 'bg-emerald-600 text-white' },
  { badge: 'bg-sky-600 text-white', head: 'text-sky-800', rule: 'bg-sky-200', icon: 'bg-sky-100 text-sky-700', tile: 'border-sky-200 hover:border-sky-400 hover:bg-sky-50', active: 'border-sky-600 bg-sky-50', solid: 'bg-sky-600 text-white' },
  { badge: 'bg-amber-500 text-white', head: 'text-amber-800', rule: 'bg-amber-200', icon: 'bg-amber-100 text-amber-700', tile: 'border-amber-200 hover:border-amber-400 hover:bg-amber-50', active: 'border-amber-500 bg-amber-50', solid: 'bg-amber-500 text-white' },
  { badge: 'bg-violet-600 text-white', head: 'text-violet-800', rule: 'bg-violet-200', icon: 'bg-violet-100 text-violet-700', tile: 'border-violet-200 hover:border-violet-400 hover:bg-violet-50', active: 'border-violet-600 bg-violet-50', solid: 'bg-violet-600 text-white' },
  { badge: 'bg-rose-500 text-white', head: 'text-rose-800', rule: 'bg-rose-200', icon: 'bg-rose-100 text-rose-700', tile: 'border-rose-200 hover:border-rose-400 hover:bg-rose-50', active: 'border-rose-500 bg-rose-50', solid: 'bg-rose-500 text-white' },
  { badge: 'bg-teal-600 text-white', head: 'text-teal-800', rule: 'bg-teal-200', icon: 'bg-teal-100 text-teal-700', tile: 'border-teal-200 hover:border-teal-400 hover:bg-teal-50', active: 'border-teal-600 bg-teal-50', solid: 'bg-teal-600 text-white' },
  { badge: 'bg-orange-500 text-white', head: 'text-orange-800', rule: 'bg-orange-200', icon: 'bg-orange-100 text-orange-700', tile: 'border-orange-200 hover:border-orange-400 hover:bg-orange-50', active: 'border-orange-500 bg-orange-50', solid: 'bg-orange-500 text-white' },
  { badge: 'bg-indigo-600 text-white', head: 'text-indigo-800', rule: 'bg-indigo-200', icon: 'bg-indigo-100 text-indigo-700', tile: 'border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50', active: 'border-indigo-600 bg-indigo-50', solid: 'bg-indigo-600 text-white' },
]

// School-admin sections keep a fixed colour however the menu is arranged; any other section falls back to its position.
const KNOWN = ['OVERVIEW', 'PEOPLE', 'MONEY MANAGEMENT', 'SCHEDULING', 'ACADEMICS', 'COMMUNICATION', 'TOOLS']

export function hueForSection(label: string, index: number) {
  const known = KNOWN.indexOf(label.toUpperCase())
  return HUES[(known >= 0 ? known : Math.max(0, index)) % HUES.length]
}
