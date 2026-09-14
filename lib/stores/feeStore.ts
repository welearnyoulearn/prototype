import { create } from 'zustand'
import type { PendingPayment, StudentRow } from '@/app/school-admin/components/fee-management/types'

// Cross-tab state for the fee-management screen.
//
// FeeManagement.tsx is being split into per-tab components one slice at a time
// (see wiki/features/fee-management.md). Two different kinds of cross-tab need
// have come up so far:
//
// 1. Refresh signaling — several actions (a payment, a waiver, a cancellation)
//    need to tell OTHER tabs their cached data is stale, even when those tabs
//    aren't the one that triggered the change and may not currently be mounted.
//    Before the split this was direct calls like `if (reportData !== null)
//    loadReports()`, possible only because everything lived in one component.
//    A version counter per tab lets any action bump it without knowing whether
//    that tab is mounted or what its fetch function is called — the tab's own
//    effect just refetches when its counter changes.
//
// 2. Shared read state / cross-component requests — pendingPayments (online
//    payments awaiting verification) is read by three independent places at
//    once (the nav tab's pill count, Overview's "Needs Attention" list, and
//    Collect's own Online sub-view), so it's held here as real data rather than
//    just a version counter. pendingCollectRequest is a one-shot handoff: when
//    Leavers or Overview's passout panel wants to open a specific (possibly
//    synthesized, not-in-Collect's-own-ledger) student's collect form, it can't
//    reach into Collect's internal state directly anymore, so it hands off the
//    student row here and Collect's own effect picks it up and clears it.
type FeeStoreState = {
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

  pendingPayments: PendingPayment[]
  setPendingPayments: (payments: PendingPayment[]) => void

  pendingCollectRequest: StudentRow | null
  requestCollect: (row: StudentRow) => void
  clearCollectRequest: () => void

  // Same one-shot handoff shape as pendingCollectRequest, for the narrower case
  // of just picking Collect's sub-view (no specific student) — Archive's "View
  // Ledger" and Overview's online-payment alert both navigate here wanting a
  // particular sub-view selected, which is Collect's own internal state now.
  requestedCollectionView: 'counter' | 'online' | 'defaulters' | 'dayclose' | null
  requestCollectionView: (view: 'counter' | 'online' | 'defaulters' | 'dayclose') => void
  clearCollectionViewRequest: () => void
}

export const useFeeStore = create<FeeStoreState>((set) => ({
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

  pendingPayments: [],
  setPendingPayments: (pendingPayments) => set({ pendingPayments }),

  pendingCollectRequest: null,
  requestCollect: (row) => set({ pendingCollectRequest: row }),
  clearCollectRequest: () => set({ pendingCollectRequest: null }),

  requestedCollectionView: null,
  requestCollectionView: (view) => set({ requestedCollectionView: view }),
  clearCollectionViewRequest: () => set({ requestedCollectionView: null }),
}))
