import type { Analytics } from './analytics';

// ---------------------------------------------------------------------------
// Paywall remote config (brief §3: "prices remote-config driven so they're
// A/B-testable without a new build").
//
// The flag only picks a PRESENTATION variant — headline, ordering, which plan is
// highlighted. It never decides what anything COSTS: real prices always come
// from the store via RevenueCat offerings. A remote flag that could set a price
// would let a bad flag value advertise a price the store won't charge, which is
// both a 3.1.2 problem and a refund problem.
// ---------------------------------------------------------------------------

export type PaywallVariant = 'annual-first' | 'trial-first' | 'value-first';

export const PAYWALL_VARIANTS: PaywallVariant[] = ['annual-first', 'trial-first', 'value-first'];

/** The variant shown when PostHog is absent, unreachable, or returns nonsense. */
export const DEFAULT_VARIANT: PaywallVariant = 'annual-first';

export const PAYWALL_FLAG = 'paywall-variant';

export interface PaywallCopy {
  headline: string;
  subhead: string;
  /** Which package period gets the highlighted card. */
  highlight: 'annual' | 'monthly' | 'lifetime';
  ctaLabel: string;
}

const COPY: Record<PaywallVariant, PaywallCopy> = {
  'annual-first': {
    headline: 'Your whole collection, kept properly',
    subhead: 'Unlimited bottles, full insights, and a diary that never forgets.',
    highlight: 'annual',
    ctaLabel: 'Continue',
  },
  'trial-first': {
    headline: 'Try Premium free for a month',
    subhead: 'Every feature, no commitment. Cancel any time before it renews.',
    highlight: 'annual',
    ctaLabel: 'Start free trial',
  },
  'value-first': {
    headline: 'Less than a decant a year',
    subhead: 'Unlimited wardrobe, full stats and cloud backup for the price of a sample.',
    highlight: 'annual',
    ctaLabel: 'Unlock Premium',
  },
};

function isVariant(v: unknown): v is PaywallVariant {
  return typeof v === 'string' && (PAYWALL_VARIANTS as string[]).includes(v);
}

/**
 * Resolves the active paywall variant. Any unknown / missing / malformed flag
 * value falls back to the default rather than rendering an empty paywall — a
 * blank paywall converts at zero, so this path must never fail open to nothing.
 */
export function resolveVariant(a: Pick<Analytics, 'flag'>): PaywallVariant {
  try {
    const raw = a.flag(PAYWALL_FLAG);
    return isVariant(raw) ? raw : DEFAULT_VARIANT;
  } catch {
    return DEFAULT_VARIANT;
  }
}

export function paywallCopy(variant: PaywallVariant): PaywallCopy {
  return COPY[variant] ?? COPY[DEFAULT_VARIANT];
}

/**
 * "Save 58%" style figure for the annual plan against 12x the monthly price.
 * Returns null unless both plans are present and the saving is real — never
 * advertise a discount we can't derive from the actual store prices.
 */
export function annualSavingPercent(
  monthlyPrice: number | undefined,
  annualPrice: number | undefined,
): number | null {
  if (!monthlyPrice || !annualPrice) return null;
  if (monthlyPrice <= 0 || annualPrice <= 0) return null;
  const yearOfMonthly = monthlyPrice * 12;
  if (annualPrice >= yearOfMonthly) return null;
  return Math.round((1 - annualPrice / yearOfMonthly) * 100);
}
