// ---------------------------------------------------------------------------
// Turning the free-text note pyramid into something comparable.
//
// Notes are typed by hand, one field per tier, in whatever punctuation the user
// felt like: "Bergamot, Pepper", "vanilla; cacao", "Dried Fruits / Woods". This
// module is the single place that decides what counts as the same note, so the
// similarity engine, layering and the UI can never disagree about it.
//
// Pure functions only — no React, no store, no network.
// ---------------------------------------------------------------------------

import type { Fragrance } from './types';

/**
 * How much each tier counts toward "what this smells like".
 *
 * Base notes are weighted heaviest because they are what a wearer and everyone
 * near them actually experience: tops burn off in fifteen minutes, the base is
 * still there six hours later. Two fragrances that share a base smell related in
 * a way that two sharing only their citrus openings do not.
 */
export const TIER_WEIGHT = { base: 3, heart: 2, top: 1 } as const;
export type NoteTier = keyof typeof TIER_WEIGHT;

/** A note, keyed by its normalised form, carrying the heaviest tier it appears
 *  in and the spelling the user actually typed (for display). */
export interface Note {
  key: string;
  label: string;
  tier: NoteTier;
  weight: number;
}

/**
 * Folds a note to a comparison key.
 *
 * Diacritics go (nobody types "Fève Tonka" on a phone), case goes, and a
 * trailing plural is stripped so "Woods" matches "Wood" and "Spices" matches
 * "Spice". The plural rule is deliberately timid: words ending -ss, -us, -is or
 * -os keep their s, which is what stops "Iris" becoming "Iri", "Citrus"
 * becoming "Citru" and "Moss" becoming "Mos". Anything shorter than five
 * characters is left alone for the same reason.
 *
 * No synonym table. Guessing that "Cedarwood" and "Cedar" are the same material
 * is a judgement the app has no business making silently — an unmatched note is
 * honest, a wrongly matched one quietly inflates every similarity score.
 */
export function noteKey(raw: string): string {
  const folded = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  if (folded.length < 5 || !folded.endsWith('s')) return folded;
  if (/(ss|us|is|os)$/.test(folded)) return folded;
  return folded.slice(0, -1);
}

/** Splits one tier's free text into individual notes. */
export function splitNotes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;/|\n]|\s+&\s+|\s+\+\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 60);
}

/**
 * Every note on a fragrance, deduplicated by key.
 *
 * When the same note is typed into more than one tier — which happens, because
 * heavy materials genuinely do span heart and base — it is kept at its HEAVIEST
 * tier rather than counted twice. Counting it twice would let a sloppily
 * entered bottle score higher against everything.
 */
export function notesOf(f: Fragrance): Note[] {
  const byKey = new Map<string, Note>();

  const absorb = (raw: string | null, tier: NoteTier) => {
    for (const label of splitNotes(raw)) {
      const key = noteKey(label);
      if (!key) continue;
      const existing = byKey.get(key);
      if (existing && existing.weight >= TIER_WEIGHT[tier]) continue;
      byKey.set(key, { key, label, tier, weight: TIER_WEIGHT[tier] });
    }
  };

  // Ascending weight, so a later heavier tier wins the tie above.
  absorb(f.notesTop, 'top');
  absorb(f.notesHeart, 'heart');
  absorb(f.notesBase, 'base');

  return [...byKey.values()];
}

/** True when a bottle carries enough note detail to be compared at all. */
export function hasNotes(f: Fragrance): boolean {
  return notesOf(f).length > 0;
}

/** Distinct notes across a set of bottles, most common first. Powers the
 *  "what your collection is built on" read. */
export function noteFrequency(fragrances: Fragrance[]): { label: string; count: number }[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const f of fragrances) {
    for (const n of notesOf(f)) {
      const prev = counts.get(n.key);
      if (prev) prev.count += 1;
      else counts.set(n.key, { label: n.label, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
