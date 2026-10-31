# Ready for peaks: many students at the same moment

**Why:** the Daily Quiz turns a whole school's students into one burst of traffic: when it opens, when the
"closes soon" reminder goes out, or simply when everyone gets home. The time varies; the shape doesn't: thousands of
requests within a few minutes. This page covers what the app now does about it (#450, #452) and what still needs a
change outside the code.

## What one student costs (after #450)

| Step | Requests | Notes |
|---|---|---|
| Open the quiz screen | 1 `/today` per page | The home card and the quiz screen share it; it refreshes at the next opening/closing time (spread over a minute per device) or every 5 minutes, and when the student returns to the tab. Before: two screens each polled every minute. |
| Start | 1 | The class's quiz is normally created by the opening cron; if not, the first student creates it and everyone else reuses it (unique per class and day). |
| Answer | 1 per question | Checks only that attempt's deadline. |
| Finish | 1 + 1 | Grading, points and the answers in one transaction, then the review. |

Per request the server now keeps quiz settings, holidays and feature switches in memory for a minute (holidays 5)
and loads the student with their class in one query. Question preparation never runs on student requests.

## Measured (local test app, one database connection)

200 students of one class, every step fired at the same moment (some in two tabs, some double-tapping Finish):

| | Before | After #450 + #452 |
|---|---|---|
| Open today's quiz (200 requests) | 5.3 s | 3.1 s |
| Answer (600 requests) | 10.4 s, **66 refused** | 7.2 s, 0 errors |
| Review (200 requests) | 6.0 s | 2.3 s |
| Duplicates | none | none: 1 quiz, 200 attempts, points once each |

The local database serves one request at a time, so these totals show the work per request, not production speed.
The 66 refusals were the gatekeeper bug fixed in #452: under load it answered "Feature not enabled" (403) for a
feature that was on.

Scripts (throwaway database only): `stress-quiz.mjs` (N students at once), `e2e-api.mjs`, `e2e-journey.mjs`,
`smoke-screens.mjs`.

## Still to do outside the code (recommended, in order)

1. **Database connections: switch to the Supabase transaction pooler (port 6543).** In session mode every busy
   Vercel instance holds a whole Postgres connection, and a burst can use them all up: requests then wait and fail
   with timeouts. In transaction mode a connection is shared between transactions. The app uses plain queries and
   short transactions, so it fits; check for `SET`, advisory locks or `LISTEN` before switching (none in the quiz
   code), and keep `max: 1` per instance.
2. **Check the Supabase plan's connection limit and compute size** against the expected peak (students per school
   × schools opening at once).
3. **Fewer extra calls per request.** Besides the feature check (now remembered 15 s, #452), `proxy.ts` sends a
   usage count and a log line to internal routes on every API call. Each is another function call and another
   database write during the burst. Batching them (or sampling logs) would roughly halve the work at peak.
4. **Spread the notices.** The "ready" and "closes soon" pushes go to a whole school at once; everyone who taps
   arrives together. Sending them over a few minutes per class would flatten the burst.
5. **Watch it on pilot day:** Vercel function errors and durations, Supabase connections and slow queries, for
   the first opening.

## Limits of these tests

- Local only: the dev server and a single-user test database, not Vercel and Supabase.
- One class of 200. A real peak is many schools, so items 1–2 above matter more than the per-request numbers.
