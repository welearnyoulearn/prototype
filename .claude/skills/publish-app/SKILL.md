---
name: publish-app
description: Publish or update an Android app (or Expo/React Native, Capacitor, TWA game) on Google Play under any of the user's Play Console accounts (Soqall org, WLYL, Varchas, or a new one). Use for "publish the app", "push this version to Play", "release it", "upload the new build", "send it for review", "which account is X on", or a new app's first listing. The user names the account, package and track; this skill covers building, signing, uploading and sending for review.
---

# Publish an app to Google Play

The user says **what** (repo/app), **where** (which Play account, which track) and sometimes **which backend**. Everything else comes from here. Before starting, read `accounts.md` (the account and app registry). After finishing, **update `accounts.md` and the "Lessons" section below**. This skill is meant to be edited as we learn.

## 0. Pin down the inputs (ask only for what's missing)

| Input | Default if unsaid |
|---|---|
| App / repo | the one being worked on in this thread |
| Play account | the account the app is already on (`accounts.md`); for a new app, ask |
| Package name | existing listing's package; new app → `com.<org>.<app>` and check it's free |
| Track | `production` on org accounts. Personal accounts created after Nov 2023 need a 14-day closed test (`alpha`) with 12 testers first |
| Version | bump `versionName` (patch) + `versionCode` (must beat every code ever uploaded, on any track) |
| Backend / env | keep what the live app uses; confirm if dev vs prod is unclear |
| Release notes | short summary of the git log since the last release |

Use AskUserQuestion only for choices the user owns: account for a new app, prod vs dev backend, privacy/contact details, resetting a lost upload key.

## 1. Find out what's live

- Browser (T3 preview tools): open `https://play.google.com/console/u/0/developers/<devId>/app/<appId>/app-dashboard`. The user is signed in there. Check the current version, track and status, and any "Changes in review" or policy blockers.
- API (the app must have API access granted to the gcloud user): `scripts/play-upload.py --pkg <pkg> --status`. This prints tracks and versionCodes.
- **Is it the same kind of app?** For example, the WLYL listing was a PWA/TWA wrapper and we replaced it with the native Expo app. Same package plus same app-signing key means it ships as a normal update.

## 2. Build the release AAB

**Expo / React Native**
```bash
export JAVA_HOME=$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=~/Library/Android/sdk NODE_ENV=production
# set android.package + versionCode/version in app.json; google-services.json must contain a client for that package
pnpm install            # or npm ci
npx expo prebuild -p android --clean && git checkout -- package.json   # prebuild rewrites scripts
(cd android && ./gradlew bundleRelease)   # → android/app/build/outputs/bundle/release/app-release.aab
```
- Set env such as `EXPO_PUBLIC_API_ORIGIN=…` at build time; it is baked in.
- Firebase: if the package is new, register an Android app in the Firebase project (Management API or console) and merge its client into `google-services.json`. Otherwise the Gradle google-services task fails.
- Emulator test APK: `./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a`, then `adb install -r`.

**Capacitor / web-game repos**: use the repo's own `docs/RELEASE.md` / build script (for example the brain-arcade repos produce `dist-android/<game>/<game>-<ver>-<code>-release.aab`).

Low disk: Gradle needs about 8 GB free. Offload caches to the "Varchas SSD" (`/Volumes/Varchas SSD/mac-offload/`, symlink back). Never touch "Varchas Backup".

## 3. Sign with the account's upload key

Keys live outside repos (see `accounts.md`), chmod 600, with `keystore.properties` (storeFile/storePassword/keyAlias/keyPassword). **Never print passwords.** Then run:
```bash
scripts/sign-aab.sh <in.aab> <out.aab> <keystore.properties>
```
It strips the debug signature, signs with jarsigner (SHA256withRSA), and verifies.
Check that the cert SHA-1 matches the **upload key** shown in Console → Test and release → App integrity → App signing.

**Lost upload key**: App signing → "Request upload key reset". Generate a new key (`keytool -genkeypair -alias upload -keyalg RSA -keysize 2048 -validity 10000`; use `/opt/homebrew/opt/openjdk@17/bin/keytool` if the system keytool lacks a JRE), export the PEM, and upload it. The new key only becomes valid after about 48h (Console shows the exact time). Uploads before then are rejected, so schedule the upload for after that time.

## 4. Upload + release

```bash
python3 -u scripts/play-upload.py --pkg <pkg> --aab <signed.aab> --track production \
  --name "1.0.6" --notes "en-US=What's new…" [--quota-project wlyl-512003] [--rollout completed] --commit
```
- Without `--commit` it is a dry run: it validates the edit, then deletes it.
- By default the release is a **draft**. With `--rollout completed`, it goes straight to review and rolls out on approval (only for apps that are already live/approved; first releases must be drafts).
- **Don't click around the Console while an API edit is open.** Any Console change invalidates the edit ("change made outside this Edit"). If that happens, just re-run.
- A committed (non-draft) API edit goes to review on its own. Still open Console → Publishing overview and confirm it reads "Changes in review". If it shows **Send for review** (a draft, managed publishing on, or an App content change), click it. While an earlier submission is in review, Play asks to **Restart review**, which resets the wait; tell the user before confirming.
- Check the **Managed publishing** toggle on Publishing overview. If it's on, an approved release also needs **Publish changes**.

## 5. Listing / policy checklist (new apps, or when Console flags it)
App content: privacy policy URL (the page must name **this** app and what it collects; a shared page must cover every app that links to it), app access (reviewer login: read the username in App content → Sign-in details and log in with it against the API the build uses; check it has real data such as classes, students and exams. Claude never types passwords into Play Console: the user enters them), ads, content rating, target audience, data safety, government/financial/health declarations, and the contact email. Store listing: title ≤30, short ≤80, full ≤4000, 512 px icon, 1024×500 feature graphic **that shows real app screens** (logo plus text alone was rejected under the Metadata policy), ≥2 phone screenshots per listed language. Keep the repo's `store/` assets in sync with what's on Play. **Delete empty extra-language listings.** They block country selection. Countries: Production → Countries/regions → select all.

## 6. Report back + record
Tell the user: version, track, status (draft / in review), the expected review time (updates usually take 1–3 days, new apps up to 7), and anything that will block it. Then update `accounts.md` (versionCode, date, key info) and add any new lesson below.

## Lessons (append as we go)
- 2026-11-13 Sky Rush: an empty en-GB listing locked production countries; deleted it via API.
- 2026-11-13 WLYL: the old upload key was lost, so we reset it (valid 15 Nov 18:51). The PWA listing was replaced by the native build at versionCode 13.
- 2026-11-13 WLYL: the reviewer demo account had been deleted from the DB. Re-seed it and test the login before submitting. Repeated test logins hit a 429 rate limit (`auth_rate_limits` table).
- 2026-11-17 WLYL: managed publishing is ON. Google approved 1.0.6 the same day, but it stayed off the store until someone clicked Publishing overview → Publish changes. Always check for that step after approval.
- 2026-11-24 WLYL Teacher: rejected under the Metadata policy because the feature graphic (logo plus text bullets) did not show the app. The fix was a feature graphic that includes real app screens.
- 2026-11-26 WLYL 1.0.7: EAS `production` profile has autoIncrement, so the EAS AAB was code 15 while app.json said 14, and it was signed with the EAS key (SHA-1 0D:0D…), not our upload key. Re-sign EAS AABs with sign-aab.sh and read the real versionCode from the upload output.
- 2026-11-26 WLYL: an API edits.commit (no changesNotSentForReview) sends changes straight to review; no Console click needed. Managed publishing was found OFF on 26 Nov, so check the toggle on Publishing overview rather than assuming.
- 2026-11-26 WLYL Teacher: the reviewer login in Play (priya.sharma@wlyldemo.example) was never checked against the backend. Test the Play sign-in details against the API the build uses before every submission. Any App content change while in review shows "Send for review" and restarts the review clock.
