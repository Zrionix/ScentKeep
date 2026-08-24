/* eslint-disable */
// ---------------------------------------------------------------------------
// Slide templates.
//
// Every template is a pure function of (ctx, slide, config, theme). It reads
// its content from the config and NEVER from a literal — the deck is data, and
// a template that hardcodes a bottle name is a template that lies the moment
// somebody edits the JSON.
//
// All drawing is clipped to Draw.BOX by the renderer, so a template physically
// cannot place text in a platform safe zone.
// ---------------------------------------------------------------------------

(function () {
  const D = window.Draw;
  const BOX = D.BOX;

  /** Resolve a deck entry against the config: per-slide overrides win. */
  function pick(slide, cfg, key) {
    return slide[key] !== undefined ? slide[key] : cfg[key];
  }

  /** The eyebrow + hairline that opens most slides. Returns the next y. */
  function head(ctx, T, text, y) {
    D.label(ctx, T, text, BOX.x, y, { size: 26 });
    D.rule(ctx, T, BOX.x, y + 26, 120);
    return y + 26;
  }

  /**
   * A ranked or plain list of { primary, secondary, trailing } rows.
   *
   * Rows are sized to the count so five entries and nine entries both fill the
   * frame properly instead of five looking sparse and nine running off it.
   */
  function list(ctx, T, rows, top, opts) {
    const o = opts || {};
    const available = BOX.y + BOX.h - top - 90;
    const step = Math.min(o.step || 132, available / Math.max(rows.length, 1));
    const nameSize = Math.min(52, Math.max(30, step * 0.40));
    const metaSize = Math.min(26, Math.max(18, step * 0.19));

    rows.forEach(function (row, i) {
      const y = top + step * i;
      let x = BOX.x;

      if (o.ranked) {
        ctx.font = D.serif(Math.round(nameSize * 0.86), 400);
        ctx.fillStyle = T.accent;
        ctx.textBaseline = 'alphabetic';
        const n = String(i + 1);
        ctx.fillText(n, x, y);
        x += Math.max(58, ctx.measureText(n).width + 34);
      }

      // Trailing value first, so the name can be truncated against it rather
      // than drawn over it.
      let trailingW = 0;
      if (row.trailing) {
        ctx.font = D.serif(Math.round(nameSize * 0.78), 400);
        trailingW = ctx.measureText(row.trailing).width + 28;
      }

      ctx.font = D.serif(nameSize, 400);
      ctx.fillStyle = T.ink;
      ctx.textBaseline = 'alphabetic';
      let name = row.primary;
      const room = BOX.x + BOX.w - x - trailingW;
      if (ctx.measureText(name).width > room) {
        while (name.length > 4 && ctx.measureText(name + '…').width > room) name = name.slice(0, -1);
        name += '…';
      }
      ctx.fillText(name, x, y);

      if (row.trailing) {
        ctx.font = D.serif(Math.round(nameSize * 0.78), 400);
        ctx.fillStyle = T.accent;
        ctx.textAlign = 'right';
        ctx.fillText(row.trailing, BOX.x + BOX.w, y);
        ctx.textAlign = 'left';
      }

      if (row.secondary) {
        D.label(ctx, T, row.secondary, x, y + metaSize + 14, { size: metaSize, color: T.dim });
      }

      if (i < rows.length - 1) D.rule(ctx, T, BOX.x, y + step - 46, BOX.w);
    });
  }

  const TEMPLATES = {
    // 1 ---------------------------------------------------------------------
    stats: {
      label: 'Collection stats',
      draw: function (ctx, slide, cfg, T) {
        const c = pick(slide, cfg, 'collection') || {};
        // Absolute baselines, not accumulated offsets. Offsets are how the
        // value ended up overlapping its own divider: each block's size is
        // fitted at draw time, so "previous y plus a bit" is not a position
        // anyone can reason about.
        head(ctx, T, slide.eyebrow || 'My wardrobe', BOX.y + 110);

        const bottles = String(c.bottles == null ? '—' : c.bottles);
        D.figure(ctx, T, bottles, BOX.x, BOX.y + 380, {
          max: 280, caption: c.bottles === 1 ? 'Bottle' : 'Bottles',
        });

        D.rule(ctx, T, BOX.x, BOX.y + 600, BOX.w);

        D.figure(ctx, T, D.money(c.value, c.currency, 0), BOX.x, BOX.y + 850, {
          max: 200, color: T.accent, caption: slide.valueLabel || 'Invested',
        });
      },
    },

    // 2 ---------------------------------------------------------------------
    costPerWear: {
      label: 'Cost per wear',
      draw: function (ctx, slide, cfg, T) {
        const listed = pick(slide, cfg, 'costPerWear') || [];
        const b = slide.bottle || listed[slide.index || 0] || {};
        const wears = Number(b.wears) || 0;
        const price = Number(b.price) || 0;
        const cpw = wears > 0 ? price / wears : null;
        const currency = b.currency || (cfg.collection && cfg.collection.currency) || 'USD';

        head(ctx, T, slide.eyebrow || 'Cost per wear', BOX.y + 100);

        // The name grows DOWNWARD from a fixed top; the reveal is pinned near
        // the middle. A two-line name therefore eats its own whitespace rather
        // than pushing the number into itself.
        const nameY = D.paragraph(ctx, T, b.name || '—', BOX.x, BOX.y + 230, BOX.w, { size: 58, lh: 1.2 });
        if (b.house) D.label(ctx, T, b.house, BOX.x, nameY + 56, { size: 26, color: T.dim });

        // Two decimals under $10, because "$3.97" is the entire hook and "$4"
        // throws it away.
        const text = cpw == null ? '—' : D.money(cpw, currency, cpw < 10 ? 2 : 0);
        D.figure(ctx, T, text, BOX.x, BOX.y + 760, {
          max: 280, min: 100, color: T.accent, caption: 'Per wear',
        });

        D.rule(ctx, T, BOX.x, BOX.y + 970, BOX.w);
        // Weight 400: Cormorant's 300 is a hairline, and at 38px the proof
        // behind the headline number was the faintest thing on the slide.
        ctx.font = D.serif(40, 400);
        ctx.fillStyle = T.dim;
        ctx.fillText(D.money(price, currency, 0) + '  ·  ' + D.plural(wears, 'wear', 'wears'), BOX.x, BOX.y + 1032);
      },
    },

    // 3 ---------------------------------------------------------------------
    sotd: {
      label: 'Scent of the day',
      draw: function (ctx, slide, cfg, T) {
        const s = slide.sotd || pick(slide, cfg, 'sotd') || {};
        let y = head(ctx, T, slide.eyebrow || 'Scent of the day', BOX.y + 110);

        y += 130;
        const nameY = D.paragraph(ctx, T, s.name || '—', BOX.x, y, BOX.w, { size: 84, lh: 1.14 });
        if (s.house) D.label(ctx, T, s.house, BOX.x, nameY + 66, { size: 28, color: T.dim });

        y = nameY + 190;
        if (s.occasion) {
          const w = D.labelWidth(ctx, s.occasion, 24) + 56;
          ctx.strokeStyle = T.accent;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.rect(BOX.x, y - 34, w, 60);
          ctx.stroke();
          D.label(ctx, T, s.occasion, BOX.x + 28, y + 6, { size: 24 });
          y += 120;
        }

        if (s.note) {
          D.paragraph(ctx, T, '“' + s.note + '”', BOX.x, y, BOX.w, { size: 44, lh: 1.42, color: T.ink });
        }
      },
    },

    // 4 ---------------------------------------------------------------------
    mostWorn: {
      label: 'Most worn',
      draw: function (ctx, slide, cfg, T) {
        const rows = (slide.mostWorn || pick(slide, cfg, 'mostWorn') || []).slice(0, slide.limit || 5);
        let y = head(ctx, T, slide.eyebrow || 'Most worn this month', BOX.y + 90);
        y += 150;
        list(ctx, T, rows.map(function (r) {
          return {
            primary: r.name,
            secondary: r.house,
            trailing: r.wears == null ? '' : String(r.wears) + '×',
          };
        }), y, { ranked: true });
      },
    },

    // 5 ---------------------------------------------------------------------
    neglected: {
      label: 'Neglected bottles',
      draw: function (ctx, slide, cfg, T) {
        const n = slide.neglected || pick(slide, cfg, 'neglected') || {};
        const bottles = n.bottles || [];
        const count = n.count == null ? bottles.length : n.count;
        const days = n.days || 90;

        let y = head(ctx, T, slide.eyebrow || 'Gathering dust', BOX.y + 90);
        y += 140;
        const headline = D.plural(count, 'bottle', 'bottles') + ' you have not worn in ' + days + ' days';
        const hy = D.paragraph(ctx, T, headline, BOX.x, y, BOX.w, { size: 64, lh: 1.2 });

        y = hy + 130;
        list(ctx, T, bottles.slice(0, slide.limit || 5).map(function (b) {
          return { primary: b.name, secondary: b.house, trailing: b.lastWorn || '' };
        }), y, { step: 112 });
      },
    },

    // 6 ---------------------------------------------------------------------
    families: {
      label: 'Family breakdown',
      draw: function (ctx, slide, cfg, T) {
        const rows = (slide.families || pick(slide, cfg, 'families') || []).slice(0, 6);
        let y = head(ctx, T, slide.eyebrow || 'By family', BOX.y + 90);
        y += 150;

        const max = rows.reduce(function (m, r) { return Math.max(m, Number(r.percent) || 0); }, 0) || 1;
        const step = Math.min(170, (BOX.y + BOX.h - y - 70) / Math.max(rows.length, 1));

        rows.forEach(function (r, i) {
          const ry = y + step * i;
          const pct = Number(r.percent) || 0;

          ctx.font = D.serif(46, 400);
          ctx.fillStyle = T.ink;
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(r.name, BOX.x, ry);

          ctx.font = D.serif(40, 300);
          ctx.fillStyle = T.accent;
          ctx.textAlign = 'right';
          ctx.fillText(pct + '%', BOX.x + BOX.w, ry);
          ctx.textAlign = 'left';

          // A hairline track with a filled portion. Proportional to the LARGEST
          // share, not to 100 — otherwise a well-spread collection renders as
          // six near-identical stubs and says nothing.
          const barY = ry + 30;
          ctx.fillStyle = T.rule;
          ctx.fillRect(BOX.x, barY, BOX.w, 3);
          ctx.fillStyle = T.accent;
          ctx.fillRect(BOX.x, barY, BOX.w * (pct / max), 3);
        });
      },
    },

    // 7 ---------------------------------------------------------------------
    wishlist: {
      label: 'Wishlist',
      draw: function (ctx, slide, cfg, T) {
        const rows = (slide.wishlist || pick(slide, cfg, 'wishlist') || []).slice(0, slide.limit || 4);
        let y = head(ctx, T, slide.eyebrow || 'Next in line', BOX.y + 100);
        y += 150;
        list(ctx, T, rows.map(function (r) {
          return { primary: r.name, secondary: r.house, trailing: r.note || '' };
        }), y, { step: 160 });
      },
    },

    // 8 ---------------------------------------------------------------------
    quote: {
      label: 'Quote / mood',
      draw: function (ctx, slide, cfg, T) {
        const text = slide.quote || pick(slide, cfg, 'quote') || '';
        ctx.textAlign = 'center';
        const cx = BOX.x + BOX.w / 2;

        // Vertically centred by measuring first. A centred quote that sits high
        // because nobody measured it is the most obvious tell of a template.
        ctx.font = D.serif(72, 300);
        const lines = D.wrap(ctx, text, BOX.w - 60);
        const lh = 72 * 1.38;
        let y = BOX.y + BOX.h / 2 - (lines.length - 1) * lh / 2;

        ctx.fillStyle = T.accent;
        ctx.font = D.serif(120, 300);
        ctx.fillText('“', cx, y - 150);

        ctx.font = D.serif(72, 300);
        ctx.fillStyle = T.ink;
        ctx.textBaseline = 'alphabetic';
        lines.forEach(function (line) { ctx.fillText(line, cx, y); y += lh; });

        if (slide.attribution) {
          D.label(ctx, T, slide.attribution, cx - D.labelWidth(ctx, slide.attribution, 24) / 2, y + 60, { size: 24, color: T.dim });
        }
        ctx.textAlign = 'left';
      },
    },

    // Bonus, and the reason is practical: a deck with no closing frame sends
    // people nowhere. Not one of the eight in the brief.
    outro: {
      label: 'Outro / call to action',
      draw: function (ctx, slide, cfg, T) {
        ctx.textAlign = 'center';
        const cx = BOX.x + BOX.w / 2;
        let y = BOX.y + BOX.h / 2 - 120;

        ctx.font = D.serif(96, 300);
        ctx.fillStyle = T.ink;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText((cfg.brand && cfg.brand.wordmark) || 'ScentKeep', cx, y);

        y += 70;
        D.rule(ctx, T, cx - 60, y, 120);

        y += 90;
        const line = slide.line || 'Track what you own. Know what you wear.';
        ctx.textAlign = 'center';
        ctx.font = D.serif(44, 300);
        // T.ink, not T.dim. This line is the pitch; at thumbnail size the dim
        // tone dropped it below reading contrast on the dark grounds.
        ctx.fillStyle = T.ink;
        D.wrap(ctx, line, BOX.w - 80).forEach(function (l) { ctx.fillText(l, cx, y); y += 44 * 1.4; });

        y += 80;
        const cta = slide.cta || 'On the App Store';
        D.label(ctx, T, cta, cx - D.labelWidth(ctx, cta, 28) / 2, y, { size: 28 });
        ctx.textAlign = 'left';
      },
    },
  };

  window.Templates = TEMPLATES;
})();
