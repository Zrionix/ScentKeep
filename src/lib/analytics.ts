import { env, integrations } from './env';

// ---------------------------------------------------------------------------
// PostHog, behind a typed event map.
//
// The event names and property shapes here ARE the funnel the product is judged
// on (brief §11), so they're declared once and type-checked at every call site —
// a typo'd event name is a silently missing funnel step you only notice weeks
// later when the numbers look wrong.
//
// Privacy: no PII, ever. We send an anonymous id and product interactions. No
// bottle names, no diary notes, no photos — those are the user's, and the App
// Privacy label says we don't collect them.
// ---------------------------------------------------------------------------

export interface EventMap {
  onboarding_started: Record<string, never>;
  onboarding_completed: { collection_size_band: string; families_picked: number };
  onboarding_skipped: { step: string };

  bottle_added: { in_wishlist: boolean; has_photo: boolean; has_price: boolean; collection_size: number };
  bottle_edited: { in_wishlist: boolean };
  bottle_deleted: { in_wishlist: boolean };
  wishlist_moved_to_wardrobe: Record<string, never>;

  sotd_logged: { collection_size: number; streak: number; from: 'home' | 'diary' | 'bottle' | 'reminder' };
  sotd_deleted: Record<string, never>;

  free_cap_hit: {
    cap:
      | 'wardrobe'
      | 'wishlist'
      | 'history'
      | 'stats'
      | 'sync'
      | 'themes'
      | 'bottle-levels'
      | 'insurance-export'
      | 'discovery';
  };
  bottle_level_adjusted: { was_estimate: boolean };
  insurance_export_created: { items: number; documented: number };
  running_low_viewed: { low_count: number };
  paywall_viewed: { source: string; variant: string };
  paywall_dismissed: { source: string; variant: string };
  purchase_started: { package_id: string; period: string; variant: string };
  purchase_completed: { package_id: string; period: string; variant: string; had_trial: boolean };
  purchase_failed: { package_id: string; reason: string };
  restore_completed: { restored: boolean };

  /** The daily pick was taken. The ratio of this to `sotd_logged` is how we
   *  learn whether the suggester is any good — a suggestion nobody accepts is a
   *  suggestion that should be removed, not tuned forever. */
  suggestion_accepted: { source: 'home' | 'log' };

  stats_viewed: { collection_size: number; is_premium: boolean };
  reminder_scheduled: { time: string };
  reminder_disabled: Record<string, never>;
  share_card_created: { kind: 'sotd' | 'collection' };
  data_exported: Record<string, never>;
  account_deleted: Record<string, never>;
}

export type EventName = keyof EventMap;

export interface Analytics {
  identify(distinctId: string, props?: Record<string, unknown>): void;
  capture<E extends EventName>(event: E, properties: EventMap[E]): void;
  screen(name: string, properties?: Record<string, unknown>): void;
  /** Feature-flag / remote-config read. Returns undefined when unavailable. */
  flag(key: string): string | boolean | undefined;
  reloadFlags(): Promise<void>;
  /** Flush before the app backgrounds so the last events aren't lost. */
  flush(): Promise<void>;
  setPremium(isPremium: boolean): void;
}

/** Records events in memory so tests can assert on the funnel without a network. */
export function stubAnalytics(): Analytics & { events: { event: string; properties: unknown }[] } {
  const events: { event: string; properties: unknown }[] = [];
  return {
    events,
    identify() {},
    capture(event, properties) {
      events.push({ event, properties });
    },
    screen(name, properties) {
      events.push({ event: `$screen:${name}`, properties });
    },
    flag() {
      return undefined;
    },
    async reloadFlags() {},
    async flush() {},
    setPremium() {},
  };
}

let instance: Analytics | null = null;
let posthogClient: any = null;

export function analytics(): Analytics {
  if (instance) return instance;

  if (!integrations.analytics) {
    instance = stubAnalytics();
    return instance;
  }

  // Deliberate lazy load so the SDK never initialises (or logs, or opens a
  // socket) in a build with no PostHog key.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PostHog } = require('posthog-react-native');
  posthogClient = new PostHog(env.posthogKey!, {
    host: env.posthogHost,
    // Anonymous-first product: never auto-collect anything we didn't declare.
    enableSessionReplay: false,
    captureAppLifecycleEvents: true,
  });

  instance = {
    identify(distinctId, props) {
      posthogClient.identify(distinctId, props);
    },
    capture(event, properties) {
      posthogClient.capture(event, properties);
    },
    screen(name, properties) {
      posthogClient.screen(name, properties);
    },
    flag(key) {
      try {
        return posthogClient.getFeatureFlag(key);
      } catch {
        return undefined;
      }
    },
    async reloadFlags() {
      try {
        await posthogClient.reloadFeatureFlagsAsync();
      } catch {
        /* flags are an optimisation, never a hard dependency */
      }
    },
    async flush() {
      try {
        await posthogClient.flush();
      } catch {
        /* losing a analytics batch must never surface to the user */
      }
    },
    setPremium(isPremium) {
      posthogClient.register({ is_premium: isPremium });
    },
  };
  return instance;
}

/** Test seam. */
export function __resetAnalyticsForTesting(): void {
  instance = null;
  posthogClient = null;
}
