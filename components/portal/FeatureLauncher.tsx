'use client'

import { useState, type ReactNode } from 'react'
import { Dialog } from 'radix-ui'
import { Bell, Search, X } from 'lucide-react'
import type { NavNote } from '@/app/components/navNotifications'

export type LauncherItem = { key: string; label: string; icon: ReactNode }
export type LauncherSection = { label: string; icon: ReactNode; items: LauncherItem[] }

// "All features" window: every feature the portal offers, as icon + name tiles grouped by section,
// so anyone can jump anywhere in one click without expanding the sidebar sections.
export default function FeatureLauncher({ open, onOpenChange, sections, activeNav, counts, latest, onSelect }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sections: LauncherSection[]
  activeNav: string
  counts: Record<string, number>
  latest: Record<string, NavNote[]>
  onSelect: (key: string) => void
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  // Features with unread notifications, busiest first — shown as a "What's new" strip so updates are one click away.
  const updates = sections
    .flatMap(s => s.items)
    .filter(i => (counts[i.key] ?? 0) > 0 && (!q || i.label.toLowerCase().includes(q)))
    .sort((a, b) => (counts[b.key] ?? 0) - (counts[a.key] ?? 0))
  const totalUpdates = updates.reduce((n, i) => n + (counts[i.key] ?? 0), 0)
  const go = (key: string) => { onSelect(key); onOpenChange(false); setQuery('') }
  const filtered = sections
    .map(s => ({ ...s, items: q ? s.items.filter(i => i.label.toLowerCase().includes(q)) : s.items }))
    .filter(s => s.items.length > 0)

  return (
    <Dialog.Root open={open} onOpenChange={next => { onOpenChange(next); if (!next) setQuery('') }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
          data-testid="feature-launcher"
          className="fixed left-1/2 top-1/2 z-[101] flex max-h-[85vh] w-[min(760px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-[#dce2db] bg-[#fbfcfa] shadow-2xl"
        >
          <div className="flex items-center gap-3 border-b border-[#dce2db] px-4 py-3">
            <Dialog.Title className="text-base font-semibold text-[#202a25]">All features</Dialog.Title>
            <div className="relative ml-auto w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7a867e]" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Find a feature…"
                aria-label="Find a feature"
                data-testid="launcher-search"
                className="h-9 w-full rounded-lg border border-[#dce2db] bg-white pl-9 pr-3 text-[13px] text-[#3b4a40] placeholder:text-[#7a867e] focus-visible:outline-2 focus-visible:outline-[#235b46]"
              />
            </div>
            <Dialog.Close className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-[#47574c] hover:bg-[#e3ece4] focus-visible:outline-2 focus-visible:outline-[#235b46]" aria-label="Close all features" data-testid="launcher-close">
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="space-y-5 overflow-y-auto p-4">
            {updates.length > 0 && (
              <section aria-label="Updates" data-testid="launcher-updates" className="rounded-xl border border-red-200 bg-red-50/60 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-red-500 text-white"><Bell className="h-3.5 w-3.5" aria-hidden="true" /></span>
                  <h3 className="text-[11px] font-bold uppercase tracking-[.08em] text-red-800">What&apos;s new</h3>
                  <span className="text-xs font-semibold text-red-700">{totalUpdates} unread</span>
                </div>
                <ul className="space-y-1.5">
                  {updates.map(item => {
                    const notes = latest[item.key] ?? []
                    const more = (counts[item.key] ?? 0) - notes.length
                    return (
                      <li key={item.key}>
                        <button
                          type="button"
                          onClick={() => go(item.key)}
                          data-testid={`launcher-update-${item.key}`}
                          className="flex w-full items-center gap-3 rounded-lg border border-red-100 bg-white p-2 text-left transition-colors hover:border-red-300 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-[#235b46]"
                        >
                          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#edf2eb] text-[#235b46] [&_svg]:!h-4 [&_svg]:!w-4">{item.icon}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold text-[#202a25]">{item.label}</span>
                            <span className="block truncate text-xs text-[#55635a]">
                              {notes[0]?.title}{more > 0 ? ` · +${more} more` : notes.length > 1 ? ` · +${notes.length - 1} more` : ''}
                            </span>
                          </span>
                          <span className="flex flex-shrink-0 items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">
                            <Bell className="h-3 w-3" aria-hidden="true" />{counts[item.key]}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
            {filtered.length === 0 && <p className="py-8 text-center text-sm text-[#55635a]" data-testid="launcher-empty">No features match “{query.trim()}”.</p>}
            {filtered.map(section => (
              <section key={section.label} aria-label={section.label} data-testid={`launcher-section-${section.label.toLowerCase()}`}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#dce9dc] text-[#235b46] ring-1 ring-[#c5d8c8]">{section.icon}</span>
                  <h3 className="text-[11px] font-bold uppercase tracking-[.08em] text-[#3b4a40]">{section.label}</h3>
                  <span className="h-px flex-1 bg-[#dce2db]" />
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {section.items.map(item => {
                    const isActive = activeNav === item.key
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => go(item.key)}
                        data-testid={`launcher-${item.key}`}
                        title={(latest[item.key] ?? []).map(n => n.title).join(' • ') || undefined}
                        aria-current={isActive ? 'page' : undefined}
                        className={`relative flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors hover:border-[#235b46]/40 hover:bg-[#edf2eb] focus-visible:outline-2 focus-visible:outline-[#235b46] ${isActive ? 'border-[#235b46] bg-[#dce9dc]' : 'border-[#dce2db] bg-white'}`}
                      >
                        <span className={`flex h-11 w-11 items-center justify-center rounded-xl [&_svg]:!h-5 [&_svg]:!w-5 ${isActive ? 'bg-[#235b46] text-white' : 'bg-[#edf2eb] text-[#235b46]'}`}>{item.icon}</span>
                        <span className="text-[13px] font-medium leading-tight text-[#202a25]">{item.label}</span>
                        {(counts[item.key] ?? 0) > 0 && (
                          <span
                            data-testid={`launcher-bell-${item.key}`}
                            aria-label={`${counts[item.key]} unread notification${counts[item.key] === 1 ? '' : 's'}`}
                            className="absolute right-2 top-2 flex items-center gap-0.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-sm"
                          >
                            <Bell className="h-3 w-3" aria-hidden="true" />{counts[item.key] > 99 ? '99+' : counts[item.key]}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
