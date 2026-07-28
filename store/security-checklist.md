# ScentKeep — security checklist

Every line is either **verified** (with how) or **open**. Nothing is marked done
on the strength of having written the code.

Last run: 28 July 2026.

---

## Database

| Control | State | Verified by |
|---|---|---|
| RLS enabled on every user table | ✅ | `profiles`, `fragrances`, `sotd_entries`, `settings`, `subscriptions`, `billing_events` — all `enable row level security` in migration 0001 |
| Policies scoped to `auth.uid()` | ✅ | `scripts/test-rls.js` — 18 assertions, 0 failures |
| Cross-user read denied | ✅ | B cannot list or target A's rows |
| Cross-user write/delete denied | ✅ | B's update and delete both affect 0 rows; A's row verified unchanged afterwards |
| Impersonation denied | ✅ | B's insert with `user_id = A` is rejected |
| Diary rows can't reference another user's bottle | ✅ | Composite FK `(fragrance_id, user_id) → fragrances (id, user_id)`; B's attempt rejected |
| Client cannot self-grant premium | ✅ | `subscriptions` has a read policy and **no** write policy; B's insert rejected |
| Billing ledger unreadable by clients | ✅ | RLS on, zero policies = deny-all |
| Policies use `(select auth.uid())` | ✅ | Avoids per-row re-evaluation (`auth_rls_initplan` advisor) |
| Policies scoped `TO authenticated` | ✅ | Explicit role grant rather than relying on `auth.uid()` being NULL for `anon` |
| `SECURITY DEFINER` functions not publicly callable | ✅ | `EXECUTE` revoked from `public`/`anon`/`authenticated` on `handle_new_user` and `touch_updated_at`; advisor cleared |
| Leaked-password protection (HaveIBeenPwned) | ✅ | Enabled; applies if a user ever sets a password on the optional email upgrade |

### Advisor findings we accept, and why

The Supabase security advisor is **not** silent, and this file will not pretend
it is. Two findings remain, both deliberate:

1. **`rls_enabled_no_policy` on `billing_events`** (INFO). RLS on with zero
   policies is a deny-all in Postgres. Only the service-role webhook touches
   this table. This is the intended posture, not an oversight.

2. **`auth_allow_anonymous_sign_ins` on all six user tables** (WARN, ×7).
   Flagged because anonymous users can reach their own rows — which is the
   entire product. In Supabase an anonymously signed-in user holds the
   **`authenticated`** role (with `is_anonymous: true` in the JWT), so this
   warning persists even with policies scoped `TO authenticated`.

   The advisor's suggested remediation is to add
   `and (select auth.jwt() ->> 'is_anonymous')::boolean is false`, which would
   lock every anonymous user out of their own collection and require an email to
   use the app at all. That contradicts the anonymous-first requirement in the
   brief, so we do not apply it.

   **What actually protects the data is unchanged and proven:** each policy
   still requires `auth.uid() = user_id`, so an anonymous user reaches their own
   rows and nobody else's. `scripts/test-rls.js` demonstrates this with two real
   anonymous users and 18 assertions.

## Storage

| Control | State | Verified by |
|---|---|---|
| Photo bucket is private | ✅ | `public: false` on `bottle-photos` |
| Per-user path enforcement | ✅ | Every policy checks `(storage.foldername(name))[1] = auth.uid()::text` |
| Cross-user photo listing denied | ✅ | `scripts/test-rls.js` — B cannot list A's folder |
| Upload size and MIME limited | ✅ | 5 MB, jpeg/png/webp/heic; client downscales to 1200px before upload |

## Edge Functions

| Control | State | Verified by |
|---|---|---|
| Webhook authenticates the caller | ✅ | Shared secret, constant-time compare |
| Webhook **fails closed** | ✅ | Unset secret rejects everything; live check returned 401 for no header and for a wrong secret |
| Webhook is idempotent | ✅ | `billing_events.event_id` primary key; a duplicate delivery returns 200 without changing entitlement |
| Webhook returns 5xx on real storage failure | ✅ | So RevenueCat retries rather than dropping an entitlement change |
| Cancellation doesn't revoke access early | ✅ | Stays `active` until `expiration_at_ms` passes |
| Account deletion **verifies** the JWT | ✅ | `admin.auth.getUser(jwt)` — verified server-side, never a decoded `sub` |
| Deletion is complete | ✅ | Storage folder emptied, then `auth.users` row deleted; cascade confirmed to drop all five tables to zero |
| Wrong method rejected | ✅ | 405 |

## Client

| Control | State | Notes |
|---|---|---|
| No secrets in the app bundle | ✅ | Only `EXPO_PUBLIC_*` values, all designed to be public. Service-role key and webhook secret are server-only |
| Every `EXPO_PUBLIC_*` read as a static literal | ✅ | `src/lib/env.ts` — dynamic access is not inlined by Expo and silently resolves to `undefined` on device |
| Placeholder env values treated as unset | ✅ | `clean()` nulls `your…`/`changeme`/`<…>` so a half-filled `.env` stubs cleanly |
| Missing purchase key cannot grant premium | ✅ | Release-mode stub returns `false` from `purchase()`; unit-tested |
| Stubbed provider can't overwrite a cached entitlement | ✅ | `bootstrap` only applies the result when `integrations.purchases` is true |
| Entitlement is re-verified each launch | ✅ | Persisted flag is a cache, not the authority |
| No PII in analytics | ✅ | Typed event map; every property is a count, boolean or enum — no bottle names, notes or photos |
| No secrets in logs or commits | ✅ | `.env`, `*.p8`, `credentials/*` git-ignored; verified nothing sensitive was staged |
| App works with empty env / offline | ✅ | Every integration stubs; `bootstrap` try/catches each step independently |

## Transport & platform

| Control | State |
|---|---|
| TLS everywhere | ✅ Supabase and Vercel are HTTPS-only |
| Site security headers | ✅ HSTS, `X-Frame-Options: DENY`, `nosniff`, CSP with `script-src 'none'`, `frame-ancestors 'none'` |
| No tracking / IDFA | ✅ `NSPrivacyTracking: false`, empty tracking domains, no ATT prompt |
| Privacy manifest declared | ✅ `app.json` → `privacyManifests`, matching `data-safety.md` |

---

## Open / accepted

- **Rate limiting.** There is no app-level rate limit; Supabase's own limits
  apply. Acceptable for v1 because there is no paid per-call resource behind any
  endpoint (no AI, no email sending). **Revisit before adding any metered
  feature** — anonymous sign-in means an abuser can mint fresh identities freely.
- **Anonymous account accumulation.** Every fresh install creates an anonymous
  user. Harmless at this scale; add a sweep for accounts with no rows and no
  activity after 24 months.
- **Sync is last-write-wins.** Accepted: single-user data, no second editor.
- **No independent security review.** Stated plainly and *not* claimed anywhere
  in the app, on the site, or in the store listing.

## Claims we must never make

Because they are not true, and overclaiming costs more trust than it buys:

- ❌ SOC 2 compliant
- ❌ Independently penetration tested
- ❌ End-to-end encrypted
- ❌ "We never store your data" (untrue for Premium cloud sync)
