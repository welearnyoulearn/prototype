# UI/UX Overhaul — Progress

Tracks Phase 2 of the UI overhaul (wiring, navigation, verification) against
`components/ui/` and the design tokens built in Phase 1. Updated as work
lands — an item is marked Done only after it passes the Step 6 gates for
that item, not when code is merely written.

**Excluded from all of this:** `FeeManagement.tsx` and everything under
`app/school-admin/components/fee-management/` — do not touch.

## Step 2 — Navigation & Back-button (STATUS: top-level nav done, sub-nav pending)

**Root cause found:** `app/school-admin`, `app/teacher`, `app/student`,
`app/parent` each held their active sidebar section in an in-memory stack
(`lib/useNavHistory.ts`) that was completely disconnected from the browser's
real history/URL. Pressing browser/phone Back therefore skipped past the
portal entirely, straight to whatever page came before it (the #124
in-app Back/Forward buttons were a workaround for this, not a fix).

**Fix applied:** built `lib/useSectionNav.ts` — one shared hook, used by all
four portals — that derives `activeNav` live from the URL's `?tab=` param
and calls `router.push` (real history entry) on section change instead of
`router.replace`. Deleted `lib/useNavHistory.ts` and
`app/components/NavBackForward.tsx` (fully superseded, zero remaining
references) along with all `<NavBackForward>` usages in the four portal
headers.

Also fixed, per Step 2's explicit rule: every post-login/logout/session-expired
redirect in all four portals now uses `router.replace` instead of `router.push`,
so Back after logging in never returns to the login screen.

`platform-admin` was already structured as real Next.js routes
(`/platform-admin/curriculum`, `/audit`, `/features`, `/logs`,
`/usage-analytics`, `/schools/[id]`) — no in-state tab bug there, nothing to fix.

| Portal | Top-level section nav → URL | Login/logout → replace | Old NavBackForward removed |
|---|---|---|---|
| school-admin | Done | Done | Done |
| teacher | Done | Done | Done |
| student | Done | Done | Done |
| parent | Done | Done | Done |
| platform-admin | N/A (already real routes) | not audited this pass | N/A |

**Verified:** `tsc --noEmit` clean, `npm run build` clean (this also caught a
real bug: `useSearchParams()` requires a `<Suspense>` boundary or the page
fails static prerendering in production — `parent`/`teacher`/`student`
didn't have one since they never called it before; added, matching the
boundary `school-admin` already had).

**NOT yet done (real gaps, not hidden):**
- Sub-tabs within a section (school-admin Staff directory/onboard, Students
  list/onboard; teacher ClassView's internal tabs; any wizard/stepper) are
  still plain React state, not URL-addressable. Back from inside a sub-tab
  exits the whole section, not just the sub-tab.
- Modals/drawers/sheets do not push a history entry — phone Back closes the
  underlying page's section, not just the open overlay.
- No scroll-position restoration on Back to a list.
- No unsaved-changes guard on navigation away from an edited form.
- Not yet checked with an actual browser back-button test (needs a login
  session — see note below).

## Step 1 — Inventory (top-level sections only; sub-views not yet broken out)

Columns: Item | Components wired (from new `components/ui/`) | Responsive checked | Motion | States | Done

### School Admin (`app/school-admin`, URL `?tab=`)
| Section | Components wired | Responsive | Motion | States | Done |
|---|---|---|---|---|---|
| overview | none | not checked | none | not checked | No |
| attendance | EmptyState | not checked | none | partial | No |
| leave-requests | none | not checked | none | not checked | No |
| emergency-cover | none | not checked | none | not checked | No |
| class-management | GradesMultiSelect, useConfirm | not checked | none | not checked | No |
| staff (directory/onboard) | EmptyState, GradesMultiSelect, useConfirm | not checked | none | partial | No |
| timetable | EmptyState | not checked | none | partial | No |
| curriculum | useConfirm | not checked | none | not checked | No |
| library | none | not checked | none | not checked | No |
| syllabus-tracking | none | not checked | none | not checked | No |
| exam-schedule | none | not checked | none | not checked | No |
| students (list/onboard) | EmptyState, useConfirm | not checked | none | partial | No |
| announcements | EmptyState | not checked | none | partial | No |
| feedback-management | useConfirm (QR regenerate) | not checked | none | not checked | No |
| export | none | not checked | none | not checked | No |
| settings | useConfirm | not checked | none | not checked | No |
| fee-management | **excluded — do not touch** | — | — | — | — |
| expenses | **excluded — do not touch (financial-adjacent)** | — | — | — | — |
| year-rollover | none | not checked | none | not checked | No |
| Shell (sidebar/topbar) | framer-motion active pill, hover/tap micro-interactions | not checked | Done | n/a | Partial |

### Teacher (`app/teacher`, URL `?tab=`)
| Section | Components wired | Responsive | Motion | States | Done |
|---|---|---|---|---|---|
| snapshot | none | not checked | none | not checked | No |
| class-view | useConfirm (syllabus setup) | not checked | none | not checked | No |
| timetable | none | not checked | none | not checked | No |
| attendance | none | not checked | none | not checked | No |
| leave | none | not checked | none | not checked | No |
| profile | none | not checked | none | not checked | No |
| my-classes | none | not checked | none | not checked | No |
| my-students | none | not checked | none | not checked | No |
| syllabus | none | not checked | none | not checked | No |
| library | none | not checked | none | not checked | No |
| tasks (TasksPage) | EmptyState | not checked | none | partial | No |
| doubts (DoubtsCenter) | useConfirm | not checked | none | not checked | No |

### Student (`app/student`, URL `?tab=`)
| Section | Components wired | Responsive | Motion | States | Done |
|---|---|---|---|---|---|
| dashboard | none | not checked | none | not checked | No |
| tasks | none | not checked | none | not checked | No |
| doubts | useConfirm | not checked | none | not checked | No |
| class-circle | none | not checked | none | not checked | No |
| my-marks | none | not checked | none | not checked | No |
| timetable | none | not checked | none | not checked | No |
| syllabus | none | not checked | none | not checked | No |
| library | none | not checked | none | not checked | No |
| profile | none | not checked | none | not checked | No |
| ai-hub | none | not checked | none | not checked | No |

### Parent (`app/parent`, URL `?tab=`)
| Section | Components wired | Responsive | Motion | States | Done |
|---|---|---|---|---|---|
| overview | none | not checked | none | not checked | No |
| today | none | not checked | none | not checked | No |
| attendance | none | not checked | none | not checked | No |
| fees | none | not checked | none | not checked | No |
| exams | none | not checked | none | not checked | No |
| results | none | not checked | none | not checked | No |
| syllabus | none | not checked | none | not checked | No |
| library | none | not checked | none | not checked | No |
| profile | none | not checked | none | not checked | No |

### Platform Admin (real routes already)
| Route | Components wired | Responsive | Motion | States | Done |
|---|---|---|---|---|---|
| /platform-admin | useConfirm | not checked | none | not checked | No |
| /platform-admin/curriculum | EmptyState, useConfirm | not checked | none | partial | No |
| /platform-admin/audit | none | not checked | none | not checked | No |
| /platform-admin/features | none | not checked | none | not checked | No |
| /platform-admin/library | none | not checked | none | not checked | No |
| /platform-admin/logs | none | not checked | none | not checked | No |
| /platform-admin/schools/[id] | useConfirm | not checked | none | not checked | No |
| /platform-admin/usage-analytics | none | not checked | none | not checked | No |

### Auth / standalone pages (login, forgot/reset/change-password ×5 portals, landing, feedback wizard, etc.)
Not yet inventoried row-by-row — flagged as remaining work.

## Step 6 — Grep gates (baseline this pass, not yet driven to target)

Counts as of this update, whole repo excluding `fee-management/`:

| Pattern | Count |
|---|---|
| `window.confirm(` / bare `confirm(` outside `components/ui` | 0 real (ExpenseManagement.tsx's 2 intentionally excluded — financial-adjacent, left native; every other `confirm(` hit is a call to the new `useConfirm` hook's own local variable, verified by checking each file imports `useConfirm`) |
| `alert(` / `window.alert(` | 0 (all 14 call sites across ExportCenter, TimetableManagement, WeeklyTest, ClassView converted to `sonner`'s `toast.error()`, which was already mounted app-wide via `<Toaster />` in `app/layout.tsx` — no new wiring needed) |
| `prompt(` | 0 (none existed) |
| raw `<button` outside `components/ui` | 115 (baseline, not yet driven down) |
| raw `<input` outside `components/ui` | 59 (baseline) |
| raw `<select` outside `components/ui` | 35 (baseline) |
| raw `<textarea` outside `components/ui` | 20 (baseline) |
| hardcoded hex colors / inline `style={{` | not yet counted |
| `components/ui` component usage counts (after first Step 3 batch) | Button: 5 files; Input: 2 files; Badge: 4 files; Tabs: 2 files; EmptyState: 14 files; Select: already used pre-existing in feedback/* (3 files); AlertDialog (via useConfirm): 15 files; GradesMultiSelect: 2 files. Still at 0: Tooltip, Popover (direct), DropdownMenu, Sheet, Checkbox, Switch, Avatar, Progress, Accordion, Breadcrumb, Pagination, Stepper, Combobox, Command palette, InputOTP, DatePicker |

## Honest summary

Done this pass: the actual navigation bug (#124's root cause) is fixed at the
top level for all 4 state-driven portals, verified by a clean production
build (which caught a real Suspense-boundary bug in the process). That's a
real, load-bearing fix, not cosmetic. Also closed out the `alert(`/`confirm(`
Step 6 gate completely (0 remaining outside the one excluded file), on top
of the `confirm()` conversions from the previous pass.

Not done: sub-tab/modal/drawer history entries, scroll restoration, unsaved-
changes guards, the rest of the Step 3 component-wiring sweep (this pass did
7 school-admin files: StaffProfile, MarketplaceOrders, NotificationCenter,
CommandBar (partial — search icon/input only, kept its bespoke debounced
search architecture rather than force-fitting the simpler CommandDialog and
losing real functionality), and 4 feedback/* files), Step 4 visual redesign
beyond school-admin's shell, Step 5 device-usability pass, and most of Step
6's grep-gate targets (raw `<button>`/`<input>`/`<select>`/`<textarea>`
counts have not yet moved from their baseline — this pass wired components
into files that had few/none of those, not the highest-count offenders like
TeachersManagement, TimetableManagement, ClassManagement, LeaveRequests,
which are next). Verified clean at every step: `tsc --noEmit`, `npm run
build`, `git diff --stat` (fee-management still untouched).
