"use client"

import * as React from "react"
import { SearchIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

interface CommandItemData {
  value: string
  label: string
  group?: string
  icon?: React.ReactNode
  shortcut?: string
  onSelect: () => void
}

interface CommandDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: CommandItemData[]
  placeholder?: string
  emptyText?: string
}

/** Cmd+K style command palette. Register the open shortcut where it's mounted. */
function CommandDialog({
  open,
  onOpenChange,
  items,
  placeholder = "Type a command or search…",
  emptyText = "No results found.",
}: CommandDialogProps) {
  const [query, setQuery] = React.useState("")
  const [activeIndex, setActiveIndex] = React.useState(0)

  React.useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  const filtered = React.useMemo(() => {
    if (!query) return items
    const q = query.toLowerCase()
    return items.filter((i) => i.label.toLowerCase().includes(q))
  }, [items, query])

  React.useEffect(() => setActiveIndex(0), [query, open])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter" && filtered[activeIndex]) {
      e.preventDefault()
      filtered[activeIndex].onSelect()
      onOpenChange(false)
    }
  }

  const groups = React.useMemo(() => {
    const map = new Map<string, CommandItemData[]>()
    filtered.forEach((item) => {
      const key = item.group ?? ""
      map.set(key, [...(map.get(key) ?? []), item])
    })
    return Array.from(map.entries())
  }, [filtered])

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-(--z-modal) bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onKeyDown={handleKeyDown}
          className="fixed top-[20%] left-[50%] z-(--z-modal) w-full max-w-lg translate-x-[-50%] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl duration-[var(--motion-transition)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <div className="flex items-center gap-2 border-b px-3">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="h-12 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden shrink-0 rounded border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground sm:inline">
              Esc
            </kbd>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {emptyText}
              </p>
            ) : (
              groups.map(([group, groupItems]) => (
                <div key={group} className="mb-2 last:mb-0">
                  {group && (
                    <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                      {group}
                    </p>
                  )}
                  {groupItems.map((item) => {
                    const index = filtered.indexOf(item)
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => {
                          item.onSelect()
                          onOpenChange(false)
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm outline-hidden transition-colors",
                          index === activeIndex
                            ? "bg-accent text-accent-foreground"
                            : "text-foreground"
                        )}
                      >
                        {item.icon}
                        <span className="flex-1">{item.label}</span>
                        {item.shortcut && (
                          <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                            {item.shortcut}
                          </kbd>
                        )}
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export { CommandDialog }
export type { CommandItemData }
