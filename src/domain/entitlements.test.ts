import {
  canAddToWardrobe,
  canAddToWishlist,
  canMoveToWardrobe,
  FREE_LIMITS,
  historyCutoffDays,
  isFeatureUnlocked,
  PREMIUM_FEATURES,
  wardrobeCap,
  wishlistCap,
} from './entitlements';

describe('wardrobe cap', () => {
  it('allows a free user right up to the limit', () => {
    expect(canAddToWardrobe(0, false)).toBe(true);
    expect(canAddToWardrobe(FREE_LIMITS.wardrobe - 1, false)).toBe(true);
  });

  it('blocks the bottle that would exceed the limit', () => {
    expect(canAddToWardrobe(FREE_LIMITS.wardrobe, false)).toBe(false);
  });

  it('never blocks a premium user, even far past the free cap', () => {
    expect(canAddToWardrobe(FREE_LIMITS.wardrobe, true)).toBe(true);
    expect(canAddToWardrobe(10_000, true)).toBe(true);
  });

  it('reports remaining slots for the free tier and null for premium', () => {
    expect(wardrobeCap(9, false)).toEqual({
      used: 9,
      limit: FREE_LIMITS.wardrobe,
      atLimit: false,
      remaining: FREE_LIMITS.wardrobe - 9,
    });
    expect(wardrobeCap(9, true)).toEqual({
      used: 9,
      limit: null,
      atLimit: false,
      remaining: null,
    });
  });

  it('clamps remaining at zero if a legacy account is already over the cap', () => {
    // Downgrades and restores can leave more rows than the cap allows; the cap
    // must read as full rather than reporting a negative number of slots.
    const state = wardrobeCap(FREE_LIMITS.wardrobe + 5, false);
    expect(state.remaining).toBe(0);
    expect(state.atLimit).toBe(true);
  });
});

describe('wishlist cap', () => {
  it('lets a free user fill the wishlist and then stops', () => {
    expect(canAddToWishlist(FREE_LIMITS.wishlist - 1, false)).toBe(true);
    expect(canAddToWishlist(FREE_LIMITS.wishlist, false)).toBe(false);
  });

  it('is unlimited for premium', () => {
    expect(canAddToWishlist(500, true)).toBe(true);
    expect(wishlistCap(500, true).limit).toBeNull();
  });
});

describe('move wishlist -> wardrobe', () => {
  it('is gated by the WARDROBE cap, not the wishlist cap', () => {
    // The classic cap bypass: a free user at the wardrobe limit parks bottles on
    // the wishlist, then promotes them. Promotion must be refused.
    expect(canMoveToWardrobe(FREE_LIMITS.wardrobe, false)).toBe(false);
    expect(canMoveToWardrobe(FREE_LIMITS.wardrobe - 1, false)).toBe(true);
  });

  it('always allows the move for premium', () => {
    expect(canMoveToWardrobe(FREE_LIMITS.wardrobe + 50, true)).toBe(true);
  });
});

describe('feature gating', () => {
  it('locks every gated feature on free and unlocks all on premium', () => {
    const features = [
      'unlimited-wardrobe',
      'unlimited-wishlist',
      'full-history',
      'advanced-stats',
      'bottle-levels',
      'discovery',
      'insurance-export',
      'cloud-sync',
      'themes',
      'export',
    ] as const;
    for (const f of features) {
      expect(isFeatureUnlocked(f, false)).toBe(false);
      expect(isFeatureUnlocked(f, true)).toBe(true);
    }
  });

  it('every advertised premium feature is one the code actually gates', () => {
    // Guideline 3.1.2: do not advertise a feature you do not really gate. This
    // fails if someone adds a bullet to the paywall without a matching gate.
    for (const f of PREMIUM_FEATURES) {
      expect(isFeatureUnlocked(f.key, false)).toBe(false);
      expect(isFeatureUnlocked(f.key, true)).toBe(true);
      expect(f.title.length).toBeGreaterThan(0);
      expect(f.detail.length).toBeGreaterThan(0);
    }
  });

  it('caps free diary history and leaves premium uncapped', () => {
    expect(historyCutoffDays(false)).toBe(FREE_LIMITS.sotdHistoryDays);
    expect(historyCutoffDays(true)).toBeNull();
  });
});
