# CHANGELOG — The Off-Leash Oracle™

All notable changes to offleashoracle.com are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Operated by **Joy, Thee & Me LLC**.

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
