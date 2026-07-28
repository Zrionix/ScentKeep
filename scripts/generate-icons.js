/* eslint-disable */
/**
 * Generates every app icon ScentKeep ships, from one vector definition.
 *
 *   node scripts/generate-icons.js
 *
 * Keeping the source as SVG-in-code (rather than a checked-in binary) means the
 * brand colour lives in exactly one place and every size is guaranteed to be the
 * same artwork. Run this again after any token change.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = path.join(__dirname, '..', 'assets', 'images');

// Brand tokens — must match src/theme/index.ts.
const BG = '#0B0A0C';
const GOLD = '#C9A961';
const GOLD_DIM = '#7A6538';

// --- Flacon geometry, in a 1000x1000 design space -------------------------
// Declared as explicit numbers so the composition can be CENTRED on its real
// bounding box rather than on a guess. An icon that sits 40px low reads as
// sloppy at every size, and it is invisible in the source until you look.
const CAP_W = 168;
const CAP_H = 86;
const NECK_W = 104;
const NECK_H = 52;
const BODY_W = 320;
const BODY_H = 372;
const BODY_R = 52;

const TOTAL_W = BODY_W;
const TOTAL_H = CAP_H + NECK_H + BODY_H;

/** A rectangle with square top corners and rounded bottom ones — the juice
 *  sitting in the bottom of a flacon. SVG's <rect rx> can't do this. */
function roundedBottomRect(x, y, w, h, r) {
  return `M ${x} ${y}
          L ${x + w} ${y}
          L ${x + w} ${y + h - r}
          A ${r} ${r} 0 0 1 ${x + w - r} ${y + h}
          L ${x + r} ${y + h}
          A ${r} ${r} 0 0 1 ${x} ${y + h - r}
          Z`;
}

/**
 * Draws the flacon with the CENTRE of its bounding box at (cx, cy).
 *
 * An OUTLINED body with the lower portion filled — a bottle with juice in it.
 * A solid silhouette read as a generic jar; the fill line is what makes it
 * unmistakably perfume, and it survives being shrunk to a 40px launcher tile.
 */
function bottle(cx, cy, scale, { solid = false } = {}) {
  const top = cy - (TOTAL_H / 2) * scale;
  const capY = top;
  const neckY = top + CAP_H * scale;
  const bodyY = top + (CAP_H + NECK_H) * scale;

  const rect = (w, y, h, r) =>
    `<rect x="${cx - (w * scale) / 2}" y="${y}" width="${w * scale}" height="${h * scale}" rx="${r * scale}" />`;

  // Monochrome/small variants take the plain silhouette: a hairline outline
  // disappears entirely once the launcher scales it down.
  if (solid) {
    return [
      rect(CAP_W, capY, CAP_H, 18),
      rect(NECK_W, neckY - 2 * scale, NECK_H + 4 * scale, 0),
      rect(BODY_W, bodyY, BODY_H, BODY_R),
    ].join('\n');
  }

  const stroke = 30 * scale;
  const bodyX = cx - (BODY_W * scale) / 2;
  const bodyW = BODY_W * scale;
  const bodyH = BODY_H * scale;

  // The juice fills the bottom 56% of the body, inset so it sits inside the
  // outline stroke. The inset is a hair SMALLER than the stroke so the fill
  // overlaps the outline's inner edge — butting them exactly leaves a 1px
  // antialiasing seam that looks like a rendering fault at large sizes.
  const inset = stroke - 2.5 * scale;
  const juiceH = bodyH * 0.56 - inset;
  const juiceY = bodyY + bodyH - inset - juiceH;

  return `
    <g fill="currentColor">
      ${rect(CAP_W, capY, CAP_H, 18)}
      ${rect(NECK_W, neckY - 2 * scale, NECK_H + 4 * scale, 0)}
    </g>
    <rect x="${bodyX + stroke / 2}" y="${bodyY + stroke / 2}"
          width="${bodyW - stroke}" height="${bodyH - stroke}"
          rx="${BODY_R * scale - stroke / 2}"
          fill="none" stroke="currentColor" stroke-width="${stroke}" />
    <path d="${roundedBottomRect(
      bodyX + inset,
      juiceY,
      bodyW - inset * 2,
      juiceH,
      BODY_R * scale - inset,
    )}" fill="currentColor" />
  `;
}

function iconSvg(size, { background = BG, fill = 0.62, solid = false } = {}) {
  // `fill` is the fraction of the canvas height the mark occupies. The mark is
  // perfectly centred — it is a single symmetric object, so geometric and
  // optical centre agree and no nudge is needed.
  const scale = (size * fill) / TOTAL_H;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${background === 'none' ? '' : `<rect width="${size}" height="${size}" fill="${background}"/>`}
    <g color="${GOLD}">${bottle(size / 2, size / 2, scale, { solid })}</g>
  </svg>`;
}

/** Monochrome silhouette for the Android themed-icon slot. */
function monochromeSvg(size) {
  const scale = (size * 0.44) / TOTAL_H;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <g fill="#FFFFFF">${bottle(size / 2, size / 2, scale, { solid: true })}</g>
  </svg>`;
}

async function write(name, svg, size) {
  const file = path.join(OUT, name);
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(file);
  const kb = (fs.statSync(file).size / 1024).toFixed(1);
  console.log(`  ${name.padEnd(34)} ${size}x${size}  ${kb} KB`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  console.log('Generating ScentKeep icons...');

  // iOS app icon. Opaque — iOS rejects an icon with an alpha channel.
  await write('icon.png', iconSvg(1024, { fill: 0.6 }), 1024);

  // Android adaptive icon: the launcher masks the foreground to a circle and
  // crops the outer ~25%, so the mark must sit well inside the safe zone.
  await write(
    'android-icon-foreground.png',
    iconSvg(1024, { background: 'none', fill: 0.44 }),
    1024,
  );
  await write(
    'android-icon-background.png',
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${BG}"/></svg>`,
    1024,
  );
  await write('android-icon-monochrome.png', monochromeSvg(1024), 1024);

  // Splash mark — transparent, drawn on the splash background colour.
  await write('splash-icon.png', iconSvg(512, { background: 'none', fill: 0.72 }), 512);

  // Favicon: at 64px a 2px outline disappears, so this one takes the solid
  // silhouette instead of the outlined flacon.
  await write('favicon.png', iconSvg(64, { fill: 0.66, solid: true }), 64);

  // Play Store listing icon (required as a separate 512 PNG).
  await write('play-store-icon.png', iconSvg(512, { fill: 0.6 }), 512);

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
