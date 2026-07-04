# CHANGE CONTROL — The Off-Leash Oracle™

> Governance record for offleashoracle.com, operated by **Joy, Thee & Me LLC**.
> Companion to `CHANGELOG.md` (what changed) and the project's Git history (immutable,
> timestamped record of every change). Governance principle: **every published document
> is versioned, dated, and reconstructable to the exact wording live on any date.**

Last updated: 2026-07-04

---

## 1. Environment & hosting

| Item | Value |
|---|---|
| Live domain | `offleashoracle.com` (see `CNAME`) |
| Repo | `susanbuchanan-75287/offleashoracle` |
| Branch | `master` |
| Hosting | GitHub Pages (static) |
| Backend | Firebase project `binditails-da2de` — Cloud Functions (`oracleSignup`, `oracleConfirm`, `oracleUnsubscribe`, `oraclePushSubscribe`, `oraclePushUnsubscribe`, `oracleDailySend`), Cloud Firestore (`oracle-subscribers`), Firebase Cloud Messaging (web push). Function source lives in the **barkparks** repo (`functions/oracle.js`). |
| Abuse controls | Google reCAPTCHA v3 (site key in `index.html`), server-side rate limiting, honeypot field |
| Personal data collected | Email address (email subscribers, double opt-in) OR FCM push token (push subscribers). No accounts. No analytics/advertising cookies. |

## 2. Change-control process

1. All changes are made on a branch and merged to `master` via commit/PR — never edited live.
2. **Legal documents** (`privacy.html`, `terms.html`) carry an on-page **Version** badge, **Effective Date**, and **Last Updated** date, plus an in-page Version History table.
3. Any change to a legal document **must**: (a) bump the version number, (b) update the Effective/Last-Updated dates, (c) add a row to the in-page Version History table, and (d) add a row to the **Legal Document Register** below in the same commit.
4. Because history is preserved in Git on GitHub, the exact text of any legal document **as it existed on any date** can be retrieved with `git log --follow -- <file>` and `git show <sha>:<file>`.

## 3. Legal Document Register

This register is the authoritative, timestamped map of legal-document versions. To reconstruct the document that was live on a given date, find the row whose effective range covers that date and check out its commit.

| Document | Version | Effective date | Superseded on | Commit (SHA) | Notes |
|---|---|---|---|---|---|
| `privacy.html` | v1.0 | 2026-07-04 | — (current) | _set on merge_ | Initial publication of Privacy Policy. |
| `terms.html` | v1.0 | 2026-07-04 | — (current) | _set on merge_ | Initial publication of Terms of Use. |

> How to fill "Commit (SHA)": after the PR merges, run `git log -1 --format=%H -- privacy.html`
> (and `terms.html`) and paste the full SHA into the matching row. When a document is
> revised, add a **new row** for the new version and set the prior row's "Superseded on"
> to the new version's effective date. Never delete rows — the register is append-only.

## 4. How to produce a legal document "as of" a specific date (for counsel / audit)

```bash
# 1. Find the commit that was live on the target date for a given file:
git log --before="2026-08-01" -1 --format="%H %ci %s" -- privacy.html

# 2. Show (or export) that exact version:
git show <sha>:privacy.html > privacy_as_of_2026-08-01.html
```

The exported file is the byte-for-byte document that was published at that time; its
Version badge and Effective Date confirm the version, and this register corroborates it.
