import AsyncStorage from '@react-native-async-storage/async-storage';
import { mapPackage, STUB_PACKAGES, STUB_PREMIUM_KEY, stubPurchases } from './purchases';

// The stub now persists a simulated purchase, so each test must start from a
// clean store or an earlier test's purchase would leak into the next.
beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('stub purchases — release-mode safety', () => {
  // The failure this guards against: `.env` is gitignored, so a forgotten
  // EXPO_PUBLIC_REVENUECAT_IOS_KEY in the EAS production environment ships the
  // stub instead of RevenueCat. If the stub returned true from purchase(), the
  // paid tier would be free for every user of that build.
  it('refuses to grant premium when running as a release build', async () => {
    const p = stubPurchases(false);
    await p.configure('user-1');
    expect(await p.purchase('$rc_annual')).toBe(false);
    expect(await p.isPremium()).toBe(false);
    expect(await p.restore()).toBe(false);
  });

  it('still simulates a successful purchase in dev so gating is testable', async () => {
    const p = stubPurchases(true);
    expect(await p.isPremium()).toBe(false);
    expect(await p.purchase('$rc_annual')).toBe(true);
    expect(await p.isPremium()).toBe(true);
    expect(await p.restore()).toBe(true);
  });

  it('exposes the configured app user id for analytics + webhook linking', async () => {
    const p = stubPurchases(true);
    expect(p.appUserId()).toBeNull();
    await p.configure('anon-abc');
    expect(p.appUserId()).toBe('anon-abc');
  });

  it('offers monthly, annual and lifetime so the paywall is never blank', async () => {
    const pkgs = await stubPurchases(true).getPackages();
    expect(pkgs.map((p) => p.period).sort()).toEqual(['annual', 'lifetime', 'monthly']);
  });

  it('advertises a trial in the 17–32 day band the brief calls for', () => {
    const annual = STUB_PACKAGES.find((p) => p.period === 'annual')!;
    expect(annual.freeTrialDays).toBeGreaterThanOrEqual(17);
    expect(annual.freeTrialDays).toBeLessThanOrEqual(32);
  });

  it('lets a test force the entitlement without touching the store', async () => {
    const p = stubPurchases(false);
    p.__setPremiumForTesting(true);
    expect(await p.isPremium()).toBe(true);
  });

  it('remembers a simulated purchase across a restart, like a real store does', async () => {
    // Without this, every app reload silently revoked a dev purchase and the
    // whole post-purchase half of the app became untestable without a store.
    const first = stubPurchases(true);
    expect(await first.purchase('$rc_annual')).toBe(true);

    const afterRestart = stubPurchases(true);
    expect(await afterRestart.isPremium()).toBe(true);
    expect(await afterRestart.restore()).toBe(true);
  });

  it('starts unsubscribed when nothing was ever purchased', async () => {
    expect(await AsyncStorage.getItem(STUB_PREMIUM_KEY)).toBeNull();
    expect(await stubPurchases(true).isPremium()).toBe(false);
  });

  it('does not persist premium from a refused release-mode purchase', async () => {
    const p = stubPurchases(false);
    await p.purchase('$rc_annual');
    expect(await stubPurchases(false).isPremium()).toBe(false);
  });
});

describe('mapPackage — RevenueCat offering shape', () => {
  it('maps an annual package with a 1-month free trial', () => {
    expect(
      mapPackage({
        identifier: '$rc_annual',
        packageType: 'ANNUAL',
        product: {
          title: 'ScentKeep Premium (Annual)',
          priceString: '$19.99',
          price: 19.99,
          introPrice: { price: 0, periodUnit: 'MONTH', periodNumberOfUnits: 1 },
        },
      }),
    ).toEqual({
      id: '$rc_annual',
      title: 'ScentKeep Premium (Annual)',
      priceString: '$19.99',
      price: 19.99,
      period: 'annual',
      freeTrialDays: 30,
    });
  });

  it('does not report a trial for a PAID intro offer', () => {
    // A discounted-but-not-free intro price is not a free trial; claiming one
    // in the paywall would be a 3.1.2 misrepresentation.
    const p = mapPackage({
      identifier: '$rc_monthly',
      packageType: 'MONTHLY',
      product: {
        priceString: '$3.99',
        price: 3.99,
        introPrice: { price: 0.99, periodUnit: 'MONTH', periodNumberOfUnits: 1 },
      },
    });
    expect(p.freeTrialDays).toBeUndefined();
  });

  it('maps lifetime and falls back to a readable title', () => {
    const p = mapPackage({ identifier: '$rc_lifetime', packageType: 'LIFETIME', product: { price: 39.99 } });
    expect(p.period).toBe('lifetime');
    expect(p.title).toBe('Lifetime');
  });

  it('degrades safely on a malformed package rather than throwing', () => {
    // A paywall that crashes converts at 0%. Missing fields must not throw.
    expect(mapPackage({})).toEqual({
      id: '',
      title: 'Premium',
      priceString: '',
      price: 0,
      period: 'other',
      freeTrialDays: undefined,
    });
    expect(() => mapPackage(null)).not.toThrow();
  });

  it('treats an unknown package type as "other" instead of guessing annual', () => {
    expect(mapPackage({ identifier: 'x', packageType: 'SIX_MONTH' }).period).toBe('other');
  });
});
