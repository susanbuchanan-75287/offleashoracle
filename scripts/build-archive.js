#!/usr/bin/env node
/**
 * Builds archive.html from data/oracle-quotes.json.
 *
 * The archive is a *drip*: it only reveals readings that have been "published"
 * so far — one new reading per day — so the collection grows over time instead
 * of dumping all readings at once. Newest reading appears first.
 *
 * Day 1 = LAUNCH (UTC). Reading for day N (1-based) is quotes[(N-1) % length].
 * This MUST stay in sync with:
 *   - index.html         (homepage "today's reading" + LAUNCH_UTC)
 *   - functions/oracle.js quoteForToday() start date (backend email/push send)
 *
 * Run locally:  node scripts/build-archive.js
 * Run in CI:    .github/workflows/daily-archive.yml (daily cron)
 */
const fs = require('fs');
const path = require('path');

// Day 1 of the Oracle (UTC midnight). Keep in sync with index.html + oracle.js.
const LAUNCH_UTC = Date.UTC(2026, 6, 1); // 2026-07-01

const root = path.join(__dirname, '..');
const quotes = JSON.parse(fs.readFileSync(path.join(root, 'data', 'oracle-quotes.json'), 'utf8'))
  .filter(q => typeof q === 'string' && q.trim());

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function publishedCount(now = Date.now()) {
  const days = Math.floor((now - LAUNCH_UTC) / 86400000) + 1; // 1-based day count
  return Math.max(1, Math.min(days, quotes.length));
}

const count = publishedCount();

// Newest first: reading No. `count` (today) at the top, down to No. 1.
const revealed = [];
for (let n = count; n >= 1; n--) {
  const q = quotes[(n - 1) % quotes.length];
  revealed.push({ n, q });
}

const items = revealed.map(({ n, q }) =>
`      <li class="arc-item" id="w-${n}" itemscope itemtype="https://schema.org/Quotation">
        <blockquote itemprop="text">${esc(q)}</blockquote>
        <cite><span itemprop="spokenByCharacter">The Off-Leash Oracle&trade;</span> &middot; No.&nbsp;${n}</cite>
        <a class="arc-permalink" href="#w-${n}" aria-label="Permalink to reading ${n}">#</a>
      </li>`).join('\n');

const readingWord = count === 1 ? 'reading' : 'readings';
const ld = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": "The Wisdom Archive — The Off-Leash Oracle",
  "description": `Every trail truth the Off-Leash Oracle has spoken so far — ${count} ${readingWord} of cosmic dog wisdom, with a new one added each day.`,
  "url": "https://offleashoracle.com/archive.html",
  "isPartOf": { "@type": "WebSite", "name": "The Off-Leash Oracle", "url": "https://offleashoracle.com/" },
  "publisher": { "@type": "Organization", "name": "Joy, Thee & Me LLC" }
};
const breadcrumb = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://offleashoracle.com/" },
    { "@type": "ListItem", "position": 2, "name": "Wisdom Archive", "item": "https://offleashoracle.com/archive.html" }
  ]
};

const lede = count === 1
  ? `The Oracle has spoken just once so far — this is where every reading will gather. A new trail truth is added here each morning, so the collection grows a little wiser every day.`
  : `One reading arrives each morning, and this is where they gather. So far the dogs have offered ${count} small, four-pawed truths — a new one lands here every day.`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none';">
<meta http-equiv="X-Content-Type-Options" content="nosniff">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>The Wisdom Archive &mdash; Every Reading from The Off-Leash Oracle&trade;</title>
<meta name="description" content="Browse every reading The Off-Leash Oracle&trade; has spoken so far &mdash; cosmic dog wisdom for the trail and the humans who follow. A new trail truth is added each day.">
<meta name="author" content="Off-Leash Oracle &middot; Joy, Thee &amp; Me LLC">
<link rel="canonical" href="https://offleashoracle.com/archive.html">
<meta name="robots" content="index, follow">
<meta name="theme-color" content="#101826">
<meta property="og:type" content="website">
<meta property="og:site_name" content="The Off-Leash Oracle">
<meta property="og:title" content="The Wisdom Archive &mdash; The Off-Leash Oracle&trade;">
<meta property="og:description" content="Every trail truth the Oracle has spoken so far &mdash; a new reading of cosmic dog wisdom added each day.">
<meta property="og:url" content="https://offleashoracle.com/archive.html">
<meta property="og:image" content="https://offleashoracle.com/oracle-card.png">
<meta property="og:image:alt" content="The Off-Leash Oracle &mdash; daily trail wisdom for dogs and their humans">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="The Wisdom Archive &mdash; The Off-Leash Oracle&trade;">
<meta name="twitter:description" content="Every trail truth the Oracle has spoken so far &mdash; a new reading added each day.">
<meta name="twitter:image" content="https://offleashoracle.com/oracle-card.png">
<meta name="twitter:image:alt" content="The Off-Leash Oracle &mdash; daily trail wisdom for dogs and their humans">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify(breadcrumb, null, 2)}
</script>
<style>
  :root{
    --ink:#f4efe2; --ink-soft:rgba(244,239,226,.74); --ink-dim:rgba(244,239,226,.6);
    --gold:#d8b265; --gold-bright:#e7c984; --green:#1d3b32; --green-deep:#142a26; --night:#101826;
    --card-line:rgba(216,178,101,.28);
  }
  *{margin:0;padding:0;box-sizing:border-box}
  body{
    font-family:'Nunito',system-ui,sans-serif; color:var(--ink); line-height:1.65;
    background:
      radial-gradient(1200px 700px at 80% -10%, rgba(216,178,101,.10), transparent 55%),
      radial-gradient(900px 600px at 10% 10%, rgba(46,93,80,.30), transparent 60%),
      linear-gradient(165deg, var(--night) 0%, var(--green-deep) 55%, #0c1720 100%);
    min-height:100vh; -webkit-font-smoothing:antialiased;
  }
  .stars{position:fixed;inset:0;pointer-events:none;z-index:0;
    background-image:
      radial-gradient(1.5px 1.5px at 20% 30%, rgba(255,255,255,.7), transparent),
      radial-gradient(1.5px 1.5px at 70% 20%, rgba(255,255,255,.5), transparent),
      radial-gradient(1px 1px at 40% 70%, rgba(255,255,255,.55), transparent),
      radial-gradient(1.5px 1.5px at 55% 45%, rgba(216,178,101,.55), transparent);
    opacity:.7}
  .wrap{position:relative;z-index:1;max-width:760px;margin:0 auto;padding:0 22px}
  header{display:flex;align-items:center;justify-content:space-between;padding:26px 0 8px;flex-wrap:wrap;gap:10px}
  .brand{display:flex;align-items:center;gap:11px;font-family:'Cormorant Garamond',serif;font-weight:700;font-size:1.35rem;color:var(--gold-bright);letter-spacing:.3px}
  .brand a{color:inherit;text-decoration:none}
  .brand .moon{font-size:1.3rem;filter:drop-shadow(0 0 8px rgba(216,178,101,.5))}
  .nav-mini a{color:var(--ink-soft);text-decoration:none;font-size:.85rem;font-weight:700;margin-left:18px}
  .nav-mini a:hover{color:var(--gold-bright)}
  .arc-hero{text-align:center;padding:34px 0 6px}
  .eyebrow{display:inline-block;text-transform:uppercase;letter-spacing:.32em;font-size:.72rem;font-weight:800;color:var(--gold);margin-bottom:16px}
  h1{font-family:'Cormorant Garamond',serif;font-weight:700;font-size:clamp(2rem,5.5vw,3rem);line-height:1.1;margin-bottom:14px}
  h1 .glow{color:var(--gold-bright);font-style:italic}
  .arc-lede{color:var(--ink-soft);font-size:1.05rem;max-width:560px;margin:0 auto 6px}
  .arc-count{color:var(--gold);font-weight:800;font-size:.8rem;letter-spacing:.18em;text-transform:uppercase;margin-top:14px}
  .arc-cta{display:inline-flex;align-items:center;gap:8px;margin:22px auto 4px;padding:12px 24px;border-radius:999px;
    background:linear-gradient(135deg,var(--gold-bright),var(--gold));color:#1a130a;text-decoration:none;font-weight:800;font-size:.92rem;
    box-shadow:0 10px 24px rgba(216,178,101,.28)}
  .arc-list{list-style:none;margin:30px 0 10px;display:grid;gap:14px}
  .arc-item{position:relative;border-radius:20px;padding:24px 46px 22px 26px;
    background:linear-gradient(160deg, rgba(29,59,50,.72), rgba(16,24,38,.72));
    border:1px solid var(--card-line)}
  .arc-item blockquote{font-family:'Cormorant Garamond',serif;font-style:italic;font-weight:600;
    font-size:clamp(1.15rem,2.6vw,1.4rem);line-height:1.5}
  .arc-item cite{display:block;font-style:normal;font-weight:700;color:var(--ink-dim);font-size:.78rem;letter-spacing:.03em;margin-top:12px}
  .arc-permalink{position:absolute;top:20px;right:20px;color:var(--ink-dim);text-decoration:none;font-weight:800;font-size:1rem;opacity:.55}
  .arc-permalink:hover{color:var(--gold-bright);opacity:1}
  .arc-item:target{border-color:var(--gold-bright);box-shadow:0 0 0 1px var(--gold-bright), 0 20px 50px rgba(6,12,18,.5)}
  footer{position:relative;z-index:1;border-top:1px solid rgba(244,239,226,.1);margin-top:24px;padding:28px 22px 40px;text-align:center}
  .foot-brand{font-family:'Cormorant Garamond',serif;color:var(--gold-bright);font-size:1.15rem;font-weight:700}
  .foot-links{margin:12px 0;display:flex;gap:16px;justify-content:center;flex-wrap:wrap}
  .foot-links a{color:var(--ink-soft);text-decoration:none;font-size:.85rem;font-weight:700}
  .foot-links a:hover{color:var(--gold-bright)}
  .foot-fine{color:var(--ink-dim);font-size:.78rem;margin-top:8px;line-height:1.7}
  @media (max-width:540px){.nav-mini a{margin-left:12px}.arc-item{padding:22px 40px 20px 22px}}
</style>
</head>
<body>
<div class="stars" aria-hidden="true"></div>
<div class="wrap">
  <header>
    <div class="brand"><a href="/"><span class="moon">&#127769;</span> The Off-Leash Oracle</a></div>
    <nav class="nav-mini" aria-label="primary">
      <a href="/">Today's Reading</a>
      <a href="/#subscribe">Subscribe</a>
      <a href="/#about">About</a>
    </nav>
  </header>

  <main>
  <nav class="arc-crumb" aria-label="Breadcrumb" style="font-size:.8rem;color:var(--ink-dim);padding-top:14px">
    <a href="/" style="color:var(--ink-soft);text-decoration:none;font-weight:700">Home</a> &rsaquo; <span>Wisdom Archive</span>
  </nav>
  <section class="arc-hero">
    <span class="eyebrow">The Wisdom Archive</span>
    <h1>Every <span class="glow">trail truth</span> the Oracle has spoken.</h1>
    <p class="arc-lede">${lede}</p>
    <div class="arc-count">${count} ${readingWord} &middot; and counting</div>
    <a class="arc-cta" href="/#subscribe">Get a fresh one every morning &rarr;</a>
  </section>

  <section aria-label="All readings">
    <ol class="arc-list" data-baked-count="${count}" data-launch-utc="${LAUNCH_UTC}" data-quote-count="${quotes.length}">
${items}
    </ol>
  </section>
  </main>
</div>

<footer>
  <div class="foot-brand">&#127769; The Off-Leash Oracle&trade;</div>
  <div class="foot-links">
    <a href="/">Today's Reading</a>
    <a href="/#subscribe">Subscribe</a>
    <a href="/#about">About</a>
    <a href="https://binditails.com" target="_blank" rel="noopener">BindiTails</a>
    <a href="https://barkparks.dog" target="_blank" rel="noopener">BarkParks</a>
    <a href="/privacy.html">Privacy</a>
    <a href="/terms.html">Terms</a>
  </div>
  <div class="foot-fine">
    A little ritual from the <a href="https://binditails.com" style="color:var(--ink-soft);font-weight:700" target="_blank" rel="noopener">BindiTails</a> family.<br>
    &copy; 2026 The Off-Leash Oracle&trade; &middot; Joy, Thee &amp; Me LLC. All rights reserved.
  </div>
</footer>
<script>
/* Progressive drip: reveal any readings that have become available since this
   page was built, using the visitor's current date. Mirrors the exact logic in
   scripts/build-archive.js and index.html (LAUNCH_UTC + quotes[(n-1)%len]).
   The server-built list above stays intact as a no-JS / SEO fallback. */
(function () {
  var list = document.querySelector('.arc-list');
  if (!list) return;
  var launchUTC = parseInt(list.getAttribute('data-launch-utc'), 10);
  var bakedCount = parseInt(list.getAttribute('data-baked-count'), 10) || 0;
  if (!launchUTC) return;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function itemHTML(n, q) {
    return '<li class="arc-item" id="w-' + n + '" itemscope itemtype="https://schema.org/Quotation">'
      + '<blockquote itemprop="text">' + esc(q) + '</blockquote>'
      + '<cite><span itemprop="spokenByCharacter">The Off-Leash Oracle&trade;</span> &middot; No.&nbsp;' + n + '</cite>'
      + '<a class="arc-permalink" href="#w-' + n + '" aria-label="Permalink to reading ' + n + '">#</a>'
      + '</li>';
  }

  fetch('data/oracle-quotes.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (raw) {
      if (!Array.isArray(raw)) return;
      var quotes = raw.filter(function (q) { return typeof q === 'string' && q.trim(); });
      if (!quotes.length) return;

      var days = Math.floor((Date.now() - launchUTC) / 86400000) + 1;
      var count = Math.max(1, Math.min(days, quotes.length));
      if (count <= bakedCount) return; // nothing new since build

      // Newest first: prepend readings bakedCount+1 .. count above the baked list.
      var frag = '';
      for (var n = count; n > bakedCount; n--) {
        frag += itemHTML(n, quotes[((n - 1) % quotes.length + quotes.length) % quotes.length]);
      }
      list.insertAdjacentHTML('afterbegin', frag);
      list.setAttribute('data-baked-count', count);

      var word = count === 1 ? 'reading' : 'readings';
      var countEl = document.querySelector('.arc-count');
      if (countEl) countEl.innerHTML = count + ' ' + word + ' &middot; and counting';
      var ledeEl = document.querySelector('.arc-lede');
      if (ledeEl) {
        ledeEl.textContent = count === 1
          ? 'The Oracle has spoken just once so far \u2014 this is where every reading will gather. A new trail truth is added here each morning, so the collection grows a little wiser every day.'
          : 'One reading arrives each morning, and this is where they gather. So far the dogs have offered ' + count + ' small, four-pawed truths \u2014 a new one lands here every day.';
      }
    })
    .catch(function () { /* keep the server-built fallback */ });
})();
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(root, 'archive.html'), html, 'utf8');
console.log(`archive.html built: ${count} ${readingWord} revealed (of ${quotes.length}).`);
