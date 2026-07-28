/* eslint-disable */
/**
 * ScentKeep end-to-end walk (brief §8).
 *
 * Drives the REAL UI in a headless browser through the whole funnel:
 *
 *   onboarding -> add bottle -> log SOTD -> diary -> hit the free cap ->
 *   paywall -> purchase -> unlimited -> premium stats
 *
 * Prereq: the dev server must be running (npm run web) on PORT.
 *
 *   node scripts/e2e.js
 *
 * This asserts on what the user actually sees, so it catches the class of bug a
 * unit test cannot: a screen that renders but is wired to nothing.
 */
const puppeteer = require('puppeteer');

const PORT = process.env.PORT || 8081;
const BASE = `http://localhost:${PORT}`;
const STORAGE_KEY = 'scentkeep-store-v1';
// Mirrors STUB_PREMIUM_KEY in src/lib/purchases.ts. On web, AsyncStorage IS
// localStorage, so the stub's remembered purchase lives here.
const STUB_PREMIUM_KEY = 'scentkeep-stub-premium-v1';
const HEADLESS = !process.argv.includes('--headed');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const sel = (id) => `[data-testid="${id}"]`;

async function waitFor(page, testId, timeout = 12000) {
  try {
    await page.waitForSelector(sel(testId), { timeout, visible: true });
    return true;
  } catch {
    return false;
  }
}

async function present(page, testId) {
  return (await page.$(sel(testId))) !== null;
}

async function tap(page, testId, timeout = 12000) {
  const ok = await waitFor(page, testId, timeout);
  if (!ok) throw new Error(`element not found: ${testId}`);
  await page.click(sel(testId));
  await settle(page);
}

async function typeInto(page, testId, text) {
  const ok = await waitFor(page, testId);
  if (!ok) throw new Error(`input not found: ${testId}`);
  await page.click(sel(testId));
  await page.type(sel(testId), text, { delay: 12 });
}

async function bodyText(page) {
  return page.evaluate(() => document.body.innerText);
}

/** Lets React commit and any transition finish before the next assertion. */
async function settle(page, ms = 550) {
  await new Promise((r) => setTimeout(r, ms));
}

async function readStore(page) {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw).state : null;
  }, STORAGE_KEY);
}

async function seedStore(page, mutate) {
  await page.evaluate(
    (key, mutateSrc) => {
      const raw = window.localStorage.getItem(key);
      const doc = raw ? JSON.parse(raw) : { state: {}, version: 0 };
      // eslint-disable-next-line no-eval
      doc.state = eval(`(${mutateSrc})`)(doc.state);
      window.localStorage.setItem(key, JSON.stringify(doc));
    },
    STORAGE_KEY,
    mutate.toString(),
  );
}

async function main() {
  const browser = await puppeteer.launch({
    headless: HEADLESS ? 'new' : false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 414, height: 896, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);

  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  // "Failed to load resource: 400" in the console says nothing about WHICH
  // request failed, so capture the URL and status alongside it.
  page.on('response', (r) => {
    if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });

  try {
    // ---------------------------------------------------------------- boot
    console.log('\n[1] Cold start with no stored data');
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.evaluate((k) => window.localStorage.removeItem(k), STORAGE_KEY);
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
    await settle(page, 2500);

    check('a fresh install lands on onboarding', await present(page, 'onboarding'));

    // --------------------------------------------------------- onboarding
    console.log('\n[2] Onboarding');
    await tap(page, 'onboarding-next'); // welcome -> size
    check('step 2 asks about collection size', await present(page, 'size-band-5-15'));
    await tap(page, 'size-band-5-15');
    await tap(page, 'onboarding-next'); // size -> families
    check('step 3 offers scent families', await present(page, 'family-Woody'));
    await tap(page, 'family-Woody');
    await tap(page, 'family-Amber');
    await tap(page, 'onboarding-next'); // finish
    await settle(page, 1200);

    const afterOnboarding = await readStore(page);
    check('onboarding answers were persisted', afterOnboarding?.settings?.onboardedAt != null);
    check(
      'chosen families were saved',
      JSON.stringify(afterOnboarding?.settings?.favoriteFamilies ?? []) ===
        JSON.stringify(['Woody', 'Amber']),
      JSON.stringify(afterOnboarding?.settings?.favoriteFamilies),
    );
    check('onboarding hands off to the wardrobe', await present(page, 'wardrobe-empty'));

    // Onboarding must not be reachable again on reload.
    await page.goto(BASE, { waitUntil: 'networkidle2' });
    await settle(page, 1800);
    check('a returning user is not sent through onboarding again', !(await present(page, 'onboarding')));

    // -------------------------------------------------------- add a bottle
    console.log('\n[3] Add a bottle');
    await tap(page, 'add-bottle-fab');
    check('the add form opens', await waitFor(page, 'bottle-form'));

    // Empty name must be refused by validation before anything is stored.
    await tap(page, 'bottle-save');
    await settle(page);
    check(
      'saving with no name is refused',
      (await bodyText(page)).includes('Give the bottle a name'),
    );

    await typeInto(page, 'field-name', 'Aventus');
    await typeInto(page, 'field-brand', 'Creed');
    await typeInto(page, 'field-price', '445');
    await tap(page, 'family-Chypre');
    await tap(page, 'rating-overall-5');
    await tap(page, 'bottle-save');
    await settle(page, 1200);

    const afterAdd = await readStore(page);
    check('the bottle was stored', (afterAdd?.fragrances ?? []).length === 1);
    check('its name was stored', afterAdd?.fragrances?.[0]?.name === 'Aventus');
    check('its price was parsed as a number', afterAdd?.fragrances?.[0]?.price === 445);
    check('its rating was stored', afterAdd?.fragrances?.[0]?.rating === 5);
    check('the wardrobe now shows it', (await bodyText(page)).includes('Aventus'));

    // ------------------------------------------------------------ log SOTD
    console.log('\n[4] Log a Scent of the Day');
    await tap(page, 'sotd-prompt');
    check('the SOTD screen opens', await waitFor(page, 'log-sotd'));

    const fragranceId = afterAdd.fragrances[0].id;
    await tap(page, `sotd-pick-${fragranceId}`);
    check('picking a bottle reveals the optional details', await present(page, 'sotd-details'));
    await tap(page, 'sotd-submit');
    await settle(page, 1200);

    const afterSotd = await readStore(page);
    check('the wear was logged', (afterSotd?.sotd ?? []).length === 1);
    check('it points at the right bottle', afterSotd?.sotd?.[0]?.fragranceId === fragranceId);

    // Double-logging the same bottle the same day must be refused.
    await page.goto(`${BASE}/log-sotd`, { waitUntil: 'networkidle2' });
    await settle(page, 1500);
    const pickDisabled = await page.evaluate((s) => {
      const el = document.querySelector(s);
      return el ? el.getAttribute('aria-disabled') === 'true' || el.disabled === true : null;
    }, sel(`sotd-pick-${fragranceId}`));
    check('a bottle already logged today cannot be logged again', pickDisabled === true);

    // -------------------------------------------------------------- diary
    console.log('\n[5] Diary');
    await page.goto(`${BASE}/diary`, { waitUntil: 'networkidle2' });
    await settle(page, 1500);
    const diaryText = await bodyText(page);
    check('the diary lists the wear', diaryText.includes('Aventus'));
    check('the diary labels it as today', diaryText.includes('TODAY') || diaryText.includes('Today'));
    check('the streak reads 1 day', /CURRENT STREAK[\s\S]{0,20}1/i.test(diaryText));

    // ----------------------------------------------------------- free cap
    console.log('\n[6] Free wardrobe cap');
    // Seed to one bottle below the cap so the walk exercises the boundary
    // without 11 identical form submissions.
    await seedStore(page, (state) => {
      // Ids MUST be real UUIDs: fragrances.id is a uuid column, so a friendly
      // id like "seed-0" makes the cloud-sync upsert 400 on the whole batch.
      // Using the real shape means this walk also exercises sync for real.
      const uuid = () =>
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
      const extra = [];
      for (let i = 0; i < 11; i += 1) {
        extra.push({
          ...state.fragrances[0],
          id: uuid(),
          name: `Filler ${i}`,
          createdAt: new Date(Date.now() - (i + 1) * 60000).toISOString(),
        });
      }
      return { ...state, fragrances: [...state.fragrances, ...extra] };
    });
    await page.goto(BASE, { waitUntil: 'networkidle2' });
    await settle(page, 1800);

    const atCap = await readStore(page);
    check('the wardrobe is at the free cap of 12', (atCap?.fragrances ?? []).length === 12);
    check('a cap banner is shown', await present(page, 'cap-banner'));

    await tap(page, 'add-bottle-fab');
    await settle(page, 1200);
    check('adding past the cap opens the paywall instead of the form', await present(page, 'paywall'));

    // ------------------------------------------------------------ paywall
    console.log('\n[7] Paywall');
    const paywallText = await bodyText(page);
    check('the paywall lists plans', await present(page, 'paywall-plans'));
    check('monthly is offered', await present(page, 'plan-monthly'));
    check('annual is offered', await present(page, 'plan-annual'));
    check('lifetime is offered', await present(page, 'plan-lifetime'));
    check('a price is shown', /\$\d/.test(paywallText));
    check('the free-trial length is stated', /30 days free/i.test(paywallText));
    // Guideline 3.1.2 requirements.
    check('auto-renew terms are disclosed', await present(page, 'paywall-terms'));
    check('a Restore Purchases control exists', await present(page, 'paywall-restore'));
    check('Terms of Use is linked', await present(page, 'paywall-terms-link'));
    check('Privacy Policy is linked', await present(page, 'paywall-privacy-link'));

    // ----------------------------------------------------------- purchase
    console.log('\n[8] Purchase unlocks premium');
    await tap(page, 'paywall-cta');
    await settle(page, 2000);

    const afterBuy = await readStore(page);
    check('the entitlement flipped to premium', afterBuy?.isPremium === true);

    await page.goto(BASE, { waitUntil: 'networkidle2' });
    await settle(page, 1800);
    check('the cap banner is gone for a premium user', !(await present(page, 'cap-banner')));

    await tap(page, 'add-bottle-fab');
    await settle(page, 1200);
    check('a premium user can open the add form past 12 bottles', await present(page, 'bottle-form'));

    // -------------------------------------------------------------- stats
    console.log('\n[9] Premium insights');
    await page.goto(`${BASE}/stats`, { waitUntil: 'networkidle2' });
    await settle(page, 1800);
    check('rotation is unlocked', await present(page, 'stat-rotation'));
    check('rotation is not showing its locked state', !(await present(page, 'stat-rotation-locked')));
    check('family breakdown is unlocked', await present(page, 'stat-families'));
    const statsText = await bodyText(page);
    check('collection value is shown', /COLLECTION VALUE/i.test(statsText));
    check(
      'the value states how many bottles it covers',
      /Based on \d+ of \d+ bottles|Across all \d+ bottles/i.test(statsText),
    );

    // Free users must see the locked treatment instead. Clearing the store flag
    // alone is not enough: the purchases stub persists its own simulated
    // purchase and bootstrap would restore premium from it on the next load.
    await seedStore(page, (state) => ({ ...state, isPremium: false }));
    await page.evaluate((k) => window.localStorage.removeItem(k), STUB_PREMIUM_KEY);
    await page.goto(`${BASE}/stats`, { waitUntil: 'networkidle2' });
    await settle(page, 1800);
    check('a free user sees rotation locked', await present(page, 'stat-rotation-locked'));
    check('a free user does not see the unlocked rotation', !(await present(page, 'stat-rotation')));

    // ----------------------------------------------------------- settings
    console.log('\n[10] Settings');
    await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle2' });
    await settle(page, 1500);
    check('export control exists', await present(page, 'settings-export'));
    check('delete-my-data control exists', await present(page, 'settings-delete'));
    check('restore purchases control exists', await present(page, 'settings-restore'));
    check('privacy policy is linked', await present(page, 'link-privacy'));
    check('terms are linked', await present(page, 'link-terms'));
    check('support is linked', await present(page, 'link-support'));

    // ------------------------------------------------------------ console
    console.log('\n[11] Runtime errors');
    // Expo's dev bundle logs benign warnings on web; only genuine failures count.
    const real = consoleErrors.filter(
      (e) =>
        !/Download the React DevTools|expo-notifications|useNativeDriver|not yet fully supported on web|shadow\*|props\.pointerEvents|Unexpected text node/i.test(
          e,
        ),
    );
    if (failedRequests.length) {
      console.log('  failed requests:');
      for (const r of [...new Set(failedRequests)].slice(0, 6)) console.log(`    ${r}`);
    }
    check(
      'no unexpected console errors',
      real.length === 0,
      real.slice(0, 3).join(' | '),
    );
    check('no failing network requests', failedRequests.length === 0, `${failedRequests.length}`);
  } catch (e) {
    failed += 1;
    failures.push(`threw: ${e.message}`);
    console.log(`\n  ERROR ${e.message}`);
    try {
      await page.screenshot({ path: 'artifacts/e2e-failure.png' });
      console.log('  (screenshot at artifacts/e2e-failure.png)');
    } catch {}
  } finally {
    await browser.close();
  }

  console.log(`\n${'='.repeat(52)}`);
  console.log(`E2E: ${passed} passed, ${failed} failed`);
  if (failures.length) console.log('Failed:\n  - ' + failures.join('\n  - '));
  process.exit(failed === 0 ? 0 : 1);
}

require('fs').mkdirSync('artifacts', { recursive: true });
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
