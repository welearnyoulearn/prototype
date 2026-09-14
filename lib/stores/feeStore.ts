import { create } from 'zustand'

// Cross-tab refresh signaling for the fee-management screen.
//
// FeeManagement.tsx is being split into per-tab components one slice at a time
// (see wiki/features/fee-management.md). Several actions — recording a payment,
// granting/revoking a waiver, cancelling/correcting a payment — need to tell
// OTHER tabs their cached data is now stale, even when those tabs aren't the one
// that triggered the change and may not currently be mounted. Before the split,
// this was done with direct calls like `if (reportData !== null) loadReports()`
// because everything lived in one component with one shared state pool. Now that
// each tab owns its own fetch, a version counter per tab lets any action bump the
// counter without needing to know whether that tab is mounted or what its fetch
// function is called — the tab's own effect just refetches when its counter changes.
type FeeRefreshState = {
  statsVersion: number
  reportsVersion: number
  yearEndVersion: number
  ledgerVersion: number
  passbookVersion: number
  bumpStats: () => void
  bumpReports: () => void
  bumpYearEnd: () => void
  bumpLedger: () => void
  bumpPassbook: () => void
}

export const useFeeStore = create<FeeRefreshState>((set) => ({
  statsVersion: 0,
  reportsVersion: 0,
  yearEndVersion: 0,
  ledgerVersion: 0,
  passbookVersion: 0,
  bumpStats: () => set(s => ({ statsVersion: s.statsVersion + 1 })),
  bumpReports: () => set(s => ({ reportsVersion: s.reportsVersion + 1 })),
  bumpYearEnd: () => set(s => ({ yearEndVersion: s.yearEndVersion + 1 })),
  bumpLedger: () => set(s => ({ ledgerVersion: s.ledgerVersion + 1 })),
  bumpPassbook: () => set(s => ({ passbookVersion: s.passbookVersion + 1 })),
}))
