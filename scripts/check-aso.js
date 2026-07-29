/* eslint-disable */
/**
 * Enforces the store character limits on the metadata in store/aso-metadata.md.
 *
 *   node scripts/check-aso.js
 *
 * These limits are hard rejections in App Store Connect and Play Console, and
 * they are the kind of thing that gets edited by hand at 1am on submission day.
 * Checking them in CI costs nothing and removes a whole class of resubmission.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'store', 'aso-metadata.md');
const md = fs.readFileSync(FILE, 'utf8');

/** Pulls the first fenced code block that follows a given heading. */
function blockAfter(heading) {
  const idx = md.indexOf(heading);
  if (idx === -1) return null;
  const fenceStart = md.indexOf('```', idx);
  if (fenceStart === -1) return null;
  const contentStart = md.indexOf('\n', fenceStart) + 1;
  const fenceEnd = md.indexOf('```', contentStart);
  return md.slice(contentStart, fenceEnd).trim();
}

const CHECKS = [
  { heading: '### App Name', label: 'Apple app name', limit: 30 },
  { heading: '### Subtitle', label: 'Apple subtitle', limit: 30 },
  { heading: '### Keywords', label: 'Apple keywords', limit: 100 },
  { heading: '### Promotional Text', label: 'Apple promo text', limit: 170 },
  { heading: '### Title —', label: 'Play title', limit: 30 },
  { heading: '### Short description', label: 'Play short description', limit: 80 },
  // The long description is shared between both stores; Apple's 4000 is the
  // tighter of the two ceilings, so checking against it covers Play as well.
  { heading: '### Description', label: 'long description', limit: 4000 },
];

let failed = 0;

for (const c of CHECKS) {
  const value = blockAfter(c.heading);
  if (value === null) {
    console.log(`  FAIL  ${c.label}: section not found (${c.heading})`);
    failed += 1;
    continue;
  }
  const len = value.length;
  const ok = len <= c.limit && len > 0;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${c.label.padEnd(24)} ${String(len).padStart(3)} / ${c.limit}`);
  if (!ok) failed += 1;
}

// The App Review notes field is also capped at 4000, and it is filled from the
// "For Review" section of review-notes.md by scripts/asc-listing.js. Checking it
// here means an over-long note fails the gate rather than halfway through an
// upload that has already changed half the listing.
const REVIEW_NOTES = path.join(__dirname, '..', 'store', 'review-notes.md');
const notesSection = fs
  .readFileSync(REVIEW_NOTES, 'utf8')
  .split('## For Review')[1]
  ?.split('\n---')[0]
  ?.trim();

if (!notesSection) {
  console.log('  FAIL  review-notes.md has no "## For Review" section');
  failed += 1;
} else {
  // Measured after the same plain-text transform the uploader applies, since
  // that is what Apple actually receives.
  const plain = notesSection.replace(/\*\*/g, '').replace(/`([^`]*)`/g, '$1').replace(/→/g, '->');
  const ok = plain.length <= 4000;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${'App Review notes'.padEnd(24)} ${String(plain.length).padStart(4)} / 4000`);
  if (!ok) failed += 1;
}

// Apple counts a space after a comma against the 100-character budget, so a
// keyword list with spaces is silently smaller than it looks.
const keywords = blockAfter('### Keywords');
if (keywords && /,\s/.test(keywords)) {
  console.log('  FAIL  Apple keywords contain a space after a comma (wastes characters)');
  failed += 1;
}

// Apple indexes name + subtitle + keywords together; repeating a term across
// them buys no extra ranking and burns the keyword budget.
const name = (blockAfter('### App Name') ?? '').toLowerCase();
const subtitle = (blockAfter('### Subtitle') ?? '').toLowerCase();
const indexed = new Set(
  `${name} ${subtitle}`.split(/[^a-z]+/).filter((w) => w.length > 2),
);
const repeated = (keywords ?? '').split(',').filter((k) => indexed.has(k.trim().toLowerCase()));
if (repeated.length) {
  console.log(`  FAIL  keywords repeat indexed name/subtitle terms: ${repeated.join(', ')}`);
  failed += 1;
} else {
  console.log('  PASS  keywords do not repeat name/subtitle terms');
}

console.log(failed === 0 ? '\nASO metadata within limits.' : `\n${failed} problem(s).`);
process.exit(failed === 0 ? 0 : 1);
