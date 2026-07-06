# CHANGELOG — The Off-Leash Oracle™

All notable changes to offleashoracle.com are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Operated by **Joy, Thee & Me LLC**.

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
