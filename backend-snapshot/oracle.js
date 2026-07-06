/**
 * Off-Leash Oracle — subscription pipeline
 * ========================================
 * Full implementation of the daily "dogism" subscription (email + SMS) that
 * replaces the old localStorage-only stub in oracle.html.
 *
 * Functions exported:
 *   - oracleSignup        (HTTPS)      Public form endpoint. Stores subscriber + sends double opt-in welcome.
 *   - oracleConfirm       (HTTPS)      Email confirm link -> marks subscriber confirmed.
 *   - oracleUnsubscribe   (HTTPS)      Email unsubscribe link -> marks subscriber unsubscribed.
 *   - oracleSmsInbound    (HTTPS)      Twilio inbound webhook (YES = confirm, STOP = unsubscribe, HELP = info).
 *   - oracleDailySend     (Scheduled)  06:00 America/Chicago daily send to confirmed subscribers.
 *
 * Compliance:
 *   - Double opt-in (email link / SMS "YES") before any marketing is sent.
 *   - SMS: STOP/HELP handled; requires A2P 10DLC registration on the Twilio number before go-live.
 *   - Email: every message carries an unsubscribe link + the business postal address (CAN-SPAM).
 *
 * Secrets (set via `firebase functions:secrets:set <NAME>`):
 *   SENDGRID_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 *
 * Cost / safety controls (Firestore doc `settings/oracle`, all default-safe):
 *   { emailEnabled: true, smsEnabled: false, dailyEnabled: false, maxDailyRecipients: 5000 }
 *   SMS and the daily blast stay OFF until you explicitly enable them (e.g. after 10DLC clears).
 */

const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const crypto = require('crypto');

// ─── Secrets ──────────────────────────────────────────────────────────────────
const SENDGRID_API_KEY = defineSecret('SENDGRID_API_KEY');
const TWILIO_ACCOUNT_SID = defineSecret('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = defineSecret('TWILIO_AUTH_TOKEN');
const TWILIO_FROM_NUMBER = defineSecret('TWILIO_FROM_NUMBER');
// Optional bot-protection: set with `firebase functions:secrets:set RECAPTCHA_SECRET`.
// When unset, reCAPTCHA verification is skipped (graceful) so signups keep working.
const RECAPTCHA_SECRET = defineSecret('RECAPTCHA_SECRET');

// ─── Static config ──────────────────────────────────────────────────────────
const REGION = 'us-central1';
const COLLECTION = 'oracle-subscribers';
const FROM_EMAIL = 'oracle@barkparks.dog';
const FROM_NAME = 'The Off-Leash Oracle';
const SITE_BASE = 'https://barkparks.dog';
// CAN-SPAM requires a valid physical postal address in every commercial email.
const POSTAL_ADDRESS = 'Joy, Thee & Me LLC · PO Box 700124 · Dallas, TX 75370';
const FUNCTIONS_BASE = `https://${REGION}-binditails-da2de.cloudfunctions.net`;
const QUOTES = require('./data/oracle-quotes.json');

// ─── Abuse-protection config ────────────────────────────────────────────────
const RATELIMIT_COLLECTION = 'oracle-ratelimit';
const IP_MAX_PER_HOUR = 8;                 // signups allowed per IP per rolling hour
const IP_WINDOW_MS = 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;      // don't re-message the same address within 60s
const HONEYPOT_FIELD = 'company';          // hidden form field; only bots fill it
const RECAPTCHA_MIN_SCORE = 0.5;           // reCAPTCHA v3 human-likelihood threshold
// Data retention (auto-purge): keep suppression list a year, drop stale unconfirmed signups.
const PURGE_UNSUBSCRIBED_MS = 365 * 24 * 60 * 60 * 1000;
const PURGE_PENDING_MS = 30 * 24 * 60 * 60 * 1000;

const ALLOWED_ORIGINS = [
  'https://barkparks.dog',
  'https://www.barkparks.dog',
  'https://binditails.com',
  'https://www.binditails.com',
  'https://offleashoracle.com',
  'https://www.offleashoracle.com',
  'https://offleashoracle.dog',
  'https://www.offleashoracle.dog',
  'https://susanbuchanan-75287.github.io'
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function db() { return getFirestore(); }
function token() { return crypto.randomBytes(24).toString('hex'); }

function normalizeEmail(v) {
  const e = String(v || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

// Best-effort E.164 normalization for US numbers (subscription form is US-only for now).
function normalizePhone(v) {
  const digits = String(v || '').replace(/[^\d]/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  if (String(v || '').trim().startsWith('+') && digits.length >= 11) return '+' + digits;
  return null;
}

async function getSettings() {
  const defaults = { emailEnabled: true, smsEnabled: false, pushEnabled: true, dailyEnabled: false, maxDailyRecipients: 5000 };
  try {
    const snap = await db().collection('settings').doc('oracle').get();
    return snap.exists ? { ...defaults, ...snap.data() } : defaults;
  } catch (e) {
    logger.warn('[oracle] settings read failed, using defaults', e.message);
    return defaults;
  }
}

function quoteForToday(date = new Date()) {
  // Deterministic per calendar day so everyone gets the same dogism that morning.
  // Day 1 = LAUNCH. Keep in sync with offleashoracle index.html + scripts/build-archive.js.
  const start = Date.UTC(2026, 6, 1); // 2026-07-01
  const dayIndex = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 86400000);
  return QUOTES[((dayIndex % QUOTES.length) + QUOTES.length) % QUOTES.length];
}

// ─── Email (SendGrid) ─────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html, text }) {
  const sgMail = require('@sendgrid/mail');
  sgMail.setApiKey(SENDGRID_API_KEY.value());
  await sgMail.send({
    to,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    subject,
    text,
    html,
    trackingSettings: { clickTracking: { enable: false } }
  });
}

function emailFrame(bodyHtml, unsubUrl, eraseUrl) {
  const eraseLink = eraseUrl ? ` &nbsp;·&nbsp; <a href="${eraseUrl}" style="color:#888;">Delete my data</a>` : '';
  return `<div style="font-family:Nunito,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0F1C2E;">
    <h1 style="font-family:'Fredoka One',Arial,sans-serif;color:#2d6a4f;">🔮 The Off-Leash Oracle</h1>
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
    <p style="font-size:12px;color:#888;line-height:1.5;">
      You're receiving this because you subscribed at barkparks.dog.<br>
      ${POSTAL_ADDRESS}<br>
      <a href="${unsubUrl}" style="color:#888;">Unsubscribe</a>${eraseLink}
    </p>
  </div>`;
}

// ─── SMS (Twilio) ─────────────────────────────────────────────────────────────
function twilioReady() {
  const sid = TWILIO_ACCOUNT_SID.value();
  const authToken = TWILIO_AUTH_TOKEN.value();
  const from = TWILIO_FROM_NUMBER.value();
  // A valid Twilio Account SID always starts with "AC". Guarding on the format
  // means a placeholder/misconfigured secret is treated as "not ready" (graceful
  // waitlist) instead of crashing the Twilio SDK with "accountSid must start with AC".
  return !!(sid && /^AC[0-9a-fA-F]{32}$/.test(sid) && authToken && from);
}
async function sendSms(to, body) {
  const twilio = require('twilio');
  const client = twilio(TWILIO_ACCOUNT_SID.value(), TWILIO_AUTH_TOKEN.value());
  await client.messages.create({ to, from: TWILIO_FROM_NUMBER.value(), body });
}

function corsHeaders(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) res.set('Access-Control-Allow-Origin', origin);
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
}

// ─── Abuse-protection helpers ───────────────────────────────────────────────
function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.ip || '';
}
function ipDocId(ip) {
  return (ip.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 200)) || 'unknown';
}

// Per-IP rolling-window rate limit backed by Firestore. Fails OPEN (allows) on
// any error so a transient glitch never blocks a legitimate signup.
async function underRateLimit(ip) {
  if (!ip) return true;
  const ref = db().collection(RATELIMIT_COLLECTION).doc(ipDocId(ip));
  const now = Date.now();
  try {
    return await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      let count = 0, windowStart = now;
      if (snap.exists) {
        const d = snap.data();
        if (now - (d.windowStart || 0) < IP_WINDOW_MS) { count = d.count || 0; windowStart = d.windowStart; }
      }
      if (count >= IP_MAX_PER_HOUR) return false;
      tx.set(ref, { count: count + 1, windowStart, updatedAt: FieldValue.serverTimestamp() });
      return true;
    });
  } catch (e) {
    logger.warn('[oracle] rate-limit check failed, allowing', e.message);
    return true;
  }
}

// reCAPTCHA v3 verification. Only ENFORCED when RECAPTCHA_SECRET is configured;
// otherwise returns true so the site keeps working until keys are added. Fails
// open on network errors (never blocks real users because Google is slow).
async function verifyRecaptcha(tokenStr, ip) {
  let secret = '';
  try { secret = (RECAPTCHA_SECRET.value() || '').trim(); } catch (e) { secret = ''; }
  // 'unset' is the placeholder we seed the secret with so the function can deploy
  // before a real reCAPTCHA key exists. Treat it (and empty) as "not configured".
  if (!secret || secret === 'unset') return true;
  if (!tokenStr) return false;
  try {
    const params = new URLSearchParams({ secret, response: String(tokenStr) });
    if (ip) params.set('remoteip', ip);
    const r = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
    const data = await r.json();
    return !!data.success && (typeof data.score !== 'number' || data.score >= RECAPTCHA_MIN_SCORE);
  } catch (e) {
    logger.warn('[oracle] reCAPTCHA verify error, allowing', e.message);
    return true;
  }
}

// ─── 1. Signup endpoint ─────────────────────────────────────────────────────
exports.oracleSignup = onRequest(
  { region: REGION, cors: ALLOWED_ORIGINS, invoker: 'public', secrets: [SENDGRID_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, RECAPTCHA_SECRET] },
  async (req, res) => {
    corsHeaders(req, res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }

    try {
      const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      const method = body.method === 'sms' ? 'sms' : 'email';
      const ip = clientIp(req);

      // Honeypot: a hidden field only bots fill. Pretend success and do nothing,
      // so the bot can't tell it was rejected.
      if (body[HONEYPOT_FIELD]) { res.status(200).json({ ok: true, status: 'pending' }); return; }

      const settings = await getSettings();

      let value, key;
      if (method === 'email') {
        value = normalizeEmail(body.value);
        if (!value) { res.status(400).json({ error: 'invalid_email' }); return; }
        key = 'email:' + value;
      } else {
        value = normalizePhone(body.value);
        if (!value) { res.status(400).json({ error: 'invalid_phone' }); return; }
        key = 'sms:' + value;
      }

      // Bot score (reCAPTCHA v3) — only enforced once a secret key is configured.
      if (!(await verifyRecaptcha(body.token, ip))) { res.status(400).json({ error: 'captcha' }); return; }
      // Per-IP rate limit.
      if (!(await underRateLimit(ip))) { res.status(429).json({ error: 'rate_limited' }); return; }

      // Whether we can actually deliver a confirmation text right now. If SMS is
      // switched off or Twilio isn't fully configured, we still capture the number
      // as a pending waitlist entry (so we have the database of signups) but never
      // crash — the subscriber just gets a "we'll text you when texts go live" note.
      const smsLive = method === 'sms' && settings.smsEnabled && twilioReady();

      const ref = db().collection(COLLECTION).doc(key);
      const existing = await ref.get();
      const existingData = existing.exists ? existing.data() : null;
      if (existingData && existingData.status === 'confirmed') {
        res.status(200).json({ ok: true, status: 'already_confirmed' });
        return;
      }

      const now = Date.now();
      // Resend throttle: if we already messaged this address seconds ago, don't spam it.
      const recentlyNotified = !!(existingData && existingData.lastNotifyAt && (now - existingData.lastNotifyAt) < RESEND_COOLDOWN_MS);

      // Reuse existing tokens so repeat signups keep the same confirm/unsubscribe links.
      const confirmToken = (existingData && existingData.confirmToken) || token();
      const unsubToken = (existingData && existingData.unsubToken) || token();
      const docData = {
        method,
        value,
        status: 'pending',
        confirmToken,
        unsubToken,
        consentText: 'Subscribed to The Off-Leash Oracle daily message at barkparks.dog',
        source: body.source || 'oracle.html',
        confirmedAt: null,
        unsubscribedAt: null
      };
      if (!existing.exists) docData.createdAt = FieldValue.serverTimestamp();
      await ref.set(docData, { merge: true });

      if (recentlyNotified) {
        res.status(200).json({ ok: true, status: 'pending', smsSent: method === 'sms' ? false : undefined });
        return;
      }

      if (method === 'email') {
        const confirmUrl = `${FUNCTIONS_BASE}/oracleConfirm?token=${confirmToken}`;
        const unsubUrl = `${FUNCTIONS_BASE}/oracleUnsubscribe?token=${unsubToken}`;
        const eraseUrl = `${FUNCTIONS_BASE}/oracleErase?token=${unsubToken}`;
        await sendEmail({
          to: value,
          subject: 'Confirm your daily dog wisdom 🐾',
          text: `Welcome to The Off-Leash Oracle! Confirm your subscription: ${confirmUrl}\n\nUnsubscribe: ${unsubUrl}\nDelete my data: ${eraseUrl}\n${POSTAL_ADDRESS}`,
          html: emailFrame(
            `<p>Welcome, fellow trail walker. One tap and a fresh dogism lands in your inbox every morning at 6 AM.</p>
             <p style="text-align:center;margin:28px 0;">
               <a href="${confirmUrl}" style="background:#2d6a4f;color:#fff;padding:14px 32px;border-radius:30px;text-decoration:none;font-weight:700;">Confirm my subscription</a>
             </p>
             <p style="color:#5A5A5A;">If you didn't request this, just ignore this email and you'll hear nothing more.</p>`,
            unsubUrl,
            eraseUrl
          )
        });
        await ref.update({ lastNotifyAt: now });
      } else if (smsLive) {
        // Never let a Twilio delivery hiccup 500 the signup — the number is already
        // saved above, so we just log and fall back to the graceful waitlist response.
        try {
          await sendSms(value, `The Off-Leash Oracle 🔮 Reply YES to confirm your daily 6 AM dog wisdom. Approx 1 msg/day. Msg&data rates may apply. Reply STOP to cancel, HELP for help.`);
        } catch (smsErr) {
          logger.warn('[oracleSignup] SMS send failed, kept as pending', smsErr.message);
          res.status(200).json({ ok: true, status: 'pending', smsSent: false });
          return;
        }
        await ref.update({ lastNotifyAt: now });
        res.status(200).json({ ok: true, status: 'pending', smsSent: true });
        return;
      } else if (method === 'sms') {
        // SMS not live yet: number is captured as a waitlist entry.
        res.status(200).json({ ok: true, status: 'pending', smsSent: false });
        return;
      }

      res.status(200).json({ ok: true, status: 'pending' });
    } catch (err) {
      logger.error('[oracleSignup] error', err);
      res.status(500).json({ error: 'server' });
    }
  }
);

// ─── 2. Email confirm ─────────────────────────────────────────────────────────
exports.oracleConfirm = onRequest({ region: REGION, invoker: 'public', secrets: [SENDGRID_API_KEY] }, async (req, res) => {
  const t = String(req.query.token || '');
  const page = (title, msg) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <body style="font-family:Nunito,Arial,sans-serif;text-align:center;padding:60px 20px;color:#0F1C2E;">
    <h1 style="color:#2d6a4f;">🔮 ${title}</h1><p style="font-size:1.1rem;">${msg}</p>
    <p><a href="${SITE_BASE}/oracle.html" style="color:#2d6a4f;font-weight:700;">Back to the Oracle →</a></p></body>`;
  try {
    if (!t) { res.status(400).send(page('Invalid link', 'That confirmation link is missing its token.')); return; }
    const q = await db().collection(COLLECTION).where('confirmToken', '==', t).limit(1).get();
    if (q.empty) { res.status(404).send(page('Link not found', "That confirmation link is invalid or expired. If you already tapped confirm, you're all set — your daily dog wisdom arrives at 6 AM. 🐾")); return; }
    const doc = q.docs[0];
    // Idempotent: keep confirmToken so re-clicks (or a refreshed tab) resolve to a friendly page
    // instead of a scary "expired" error.
    if (doc.data().status === 'confirmed') {
      res.status(200).send(page("You're already in!", 'You confirmed this subscription already. Your daily dog wisdom arrives at 6 AM. 🐾'));
      return;
    }
    await doc.ref.update({ status: 'confirmed', confirmedAt: FieldValue.serverTimestamp() });
    // Send a welcome/confirmation email so the subscriber has a record that they
    // signed up and clear instructions on how to unsubscribe (CAN-SPAM friendly).
    if (doc.data().method === 'email') {
      const unsubUrl = `${FUNCTIONS_BASE}/oracleUnsubscribe?token=${doc.data().unsubToken}`;
      const eraseUrl = `${FUNCTIONS_BASE}/oracleErase?token=${doc.data().unsubToken}`;
      try {
        await sendEmail({
          to: doc.data().value,
          subject: "You're subscribed to The Off-Leash Oracle 🐾",
          text: `You're all set! One short dog wisdom reading lands in your inbox every morning at 6 AM.\n\nTo unsubscribe at any time, click: ${unsubUrl}\n(There's also an unsubscribe link at the bottom of every email.)\n\nTo permanently delete your data: ${eraseUrl}\n\n${POSTAL_ADDRESS}`,
          html: emailFrame(
            `<p>You're all set! 🎉 One short dog wisdom reading will land in your inbox every morning at <strong>6 AM</strong>.</p>
             <p style="color:#5A5A5A;">Changed your mind? You can unsubscribe anytime — just tap the link below, or use the unsubscribe link at the bottom of any email.</p>`,
            unsubUrl,
            eraseUrl
          )
        });
      } catch (mailErr) {
        logger.warn('[oracleConfirm] welcome email failed', mailErr.message);
      }
    }
    res.status(200).send(page("You're in!", 'Your first dog wisdom arrives tomorrow at 6 AM. 🐾'));
  } catch (err) {
    logger.error('[oracleConfirm] error', err);
    res.status(500).send(page('Something went wrong', 'Please try again in a moment.'));
  }
});

// ─── 3. Email unsubscribe ───────────────────────────────────────────────────
exports.oracleUnsubscribe = onRequest({ region: REGION, invoker: 'public' }, async (req, res) => {
  const t = String(req.query.token || '');
  const page = (msg) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <body style="font-family:Nunito,Arial,sans-serif;text-align:center;padding:60px 20px;color:#0F1C2E;">
    <h1 style="color:#2d6a4f;">The Off-Leash Oracle</h1><p style="font-size:1.1rem;">${msg}</p></body>`;
  try {
    if (!t) { res.status(400).send(page('Invalid unsubscribe link.')); return; }
    const q = await db().collection(COLLECTION).where('unsubToken', '==', t).limit(1).get();
    if (q.empty) { res.status(404).send(page('That unsubscribe link is invalid.')); return; }
    await q.docs[0].ref.update({ status: 'unsubscribed', unsubscribedAt: FieldValue.serverTimestamp() });
    res.status(200).send(page("You've been unsubscribed. No more messages. Trails to you. 🐾"));
  } catch (err) {
    logger.error('[oracleUnsubscribe] error', err);
    res.status(500).send(page('Please try again in a moment.'));
  }
});

// ─── 4. Twilio inbound SMS webhook (YES / STOP / HELP) ────────────────────────
exports.oracleSmsInbound = onRequest({ region: REGION, invoker: 'public' }, async (req, res) => {
  const from = normalizePhone(req.body && req.body.From);
  const text = String((req.body && req.body.Body) || '').trim().toUpperCase();
  const twiml = (msg) => { res.set('Content-Type', 'text/xml'); res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response>${msg ? `<Message>${msg}</Message>` : ''}</Response>`); };
  try {
    if (!from) { twiml(''); return; }
    const ref = db().collection(COLLECTION).doc('sms:' + from);
    if (text === 'STOP' || text === 'UNSUBSCRIBE' || text === 'CANCEL' || text === 'QUIT' || text === 'END' || text === 'STOPALL') {
      await ref.set({ status: 'unsubscribed', unsubscribedAt: FieldValue.serverTimestamp() }, { merge: true });
      // Send our own opt-out confirmation with the standard 24-48h processing notice.
      // NOTE: If "Advanced Opt-Out" is enabled on the Twilio Messaging Service, Twilio
      // intercepts STOP and sends ITS configured confirmation instead (and would block
      // this one). In that case, set the same wording in the Twilio console. With default
      // handling this reply is delivered as the single required opt-out confirmation.
      twiml("You've been unsubscribed from The Off-Leash Oracle. It may take 24-48 hours to fully stop. Reply START to rejoin. 🐾");
      return;
    }
    if (text === 'HELP' || text === 'INFO') { twiml('The Off-Leash Oracle: 1 daily dog wisdom text. Reply STOP to cancel. Msg&data rates may apply.'); return; }
    if (text === 'YES' || text === 'START' || text === 'CONFIRM') {
      const snap = await ref.get();
      if (snap.exists) {
        await ref.update({ status: 'confirmed', confirmedAt: FieldValue.serverTimestamp() });
        twiml("You're in! 🐾 Your first dog wisdom arrives tomorrow at 6 AM. Approx 1 msg/day. Reply STOP anytime to unsubscribe, HELP for help.");
      } else {
        twiml('Sign up first at barkparks.dog/oracle to receive daily dog wisdom.');
      }
      return;
    }
    twiml('Reply YES to confirm, STOP to cancel, or HELP for help.');
  } catch (err) {
    logger.error('[oracleSmsInbound] error', err);
    twiml('');
  }
});

// ─── 5. Daily 6 AM send ───────────────────────────────────────────────────────
exports.oracleDailySend = onSchedule(
  { schedule: '0 6 * * *', timeZone: 'America/Chicago', region: REGION,
    secrets: [SENDGRID_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER] },
  async () => {
    const settings = await getSettings();
    if (!settings.dailyEnabled) { logger.info('[oracleDailySend] dailyEnabled=false, skipping'); return; }

    const quote = quoteForToday();
    const snap = await db().collection(COLLECTION)
      .where('status', '==', 'confirmed')
      .limit(settings.maxDailyRecipients).get();

    let emailSent = 0, smsSent = 0, pushSent = 0, failed = 0;
    for (const doc of snap.docs) {
      const sub = doc.data();
      try {
        if (sub.method === 'email' && settings.emailEnabled) {
          const unsubUrl = `${FUNCTIONS_BASE}/oracleUnsubscribe?token=${sub.unsubToken}`;
          const eraseUrl = `${FUNCTIONS_BASE}/oracleErase?token=${sub.unsubToken}`;
          await sendEmail({
            to: sub.value,
            subject: '🔮 Today\'s Off-Leash Oracle',
            text: `${quote}\n\n— The Off-Leash Oracle\n\nUnsubscribe: ${unsubUrl}\nDelete my data: ${eraseUrl}\n${POSTAL_ADDRESS}`,
            html: emailFrame(`<p style="font-size:1.25rem;line-height:1.6;">${quote}</p><p style="color:#5A5A5A;">— delivered at dawn 🐾</p>`, unsubUrl, eraseUrl)
          });
          emailSent++;
        } else if (sub.method === 'sms' && settings.smsEnabled && twilioReady()) {
          await sendSms(sub.value, `🔮 ${quote}\n— Off-Leash Oracle. STOP to cancel.`);
          smsSent++;
        } else if (sub.method === 'push' && settings.pushEnabled) {
          // Web push via FCM. Prune tokens the browser has invalidated so we
          // stop paying attention to dead devices.
          try {
            await getMessaging().send({
              token: sub.token || sub.value,
              notification: { title: '🔮 Today\'s Off-Leash Oracle', body: quote },
              webpush: {
                fcmOptions: { link: 'https://offleashoracle.com/' },
                notification: { icon: 'https://offleashoracle.com/oracle-card.png', tag: 'oracle-daily' }
              }
            });
            pushSent++;
          } catch (pushErr) {
            const dead = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument'];
            if (dead.includes(pushErr.code)) { await doc.ref.delete(); }
            else { throw pushErr; }
          }
        }
      } catch (err) {
        failed++;
        logger.warn(`[oracleDailySend] send failed for ${doc.id}: ${err.message}`);
      }
    }
    logger.info(`[oracleDailySend] quote sent. email=${emailSent} sms=${smsSent} push=${pushSent} failed=${failed}`);
  }
);

// ─── 6. Self-service data deletion (right to erasure) ─────────────────────────
// Reached via the "Delete my data" link in every email (uses the same unsubToken).
// Hard-deletes the subscriber record — nothing is retained afterward.
exports.oracleErase = onRequest({ region: REGION, invoker: 'public' }, async (req, res) => {
  const t = String(req.query.token || '');
  const page = (title, msg) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <body style="font-family:Nunito,Arial,sans-serif;text-align:center;padding:60px 20px;color:#0F1C2E;">
    <h1 style="color:#2d6a4f;">🔮 ${title}</h1><p style="font-size:1.1rem;">${msg}</p>
    <p><a href="${SITE_BASE}/oracle.html" style="color:#2d6a4f;font-weight:700;">Back to the Oracle →</a></p></body>`;
  try {
    if (!t) { res.status(400).send(page('Invalid link', 'That data-deletion link is missing its token.')); return; }
    const q = await db().collection(COLLECTION).where('unsubToken', '==', t).limit(1).get();
    if (q.empty) { res.status(404).send(page('Nothing to delete', 'That link is invalid, or your data has already been deleted. Either way, nothing of yours is stored. 🐾')); return; }
    await q.docs[0].ref.delete();
    res.status(200).send(page('Your data is deleted', 'Your email/number and all related records have been permanently removed from The Off-Leash Oracle. Trails to you. 🐾'));
  } catch (err) {
    logger.error('[oracleErase] error', err);
    res.status(500).send(page('Something went wrong', 'Please try again in a moment.'));
  }
});

// ─── 7. Scheduled data retention / auto-purge ────────────────────────────────
// Runs daily. Hard-deletes: unsubscribed records older than 1 year (suppression
// list expiry) and never-confirmed "pending" signups older than 30 days. Also
// cleans up stale rate-limit counters. Uses status-only queries + in-code date
// filtering so no composite Firestore index is required.
exports.oraclePurge = onSchedule(
  { schedule: '30 3 * * *', timeZone: 'America/Chicago', region: REGION },
  async () => {
    const nowMs = Date.now();

    async function purgeByStatus(status, olderThanMs, tsField) {
      const snap = await db().collection(COLLECTION).where('status', '==', status).limit(500).get();
      const batch = db().batch();
      let n = 0;
      snap.forEach((d) => {
        const ts = d.get(tsField);
        const ms = ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
        if (ms && (nowMs - ms) > olderThanMs) { batch.delete(d.ref); n++; }
      });
      if (n) await batch.commit();
      return n;
    }

    let deletedSubs = 0;
    try {
      deletedSubs += await purgeByStatus('unsubscribed', PURGE_UNSUBSCRIBED_MS, 'unsubscribedAt');
      deletedSubs += await purgeByStatus('pending', PURGE_PENDING_MS, 'createdAt');
    } catch (e) {
      logger.warn('[oraclePurge] subscriber purge error', e.message);
    }

    let deletedRl = 0;
    try {
      const rl = await db().collection(RATELIMIT_COLLECTION).limit(500).get();
      const batch = db().batch();
      rl.forEach((d) => {
        const ws = d.get('windowStart');
        if (ws && (nowMs - ws) > IP_WINDOW_MS) { batch.delete(d.ref); deletedRl++; }
      });
      if (deletedRl) await batch.commit();
    } catch (e) {
      logger.warn('[oraclePurge] rate-limit cleanup error', e.message);
    }

    // Also clean the petBindi per-IP rate-limit counters (same rolling window).
    try {
      const rl2 = await db().collection('petstats-ratelimit').limit(500).get();
      const batch2 = db().batch();
      let n2 = 0;
      rl2.forEach((d) => {
        const ws = d.get('windowStart');
        if (ws && (nowMs - ws) > IP_WINDOW_MS) { batch2.delete(d.ref); n2++; }
      });
      if (n2) { await batch2.commit(); deletedRl += n2; }
    } catch (e) {
      logger.warn('[oraclePurge] petstats rate-limit cleanup error', e.message);
    }

    logger.info(`[oraclePurge] deleted ${deletedSubs} subscriber records, ${deletedRl} rate-limit docs`);
  }
);

// ─── 8. Web push (Firebase Cloud Messaging) ──────────────────────────────────
// Free, no carrier registration: the browser's Notification permission IS the
// opt-in, so push subscribers are stored as method:'push', status:'confirmed'
// and picked up by the same oracleDailySend loop as email/SMS. Each device's
// FCM registration token lives in oracle-subscribers under a hashed doc id.
function pushDocId(fcmToken) {
  return 'push:' + crypto.createHash('sha256').update(String(fcmToken)).digest('hex').slice(0, 40);
}

// Subscribe a browser/device for daily push. Public endpoint, same abuse
// protection as oracleSignup (honeypot + reCAPTCHA + per-IP rate limit).
exports.oraclePushSubscribe = onRequest(
  { region: REGION, cors: ALLOWED_ORIGINS, invoker: 'public', secrets: [RECAPTCHA_SECRET] },
  async (req, res) => {
    corsHeaders(req, res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
    try {
      const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      const ip = clientIp(req);

      // Honeypot: hidden field only bots fill — feign success, store nothing.
      if (body[HONEYPOT_FIELD]) { res.status(200).json({ ok: true }); return; }

      const fcmToken = String(body.token || '').trim();
      // FCM web tokens are long opaque strings; reject anything obviously bogus.
      if (fcmToken.length < 20) { res.status(400).json({ error: 'invalid_token' }); return; }

      if (!(await verifyRecaptcha(body.captcha, ip))) { res.status(400).json({ error: 'captcha' }); return; }
      if (!(await underRateLimit(ip))) { res.status(429).json({ error: 'rate_limited' }); return; }

      const ref = db().collection(COLLECTION).doc(pushDocId(fcmToken));
      const existing = await ref.get();
      const unsubToken = (existing.exists && existing.data().unsubToken) || token();
      const docData = {
        method: 'push',
        value: fcmToken,
        token: fcmToken,
        status: 'confirmed',           // notification permission is the opt-in
        unsubToken,
        consentText: 'Enabled browser push notifications for The Off-Leash Oracle',
        source: body.source || 'offleashoracle',
        confirmedAt: FieldValue.serverTimestamp()
      };
      if (!existing.exists) docData.createdAt = FieldValue.serverTimestamp();
      await ref.set(docData, { merge: true });

      res.status(200).json({ ok: true });
    } catch (err) {
      logger.error('[oraclePushSubscribe] error', err);
      res.status(500).json({ error: 'server' });
    }
  }
);

// Unsubscribe a device (called when the user turns notifications off in the UI).
exports.oraclePushUnsubscribe = onRequest(
  { region: REGION, cors: ALLOWED_ORIGINS, invoker: 'public' },
  async (req, res) => {
    corsHeaders(req, res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
    try {
      const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      const fcmToken = String(body.token || '').trim();
      if (fcmToken) await db().collection(COLLECTION).doc(pushDocId(fcmToken)).delete();
      res.status(200).json({ ok: true });
    } catch (err) {
      logger.error('[oraclePushUnsubscribe] error', err);
      res.status(200).json({ ok: true });
    }
  }
);
