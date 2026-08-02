/* eslint-disable */
/**
 * Asserts that an App Store review submission contains EVERYTHING it needs to.
 *
 *   node scripts/check-submission.js
 *
 * Written because a submission that succeeded was wrong. Version 1.0 went to
 * review reporting success, and it did succeed — it just carried one item, the
 * app version, leaving both subscriptions, the non-consumable and the
 * subscription group behind. Every product page said "ready". A listing audit
 * said "nothing is blocking submission". Both were true and both were
 * misleading, because completeness of the PARTS is not completeness of the
 * WHOLE and nothing was checking the whole.
 *
 * Run it before pressing Submit to see what is about to be left out, and again
 * afterwards to prove it was not. Exit code 0 only when nothing is outstanding.
 *
 * HOW IT DECIDES, and why the obvious way is wrong:
 *
 * Membership is read from the submission's ITEMS, by version id — not inferred
 * from each product's state. The first draft of this script inferred it from
 * state and produced four confident false positives against a genuinely
 * complete draft, because a product's rollup state stays READY_TO_SUBMIT until
 * the submission is actually sent. State answers "is this ready"; only the item
 * list answers "is this coming with us", and that is the question.
 *
 * The relationships are also invisible unless you ask: /items returns bare
 * `{state}` objects with no relationships at all until `?include=` names each
 * one explicitly.
 */
const { api, optional, APP_ID } = require('./asc-lib');

const SUBSCRIPTION_GROUP = '22271645';

/** Every relationship a submission item can carry. `include` needs all of them
 *  spelled out or the items come back with no relationships whatsoever. */
const ITEM_RELATIONSHIPS = [
  'appStoreVersion',
  'subscriptionVersion',
  'subscriptionGroupVersion',
  'inAppPurchaseVersion',
];

/** Submission states that mean "this one is over, ignore it". */
const CLOSED = new Set(['COMPLETE', 'CANCELING']);
/** Submission states that mean items can no longer be added. */
const SEALED = new Set(['WAITING_FOR_REVIEW', 'IN_REVIEW']);

/** App version states that still need to go through review. */
const VERSION_NEEDS_REVIEW = new Set([
  'PREPARE_FOR_SUBMISSION',
  'DEVELOPER_REJECTED',
  'REJECTED',
  'METADATA_REJECTED',
  'INVALID_BINARY',
  'READY_FOR_REVIEW',
]);

let problems = 0;
const ok = (m) => console.log(`  ok       ${m}`);
const bad = (m) => {
  console.log(`  PROBLEM  ${m}`);
  problems += 1;
};
const note = (m) => console.log(`  note     ${m}`);

/**
 * Everything that must travel with the app version, each resolved to the
 * VERSION id a submission item actually references.
 *
 * The subscription GROUP is in here deliberately. It was missing from the first
 * draft of this script — the check written to catch the four-items trap checked
 * three of the four — and it is the item the web UI hides behind its own
 * "Add for Review" button on a different page.
 */
async function required() {
  const out = [];

  const subs = (await api('GET', `/v1/subscriptionGroups/${SUBSCRIPTION_GROUP}/subscriptions`)).data ?? [];
  for (const s of subs) {
    const v = ((await api('GET', `/v1/subscriptions/${s.id}/versions`)).data ?? [])[0];
    out.push({ label: s.attributes.productId, kind: 'subscription', versionId: v?.id, state: v?.attributes.state });
  }

  const iaps = (await api('GET', `/v1/apps/${APP_ID}/inAppPurchasesV2`)).data ?? [];
  for (const i of iaps) {
    // /v2 only — /v1/inAppPurchases/{id}/versions has no such relationship.
    const v = ((await api('GET', `/v2/inAppPurchases/${i.id}/versions`)).data ?? [])[0];
    out.push({ label: i.attributes.productId, kind: 'non-consumable', versionId: v?.id, state: v?.attributes.state });
  }

  const g = ((await api('GET', `/v1/subscriptionGroups/${SUBSCRIPTION_GROUP}/versions`)).data ?? [])[0];
  out.push({
    label: `subscription group ${SUBSCRIPTION_GROUP}`,
    kind: 'subscription group',
    versionId: g?.id,
    state: g?.attributes.state,
  });

  return out;
}

/** The version ids a submission is actually carrying. */
async function carriedBy(submissionId) {
  const items =
    (await api(
      'GET',
      `/v1/reviewSubmissions/${submissionId}/items?limit=50&include=${ITEM_RELATIONSHIPS.join(',')}`,
    )).data ?? [];

  const ids = new Set();
  for (const item of items) {
    for (const rel of ITEM_RELATIONSHIPS) {
      const d = item.relationships?.[rel]?.data;
      if (d) ids.add(d.id);
    }
  }
  return { ids, count: items.length };
}

async function main() {
  console.log('Checking what the submission actually contains.\n');

  const versions = (await api('GET', `/v1/apps/${APP_ID}/appStoreVersions?limit=20`)).data ?? [];
  const version = versions.find((v) => VERSION_NEEDS_REVIEW.has(v.attributes.appStoreState)) ?? versions[0];
  if (!version) {
    bad('no app version record exists');
    process.exitCode = 1;
    return;
  }
  console.log(`Version ${version.attributes.versionString} — ${version.attributes.appStoreState}\n`);

  const build = await optional(`/v1/appStoreVersions/${version.id}/build`);
  if (build) {
    const b = await api('GET', `/v1/builds/${build.id}`);
    ok(`build ${b.data.attributes.version} attached (${b.data.attributes.processingState})`);
  } else {
    // The UI hides this well, because TestFlight lists the build regardless.
    bad('no build attached to the version — submission will be refused');
  }

  const need = await required();
  const missingVersionId = need.filter((n) => !n.versionId);
  for (const m of missingVersionId) bad(`${m.label} has no version record at all`);

  // --- the submission -------------------------------------------------------
  const submissions = (await api('GET', `/v1/apps/${APP_ID}/reviewSubmissions?limit=10`)).data ?? [];
  const live = submissions.filter((s) => !CLOSED.has(s.attributes.state));

  console.log('');
  if (live.length === 0) {
    note('no submission exists yet — nothing has been assembled');
    for (const n of need) note(`  ${n.label} (${n.kind}) is ${n.state}, not yet in a submission`);
    console.log('\n  Assemble one with:  node scripts/assemble-submission.js --apply');
    process.exitCode = problems === 0 ? 0 : 1;
    return;
  }

  for (const s of live) {
    const state = s.attributes.state;
    const { ids, count } = await carriedBy(s.id);
    console.log(`  submission ${s.id.slice(0, 8)} — ${state}, ${count} item(s)`);

    if (!ids.has(version.id)) bad(`  the app version itself is NOT in this submission`);
    else ok(`  app version ${version.attributes.versionString}`);

    // THE CHECK THIS SCRIPT EXISTS FOR.
    for (const n of need) {
      if (n.versionId && ids.has(n.versionId)) ok(`  ${n.label} (${n.kind})`);
      else bad(`  ${n.label} (${n.kind}) is NOT in this submission — it will be left behind`);
    }

    if (problems > 0 && SEALED.has(state)) {
      console.log('\n           This submission is already sent; items cannot be added.');
      console.log('           Cancel it, run scripts/assemble-submission.js --apply, and submit again.');
    } else if (problems > 0) {
      console.log('\n           Still a draft, so this is repairable:');
      console.log('             node scripts/assemble-submission.js --apply');
    }
  }

  console.log('');
  console.log(problems === 0 ? 'Everything is travelling together.' : `${problems} problem(s).`);
  process.exitCode = problems === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error('\nFAILED:', e.message);
  process.exitCode = 2;
});
