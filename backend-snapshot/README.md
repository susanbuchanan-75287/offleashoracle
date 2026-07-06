# Backend snapshot (read-only mirror)

> **Do NOT deploy from this folder.** This is an **audit + recovery snapshot** of the
> Off-Leash Oracle backend, whose **canonical, version-controlled source lives in the
> [`barkparks`](https://github.com/susanbuchanan-75287/barkparks) repo** and deploys to
> Firebase project **`binditails-da2de`**.

## Why this exists

v-board finding **MED #2**: the Off-Leash Oracle subscribe/daily-send backend
(`functions/oracle.js` + `firestore.rules`) was not present in *this* repo, so an auditor
reading only the offleashoracle repo could not see or recover the backend code without
knowing to look in the sibling `barkparks` repo. This snapshot closes that auditability
and recoverability gap **without creating a second deploy source** (which would risk drift).

## Contents

| File | Canonical source (barkparks repo) |
|------|-----------------------------------|
| `oracle.js` | `functions/oracle.js` |
| `firestore.rules` | `firestore.rules` |
| `functions-package.json` | `functions/package.json` |

Functions in `oracle.js`: `oracleSignup`, `oracleConfirm`, `oracleUnsubscribe`,
`oraclePushSubscribe`, `oracleSmsInbound`, `oracleDailySend`.
Subscribers are stored in Firestore collection `oracle-subscribers` (server-side, Admin SDK —
no client Firestore rules govern it).

## Snapshot metadata

- **Captured:** 2026-07-06 (UTC)
- **oracle.js SHA-256:** `86571069364E56E9BC607E9B3D409EE7F298B77B609052FD7AAFF0A738B0848F`
- **firestore.rules SHA-256:** `53DA19292B812E0C342B2E7C0F8D15C5823092A919BC9ED2D112C033068D436E`

## How to deploy (canonical path — NOT from here)

```bash
git clone https://github.com/susanbuchanan-75287/barkparks.git
cd barkparks
npm --prefix functions install
firebase deploy --only functions:oracle   # project binditails-da2de
```

See `../DISASTER-RECOVERY.md` §3 and `../REBUILD.md` §3 for full recovery steps.

## Refresh policy

Re-copy from barkparks and update the SHA-256 hashes + captured date above whenever the
canonical backend changes materially. This snapshot is a mirror of record, not the truth.
