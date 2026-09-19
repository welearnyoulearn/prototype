# Extraction Plan — Leave Requests (`leave-requests`, issue #139)

This branch (`feature/139-remove-leave-requests`) is the **preservation
copy** — no code is removed here, only this plan and a wiki note are added.

## Coupling warning
`leave-requests` and `emergency-cover` (#140) are related: `substitute_assignments`
(the Emergency Cover table) has `leave_request_id INTEGER REFERENCES
leave_requests(id) ON DELETE CASCADE`. **Remove `emergency-cover`'s
`substitute_assignments` table before or together with `leave_requests`**, or
drop that FK column first — otherwise the migration/removal order matters.
See `EXTRACTION-140.md` for the other side of this.

## 1. `lib/features.ts`
- Remove the `leave-requests` entry from `ALL_FEATURES` (line 25).
- Not in `OVERRIDABLE_FEATURE_KEYS`/`PORTAL_NAV_KEY_ALIASES` — nothing else there.

## 2. `lib/db.ts`
- `leave_requests` table (lines ~220-231).
- `app/api/teachers/[id]/route.ts` line ~302 does `DELETE FROM leave_requests WHERE teacher_id = $1` as part of teacher deletion cascade — remove that statement too (or leave it as a no-op if the table itself isn't dropped yet during a staged removal).

## 3. API routes — delete entirely
- `app/api/leave-requests/route.ts`
- `app/api/leave-requests/[id]/route.ts`

## 4. UI components
- `app/school-admin/components/LeaveRequests.tsx` — delete.
- `app/teacher/components/TeacherLeave.tsx` — delete.
- `app/school-admin/page.tsx` — remove:
  - `const LeaveRequests = dynamic(...)` (line 35)
  - `'leave-requests'` from the SCHEDULING nav group (line 81)
  - the `{ key: 'leave-requests', label: 'Leave Requests', ... }` nav-item object (~line 108)
  - the `visited.has('leave-requests')` render block (line 677)
- `app/teacher/page.tsx` — remove the `TeacherLeave` dynamic import and its `visitedNav.has('leave')` render block (line 359) and the `'leave'` nav key.

## 5. Shared dashboard/analytics files — surgical removal only, keep the rest
- `app/school-admin/components/Overview.tsx` — remove `hasLeave` (`useFeature('leave-requests')`), `stats.pendingLeaves`, the "Pending Leaves" metric card, the "Leave request(s) awaiting approval" banner, and the `Review Leaves` quick action (lines ~54-237, 279). Keep `hasCover`/uncovered-periods handling only if Emergency Cover survives — see coupling note above; if both are removed together, also remove the `uncByTeacher`/uncovered-periods block (~lines 140-146, 433-441).
- `app/api/admin/overview/route.ts` — remove the `leavesQ`/`features.has('leave')` block (~lines 27-45) and its `leaves` key in the combined response (~lines 147-159).
- `app/api/admin/briefing/route.ts` — remove the `leaveData` query (~line 61-64) and its `pending leave request(s)` alert (~lines 205-206, 232). The `uncoveredData`/`emergency-cover` alert (line 208) belongs to #140 — coordinate.
- `app/school-admin/components/StudentTeacherAnalysis.tsx` — remove the `leaves` state, `/api/leave-requests` fetch, `leaveStats`, and the "Leave Request Summary" card (lines ~9-167).
- `app/teacher/components/SmartSnapshot.tsx` — remove `todayLeave` state, the `/api/leave-requests?...status=approved` fetch, and the "On approved leave today" banner (lines ~125-315).
- `app/school-admin/components/NotificationCenter.tsx` — remove the `leave_request`/`leave_approved`/`leave_rejected` notification-type label entries (lines 17-19) — only if no other feature emits those notification types (confirm; substitute assignment approval flow may reuse them).
- `app/school-admin/components/CommandBar.tsx` — remove the "Review Leave Requests" action and "Leave Requests" nav entries (lines 19, 38).
- `app/api/notifications/nudge-teacher/route.ts` — comment only references `/api/leave-requests` as a sibling example; no code change needed, just update/remove the comment.

## Summary
Leave Requests has one dedicated table, two API routes, and two dedicated
components (admin + teacher), but its "pending count" and "on leave today"
status surface in five other dashboard/analytics files (Overview, admin
overview/briefing APIs, Student-Teacher Analysis, Smart Snapshot,
CommandBar, NotificationCenter) that must be edited in place rather than
deleted. It is functionally coupled to Emergency Cover (#140) via the
`substitute_assignments.leave_request_id` FK — coordinate removal order.
