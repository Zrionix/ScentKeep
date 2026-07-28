// ---------------------------------------------------------------------------
// Outbound links. App Review REQUIRES a reachable Privacy URL and Support URL,
// and the paywall must link Terms + Privacy (guideline 3.1.2) — so these are
// declared once here and asserted by a test, rather than typed into each screen
// where a stale one would go unnoticed.
//
// Host: the ScentKeep marketing site (site/ in this repo, deployed to Vercel).
// ---------------------------------------------------------------------------

// The live, publicly-reachable site (Vercel project `scentkeep`, SSO protection
// off so App Review is not met with a login wall).
//
// `scentkeep.app` is available but NOT purchased — buying it is an open
// [HUMAN] item. When it is bought and attached to this Vercel project, changing
// this one constant is the entire migration.
export const SITE_BASE = 'https://scentkeep.vercel.app';

export const LINKS = {
  privacy: `${SITE_BASE}/privacy`,
  terms: `${SITE_BASE}/terms`,
  support: `${SITE_BASE}/support`,
  home: SITE_BASE,
  /** Apple's own subscription-management deep link, required for cancellation. */
  manageSubscriptionsIos: 'https://apps.apple.com/account/subscriptions',
  manageSubscriptionsAndroid: 'https://play.google.com/store/account/subscriptions',
} as const;

/** Standard auto-renew disclosure. Shown verbatim on the paywall. */
export const AUTO_RENEW_TERMS =
  'Payment is charged to your store account at confirmation of purchase. Your subscription renews automatically unless it is cancelled at least 24 hours before the end of the current period. Your account is charged for renewal within 24 hours of the end of the current period. You can manage and cancel your subscription in your device account settings after purchase.';
