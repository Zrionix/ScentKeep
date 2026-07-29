/* eslint-disable */
/**
 * Clears the last two things standing between the IAP products and
 * READY_TO_SUBMIT: territory availability, and the App Review screenshot.
 *
 *   node scripts/finish-iap.js          # dry run
 *   node scripts/finish-iap.js --apply
 *
 * Prices are NOT handled here — see the header of create-iap.js for why they
 * have to go through the UI. Availability and screenshots, by contrast, the API
 * does correctly, and the screenshot upload is a four-step reserve/PUT/commit
 * dance that is genuinely unpleasant to do by hand three times.
 *
 * Idempotent: re-running skips anything already in place.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const APP_ID = '6795710068';
const KEY_PATH = path.join(__dirname, '..', 'credentials', 'AuthKey_X25AAYH8QT.p8');
const KEY_ID = 'X25AAYH8QT';
const ISSUER = '905684d2-c99b-4bb1-91dc-98bcf84d2c81';
const APPLY = process.argv.includes('--apply');
/** Re-upload the App Review screenshot even when one is already attached. Worth
 *  running whenever the paywall itself changes — a reviewer looking at last
 *  month's paywall is being shown the wrong product. */
const REFRESH_SHOTS = process.argv.includes('--refresh-screenshots');

const SCREENSHOT = path.join(__dirname, '..', 'store', 'screenshots', '06-paywall.png');

const ANNUAL = '6795742609';
const SUBSCRIPTIONS = [ANNUAL, '6795742385'];
const IAPS = ['6795743065'];

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
const plan = (w) => log(`  ${APPLY ? 'DO      ' : 'would do'}  ${w}`);
const skip = (w) => log(`  exists    ${w}`);

/** Every territory Apple sells in, so "available everywhere" really means it. */
async function allTerritories() {
  const out = [];
  let next = '/v1/territories?limit=200';
  while (next) {
    const page = await api('GET', next.replace('https://api.appstoreconnect.apple.com', ''));
    out.push(...page.data.map((t) => t.id));
    next = page.links?.next ?? null;
  }
  return out;
}

async function ensureAvailability(kind, id, territories) {
  const detailPath =
    kind === 'subscription'
      ? `/v1/subscriptions/${id}/subscriptionAvailability`
      : `/v2/inAppPurchases/${id}/inAppPurchaseAvailability`;

  // A 404 here means "no availability record yet" — Apple returns NOT_FOUND
  // rather than a null body for these two relationships, unlike the screenshot
  // relationship, which returns 200 with data: null. Both mean "unset".
  let existing = null;
  try {
    existing = (await api('GET', detailPath)).data;
  } catch (e) {
    if (!/^404/.test(e.message)) throw e;
  }
  if (existing) {
    skip(`availability on ${id}`);
    return;
  }

  plan(`availability on ${id} — ${territories.length} territories`);
  if (!APPLY) return;

  const type = kind === 'subscription' ? 'subscriptionAvailabilities' : 'inAppPurchaseAvailabilities';
  const parentRel =
    kind === 'subscription'
      ? { subscription: { data: { type: 'subscriptions', id } } }
      : { inAppPurchase: { data: { type: 'inAppPurchases', id } } };

  await api('POST', kind === 'subscription' ? '/v1/subscriptionAvailabilities' : '/v1/inAppPurchaseAvailabilities', {
    data: {
      type,
      // New App Store territories should inherit the product automatically —
      // otherwise every future Apple expansion silently ships without a paywall.
      attributes: { availableInNewTerritories: true },
      relationships: {
        ...parentRel,
        availableTerritories: { data: territories.map((t) => ({ type: 'territories', id: t })) },
      },
    },
  });
}

/**
 * Uploads the App Review screenshot. Four steps, and step 3 is a raw PUT to a
 * signed URL that must NOT carry the Authorization header — sending it makes
 * Apple's storage layer reject the upload with an opaque 403.
 */
async function ensureScreenshot(kind, id, bytes, checksum) {
  const relPath =
    kind === 'subscription'
      ? `/v1/subscriptions/${id}/appStoreReviewScreenshot`
      : `/v2/inAppPurchases/${id}/appStoreReviewScreenshot`;

  const current = (await api('GET', relPath)).data;
  if (current && !REFRESH_SHOTS) {
    skip(`review screenshot on ${id}`);
    return;
  }

  // Re-uploading means deleting first: the relationship holds at most one
  // screenshot, and POSTing a second returns a conflict rather than replacing.
  if (current) {
    plan(`replace review screenshot on ${id}`);
    if (APPLY) await api('DELETE', `/v1/${current.type}/${current.id}`);
  }

  if (!current) plan(`review screenshot on ${id} — ${path.basename(SCREENSHOT)}`);
  if (!APPLY) return;

  const type =
    kind === 'subscription'
      ? 'subscriptionAppStoreReviewScreenshots'
      : 'inAppPurchaseAppStoreReviewScreenshots';
  const parentRel =
    kind === 'subscription'
      ? { subscription: { data: { type: 'subscriptions', id } } }
      : { inAppPurchaseV2: { data: { type: 'inAppPurchases', id } } };

  const created = await api(
    'POST',
    kind === 'subscription'
      ? '/v1/subscriptionAppStoreReviewScreenshots'
      : '/v1/inAppPurchaseAppStoreReviewScreenshots',
    {
      data: {
        type,
        attributes: { fileName: path.basename(SCREENSHOT), fileSize: bytes.length },
        relationships: parentRel,
      },
    },
  );

  const asset = created.data;
  for (const op of asset.attributes.uploadOperations ?? []) {
    const headers = {};
    for (const h of op.requestHeaders ?? []) headers[h.name] = h.value;
    const res = await fetch(op.url, {
      method: op.method,
      headers,
      body: bytes.subarray(op.offset, op.offset + op.length),
    });
    if (!res.ok) throw new Error(`upload chunk failed: ${res.status} ${await res.text()}`);
  }

  await api('PATCH', `/v1/${type}/${asset.id}`, {
    data: { type, id: asset.id, attributes: { uploaded: true, sourceFileChecksum: checksum } },
  });
}

/**
 * The 30-day free trial on the annual plan.
 *
 * An introductory offer is per-territory — `territory` is a REQUIRED
 * relationship, so "available everywhere" means 175 separate offer rows, which
 * is exactly what the UI's country picker creates behind the scenes. Existing
 * rows are read first so a re-run only fills the gaps left by a partial failure.
 */
async function ensureIntroOffer(id, territories) {
  const existing = await api(
    'GET',
    `/v1/subscriptions/${id}/introductoryOffers?limit=200&include=territory`,
  );
  const have = new Set(
    (existing.included ?? []).filter((i) => i.type === 'territories').map((i) => i.id),
  );
  const missing = territories.filter((t) => !have.has(t));

  if (!missing.length) {
    skip(`introductory offer on ${id} (${have.size} territories)`);
    return;
  }

  plan(`introductory offer on ${id} — 1 month free trial, ${missing.length} territories`);
  if (!APPLY) return;

  const create = (territory) =>
    api('POST', '/v1/subscriptionIntroductoryOffers', {
      data: {
        type: 'subscriptionIntroductoryOffers',
        attributes: { offerMode: 'FREE_TRIAL', duration: 'ONE_MONTH', numberOfPeriods: 1 },
        relationships: {
          subscription: { data: { type: 'subscriptions', id } },
          territory: { data: { type: 'territories', id: territory } },
        },
      },
    });

  // Small concurrency: 175 sequential round-trips to Cupertino takes minutes,
  // and firing all of them at once earns a 429.
  const BATCH = 8;
  for (let i = 0; i < missing.length; i += BATCH) {
    await Promise.all(missing.slice(i, i + BATCH).map(create));
    process.stdout.write(`\r            ${Math.min(i + BATCH, missing.length)}/${missing.length}`);
  }
  process.stdout.write('\n');
}

async function state(kind, id) {
  const r = await api('GET', kind === 'subscription' ? `/v1/subscriptions/${id}` : `/v2/inAppPurchases/${id}`);
  return `${r.data.attributes.productId.padEnd(28)} ${r.data.attributes.state}`;
}

async function main() {
  log(APPLY ? 'Applying changes.\n' : 'DRY RUN — pass --apply to change anything.\n');

  const bytes = fs.readFileSync(SCREENSHOT);
  const checksum = crypto.createHash('md5').update(bytes).digest('hex');
  const territories = await allTerritories();
  log(`Screenshot: ${path.basename(SCREENSHOT)} (${(bytes.length / 1024).toFixed(0)} KB)`);
  log(`Territories: ${territories.length}\n`);

  for (const id of SUBSCRIPTIONS) {
    await ensureAvailability('subscription', id, territories);
    await ensureScreenshot('subscription', id, bytes, checksum);
  }
  for (const id of IAPS) {
    await ensureAvailability('iap', id, territories);
    await ensureScreenshot('iap', id, bytes, checksum);
  }

  // Annual only. A trial on both plans would let someone take the free month on
  // monthly and never see the annual price, which is the opposite of the point.
  await ensureIntroOffer(ANNUAL, territories);

  log('\nState now:');
  for (const id of SUBSCRIPTIONS) log('  ' + (await state('subscription', id)));
  for (const id of IAPS) log('  ' + (await state('iap', id)));
}

main().catch((e) => {
  console.error('\nFAILED:', e.message);
  process.exitCode = 1;
});
