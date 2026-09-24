'use client'

import { createContext, useContext } from 'react'
import type { Portal } from './types'

// Lets a portal's root layout/page declare its identity once
// (<PortalLoaderProvider portal="student">) so every loader further down
// the tree can call usePortalLoader() instead of threading a `portal` prop
// through every component. Passing `portal` explicitly always still works —
// this is a convenience default, not a requirement.
const PortalLoaderContext = createContext<Portal | null>(null)

export function PortalLoaderProvider({ portal, children }: { portal: Portal; children: React.ReactNode }) {
  return <PortalLoaderContext.Provider value={portal}>{children}</PortalLoaderContext.Provider>
}

/** Returns the current portal set by the nearest PortalLoaderProvider, or null if none. */
export function usePortalLoader(): Portal | null {
  return useContext(PortalLoaderContext)
}
