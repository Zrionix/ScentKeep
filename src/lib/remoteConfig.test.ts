import {
  annualSavingPercent,
  DEFAULT_VARIANT,
  PAYWALL_FLAG,
  PAYWALL_VARIANTS,
  paywallCopy,
  resolveVariant,
} from './remoteConfig';

const withFlag = (value: unknown) => ({ flag: (key: string) => (key === PAYWALL_FLAG ? (value as any) : undefined) });

describe('resolveVariant', () => {
  it('uses a valid flag value', () => {
    expect(resolveVariant(withFlag('trial-first'))).toBe('trial-first');
    expect(resolveVariant(withFlag('value-first'))).toBe('value-first');
  });

  it('falls back to the default for a missing flag', () => {
    expect(resolveVariant(withFlag(undefined))).toBe(DEFAULT_VARIANT);
  });

  it('falls back for an unknown or wrongly-typed value rather than rendering nothing', () => {
    // A blank paywall converts at 0%, so every bad input must still resolve.
    for (const bad of ['nonsense', '', true, false, 42, null, {}, []]) {
      expect(resolveVariant(withFlag(bad))).toBe(DEFAULT_VARIANT);
    }
  });

  it('falls back when the flag lookup itself throws', () => {
    expect(
      resolveVariant({
        flag: () => {
          throw new Error('posthog exploded');
        },
      }),
    ).toBe(DEFAULT_VARIANT);
  });
});

describe('paywallCopy', () => {
  it('returns complete copy for every declared variant', () => {
    for (const v of PAYWALL_VARIANTS) {
      const copy = paywallCopy(v);
      expect(copy.headline.length).toBeGreaterThan(0);
      expect(copy.subhead.length).toBeGreaterThan(0);
      expect(copy.ctaLabel.length).toBeGreaterThan(0);
      expect(['annual', 'monthly', 'lifetime']).toContain(copy.highlight);
    }
  });

  it('falls back to the default copy for an unknown variant', () => {
    expect(paywallCopy('bogus' as never)).toEqual(paywallCopy(DEFAULT_VARIANT));
  });

  it('only promises a free trial in the variant that leads with one', () => {
    // 3.1.2: the paywall must not advertise a trial the product may not offer.
    expect(paywallCopy('trial-first').headline.toLowerCase()).toContain('free');
    expect(paywallCopy('annual-first').headline.toLowerCase()).not.toContain('free');
  });
});

describe('annualSavingPercent', () => {
  it('computes the saving against twelve months', () => {
    // $4.99 x 12 = $59.88 vs $24.99 -> 58%
    expect(annualSavingPercent(4.99, 24.99)).toBe(58);
  });

  it('returns null when either price is missing', () => {
    expect(annualSavingPercent(undefined, 19.99)).toBeNull();
    expect(annualSavingPercent(3.99, undefined)).toBeNull();
  });

  it('refuses to advertise a saving that is not real', () => {
    expect(annualSavingPercent(1, 19.99)).toBeNull(); // annual costs MORE
    expect(annualSavingPercent(1, 12)).toBeNull(); // exactly equal
  });

  it('ignores zero or negative prices instead of dividing by them', () => {
    expect(annualSavingPercent(0, 19.99)).toBeNull();
    expect(annualSavingPercent(3.99, 0)).toBeNull();
    expect(annualSavingPercent(-1, 19.99)).toBeNull();
  });
});
