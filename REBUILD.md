# REBUILD FROM SCRATCH — The Off-Leash Oracle™

> How to reconstruct offleashoracle.com and its backend **from nothing** — assuming the
> repo, the Firebase project, and the domain are all gone. Operated by
> **Joy, Thee & Me LLC** (owner: Susan Buchanan). All git work under **susanbuchanan-75287**.

For recovering an *existing* deployment (bad deploy, lost data), use `DISASTER-RECOVERY.md`
instead. This document is the total-loss / clean-room rebuild.

---

## 0. Inventory — what makes up the product

1. **Static website** — this repo, published by GitHub Pages.
2. **Backend Cloud Functions** — in the **barkparks** repo (`functions/oracle.js`),
   deployed to Firebase project `binditails-da2de`.
3. **Subscriber database** — Firestore collection `oracle-subscribers`.
4. **Custom domain** — `offleashoracle.com` at the registrar.

You rebuild in that order: site → backend → data → domain → verify.

---

## 1. Prerequisites

- GitHub account **susanbuchanan-75287** with repo-create rights.
- Node.js LTS + `git` + `firebase-tools` (`npm i -g firebase-tools`) + `curl.exe`.
- Firebase / Google Cloud access to (or ability to recreate) project `binditails-da2de`.
- `FIREBASE_TOKEN` in the environment for non-interactive deploys.
- The most recent **subscriber backup snapshot** (from
  `barkparks\scripts\backup-subscribers.ps1`) if you intend to restore real subscribers.

---

## 2. Rebuild the website

1. Create/clone the repo:
   `git clone https://github.com/susanbuchanan-75287/offleashoracle.git`
   (or create a fresh `offleashoracle` repo and add the files below).
2. Required files/dirs in the repo root:
   - `index.html`, `archive.html`, `privacy.html`, `terms.html`
   - `data/` — daily quote JSON
   - `scripts/` — `build-archive.js` and helpers
   - `robots.txt`, `sitemap.xml`, `site.webmanifest`, `CNAME`
   - `.github/workflows/` — Pages deploy, `deploy-safety-net` (validate + `deploy-<utc>-<sha>`
     tagging), and `daily-archive.yml`
3. Rebuild the archive from data: `node scripts/build-archive.js` → regenerates
   `archive.html`. Commit the result.
4. Push to `main`.
5. GitHub → **Settings → Pages**: source `main` (root), custom domain
   `offleashoracle.com`, **Enforce HTTPS = on**.

### Security baseline (must be present on every HTML page)
Because GitHub Pages cannot set custom response headers, security is enforced via **meta
tags**:
- Full **Content-Security-Policy** meta (`default-src 'self'`; `frame-ancestors 'none'`;
  `base-uri 'self'`; `form-action 'self'`; `object-src 'none'`; scoped
  script/style/font/img/connect — connect must allow `*.cloudfunctions.net`,
  `*.googleapis.com`, `fcmregistrations.googleapis.com`, `firebaseinstallations.googleapis.com`;
  script/frame must allow `google.com`/`gstatic.com` for reCAPTCHA + Firebase).
- `<meta http-equiv="X-Content-Type-Options" content="nosniff">`
- `<meta name="referrer" content="strict-origin-when-cross-origin">`
- SEO: canonical, Open Graph, Twitter card, JSON-LD (WebSite + Organization), manifest.

---

## 3. Rebuild the backend (Firebase)

⚠️ The functions source is in the **barkparks** repo, not here.

1. Recreate/select Firebase project **`binditails-da2de`** (or a new project — then update
   the endpoint URLs in `index.html`).
2. Clone barkparks: `git clone https://github.com/susanbuchanan-75287/barkparks.git`
3. `cd barkparks; npm --prefix functions install`
4. Set required functions **secrets** (Firebase functions secrets), e.g. reCAPTCHA secret,
   any mail/SMS provider keys referenced in `functions/oracle.js`. Remember: values piped
   via `--data-file=-` can carry a trailing newline — the code `.trim()`s them.
5. Deploy: `firebase deploy --only functions:oracle`
6. In Firestore, create the config doc `settings/oracle` with `dailyEnabled: true` (and any
   other settings the code reads).

**Functions to expect:** `oracleSignup`, `oracleConfirm`, `oracleUnsubscribe`,
`oraclePushSubscribe`, `oraclePushUnsubscribe`, `oracleDailySend` (cron `0 6 * * *`,
America/Chicago), `oraclePurge` (cron `30 3 * * *`, America/Chicago).

---

## 4. Restore the subscriber data

The `oracle-subscribers` collection starts **empty** on a fresh project. To repopulate from
a backup snapshot, follow `DISASTER-RECOVERY.md` §4 (mint token → restore into a
**test** collection → verify field-for-field → then restore into live `oracle-subscribers`).
Never restore blindly over live data.

If no backup exists, the collection simply starts empty and grows from new signups — no
harm to the site itself.

---

## 5. Domain / DNS

1. At the registrar, point `offleashoracle.com` at GitHub Pages (A/ALIAS to GitHub Pages
   IPs, or CNAME to `susanbuchanan-75287.github.io`).
2. Keep the repo `CNAME` file = `offleashoracle.com`.
3. GitHub → Settings → Pages → add custom domain → **Enforce HTTPS**. Allow time for the
   certificate to provision.

---

## 6. Post-rebuild verification

- [ ] `curl.exe -I https://offleashoracle.com/` → `200`.
- [ ] Home page renders today's quote; Archive page loads.
- [ ] `curl.exe -sI https://offleashoracle.com/ | findstr /I "content-type"` and view-source
      confirm the CSP / referrer / nosniff meta tags are present.
- [ ] Submit a test email → confirmation email arrives → clicking it flips the Firestore
      record to `confirmed`.
- [ ] Push subscribe registers an FCM token.
- [ ] `settings/oracle.dailyEnabled = true`; `oracleDailySend` logs a successful run.
- [ ] CI `validate` job green; a `deploy-<utc>-<sha>` tag was created on the deploy.
- [ ] Run `backup-subscribers.ps1` once to confirm the backup path works end to end.

---

## 7. Reference documents

- `USER-MANUAL.md` — day-to-day operation.
- `DISASTER-RECOVERY.md` — recover an existing deployment / data.
- `CHANGE-CONTROL.md` — hosting, security log, legal register, rollback policy.
- `CHANGELOG.md` — dated change history.
- barkparks `functions/oracle.js` — authoritative backend source + schema.
