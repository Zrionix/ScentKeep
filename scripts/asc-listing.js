/* eslint-disable */
/**
 * Pushes the whole App Store listing into App Store Connect.
 *
 *   node scripts/asc-listing.js          # dry run — prints what would change
 *   node scripts/asc-listing.js --apply
 *
 * The copy itself lives in store/aso-metadata.md and is PARSED from there rather
 * than duplicated here, so `npm run check:aso` is checking the same bytes that
 * get uploaded. Two sources of truth for store copy is how an app ends up
 * shipping a description that promises a feature it does not have.
 *
 * Idempotent: every step reconciles against what already exists.
 *
 * What this does NOT do, on purpose:
 *   - the App Privacy questionnaire (see asc-privacy notes in HUMAN-checklist)
 *   - press Submit for Review. That is an outward-facing, hard-to-reverse
 *     action and it stays a human decision.
 */
const fs = require('node:fs');
const path = require('node:path');
const { APP_ID, api, optional, uploadAsset } = require('./asc-lib');

const APPLY = process.argv.includes('--apply');
const LOCALE = 'en-US';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'store', 'screenshots');
const ASO = path.join(__dirname, '..', 'store', 'aso-metadata.md');

/**
 * Version states whose metadata can still be edited.
 *
 * DEVELOPER_REJECTED belongs here and is easy to miss: it means the DEVELOPER
 * withdrew the submission, not that Apple rejected anything, and the version is
 * every bit as editable as a fresh one.
 */
const EDITABLE_STATES = new Set([
  'PREPARE_FOR_SUBMISSION',
  'DEVELOPER_REJECTED',
  'REJECTED',
  'METADATA_REJECTED',
  'INVALID_BINARY',
]);

const COPYRIGHT = `${new Date().getFullYear()} Zrionix Technology, Inc`;
const PRIMARY_CATEGORY = 'LIFESTYLE';
const SECONDARY_CATEGORY = 'UTILITIES';

/**
 * The 6.9" iPhone slot. Apple never renamed the enum when the 6.9" device
 * arrived, so 1320x2868 assets go into APP_IPHONE_67 — the display type whose
 * name says 6.7". Uploading them to a set named after their real size is not
 * possible, because no such set exists.
 */
const DISPLAY_TYPE = 'APP_IPHONE_67';
const EXPECTED_SIZE = { width: 1320, height: 2868 };

/**
 * The listing order. Only the first three appear on the App Store install
 * sheet, so the reason to open the app daily leads, the shelf follows, and the
 * paid payoff is third.
 */
const SCREENSHOTS = [
  '01b-today.png',
  '01-wardrobe.png',
  '03-insights.png',
  '02-diary.png',
  '05-bottle.png',
  '09-share.png',
  '04-log-sotd.png',
  '06-paywall.png',
];

/**
 * 4+ — the honest answer for a catalogue of consumer products.
 *
 * Every field is stated explicitly rather than left null. Apple treats an unset
 * field as an unanswered question and blocks submission on it, and "we didn't
 * think about it" is not a thing you want a reviewer to infer.
 */
const AGE_RATING = {
  alcoholTobaccoOrDrugUseOrReferences: 'NONE',
  contests: 'NONE',
  gamblingSimulated: 'NONE',
  gambling: false,
  gunsOrOtherWeapons: 'NONE',
  horrorOrFearThemes: 'NONE',
  matureOrSuggestiveThemes: 'NONE',
  medicalOrTreatmentInformation: 'NONE',
  profanityOrCrudeHumor: 'NONE',
  sexualContentGraphicAndNudity: 'NONE',
  sexualContentOrNudity: 'NONE',
  violenceCartoonOrFantasy: 'NONE',
  violenceRealistic: 'NONE',
  violenceRealisticProlongedGraphicOrSadistic: 'NONE',
  // A fragrance catalogue is not a health app and makes no wellness claims.
  healthOrWellnessTopics: false,
  // No ads, no loot boxes, no in-app browser, no chat, no social feed, and
  // nothing a user writes is ever shown to another user.
  advertising: false,
  lootBox: false,
  unrestrictedWebAccess: false,
  messagingAndChat: false,
  socialMedia: false,
  userGeneratedContent: false,
  // Not aimed at children, so no Kids category band and no parental gate.
  kidsAgeBand: null,
  parentalControls: false,
  // Apple's newer age-assurance question, and it is a BOOLEAN despite every
  // neighbouring field being a NONE/INFREQUENT/FREQUENT enum. ScentKeep asks
  // nobody's age and verifies nobody's age, so: false.
  ageAssurance: false,
};

const REVIEW_DETAIL = {
  contactFirstName: 'Nathan',
  contactLastName: 'Zweers',
  contactEmail: 'nathan@zrionix.dev',
  contactPhone: process.env.SCENTKEEP_REVIEW_PHONE || null,
  // There is no login. Saying so here saves a reviewer looking for one.
  demoAccountRequired: false,
  demoAccountName: null,
  demoAccountPassword: null,
};

// --- copy, read from the file the ASO check validates -----------------------

/** Pulls the first fenced code block after a heading. Mirrors check-aso.js, so
 *  the two cannot disagree about what the copy actually is. */
function blockAfter(md, heading) {
  const idx = md.indexOf(heading);
  if (idx === -1) throw new Error(`store/aso-metadata.md has no section "${heading}"`);
  const fence = md.indexOf('```', idx);
  const start = md.indexOf('\n', fence) + 1;
  return md.slice(start, md.indexOf('```', start)).trim();
}

function readCopy() {
  const md = fs.readFileSync(ASO, 'utf8');
  return {
    subtitle: blockAfter(md, '### Subtitle'),
    keywords: blockAfter(md, '### Keywords'),
    promotionalText: blockAfter(md, '### Promotional Text'),
    description: blockAfter(md, '### Description'),
  };
}

/**
 * The "For Review" section of review-notes.md, as PLAIN TEXT.
 *
 * App Store Connect's notes field renders nothing, so markdown emphasis reaches
 * the reviewer as literal asterisks and backticks — which reads like a mistake
 * in a document whose whole job is to look considered. The 4000-character limit
 * is Apple's; `npm run check:aso` enforces it too, so it fails in the gate
 * rather than halfway through an upload.
 */
function readReviewNotes() {
  const md = fs.readFileSync(path.join(__dirname, '..', 'store', 'review-notes.md'), 'utf8');
  const section = md.split('## For Review')[1]?.split('\n---')[0]?.trim();
  if (!section) throw new Error('review-notes.md has no "## For Review" section');

  const plain = section
    .replace(/\*\*/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/→/g, '->');

  if (plain.length > 4000) {
    throw new Error(`review notes are ${plain.length} chars; Apple's limit is 4000`);
  }
  return plain;
}

const log = (...a) => console.log(...a);
const act = (w) => log(`  ${APPLY ? 'DO      ' : 'would do'}  ${w}`);
const same = (w) => log(`  ok        ${w}`);

/** PATCHes only the fields that actually differ, and says which. A blanket
 *  PATCH makes every run look like a change and hides real drift. */
async function patchIfChanged(label, type, id, current, wanted) {
  const diff = {};
  for (const [k, v] of Object.entries(wanted)) {
    if ((current?.[k] ?? null) !== (v ?? null)) diff[k] = v;
  }
  if (Object.keys(diff).length === 0) {
    same(label);
    return false;
  }
  act(`${label} — ${Object.keys(diff).join(', ')}`);
  if (APPLY) await api('PATCH', `/v1/${type}/${id}`, { data: { type, id, attributes: diff } });
  return true;
}

async function main() {
  log(APPLY ? 'Applying changes.\n' : 'DRY RUN — pass --apply to write anything.\n');
  const copy = readCopy();

  // --- the version and its localization ------------------------------------
  // No `sort` here: this relationship rejects it outright with "the parameter
  // 'sort' can not be used with this request", unlike most ASC collections.
  //
  // And no `filter[appStoreState]` either. Filtering on PREPARE_FOR_SUBMISSION
  // looked right until a submission was withdrawn: the version moved to
  // DEVELOPER_REJECTED, the filter matched nothing, and this script died
  // claiming "no app version exists" about a version that was fully populated
  // and sitting right there. A filter that turns a state change into a missing
  // resource is worse than no filter.
  const versions = await api('GET', `/v1/apps/${APP_ID}/appStoreVersions?limit=20`);
  const version = (versions.data ?? []).find((v) => EDITABLE_STATES.has(v.attributes.appStoreState));
  if (!version) {
    const seen = (versions.data ?? []).map((v) => `${v.attributes.versionString}=${v.attributes.appStoreState}`);
    throw new Error(
      `no editable app version. Versions on this app: ${seen.join(', ') || 'none'}`,
    );
  }
  log(`Version ${version.attributes.versionString} (${version.attributes.appStoreState})\n`);

  await patchIfChanged('version attributes', 'appStoreVersions', version.id, version.attributes, {
    copyright: COPYRIGHT,
    // Manual release: a first launch should go live when someone is awake to
    // watch it, not the moment review happens to finish.
    releaseType: 'MANUAL',
  });

  const locs = await api('GET', `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`);
  let versionLoc = (locs.data ?? []).find((l) => l.attributes.locale === LOCALE);

  const versionCopy = {
    description: copy.description,
    keywords: copy.keywords,
    promotionalText: copy.promotionalText,
    supportUrl: 'https://scentkeep.com/support',
    marketingUrl: 'https://scentkeep.com',
    // First version: "what's new" is not shown, and Apple rejects it as
    // meaningless on a 1.0. Left unset deliberately.
  };

  if (versionLoc) {
    await patchIfChanged(
      `version copy (${LOCALE})`,
      'appStoreVersionLocalizations',
      versionLoc.id,
      versionLoc.attributes,
      versionCopy,
    );
  } else {
    act(`create version copy (${LOCALE})`);
    if (APPLY) {
      versionLoc = (
        await api('POST', '/v1/appStoreVersionLocalizations', {
          data: {
            type: 'appStoreVersionLocalizations',
            attributes: { ...versionCopy, locale: LOCALE },
            relationships: {
              appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } },
            },
          },
        })
      ).data;
    }
  }

  // --- app info: subtitle, privacy URL, categories --------------------------
  // These hang off appInfo, NOT off the version. Everyone assumes the subtitle
  // lives with the description because that is where the UI shows it.
  const infos = await api('GET', `/v1/apps/${APP_ID}/appInfos`);
  const info = (infos.data ?? []).find((i) => i.attributes.state !== 'READY_FOR_DISTRIBUTION') ?? infos.data[0];

  const infoLocs = await api('GET', `/v1/appInfos/${info.id}/appInfoLocalizations`);
  const infoLoc = (infoLocs.data ?? []).find((l) => l.attributes.locale === LOCALE);

  const infoCopy = {
    subtitle: copy.subtitle,
    privacyPolicyUrl: 'https://scentkeep.com/privacy',
  };

  if (infoLoc) {
    await patchIfChanged(
      `subtitle and privacy URL (${LOCALE})`,
      'appInfoLocalizations',
      infoLoc.id,
      infoLoc.attributes,
      infoCopy,
    );
  } else {
    act(`create app info localization (${LOCALE})`);
    if (APPLY) {
      await api('POST', '/v1/appInfoLocalizations', {
        data: {
          type: 'appInfoLocalizations',
          attributes: { ...infoCopy, locale: LOCALE },
          relationships: { appInfo: { data: { type: 'appInfos', id: info.id } } },
        },
      });
    }
  }

  const primary = await optional(`/v1/appInfos/${info.id}/primaryCategory`);
  const secondary = await optional(`/v1/appInfos/${info.id}/secondaryCategory`);
  const catDiff = {};
  if (primary?.id !== PRIMARY_CATEGORY) catDiff.primaryCategory = PRIMARY_CATEGORY;
  if (secondary?.id !== SECONDARY_CATEGORY) catDiff.secondaryCategory = SECONDARY_CATEGORY;

  if (Object.keys(catDiff).length === 0) {
    same(`categories (${PRIMARY_CATEGORY} / ${SECONDARY_CATEGORY})`);
  } else {
    act(`categories -> ${PRIMARY_CATEGORY} / ${SECONDARY_CATEGORY}`);
    if (APPLY) {
      // Categories are RELATIONSHIPS on appInfos, set through a PATCH of the
      // parent rather than through the relationship endpoints.
      await api('PATCH', `/v1/appInfos/${info.id}`, {
        data: {
          type: 'appInfos',
          id: info.id,
          relationships: Object.fromEntries(
            Object.entries(catDiff).map(([k, v]) => [k, { data: { type: 'appCategories', id: v } }]),
          ),
        },
      });
    }
  }

  // --- age rating -----------------------------------------------------------
  const ageRating = await optional(`/v1/appInfos/${info.id}/ageRatingDeclaration`);
  if (ageRating) {
    await patchIfChanged('age rating (4+)', 'ageRatingDeclarations', ageRating.id, ageRating.attributes, AGE_RATING);
  } else {
    act('create age rating declaration');
    if (APPLY) {
      await api('POST', '/v1/ageRatingDeclarations', {
        data: {
          type: 'ageRatingDeclarations',
          attributes: AGE_RATING,
          relationships: { appInfo: { data: { type: 'appInfos', id: info.id } } },
        },
      });
    }
  }

  // --- App Review contact ---------------------------------------------------
  const reviewNotes = readReviewNotes();

  const detail = await optional(`/v1/appStoreVersions/${version.id}/appStoreReviewDetail`);
  const wantedDetail = { ...REVIEW_DETAIL, notes: reviewNotes };

  if (!REVIEW_DETAIL.contactPhone) {
    log('  SKIP      App Review contact — no SCENTKEEP_REVIEW_PHONE set');
  } else if (detail) {
    await patchIfChanged('App Review contact and notes', 'appStoreReviewDetails', detail.id, detail.attributes, wantedDetail);
  } else {
    act('create App Review contact and notes');
    if (APPLY) {
      await api('POST', '/v1/appStoreReviewDetails', {
        data: {
          type: 'appStoreReviewDetails',
          attributes: wantedDetail,
          relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } },
        },
      });
    }
  }

  // --- content rights -------------------------------------------------------
  // Apple blocks submission on this and the UI asks it as a yes/no buried in
  // App Information. Everything in ScentKeep is first-party: the icon and
  // artwork are generated from scripts/generate-icons.js, the only bundled font
  // is Cormorant Garamond under the SIL Open Font License, and the app ships no
  // fragrance database — every record is typed by the user.
  const app = await api('GET', `/v1/apps/${APP_ID}`);
  await patchIfChanged('content rights declaration', 'apps', APP_ID, app.data.attributes, {
    contentRightsDeclaration: 'DOES_NOT_USE_THIRD_PARTY_CONTENT',
  });

  // --- attach the build -----------------------------------------------------
  // A version with no build attached cannot be submitted, and the UI makes this
  // look automatic because TestFlight already lists the build. It is not: the
  // version->build relationship is a separate, explicit link.
  const attached = await optional(`/v1/appStoreVersions/${version.id}/build`);
  const builds = await api('GET', `/v1/builds?filter[app]=${APP_ID}&limit=10`);
  const newest = (builds.data ?? [])
    .filter((b) => b.attributes.processingState === 'VALID' && !b.attributes.expired)
    .sort((a, b) => Number(b.attributes.version) - Number(a.attributes.version))[0];

  if (!newest) {
    log('  SKIP      attach build — no VALID build available yet');
  } else if (attached?.id === newest.id) {
    same(`build ${newest.attributes.version} attached`);
  } else {
    act(`attach build ${newest.attributes.version}`);
    if (APPLY) {
      await api('PATCH', `/v1/appStoreVersions/${version.id}/relationships/build`, {
        data: { type: 'builds', id: newest.id },
      });
    }
  }

  await ensurePricingAndAvailability();

  // --- screenshots ----------------------------------------------------------
  if (!versionLoc) {
    log('\n  screenshots skipped — the version localization does not exist yet (dry run?)');
  } else {
    await syncScreenshots(versionLoc.id);
  }

  log('\nDone.');
  if (APPLY) await report(version.id, info.id);
}

/**
 * The app itself is FREE everywhere; the money is in the in-app purchases,
 * which already cover 175 territories. Leaving these unset blocks submission,
 * and the ASC UI hides them on a "Pricing and Availability" page that looks
 * informational rather than required.
 *
 * Both writes use Apple's `included` pattern: the schedule is created in one
 * request that also carries the price rows it points at, with client-invented
 * placeholder ids wiring the two halves together.
 */
async function ensurePricingAndAvailability() {
  const schedule = await optional(`/v1/appPriceSchedules/${APP_ID}/manualPrices?limit=1`);
  if (schedule && schedule.length) {
    same('app price (free)');
  } else {
    const points = await api('GET', `/v1/apps/${APP_ID}/appPricePoints?filter[territory]=USA&limit=200`);
    const free = (points.data ?? []).find((p) => Number(p.attributes.customerPrice) === 0);
    if (!free) throw new Error('no zero-cost price point offered for USA');

    act('app price -> Free, base territory USA');
    if (APPLY) {
      await api('POST', '/v1/appPriceSchedules', {
        data: {
          type: 'appPriceSchedules',
          relationships: {
            app: { data: { type: 'apps', id: APP_ID } },
            baseTerritory: { data: { type: 'territories', id: 'USA' } },
            manualPrices: { data: [{ type: 'appPrices', id: '${price-free}' }] },
          },
        },
        included: [
          {
            type: 'appPrices',
            id: '${price-free}',
            // No start or end date: this is the price from now until changed.
            attributes: { startDate: null, endDate: null },
            relationships: { appPricePoint: { data: { type: 'appPricePoints', id: free.id } } },
          },
        ],
      });
    }
  }

  const availability = await optional(`/v2/appAvailabilities/${APP_ID}`);
  if (availability) {
    same('territory availability');
    return;
  }

  const territories = [];
  let next = '/v1/territories?limit=200';
  while (next) {
    const page = await api('GET', next.replace('https://api.appstoreconnect.apple.com', ''));
    territories.push(...page.data.map((t) => t.id));
    next = page.links?.next ?? null;
  }

  act(`territory availability -> ${territories.length} territories`);
  if (!APPLY) return;

  await api('POST', '/v2/appAvailabilities', {
    data: {
      type: 'appAvailabilities',
      // Matches the IAPs, which are already set to follow Apple into any new
      // territory. An app available somewhere its purchases are not is worse
      // than not being there at all.
      attributes: { availableInNewTerritories: true },
      relationships: {
        app: { data: { type: 'apps', id: APP_ID } },
        territoryAvailabilities: {
          data: territories.map((t) => ({ type: 'territoryAvailabilities', id: `\${${t}}` })),
        },
      },
    },
    included: territories.map((t) => ({
      type: 'territoryAvailabilities',
      id: `\${${t}}`,
      attributes: { available: true },
      relationships: { territory: { data: { type: 'territories', id: t } } },
    })),
  });
}

async function syncScreenshots(versionLocId) {
  const sharp = require('sharp');
  log('');

  const sets = await api('GET', `/v1/appStoreVersionLocalizations/${versionLocId}/appScreenshotSets`);
  let set = (sets.data ?? []).find((s) => s.attributes.screenshotDisplayType === DISPLAY_TYPE);

  if (set) {
    same(`screenshot set ${DISPLAY_TYPE}`);
  } else {
    act(`screenshot set ${DISPLAY_TYPE}`);
    if (!APPLY) return;
    set = (
      await api('POST', '/v1/appScreenshotSets', {
        data: {
          type: 'appScreenshotSets',
          attributes: { screenshotDisplayType: DISPLAY_TYPE },
          relationships: {
            appStoreVersionLocalization: {
              data: { type: 'appStoreVersionLocalizations', id: versionLocId },
            },
          },
        },
      })
    ).data;
  }

  const existing = await api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots`);
  const have = new Map((existing.data ?? []).map((s) => [s.attributes.fileName, s]));

  for (const name of SCREENSHOTS) {
    const file = path.join(SCREENSHOT_DIR, name);
    if (!fs.existsSync(file)) throw new Error(`missing screenshot: ${name} — run npm run screenshots:store`);

    const meta = await sharp(file).metadata();
    if (meta.width !== EXPECTED_SIZE.width || meta.height !== EXPECTED_SIZE.height) {
      throw new Error(
        `${name} is ${meta.width}x${meta.height}; the ${DISPLAY_TYPE} slot needs ${EXPECTED_SIZE.width}x${EXPECTED_SIZE.height}`,
      );
    }

    if (have.has(name)) {
      same(`  ${name}`);
      continue;
    }

    act(`  upload ${name} (${meta.width}x${meta.height})`);
    if (!APPLY) continue;

    const bytes = fs.readFileSync(file);
    await uploadAsset({
      createPath: '/v1/appScreenshots',
      type: 'appScreenshots',
      attributes: { fileName: name, fileSize: bytes.length },
      relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.id } } },
      bytes,
    });
  }

  // Order is a separate call: uploading in sequence does NOT determine the
  // order the App Store shows them in.
  if (APPLY) {
    const after = await api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots`);
    const byName = new Map((after.data ?? []).map((s) => [s.attributes.fileName, s.id]));
    const ordered = SCREENSHOTS.map((n) => byName.get(n)).filter(Boolean);
    if (ordered.length) {
      act(`  set display order (${ordered.length})`);
      await api('PATCH', `/v1/appScreenshotSets/${set.id}/relationships/appScreenshots`, {
        data: ordered.map((id) => ({ type: 'appScreenshots', id })),
      });
    }
  }
}

async function report(versionId, infoId) {
  const loc = (
    await api('GET', `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations`)
  ).data.find((l) => l.attributes.locale === LOCALE);
  const infoLoc = (await api('GET', `/v1/appInfos/${infoId}/appInfoLocalizations`)).data.find(
    (l) => l.attributes.locale === LOCALE,
  );
  const primary = await optional(`/v1/appInfos/${infoId}/primaryCategory`);
  const secondary = await optional(`/v1/appInfos/${infoId}/secondaryCategory`);
  const rating = await optional(`/v1/appInfos/${infoId}/ageRatingDeclaration`);
  const detail = await optional(`/v1/appStoreVersions/${versionId}/appStoreReviewDetail`);

  const sets = await api('GET', `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets`);
  let shots = 0;
  for (const s of sets.data ?? []) {
    shots += (await api('GET', `/v1/appScreenshotSets/${s.id}/appScreenshots`)).data.length;
  }

  const show = (label, value) => log(`  ${label.padEnd(18)} ${value}`);
  log('\nState now:');
  show('description', loc.attributes.description ? `${loc.attributes.description.length} chars` : '— MISSING');
  show('keywords', loc.attributes.keywords ?? '— MISSING');
  show('promo text', loc.attributes.promotionalText ? 'set' : '— MISSING');
  show('support url', loc.attributes.supportUrl ?? '— MISSING');
  show('marketing url', loc.attributes.marketingUrl ?? '— MISSING');
  show('subtitle', infoLoc.attributes.subtitle ?? '— MISSING');
  show('privacy url', infoLoc.attributes.privacyPolicyUrl ?? '— MISSING');
  show('categories', `${primary?.id ?? '— MISSING'} / ${secondary?.id ?? '— MISSING'}`);
  show('age rating', rating?.attributes?.violenceRealistic ? 'answered' : '— CHECK');
  show('review contact', detail?.attributes?.contactPhone ? 'complete' : '— needs a phone number');
  show('screenshots', `${shots} in ${DISPLAY_TYPE}`);
}

main().catch((e) => {
  console.error('\nFAILED:', e.message);
  process.exitCode = 1;
});
