// ---------------------------------------------------------------------------
// "Which two of mine work together?"
//
// Layering is NOT similarity. Two near-identical fragrances layer to no effect;
// two unrelated ones layer to a mess. What works is a pair that shares something
// to hold it together and differs somewhere it can add — conventionally an
// anchor (heavy, base-driven, long) under a lift (bright, volatile, short).
//
// This is craft knowledge, not arithmetic, so the judgement is written down as a
// table and a set of named components rather than hidden in a magic number.
// Every suggestion carries the reasons that produced it, because "these two work
// together" with no explanation is astrology.
//
// The engine only knows what the user typed. It suggests, it does not prescribe,
// and it stays quiet when the entered data cannot support a claim.
//
// Pure functions. No store, no React, no network.
// ---------------------------------------------------------------------------

import type { ScentFamily } from '@/theme';
import { notesOf } from './notes';
import { similarity } from './similarity';
import type { Fragrance } from './types';

/**
 * Families that sit UNDER a pairing: heavy, base-driven, long on skin. These are
 * the ones that persist and give a layered combination its spine.
 */
const ANCHOR_FAMILIES: ScentFamily[] = ['Amber', 'Gourmand', 'Woody', 'Leather', 'Chypre', 'Spicy'];

/**
 * Families that sit OVER a pairing: bright, volatile, gone in a couple of hours.
 * On their own they fade; over an anchor they change its opening without
 * fighting its base.
 */
const LIFT_FAMILIES: ScentFamily[] = ['Citrus', 'Fresh', 'Aquatic', 'Green', 'Floral', 'Fougère'];

export type LayerRole = 'anchor' | 'lift' | 'either';

export function roleOf(f: Fragrance): LayerRole {
  const family = (f.family ?? '').trim().toLowerCase();
  if (ANCHOR_FAMILIES.some((a) => a.toLowerCase() === family)) return 'anchor';
  if (LIFT_FAMILIES.some((l) => l.toLowerCase() === family)) return 'lift';
  return 'either';
}

/**
 * The similarity band a pairing has to land in.
 *
 * Below the floor the two have nothing in common and layering them is a
 * collision. At or above the ceiling they are close enough that the second
 * bottle adds nothing you could smell — you have just used twice as much juice.
 */
export const CONTRAST_FLOOR = 0.08;
export const CONTRAST_CEILING = 0.6;

/** A pairing has to clear this to be worth putting on screen. */
export const SUGGEST_THRESHOLD = 0.5;

/** Both bottles this loud is a headache rather than a signature. */
const LOUD = 5;

export interface LayeringPair {
  /** The bottle that goes on first. */
  anchor: Fragrance;
  /** The bottle that goes over it. */
  lift: Fragrance;
  /** 0..1 confidence in the pairing. */
  score: number;
  /** Plain-language reasons, in the order they should be read. Never empty for
   *  a returned pair — an unexplained suggestion is not shipped. */
  reasons: string[];
  /** The notes bridging the two, if any. */
  bridge: string[];
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function loudness(f: Fragrance): number {
  // Sillage is how far it projects, which is what makes a layered pair too much.
  // Longevity only decides how long you regret it.
  return f.sillage;
}

/**
 * Judges one ordered pairing: `a` underneath, `b` over the top.
 *
 * Returns null when the entered data cannot support a judgement at all, which is
 * different from judging it a bad pairing.
 */
export function judgePair(a: Fragrance, b: Fragrance): LayeringPair | null {
  if (a.id === b.id) return null;

  const sim = similarity(a, b);
  const notesA = notesOf(a);
  const notesB = notesOf(b);
  const roleA = roleOf(a);
  const roleB = roleOf(b);

  // With no note pyramid on either side and no family on either side there is
  // nothing to reason from. Say nothing rather than guess.
  const hasFamily = Boolean((a.family ?? '').trim()) && Boolean((b.family ?? '').trim());
  if (notesA.length === 0 && notesB.length === 0 && !hasFamily) return null;

  const reasons: string[] = [];

  // --- role fit ------------------------------------------------------------
  // The single biggest factor. An anchor under a lift is the shape that works.
  let role = 0.35;
  if (roleA === 'anchor' && roleB === 'lift') {
    role = 1;
    reasons.push(`${b.name} brightens the opening while ${a.name} holds the base.`);
  } else if (roleA === 'anchor' && roleB === 'anchor') {
    role = 0.3;
  } else if (roleA === 'lift' && roleB === 'lift') {
    role = 0.35;
  } else if (roleA === 'anchor' || roleB === 'lift') {
    // One side is right and the other is unclassified — still a sensible shape.
    role = 0.7;
  }

  // --- contrast ------------------------------------------------------------
  // Scored as a band, not a slope: both ends are failures.
  let contrast = 0;
  if (sim.basis === 'none') {
    // No overlap could be computed. Treat as mildly promising rather than
    // either good or bad, and do not claim a bridge that was never found.
    contrast = 0.45;
  } else if (sim.score >= CONTRAST_CEILING) {
    contrast = 0.05;
    reasons.push('Very close to each other — layering these adds little.');
  } else if (sim.score < CONTRAST_FLOOR) {
    contrast = 0.2;
  } else {
    // Peak in the middle of the band.
    const mid = (CONTRAST_FLOOR + CONTRAST_CEILING) / 2;
    const halfWidth = (CONTRAST_CEILING - CONTRAST_FLOOR) / 2;
    contrast = 1 - Math.abs(sim.score - mid) / halfWidth;
  }

  // --- bridge --------------------------------------------------------------
  const bridge = sim.shared.filter((n) => n.tier !== 'top').map((n) => n.label);
  const bridgeScore = Math.min(1, bridge.length / 2);
  if (bridge.length === 1) {
    reasons.push(`Both carry ${bridge[0]}, which ties them together.`);
  } else if (bridge.length > 1) {
    reasons.push(`They share ${bridge.slice(0, 3).join(', ')} — enough to feel deliberate.`);
  } else if (sim.sameFamily) {
    reasons.push(`Same family, so they sit in the same world.`);
  }

  // --- loudness ------------------------------------------------------------
  let volume = 1;
  if (loudness(a) >= LOUD && loudness(b) >= LOUD) {
    volume = 0.45;
    reasons.push('Both project hard — go light on the second one.');
  }

  const score = round2(0.4 * role + 0.3 * contrast + 0.3 * bridgeScore) * volume;

  if (reasons.length === 0) return null;

  return { anchor: a, lift: b, score: round2(score), reasons, bridge };
}

export interface LayeringOptions {
  limit?: number;
  minScore?: number;
}

/**
 * The best pairings across a whole shelf, best first.
 *
 * Each unordered pair is judged BOTH ways round and only the better orientation
 * is kept — which of the two goes on first is part of the advice, and returning
 * both directions would be the same suggestion twice.
 */
export function layeringPairs(
  fragrances: Fragrance[],
  { limit = 5, minScore = SUGGEST_THRESHOLD }: LayeringOptions = {},
): LayeringPair[] {
  const owned = fragrances.filter((f) => !f.inWishlist);
  const out: LayeringPair[] = [];

  for (let i = 0; i < owned.length; i += 1) {
    for (let j = i + 1; j < owned.length; j += 1) {
      const forward = judgePair(owned[i], owned[j]);
      const reverse = judgePair(owned[j], owned[i]);
      const best =
        forward && reverse ? (reverse.score > forward.score ? reverse : forward) : forward ?? reverse;
      if (best && best.score >= minScore) out.push(best);
    }
  }

  return out
    .sort(
      (x, y) =>
        y.score - x.score ||
        y.bridge.length - x.bridge.length ||
        x.anchor.name.localeCompare(y.anchor.name),
    )
    .slice(0, limit);
}

/** The best partners for one specific bottle, best first. Used on the bottle
 *  detail screen, where the question is "what do I put this with?". */
export function layersWith(
  target: Fragrance,
  candidates: Fragrance[],
  { limit = 3, minScore = SUGGEST_THRESHOLD }: LayeringOptions = {},
): LayeringPair[] {
  const out: LayeringPair[] = [];

  for (const other of candidates) {
    if (other.id === target.id || other.inWishlist) continue;
    const forward = judgePair(target, other);
    const reverse = judgePair(other, target);
    const best =
      forward && reverse ? (reverse.score > forward.score ? reverse : forward) : forward ?? reverse;
    if (best && best.score >= minScore) out.push(best);
  }

  return out
    .sort(
      (x, y) =>
        y.score - x.score ||
        y.bridge.length - x.bridge.length ||
        x.anchor.name.localeCompare(y.anchor.name),
    )
    .slice(0, limit);
}
