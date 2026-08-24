# Slide Studio

Vertical social frames for ScentKeep — 1080×1920, stepped through in the browser
for screen-recording, or exported as PNGs for carousels.

No build step and no dependencies. Open it and it works.

```bash
npm run social
```

Then open <http://localhost:8099>. (Opening `index.html` directly off the disk
works in most browsers too, but a server avoids `file://` restrictions.)

## Using it

| Key | |
| --- | --- |
| `→` `Space` / click | next slide |
| `←` | previous |
| `R` | record mode on/off |
| `G` | safe-zone guides |
| `E` | export this slide |

**To record a video:** set the seconds per slide, press `R`. The interface
disappears, the deck goes fullscreen and advances on the timer, stopping on the
last slide rather than looping — so there is nothing to trim off the end. Screen-record
the window, then press `Esc`.

**To export a carousel:** *Download all*. One PNG per slide, named in order.
Chrome asks once for permission to save multiple files.

## Editing the content

Everything comes from the JSON block in the panel. Nothing is hardcoded in a
template. `deck` is the running order; each entry names a template and may
override any field that template reads:

```json
{ "template": "costPerWear", "index": 2, "theme": "amber", "eyebrow": "The expensive one" }
```

So one template becomes as many slides as you want. Themes are `noir`, `paper`,
`amber` and `ink`. Edits are saved to the browser's local storage; *Reset to
sample* puts the shipped deck back.

## Templates

`stats` · `costPerWear` · `sotd` · `mostWorn` · `neglected` · `families` ·
`wishlist` · `quote` · `outro`

## The rules this enforces

**Sample data is labelled.** The shipped deck is invented, so `sample: true`
ships with it and every slide carries a SAMPLE DATA tag. Replace the numbers
with real ones and untick it. A post of made-up stats presented as somebody's
actual collection is very hard to walk back.

**No brand imagery.** Text only, plus your own photos. Naming a fragrance in
plain text is fine; logos, bottle renders and brand marketing images are not,
and this tool gives you no way to add them.

**Nothing lands under the platform UI.** Templates are *clipped* to the safe box
— they cannot draw into the top 12%, bottom 22% or right 15% even if a template
misbehaves or you paste in a much longer name than anyone designed for. *Check
safe zones* proves it: it renders every slide to an offscreen canvas, redraws
just the background over the top, and compares the three bands pixel for pixel.
Any difference is something that should not be there, reported down to the row
and column.

Run it after editing the JSON. It has already caught two things worth catching —
the wordmark's baseline sitting exactly *on* the caption boundary, and the sample
tag's border sitting exactly on the action-rail boundary. One row and one column
of antialiasing each: invisible, and still wrong.

## How it is put together

```
index.html        panel, canvas, styles
app.js            state, navigation, record mode, export, the safe-zone audit
lib/draw.js       canvas primitives — tracking, wrapping, fitted figures, scrims
lib/templates.js  the nine templates
lib/config.js     the shipped sample deck
```

The preview, the recording and the export are all **the same canvas**. Templates
draw to a real 1080×1920 surface that CSS scales down for preview; record mode is
that canvas fullscreen; export is `toBlob` on it. There is no second renderer to
drift out of step, so what you record is exactly what you export.

Two things worth knowing before editing a template:

- **Cormorant sets oldstyle figures.** 3, 4, 5, 7 and 9 descend well below the
  baseline. A caption at a fixed offset under a big number will collide with it —
  `Draw.figure()` exists because "34" was sitting on top of "BOTTLES". Use it
  rather than positioning captions by hand.
- **Anchor positions, do not accumulate them.** Every figure is fitted to its own
  width at draw time, so "previous y plus a bit" is not a position anyone can
  reason about. That is how the value ended up overlapping its own divider rule.
