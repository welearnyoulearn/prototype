# Planned

Intentions, not commitments. Source: factbook section 8 and `docs/KNOWN_ISSUES.md`. Nothing here is live.

## Near term
| Item | Notes |
|------|-------|
| WhatsApp integration (Meta) + parent WhatsApp OTP | Draft PR #155; `lib/whatsapp.ts` is a logging scaffold only; absence alerts are email today |
| Timetable workflow | Built on `feature/175`, draft PR #177, awaiting sign-off |
| Rebuilt analytics | Year-in-Review, Parent Engagement, Class Analytics (preserved on branches) |
| Annual report card | A per-exam printable report card exists in Export Center; a multi-exam card with remarks does not |
| API auth guards | See in-progress.md |

## Later
| Item | Notes |
|------|-------|
| Payment gateway | Needs field-level encryption (`lib/encryption.ts` not built) first |
| Half-day and class-specific holidays | Attendance/Calendar limitation |
| School health score | Composite of attendance, marks, fees |
| LEAP integration | Only if a public API/import exists; today: absentee export |
| Swap the transliteration endpoint | Google Input Tools is undocumented; move to a keyed service behind `/api/transliterate` |
| AI features | Only after a clear use case; the product is **not** marketed as AI-powered |

## Removed from `dev` (preserved on branches — not planned for `dev`)
Learning Hub & Daily Knowledge (#164), Rewards Marketplace (#165), Teacher lesson planner, weekly test (#168), Daily Briefing, Student–Teacher Analysis, Notification Centre page (#188–#190), Homework/Tasks, Doubts, Leave Requests, Emergency Cover (#143). Deleted for good: TV display kiosk, admin Student Leaderboard.
