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
const IN_FLIGHT = new Set(['WAITING_FOR_REVIEW', 'IN_REVIEW', 'PENDING_DEVELOPER_RELEASE']);
const DONE = new Set(['APPROVED', 'DEVELOPER_REMOVED_FROM_SALE', 'READY_FOR_SALE']);

async function products() {
  const subs = (await api('GET', `/v1/subscriptionGroups/${SUBSCRIPTION_GROUP}/subscriptions`)).data ?? [];
  const iaps = (await api('GET', `/v1/apps/${APP_ID}/inAppPurchasesV2`)).data ?? [];
  return [
    ...subs.map((s) => ({ kind: 'subscription', id: s.id, ...s.attributes })),
    ...iaps.map((i) => ({ kind: 'non-consumable', id: i.id, ...i.attributes })),
  ];
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

  // --- the products ---------------------------------------------------------
  const all = await products();
  console.log('');
  for (const p of all) {
    const label = `${p.productId} (${p.kind})`;
    if (LEFT_BEHIND.has(p.state)) bad(`${label} is ${p.state} — NOT in any submission`);
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
    const items = (await api('GET', `/v1/reviewSubmissions/${s.id}/items?limit=50`)).data ?? [];
    console.log(`  submission ${s.id.slice(0, 8)} — ${s.attributes.state}, ${items.length} item(s)`);

    // THE CHECK THIS SCRIPT EXISTS FOR. One item means the version went alone.
    const leftBehind = all.filter((p) => LEFT_BEHIND.has(p.state));
    if (leftBehind.length > 0) {
      bad(
        `submission carries ${items.length} item(s) but ${leftBehind.length} product(s) are still behind: ` +
          leftBehind.map((p) => p.productId).join(', '),
      );
      console.log('           The first submission must include the app version, EVERY subscription,');
      console.log('           AND the subscription group — the group has its own Add for Review button.');
      console.log('           reviewSubmissionItems has no `subscription` relationship, so this cannot');
      console.log('           be repaired by API: cancel, re-add all of it in the UI, submit again.');
    } else if (items.length < 2 && all.length > 0) {
      warn(`only ${items.length} item(s) in the submission — expected the version plus the products`);
    } else {
      ok(`submission carries ${items.length} items and no product is left behind`);
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
