/* eslint-disable */
/**
 * Fills in TestFlight's Test Information — the stuff external testing is
 * blocked on.
 *
 *   node scripts/testflight-info.js                    # dry run
 *   node scripts/testflight-info.js --apply
 *   SCENTKEEP_REVIEW_PHONE="+1 555 123 4567" node scripts/testflight-info.js --apply
 *
 * Three separate records, which is why the UI makes this feel like more work
 * than it is:
 *   1. betaAppLocalizations   — what testers read in the TestFlight app
 *   2. betaAppReviewDetails   — what Apple's beta reviewer reads
 *   3. betaBuildLocalizations — the per-build "What to Test"
 *
 * The review contact PHONE comes from the environment rather than this file on
 * purpose: it is personal data, it does not belong in the repo, and the person
 * whose phone it is should be the one who types it.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const APP_ID = '6795710068';
const KEY_PATH = path.join(__dirname, '..', 'credentials', 'AuthKey_X25AAYH8QT.p8');
const KEY_ID = 'X25AAYH8QT';
const ISSUER = '905684d2-c99b-4bb1-91dc-98bcf84d2c81';
const APPLY = process.argv.includes('--apply');

const LOCALE = 'en-US';

// Cloudflare Email Routing for support@scentkeep.com is still waiting on the
// destination-mailbox verification click, so testers get an address that is
// certain to deliver today. Flip this the moment routing goes green — it is one
// re-run of this script.
const FEEDBACK_EMAIL = 'nathan@zrionix.dev';

const MARKETING_URL = 'https://scentkeep.com';
const PRIVACY_URL = 'https://scentkeep.com/privacy';

const REVIEW_CONTACT = {
  contactFirstName: 'Nathan',
  contactLastName: 'Zweers',
  contactEmail: 'nathan@zrionix.dev',
  contactPhone: process.env.SCENTKEEP_REVIEW_PHONE || null,
  demoAccountRequired: false,
  demoAccountName: null,
  demoAccountPassword: null,
};

const BETA_DESCRIPTION = `ScentKeep is a private catalogue for a fragrance collection.

Log the bottles you own — house, size, concentration, the note pyramid, what you paid. Keep a wishlist split between what you want to buy and what you only want to sniff first. Record a Scent of the Day each day. From that wear history ScentKeep works out what you actually reach for, what each bottle costs you per wear, which bottles have gone untouched for months, and roughly how much juice is left in each one.

No account, no sign-up, no email address. Everything works on first launch, and everything works offline.

WHAT I'D LIKE YOU TO TRY

1. Add a few bottles. Only the name is required — fill in as much or as little as you like.
2. Log a Scent of the Day a few days running, then look at the Diary tab.
3. Open Insights once you have a handful of wears recorded.
4. Give a bottle a size (say 100 ml) and log some wears. The remaining level and the "runs out around" estimate should start to appear.
5. Try the wishlist, and Settings → Export my data.

WHERE IT IS MOST LIKELY TO BE WRONG

- Dates and streaks, if you cross time zones.
- The remaining-volume estimate. It assumes 2 sprays per wear; you can change that per bottle.
- Any number that looks made up. Tell me which screen you saw it on and I can trace it.

ABOUT THE PAID TIER

The free tier holds 12 bottles, 5 wishlist items and 30 days of diary history. Premium lifts all three and adds the deeper statistics, bottle levels, the insurance-style collection export, cloud backup and themes.

Purchases in TestFlight are sandbox purchases. You will not be charged, and subscription periods run on an accelerated timer — a "month" is a few minutes.

Send anything odd through TestFlight itself (take a screenshot, or shake the device to report), or email ${FEEDBACK_EMAIL}.`;

const WHATS_NEW = `First TestFlight build, so all of it is new. The areas worth hammering:

- Adding, editing and deleting bottles, including photos from the library and the camera.
- Scent of the Day: log today, log a past day, and change a day you already logged.
- Diary: the streak count and the eight-week activity grid.
- Insights: cost per wear, rotation, and the neglected-bottles list.
- Bottle levels: set a size, log wears, and check the remaining estimate and the low-bottle warning.
- Wishlist, split between to-buy and to-sniff.
- Settings: the daily reminder, theme, currency, export, and Restore Purchases.
- The paywall — it should open on the 13th bottle, and sandbox purchases should unlock Premium and survive a restart.

Known and deliberate in this build:
- iPhone only. iPad is not claimed for 1.0.
- Fragrance records are user-entered; ScentKeep does not bundle or scrape a third-party fragrance database.
- Cloud sync is last-write-wins.`;

const REVIEW_NOTES = `ScentKeep is a personal catalogue for a fragrance collection: the bottles a user owns, a wishlist, and a "Scent of the Day" diary that drives the collection statistics.

NO ACCOUNT IS REQUIRED. There is no sign-up, no login screen and no email capture. Every feature below is reachable from a cold first launch, so please do not wait for a sign-in prompt — there isn't one, and no demo account is needed.

HOW TO REACH EACH FEATURE
1. Launch — a three-step onboarding, skippable from step 2.
2. Wardrobe tab — the "+" button, bottom right, adds a bottle. Only a name is required.
3. Wardrobe — the "Scent of the Day" card at the top, pick a bottle, then "Log today's scent".
4. Diary tab — dated history, streaks and an eight-week activity view.
5. Insights tab — collection statistics. Rotation, neglected bottles and the family/season breakdowns are Premium and show a "Premium" card when locked.
6. Settings tab — daily reminder, theme, currency, data export, account deletion and Restore Purchases.

REACHING THE PAYWALL
Add 12 bottles (the free limit) and tap "+" again. It is also reachable from Settings → the "ScentKeep Premium" card, and from any locked card on Insights.

IN-APP PURCHASES
Two auto-renewing subscriptions in one group plus one non-consumable: Monthly $4.99, Annual $24.99 with a 30-day free trial, Lifetime $59.99. The paywall shows price and period for every plan, the trial length, the auto-renewal disclosure, Restore Purchases, and links to Terms of Use and Privacy Policy.

PRIVACY
Anonymous-first: a user is identified only by a random ID. No email, name, phone, contacts or location is collected. The collection lives on the device and is uploaded only for Premium subscribers with cloud backup, into that user's own rows under Postgres row-level security. Photos are the user's own, stored in a private per-user bucket. Settings offers a full data export and complete account deletion. No advertising SDKs and no cross-app tracking, so no ATT prompt.

PERMISSIONS
Photos and Camera are requested only when the user taps the photo area on the add-bottle form; both are optional. Notifications are only for the optional local daily reminder — local only, no push server, no device token.

NOTHING RESTRICTED
No health or medical claims, no financial services, no user-generated content shared between users, no social feed, no messaging, no embedded browser, no age-restricted material.`;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt() {
  const now = Math.floor(Date.now() / 1000);
  const s =
    b64({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }) +
    '.' +
    b64({ iss: ISSUER, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' });
  const sig = crypto
    .sign('sha256', Buffer.from(s), {
      key: fs.readFileSync(KEY_PATH, 'utf8'),
      dsaEncoding: 'ieee-p1363',
    })
    .toString('base64url');
  return `${s}.${sig}`;
}

async function api(method, endpoint, body) {
  const res = await fetch('https://api.appstoreconnect.apple.com' + endpoint, {
    method,
    headers: { Authorization: `Bearer ${jwt()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (res.status >= 400) {
    const d = json.errors?.[0];
    throw new Error(`${res.status} ${d?.title ?? ''} — ${d?.detail ?? text.slice(0, 300)}`);
  }
  return json;
}

const log = (...a) => console.log(...a);

/** Apple caps each of these; exceeding one fails the whole PATCH with a
 *  message that does not say which field was too long. */
function checkLengths() {
  const limits = [
    ['beta app description', BETA_DESCRIPTION, 4000],
    ['what to test', WHATS_NEW, 4000],
    ['beta review notes', REVIEW_NOTES, 4000],
  ];
  let bad = false;
  for (const [name, value, max] of limits) {
    const mark = value.length > max ? 'OVER' : 'ok';
    log(`  ${mark.padEnd(5)} ${name.padEnd(22)} ${value.length}/${max}`);
    if (value.length > max) bad = true;
  }
  if (bad) process.exit(1);
}

async function upsertBetaAppLocalization() {
  const existing = await api('GET', `/v1/apps/${APP_ID}/betaAppLocalizations`);
  const row = (existing.data ?? []).find((l) => l.attributes.locale === LOCALE);
  const attributes = {
    description: BETA_DESCRIPTION,
    feedbackEmail: FEEDBACK_EMAIL,
    marketingUrl: MARKETING_URL,
    privacyPolicyUrl: PRIVACY_URL,
  };

  if (row) {
    log(`  update  beta app localization ${LOCALE}`);
    if (!APPLY) return;
    await api('PATCH', `/v1/betaAppLocalizations/${row.id}`, {
      data: { type: 'betaAppLocalizations', id: row.id, attributes },
    });
    return;
  }

  log(`  create  beta app localization ${LOCALE}`);
  if (!APPLY) return;
  await api('POST', '/v1/betaAppLocalizations', {
    data: {
      type: 'betaAppLocalizations',
      attributes: { ...attributes, locale: LOCALE },
      relationships: { app: { data: { type: 'apps', id: APP_ID } } },
    },
  });
}

async function upsertBetaAppReviewDetail() {
  // This record always exists — Apple creates it with the app — so it is only
  // ever a PATCH, and its id is the app id.
  if (!REVIEW_CONTACT.contactPhone) {
    log('  SKIP    beta review contact — no SCENTKEEP_REVIEW_PHONE set');
    log('          Apple requires a phone number here before beta review will accept the app.');
    return false;
  }
  log('  update  beta app review detail (contact + notes)');
  if (!APPLY) return true;
  await api('PATCH', `/v1/betaAppReviewDetails/${APP_ID}`, {
    data: {
      type: 'betaAppReviewDetails',
      id: APP_ID,
      attributes: { ...REVIEW_CONTACT, notes: REVIEW_NOTES },
    },
  });
  return true;
}

async function upsertBuildLocalization() {
  const builds = await api(
    'GET',
    `/v1/builds?filter[app]=${APP_ID}&limit=1&sort=-version&include=betaBuildLocalizations`,
  );
  const build = builds.data?.[0];
  if (!build) {
    log('  SKIP    what-to-test — no build uploaded yet');
    return;
  }

  const locs = (builds.included ?? []).filter((i) => i.type === 'betaBuildLocalizations');
  const row = locs.find((l) => l.attributes.locale === LOCALE);

  if (row) {
    log(`  update  what-to-test on build ${build.attributes.version}`);
    if (!APPLY) return;
    await api('PATCH', `/v1/betaBuildLocalizations/${row.id}`, {
      data: { type: 'betaBuildLocalizations', id: row.id, attributes: { whatsNew: WHATS_NEW } },
    });
    return;
  }

  log(`  create  what-to-test on build ${build.attributes.version}`);
  if (!APPLY) return;
  await api('POST', '/v1/betaBuildLocalizations', {
    data: {
      type: 'betaBuildLocalizations',
      attributes: { locale: LOCALE, whatsNew: WHATS_NEW },
      relationships: { build: { data: { type: 'builds', id: build.id } } },
    },
  });
}

async function report() {
  const loc = await api('GET', `/v1/apps/${APP_ID}/betaAppLocalizations`);
  const det = await api('GET', `/v1/apps/${APP_ID}/betaAppReviewDetail`);
  const builds = await api(
    'GET',
    `/v1/builds?filter[app]=${APP_ID}&limit=1&sort=-version&include=betaBuildLocalizations`,
  );

  const l = loc.data?.[0]?.attributes ?? {};
  const d = det.data?.attributes ?? {};
  const w = (builds.included ?? []).find((i) => i.type === 'betaBuildLocalizations')?.attributes;

  log('\nState now:');
  log('  description      ', l.description ? `${l.description.length} chars` : '— MISSING');
  log('  feedback email   ', l.feedbackEmail ?? '— MISSING');
  log('  marketing url    ', l.marketingUrl ?? '— MISSING');
  log('  privacy url      ', l.privacyPolicyUrl ?? '— MISSING');
  log('  review contact   ', d.contactFirstName ? `${d.contactFirstName} ${d.contactLastName}` : '— MISSING');
  log('  review email     ', d.contactEmail ?? '— MISSING');
  log('  review phone     ', d.contactPhone ? 'set' : '— MISSING (required)');
  log('  sign-in required ', d.demoAccountRequired === false ? 'no' : String(d.demoAccountRequired));
  log('  review notes     ', d.notes ? `${d.notes.length} chars` : '— MISSING');
  log('  what to test     ', w?.whatsNew ? `${w.whatsNew.length} chars` : '— MISSING');
}

async function main() {
  log(APPLY ? 'Applying changes.\n' : 'DRY RUN — pass --apply to write anything.\n');
  log('Copy lengths:');
  checkLengths();
  log('');

  await upsertBetaAppLocalization();
  const gotPhone = await upsertBetaAppReviewDetail();
  await upsertBuildLocalization();
  await report();

  if (!gotPhone) {
    log('\nStill needed: the App Review contact phone number. Re-run with it set —');
    log('  SCENTKEEP_REVIEW_PHONE="+1 555 123 4567" node scripts/testflight-info.js --apply');
    log('It is stored on the app record at Apple, not in this repo.');
  }
  log('\nNot done here on purpose: submitting for Beta App Review. That is an');
  log('outward-facing submission and it stays a human decision.');
}

main().catch((e) => {
  console.error('\nFAILED:', e.message);
  process.exitCode = 1;
});
