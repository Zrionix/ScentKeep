/* eslint-disable */
/**
 * Renders candidate app-icon directions side by side so one can be chosen on
 * evidence rather than on a description.
 *
 *   node scripts/logo-variants.js
 *
 * Writes each candidate at 1024, then a contact sheet that shows every one at
 * 1024 / 180 / 120 / 60 px. The small sizes are the point: an icon is chosen at
 * 1024 and then lived with at 60, and most marks that look refined large turn to
 * mush small. Anything that fails the 60px column is out, however pretty it is.
 *
 * Nothing here overwrites the shipping icon. Once a direction is picked, its
 * geometry moves into generate-icons.js, which stays the single source of truth
 * for the assets the app actually builds with.
 */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const OUT = path.join(__dirname, '..', 'store', 'logo-variants');

// Brand tokens — must match src/theme/index.ts.
const BG = '#0B0A0C';
const GOLD = '#C9A961';
const GOLD_LIGHT = '#E4CB94';
const GOLD_DEEP = '#8C6F35';

// One design space for every candidate, so they are genuinely comparable and
// the contact sheet is not quietly flattering whichever one happens to be drawn
// biggest.
const D = 1000;

/** Shared gradient defs, referenced by id from any candidate that wants depth. */
const DEFS = `
  <defs>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${GOLD_LIGHT}"/>
      <stop offset="1" stop-color="${GOLD_DEEP}"/>
    </linearGradient>
    <linearGradient id="juice" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${GOLD}" stop-opacity="0.75"/>
      <stop offset="1" stop-color="${GOLD_DEEP}"/>
    </linearGradient>
  </defs>`;

/** A rect with square top corners and rounded bottom ones — liquid in a flacon. */
function liquid(x, y, w, h, r) {
  return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h - r}
          A ${r} ${r} 0 0 1 ${x + w - r} ${y + h}
          L ${x + r} ${y + h}
          A ${r} ${r} 0 0 1 ${x} ${y + h - r} Z`;
}

// --- candidates -------------------------------------------------------------
// Each returns SVG body drawn inside a 1000x1000 box, centred.

/** A. The shipping mark: outlined flacon, juice at 56%. The control. */
function flacon() {
  const capW = 168, capH = 86, neckW = 104, neckH = 52;
  const bodyW = 320, bodyH = 372, r = 52, stroke = 30;
  const totalH = capH + neckH + bodyH;
  const top = (D - totalH) / 2;
  const cx = D / 2;
  const bodyY = top + capH + neckH;
  const bodyX = cx - bodyW / 2;
  const inset = stroke - 2.5;
  const jh = bodyH * 0.56 - inset;

  return `
    <g fill="${GOLD}">
      <rect x="${cx - capW / 2}" y="${top}" width="${capW}" height="${capH}" rx="18"/>
      <rect x="${cx - neckW / 2}" y="${top + capH - 2}" width="${neckW}" height="${neckH + 4}"/>
    </g>
    <rect x="${bodyX + stroke / 2}" y="${bodyY + stroke / 2}"
          width="${bodyW - stroke}" height="${bodyH - stroke}" rx="${r - stroke / 2}"
          fill="none" stroke="${GOLD}" stroke-width="${stroke}"/>
    <path d="${liquid(bodyX + inset, bodyY + bodyH - inset - jh, bodyW - inset * 2, jh, r - inset)}"
          fill="${GOLD}"/>`;
}

/** B. Same flacon, but the fill LINE is the hero — a level gauge, which is the
 *  one thing this app does that its competitors do not. */
function levelGauge() {
  const capW = 150, capH = 76, neckW = 92, neckH = 46;
  const bodyW = 340, bodyH = 400, r = 56, stroke = 28;
  const totalH = capH + neckH + bodyH;
  const top = (D - totalH) / 2;
  const cx = D / 2;
  const bodyY = top + capH + neckH;
  const bodyX = cx - bodyW / 2;
  const inset = stroke - 2.5;
  const jh = bodyH * 0.42 - inset;
  const jy = bodyY + bodyH - inset - jh;

  return `
    <g fill="${GOLD}">
      <rect x="${cx - capW / 2}" y="${top}" width="${capW}" height="${capH}" rx="16"/>
      <rect x="${cx - neckW / 2}" y="${top + capH - 2}" width="${neckW}" height="${neckH + 4}"/>
    </g>
    <rect x="${bodyX + stroke / 2}" y="${bodyY + stroke / 2}"
          width="${bodyW - stroke}" height="${bodyH - stroke}" rx="${r - stroke / 2}"
          fill="none" stroke="${GOLD}" stroke-width="${stroke}"/>
    <path d="${liquid(bodyX + inset, jy, bodyW - inset * 2, jh, r - inset)}" fill="url(#juice)"/>
    <rect x="${bodyX + inset}" y="${jy - 11}" width="${bodyW - inset * 2}" height="22"
          fill="${GOLD_LIGHT}"/>`;
}

/** C. Solid flacon with a spray burst — reads as "perfume" instantly, at the
 *  cost of an asymmetric mark that has to be optically, not geometrically,
 *  centred. */
function atomiser() {
  const capW = 132, capH = 70, neckW = 84, neckH = 44;
  const bodyW = 300, bodyH = 350, r = 48;
  const totalH = capH + neckH + bodyH;
  const top = (D - totalH) / 2 + 20;
  // Pushed left to leave room for the burst, so the composite mass still sits
  // on the canvas centre.
  const cx = D / 2 - 78;
  const bodyY = top + capH + neckH;

  const dots = [];
  const originX = cx + capW / 2 + 16;
  const originY = top + capH / 2;
  // Three arcs of shrinking dots — a plume reads better than radiating lines,
  // which alias into grey fuzz below 120px.
  for (const [ring, count, rad, size] of [[0, 3, 92, 21], [1, 4, 156, 16], [2, 3, 224, 11]]) {
    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const a = (-52 + t * 104) * (Math.PI / 180);
      dots.push(
        `<circle cx="${originX + Math.cos(a) * rad}" cy="${originY + Math.sin(a) * rad}" r="${size}"/>`,
      );
    }
  }

  return `
    <g fill="${GOLD}">
      <rect x="${cx - capW / 2}" y="${top}" width="${capW}" height="${capH}" rx="14"/>
      <rect x="${cx - neckW / 2}" y="${top + capH - 2}" width="${neckW}" height="${neckH + 4}"/>
      <rect x="${cx - bodyW / 2}" y="${bodyY}" width="${bodyW}" height="${bodyH}" rx="${r}"/>
    </g>
    <g fill="${GOLD}" opacity="0.92">${dots.join('')}</g>`;
}

/** D. Three bottles at different levels — the wardrobe, not one bottle. Says
 *  "collection" where every other candidate says "perfume". */
function wardrobe() {
  const specs = [
    { h: 300, w: 176, fill: 0.72 },
    { h: 378, w: 196, fill: 0.45 },
    { h: 254, w: 160, fill: 0.86 },
  ];
  const gap = 34;
  const totalW = specs.reduce((s, b) => s + b.w, 0) + gap * (specs.length - 1);
  // Bottoms aligned on one shelf line — a row of objects standing on nothing
  // reads as an accident.
  const baseline = D / 2 + 210;
  let x = (D - totalW) / 2;

  return specs
    .map((b) => {
      const capW = b.w * 0.5, capH = b.h * 0.13, neckH = b.h * 0.08;
      const bodyH = b.h - capH - neckH;
      const bodyY = baseline - bodyH;
      const cx = x + b.w / 2;
      const r = b.w * 0.16;
      const stroke = 24;
      const inset = stroke - 2.5;
      const jh = (bodyH - inset) * b.fill;
      const svg = `
        <g fill="${GOLD}">
          <rect x="${cx - capW / 2}" y="${bodyY - neckH - capH}" width="${capW}" height="${capH}" rx="10"/>
          <rect x="${cx - capW * 0.32}" y="${bodyY - neckH - 2}" width="${capW * 0.64}" height="${neckH + 4}"/>
        </g>
        <rect x="${x + stroke / 2}" y="${bodyY + stroke / 2}" width="${b.w - stroke}"
              height="${bodyH - stroke}" rx="${r - stroke / 2}"
              fill="none" stroke="${GOLD}" stroke-width="${stroke}"/>
        <path d="${liquid(x + inset, baseline - inset - jh, b.w - inset * 2, jh, r - inset)}"
              fill="${GOLD}" opacity="0.85"/>`;
      x += b.w + gap;
      return svg;
    })
    .join('');
}

/** E. Droplet whose negative space is a flacon. The most "brand", the least
 *  literal — and the one most at risk of reading as a generic water app. */
function dropletCut() {
  const cy = D / 2 + 30;
  const rad = 250;
  // Classic teardrop: circle below, apex above, tangent lines between.
  const apexY = cy - rad * 2.15;
  const k = rad * 0.86;
  const drop = `M ${D / 2} ${apexY}
                C ${D / 2 + k} ${cy - rad * 0.95}, ${D / 2 + rad} ${cy - rad * 0.42}, ${D / 2 + rad} ${cy}
                A ${rad} ${rad} 0 1 1 ${D / 2 - rad} ${cy}
                C ${D / 2 - rad} ${cy - rad * 0.42}, ${D / 2 - k} ${cy - rad * 0.95}, ${D / 2} ${apexY} Z`;

  const capW = 96, capH = 50, neckW = 60, neckH = 30, bodyW = 186, bodyH = 216;
  const totalH = capH + neckH + bodyH;
  const top = cy - totalH / 2 + 26;

  return `
    <path d="${drop}" fill="url(#gold)"/>
    <g fill="${BG}">
      <rect x="${D / 2 - capW / 2}" y="${top}" width="${capW}" height="${capH}" rx="10"/>
      <rect x="${D / 2 - neckW / 2}" y="${top + capH - 2}" width="${neckW}" height="${neckH + 4}"/>
      <rect x="${D / 2 - bodyW / 2}" y="${top + capH + neckH}" width="${bodyW}" height="${bodyH}" rx="30"/>
    </g>`;
}

/** F. Monogram: an S set inside a flacon outline. Scales further down than any
 *  pictorial mark, but says nothing about the category on its own. */
function monogram() {
  const capW = 156, capH = 80, neckW = 96, neckH = 48;
  const bodyW = 330, bodyH = 386, r = 54, stroke = 28;
  const totalH = capH + neckH + bodyH;
  const top = (D - totalH) / 2;
  const cx = D / 2;
  const bodyY = top + capH + neckH;

  // Drawn as a stroked path rather than set in a font: no webfont dependency,
  // and the weight can be tuned to survive the 60px column.
  const w = bodyW * 0.34;
  const scy = bodyY + bodyH / 2;
  const s = `M ${cx + w} ${scy - bodyH * 0.20}
             C ${cx + w} ${scy - bodyH * 0.32}, ${cx - w} ${scy - bodyH * 0.34}, ${cx - w} ${scy - bodyH * 0.16}
             C ${cx - w} ${scy + bodyH * 0.02}, ${cx + w} ${scy - bodyH * 0.02}, ${cx + w} ${scy + bodyH * 0.16}
             C ${cx + w} ${scy + bodyH * 0.34}, ${cx - w} ${scy + bodyH * 0.32}, ${cx - w} ${scy + bodyH * 0.20}`;

  return `
    <g fill="${GOLD}">
      <rect x="${cx - capW / 2}" y="${top}" width="${capW}" height="${capH}" rx="16"/>
      <rect x="${cx - neckW / 2}" y="${top + capH - 2}" width="${neckW}" height="${neckH + 4}"/>
    </g>
    <rect x="${cx - bodyW / 2 + stroke / 2}" y="${bodyY + stroke / 2}"
          width="${bodyW - stroke}" height="${bodyH - stroke}" rx="${r - stroke / 2}"
          fill="none" stroke="${GOLD}" stroke-width="${stroke}"/>
    <path d="${s}" fill="none" stroke="${GOLD}" stroke-width="46"
          stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** G. Flacon on a warm gold field rather than near-black. Same mark, inverted —
 *  worth seeing, because a dark icon disappears on a dark home screen. */
function inverted() {
  const capW = 168, capH = 86, neckW = 104, neckH = 52;
  const bodyW = 320, bodyH = 372, r = 52, stroke = 30;
  const totalH = capH + neckH + bodyH;
  const top = (D - totalH) / 2;
  const cx = D / 2;
  const bodyY = top + capH + neckH;
  const bodyX = cx - bodyW / 2;
  const inset = stroke - 2.5;
  const jh = bodyH * 0.56 - inset;

  return `
    <g fill="${BG}">
      <rect x="${cx - capW / 2}" y="${top}" width="${capW}" height="${capH}" rx="18"/>
      <rect x="${cx - neckW / 2}" y="${top + capH - 2}" width="${neckW}" height="${neckH + 4}"/>
    </g>
    <rect x="${bodyX + stroke / 2}" y="${bodyY + stroke / 2}"
          width="${bodyW - stroke}" height="${bodyH - stroke}" rx="${r - stroke / 2}"
          fill="none" stroke="${BG}" stroke-width="${stroke}"/>
    <path d="${liquid(bodyX + inset, bodyY + bodyH - inset - jh, bodyW - inset * 2, jh, r - inset)}"
          fill="${BG}"/>`;
}

/** H. Flacon with a diary dot-row beneath it — the daily loop, which is the
 *  habit the whole product is built around. */
function diary() {
  const capW = 144, capH = 74, neckW = 88, neckH = 44;
  const bodyW = 300, bodyH = 330, r = 48, stroke = 28;
  const dotR = 20, dotGap = 66;
  const totalH = capH + neckH + bodyH + 62 + dotR * 2;
  const top = (D - totalH) / 2;
  const cx = D / 2;
  const bodyY = top + capH + neckH;
  const bodyX = cx - bodyW / 2;
  const inset = stroke - 2.5;
  const jh = bodyH * 0.5 - inset;
  const dotY = bodyY + bodyH + 62 + dotR;

  // Four logged days and one missed — a streak that is honest about gaps,
  // which is also how the Diary screen renders it.
  const dots = [1, 1, 1, 0, 1]
    .map((on, i) => {
      const x = cx + (i - 2) * dotGap;
      return on
        ? `<circle cx="${x}" cy="${dotY}" r="${dotR}" fill="${GOLD}"/>`
        : `<circle cx="${x}" cy="${dotY}" r="${dotR - 5}" fill="none" stroke="${GOLD}" stroke-width="10" opacity="0.55"/>`;
    })
    .join('');

  return `
    <g fill="${GOLD}">
      <rect x="${cx - capW / 2}" y="${top}" width="${capW}" height="${capH}" rx="15"/>
      <rect x="${cx - neckW / 2}" y="${top + capH - 2}" width="${neckW}" height="${neckH + 4}"/>
    </g>
    <rect x="${bodyX + stroke / 2}" y="${bodyY + stroke / 2}"
          width="${bodyW - stroke}" height="${bodyH - stroke}" rx="${r - stroke / 2}"
          fill="none" stroke="${GOLD}" stroke-width="${stroke}"/>
    <path d="${liquid(bodyX + inset, bodyY + bodyH - inset - jh, bodyW - inset * 2, jh, r - inset)}"
          fill="${GOLD}"/>
    ${dots}`;
}

const CANDIDATES = [
  { key: 'a-flacon', label: 'A · Flacon (current)', draw: flacon },
  { key: 'b-level', label: 'B · Level gauge', draw: levelGauge },
  { key: 'c-atomiser', label: 'C · Atomiser', draw: atomiser },
  { key: 'd-wardrobe', label: 'D · Wardrobe of three', draw: wardrobe },
  { key: 'e-droplet', label: 'E · Droplet cut-out', draw: dropletCut },
  { key: 'f-monogram', label: 'F · Monogram S', draw: monogram },
  { key: 'g-inverted', label: 'G · Gold field', draw: inverted },
  { key: 'h-diary', label: 'H · Daily streak', draw: diary },
];

/** `fill` is the fraction of the canvas the mark occupies — iOS icons want a
 *  generous margin, and a mark that touches the edge looks cheap under the
 *  superellipse mask. */
function iconSvg(candidate, size, fill = 0.62) {
  const bg = candidate.key === 'g-inverted' ? GOLD : BG;
  const s = (size * fill) / D;
  const off = (size - D * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${DEFS}
    <rect width="${size}" height="${size}" fill="${bg}"/>
    <g transform="translate(${off} ${off}) scale(${s})">${candidate.draw()}</g>
  </svg>`;
}

const SIZES = [1024, 180, 120, 60];
const SHEET_PAD = 40;
const ROW_GAP = 34;
const LABEL_W = 300;
const CELL = 200; // the 1024 render is shown at 200px on the sheet

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  console.log('Rendering logo candidates...\n');

  const rows = [];
  for (const c of CANDIDATES) {
    for (const size of SIZES) {
      const file = path.join(OUT, `${c.key}-${size}.png`);
      await sharp(Buffer.from(iconSvg(c, size))).png().toFile(file);
    }
    console.log(`  ${c.label}`);
    rows.push(c);
  }

  // --- contact sheet --------------------------------------------------------
  const colX = [LABEL_W, LABEL_W + CELL + ROW_GAP, LABEL_W + CELL + ROW_GAP + 180 + ROW_GAP];
  const colX4 = colX[2] + 120 + ROW_GAP;
  const sheetW = colX4 + 60 + SHEET_PAD * 2;
  const rowH = CELL + ROW_GAP;
  const sheetH = SHEET_PAD * 2 + 60 + rows.length * rowH;

  const header =
    `<text x="${SHEET_PAD}" y="${SHEET_PAD + 28}" fill="#F5F2EC" font-size="30" font-family="Georgia, serif">ScentKeep — icon directions</text>` +
    [
      [colX[0], '1024'],
      [colX[1], '180'],
      [colX[2], '120'],
      [colX4, '60'],
    ]
      .map(
        ([x, t]) =>
          `<text x="${SHEET_PAD + x}" y="${SHEET_PAD + 56}" fill="#8A8580" font-size="17" font-family="Helvetica, Arial, sans-serif">${t} px</text>`,
      )
      .join('');

  const labels = rows
    .map((c, i) => {
      const y = SHEET_PAD + 60 + i * rowH + CELL / 2 + 7;
      return `<text x="${SHEET_PAD}" y="${y}" fill="#F5F2EC" font-size="22" font-family="Helvetica, Arial, sans-serif">${c.label}</text>`;
    })
    .join('');

  const sheetBase = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetW}" height="${sheetH}">
      <rect width="${sheetW}" height="${sheetH}" fill="#141316"/>
      ${header}${labels}
    </svg>`,
  );

  const composites = [];
  for (let i = 0; i < rows.length; i += 1) {
    const c = rows[i];
    const top = SHEET_PAD + 60 + i * rowH;
    const place = async (size, shownAt, x) => {
      const buf = await sharp(Buffer.from(iconSvg(c, Math.max(size, shownAt))))
        .resize(shownAt, shownAt)
        .png()
        .toBuffer();
      composites.push({ input: buf, left: SHEET_PAD + x, top: top + (CELL - shownAt) / 2 });
    };
    await place(1024, CELL, colX[0]);
    await place(180, 180, colX[1]);
    await place(120, 120, colX[2]);
    await place(60, 60, colX4);
  }

  const sheet = path.join(OUT, 'contact-sheet.png');
  await sharp(sheetBase).composite(composites).png().toFile(sheet);

  console.log(`\nContact sheet: ${path.relative(process.cwd(), sheet)}`);
  console.log(`Individual renders: ${path.relative(process.cwd(), OUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
