# USER MANUAL — The Off-Leash Oracle™

> A plain-language guide to what offleashoracle.com is, how visitors use it, and how the
> owner operates it day to day. Operated by **Joy, Thee & Me LLC** (owner: Susan Buchanan).

---

## 1. What the site is

The Off-Leash Oracle™ is a small, static, entertainment-only site that publishes **one dog
"oracle" quote per day**. Visitors can:

- Read today's quote on the home page (`index.html`).
- Browse past quotes in the **Archive** (`archive.html`).
- **Subscribe** to receive the daily quote by **email** or **web push notification**.

There are **no user accounts, no logins, no analytics or advertising cookies**. The only
personal data collected is a subscriber's **email address** (email subscribers) or an
**FCM push token** (push subscribers).

Legal framing lives in `privacy.html` (Privacy Policy) and `terms.html` (Terms of Use):
the content is **for entertainment only** — not veterinary, medical, behavioral, legal, or
financial advice, and not a prediction.

---

## 2. How the pieces fit together

| Piece | Where it lives | What it does |
|---|---|---|
| Website (static) | `susanbuchanan-75287/offleashoracle` → **GitHub Pages** | Serves the pages at `offleashoracle.com`. Auto-publishes on every push to `main`. |
| Daily quote data | `data/*.json` in this repo | The quote content the site + daily send read from. |
| Archive builder | `scripts/build-archive.js` | Regenerates `archive.html` from the data. |
| Backend | Firebase project **`binditails-da2de`** | Handles subscribe / confirm / unsubscribe and the daily send. |
| Backend source code | **barkparks** repo → `functions/oracle.js` | ⚠️ The Cloud Functions source lives in the **barkparks** repo, not here. |
| Subscriber list | Firestore collection **`oracle-subscribers`** | The email/push subscriber records. |

> **Important:** offleashoracle (this repo) is **only the static website**. The signup
> backend and the subscriber database live in Firebase and the barkparks repo. See
> `DISASTER-RECOVERY.md` §"Backend" for the full map.

---

## 3. What happens when someone subscribes

1. Visitor enters an email (or clicks **Enable notifications** for push) on `index.html`.
2. Google **reCAPTCHA v3** + a honeypot field + server rate-limiting screen out bots.
3. **Email subscribers get a double opt-in:** the `oracleSignup` function creates a
   `status: "pending"` record and emails a confirmation link. Clicking it calls
   `oracleConfirm`, which flips the record to `status: "confirmed"`.
4. **Push subscribers** register via `oraclePushSubscribe` (their device FCM token is stored).
5. Every subscriber record includes an **unsubscribe token**; `oracleUnsubscribe`
   (email) / `oraclePushUnsubscribe` (push) honor opt-outs. A scheduled `oraclePurge`
   job auto-cleans stale/unsubscribed data (03:30 America/Chicago daily).

## 4. The daily quote drip

- The `oracleDailySend` Cloud Function runs on a schedule: **06:00 America/Chicago, daily**
  (cron `0 6 * * *`).
- It only runs if the `settings/oracle` document has `dailyEnabled: true`.
- It sends the current quote to every **confirmed** subscriber over the right channel
  (email, SMS where present, and web push), then logs how many were sent/failed.
- The same daily site update is **mirrored to barkparks.dog** (see the barkparks change log)
  so both sites refresh together.

---

## 5. Owner tasks (day to day)

### Change or add a daily quote
1. Edit the appropriate file under `data/` on a branch.
2. Open a PR into `main`. The **`validate`** check parses the JSON and smoke-tests the
   archive build; a green check means it's safe.
3. Merge → GitHub Pages republishes automatically within a minute or two.

### Turn the daily send on/off
- In the Firebase console, open Firestore → `settings/oracle` → set `dailyEnabled` to
  `true` or `false`. No deploy needed.

### See who's subscribed / back up the list
- The subscriber list is Firestore collection **`oracle-subscribers`** (in project
  `binditails-da2de`).
- To make a **privacy-safe backup**, run the barkparks backup script:
  `barkparks\scripts\backup-subscribers.ps1`. It writes a timestamped JSON snapshot to a
  **gitignored** folder (never committed — the file contains emails/phone numbers).
- Full backup + tested-restore procedure: barkparks `DISASTER-RECOVERY.md`
  → "Firestore subscriber data — backup & restore".

### Deploy the backend (rare)
- The functions live in the **barkparks** repo. To redeploy one:
  `firebase deploy --only functions:oracleDailySend` (swap the function name as needed).
  `FIREBASE_TOKEN` must be set in the environment.

---

## 6. Something's wrong — quick checks

| Symptom | Look here |
|---|---|
| Site won't update after a push | GitHub → Actions → the Pages build + `deploy-safety-net` `validate` job. A red `validate` = bad `data/*.json` or archive build. |
| Signup form errors | Firebase console → Functions logs (`oracleSignup`); check reCAPTCHA site key in `index.html`. |
| No daily email went out | Firestore `settings/oracle.dailyEnabled` must be `true`; check `oracleDailySend` logs. |
| Need to roll back a bad deploy | `CHANGE-CONTROL.md` §5 — restore `main` to a `deploy-<utc>-<sha>` tag. |
| Lost the subscriber list | `DISASTER-RECOVERY.md` — restore from the latest backup snapshot. |

---

## 7. Related documents

- `CHANGELOG.md` — what changed, dated.
- `CHANGE-CONTROL.md` — governance, hosting, security log, legal register, rollback.
- `DISASTER-RECOVERY.md` — how to recover the site and the subscriber data.
- `REBUILD.md` — how to rebuild the whole thing from scratch.
- `privacy.html` / `terms.html` — published legal documents (versioned).
