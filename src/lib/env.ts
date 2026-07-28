// ---------------------------------------------------------------------------
// Central env access. EXPO_PUBLIC_* values are inlined into the client bundle
// by Expo at build time. Anything secret must NOT be read here (it would ship
// to the client) — secrets live server-side / in Edge Functions.
//
// Every integration is STUBBED when its key is absent (see `integrations`), so
// the whole app builds, runs, and tests against an empty .env.
// ---------------------------------------------------------------------------

// CRITICAL: each EXPO_PUBLIC_* var MUST be referenced as a *static* dotted
// `process.env.EXPO_PUBLIC_X`. Expo's build-time transform only inlines that
// exact form — dynamic `process.env[key]` or destructuring is NOT inlined and
// resolves to `undefined` in a native build (there is no runtime `process.env`
// on device). A dynamic `read(key)` helper silently stubbed Supabase, analytics
// and purchases in every shipped build of a previous app. Keep these literal.
// https://docs.expo.dev/guides/environment-variables/  (expo/no-dynamic-env-var)

function clean(v: string | undefined): string | undefined {
  const t = v?.trim();
  if (!t) return undefined;
  // A var left at its placeholder counts as unset, so a half-filled .env stubs
  // cleanly instead of failing later with a cryptic vendor error.
  if (/^(your|changeme|todo|xxx|<.*>)/i.test(t)) return undefined;
  return t;
}

export const env = {
  supabaseUrl: clean(process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: clean(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  posthogKey: clean(process.env.EXPO_PUBLIC_POSTHOG_KEY),
  posthogHost: clean(process.env.EXPO_PUBLIC_POSTHOG_HOST) ?? 'https://us.i.posthog.com',
  revenueCatIos: clean(process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY),
  revenueCatAndroid: clean(process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY),
  revenueCatTest: clean(process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY),
  sentryDsn: clean(process.env.EXPO_PUBLIC_SENTRY_DSN),
} as const;

export const integrations = {
  supabase: Boolean(env.supabaseUrl && env.supabaseAnonKey),
  analytics: Boolean(env.posthogKey),
  purchases: Boolean(env.revenueCatIos || env.revenueCatAndroid || env.revenueCatTest),
  monitoring: Boolean(env.sentryDsn),
} as const;

/** Human-readable summary of which integrations are live vs stubbed (dev logging). */
export function integrationsSummary(): string {
  return Object.entries(integrations)
    .map(([k, live]) => `${k}:${live ? 'live' : 'stub'}`)
    .join('  ');
}
