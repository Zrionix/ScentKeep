/* eslint-disable */
/**
 * Asserts the marketing site tells the truth about the app.
 *
 *   node scripts/check-site.js
 *
 * Written because it did not. site/index.html advertised a 3-bottle wishlist
 * for weeks after FREE_LIMITS.wishlist became 5, and the App Store description
 * carried the same stale number until it was caught by hand. Two places
 * describing one set of numbers will drift; the only question is whether
 * anything notices.
 *
 * So this reads the limits from the CODE and greps the site for anything that
 * contradicts them. It is deliberately dumb: it does not parse HTML, it looks
 * for the numbers, because a regex that occasionally needs updating is worth
 * more than a parser nobody maintains.
 */
const fs = require('node:fs');
const path = require('node:path');

const SITE = path.join(__dirname, '..', 'site', 'index.html');
const ENTITLEMENTS = path.join(__dirname, '..', 'src', 'domain', 'entitlements.ts');

/** The App Store id. If the site ever links a different app, that is worse than
 *  a stale number and should fail loudly. */
const APP_ID = '6795710068';

let failed = 0;
const ok = (m) => console.log(`  PASS  ${m}`);
const bad = (m) => {
  console.log(`  FAIL  ${m}`);
  failed += 1;
};

/** Pulls a numeric field out of the FREE_LIMITS literal. Reading the real
 *  source rather than a duplicated constant is the entire point. */
function freeLimit(src, key) {
  // Character classes rather than \s and \d: this file has been written
  // through a shell heredoc more than once, and a swallowed backslash turns the
  // pattern into `wardrobe:s*(d+)`, which matches nothing and throws.
  const m = new RegExp(key + ':[ 	]*([0-9]+)').exec(src);
  if (!m) throw new Error(`FREE_LIMITS.${key} not found in entitlements.ts`);
  return Number(m[1]);
}

const html = fs.readFileSync(SITE, 'utf8');
const ts = fs.readFileSync(ENTITLEMENTS, 'utf8');

const limits = {
  wardrobe: freeLimit(ts, 'wardrobe'),
  wishlist: freeLimit(ts, 'wishlist'),
  sotdHistoryDays: freeLimit(ts, 'sotdHistoryDays'),
};

console.log(`FREE_LIMITS: ${JSON.stringify(limits)}\n`);

// --- the free-tier numbers --------------------------------------------------
for (const [label, value, row] of [
  ['wardrobe cap', limits.wardrobe, /Bottles in your wardrobe<\/td><td>Up to (\d+)</],
  ['wishlist cap', limits.wishlist, /Wishlist[^<]*<\/td><td>Up to (\d+)</],
  ['diary window', limits.sotdHistoryDays, /Diary history[^<]*<\/td><td>Last (\d+) days</],
]) {
  const m = row.exec(html);
  if (!m) bad(`${label}: the row this checks is gone — update the regex or the site`);
  else if (Number(m[1]) !== value) bad(`${label}: site says ${m[1]}, code says ${value}`);
  else ok(`${label} — site and code agree on ${value}`);
}

// --- the thing the page is for ----------------------------------------------
if (!html.includes(`apps.apple.com/app/id${APP_ID}`)) {
  bad(`no App Store link for id${APP_ID} — the download button is the page's job`);
} else ok('App Store link present and points at the right app');

if (/coming soon/i.test(html)) bad('still says "coming soon" — the app is live');
else ok('no pre-launch copy left');

// --- prices -----------------------------------------------------------------
// These live in App Store Connect rather than in code, so this only checks the
// site agrees with itself and with what was actually configured.
for (const price of ['$4.99', '$24.99', '$59.99']) {
  if (html.includes(price)) ok(`price ${price} stated`);
  else bad(`price ${price} missing from the pricing note`);
}

console.log(failed === 0 ? '\nThe site tells the truth.' : `\n${failed} problem(s).`);
process.exitCode = failed === 0 ? 0 : 1;
