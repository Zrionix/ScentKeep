/* eslint-disable */
/**
 * Asserts that an App Store submission contains EVERYTHING it needs to.
 *
 *   node scripts/check-submission.js
 *
 * Written because a submission that succeeded was wrong. Version 1.0 went to
 * review reporting success, and it did succeed — it just contained one item, the
 * app version, with all three in-app purchases silently left behind at
 * READY_TO_SUBMIT. Every individual product page said "ready". A listing audit
 * said "nothing is blocking submission". Both were true, and both were
 * misleading, because completeness of the PARTS is not completeness of the
 * WHOLE, and nothing checked the whole.
 *
 * So this checks the whole. Run it before pressing Submit to see what is about
 * to be left out, and again afterwards to prove it was not.
 *
 * Exit code 0 only when there is genuinely nothing outstanding.
 */
const { api, optional, APP_ID } = require('./asc-lib');

const SUBSCRIPTION_GROUP = '22271645';

let problems = 0;
let warnings = 0;

const ok = (m) => console.log(`  ok       ${m}`);
const bad = (m) => {
  console.log(`  PROBLEM  ${m}`);
  problems += 1;
};
const warn = (m) => {
  console.log(`  note     ${m}`);
  warnings += 1;
};

/**
 * A product is "left behind" when it is ready but not travelling with a
 * submission. READY_TO_SUBMIT sounds like success and is precisely the state
 * that got us here: it means ready TO submit, not submitted.
 */
const LEFT_BEHIND = new Set(['READY_TO_SUBMIT', 'MISSING_METADATA', 'DEVELOPER_ACTION_NEEDED']);

/**
 * The group version's own vocabulary. It says PREPARE_FOR_SUBMISSION where a
 * product says READY_TO_SUBMIT, so this deliberately does NOT share the set
 * above — a subscription VERSION also sits at PREPARE_FOR_SUBMISSION perfectly
 * legitimately while its product rollup reads READY_TO_SUBMIT, and conflating
 * the two levels produces confident nonsense.
 */
const GROUP_LEFT_BEHIND = new Set(['PREPARE_FOR_SUBMISSION', 'DEVELOPER_ACTION_NEEDED', 'REJECTED']);

const IN_FLIGHT = new Set(['WAITING_FOR_REVIEW', 'IN_REVIEW', 'PENDING_DEVELOPER_RELEASE']);
const DONE = new Set(['APPROVED', 'DEVELOPER_REMOVED_FROM_SALE', 'READY_FOR_SALE']);

/**
 * Everything that has to travel with the version, INCLUDING the subscription
 * group.
 *
 * The group was missing from the first version of this script — the check
 * written specifically to catch the four-items trap checked three of the four
 * items. It would have gone green the moment the products moved and the group
 * did not, which is the exact shape of the bug it exists to prevent.
 *
 * The group's readiness lives on its VERSION, not on the group itself:
 * `/v1/subscriptionGroups/{id}` returns only a reference name. Note also that
 * group versions and product rollups use different vocabularies for the same
 * idea — a group version sits at PREPARE_FOR_SUBMISSION while a ready product
 * reads READY_TO_SUBMIT — so they cannot share one state table.
 */
async function items() {
  const subs = (await api('GET', `/v1/subscriptionGroups/${SUBSCRIPTION_GROUP}/subscriptions`)).data ?? [];
  const iaps = (await api('GET', `/v1/apps/${APP_ID}/inAppPurchasesV2`)).data ?? [];
  const groupVersions = (await api('GET', `/v1/subscriptionGroups/${SUBSCRIPTION_GROUP}/versions`)).data ?? [];

  return [
    ...subs.map((s) => ({ kind: 'subscription', id: s.id, ...s.attributes })),
    ...iaps.map((i) => ({ kind: 'non-consumable', id: i.id, ...i.attributes })),
    ...groupVersions.slice(0, 1).map((g) => ({
      kind: 'subscription group',
      id: g.id,
      productId: `subscription group ${SUBSCRIPTION_GROUP}`,
      state: g.attributes.state,
      isGroup: true,
    })),
  ];
}

/** True when this row is ready but not travelling with a submission. */
function leftBehind(row) {
  return row.isGroup ? GROUP_LEFT_BEHIND.has(row.state) : LEFT_BEHIND.has(row.state);
}

async function main() {
  console.log('Checking what the submission actually contains.\n');

  // --- the version ----------------------------------------------------------
  const versions = (await api('GET', `/v1/apps/${APP_ID}/appStoreVersions?limit=10`)).data ?? [];
  const version = versions.find((v) => !DONE.has(v.attributes.appStoreState)) ?? versions[0];
  if (!version) {
    bad('no app version record exists');
    return;
  }

  const state = version.attributes.appStoreState;
  console.log(`Version ${version.attributes.versionString} — ${state}\n`);

  const build = await optional(`/v1/appStoreVersions/${version.id}/build`);
  if (build) {
    const b = await api('GET', `/v1/builds/${build.id}`);
    ok(`build ${b.data.attributes.version} attached (${b.data.attributes.processingState})`);
  } else {
    // A version with no build cannot be submitted, and the UI hides this well
    // because TestFlight lists the build regardless.
    bad('no build attached to the version — submission will be refused');
  }

  // --- the products, and the group ------------------------------------------
  const all = await items();
  console.log('');
  for (const p of all) {
    const label = `${p.productId} (${p.kind})`;
    if (leftBehind(p)) bad(`${label} is ${p.state} — NOT in any submission`);
    else if (IN_FLIGHT.has(p.state)) ok(`${label} is ${p.state}`);
    else if (DONE.has(p.state)) ok(`${label} is ${p.state}`);
    else warn(`${label} is ${p.state} — unrecognised, check it by hand`);
  }

  // --- the submission itself ------------------------------------------------
  const submissions = (await api('GET', `/v1/apps/${APP_ID}/reviewSubmissions?limit=10`)).data ?? [];
  const live = submissions.filter((s) => !['COMPLETE', 'CANCELING'].includes(s.attributes.state));

  console.log('');
  if (live.length === 0) {
    warn('no submission is in flight — nothing has been submitted yet');
  }

  for (const s of live) {
    const submitted = (await api("GET", `/v1/reviewSubmissions/${s.id}/items?limit=50`)).data ?? [];
    console.log(`  submission ${s.id.slice(0, 8)} — ${s.attributes.state}, ${submitted.length} item(s)`);

    // THE CHECK THIS SCRIPT EXISTS FOR. One item means the version went alone.
    const behind = all.filter(leftBehind);
    const expected = all.length + 1; // every product and the group, plus the version

    if (behind.length > 0) {
      bad(
        `submission carries ${submitted.length} item(s) but ${behind.length} are still behind: ` +
          behind.map((p) => p.productId).join(', '),
      );
      console.log('           The first submission is the app version, EVERY subscription, the');
      console.log('           non-consumable, AND the subscription group — the group has its own');
      console.log('           "Add for Review" button on the group page, not the version page.');
      console.log('           Repairable by API while the submission is still READY_FOR_REVIEW:');
      console.log('           POST /v1/reviewSubmissionItems using the VERSION relationships');
      console.log('           (subscriptionVersion / subscriptionGroupVersion / inAppPurchaseVersion).');
      console.log('           The product-level `subscription` relationship does not exist.');
    } else if (submitted.length < expected) {
      // Not a warning. Everything reading ready while the submission is short is
      // precisely the state that shipped a one-item submission last time.
      bad(
        `submission carries ${submitted.length} item(s), expected ${expected} ` +
          `(the version plus ${all.length} product/group items)`,
      );
    } else {
      ok(`submission carries ${submitted.length} items and nothing is left behind`);
    }
  }

  console.log('');
  if (problems === 0 && warnings === 0) console.log('Everything is travelling together.');
  else console.log(`${problems} problem(s), ${warnings} note(s).`);
  process.exitCode = problems === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error('\nFAILED:', e.message);
  process.exitCode = 2;
});
