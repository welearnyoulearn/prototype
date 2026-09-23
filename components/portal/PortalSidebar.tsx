'use client'

import { useSyncExternalStore, type ReactNode } from 'react'
import { Dialog } from 'radix-ui'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const desktopQuery = '(min-width: 1024px)'
function subscribe(callback: () => void) {
  const media = window.matchMedia(desktopQuery)
  media.addEventListener('change', callback)
  return () => media.removeEventListener('change', callback)
}
const getSnapshot = () => window.matchMedia(desktopQuery).matches
const getServerSnapshot = () => false

/** One navigation surface: a persistent rail on desktop, a modal drawer on phones. */
export default function PortalSidebar({ open, onClose, label, children, className }: {
  open: boolean
  onClose: () => void
  label: string
  children: ReactNode
  className?: string
}) {
  const desktop = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  if (desktop) {
    return <aside id="portal-navigation" aria-label={label} className={cn('portal-sidebar', className)}>{children}</aside>
  }

  return (
    <Dialog.Root open={open} onOpenChange={next => { if (!next) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="portal-drawer-overlay" />
        <Dialog.Content
          id="portal-navigation"
          className={cn('portal-sidebar portal-drawer', className)}
          aria-describedby={undefined}
          onCloseAutoFocus={event => {
            event.preventDefault()
            document.querySelector<HTMLElement>('[aria-controls="portal-navigation"]')?.focus()
          }}
        >
          <div className="portal-drawer-heading">
            <Dialog.Title className="text-sm font-semibold">{label}</Dialog.Title>
            <Dialog.Close className="portal-icon-button" aria-label="Close navigation"><X size={20} aria-hidden="true" /></Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
