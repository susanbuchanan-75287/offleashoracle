# CHANGELOG — The Off-Leash Oracle™

All notable changes to offleashoracle.com are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Operated by **Joy, Thee & Me LLC**.

---

## [2026-07-13] — Anti-clickjacking frame-buster + CSP meta cleanup

### Added
- Added a tiny inline **anti-clickjacking guard** to the `<head>` of every page (4 files): a `<style id="cj-guard">body{display:none!important}</style>` hides the page by default and an inline script reveals it **only** when the page is the top-level window (`self === top`). If the page is framed by another site the content stays hidden (and cannot be clickjacked); the script also best-effort re-navigates the top window to itself. A `<noscript>` fallback re-shows the page for JS-disabled users, and the script fails **open** on error so a legit page is never blank. This hide-by-default approach is the only real client-side anti-framing option on **GitHub Pages**, which cannot send `X-Frame-Options` / CSP `frame-ancestors` HTTP headers. Verified with a Playwright test.

### Changed
- Removed the `frame-ancestors` directive from the `<meta>` CSP on all pages. Browsers ignore `frame-ancestors` delivered via `<meta>` (HTTP-header-only directive), so it only produced a console warning. All other CSP directives (`object-src 'none'`, `base-uri 'self'`, etc.) remain enforced.

---

## [2026-07-06] — v-board residual close-out (LOW #3, LOW #4)

### Documented residuals (no code change — analysis + governance only)
- **Reading-count divergence (v-board LOW #3) — self-resolved post-launch.** The v-board flagged that the generated `archive.html` reading count could diverge from the committed page. Root cause: both `index.html` (L412-417) and `scripts/build-archive.js` (L21, L29-34) use byte-identical launch-gate logic — `LAUNCH_UTC = Date.UTC(2026, 6, 1)` and `publishedCount = Math.max(1, Math.min(days, set.length))`. Pre-launch both clamp to 1, so any divergence was a pre-launch artifact only. Post-launch (current date > launch) the day-count and the committed page converge deterministically by design (intended daily-drip). Confirmed generator and homepage are in sync; no code change required.
- **`index.html` CSP `unsafe-inline` (v-board LOW #4) — host-constrained residual.** The homepage CSP `script-src` allows `'unsafe-inline'`. GitHub Pages provides no per-request nonce/hash injection mechanism, so a strict nonce-based CSP is not achievable on this host without moving off GitHub Pages. Accepted as a documented host-constrained residual; `frame-ancestors 'none'`, `object-src 'none'`, and `base-uri 'self'` remain enforced. Honest next step (if ever migrating hosts): nonce-based script-src.

### Note
- No code changed — these are analysis/governance close-outs of the two remaining LOW v-board findings. All v-board findings for offleashoracle are now resolved (fixed or documented residual).

---

## [2026-07-06] — Web push (FCM) + deploy safety net verified live (close-out)

### Verified
- **Deploy safety net — confirmed complete + live.** `.github/workflows/deploy-safety-net.yml` validates data/build on every push & PR and stamps each production deploy `deploy-<utc>-<sha>` (newest 30 kept). Green runs; rollback tags present through the latest deploy. No further work.
- **Web push (FCM) — end-to-end verified live.** All Off-Leash Oracle Cloud Functions are deployed to Firebase `binditails-da2de` (`oracleSignup`, `oracleConfirm`, `oracleUnsubscribe`, `oraclePushSubscribe`, `oraclePushUnsubscribe`, `oracleDailySend`). `index.html` push subscribe/unsubscribe UI is fully wired (FCM SDK + VAPID key + service-worker registration); `firebase-messaging-sw.js` is live (HTTP 200). Firestore `settings/oracle` flags confirmed live: `pushEnabled`, `dailyEnabled`, `emailEnabled`, `smsEnabled` all `true`; `maxDailyRecipients` 5000.

### Subscriber state (privacy-safe counts, no PII in source control)
- `oracle-subscribers`: **4 confirmed** subscribers — 3 email, 1 SMS. No test records. No push-method opt-in yet (push is available and wired; simply no subscriber has enabled it).

### Note
- No code changed in this close-out — verification only. Both offleashoracle "push" tracks (deploy safety net + FCM web push) are **CLOSED**.

---

## [2026-07-06] — Backend audit snapshot committed to repo

### Added
- **v-board MED #2 — backend source now auditable/recoverable from this repo.** The Off-Leash Oracle backend (`functions/oracle.js` + `firestore.rules`) is version-controlled in the sibling **barkparks** repo (Firebase project `binditails-da2de`) and was already documented in `DISASTER-RECOVERY.md` §3 and `REBUILD.md` §3 — but an auditor reading only *this* repo could not see or recover it. Added a clearly-labeled **read-only audit mirror** at `backend-snapshot/` so the backend code is visible and recoverable directly from the offleashoracle repo.

### Files
- `backend-snapshot/README.md` — labels the folder as a read-only mirror; canonical source = barkparks, project `binditails-da2de`; snapshot date; SHA-256 hashes; explicit "do NOT deploy from here — deploy per DISASTER-RECOVERY.md §3."
- `backend-snapshot/oracle.js` — snapshot of `barkparks/functions/oracle.js` (SHA-256 `86571069…848F`).
- `backend-snapshot/firestore.rules` — snapshot of `barkparks/firestore.rules` (SHA-256 `53DA1929…436E`).
- `backend-snapshot/functions-package.json` — snapshot of `barkparks/functions/package.json`.

### Note
- **Not a second deploy source.** The canonical deploy path remains `barkparks/functions` → `firebase deploy`. This mirror exists only for auditability + recovery and must be re-synced (with updated hashes) whenever the canonical backend changes materially.

---

## [2026-07-06] — Archive-generator security/legal regression fix

### Fixed
- **v-board HIGH #1 — daily archive rebuild silently weakened the site.** The `scripts/build-archive.js` template did not include the Phase-1 hardened `<head>` security meta (`Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `referrer`) or the `Privacy` / `Terms` footer links. The daily `daily-archive.yml` cron regenerates `archive.html` and force-pushes it to `main`, so every night it overwrote the hardened committed page with a weaker one (security headers dropped, legal links missing). Baked the exact hardened meta + `Privacy`/`Terms` footer links into the generator template so regenerated output permanently matches the enterprise baseline.

### Files
- `scripts/build-archive.js` — generator template now emits CSP/nosniff/referrer meta + Privacy/Terms footer links.
- `archive.html` — regenerated from the fixed template (verified: meta present, `/privacy.html` + `/terms.html` links present).

---

## [2026-07-06] — Operational docs + subscriber backup/restore

### Added
- **`USER-MANUAL.md`** — plain-language owner/visitor guide: what the site is, how the daily quote + subscribe/push flow works, routine owner tasks, note that the backend lives in the barkparks repo, and a troubleshooting table.
- **`DISASTER-RECOVERY.md`** — full recovery runbook: site recovery, rollback via `deploy-<utc>-<sha>` tags, backend redeploy from barkparks `functions/oracle.js`, DNS, credentials, and **§4 Firestore subscriber backup/restore** (mint token → back up `oracle-subscribers` → restore into a test collection → verify → cleanup). Documents the passed restore drill (4 docs restored, verified field-for-field, cleaned up; live collection untouched).
- **`REBUILD.md`** — clean-room from-scratch rebuild guide (site → backend → data → domain → verify) for total-loss scenarios.
- **Subscriber backup tooling** (in the **barkparks** repo): `scripts/backup-subscribers.ps1` writes versioned raw JSON snapshots of `oracle-subscribers`; snapshot output path added to barkparks `.gitignore` (snapshots contain PII and are never committed).

### Notes
- Closes the readiness-audit gaps: subscriber data now has a **backup** and a **tested restore**, and offleashoracle now has user-manual / DR / rebuild documentation on par with barkparks and binditails.

---

## [2026-07-06] — Accessibility: main landmark

### Changed
- **`index.html`** — wrapped the primary page content (hero + subscribe/oracle sections, between `</header>` and `<footer>`) in a `<main>` element. Resolves the Lighthouse accessibility audit `landmark-one-main` failure ("Document does not have a main landmark"), which lets assistive-technology users jump straight to the primary content. Accessibility score was **98/100** prior to this change; other categories unaffected.

---

## [2026-07-05] — Performance: preconnect to Firebase CDN

### Changed
- **`index.html`** — added `<link rel="preconnect" href="https://www.gstatic.com" crossorigin>` so the browser opens the TLS connection to the Firebase SDK CDN (`www.gstatic.com`, source of `firebase-app-compat.js` / `firebase-messaging-compat.js`) earlier in the critical path. Complements the existing Google Fonts preconnects. Lighthouse performance already measured **99/100** (LCP 0.8s, TBT 0ms, CLS 0.009) prior to this change; this is a marginal connection-warm-up refinement, verified non-regressive.

---

## [2026-07-04] — Deploy safety net (CI)

### Added
- **`.github/workflows/deploy-safety-net.yml`** — wraps the GitHub Pages auto-deploy with (1) a `validate` gate that parses every `data/*.json` file and smoke-tests `node scripts/build-archive.js` on every push and PR to `main`, and (2) a `tag_release` job that stamps each production deploy with an immutable rollback tag `deploy-<utc>-<sha>` (newest 30 kept). Mirrors the deploy-guardrails pattern already used on barkparks, binditails, and myhoadues.
- **Branch protection on `main`** — repository ruleset requiring a pull request and a passing `validate` check before merge (repo admin bypasses), keeping the auto-published branch reviewable. Because the built-in `GITHUB_TOKEN` cannot bypass the ruleset, `daily-archive.yml` now pushes with a repo-admin PAT stored as secret `ARCHIVE_PUSH_TOKEN`.

### Changed
- **`CHANGE-CONTROL.md`** — corrected branch from `master` to the actual default `main`; documented hosting as GitHub Pages legacy build; added §5 "Deploy safety net & rollback" with rollback steps.

---

## [2026-07-04] — Legal & compliance foundation

### Added
- **`privacy.html`** (Privacy Policy **v1.0**, effective 2026-07-04) — first published privacy policy. Covers email + web-push subscription data, double opt-in, Firebase/Google and reCAPTCHA processors, GDPR legal bases, CCPA/CPRA "no sale/share" statement, retention, data-subject rights, international transfers, children, and security.
- **`terms.html`** (Terms of Use **v1.0**, effective 2026-07-04) — first published terms. Establishes the entertainment-only / not-advice framing (not veterinary, medical, behavioral, legal, or financial advice; not a prediction), subscription & acceptable-use terms, IP/trademark, disclaimers, limitation of liability, indemnification, force majeure, individual-basis arbitration with class-action waiver, and Texas governing law.
- **`CHANGE-CONTROL.md`** — change-control process + **Legal Document Register** mapping each legal document version → effective date → commit for point-in-time defensibility.
- **Footer legal links** — Privacy + Terms links added to `index.html` and `archive.html`.
- **Consent microcopy** at the subscribe form: "For entertainment only… By subscribing you agree to our Terms and Privacy Policy."

### Notes
- The site collects an email address (email subscribers) or an FCM push token (push subscribers); no accounts, no analytics/advertising cookies. Backend: Firebase project `binditails-da2de` (Cloud Functions `oracle*`, Firestore `oracle-subscribers`, Cloud Messaging).
