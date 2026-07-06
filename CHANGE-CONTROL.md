# CHANGE CONTROL — The Off-Leash Oracle™

> Governance record for offleashoracle.com, operated by **Joy, Thee & Me LLC**.
> Companion to `CHANGELOG.md` (what changed) and the project's Git history (immutable,
> timestamped record of every change). Governance principle: **every published document
> is versioned, dated, and reconstructable to the exact wording live on any date.**

Last updated: 2026-07-06 (push + safety-net close-out, §8)

---

## 1. Environment & hosting

| Item | Value |
|---|---|
| Live domain | `offleashoracle.com` (see `CNAME`) |
| Repo | `susanbuchanan-75287/offleashoracle` |
| Branch | `main` |
| Hosting | GitHub Pages (legacy build, source `main` / path `/`) — auto-deploys on every push to `main` |
| Deploy safety net | `.github/workflows/deploy-safety-net.yml` — validates data/build on every push & PR, then tags each production deploy `deploy-<utc>-<sha>` (newest 30 kept) as immutable rollback points |
| Backend | Firebase project `binditails-da2de` — Cloud Functions (`oracleSignup`, `oracleConfirm`, `oracleUnsubscribe`, `oraclePushSubscribe`, `oraclePushUnsubscribe`, `oracleDailySend`), Cloud Firestore (`oracle-subscribers`), Firebase Cloud Messaging (web push). Function source lives in the **barkparks** repo (`functions/oracle.js`). |
| Abuse controls | Google reCAPTCHA v3 (site key in `index.html`), server-side rate limiting, honeypot field |
| Personal data collected | Email address (email subscribers, double opt-in) OR FCM push token (push subscribers). No accounts. No analytics/advertising cookies. |

## 2. Change-control process

1. All changes are made on a branch and merged to `main` via commit/PR — never edited live.
2. **Legal documents** (`privacy.html`, `terms.html`) carry an on-page **Version** badge, **Effective Date**, and **Last Updated** date, plus an in-page Version History table.
3. Any change to a legal document **must**: (a) bump the version number, (b) update the Effective/Last-Updated dates, (c) add a row to the in-page Version History table, and (d) add a row to the **Legal Document Register** below in the same commit.
4. Because history is preserved in Git on GitHub, the exact text of any legal document **as it existed on any date** can be retrieved with `git log --follow -- <file>` and `git show <sha>:<file>`.

## 3. Legal Document Register

This register is the authoritative, timestamped map of legal-document versions. To reconstruct the document that was live on a given date, find the row whose effective range covers that date and check out its commit.

| Document | Version | Effective date | Superseded on | Commit (SHA) | Notes |
|---|---|---|---|---|---|
| `privacy.html` | v1.0 | 2026-07-04 | — (current) | `a4ede92c50e2e392bd24b06325703c1cdaa8a8fa` | Initial publication of Privacy Policy (PR #1). |
| `terms.html` | v1.0 | 2026-07-04 | — (current) | `a4ede92c50e2e392bd24b06325703c1cdaa8a8fa` | Initial publication of Terms of Use (PR #1). |

> How to fill "Commit (SHA)": after the PR merges, run `git log -1 --format=%H -- privacy.html`
> (and `terms.html`) and paste the full SHA into the matching row. When a document is
> revised, add a **new row** for the new version and set the prior row's "Superseded on"
> to the new version's effective date. Never delete rows — the register is append-only.

## 4. Security hardening log

GitHub Pages cannot set custom HTTP response headers, so all client-side security controls
are delivered via `<meta http-equiv>` / `<meta name>` tags in each page's `<head>`. HTTPS and
HSTS are provided automatically by the GitHub Pages edge.

| Date | Change | Files |
|---|---|---|
| 2026-07-05 | **Enterprise CSP + header hardening.** Tightened Content-Security-Policy to add `frame-ancestors 'none'` and `object-src 'none'` (clickjacking + plugin/embed lockdown); added `<meta name="referrer" content="strict-origin-when-cross-origin">` and `<meta http-equiv="X-Content-Type-Options" content="nosniff">` to every page. `index.html` CSP scopes script/style/font/connect to the exact Firebase, reCAPTCHA (google.com), Google Fonts, and Cloud Functions / *.googleapis / fcmregistrations / firebaseinstallations origins actually used. | `index.html`, `archive.html`, `privacy.html`, `terms.html` |
| 2026-07-06 | **Archive-generator regression fix (v-board HIGH #1).** The daily-archive generator template omitted the Phase-1 security meta (CSP / `nosniff` / referrer) and the Privacy/Terms footer links, so each daily rebuild silently overwrote the hardened committed `archive.html` with a weaker page — reintroducing the security + legal-linkage regression once per day. Baked the exact Phase-1 hardened `<head>` meta and the `Privacy` + `Terms` footer links into the generator template so regenerated output matches the hardened baseline permanently. | `scripts/build-archive.js`, `archive.html` |
| 2026-07-06 | **Backend audit snapshot (v-board MED #2).** The backend (`functions/oracle.js` + `firestore.rules`, Firebase project `binditails-da2de`) is version-controlled in the sibling **barkparks** repo and documented in `DISASTER-RECOVERY.md` §3 / `REBUILD.md` §3, but was not visible from this repo — an auditor reading only offleashoracle could not see or recover it. Added a labeled **read-only audit mirror** at `backend-snapshot/` (README with canonical source, snapshot date, SHA-256 hashes, and an explicit "do NOT deploy from here"). Canonical deploy path is unchanged (`barkparks/functions` → `firebase deploy`); mirror must be re-synced with updated hashes on material backend change. | `backend-snapshot/README.md`, `backend-snapshot/oracle.js`, `backend-snapshot/firestore.rules`, `backend-snapshot/functions-package.json` |

## 5. Deploy safety net & rollback

offleashoracle.com is served by **GitHub Pages (legacy build)** from `main`, so every
push to `main` publishes production automatically. `.github/workflows/deploy-safety-net.yml`
wraps that auto-deploy with two safeguards:

1. **`validate` job** (every push to `main` and every PR into `main`) — parses every
   `data/*.json` file and smoke-tests `node scripts/build-archive.js`. A red check means
   the site data or archive build is broken; on a PR this blocks the merge.
2. **`tag_release` job** (pushes to `main` only) — after validation passes, stamps the
   deployed commit with an immutable tag `deploy-<utc>-<sha>`. The newest **30** tags are
   kept and older ones pruned (local + origin).

**To roll back a bad deploy:**
```bash
git fetch --tags
git tag -l 'deploy-*' | sort -r | head        # find a known-good tag
git checkout <deploy-tag> -- .                 # restore files, or:
git reset --hard <deploy-tag> && git push --force-with-lease origin main
```
Because Pages redeploys on push, restoring `main` to a known-good tag re-publishes it.

`main` is protected by a repository ruleset (PR required before merge + required
`validate` check; repo admin bypasses). The built-in `GITHUB_TOKEN` **cannot** bypass
this ruleset, so the daily archive job (`daily-archive.yml`) — the one allowed automated
committer to `main` — authenticates its push with a repository secret **`ARCHIVE_PUSH_TOKEN`**,
a fine-grained PAT of the repo admin (`susanbuchanan-75287`, `contents: read/write` on this
repo only). Rotate the PAT before it expires or the daily drip will stop publishing.

## 6. How to produce a legal document "as of" a specific date (for counsel / audit)

```bash
# 1. Find the commit that was live on the target date for a given file:
git log --before="2026-08-01" -1 --format="%H %ci %s" -- privacy.html

# 2. Show (or export) that exact version:
git show <sha>:privacy.html > privacy_as_of_2026-08-01.html
```

The exported file is the byte-for-byte document that was published at that time; its
Version badge and Effective Date confirm the version, and this register corroborates it.

## 7. Data protection & subscriber backup

Subscriber data (`oracle-subscribers` in Firestore, project `binditails-da2de`) is the only
personal data the service stores. It is protected by backup + tested restore:

| Date | Change | Artifact |
|---|---|---|
| 2026-07-06 | **Subscriber backup tooling + passed restore drill.** Added `scripts/backup-subscribers.ps1` (in the **barkparks** repo, which owns the Firebase functions) to export versioned raw JSON snapshots of `oracle-subscribers`. Ran a sandboxed restore drill: 4 confirmed docs restored into a throwaway `oracle-subscribers-restore-test` collection, verified field-for-field, then cleaned up — the live collection was never touched. Full runbook in `DISASTER-RECOVERY.md` §4. | `DISASTER-RECOVERY.md` §4; `barkparks/scripts/backup-subscribers.ps1` |

- **PII handling:** snapshots contain email addresses / phone numbers and are **never committed**
  to any public repo. The backup script writes to a `.gitignore`d path; working copies live only
  in private/local storage.
- **Recovery:** to rebuild subscriber data after loss, follow `DISASTER-RECOVERY.md` §4 (mint a
  GCP token → restore snapshot docs via the Firestore REST `createDocument` API).

---

## 8. Web push (FCM) + deploy safety net — verification close-out

Governance record for the offleashoracle "push" workstream, closed out 2026-07-06. Both
tracks are **CLOSED**; this section is a verification record (no code changed at close-out).

| Date | Item | Status | Evidence |
|---|---|---|---|
| 2026-07-06 | **Track 1 — deploy safety net** | ✅ complete + live | `.github/workflows/deploy-safety-net.yml` validates data/build on every push & PR and stamps each production deploy `deploy-<utc>-<sha>` (newest 30 retained). Green runs; rollback tags present through the latest deploy. See §5. |
| 2026-07-06 | **Track 2 — web push (FCM)** | ✅ verified live end-to-end | All Oracle Cloud Functions deployed to Firebase `binditails-da2de` (`oracleSignup`/`oracleConfirm`/`oracleUnsubscribe`/`oraclePushSubscribe`/`oraclePushUnsubscribe`/`oracleDailySend`). `index.html` push subscribe/unsubscribe UI fully wired (FCM SDK + VAPID key + service-worker registration). `firebase-messaging-sw.js` live (HTTP 200). |
| 2026-07-06 | **Live `settings/oracle` flags** | ✅ confirmed | `pushEnabled`, `dailyEnabled`, `emailEnabled`, `smsEnabled` all `true`; `maxDailyRecipients` 5000. |

- **Subscriber state (privacy-safe counts only):** `oracle-subscribers` holds **4 confirmed**
  subscribers — 3 email, 1 SMS. No test records. **No push-method opt-in yet** (push is
  available and wired; no subscriber has enabled it). Consistent with §7 PII handling — raw
  addresses/numbers are never committed here.

