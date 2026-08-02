/* eslint-disable */
/**
 * Assembles a COMPLETE App Store review submission — and stops before sending it.
 *
 *   node scripts/assemble-submission.js          # dry run
 *   node scripts/assemble-submission.js --apply  # build the draft, do not submit
 *
 * Exists because the manual version of this went wrong. Version 1.0 was added
 * for review through the web UI, App Store Connect reported success, and it was
 * a success — it just contained one item. Both subscriptions, the non-consumable
 * and the subscription group were left behind, and the confirmation screen for a
 * one-item submission is indistinguishable from the one for a complete
 * submission.
 *
 * Assembling it in code removes the step a human can get wrong. It deliberately
 * does NOT press Submit: creating a draft is reversible, and sending an app to
 * Apple is a decision a person should make. Run this, read what it lists, then
 * submit from App Store Connect (or with --submit, if you would rather).
 *
 * Two things the API docs do not make obvious, both learned the hard way:
 *
 *   1. reviewSubmissionItems takes VERSION ids, not product ids. The
 *      `subscription` relationship does not exist and 409s; `subscriptionVersion`,
 *      `subscriptionGroupVersion` and `inAppPurchaseVersion` all do exist.
 *      Product ids and version ids look alike and are not interchangeable.
 *
 *   2. Each product's submittable version hangs off its own `/versions`
 *      relationship, and for in-app purchases that is only on the /v2 path —
 *      /v1/inAppPurchases/{id}/versions 404s.
 */
const { api, optional, APP_ID } = require('./asc-lib');

const SUBSCRIPTION_GROUP = '22271645';
const APPLY = process.argv.includes('--apply');
const SUBMIT = process.argv.includes('--submit');

/**
 * Version states this script is willing to work with.
 *
 * DEVELOPER_REJECTED means the DEVELOPER withdrew the submission, not that Apple
 * rejected anything; the version is as submittable as a fresh one.
 *
 * READY_FOR_REVIEW is here so a re-run is idempotent. Adding the version to a
 * draft moves it to READY_FOR_REVIEW, and without this the second run died with
 * "no submittable version" about the very version it had just queued — a script
 * that cannot be run twice is a script nobody trusts to run once.
 */
const SUBMITTABLE_VERSION_STATES = new Set([
  'PREPARE_FOR_SUBMISSION',
  'DEVELOPER_REJECTED',
  'REJECTED',
  'METADATA_REJECTED',
  'READY_FOR_REVIEW',
]);

/** A product/group version in this state still needs to go into a submission. */
const NEEDS_SUBMITTING = new Set(['PREPARE_FOR_SUBMISSION', 'REJECTED', 'DEVELOPER_ACTION_NEEDED']);

const log = (...a) => console.log(...a);
const act = (w) => log(`  ${APPLY ? 'DO      ' : 'would do'}  ${w}`);
const same = (w) => log(`  ok        ${w}`);

/** The submittable version behind one product or group, or null when it has
 *  nothing outstanding. */
async function versionOf(path, label, relationship, type) {
  const versions = (await api('GET', path)).data ?? [];
  const v = versions[0];
  if (!v) return null;
  if (!NEEDS_SUBMITTING.has(v.attributes.state)) {
    same(`${label} — already ${v.attributes.state}`);
    return null;
  }
  return { id: v.id, label, relationship, type, state: v.attributes.state };
}

async function collect() {
  const out = [];

  const subs = (await api('GET', `/v1/subscriptionGroups/${SUBSCRIPTION_GROUP}/subscriptions`)).data ?? [];
  for (const s of subs) {
    const v = await versionOf(
      `/v1/subscriptions/${s.id}/versions`,
      s.attributes.productId,
      'subscriptionVersion',
      'subscriptionVersions',
    );
    if (v) out.push(v);
  }

  const iaps = (await api('GET', `/v1/apps/${APP_ID}/inAppPurchasesV2`)).data ?? [];
  for (const i of iaps) {
    // /v2 only. The v1 path has no `versions` relationship at all.
    const v = await versionOf(
      `/v2/inAppPurchases/${i.id}/versions`,
      i.attributes.productId,
      'inAppPurchaseVersion',
      'inAppPurchaseVersions',
    );
    if (v) out.push(v);
  }

  // The item everyone forgets, and the one the web UI hides behind a separate
  // "Add for Review" button on a different page.
  const g = await versionOf(
    `/v1/subscriptionGroups/${SUBSCRIPTION_GROUP}/versions`,
    `subscription group ${SUBSCRIPTION_GROUP}`,
    'subscriptionGroupVersion',
    'subscriptionGroupVersions',
  );
  if (g) out.push(g);

  return out;
}

async function main() {
  log(APPLY ? 'Assembling the submission.\n' : 'DRY RUN — pass --apply to build the draft.\n');

  // --- the version ----------------------------------------------------------
  const versions = (await api('GET', `/v1/apps/${APP_ID}/appStoreVersions?limit=20`)).data ?? [];
  const version = versions.find((v) => SUBMITTABLE_VERSION_STATES.has(v.attributes.appStoreState));
  if (!version) {
    const seen = versions.map((v) => `${v.attributes.versionString}=${v.attributes.appStoreState}`);
    throw new Error(`no submittable version. Saw: ${seen.join(', ') || 'none'}`);
  }
  log(`Version ${version.attributes.versionString} — ${version.attributes.appStoreState}`);

  const build = await optional(`/v1/appStoreVersions/${version.id}/build`);
  if (!build) throw new Error('no build attached to the version — attach one before submitting');
  const b = await api('GET', `/v1/builds/${build.id}`);
  log(`Build ${b.data.attributes.version} — ${b.data.attributes.processingState}\n`);

  const products = await collect();

  // --- find or create the draft --------------------------------------------
  const existing = (await api('GET', `/v1/apps/${APP_ID}/reviewSubmissions?limit=10`)).data ?? [];
  let draft = existing.find((s) => s.attributes.state === 'READY_FOR_REVIEW');
  const inFlight = existing.find((s) => ['WAITING_FOR_REVIEW', 'IN_REVIEW'].includes(s.attributes.state));

  if (inFlight) {
    throw new Error(
      `submission ${inFlight.id} is already ${inFlight.attributes.state}. ` +
        'Items cannot be added once it has been sent — cancel it first if it is incomplete.',
    );
  }

  log('');
  if (draft) {
    same(`draft submission ${draft.id.slice(0, 8)}`);
  } else {
    act('create draft submission');
    if (APPLY) {
      draft = (
        await api('POST', '/v1/reviewSubmissions', {
          data: {
            type: 'reviewSubmissions',
            attributes: { platform: 'IOS' },
            relationships: { app: { data: { type: 'apps', id: APP_ID } } },
          },
        })
      ).data;
    }
  }

  // --- add every item -------------------------------------------------------
  // `include` again, and for the same reason it was needed in the report: with
  // no include, /items returns bare {state} objects, every relationship reads
  // undefined, and this concluded the version was missing from a draft that
  // already had it — then 409'd trying to add it twice.
  const ITEM_RELS = ['appStoreVersion', 'subscriptionVersion', 'subscriptionGroupVersion', 'inAppPurchaseVersion'];
  const already = draft
    ? (await api('GET', `/v1/reviewSubmissions/${draft.id}/items?limit=50&include=${ITEM_RELS.join(',')}`)).data ?? []
    : [];
  const haveVersion = already.some((i) => i.relationships?.appStoreVersion?.data?.id === version.id);

  const wanted = [
    ...(haveVersion
      ? []
      : [
          {
            id: version.id,
            label: `app version ${version.attributes.versionString}`,
            relationship: 'appStoreVersion',
            type: 'appStoreVersions',
          },
        ]),
    ...products,
  ];

  if (haveVersion) same(`app version ${version.attributes.versionString} already in the draft`);

  for (const w of wanted) {
    act(`add ${w.label}`);
    if (!APPLY) continue;
    await api('POST', '/v1/reviewSubmissionItems', {
      data: {
        type: 'reviewSubmissionItems',
        relationships: {
          reviewSubmission: { data: { type: 'reviewSubmissions', id: draft.id } },
          [w.relationship]: { data: { type: w.type, id: w.id } },
        },
      },
    });
  }

  if (!APPLY) {
    log(`\nWould end up with ${already.length + wanted.length} item(s). Nothing was created.`);
    return;
  }

  // --- report, then stop ----------------------------------------------------
  // `include` is not optional here. Without it /items returns bare {state}
  // objects with NO relationships, so the report prints "undefined" for every
  // row and tells you nothing about what is actually in the submission.
  const rels = ['appStoreVersion', 'subscriptionVersion', 'subscriptionGroupVersion', 'inAppPurchaseVersion'];
  const final =
    (await api('GET', `/v1/reviewSubmissions/${draft.id}/items?limit=50&include=${rels.join(',')}`)).data ?? [];

  log(`\nDraft ${draft.id} now carries ${final.length} item(s):`);
  for (const i of final) {
    const [name, ref] = Object.entries(i.relationships ?? {}).find(([, v]) => v.data) ?? [];
    log(`  ${String(i.attributes.state).padEnd(18)} ${name ?? '?'} ${ref?.data?.id?.slice(0, 8) ?? ''}`);
  }

  if (!SUBMIT) {
    log('\nNOT submitted — that is deliberate.');
    log('Check it with:  npm run check:submission');
    log('Then submit from App Store Connect, or re-run with --apply --submit.');
    return;
  }

  log('\nSubmitting.');
  await api('PATCH', `/v1/reviewSubmissions/${draft.id}`, {
    data: { type: 'reviewSubmissions', id: draft.id, attributes: { submitted: true } },
  });
  const after = await api('GET', `/v1/reviewSubmissions/${draft.id}`);
  log(`Submission is now ${after.data.attributes.state}.`);
}

main().catch((e) => {
  console.error('\nFAILED:', e.message);
  process.exitCode = 1;
});
