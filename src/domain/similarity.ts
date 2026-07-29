// ---------------------------------------------------------------------------
// "What else on my shelf smells like this?"
//
// Everything here works from data the user has already entered. There is no
// bundled fragrance encyclopedia and nothing is scraped — which means the engine
// can only ever talk about the collection in front of it, and says so. That
// constraint is deliberate: an app that invents a note pyramid it did not get
// from the user is lying, and the wrong recommendation is worse than none.
//
// The honesty rule from stats.ts applies verbatim: never show a figure we can't
// stand behind. Every Similarity carries the notes that produced it and the
// `basis` it rests on, so a screen can never imply more evidence than exists.
//
// Pure functions over plain arrays. No store, no React, no network.
// ---------------------------------------------------------------------------

import { SCENT_FAMILIES, type ScentFamily } from '@/theme';
import { notesOf, type Note } from './notes';
import type { Fragrance } from './types';

/** What a similarity score is actually resting on. */
export type SimilarityBasis =
  /** Both bottles have a note pyramid — the only strong evidence available. */
  | 'notes'
  /** Neither has notes, but both name an olfactory family. Weak. */
  | 'family'
  /** Not enough entered to say anything. Score is 0 and must not be shown. */
  | 'none';

/**
 * Family agreement alone can never exceed this.
 *
 * Two woody fragrances are not necessarily alike — "Woody" spans a dry cedar and
 * a sweet oud — so a family-only match is capped well below the range where the
 * UI calls things similar. It is a hint that they might be worth comparing, not
 * a claim that they are.
 */
export const FAMILY_ONLY_SCORE = 0.4;

/** How much of a note-based score comes from the notes themselves. The
 *  remainder is the family agreeing, which is corroboration rather than
 *  evidence in its own right. */
const NOTE_SHARE = 0.85;

/** At or above this, two bottles are close enough that owning both is arguably
 *  a duplicate. Tuned so a shared base plus a shared heart clears it and a
 *  shared opening does not. */
export const DUPLICATE_THRESHOLD = 0.7;

/** At or above this, they are recognisably related. */
export const SIMILAR_THRESHOLD = 0.42;

export interface Similarity {
  /** 0..1. Meaningless unless `basis` is 'notes' or 'family'. */
  score: number;
  basis: SimilarityBasis;
  /** The notes both bottles carry, heaviest tier first — the evidence. */
  shared: Note[];
  sameFamily: boolean;
}

export const NO_SIMILARITY: Similarity = {
  score: 0,
  basis: 'none',
  shared: [],
  sameFamily: false,
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function sameFamily(a: Fragrance, b: Fragrance): boolean {
  const fa = (a.family ?? '').trim().toLowerCase();
  const fb = (b.family ?? '').trim().toLowerCase();
  return fa.length > 0 && fa === fb;
}

/**
 * How alike two bottles smell, on the evidence entered.
 *
 * The note comparison is a cosine over tier-weighted vectors. Cosine rather than
 * a plain overlap count because bottles carry wildly different numbers of notes:
 * a nine-note pyramid should not out-rank a three-note one simply for being
 * longer, and an overlap count does exactly that.
 */
export function similarity(a: Fragrance, b: Fragrance): Similarity {
  if (a.id === b.id) return NO_SIMILARITY;

  const family = sameFamily(a, b);
  const notesA = notesOf(a);
  const notesB = notesOf(b);

  if (notesA.length === 0 || notesB.length === 0) {
    if (!family) return NO_SIMILARITY;
    return { score: FAMILY_ONLY_SCORE, basis: 'family', shared: [], sameFamily: true };
  }

  const byKeyB = new Map(notesB.map((n) => [n.key, n]));
  const shared: Note[] = [];
  let dot = 0;

  for (const n of notesA) {
    const match = byKeyB.get(n.key);
    if (!match) continue;
    dot += n.weight * match.weight;
    // Reported at whichever tier weighs more, so the evidence shown to the user
    // matches the weight it actually carried.
    shared.push(n.weight >= match.weight ? n : match);
  }

  const magA = Math.sqrt(notesA.reduce((s, n) => s + n.weight * n.weight, 0));
  const magB = Math.sqrt(notesB.reduce((s, n) => s + n.weight * n.weight, 0));
  const cosine = magA && magB ? dot / (magA * magB) : 0;

  shared.sort((x, y) => y.weight - x.weight || x.label.localeCompare(y.label));

  return {
    score: round2(NOTE_SHARE * cosine + (1 - NOTE_SHARE) * (family ? 1 : 0)),
    basis: 'notes',
    shared,
    sameFamily: family,
  };
}

export interface SimilarMatch {
  fragrance: Fragrance;
  similarity: Similarity;
}

export interface SimilarOptions {
  /** How many to return. */
  limit?: number;
  /** Floor below which a match is not worth showing. */
  minScore?: number;
  /** Include wishlist rows in the candidate set. Off by default — "what else
   *  on my shelf" means the shelf. */
  includeWishlist?: boolean;
}

/**
 * The bottles most like `target`, best first.
 *
 * Returns an empty list rather than a weak one when there is nothing to say. A
 * screen showing "most similar: 4%" teaches the user to distrust every other
 * number in the app.
 */
export function similarTo(
  target: Fragrance,
  candidates: Fragrance[],
  { limit = 3, minScore = SIMILAR_THRESHOLD, includeWishlist = false }: SimilarOptions = {},
): SimilarMatch[] {
  return candidates
    .filter((c) => c.id !== target.id && (includeWishlist || !c.inWishlist))
    .map((fragrance) => ({ fragrance, similarity: similarity(target, fragrance) }))
    .filter((m) => m.similarity.basis !== 'none' && m.similarity.score >= minScore)
    .sort(
      (x, y) =>
        y.similarity.score - x.similarity.score ||
        y.similarity.shared.length - x.similarity.shared.length ||
        x.fragrance.name.localeCompare(y.fragrance.name),
    )
    .slice(0, limit);
}

// --- collection shape -------------------------------------------------------

/** A family that is over-represented on the shelf. */
export interface Concentration {
  family: string;
  count: number;
  share: number;
}

export interface CollectionShape {
  /** Owned bottles that name a family. Everything below is a share of THIS,
   *  not of the whole collection — so the UI can say "of the 9 bottles you've
   *  given a family". */
  classified: number;
  /** Owned bottles with no family entered, and therefore invisible here. */
  unclassified: number;
  /** Families taking more than `CONCENTRATED_ABOVE` of the classified set. */
  concentrations: Concentration[];
  /** Known families the collection has nothing in, in the canonical order. */
  missing: ScentFamily[];
  /** True when there is too little classified data to draw any conclusion. */
  tooSparse: boolean;
}

/** A family above this share of the classified collection is worth naming. */
export const CONCENTRATED_ABOVE = 0.3;

/** Below this many classified bottles, "you own nothing green" is noise rather
 *  than insight — almost every family will be missing from a shelf of four. */
export const MIN_CLASSIFIED_FOR_GAPS = 6;

/**
 * What the collection is actually made of, and what it is missing.
 *
 * Only bottles that name a family take part, and the count of those that don't
 * is returned alongside — same rule as collection value, which reports how many
 * bottles it had to leave out rather than implying it covered the shelf.
 */
export function collectionShape(fragrances: Fragrance[]): CollectionShape {
  const owned = fragrances.filter((f) => !f.inWishlist);
  const classified = owned.filter((f) => Boolean(f.family && f.family.trim()));
  const unclassified = owned.length - classified.length;

  const counts = new Map<string, number>();
  for (const f of classified) {
    const label = (f.family as string).trim();
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const present = new Set([...counts.keys()].map((k) => k.toLowerCase()));
  const tooSparse = classified.length < MIN_CLASSIFIED_FOR_GAPS;

  return {
    classified: classified.length,
    unclassified,
    concentrations: [...counts.entries()]
      .map(([family, count]) => ({
        family,
        count,
        share: round2(count / classified.length),
      }))
      .filter((c) => c.share > CONCENTRATED_ABOVE)
      .sort((a, b) => b.count - a.count || a.family.localeCompare(b.family)),
    // Suppressed rather than emptied when sparse, so the caller can distinguish
    // "nothing missing" from "not enough entered to tell".
    missing: tooSparse
      ? []
      : SCENT_FAMILIES.filter((f) => !present.has(f.toLowerCase())),
    tooSparse,
  };
}

// --- wishlist triage --------------------------------------------------------

export type Verdict =
  /** Close enough to something owned that buying it is arguably repetition. */
  | 'duplicate'
  /** Recognisably related to something owned. */
  | 'similar'
  /** Nothing owned resembles it. */
  | 'new-ground'
  /** Not enough entered on either side to judge. */
  | 'unknown';

export interface Triage {
  fragrance: Fragrance;
  verdict: Verdict;
  /** The owned bottle it is closest to, when there is one. */
  closest: SimilarMatch | null;
  /** True when it would be the first bottle in its family. Only set once the
   *  collection is dense enough for that to mean anything. */
  fillsGap: boolean;
}

/**
 * Ranks a wishlist by how much new ground each entry would actually cover.
 *
 * The useful answer for a collector is rarely "buy them all" — it is "three of
 * these are variations on what you already wear, and this one isn't". Ordered
 * new-ground first, because that is the one worth the money.
 */
export function triageWishlist(fragrances: Fragrance[]): Triage[] {
  const owned = fragrances.filter((f) => !f.inWishlist);
  const shape = collectionShape(fragrances);
  const missing = new Set(shape.missing.map((m) => m.toLowerCase()));

  const rank: Record<Verdict, number> = {
    'new-ground': 0,
    similar: 1,
    duplicate: 2,
    unknown: 3,
  };

  return fragrances
    .filter((f) => f.inWishlist)
    .map((f): Triage => {
      const [closest = null] = similarTo(f, owned, { limit: 1, minScore: 0 });
      const family = (f.family ?? '').trim().toLowerCase();

      let verdict: Verdict;
      if (!closest || closest.similarity.basis === 'none') {
        // No comparison was possible. That is not the same as "nothing like it",
        // and calling it new ground would be a guess dressed up as a finding.
        verdict = owned.length === 0 ? 'new-ground' : 'unknown';
      } else if (closest.similarity.score >= DUPLICATE_THRESHOLD) {
        verdict = 'duplicate';
      } else if (closest.similarity.score >= SIMILAR_THRESHOLD) {
        verdict = 'similar';
      } else {
        verdict = 'new-ground';
      }

      return {
        fragrance: f,
        verdict,
        closest: verdict === 'unknown' ? null : closest,
        fillsGap: family.length > 0 && missing.has(family),
      };
    })
    .sort(
      (a, b) =>
        rank[a.verdict] - rank[b.verdict] ||
        Number(b.fillsGap) - Number(a.fillsGap) ||
        a.fragrance.name.localeCompare(b.fragrance.name),
    );
}
