# Student Search: one-school rollout (#538)

**Do not start stage 2 until every gate in stage 1 is ticked.**

## Stage 0: dev website, test accounts only

- [ ] `GOOGLE_CSE_ID` set for the dev project on Vercel, then redeploy
- [ ] Switched on **per test school** (school override), not for a whole plan tier
- [ ] Test parent agrees; test student sees Search; results and Wikipedia card appear
- [ ] Parent sees the search; an unsuitable search is stopped and marked
- [ ] Parent turns it off: student loses Search and history is empty
- [ ] Repeat on a phone

## Stage 1: gates before any real student

- [ ] Ad-free Google search working, with Google's written answer on children's data
- [ ] Lawyer approval ([review pack](REVIEW-PACK.md)), including how a parent is verified
- [ ] Final privacy notice shown in the parent portal, in English and Telugu
- [ ] Counsellor approval, and a named person for self-harm searches
- [ ] Telugu and Hindi phrases checked by native speakers
- [ ] Load test of a deployed test environment (web server and database connections), not only the database
- [ ] Production database's recorded schema version checked to be below the code's `SCHEMA_VERSION`
- [ ] Support contact and a person who can switch it off

## Stage 2: pilot, one school, two weeks

1. Pick one school that agrees in writing. Start with one or two classes.
2. Platform admin switches **Student Search** on for that school only.
3. Parents get the notice; only children with consent see Search.
4. Check daily: errors, how many parents agreed, searches per day, stopped searches, complaints.

**Switch it off** (school override off) at once for: an unsuitable result reported, ads shown, data visible to the
wrong person, consent not respected, or errors that slow other parts of the portal.

## Stage 3: more schools

Add a few schools at a time after the pilot is reviewed. Before large numbers: recheck database size and
connections, and consider keeping history for fewer days.

## Database load test, 26 November 2026

`scripts/load-test-student-search.ts`, one run each, on a developer laptop with local Postgres, 20 connections,
1,00,000 students, 5,000 searches and 1,000 history views. It times the database queries only.

| Saved searches | Search p95 / slowest | Parent history p95 / slowest | Failed |
|---|---|---|---|
| 30 lakh (before the clean-up change) | 4.9 ms / 379 ms | 7.2 ms / 17 ms | 0 |
| 30 lakh (after) | 4.1 ms / 265 ms | 5.2 ms / 27 ms | 0 |
| 1.5 crore (after, 5 lakh expired) | 7.7 ms / 711 ms | 34.7 ms / 111 ms | 0 |

1.5 crore searches take about 2.7 GB with indexes. The cause of the few slow calls was not investigated. Web server
time, login checks, network and Supabase connection limits are **not** covered.

## Switching off

Platform admin turns the school override off (and checks no plan tier has it on). The menu disappears and student
routes refuse. Saved searches expire after 30 days; parents can delete them sooner.
