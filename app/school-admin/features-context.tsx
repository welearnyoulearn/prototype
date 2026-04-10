'use client'

import { createContext, useContext } from 'react'

// Set of enabled feature keys for the current school's plan.
// Components use this to conditionally render sections.
const FeaturesContext = createContext<Set<string>>(new Set())

export const FeaturesProvider = FeaturesContext.Provider

// Returns true if the feature is enabled for this school's plan
export function useFeature(key: string): boolean {
  const features = useContext(FeaturesContext)
  // Empty set means context not set — default to enabled (safe fallback)
  if (features.size === 0) return true
  return features.has(key)
}

// Returns the full set — use when you need to check multiple features
export function useFeatures(): Set<string> {
  return useContext(FeaturesContext)
}
