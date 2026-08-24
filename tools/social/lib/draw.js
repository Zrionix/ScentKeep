/* eslint-disable */
// ---------------------------------------------------------------------------
// Drawing toolkit for the 1080x1920 slide canvas.
//
// Everything renders to a real canvas at full size and is CSS-scaled for
// preview, so the pixels you record are the pixels you export. The alternative
// — a DOM preview plus a separate rasteriser — gives you two renderers that
// disagree in small ways you only notice after posting.
// ---------------------------------------------------------------------------

const W = 1080;
const H = 1920;

/**
 * Bands reserved for platform chrome, as fractions of the canvas.
 *
 * Top: status bar and the Reels/TikTok header. Bottom: caption, handle, audio
 * ticker — the tallest and the most frequently underestimated. Right: TikTok's
 * action rail (avatar, like, comment, share, spinning disc).
 */
const RESERVED = { top: 0.12, bottom: 0.22, right: 0.15 };

/**
 * The only region text is allowed to occupy.
 *
 * Templates are CLIPPED to this rectangle by the renderer, so a slide cannot
 * put a word under the caption bar even if a template misbehaves or a user
 * pastes in a much longer fragrance name than anyone designed for. The guide
 * overlay is there to see it; the clip is what guarantees it.
 *
 * The left inset is a design margin, not a platform constraint.
 */
const BOX = (() => {
  const left = 96;
  const top = Math.round(H * RESERVED.top);
  const right = Math.round(W * RESERVED.right);
  const bottom = Math.round(H * RESERVED.bottom);
  return { x: left, y: top, w: W - right - left, h: H - top - bottom };
})();

const THEMES = {
  noir: { bg: ['#16130F', '#241E17'], ink: '#F4F0E9', dim: '#9C9184', accent: '#C9A961', rule: 'rgba(201,169,97,0.30)' },
  paper: { bg: ['#F6F2EA', '#EAE3D6'], ink: '#1A1611', dim: '#6F6558', accent: '#9C7C3A', rule: 'rgba(26,22,17,0.16)' },
  amber: { bg: ['#3A2C18', '#1D160C'], ink: '#F7EEDC', dim: '#B9A480', accent: '#E0BB74', rule: 'rgba(224,187,116,0.32)' },
  ink: { bg: ['#101315', '#1B2226'], ink: '#EFF1F2', dim: '#8D9698', accent: '#BFA871', rule: 'rgba(191,168,113,0.30)' },
};

const DISPLAY = '"Cormorant Garamond", "Playfair Display", Georgia, "Times New Roman", serif';
const LABEL = '"Inter", -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';

const serif = (size, weight) => (weight || 300) + ' ' + size + 'px ' + DISPLAY;
const sans = (size, weight) => (weight || 500) + ' ' + size + 'px ' + LABEL;

// --- text -------------------------------------------------------------------

/**
 * Letter-spaced text.
 *
 * Chrome's `ctx.letterSpacing` does this properly, including in the metrics.
 * Everywhere else gets a per-character fallback, so tracked labels degrade to
 * slightly-off spacing rather than silently collapsing to none — which would
 * quietly undo the whole label treatment on a non-Chromium browser.
 */
const SUPPORTS_TRACKING = typeof CanvasRenderingContext2D !== 'undefined'
  && 'letterSpacing' in CanvasRenderingContext2D.prototype;

function trackedWidth(ctx, text, tracking) {
  if (SUPPORTS_TRACKING) {
    ctx.letterSpacing = tracking + 'px';
    const w = ctx.measureText(text).width;
    ctx.letterSpacing = '0px';
    return w;
  }
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + tracking;
  return w - (text.length ? tracking : 0);
}

function drawTracked(ctx, text, x, y, tracking) {
  if (SUPPORTS_TRACKING) {
    ctx.letterSpacing = tracking + 'px';
    ctx.fillText(text, x, y);
    ctx.letterSpacing = '0px';
    return;
  }
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + tracking;
  }
}

/**
 * Greedy word wrap. A word longer than the line is left to overflow rather than
 * broken — fragrance names read worse hyphenated mid-word, and the clip catches
 * anything genuinely absurd.
 */
function wrap(ctx, text, maxWidth) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? line + ' ' + word : word;
      if (ctx.measureText(next).width <= maxWidth || !line) line = next;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}

/**
 * The largest size at or below `start` that fits `text` on one line.
 *
 * The big number IS the slide on several of these, so it is sized to the space
 * rather than to a guess. "$2,140" and "$148,900" both want to be as large as
 * they can be, and neither should ever arrive clipped.
 */
function fitOneLine(ctx, text, maxWidth, start, min, mk) {
  const make = mk || serif;
  const floor = min || 40;
  let size = start;
  while (size > floor) {
    ctx.font = make(size);
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 4;
  }
  ctx.font = make(size);
  return size;
}

// --- blocks -----------------------------------------------------------------

/** Small tracked caps — the recurring label treatment across every template. */
function label(ctx, T, text, x, y, opts) {
  const o = opts || {};
  const size = o.size || 26;
  ctx.font = sans(size, 500);
  ctx.fillStyle = o.color || T.accent;
  ctx.textBaseline = 'alphabetic';
  drawTracked(ctx, String(text).toUpperCase(), x, y, size * 0.28);
  return y;
}

function labelWidth(ctx, text, size) {
  const s = size || 26;
  ctx.font = sans(s, 500);
  return trackedWidth(ctx, String(text).toUpperCase(), s * 0.28);
}

function rule(ctx, T, x, y, w, color) {
  ctx.fillStyle = color || T.rule;
  ctx.fillRect(x, y, w, 1.5);
}

/** A wrapped paragraph. Returns the baseline of the last line drawn. */
function paragraph(ctx, T, text, x, y, w, opts) {
  const o = opts || {};
  const size = o.size || 40;
  const lh = o.lh || 1.42;
  const mk = o.mk || serif;
  ctx.font = o.weight ? mk(size, o.weight) : mk(size);
  ctx.fillStyle = o.color || T.ink;
  ctx.textBaseline = 'alphabetic';
  const lines = wrap(ctx, text, w);
  let cy = y;
  for (const line of lines) {
    ctx.fillText(line, x, cy);
    cy += size * lh;
  }
  return cy - size * lh;
}

/**
 * A large fitted number with its caption underneath.
 *
 * The caption offset is proportional to the FITTED size, not a fixed gap, and
 * that is the entire point of this existing. Cormorant sets oldstyle figures —
 * 3, 4, 5, 7 and 9 descend well below the baseline — so "34" over a caption 70px
 * down put the label straight through the digits, and "$3.97" did the same to
 * "PER WEAR". A constant gap is only safe for a constant size, and every number
 * here is fitted to its own width.
 */
function figure(ctx, T, text, x, baseline, opts) {
  const o = opts || {};
  const size = fitOneLine(ctx, text, o.maxWidth || BOX.w, o.max || 280, o.min || 90);
  ctx.fillStyle = o.color || T.ink;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, baseline);
  let end = baseline + size * 0.34;
  if (o.caption) {
    end += 34;
    label(ctx, T, o.caption, x, end, { size: o.captionSize || 28, color: o.captionColor || T.dim });
  }
  return end;
}

// --- backgrounds ------------------------------------------------------------

function background(ctx, T, photo) {
  const g = ctx.createLinearGradient(0, 0, W * 0.35, H);
  g.addColorStop(0, T.bg[0]);
  g.addColorStop(1, T.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (photo && photo.complete && photo.naturalWidth) {
    // Cover-fit, centred.
    const scale = Math.max(W / photo.naturalWidth, H / photo.naturalHeight);
    const dw = photo.naturalWidth * scale;
    const dh = photo.naturalHeight * scale;
    ctx.drawImage(photo, (W - dw) / 2, (H - dh) / 2, dw, dh);

    // The scrim, weighted towards where the copy sits and towards the bottom.
    // Without it a bright photo makes the text unreadable at thumbnail size,
    // which is the failure mode of every photo-background template.
    const s = ctx.createLinearGradient(0, 0, 0, H);
    s.addColorStop(0, 'rgba(12,10,8,0.55)');
    s.addColorStop(0.45, 'rgba(12,10,8,0.68)');
    s.addColorStop(1, 'rgba(12,10,8,0.86)');
    ctx.fillStyle = s;
    ctx.fillRect(0, 0, W, H);
  } else {
    // A faint off-centre glow, so a flat background is not quite flat.
    const r = ctx.createRadialGradient(W * 0.72, H * 0.22, 40, W * 0.72, H * 0.22, W * 0.95);
    r.addColorStop(0, 'rgba(201,169,97,0.10)');
    r.addColorStop(1, 'rgba(201,169,97,0)');
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, W, H);
  }
}

// --- furniture --------------------------------------------------------------

function wordmark(ctx, T, text) {
  ctx.font = sans(24, 500);
  ctx.fillStyle = T.dim;
  ctx.textBaseline = 'alphabetic';
  // Inset 14px. A baseline sitting exactly on BOX.y + BOX.h puts the glyph
  // antialiasing on the first row of the caption band — measurably, one row of
  // it. Nothing legible, but "leave the band clear" should mean clear.
  drawTracked(ctx, String(text).toUpperCase(), BOX.x, BOX.y + BOX.h - 14, 24 * 0.32);
}

/**
 * The sample-data marker.
 *
 * On by default, because the config this tool ships with is invented. Real
 * numbers are the user's to supply, and a post of made-up stats presented as
 * somebody's actual collection is very hard to walk back once it is out.
 */
function sampleTag(ctx, T) {
  const text = 'SAMPLE DATA';
  const size = 20;
  const w = labelWidth(ctx, text, size);
  const padX = 18;
  const padY = 12;
  // Same reason as the wordmark: a 2px border centred on BOX.x + BOX.w lands
  // half of itself in the action-rail band.
  const x = BOX.x + BOX.w - w - padX * 2 - 12;
  const y = BOX.y + 4;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.strokeStyle = T.rule;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.rect(x, y, w + padX * 2, size + padY * 2);
  ctx.fill();
  ctx.stroke();
  ctx.font = sans(size, 500);
  ctx.fillStyle = T.dim;
  ctx.textBaseline = 'top';
  drawTracked(ctx, text, x + padX, y + padY + 2, size * 0.28);
  ctx.textBaseline = 'alphabetic';
}

/** The reserved bands, drawn for the eye. Never exported, never recorded. */
function guides(ctx) {
  const bands = [
    [0, 0, W, Math.round(H * RESERVED.top), 'TOP 12% — status bar / app header'],
    [0, H - Math.round(H * RESERVED.bottom), W, Math.round(H * RESERVED.bottom), 'BOTTOM 22% — caption / handle / audio'],
    [W - Math.round(W * RESERVED.right), 0, Math.round(W * RESERVED.right), H, 'RIGHT 15% — action rail'],
  ];
  ctx.save();
  for (const band of bands) {
    ctx.fillStyle = 'rgba(220,40,60,0.16)';
    ctx.fillRect(band[0], band[1], band[2], band[3]);
    ctx.strokeStyle = 'rgba(220,40,60,0.65)';
    ctx.lineWidth = 2;
    ctx.strokeRect(band[0], band[1], band[2], band[3]);
    ctx.font = sans(20, 600);
    ctx.fillStyle = 'rgba(255,235,235,0.95)';
    ctx.textBaseline = 'top';
    ctx.fillText(band[4], band[0] + 14, band[1] + 12);
  }
  ctx.strokeStyle = 'rgba(80,200,140,0.9)';
  ctx.setLineDash([12, 10]);
  ctx.lineWidth = 2;
  ctx.strokeRect(BOX.x, BOX.y, BOX.w, BOX.h);
  ctx.setLineDash([]);
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

// --- formatting -------------------------------------------------------------

function money(n, currency, decimals) {
  const v = Number(n);
  const d = decimals === undefined ? 0 : decimals;
  if (!Number.isFinite(v)) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    }).format(v);
  } catch (e) {
    return v.toFixed(d);
  }
}

function plural(n, one, many) {
  return n + ' ' + (n === 1 ? one : many);
}

window.Draw = {
  W: W, H: H, BOX: BOX, RESERVED: RESERVED, THEMES: THEMES,
  serif: serif, sans: sans, wrap: wrap, fitOneLine: fitOneLine,
  label: label, labelWidth: labelWidth, rule: rule, paragraph: paragraph,
  figure: figure, background: background, wordmark: wordmark, sampleTag: sampleTag,
  guides: guides, drawTracked: drawTracked, money: money, plural: plural,
};
