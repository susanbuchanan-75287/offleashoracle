# DISASTER RECOVERY — The Off-Leash Oracle™

> How to recover offleashoracle.com and its subscriber data after loss, corruption, or a
> bad deploy. Operated by **Joy, Thee & Me LLC** (owner: Susan Buchanan). All git work is
> done under the **susanbuchanan-75287** GitHub account.

**Last reviewed:** 2026-07-06

---

## 0. What can go wrong — and what recovers it

| Failure | Recovered by | RTO* |
|---|---|---|
| Site content lost / repo corrupted | Re-clone from GitHub + re-enable Pages (§1) | minutes |
| Bad deploy pushed live | Roll back `main` to a `deploy-<utc>-<sha>` tag (§2) | minutes |
| GitHub Pages outage | Wait out GitHub; content is safe in git (§1) | GitHub-dependent |
| **Subscriber list lost/corrupted** | Restore from JSON snapshot into Firestore (§4) | minutes |
| Backend functions broken | Redeploy from barkparks repo (§3) | ~10 min |
| Domain / DNS issue | Re-point DNS at GitHub Pages, re-add custom domain (§5) | DNS-dependent |

\* RTO = rough recovery time once someone is at a keyboard with credentials.

---

## 1. Recover the website (static content)

The website is **just static files in git**, published by **GitHub Pages** from `main`.
Nothing on the live site is unique — everything of value is committed.

1. Clone: `git clone https://github.com/susanbuchanan-75287/offleashoracle.git`
2. In GitHub → repo **Settings → Pages**: source = `main` (root), custom domain =
   `offleashoracle.com`, **Enforce HTTPS = on**.
3. Push any commit to `main` to trigger a fresh Pages build.
4. Verify: `curl.exe -I https://offleashoracle.com/` returns `200` and serves the current
   home page.

> The `CNAME` file in the repo root binds the custom domain — keep it.

---

## 2. Roll back a bad deploy

Every deploy to `main` is tagged `deploy-<utc>-<sha>` by CI (newest 30 kept). To revert:

1. List tags: `git --no-pager tag --list "deploy-*" | sort`
2. Identify the last-good tag (one before the bad one).
3. Restore and push (under susanbuchanan-75287):
   `git checkout main; git reset --hard <good-tag>; git push --force-with-lease origin main`
4. GitHub Pages republishes the good version. Verify with `curl.exe -I`.

Full rollback policy: `CHANGE-CONTROL.md` §5 "Deploy safety net & rollback".

---

## 3. Recover the backend (Cloud Functions)

⚠️ **The signup/daily-send backend is NOT in this repo.** It lives in the **barkparks**
repo at `functions/oracle.js`, deployed to Firebase project **`binditails-da2de`**.

Functions: `oracleSignup`, `oracleConfirm`, `oracleUnsubscribe`, `oraclePushSubscribe`,
`oraclePushUnsubscribe`, `oracleDailySend` (06:00 America/Chicago), `oraclePurge`
(03:30 America/Chicago).

To redeploy after loss/corruption:
1. Clone barkparks: `git clone https://github.com/susanbuchanan-75287/barkparks.git`
2. `cd barkparks; npm --prefix functions install`
3. Ensure `FIREBASE_TOKEN` is set in the environment.
4. `firebase deploy --only functions:oracle` (or a specific function name).
5. Verify: submit a test email on offleashoracle.com and confirm a record appears in
   Firestore `oracle-subscribers`.

Backend config lives in Firestore `settings/oracle` (`dailyEnabled`, etc.) — set in the
Firebase console, no deploy required.

---

## 4. Firestore subscriber data — backup & restore

The crown-jewel data is the **`oracle-subscribers`** Firestore collection (real opt-in
email/push subscribers). **A repo clone does NOT recover this** — Firestore data is
separate from git. This section is the tested runbook.

### 4a. Back up (repeatable)
Run the barkparks backup script:

```
powershell -File C:\SusanCopilot\barkparks\scripts\backup-subscribers.ps1
```

- Writes a timestamped raw JSON snapshot of every `oracle-subscribers` doc to
  `barkparks\data\backups\` (which is **gitignored** — snapshots contain PII and must
  **never** be committed).
- Keep an off-repo copy of each snapshot in a secure location.

### 4b. Access Firestore over REST (when gcloud/CLI is unavailable)
1. **Mint a GCP access token** from the ambient Firebase refresh token:
   POST `https://oauth2.googleapis.com/token` with
   `client_id=563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com`,
   the firebase-tools `client_secret`, `refresh_token=<FIREBASE_TOKEN>`,
   `grant_type=refresh_token`. The response `access_token` has `cloud-platform` scope.
2. **Base URL:**
   `https://firestore.googleapis.com/v1/projects/binditails-da2de/databases/(default)/documents/oracle-subscribers`
   (the literal `(default)` is part of the path). Header: `Authorization: Bearer <token>`.

### 4c. Restore — ALWAYS drill into a test collection first
Never restore blindly over the live collection. Verified procedure:

1. For each doc in the snapshot, POST to
   `.../documents/oracle-subscribers-restore-test?documentId=<url-encoded-id>`
   with body `{ "fields": <doc fields from snapshot> }`.
   - Doc IDs contain `@ : +` → URL-encode each id with `EscapeDataString`.
2. Read the test collection back; confirm the **count and every field/status/method**
   match the snapshot exactly.
3. Only once verified, either (a) point the app at the restored data, or (b) restore into
   the live `oracle-subscribers` collection using the same createDocument calls.
4. **Clean up** the test collection (DELETE each doc; confirm count = 0).

> **Drill result (2026-07-06):** backed up 4 confirmed docs → restored all 4 into
> `oracle-subscribers-restore-test` → verified 4/4 fields matched → deleted all 4 →
> post-cleanup count 0. The live collection was never touched. Restore path is proven.

### 4d. Subscriber doc schema (reference)
Doc id = `email:<addr>` or `sms:<e164>`. Fields: `value`, `status` (`confirmed`/`pending`),
`method` (`email`/`sms`/`push`), `source` (`offleashoracle`), `consentText`, `confirmToken`,
`unsubToken`, `createdAt`/`confirmedAt` (timestamp), `unsubscribedAt`, `lastNotifyAt`.

---

## 5. Domain / DNS

- `offleashoracle.com` points at GitHub Pages via the repo `CNAME` + DNS records at the
  registrar (A/ALIAS to GitHub Pages IPs, or CNAME to `susanbuchanan-75287.github.io`).
- After any DNS change, re-add the custom domain under Settings → Pages and re-enable
  **Enforce HTTPS**. Certificate provisioning can lag a few minutes to a few hours.

---

## 6. Credentials & where they live (do NOT commit any of these)

- **`FIREBASE_TOKEN`** — deploy + REST token source. Environment only.
- **`ARCHIVE_PUSH_TOKEN`** — PAT the daily-archive workflow uses to push past branch
  protection on `main`. GitHub repo secret only.
- **reCAPTCHA** site key (public, in `index.html`) + secret (Firebase functions secret).
- Firebase project owner access for `binditails-da2de`.

---

## 7. Recovery verification checklist

- [ ] `curl.exe -I https://offleashoracle.com/` → `200`, current content.
- [ ] Home page shows today's quote; Archive loads.
- [ ] Test signup creates a Firestore record (backend healthy).
- [ ] `settings/oracle.dailyEnabled` is in the intended state.
- [ ] Latest subscriber backup snapshot exists off-repo and restore path is known (§4).
