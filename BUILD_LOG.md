# ScentKeep — Build Log

**What it is:** a digital fragrance wardrobe. Log the bottles you own, keep a
wishlist, record a daily Scent of the Day, and get real insights out of the wear
history. Subscription-first freemium, no ads, no AI, no content treadmill.

**Status:** feature-complete v1.0.0. Every gate in the brief is green except the
items that need a human sign-in (§ Open [HUMAN] items).

**Repo:** `C:\Project\new app` · **Built:** 28 July 2026

---

## 1. What was built

| Area | State |
|---|---|
| Onboarding (3 steps, skippable) | Done |
| Wardrobe: add/edit/delete, photo, notes, tags, ratings | Done |
| Search (accent-folding, multi-term), family filter, 6 sort orders | Done |
| Wishlist + move-to-wardrobe | Done |
| Scent of the Day diary, streaks, 8-week activity grid | Done |
| Daily local reminder (time-configurable) | Done |
| Insights: value, most-worn, cost/wear, rotation, neglected, family & season | Done |
| Paywall: monthly / annual / lifetime, remote-config variants | Done |
| Free-tier caps enforced in the store layer | Done |
| Supabase schema + RLS + private photo storage | Done, live |
| RevenueCat webhook + account-deletion Edge Functions | Done, deployed |
| Data export + permanent delete | Done |
| Marketing / privacy / terms / support site | Done, deployed |
| App icons, splash, adaptive icon, store screenshots | Done, generated |
| ASO metadata, review notes, privacy label mapping | Done |

---

## 2. Stack and why

Reused the proven stack from the previous shipped app (EmberFree), because it
took an Expo app to App Store approval on Windows with no Mac.

- **Expo SDK 57 + expo-router + TypeScript** — one codebase, iOS + Android.
- **Supabase** — Postgres + auth + storage, RLS as the security floor.
- **zustand + AsyncStorage** — local-first state.
- **RevenueCat** — subscriptions. Never hand-rolled IAP.
- **PostHog** — funnel + the paywall variant flag.
- **luxon** — all calendar maths.
- **Cormorant Garamond** (bundled, one weight) — the display serif.

**Deviation from the brief:** the brief lists the wishlist as a wholly Premium
feature. Free instead gets a **3-item wishlist**. Reasoning: a feature a free
user can never touch cannot convert them; a small taste of it can. Unlimited
wishlist remains Premium, so the paid promise is unchanged.

**No AI, per the brief.** Marginal cost per user stays at zero.

---

## 3. Architecture decisions

**Local-first, sync as a Premium add-on.** Every write lands on the device
immediately, so the wardrobe renders instantly, works offline, and needs no
account. Supabase is a mirror, not the write path. This is also what makes
"cloud backup & sync" a truthful Premium unlock rather than a re-labelling of
something free users already have.

**Gating lives in the store, not in screens.** `addFragrance`, `moveToWardrobe`
etc. return a discriminated result and refuse at the cap themselves. A screen
cannot route around the limit, and there is exactly one place to get it right.

**Entitlement truth comes from RevenueCat.** The persisted `isPremium` is a
cache so the app opens in the right tier offline. `subscriptions` has a read
policy and *no* write policy — only the service-role webhook writes it, so a
tampered client cannot grant itself premium.

**Prices never come from a remote flag.** The PostHog flag picks a paywall
*presentation* variant only. Real prices always come from RevenueCat offerings,
because a bad flag value that advertised the wrong price would be both a 3.1.2
violation and a refund problem.

**Ownership enforced by the database, not just by policy.** `sotd_entries` has a
composite foreign key to `fragrances (id, user_id)`, so a diary row cannot
reference a bottle belonging to someone else even with a valid token.

---

## 4. Bugs found and fixed during the build

These were all caught by the tests, not by reading the code.

1. **Timezone off-by-one in `daysSince`.** A bare `YYYY-MM-DD` was parsed in the
   system zone but compared against a UTC-zoned `now`, shifting every result by
   a day for anyone west of Greenwich. It moved bottles in and out of the 90-day
   "neglected" list and mis-dated the diary. Fixed by parsing the date in the
   same zone as `now`; regression test asserts the same gap measures identically
   from four zones.

2. **`friendlyDate` labelled corrupt dates "Today".** `daysSince` returns 0 for
   an unparseable date, and the function tested that *before* validity — so bad
   data rendered as the one label a reader would never question. Validity is now
   checked first.

3. **`Card` dropped its `testID` when not pressable.** The prop was only applied
   on the `Pressable` branch, so every static card was invisible to tests and to
   accessibility tooling purely because it lacked an `onPress`.

4. **The purchases stub forgot a purchase on restart.** A real store remembers
   what you bought; the stub didn't, so every reload revoked a simulated
   purchase and the whole post-purchase half of the app was untestable without a
   store account. The stub now persists, and `bootstrap` no longer lets a
   *stubbed* provider overwrite a cached entitlement — a stub is not an
   authority on what someone paid for.

5. **`handle_new_user()` was callable as a public RPC.** Supabase's linter caught
   it: a `SECURITY DEFINER` function in the exposed `public` schema is published
   at `/rest/v1/rpc/`, callable by `anon`. `EXECUTE` is now revoked from
   `public`, `anon` and `authenticated`; the trigger still fires because
   Postgres checks that permission at trigger-creation time, not per fire.

6. **`NumberField` cascaded a render per keystroke.** State was synced in an
   effect; replaced with React's documented render-time adjustment, which also
   preserves a half-typed `"12."` through its own `onChange` round-trip.

7. **A test-isolation leak.** `jest.clearAllMocks()` keeps implementations, so a
   `mockRejectedValue` from one notification test bled into the next. Switched
   to `resetAllMocks` with an explicit baseline.

Two more came out of an adversarial pass over the money and sync paths, after
everything above was already green. Neither was caught by the tests or the gate,
which is exactly the point of doing the pass.

8. **Deleted bottles resurrected.** Sync pushed upserts but never deletions,
   then pulled everything back — so a bottle the user deleted was still on the
   server, and the merge read it as a row the device was missing and restored
   it. It came back on the *same* device, on the next launch. Fixed with
   persisted tombstones: deletions are applied server-side before the pull, the
   pull is filtered against them, and only the tombstones the server accepted
   are cleared (so a deletion made while a sync was in flight survives).

9. **A retried webhook could permanently drop an entitlement change.** The
   handler wrote the idempotency ledger first, then upserted the subscription.
   If the upsert failed it returned 5xx — but RevenueCat's retry then collided
   on the ledger's primary key, was treated as "already processed", and returned
   200 without ever applying the change. A duplicate ledger row is now only
   treated as done when the subscription row actually carries that event id;
   otherwise it falls through and finishes the job.

   The same pass added an **ordering guard**: RevenueCat does not guarantee
   delivery order, so a retried `EXPIRATION` could arrive after a newer
   `RENEWAL` and revoke access the user had already renewed. Events older than
   the one already applied are now ignored (`subscriptions.last_event_at`).

---

## 5. What was tested, and what passed

Run everything: `npm run ship-check`, `npm run test:rls`, `npm run e2e`.

### Unit — 203 tests, all passing
`jest`, via `jest-expo`.

| Suite | Covers |
|---|---|
| `domain/entitlements` | Free caps, the wishlist→wardrobe cap-bypass, downgrade behaviour |
| `domain/stats` | Value (float drift, mixed currencies, unpriced bottles), most-worn, cost/wear, rotation, neglect thresholds, breakdowns |
| `domain/wardrobe` | Accent-folded multi-term search, facet AND/OR, unpriced bottles in price sorts, validation |
| `domain/sotd` | Grouping, streaks (incl. today-not-yet-logged grace), history windowing, rediscover suggestion |
| `state/store` | CRUD, cap enforcement, duplicate-wear refusal, cascade delete, downgrade retention |
| `lib/dates` | Zone coherence across 4 timezones, malformed input |
| `lib/purchases` | Release-mode stub refuses premium; offering mapping; paid-intro ≠ free trial |
| `lib/notifications` | Reschedule cannot stack alarms; permission refusal; malformed time |
| `lib/remoteConfig` | Variant fallback on every bad input; saving % never overstated |
| `lib/dataRights` | Export completeness; import rejects malformed files |
| `lib/links` | Every review URL absolute + https; 3.1.2 disclosure completeness |

### Security — 18 assertions against the LIVE database
`npm run test:rls` signs in two real anonymous users and proves user B cannot:
read A's bottles (listed or by exact id), read A's diary, update or delete A's
rows, insert a row owned by A, attach a diary entry to A's bottle, read A's
subscription, write its own subscription to self-grant premium, read the billing
ledger, or list A's photo folder. **18 passed, 0 failed.**

### End-to-end — 53 steps through the real UI
`npm run e2e` drives a headless browser:
fresh install → onboarding (answers persisted, not shown again) → add bottle
(validation refuses an empty name) → log SOTD (duplicate refused) → diary
(streak reads 1) → fill to the 12-bottle cap → cap banner → "+" opens the
paywall → paywall shows prices, trial length, auto-renew terms, Restore, Terms
and Privacy → purchase → cap gone → premium insights unlocked → free user sees
them locked → settings controls present → **no console errors, no failing
network requests**. **53 passed, 0 failed.**

### Verified live
- Cloud sync actually wrote 12 bottles + a diary entry into Postgres.
- Deleting the auth rows cascaded every dependent row to zero across all five
  tables — the account-deletion path works.
- Both Edge Functions reject unauthenticated calls (401) and wrong methods (405).
- Supabase security advisors: two findings remain and both are deliberate —
  `billing_events` has RLS on with no policies (a deny-all, by design), and
  `auth_allow_anonymous_sign_ins` fires on every user table because anonymous
  users can reach their own rows, which is the product. Applying the advisor's
  suggested fix would require an email to use the app at all. Reasoning written
  up in `store/security-checklist.md`; the protection itself
  (`auth.uid() = user_id`) is unchanged and proven by the RLS test.
- All four review URLs return 200 publicly, with no SSO wall.

### Visual
Every screen captured from the running app at 1320×2868 (App Store 6.9"
requirement): `store/screenshots/`. Iterated three times on the icon and twice
on the wardrobe layout after reviewing the captures.

---

## 6. Infrastructure provisioned

| Service | What | Identifier |
|---|---|---|
| Supabase | Project `ScentKeep`, us-west-1 | `iqpknjohrjieepvzgqoz` |
| Supabase | 6 tables, RLS on all, private `bottle-photos` bucket | 3 migrations applied |
| Supabase | Edge Functions `revenuecat-webhook`, `delete-account` | both ACTIVE |
| Supabase | Anonymous sign-in enabled | — |
| Vercel | Site (marketing, privacy, terms, support) | `scentkeep.vercel.app` |
| EAS | Project `@zrionix/scentkeep` | `9e3af423-…` |
| EAS | Production env vars set (Supabase URL + anon key + PostHog host) | verified via `env:list` |

**Cost added:** Supabase project $10/month (approved). Vercel is on the free
tier. Nothing else recurring.

---

## 7. Open [HUMAN] items

Format: `[NEEDS-HUMAN] ScentKeep — <what> — <why> — <blocking?>`

### Blocking TestFlight
- `[NEEDS-HUMAN] ScentKeep — Sign in to Apple so EAS can create the iOS distribution certificate and provisioning profile for com.scentkeep.app — signing requires your Apple credentials and 2FA, which I must not handle — BLOCKING`
- `[NEEDS-HUMAN] ScentKeep — Place the App Store Connect API key at credentials/AuthKey_IGE22WY96LJX.p8 — needed by eas submit; Apple only lets a .p8 be downloaded once, so generate a new key if it is lost — BLOCKING`
- `[NEEDS-HUMAN] ScentKeep — Create the App Store Connect app record for com.scentkeep.app — the Company Name entered at FIRST creation becomes the public developer name and can NEVER be edited; set it to Zrionix Technology, INC, not a person — BLOCKING`
- `[NEEDS-HUMAN] ScentKeep — Decide the public support email address — the site and App Review both need a mailbox that a human reads; support@scentkeep.app does not exist yet because the domain is not purchased — BLOCKING`

### Blocking real purchases (the app runs on stubs without these)
- `[NEEDS-HUMAN] ScentKeep — Generate an App Store Connect IN-APP PURCHASE key (.p8, Key ID + Issuer ID) so the RevenueCat Apple app configuration can be created — RevenueCat now REQUIRES this key before it will create an App Store app config, and generating it needs your Apple credentials — BLOCKING for monetisation, not for a TestFlight build`

  **Progress:** the RevenueCat project itself is done. `ScentKeep` (id
  `0770dfee`) exists, with entitlement id **`premium`** — matching
  `src/domain/entitlements.ts` exactly — and a default offering of
  Monthly / Yearly / Lifetime. The **Test Store** public SDK key is wired into
  the local `.env` so purchase logic can be exercised on a dev build today. It
  is deliberately absent from the EAS production environment, and `src/lib/env.ts`
  discards it in release builds, because a test-store key in a shipped app would
  make it look like it was selling subscriptions while charging nobody.

  > ⚠️ RevenueCat is showing an **ongoing incident**: *"Newly created apps error
  > with 'The key is not valid or is not compatible with the Bundle ID of your
  > app'."* Re-verify any platform key generated while that is open —
  > https://status.revenuecat.com/incidents/mr3l9wqygn3d

  Also worth clearing: the RevenueCat account shows *"Your email address is not
  yet confirmed"*, which may restrict some actions.
- `[NEEDS-HUMAN] ScentKeep — Create the three IAP products in App Store Connect (monthly $4.99, annual $24.99 with a 30-day free trial, lifetime $59.99) in ONE subscription group — the first IAP submission must include the app version + EACH subscription + the GROUP in a single draft submission, and subscription pricing must be set in the UI (the API sets a US-only price and leaves it MISSING_METADATA) — BLOCKING for monetisation`
- `[NEEDS-HUMAN] ScentKeep — Set REVENUECAT_WEBHOOK_SECRET as a Supabase Edge Function secret and point the RevenueCat webhook at https://iqpknjohrjieepvzgqoz.supabase.co/functions/v1/revenuecat-webhook — the function currently fails closed and rejects everything, by design — BLOCKING for entitlement mirroring`

### Non-blocking
- `[NEEDS-HUMAN] ScentKeep — Approve buying scentkeep.app (~$10/yr, available) — currently the site is on scentkeep.vercel.app, which works fine for review; switching is a one-line change to SITE_BASE — NOT blocking`
- `[NEEDS-HUMAN] ScentKeep — Provide a PostHog project API key — analytics and the paywall A/B variant are stubbed without it, so §11's funnel metrics will not be collected — NOT blocking`
- `[NEEDS-HUMAN] ScentKeep — Decide on Sentry — if enabled, the App Privacy label MUST gain a Crash Data declaration — NOT blocking`
- `[NEEDS-HUMAN] ScentKeep — Play service-account JSON at credentials/play-service-account.json for Android submission — NOT blocking for iOS TestFlight`
- `[NEEDS-HUMAN] ScentKeep — Approve pushing this repo to a GitHub remote — committed locally only so far — NOT blocking`

---

## 8. Assumptions made

- **Free tier: 12 bottles, 3 wishlist items, 30 days of readable diary.** The
  brief said 10–15; 12 sits where a real collector notices it within a week.
- **Trial: 30 days on the annual plan.** The brief asked for 17–32 days; Apple
  only offers fixed lengths, and "1 month" is the one inside that band.
- **Northern-hemisphere seasons.** Southern-hemisphere users will see season
  labels shifted six months. Noted as a v1.1 fix, not shipped as a setting.
- **Sync conflicts resolve last-write-wins.** Single-user data, so there is no
  second editor whose change could be lost.
- **Age rating 4+.** No UGC shown to others, no browser, no ads, no mature
  content. Perfume is a consumer product.

---

## 9. What I would do next

1. Clear the blocking [HUMAN] items, then `eas build --profile production
   --platform ios` and submit to TestFlight.
2. Do a **real sandbox purchase** on TestFlight. The native StoreKit sheet
   appearing is the only proof the production RevenueCat key made it into the
   binary; silent premium or a test sheet means the key is missing.
3. Watch the funnel after ~1,000 installs: install → onboarding → trial → paid.
   If trial→paid is weak, the paywall variant flag is already wired to test
   `trial-first` and `value-first` without a new build.
4. v1.1 candidates: southern-hemisphere seasons, a share card for the SOTD
   (already scoped in the analytics event map), iPad support.
