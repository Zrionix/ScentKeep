/* eslint-disable */
// ---------------------------------------------------------------------------
// Slide Studio — state, navigation, record mode, export.
//
// One renderer serves all three jobs. `render()` draws the current slide to the
// 1080x1920 canvas; the preview is that canvas scaled by CSS, record mode is
// that canvas fullscreen, and export is that canvas as a PNG. There is no
// second code path that could drift from the first.
// ---------------------------------------------------------------------------

(function () {
  const D = window.Draw;
  const canvas = document.getElementById('canvas');
  const visibleCtx = canvas.getContext('2d');

  const STORAGE_KEY = 'scentkeep.slidestudio.config';

  const state = {
    config: null,
    index: 0,
    guides: false,
    recording: false,
    timer: null,
    /** Slide index -> HTMLImageElement. Deliberately outside the config: data
     *  URLs would bloat the JSON textarea past usability and blow the
     *  localStorage quota on the second photo. */
    photos: {},
  };

  const $ = (id) => document.getElementById(id);

  // --- config ---------------------------------------------------------------

  function loadConfig() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      /* corrupt or unavailable storage falls through to the sample deck */
    }
    return JSON.parse(JSON.stringify(window.DEFAULT_CONFIG));
  }

  function saveConfig() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config));
    } catch (e) {
      /* private mode, quota — the deck still works, it just will not persist */
    }
  }

  function deck() {
    const d = state.config && state.config.deck;
    return Array.isArray(d) && d.length ? d : [{ template: 'quote', quote: 'Add slides to the deck.' }];
  }

  // --- render ---------------------------------------------------------------

  /**
   * Draws one slide.
   *
   * `target` and `at` exist for the audit, which renders to an offscreen canvas
   * at a chosen index. Without them the audit read the visible canvas, and any
   * render that happened to land between its two captures — the font-load
   * repaint, for one — made a whole slide look like a safe-zone violation.
   */
  function render(target, at) {
    const ctx = target || visibleCtx;
    const slides = deck();
    if (state.index >= slides.length) state.index = slides.length - 1;
    if (state.index < 0) state.index = 0;

    const slide = slides[at === undefined ? state.index : at];
    const cfg = state.config;
    const T = D.THEMES[slide.theme] || D.THEMES.noir;
    const tpl = window.Templates[slide.template];

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, D.W, D.H);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    const idx = at === undefined ? state.index : at;
    D.background(ctx, T, state.photos[idx]);

    if (!tpl) {
      ctx.fillStyle = T.ink;
      ctx.font = D.sans(40, 500);
      ctx.fillText('Unknown template: ' + slide.template, D.BOX.x, D.BOX.y + 80);
      ctx.restore();
      if (!target) paintStatus();
      return;
    }

    // THE GUARANTEE. Templates draw inside this clip and nowhere else, so no
    // slide can put a word under the caption bar or behind the action rail —
    // not through a bug, and not because someone pasted in a very long name.
    ctx.save();
    ctx.beginPath();
    ctx.rect(D.BOX.x, D.BOX.y, D.BOX.w, D.BOX.h);
    ctx.clip();
    try {
      tpl.draw(ctx, slide, cfg, T);
    } catch (e) {
      ctx.fillStyle = T.ink;
      ctx.font = D.sans(32, 500);
      ctx.fillText('Template error: ' + e.message, D.BOX.x, D.BOX.y + 80);
      console.error(e);
    }
    ctx.restore();

    // Furniture sits inside the safe box too, drawn after the clip is released
    // so a template cannot paint over it.
    if (cfg.brand && cfg.brand.wordmark) D.wordmark(ctx, T, cfg.brand.wordmark);
    if (cfg.sample) D.sampleTag(ctx, T);

    // Guides last, and never in an export or a recording.
    if (state.guides && !state.recording && !target) D.guides(ctx);

    ctx.restore();
    if (!target) paintStatus();
  }

  function paintStatus() {
    const slides = deck();
    const s = slides[state.index] || {};
    const tpl = window.Templates[s.template];
    $('status').innerHTML = '<b>' + (state.index + 1) + ' / ' + slides.length + '</b> &nbsp;·&nbsp; '
      + (tpl ? tpl.label : s.template) + (s.theme ? ' &nbsp;·&nbsp; ' + s.theme : '');
  }

  // --- navigation -----------------------------------------------------------

  function go(delta) {
    const slides = deck();
    const next = state.index + delta;
    if (next < 0 || next >= slides.length) {
      // In record mode, stop at the end rather than looping — a recording that
      // wraps around to slide 1 has to be trimmed by hand.
      if (state.recording && next >= slides.length) stopRecording();
      return;
    }
    state.index = next;
    render();
  }

  function jump(i) {
    state.index = i;
    render();
  }

  // --- record mode ----------------------------------------------------------

  function startRecording() {
    state.recording = true;
    document.body.classList.add('recording');
    jump(0);
    const seconds = Math.max(0.5, Number($('interval').value) || 3);
    state.timer = setInterval(function () { go(1); }, seconds * 1000);
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(function () {
        /* fullscreen can be refused; the chrome is already hidden either way */
      });
    }
    render();
  }

  function stopRecording() {
    state.recording = false;
    document.body.classList.remove('recording');
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(function () {});
    }
    render();
  }

  // --- export ---------------------------------------------------------------

  function filename(i) {
    const s = deck()[i] || {};
    const n = String(i + 1).padStart(2, '0');
    return 'scentkeep-' + n + '-' + (s.template || 'slide') + '.png';
  }

  function download(name) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Revoked late: revoking immediately cancels the download in some
        // builds before the bytes have been read.
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        resolve();
      }, 'image/png');
    });
  }

  async function exportOne() {
    const wasGuides = state.guides;
    state.guides = false;
    render();
    await download(filename(state.index));
    state.guides = wasGuides;
    render();
  }

  async function exportAll() {
    const wasGuides = state.guides;
    const wasIndex = state.index;
    state.guides = false;
    for (let i = 0; i < deck().length; i++) {
      state.index = i;
      render();
      await download(filename(i));
      // Chrome throttles rapid successive downloads and will drop some without
      // a gap. It also asks once for permission to download multiple files.
      await new Promise(function (r) { setTimeout(r, 350); });
    }
    state.guides = wasGuides;
    state.index = wasIndex;
    render();
  }

  // --- safe-zone audit ------------------------------------------------------

  /**
   * Proves that no slide paints into a reserved band.
   *
   * Renders each slide, then redraws ONLY its background over the top and
   * compares the three bands pixel for pixel. The background is deterministic,
   * so any difference inside a band is something a template or the furniture
   * put there. This is the check the brief asks for, made repeatable — a deck
   * that passes today can be broken tomorrow by one long fragrance name, and
   * eyeballing it against a screenshot of TikTok does not scale.
   *
   * Reports the exact rows and columns, because "something is in the bottom
   * band" and "one row of baseline antialiasing is in the bottom band" need
   * very different responses.
   */
  function audit() {
    const bands = {
      top: [0, 0, D.W, Math.round(D.H * D.RESERVED.top)],
      bottom: [0, D.H - Math.round(D.H * D.RESERVED.bottom), D.W, Math.round(D.H * D.RESERVED.bottom)],
      right: [D.W - Math.round(D.W * D.RESERVED.right), 0, Math.round(D.W * D.RESERVED.right), D.H],
    };

    // Its own canvas. Nothing else draws here, so nothing can land between the
    // two captures, and the preview does not flicker through the whole deck.
    const off = document.createElement('canvas');
    off.width = D.W;
    off.height = D.H;
    const octx = off.getContext('2d', { willReadFrequently: true });

    const findings = [];
    const slides = deck();
    for (let i = 0; i < slides.length; i++) {
      render(octx, i);
      const before = {};
      for (const k in bands) before[k] = octx.getImageData.apply(octx, bands[k]);

      const T = D.THEMES[slides[i].theme] || D.THEMES.noir;
      D.background(octx, T, state.photos[i]);

      for (const k in bands) {
        const a = before[k].data;
        const b = octx.getImageData.apply(octx, bands[k]).data;
        const w = bands[k][2];
        let count = 0, minX = Infinity, maxX = -1, minY = Infinity, maxY = -1;
        for (let p = 0; p < a.length; p += 4) {
          if (a[p] !== b[p] || a[p + 1] !== b[p + 1] || a[p + 2] !== b[p + 2]) {
            const px = (p / 4) % w, py = Math.floor((p / 4) / w);
            count++;
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
          }
        }
        if (count) {
          findings.push({
            slide: i + 1, template: slides[i].template, band: k, pixels: count,
            x: [bands[k][0] + minX, bands[k][0] + maxX],
            y: [bands[k][1] + minY, bands[k][1] + maxY],
          });
        }
      }
    }

    const box = $('audit');
    box.hidden = false;
    if (!findings.length) {
      box.style.color = '#8FCB9B';
      box.textContent = 'Clear — ' + slides.length + ' slides, nothing in any reserved band.';
    } else {
      box.style.color = 'var(--danger)';
      box.textContent = findings.map(function (f) {
        return 'Slide ' + f.slide + ' (' + f.template + ') — ' + f.band + ' band: '
          + f.pixels + 'px at x ' + f.x.join('-') + ', y ' + f.y.join('-');
      }).join(String.fromCharCode(10));
    }
    if (findings.length) console.table(findings);
    return findings;
  }

  // --- JSON editor ----------------------------------------------------------

  function showJson() {
    $('json').value = JSON.stringify(state.config, null, 2);
    $('err').textContent = '';
    $('json').classList.remove('bad');
  }

  function applyJson() {
    try {
      const next = JSON.parse($('json').value);
      if (!next || typeof next !== 'object') throw new Error('config must be an object');
      state.config = next;
      $('err').textContent = '';
      $('json').classList.remove('bad');
      syncControls();
      saveConfig();
      render();
    } catch (e) {
      $('err').textContent = e.message;
      $('json').classList.add('bad');
    }
  }

  function syncControls() {
    $('sample').checked = !!state.config.sample;
    $('guides').checked = state.guides;
    $('warn').hidden = !state.config.sample;
    if (state.config.sample) {
      $('warn').textContent = 'This deck is sample data and every slide is marked as such. '
        + 'Replace the numbers with your own and untick "Label as sample data" before posting.';
    }
  }

  // --- wiring ---------------------------------------------------------------

  $('next').onclick = function () { go(1); };
  $('prev').onclick = function () { go(-1); };
  $('record').onclick = startRecording;
  $('exportOne').onclick = exportOne;
  $('exportAll').onclick = exportAll;
  $('apply').onclick = applyJson;
  $('check').onclick = audit;

  $('reset').onclick = function () {
    state.config = JSON.parse(JSON.stringify(window.DEFAULT_CONFIG));
    state.photos = {};
    state.index = 0;
    showJson();
    syncControls();
    saveConfig();
    render();
  };

  $('guides').onchange = function (e) { state.guides = e.target.checked; render(); };

  $('sample').onchange = function (e) {
    state.config.sample = e.target.checked;
    showJson();
    syncControls();
    saveConfig();
    render();
  };

  $('photoPick').onclick = function () { $('photo').click(); };

  $('photo').onchange = function (e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      const img = new Image();
      // A data URL keeps the canvas untainted, so toBlob still works after a
      // photo is added — a plain object URL from a file:// page does not.
      img.onload = function () { state.photos[state.index] = img; render(); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  $('photoClear').onclick = function () { delete state.photos[state.index]; render(); };

  canvas.onclick = function () { go(1); };

  document.addEventListener('keydown', function (e) {
    // Never steal keys from the JSON editor.
    if (e.target && /^(TEXTAREA|INPUT)$/.test(e.target.tagName)) return;
    const k = e.key;
    if (k === 'ArrowRight' || k === ' ' || k === 'PageDown') { e.preventDefault(); go(1); }
    else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); go(-1); }
    else if (k === 'Escape' && state.recording) stopRecording();
    else if (k === 'r' || k === 'R') { state.recording ? stopRecording() : startRecording(); }
    else if (k === 'g' || k === 'G') { state.guides = !state.guides; syncControls(); render(); }
    else if (k === 'e' || k === 'E') exportOne();
  });

  // Leaving fullscreen by any route (Esc, F11, the browser's own control) must
  // put the interface back, or the tool looks broken.
  document.addEventListener('fullscreenchange', function () {
    if (!document.fullscreenElement && state.recording) stopRecording();
  });

  /**
   * A handle on the running deck, for the console and for automated checks.
   *
   * Kept deliberately: the only honest way to verify "no text in a safe zone"
   * and "legible at thumbnail size" is to render every slide and look at the
   * pixels, and that needs a way in from outside.
   */
  window.SlideStudio = {
    state: state,
    render: render,
    go: go,
    jump: jump,
    deck: deck,
    audit: audit,
  };

  // --- start ----------------------------------------------------------------

  state.config = loadConfig();
  showJson();
  syncControls();

  // Draw once immediately so the frame is never blank, then again once the
  // display face has loaded — measurements taken against the fallback serif are
  // wrong for the real one, and every fitted size depends on them.
  render();
  if (document.fonts && document.fonts.load) {
    Promise.all([
      document.fonts.load('300 200px "Cormorant Garamond"'),
      document.fonts.load('500 26px "Inter"'),
    ]).then(function () { return document.fonts.ready; })
      .then(render)
      .catch(function () { /* offline: the fallback stack is already drawn */ });
  }
})();
