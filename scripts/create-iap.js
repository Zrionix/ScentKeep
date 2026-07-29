/* eslint-disable */
/**
 * Creates ScentKeep's in-app purchases in App Store Connect.
 *
 *   node scripts/create-iap.js          # dry run — shows what it would do
 *   node scripts/create-iap.js --apply  # actually create
 *
 * Idempotent: it reconciles against what already exists, so re-running never
 * duplicates a product. Safe to run after a partial failure.
 *
 * What it does NOT do: set prices. `POST /v1/subscriptionPrices` silently
 * creates a US-ONLY price — the product then displays a price but stays in
 * MISSING_METADATA, and the submission validator only says "You must add a
 * subscription price", which sends you looking in the wrong place. Pricing has
 * to go through the UI's "Recalculate prices for all countries or regions".
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const APP_ID = '6795710068';
const KEY_PATH = path.join(__dirname, '..', 'credentials', 'AuthKey_X25AAYH8QT.p8');
const KEY_ID = 'X25AAYH8QT';
const ISSUER = '905684d2-c99b-4bb1-91dc-98bcf84d2c81';
const APPLY = process.argv.includes('--apply');

const GROUP_REF = 'ScentKeep Premium';
const GROUP_DISPLAY = 'ScentKeep Premium';

// Apple caps the customer-facing DESCRIPTION at 55 characters and the display
// NAME at 30. These are validated below before any request goes out, because
// the API only reports the violation after it has already created the parent
// records — leaving a half-built product behind.
const MAX_DESCRIPTION = 55;
const MAX_DISPLAY_NAME = 30;

const SUBS = [
  {
    productId: 'scentkeep_premium_monthly',
    name: 'ScentKeep Premium Monthly',
    period: 'ONE_MONTH',
    displayName: 'Monthly',
    description: 'Unlimited wardrobe, bottle levels, full insights.',
  },
  {
    productId: 'scentkeep_premium_annual',
    name: 'ScentKeep Premium Annual',
    period: 'ONE_YEAR',
    displayName: 'Annual',
    description: 'Everything in Premium, billed once a year.',
  },
];

const LIFETIME = {
  productId: 'scentkeep_lifetime',
  name: 'ScentKeep Premium Lifetime',
  displayName: 'Lifetime',
  description: 'Every Premium feature, forever. One-time purchase.',
};

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt() {
  const now = Math.floor(Date.now() / 1000);
  const s =
    b64({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }) +
    '.' +
    b64({ iss: ISSUER, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' });
  const sig = crypto
    .sign('sha256', Buffer.from(s), { key: fs.readFileSync(KEY_PATH, 'utf8'), dsaEncoding: 'ieee-p1363' })
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
    const detail = json.errors?.[0];
    throw new Error(`${res.status} ${detail?.title ?? ''} — ${detail?.detail ?? text.slice(0, 200)}`);
  }
  return json;
}

const log = (...a) => console.log(...a);
const plan = (what) => log(`  ${APPLY ? 'CREATE' : 'would create'}  ${what}`);
const skip = (what) => log(`  exists      ${what}`);

/** Adds a localization only if one is missing, so a re-run repairs a product
 *  whose parent record was created before an earlier failure. */
async function ensureLocalization(kind, parentId, attrs) {
  // Subscriptions live under /v1; in-app purchases moved to /v2 and their
  // relationships are only reachable on that prefix.
  const listPath =
    kind === 'subscription'
      ? `/v1/subscriptions/${parentId}/subscriptionLocalizations`
      : `/v2/inAppPurchases/${parentId}/inAppPurchaseLocalizations`;
  const existing = await api('GET', listPath);
  if ((existing.data ?? []).some((l) => l.attributes.locale === attrs.locale)) {
    skip(`  localization ${attrs.locale}`);
    return;
  }
  plan(`  localization ${attrs.locale}`);
  if (!APPLY) return;

  const body =
    kind === 'subscription'
      ? {
          data: {
            type: 'subscriptionLocalizations',
            attributes: attrs,
            relationships: { subscription: { data: { type: 'subscriptions', id: parentId } } },
          },
        }
      : {
          data: {
            type: 'inAppPurchaseLocalizations',
            attributes: attrs,
            relationships: { inAppPurchaseV2: { data: { type: 'inAppPurchases', id: parentId } } },
          },
        };
  await api('POST', kind === 'subscription' ? '/v1/subscriptionLocalizations' : '/v1/inAppPurchaseLocalizations', body);
}

function validate() {
  const problems = [];
  for (const p of [...SUBS, LIFETIME]) {
    if (p.description.length > MAX_DESCRIPTION) {
      problems.push(`${p.productId}: description ${p.description.length}/${MAX_DESCRIPTION}`);
    }
    if (p.displayName.length > MAX_DISPLAY_NAME) {
      problems.push(`${p.productId}: display name ${p.displayName.length}/${MAX_DISPLAY_NAME}`);
    }
  }
  if (problems.length) {
    console.error('Copy exceeds App Store Connect limits:\n  ' + problems.join('\n  '));
    process.exit(1);
  }
}

async function main() {
  validate();
  log(APPLY ? 'Applying changes.\n' : 'DRY RUN — pass --apply to create.\n');

  // --- subscription group ---------------------------------------------------
  const groups = await api('GET', `/v1/apps/${APP_ID}/subscriptionGroups`);
  let group = (groups.data ?? []).find((g) => g.attributes.referenceName === GROUP_REF);

  if (group) {
    skip(`subscription group "${GROUP_REF}"`);
  } else {
    plan(`subscription group "${GROUP_REF}"`);
    if (APPLY) {
      group = (
        await api('POST', '/v1/subscriptionGroups', {
          data: {
            type: 'subscriptionGroups',
            attributes: { referenceName: GROUP_REF },
            relationships: { app: { data: { type: 'apps', id: APP_ID } } },
          },
        })
      ).data;

      // The group needs a customer-facing name or it blocks submission.
      await api('POST', '/v1/subscriptionGroupLocalizations', {
        data: {
          type: 'subscriptionGroupLocalizations',
          attributes: { name: GROUP_DISPLAY, locale: 'en-US' },
          relationships: { subscriptionGroup: { data: { type: 'subscriptionGroups', id: group.id } } },
        },
      });
    }
  }

  // --- auto-renewing subscriptions -----------------------------------------
  if (group) {
    const existing = await api('GET', `/v1/subscriptionGroups/${group.id}/subscriptions`);
    const byProduct = new Map((existing.data ?? []).map((s) => [s.attributes.productId, s]));

    for (const sub of SUBS) {
      let record = byProduct.get(sub.productId);

      if (record) {
        skip(`subscription ${sub.productId} (${record.attributes.state})`);
      } else {
        plan(`subscription ${sub.productId} — ${sub.period}`);
        if (APPLY) {
          record = (
            await api('POST', '/v1/subscriptions', {
              data: {
                type: 'subscriptions',
                attributes: {
                  name: sub.name,
                  productId: sub.productId,
                  subscriptionPeriod: sub.period,
                  familySharable: false,
                  // Same level for both durations: monthly and annual are the
                  // same tier of service, so switching between them is a
                  // crossgrade rather than an upgrade.
                  groupLevel: 1,
                },
                relationships: { group: { data: { type: 'subscriptionGroups', id: group.id } } },
              },
            })
          ).data;
        }
      }

      if (record) {
        await ensureLocalization('subscription', record.id, {
          name: sub.displayName,
          description: sub.description,
          locale: 'en-US',
        });
      }
    }
  }

  // --- lifetime (non-consumable) -------------------------------------------
  const iaps = await api('GET', `/v1/apps/${APP_ID}/inAppPurchasesV2`);
  const lifetime = (iaps.data ?? []).find((i) => i.attributes.productId === LIFETIME.productId);

  let lifetimeRecord = lifetime;
  if (lifetimeRecord) {
    skip(`non-consumable ${LIFETIME.productId} (${lifetimeRecord.attributes.state})`);
  } else {
    plan(`non-consumable ${LIFETIME.productId}`);
    if (APPLY) {
      // Apple is inconsistent here: the LIST endpoint is
      // /v1/apps/{id}/inAppPurchasesV2, but the CREATE endpoint is
      // /v2/inAppPurchases. Using the v1 path to POST returns a 404 whose
      // message ("path does not match a defined resource type") gives no hint
      // that the version prefix is the problem.
      lifetimeRecord = (
        await api('POST', '/v2/inAppPurchases', {
          data: {
            type: 'inAppPurchases',
            attributes: {
              name: LIFETIME.name,
              productId: LIFETIME.productId,
              inAppPurchaseType: 'NON_CONSUMABLE',
            },
            relationships: { app: { data: { type: 'apps', id: APP_ID } } },
          },
        })
      ).data;
    }
  }

  if (lifetimeRecord) {
    await ensureLocalization('inAppPurchase', lifetimeRecord.id, {
      name: LIFETIME.displayName,
      description: LIFETIME.description,
      locale: 'en-US',
    });
  }

  log('\nDone.');
  if (APPLY) {
    log('\nSTILL NEEDED IN THE UI (the API cannot do these correctly):');
    log('  1. Prices. Each subscription -> Subscription Prices -> View all ->');
    log('     Starting Price -> Edit Price -> "Recalculate prices for all');
    log('     countries or regions" -> set base price -> Confirm.');
    log('     Monthly $4.99 · Annual $24.99 · Lifetime $59.99');
    log('  2. A 30-day free-trial introductory offer on the ANNUAL subscription.');
    log('  3. A review screenshot on each product (Apple requires one).');
  }
}

main().catch((e) => {
  console.error('\nFAILED:', e.message);
  process.exitCode = 1;
});
