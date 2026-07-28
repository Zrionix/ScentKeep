// ---------------------------------------------------------------------------
// The single source of truth for what Free gets vs what Premium unlocks.
//
// Every gate in the app calls into here — no screen invents its own limit — so
// the paywall copy, the cap banners, and the actual enforcement can never drift
// apart. (Guideline 3.1.2: don't advertise a feature you don't really gate, and
// don't gate one you didn't advertise.)
//
// Pure functions only: no React, no network, no store import.
// ---------------------------------------------------------------------------

export const ENTITLEMENT = 'premium';

/** Free-tier ceilings. Generous enough to be genuinely useful and shareable,
 *  capped where a real collector will feel it (brief §3). */
export const FREE_LIMITS = {
  /** Bottles on the shelf. A serious collector passes this in a sitting. */
  wardrobe: 12,
  /**
   * Wishlist slots, counted across BOTH lists (to-buy and to-try). Five rather
   * than three because splitting one list into two would otherwise have made
   * the free tier meaner without adding anything.
   */
  wishlist: 5,
  /** How far back the free diary reads. Logging itself is never capped. */
  sotdHistoryDays: 30,
} as const;

export type GatedFeature =
  | 'unlimited-wardrobe'
  | 'unlimited-wishlist'
  | 'full-history'
  | 'advanced-stats'
  | 'bottle-levels'
  | 'insurance-export'
  | 'cloud-sync'
  | 'themes'
  | 'export';

/** Features Premium unlocks, in the order the paywall lists them.
 *  Strongest-first: the two nobody else offers lead. */
export const PREMIUM_FEATURES: { key: GatedFeature; title: string; detail: string }[] = [
  {
    key: 'bottle-levels',
    title: 'Know what’s left in every bottle',
    detail: 'Live levels from your own wear history, and a nudge before one runs dry.',
  },
  {
    key: 'unlimited-wardrobe',
    title: 'Unlimited wardrobe',
    detail: `Bottles, decants and samples — every one of them, past ${FREE_LIMITS.wardrobe}.`,
  },
  {
    key: 'advanced-stats',
    title: 'Full collection insights',
    detail: 'Rotation, neglected bottles, cost per wear, family and season breakdowns.',
  },
  {
    key: 'insurance-export',
    title: 'Insurance-ready record',
    detail: 'An itemised export of your collection with prices, dates and photos.',
  },
  {
    key: 'full-history',
    title: 'Your whole scent diary',
    detail: `Free keeps the last ${FREE_LIMITS.sotdHistoryDays} days. Premium keeps everything.`,
  },
  {
    key: 'unlimited-wishlist',
    title: 'Unlimited wishlist',
    detail: 'Everything you are hunting and everything you mean to try.',
  },
  {
    key: 'cloud-sync',
    title: 'Cloud backup & sync',
    detail: 'Your collection survives a lost phone and follows you to a new one.',
  },
  { key: 'themes', title: 'Extra themes', detail: 'More ways to dress your shelf.' },
];

export interface CapState {
  /** Rows currently used against the cap. */
  used: number;
  /** The cap itself, or null when unlimited. */
  limit: number | null;
  /** True when one more row would exceed the cap. */
  atLimit: boolean;
  /** Remaining slots, or null when unlimited. */
  remaining: number | null;
}

function cap(used: number, limit: number, isPremium: boolean): CapState {
  if (isPremium) return { used, limit: null, atLimit: false, remaining: null };
  return {
    used,
    limit,
    atLimit: used >= limit,
    remaining: Math.max(0, limit - used),
  };
}

/** Wardrobe cap state. `ownedCount` must exclude wishlist rows. */
export function wardrobeCap(ownedCount: number, isPremium: boolean): CapState {
  return cap(ownedCount, FREE_LIMITS.wardrobe, isPremium);
}

/** Wishlist cap state. `wishlistCount` must exclude owned rows. */
export function wishlistCap(wishlistCount: number, isPremium: boolean): CapState {
  return cap(wishlistCount, FREE_LIMITS.wishlist, isPremium);
}

/** Can the user add one more bottle to the shelf right now? */
export function canAddToWardrobe(ownedCount: number, isPremium: boolean): boolean {
  return !wardrobeCap(ownedCount, isPremium).atLimit;
}

/** Can the user add one more bottle to the wishlist right now? */
export function canAddToWishlist(wishlistCount: number, isPremium: boolean): boolean {
  return !wishlistCap(wishlistCount, isPremium).atLimit;
}

/**
 * Moving a wishlist bottle onto the shelf consumes a WARDROBE slot and frees a
 * wishlist one, so it is gated by the wardrobe cap — not the wishlist cap. A
 * free user at 12 owned bottles cannot "sneak past" the cap via the wishlist.
 */
export function canMoveToWardrobe(ownedCount: number, isPremium: boolean): boolean {
  return canAddToWardrobe(ownedCount, isPremium);
}

export function isFeatureUnlocked(feature: GatedFeature, isPremium: boolean): boolean {
  if (isPremium) return true;
  // Nothing in the gated set is available on free — the free experience is the
  // capped version of these, not a partial unlock.
  return false;
}

/** Oldest diary date a free user may read, or null when unlimited. */
export function historyCutoffDays(isPremium: boolean): number | null {
  return isPremium ? null : FREE_LIMITS.sotdHistoryDays;
}
