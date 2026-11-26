# Play Console accounts and apps

Auth for the API: gcloud application-default login as the Play admin Google account (the androidpublisher scope), quota project `wlyl-512003`. Grant that user "API access" / admin on each developer account before using the API there.

| Account | Developer ID | Type | Notes |
|---|---|---|---|
| Soqall (organisation) | 8339321360449058584 | org, verified | no 14-day test gate → production directly |
| WLYL (We Learn You Learn) | 5151259747250440877 | org | |
| Varchas (personal) | ? | personal | 14-day / 12-tester closed test before production |

## Apps

| App | Package | Account | App ID | Repo | Upload key | Last release |
|---|---|---|---|---|---|---|
| Sky Rush: Flying Roadster | com.soqall.skyrushgame | Soqall | 4976319404357015596 | ~/Developer/brain-arcade-sky-rush (feat/sky-rush), `scripts/play-upload.py . --game sky-rush …` | repo's keystore | 1.0.0 in review 2026-11-13 |
| WLYL Parent | com.welearnyoulearn.wlyl | WLYL | 4973335428435783708 | ~/Documents/Codex/code/projects/wlyl-parent-mobile-store (branch release/wlyl-store, Expo @thindaams-team/wlyl-parent-mobile, moved from @thindaam 2026-11-26) | `~/.wlyl-android-keys/` (alias upload, SHA-1 CD:FF:93:3D…03:10, valid from 2026-11-15 18:51) | 1.0.7 (code 15, EAS build re-signed with upload key, backend wlyl-dev.vercel.app) committed to production via API 2026-11-26, auto-sent to review (Changes in review; managed publishing now OFF, goes live on approval). Prev 1.0.6 (code 13) live 2026-11-17 |
| WLYL Teacher | com.welearnyoulearn.teacher | WLYL | 4974049830148151695 | ~/Documents/Codex/code/projects/wlyl-teacher-mobile (Expo @thindaams-team/wlyl-teacher-mobile, moved from @thindaam 2026-11-26) | ? (check before next upload) | 1.0.0 (code 2) first production release REJECTED 2026-11-24 (Metadata policy: unclear feature graphic). Resubmitted with a new feature graphic showing app screens. 2026-11-26: privacy page widened to cover Teacher; reviewer login switched to the dev teacher pkowsik2004@gmail.com (classes, students, exams on wlyl-dev); review restarted. Managed publishing off. |
| Brain Arcade | com.soqall.brainarcade | ? | ? | brain-arcade repo | repo's keystore | closed testing (alpha) |

Reviewer logins and privacy URLs: kept with each app (for example `wlyl-parent-app/play/demo-login.local.txt`). Never copy passwords here.

WLYL privacy and account-deletion pages (`https://wlyl.varchas.store/privacy/`, `/delete-account/`) cover both Parent and Teacher. Source: `wlyl-parent-mobile/site/public/`; deploy with `npx wrangler deploy` from `site/` (Cloudflare account estore.in.com, worker `wlyl-parent-site`).
