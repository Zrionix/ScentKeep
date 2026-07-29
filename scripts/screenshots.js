/* eslint-disable */
/**
 * Drives the ScentKeep web build with a headless browser to capture screenshots
 * — used both to VERIFY the UI actually renders and to generate App Store /
 * Play listing assets from the real app rather than a mockup.
 *
 * Prereq: the dev server must be running (npm run web) on PORT.
 *
 *   node scripts/screenshots.js            # verification set, 1x
 *   node scripts/screenshots.js --store    # store set at required sizes
 *
 * Seeding: the app persists to AsyncStorage, which on web is localStorage under
 * the key `scentkeep-store-v1`. Writing that key directly is what lets a
 * screenshot show a believable, fully-populated collection deterministically.
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const PORT = process.env.PORT || 8081;
const BASE = `http://localhost:${PORT}`;
const OUT = path.join(__dirname, '..', 'store', 'screenshots');
const STORE_MODE = process.argv.includes('--store');

const STORAGE_KEY = 'scentkeep-store-v1';

// --- demo collection ---------------------------------------------------------
// Mirrors src/domain/fixtures.ts. Kept as literal JSON here because this script
// runs in plain Node with no TS transform and no access to the app's modules.
const DAY = 86400000;

/**
 * A LOCAL calendar date, `YYYY-MM-DD`.
 *
 * Not `toISOString().slice(0, 10)`, which is UTC. The app dates every diary
 * entry in the user's own zone (see src/lib/dates.ts — the whole module exists
 * for this), so a UTC-dated seed is a day ahead of "today" anywhere west of
 * Greenwich. That silently pushed the seeded streak off by one and made the
 * most recent entry read as a future date.
 */
const iso = (offset) => {
  const d = new Date(Date.now() - offset * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
};

/** A timestamp, which genuinely is an instant and so genuinely is UTC. */
const stamp = (offset) => new Date(Date.now() - offset * DAY).toISOString();

// name, house, family, ml, price, seasons, occasions, longevity, sillage, rating,
// type, concentration, houseTier
const BOTTLES = [
  ['Tobacco Vanille', 'Tom Ford', 'Gourmand', 50, 285, ['Autumn', 'Winter'], ['Evening', 'Date'], 5, 5, 5, 'bottle', 'EDP', 'Niche'],
  ['Aventus', 'Creed', 'Chypre', 100, 445, ['Spring', 'Summer', 'Autumn'], ['Formal', 'Special'], 5, 5, 5, 'bottle', 'EDP', 'Niche'],
  ['Bleu de Chanel', 'Chanel', 'Woody', 100, 135, ['Autumn', 'Winter'], ['Work', 'Formal'], 4, 3, 4, 'bottle', 'EDP', 'Designer'],
  ['Layton', 'Parfums de Marly', 'Amber', 125, 355, ['Autumn', 'Winter'], ['Evening', 'Date'], 5, 4, 5, 'bottle', 'EDP', 'Niche'],
  // A small decant, worn hard — this is the one that shows as running low.
  ['Oud Wood', 'Tom Ford', 'Woody', 10, 90, ['Autumn', 'Winter'], ['Evening', 'Special'], 4, 3, 5, 'decant', 'EDP', 'Niche'],
  ['Sauvage', 'Dior', 'Fresh', 100, 118, ['Spring', 'Summer'], ['Daily', 'Work'], 4, 4, 4, 'bottle', 'EDT', 'Designer'],
  ['Acqua di Giò Profumo', 'Giorgio Armani', 'Aquatic', 75, 105, ['Summer'], ['Daily'], 3, 3, 4, 'bottle', 'Parfum', 'Designer'],
  ['Light Blue', 'Dolce & Gabbana', 'Citrus', 75, 92, ['Summer'], ['Daily', 'Travel'], 2, 3, 3, 'bottle', 'EDT', 'Designer'],
  ['Reflection Man', 'Amouage', 'Floral', 100, 390, ['Spring'], ['Formal'], 4, 4, 4, 'bottle', 'EDP', 'Niche'],
];

// name, house, family, ml, price, kind
const WISHES = [
  ['Baccarat Rouge 540', 'Maison Francis Kurkdjian', 'Amber', 70, 325, 'buy'],
  ['Herod', 'Parfums de Marly', 'Gourmand', 125, 260, 'buy'],
  ['Oud Satin Mood', 'Maison Francis Kurkdjian', 'Amber', 70, 300, 'sniff'],
];

function buildState() {
  const fragrances = [];

  BOTTLES.forEach((b, i) => {
    const [name, brand, family, sizeMl, price, seasons, occasions, longevity, sillage, rating, type, concentration, houseTier] = b;
    fragrances.push({
      id: `demo-${i + 1}`,
      name,
      brand,
      photoUrl: null,
      notesTop: null,
      notesHeart: null,
      notesBase: null,
      family,
      sizeMl,
      price,
      currency: 'USD',
      purchaseDate: null,
      seasons,
      occasions,
      longevity,
      sillage,
      rating,
      inWishlist: false,
      wishlistKind: 'buy',
      notes: null,
      type,
      concentration,
      houseTier,
      spraysPerWear: 2,
      remainingMl: null,
      remainingMlAt: null,
      createdAt: stamp(60 - i * 5),
      updatedAt: stamp(60 - i * 5),
    });
  });

  WISHES.forEach((w, i) => {
    const [name, brand, family, sizeMl, price, kind] = w;
    fragrances.push({
      id: `wish-${i + 1}`,
      name,
      brand,
      photoUrl: null,
      notesTop: null,
      notesHeart: null,
      notesBase: null,
      family,
      sizeMl,
      price,
      currency: 'USD',
      purchaseDate: null,
      seasons: [],
      occasions: [],
      longevity: 0,
      sillage: 0,
      rating: 0,
      inWishlist: true,
      wishlistKind: kind,
      notes: null,
      type: 'bottle',
      concentration: 'EDP',
      houseTier: 'Niche',
      spraysPerWear: 2,
      remainingMl: null,
      remainingMlAt: null,
      createdAt: stamp(10 - i),
      updatedAt: stamp(10 - i),
    });
  });

  // A wear history with an unbroken recent streak plus a believable tail, so the
  // diary, streak and stats screens all have something real to show.
  const sotd = [];
  const OCCASIONS = ['Work', 'Evening', 'Daily', 'Date', 'Formal'];
  const WEATHER = ['Warm', 'Cool', 'Mild', 'Cold', 'Hot'];
  const MOODS = ['Confident', 'Relaxed', 'Sharp', 'Cosy'];
  let n = 0;
  // BOTTLES.length is 9, so a stride of 3 only ever lands on indices 0/3/6 —
  // three bottles carrying every wear, which made "most worn" and "rotation"
  // look broken. A stride coprime with the length visits all nine.
  const STRIDE = 4;
  for (let d = 0; d < 48; d += 1) {
    // Skip a couple of days far back so "best run" differs from "current run".
    if (d === 12 || d === 13 || d === 27) continue;
    const bottle = fragrances[(d * STRIDE) % BOTTLES.length];
    sotd.push({
      id: `sotd-${n}`,
      fragranceId: bottle.id,
      date: iso(d),
      occasion: OCCASIONS[d % OCCASIONS.length],
      weather: WEATHER[d % WEATHER.length],
      mood: MOODS[d % MOODS.length],
      note: d === 0 ? 'Opened the new bottle — even better than the sample.' : null,
      rating: (d % 5) + 1,
      createdAt: stamp(d),
    });
    n += 1;
  }

  return {
    state: {
      fragrances,
      sotd,
      settings: {
        reminderEnabled: true,
        reminderTime: '09:00',
        rediscoverEnabled: true,
        themePreference: 'dark',
        currency: 'USD',
        favoriteFamilies: ['Woody', 'Amber'],
        collectionSizeBand: '5-15',
        onboardedAt: stamp(60),
      },
      isPremium: true,
      userId: null,
      dirtyAt: stamp(0),
    },
    version: 0,
  };
}

// --- capture targets ---------------------------------------------------------
const SHOTS = [
  { name: '01-wardrobe', route: '/', wait: 2600 },
  // The wardrobe again, before today has been logged, so the daily pick is on
  // screen. It leads the store listing — it is the reason to open the app.
  { name: '01b-today', route: '/', wait: 2600, unloggedToday: true },
  { name: '02-diary', route: '/diary', wait: 2200 },
  { name: '03-insights', route: '/stats', wait: 2200 },
  { name: '04-log-sotd', route: '/log-sotd', wait: 2200 },
  // demo-5 is the small decant worn hard, so its level bar is the interesting one.
  { name: '05-bottle', route: '/bottle/demo-5', wait: 2400 },
  { name: '06-paywall', route: '/paywall', wait: 2400, premium: false },
  { name: '07-settings', route: '/settings', wait: 2200 },
  { name: '08-onboarding', route: '/onboarding', wait: 2200, fresh: true },
  // The share card is a fixed-size view inside a horizontal scroller, so it
  // needs a moment longer for the bottle thumbnails to settle before capture.
  { name: '09-share', route: '/share', wait: 3000 },
];

// App Store: 6.9" iPhone is 1320x2868. 6.5" is 1242x2688. Play wants 1080x1920+.
// Capturing at 440x956 CSS with deviceScaleFactor 3 lands exactly on 1320x2868.
const VIEWPORT = STORE_MODE
  ? { width: 440, height: 956, deviceScaleFactor: 3 }
  : { width: 393, height: 852, deviceScaleFactor: 2 };

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--force-color-profile=srgb'],
  });

  const results = [];

  try {
    for (const shot of SHOTS) {
      const page = await browser.newPage();
      await page.setViewport(VIEWPORT);
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);

      const state = buildState();
      if (shot.premium === false) state.state.isPremium = false;
      // The daily pick only appears before anything is logged today, which is
      // correct behaviour and exactly why the demo seed hides it — the seed
      // logs an unbroken streak up to and including today. Dropping today's
      // entry shows the feature without faking anything else about the diary.
      if (shot.unloggedToday) {
        const today = iso(0);
        state.state.sotd = state.state.sotd.filter((e) => e.date !== today);
      }
      const payload = shot.fresh ? null : JSON.stringify(state);

      // Seed BEFORE the app's first paint: land on the origin, write
      // localStorage, then navigate to the target route so the store hydrates
      // from the seed rather than from an empty first render.
      await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.evaluate(
        (key, value) => {
          if (value === null) window.localStorage.removeItem(key);
          else window.localStorage.setItem(key, value);
        },
        STORAGE_KEY,
        payload,
      );

      await page.goto(BASE + shot.route, { waitUntil: 'networkidle2', timeout: 60000 });
      await new Promise((r) => setTimeout(r, shot.wait));

      const file = path.join(OUT, `${shot.name}${STORE_MODE ? '' : '-dev'}.png`);
      await page.screenshot({ path: file, type: 'png' });

      // Pull the visible text back so a blank or error screen is caught here
      // rather than being silently shipped as a store screenshot.
      const text = await page.evaluate(() => document.body.innerText.slice(0, 300));
      const size = (fs.statSync(file).size / 1024).toFixed(0);
      results.push({ name: shot.name, chars: text.trim().length, size });
      console.log(`  ${shot.name.padEnd(16)} ${size.padStart(5)} KB  ${text.trim().length} chars`);
      if (text.trim().length < 20) {
        console.log(`    !! ${shot.name} looks EMPTY — body text: ${JSON.stringify(text.slice(0, 120))}`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }

  const empty = results.filter((r) => r.chars < 20);
  console.log(`\n${results.length} captured, ${empty.length} empty.`);
  if (empty.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
