import { useStore } from '@/state/store';
import { analytics } from './analytics';
import { ensureSession } from './auth';
import { integrations, integrationsSummary } from './env';
import { syncReminders } from './notifications';
import { purchases } from './purchases';
import { syncNow } from './sync';

// ---------------------------------------------------------------------------
// App startup, in one place.
//
// The governing rule: NOTHING here may prevent the app from rendering. Every
// step is independently try/caught, because a launch that hangs on a failed
// network call is indistinguishable from a crash to the person holding the
// phone. The app is fully usable with zero integrations configured.
// ---------------------------------------------------------------------------

export interface BootstrapResult {
  userId: string | null;
  isPremium: boolean;
  integrations: string;
}

let running: Promise<BootstrapResult> | null = null;

export async function bootstrap(): Promise<BootstrapResult> {
  // Concurrent callers (a re-render during startup) share one run rather than
  // racing two anonymous sign-ups into existence.
  if (running) return running;
  running = run();
  try {
    return await running;
  } finally {
    running = null;
  }
}

async function run(): Promise<BootstrapResult> {
  const store = useStore.getState();
  let userId: string | null = store.userId;
  let isPremium = store.isPremium;

  // 1. Identity. Anonymous session when Supabase is configured; otherwise the
  //    app simply runs local-only and everything below still works.
  try {
    const user = await ensureSession();
    if (user) {
      userId = user.id;
      useStore.getState().setUserId(user.id);
    }
  } catch {
    /* local-only mode */
  }

  // 2. Entitlement. RevenueCat is the authority; the persisted flag was only a
  //    cache so the app opened in the right tier offline. If the check fails we
  //    KEEP the cached value rather than silently downgrading a paying user
  //    because their plane had no wifi.
  //
  //    The result is only APPLIED when RevenueCat is actually configured. A
  //    stubbed provider is not an authority on entitlement, and letting it
  //    write `false` on every launch would revoke premium in any build missing
  //    its key — the same misconfiguration that purchases.ts already refuses to
  //    let grant premium.
  try {
    const p = purchases();
    await p.configure(userId ?? 'anonymous');
    const reported = await p.isPremium();
    if (integrations.purchases) {
      isPremium = reported;
      useStore.getState().setPremium(reported);
    } else if (reported && !isPremium) {
      // A stub can still turn premium ON (dev simulated purchase); it just may
      // never turn it off.
      isPremium = true;
      useStore.getState().setPremium(true);
    }
  } catch {
    /* keep the cached entitlement */
  }

  // 3. Analytics identity + flags.
  try {
    const a = analytics();
    if (userId) a.identify(userId);
    a.setPremium(isPremium);
    await a.reloadFlags();
  } catch {
    /* analytics is never load-bearing */
  }

  // 4. Reminders match stored settings on every launch, so a reinstall or an OS
  //    permission change can't leave the schedule out of step with the toggle.
  try {
    await syncReminders(useStore.getState().settings);
  } catch {
    /* reminders are best-effort */
  }

  // 5. Cloud sync, premium only.
  try {
    const s = useStore.getState();
    if (isPremium && userId) {
      const result = await syncNow({
        userId,
        isPremium,
        fragrances: s.fragrances,
        sotd: s.sotd,
        settings: s.settings,
      });
      if (result.ok && result.merged) {
        useStore.getState().replaceAll({
          fragrances: result.merged.fragrances,
          sotd: result.merged.sotd,
        });
      }
    }
  } catch {
    /* dirtyAt stays set; the next launch retries */
  }

  return { userId, isPremium, integrations: integrationsSummary() };
}
