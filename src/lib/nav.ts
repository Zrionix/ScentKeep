import type { useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

/**
 * `router.back()` when there may be nothing to go back to.
 *
 * A screen reached by deep link, a notification tap, or a direct URL has no
 * history behind it, and calling back() there does nothing at all — the user
 * taps "Cancel" or saves a bottle and simply stays put, with a dev-only warning
 * ("The action 'GO_BACK' was not handled by any navigator") as the only clue.
 *
 * Falls back to the wardrobe, which is always a valid place to be.
 */
export function goBack(router: Router, fallback: '/(tabs)' = '/(tabs)'): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
}
