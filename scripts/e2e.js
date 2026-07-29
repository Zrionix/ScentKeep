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

/**
 * Types into a field that already has a value.
 *
 * Plain `typeInto` APPENDS, which turned a pre-filled "100" into "10040".
 * Clearing has to be keyboard-only: a triple-click + Backspace emptied the
 * field but cost it focus on the re-render, so everything typed afterwards went
 * nowhere and the value came back null.
 */
async function replaceIn(page, testId, text) {
  const ok = await waitFor(page, testId);
  if (!ok) throw new Error(`input not found: ${testId}`);
  await page.click(sel(testId));
  const existing = await page.$eval(sel(testId), (el) => el.value ?? '');
  await page.keyboard.press('End');
  for (let i = 0; i < existing.length + 2; i += 1) {
    await page.keyboard.press('Backspace');
  }
  await page.type(sel(testId), text, { delay: 25 });
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

/**
 * A fresh v4 UUID for every seeded row.
 *
 * Two properties matter and both were learned the hard way:
 *   - `fragrances.id` is a uuid column, so a readable id like "e2e-anchor"
 *     makes every sync push 400.
 *   - the id must be NEW each run. Each run signs in as a new anonymous user,
 *     so a fixed id collides with the row the previous run left behind and RLS
 *     correctly refuses the write with a 403 — the test would be asserting
 *     against another user's data if it did not.
 */
const uuid = () => require('node:crypto').randomUUID();

/** The field set a stored fragrance must carry, so a seeded row is shaped
 *  exactly like one the app wrote itself. */
function blankFragrance(at) {
  return {
    brand: 'E2E House',
    photoUrl: null,
    notesTop: null,
    notesHeart: null,
    notesBase: null,
    family: null,
    sizeMl: null,
    price: null,
    currency: 'USD',
    purchaseDate: null,
    seasons: [],
    occasions: [],
    longevity: 0,
    sillage: 0,
    rating: 0,
    inWishlist: false,
    wishlistKind: 'buy',
    notes: null,
    type: 'bottle',
    concentration: null,
    houseTier: null,
    spraysPerWear: 2,
    remainingMl: null,
    remainingMlAt: null,
    createdAt: at,
    updatedAt: at,
  };
}

/**
 * Runs a block against a brand-new browser context — separate cookies, separate
 * localStorage, and therefore a separate anonymous Supabase user.
 *
 * Needed wherever an assertion depends on the cloud being EMPTY. Clearing local
 * storage alone does not achieve that: the same anonymous session reconnects and
 * pulls its rows straight back.
 */
async function withFreshContext(browser, fn) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  try {
    await page.setViewport({ width: 414, height: 896, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await fn(page);
  } finally {
    await context.close();
  }
}

/** Puts a ready-made shelf in front of the app, skipping onboarding. */
async function seedShelf(page, bottles) {
  const at = new Date().toISOString();
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await settle(page, 2500);
  await page.evaluate(
    (key, rows, when) => {
      const raw = window.localStorage.getItem(key);
      const doc = raw ? JSON.parse(raw) : { state: {}, version: 0 };
      doc.state.fragrances = rows;
      doc.state.sotd = [];
      doc.state.settings = { ...(doc.state.settings || {}), onboardedAt: when };
      window.localStorage.setItem(key, JSON.stringify(doc));
    },
    STORAGE_KEY,
    bottles.map((b) => ({ ...blankFragrance(at), ...b })),
    at,
  );
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await settle(page, 2500);
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
    // Size matters: without it there is nothing to compute a bottle level from,
    // and step 10 has nothing to assert on.
    await typeInto(page, 'field-size', '100');
    await typeInto(page, 'field-price', '445');
    await tap(page, 'family-Chypre');
    await tap(page, 'rating-overall-5');
    await tap(page, 'bottle-save');
    await settle(page, 1200);

    const afterAdd = await readStore(page);
    check('the bottle was stored', (afterAdd?.fragrances ?? []).length === 1);
    check('its name was stored', afterAdd?.fragrances?.[0]?.name === 'Aventus');
    check('its price was parsed as a number', afterAdd?.fragrances?.[0]?.price === 445);
    check('its size was parsed as a number', afterAdd?.fragrances?.[0]?.sizeMl === 100);
    check('its rating was stored', afterAdd?.fragrances?.[0]?.rating === 5);
    check('it defaulted to a full bottle', afterAdd?.fragrances?.[0]?.type === 'bottle');
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

    // ------------------------------------------------ bottle level tracking
    console.log('\n[10] Bottle levels (the premium hook)');
    // Back to premium for this block.
    await seedStore(page, (state) => ({ ...state, isPremium: true }));
    await page.evaluate((k) => window.localStorage.setItem(k, 'true'), STUB_PREMIUM_KEY);

    const levelId = (await readStore(page)).fragrances[0].id;
    await page.goto(`${BASE}/bottle/${levelId}`, { waitUntil: 'networkidle2' });
    await settle(page, 1800);

    check('a premium user sees the bottle level', await present(page, 'bottle-level'));
    const levelText = await bodyText(page);
    check('the level is shown as a percentage', /\d+%/.test(levelText));
    check(
      'the figure is labelled as an estimate before it is measured',
      /Estimated level/i.test(levelText),
    );

    await tap(page, 'adjust-level');
    check('the adjust control opens', await present(page, 'level-adjust'));
    // The field is pre-filled with the current level, so this must REPLACE.
    await replaceIn(page, 'level-input', '40');
    await tap(page, 'level-save');
    await settle(page, 1200);

    const afterLevel = await readStore(page);
    const adjusted = afterLevel.fragrances.find((f) => f.id === levelId);
    check(
      'the measured level was stored',
      adjusted?.remainingMl === 40,
      `got ${JSON.stringify(adjusted?.remainingMl)}`,
    );
    check('the measurement was timestamped', Boolean(adjusted?.remainingMlAt));

    await page.goto(`${BASE}/bottle/${levelId}`, { waitUntil: 'networkidle2' });
    await settle(page, 1500);
    check(
      'it now reads as measured rather than estimated',
      /Measured level/i.test(await bodyText(page)),
    );

    // Free users must see it locked instead.
    await seedStore(page, (state) => ({ ...state, isPremium: false }));
    await page.evaluate((k) => window.localStorage.removeItem(k), STUB_PREMIUM_KEY);
    await page.goto(`${BASE}/bottle/${levelId}`, { waitUntil: 'networkidle2' });
    await settle(page, 1800);
    check('a free user sees the level locked', await present(page, 'bottle-level-locked'));
    check('a free user does not see the real level', !(await present(page, 'bottle-level')));

    // ---------------------------------------------- collector fields + lists
    console.log('\n[11] Collector fields and the split wishlist');
    // Back to premium: the previous block left the tier on free, and the
    // wardrobe is past the free cap — so a save here would be correctly refused
    // and this block would be testing the cap instead of the new fields.
    await seedStore(page, (state) => ({ ...state, isPremium: true }));
    await page.evaluate((k) => window.localStorage.setItem(k, 'true'), STUB_PREMIUM_KEY);
    await page.goto(`${BASE}/bottle/new`, { waitUntil: 'networkidle2' });
    await settle(page, 1500);
    check('the form offers decant and sample types', await present(page, 'type-decant'));
    check('the form offers concentration', await present(page, 'concentration-EDP'));
    check('the form offers a house tier', await present(page, 'tier-Niche'));
    check('the form offers sprays per wear', await present(page, 'field-sprays'));

    await typeInto(page, 'field-name', 'Test Decant');
    await tap(page, 'type-decant');
    await tap(page, 'concentration-EDP');
    await tap(page, 'tier-Niche');
    await tap(page, 'bottle-save');
    await settle(page, 1200);

    const withDecant = await readStore(page);
    const decant = withDecant.fragrances.find((f) => f.name === 'Test Decant');
    check('the decant was stored with its type', decant?.type === 'decant');
    check('its concentration was stored', decant?.concentration === 'EDP');
    check('its house tier was stored', decant?.houseTier === 'Niche');

    await page.goto(BASE, { waitUntil: 'networkidle2' });
    await settle(page, 1800);
    await tap(page, 'shelf-wishlist');
    check('the wishlist splits into to-buy and to-try', await present(page, 'wishkind-sniff'));
    await tap(page, 'wishkind-sniff');
    await settle(page, 800);
    check('switching lists keeps the wishlist on screen', await present(page, 'shelf-wishlist'));

    // --------------------------------------------------- discovery + suggest
    console.log('\n[12] Discovery, the daily pick and the shelf card');

    // Two bottles that genuinely share a base, plus one that shares nothing, so
    // the similarity engine has something real to find rather than being
    // asserted against an empty list.
    const anchorId = uuid();
    const twinId = uuid();
    const liftId = uuid();
    const seedAt = new Date().toISOString();
    const discoveryRows = [
      {
        ...blankFragrance(seedAt),
        id: anchorId,
        name: 'E2E Anchor',
        family: 'Amber',
        notesHeart: 'Vanilla',
        notesBase: 'Labdanum, Benzoin',
        sillage: 3,
      },
      {
        ...blankFragrance(seedAt),
        id: twinId,
        name: 'E2E Twin',
        family: 'Amber',
        notesHeart: 'Vanilla',
        notesBase: 'Labdanum, Benzoin',
        sillage: 3,
      },
      {
        ...blankFragrance(seedAt),
        id: liftId,
        name: 'E2E Lift',
        family: 'Citrus',
        notesTop: 'Bergamot, Lemon',
        notesBase: 'Vanilla',
        sillage: 2,
      },
    ];
    await page.evaluate(
      (key, rows) => {
        const raw = window.localStorage.getItem(key);
        const doc = raw ? JSON.parse(raw) : { state: {}, version: 0 };
        doc.state.isPremium = true;
        doc.state.fragrances = [...(doc.state.fragrances || []), ...rows];
        window.localStorage.setItem(key, JSON.stringify(doc));
      },
      STORAGE_KEY,
      discoveryRows,
    );
    await page.evaluate((k) => window.localStorage.setItem(k, 'true'), STUB_PREMIUM_KEY);

    await page.goto(`${BASE}/bottle/${anchorId}`, { waitUntil: 'networkidle2' });
    await settle(page, 1800);
    check('a premium user sees what else smells like this', await present(page, 'detail-similar'));
    check('the twin is found', await present(page, `similar-${twinId}`));
    const similarText = await bodyText(page);
    check(
      'the similarity states its evidence rather than only a number',
      /Shares .*(Labdanum|Benzoin|Vanilla)/i.test(similarText),
    );
    check('layering partners are offered', await present(page, 'detail-layering'));
    check('the citrus lift is the partner', await present(page, `layer-${liftId}`));

    await seedStore(page, (state) => ({ ...state, isPremium: false }));
    await page.evaluate((k) => window.localStorage.removeItem(k), STUB_PREMIUM_KEY);
    await page.goto(`${BASE}/bottle/${anchorId}`, { waitUntil: 'networkidle2' });
    await settle(page, 1800);
    check('a free user sees discovery locked', await present(page, 'detail-discovery-locked'));
    check('a free user does not see the matches', !(await present(page, 'detail-similar')));

    await seedStore(page, (state) => ({ ...state, isPremium: true }));
    await page.evaluate((k) => window.localStorage.setItem(k, 'true'), STUB_PREMIUM_KEY);
    await page.goto(`${BASE}/stats`, { waitUntil: 'networkidle2' });
    await settle(page, 1800);
    check('the shelf shape is shown', (await present(page, 'stat-shape')) || (await present(page, 'stat-shape-sparse')));
    check('layering ideas are offered', (await present(page, 'stat-pairs')) || (await present(page, 'stat-pairs-empty')));

    // The daily pick only appears before anything is logged today, and this
    // session logged one in step 4. Clearing `sotd` locally is not enough: the
    // reload pulls the cloud copy straight back, because this browser holds a
    // real anonymous session whose entry is already on the server. A fresh
    // browser context gets a fresh anonymous user with nothing to restore.
    await withFreshContext(browser, async (fresh) => {
      await seedShelf(fresh, [
        { id: uuid(), name: 'Pick One' },
        { id: uuid(), name: 'Pick Two' },
        { id: uuid(), name: 'Pick Three' },
      ]);
      check("today's pick is offered", await present(fresh, 'today-suggestion'));
      const pickText = await bodyText(fresh);
      check(
        'the pick explains itself rather than just naming a bottle',
        /never worn|rested|tagged for|five-star|last worn|on your shelf/i.test(pickText),
      );
      await tap(fresh, 'today-suggestion-more');
      check('alternates are one tap away', await present(fresh, 'today-suggestion-alternates'));
      check(
        'the pick offers a way to log it in one tap',
        await present(fresh, 'today-suggestion-wear'),
      );
    });

    await page.goto(`${BASE}/share`, { waitUntil: 'networkidle2' });
    await settle(page, 1800);
    check('the shelf card renders', await present(page, 'share'));
    check('the card offers a mode switch', await present(page, 'share-mode-top-rated'));
    const cardText = await bodyText(page);
    check('the card carries the wordmark', /ScentKeep/.test(cardText));
    check(
      'the card shows no prices',
      !/\$\s?\d|USD\s?\d/.test(cardText),
      cardText.slice(0, 200),
    );

    // ----------------------------------------------------------- settings
    console.log('\n[13] Settings');
    // Drop to free FIRST so the gated controls can be checked in their locked
    // state; the premium pass follows below.
    await seedStore(page, (state) => ({ ...state, isPremium: false }));
    await page.evaluate((k) => window.localStorage.removeItem(k), STUB_PREMIUM_KEY);
    await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle2' });
    await settle(page, 1800);
    check('export control exists', await present(page, 'settings-export'));
    check('delete-my-data control exists', await present(page, 'settings-delete'));
    check('restore purchases control exists', await present(page, 'settings-restore'));
    check('privacy policy is linked', await present(page, 'link-privacy'));
    check('terms are linked', await present(page, 'link-terms'));
    check('support is linked', await present(page, 'link-support'));
    check(
      'the insurance record is gated behind Premium for a free user',
      await present(page, 'settings-insurance-locked'),
    );

    await seedStore(page, (state) => ({ ...state, isPremium: true }));
    await page.evaluate((k) => window.localStorage.setItem(k, 'true'), STUB_PREMIUM_KEY);
    await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle2' });
    await settle(page, 1800);
    check('a premium user gets the insurance record', await present(page, 'settings-insurance'));

    // ------------------------------------------------------------ console
    console.log('\n[14] Runtime errors');
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
