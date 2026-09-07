// The shareable Scent of the Day card.
//
// Fragrance people already post "what I am wearing today". A card that is
// actually worth posting -- bottle, house, photo if they have one, nothing else
// -- is the daily version of the shelf card. Same honesty rules:
//
//   - NO PRICES, ever. Not as a toggle.
//   - No dates. "Scent of the Day" is the idea, not a timestamp on the image.
//   - No diary text: no occasion, weather, mood, notes, wear rating.
//   - No collection-value totals.
//
// The renderer lives in components/SotdCard.tsx. This module is the allow-list
// of what that renderer is allowed to know.

import type { Fragrance } from './types';

export interface SotdCardData {
  name: string;
  /** House / brand. Empty string when the bottle has none -- never a placeholder. */
  house: string;
  /** Quiet third line. Family if the user set one, otherwise empty. */
  detail: string;
  photoUrl: string | null;
  /** Used only to tint the no-photo monogram. Never printed as a price. */
  family: string | null;
}

/**
 * Builds the SOTD card, or null when there is nothing honest to put on it.
 *
 * Wishlist bottles are refused: this is a card of what is on skin, not of what
 * is being hunted. An unnamed bottle is refused for the same reason.
 */
export function buildSotdCard(fragrance: Fragrance | null | undefined): SotdCardData | null {
  if (!fragrance) return null;
  if (fragrance.inWishlist) return null;
  const name = fragrance.name.trim();
  if (!name) return null;

  const house = fragrance.brand.trim();
  const family = (fragrance.family ?? '').trim() || null;

  return {
    name,
    house,
    detail: family ?? '',
    photoUrl: fragrance.photoUrl,
    family,
  };
}

/** Every string that will appear on the bitmap. Used by tests to prove the
 *  allow-list, not by the renderer. */
export function sotdCardText(data: SotdCardData): string {
  return [data.name, data.house, data.detail].filter(Boolean).join(' ');
}