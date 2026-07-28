import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { ENTITLEMENT } from '@/domain/entitlements';
import { env, integrations } from './env';

export { ENTITLEMENT };

// ---------------------------------------------------------------------------
// RevenueCat, behind a narrow interface.
//
// Hard rules carried over from shipping the last app:
//  * OFFERINGS-DRIVEN. Read `offerings.current`, resolve packages by
//    packageType, purchase by package.identifier, gate on the ENTITLEMENT id.
//    Never hardcode a store product id — that is what breaks when pricing is
//    A/B tested or a product is re-created.
//  * The stub must NOT hand out premium in a release build. `.env` is
//    gitignored, so a forgotten EXPO_PUBLIC_REVENUECAT_*_KEY in the EAS
//    production environment silently ships the stub — and a stub that returns
//    `true` from purchase() gives the paid tier away for free, to everyone.
// ---------------------------------------------------------------------------

export type PackagePeriod = 'monthly' | 'annual' | 'lifetime' | 'other';

export interface Package {
  /** RevenueCat package identifier — what purchase() takes. */
  id: string;
  title: string;
  /** Localised, store-formatted price string, e.g. "$19.99". */
  priceString: string;
  /** Numeric price in the user's currency, for "save X%" maths. */
  price: number;
  period: PackagePeriod;
  /** Free-trial length in days when the product carries a free intro offer. */
  freeTrialDays?: number;
}

export interface Purchases {
  configure(appUserId: string): Promise<void>;
  isPremium(): Promise<boolean>;
  getPackages(): Promise<Package[]>;
  /** True when the purchase resulted in the premium entitlement. */
  purchase(packageId: string): Promise<boolean>;
  restore(): Promise<boolean>;
  /** The RevenueCat app user id, for linking analytics + the webhook. */
  appUserId(): string | null;
  /** Dev/testing only — force the entitlement locally (no-op with the real SDK). */
  __setPremiumForTesting(v: boolean): void;
}

/** Shape of the paywall when RevenueCat is unreachable. Mirrors the intended
 *  store products (brief §3) so the paywall is never blank in dev. */
export const STUB_PACKAGES: Package[] = [
  { id: '$rc_monthly', title: 'Monthly', priceString: '$3.99', price: 3.99, period: 'monthly' },
  {
    id: '$rc_annual',
    title: 'Annual',
    priceString: '$19.99',
    price: 19.99,
    period: 'annual',
    freeTrialDays: 30,
  },
  { id: '$rc_lifetime', title: 'Lifetime', priceString: '$39.99', price: 39.99, period: 'lifetime' },
];

/** Where the stub remembers a simulated purchase. Dev/test only. */
export const STUB_PREMIUM_KEY = 'scentkeep-stub-premium-v1';

/** Exported for the test that proves a release-mode stub cannot grant premium. */
export function stubPurchases(isDev: boolean = __DEV__): Purchases {
  // `null` means "not read from storage yet". A real store REMEMBERS what you
  // bought across app restarts, so the stub must too — otherwise every reload
  // silently revokes a simulated purchase and the whole post-purchase half of
  // the app becomes untestable without a store account.
  let premium: boolean | null = null;
  let userId: string | null = null;

  async function load(): Promise<boolean> {
    if (premium !== null) return premium;
    try {
      premium = (await AsyncStorage.getItem(STUB_PREMIUM_KEY)) === 'true';
    } catch {
      premium = false;
    }
    return premium;
  }

  async function save(value: boolean): Promise<void> {
    premium = value;
    try {
      await AsyncStorage.setItem(STUB_PREMIUM_KEY, value ? 'true' : 'false');
    } catch {
      /* in-memory value still applies for this session */
    }
  }

  return {
    async configure(appUserId: string) {
      userId = appUserId;
    },
    async isPremium() {
      return load();
    },
    async getPackages() {
      return STUB_PACKAGES;
    },
    async purchase() {
      // RELEASE + no RevenueCat key: refuse rather than grant the paid tier for
      // free. A missing key is a build misconfiguration, not a licence to
      // unlock. In dev the stub still simulates success so the gating flow and
      // the E2E walk are testable without a store.
      if (!isDev) return false;
      await save(true);
      return true;
    },
    async restore() {
      return load();
    },
    appUserId() {
      return userId;
    },
    __setPremiumForTesting(v: boolean) {
      premium = v;
      AsyncStorage.setItem(STUB_PREMIUM_KEY, v ? 'true' : 'false').catch(() => {});
    },
  };
}

const UNIT_DAYS: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };

function periodFor(packageType: string | undefined): PackagePeriod {
  switch (packageType) {
    case 'ANNUAL':
      return 'annual';
    case 'MONTHLY':
      return 'monthly';
    case 'LIFETIME':
      return 'lifetime';
    default:
      return 'other';
  }
}

/** Exported for unit testing the mapping without loading the native SDK. */
export function mapPackage(p: any): Package {
  const period = periodFor(p?.packageType);
  const intro = p?.product?.introPrice;
  const isFreeTrial = intro != null && Number(intro.price) === 0;
  const trialDays = isFreeTrial
    ? (UNIT_DAYS[intro.periodUnit] ?? 0) * (intro.periodNumberOfUnits ?? 0)
    : 0;

  const fallbackTitle =
    period === 'annual'
      ? 'Annual'
      : period === 'monthly'
        ? 'Monthly'
        : period === 'lifetime'
          ? 'Lifetime'
          : 'Premium';

  return {
    id: p?.identifier ?? '',
    title: p?.product?.title || fallbackTitle,
    priceString: p?.product?.priceString ?? '',
    price: Number(p?.product?.price ?? 0),
    period,
    freeTrialDays: trialDays > 0 ? trialDays : undefined,
  };
}

let instance: Purchases | null = null;

export function purchases(): Purchases {
  if (instance) return instance;

  // Web has no StoreKit, so always stub there — this also stops
  // `require('react-native-purchases')` from ever entering the browser bundle.
  if (Platform.OS === 'web' || !integrations.purchases) {
    instance = stubPurchases();
    return instance;
  }

  // Deliberate lazy load: a static import would pull the native StoreKit bridge
  // into the web bundle and into every build that runs without a RevenueCat key.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RC = require('react-native-purchases').default;
  const apiKey =
    Platform.OS === 'ios'
      ? (env.revenueCatIos ?? env.revenueCatTest)
      : (env.revenueCatAndroid ?? env.revenueCatTest);

  let userId: string | null = null;

  instance = {
    async configure(appUserId: string) {
      userId = appUserId;
      RC.configure({ apiKey, appUserID: appUserId });
    },
    async isPremium() {
      const info = await RC.getCustomerInfo();
      return Boolean(info?.entitlements?.active?.[ENTITLEMENT]);
    },
    async getPackages() {
      const offerings = await RC.getOfferings();
      return (offerings?.current?.availablePackages ?? []).map(mapPackage);
    },
    async purchase(packageId: string) {
      const offerings = await RC.getOfferings();
      const pkg = offerings?.current?.availablePackages?.find((p: any) => p.identifier === packageId);
      if (!pkg) return false;
      const { customerInfo } = await RC.purchasePackage(pkg);
      return Boolean(customerInfo?.entitlements?.active?.[ENTITLEMENT]);
    },
    async restore() {
      const info = await RC.restorePurchases();
      return Boolean(info?.entitlements?.active?.[ENTITLEMENT]);
    },
    appUserId() {
      return userId;
    },
    __setPremiumForTesting() {
      /* no-op against the real SDK — entitlement truth is RevenueCat's */
    },
  };
  return instance;
}

/** Test seam. */
export function __resetPurchasesForTesting(): void {
  instance = null;
}
