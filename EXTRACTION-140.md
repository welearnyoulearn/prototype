# Extraction Plan — Emergency Cover (`emergency-cover`, issue #140)

This branch (`feature/140-remove-emergency-cover`) is the **preservation
copy** — no code is removed here, only this plan and a wiki note are added.

## Coupling warning
`emergency-cover`'s `substitute_assignments` table has `leave_request_id
INTEGER REFERENCES leave_requests(id) ON DELETE CASCADE` — a dependency on
Leave Requests (#139). **Remove `substitute_assignments` before or together
with `leave_requests`**; if `leave-requests` is removed first without
handling this table, the FK will dangle. See `EXTRACTION-139.md`.

## 1. `lib/features.ts`
- Remove the `emergency-cover` entry from `ALL_FEATURES` (line 26).
- Not in `OVERRIDABLE_FEATURE_KEYS`/`PORTAL_NAV_KEY_ALIASES` — nothing else there.

## 2. `lib/db.ts`
- `substitute_assignments` table (lines ~399-415), including its comment
  "Substitute teacher assignments — when a teacher is on leave, admin
  assigns substitutes per period" and the `attendance` constraint-drop line
  just above it (line 398, `attendance_student_id_date_class_id_key`) is
  unrelated — do not remove that line, it's an `attendance` (protected
  feature) fix that merely sits adjacent in the migrations array.

## 3. API routes — delete entirely
- `app/api/substitutes/route.ts`

## 4. UI components
- `app/school-admin/components/EmergencyCover.tsx` — delete.
- `app/school-admin/page.tsx` — remove:
  - `const EmergencyCover = dynamic(...)` (line 36)
  - `'emergency-cover'` from the SCHEDULING nav group (line 81)
  - the `{ key: 'emergency-cover', label: 'Emergency Cover', ... }` nav-item object (~line 118)
  - the `visited.has('emergency-cover')` render block (line 678)

## 5. Shared dashboard/analytics files — surgical removal only, keep the rest
- `app/school-admin/components/Overview.tsx` — remove `hasCover`
  (`useFeature('emergency-cover')`), the `uncByTeacher`/uncovered-periods
  map and its rendered "uncovered periods" alert block (lines ~54-146,
  213, 433-441). If Leave Requests (#139) is also being removed at the same
  time, this overlaps with that file's `hasLeave` removal — do both in one
  pass since they share the same uncovered-periods query result shape.
- `app/api/admin/overview/route.ts` — remove the "Uncovered periods today"
  query block (~lines 35-43) and its `cover` key in the combined response
  (~line 147-159).
- `app/api/admin/briefing/route.ts` — remove the `uncoveredData` query
  (~lines 70-87, referencing `substitute_assignments`) and its "uncovered
  today" critical alert (~lines 207-208, 233).
- `app/school-admin/components/DailyBriefing.tsx` — remove the "Uncovered
  Periods" stat card (~lines 17, 195-201) that navigates to `emergency-cover`.
- `app/school-admin/components/CommandBar.tsx` — remove the "Emergency
  Cover" nav entry (line 42).

## Summary
Emergency Cover has one dedicated table (`substitute_assignments`), one API
route, and one dedicated admin component, with its "uncovered periods"
count surfaced in three dashboard files (Overview, admin overview API,
Daily Briefing/briefing API) alongside Leave Requests' pending-count metric
— those two features share the same dashboard sections in several files, so
extracting them together in one pass (rather than one at a time) will avoid
redundant edits to `Overview.tsx` and `app/api/admin/briefing/route.ts`.
The `substitute_assignments.leave_request_id` FK is a hard dependency on
Leave Requests' table — coordinate removal order with `EXTRACTION-139.md`.
