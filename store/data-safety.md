# App Privacy label & Play Data Safety — ScentKeep

**Rule for this file: it must describe what the CODE does, not what we'd like it
to do.** A privacy label that overstates or understates is both a rejection risk
and a trust problem. Every row below cites where it is implemented.

Re-check this file whenever an SDK is added. Adding Sentry, for example, means
adding a Crash Data declaration.

---

## What ScentKeep collects

**As shipped in build 7 there is NO analytics SDK.** `EXPO_PUBLIC_POSTHOG_KEY`
is absent from the EAS production environment, and `integrations.analytics` is
`Boolean(env.posthogKey)` — so PostHog is never even `require`d. Nothing below
may therefore claim an Analytics purpose.

Build 6 and earlier shipped a privacy manifest that DID claim Analytics on User
ID and Device ID, plus a Product Interaction type that nothing recorded. That
over-declaration was corrected in `app.json` rather than papered over: a label
that overstates is a trust problem even though no user is harmed by it, and
Apple compares the label against the manifest.

| Data type | Collected? | Linked to user? | Used for tracking? | Purpose | Where in code |
|---|---|---|---|---|---|
| **User ID** (random, anonymous) | Yes | Yes | No | App functionality | `src/lib/auth.ts` — `signInAnonymously` |
| **Device ID** | Yes — the IDFV the RevenueCat SDK reads to identify the purchaser | Yes | No | App functionality | `src/lib/purchases.ts` |
| **Purchase history** | Yes | Yes | No | App functionality | RevenueCat → `subscriptions` table |
| **Photos** | Yes, only ones the user attaches | Yes | No | App functionality | `src/lib/photos.ts` |
| **Other user content** (bottle names, notes, diary entries) | Yes | Yes | No | App functionality | `src/lib/sync.ts` |

**Product interaction is NOT collected.** The typed event map in
`src/lib/analytics.ts` exists and is unit-tested, but with no key it resolves to
`stubAnalytics()`, which appends to an in-memory array and sends nothing. If a
PostHog key is ever added to the production environment, this table, the
privacy manifest in `app.json`, and the App Privacy label must all gain
Analytics purposes and a Product Interaction row in the same change.

## What ScentKeep does NOT collect

Declared explicitly because reviewers check for the absence too:

- Name, email address, phone number, physical address
- Contacts, calendar, health, fitness, financial or payment information
- Precise or coarse location
- Browsing history, search history outside the app
- Advertising identifiers (IDFA). **The ATT prompt is not shown, because we do
  not track.** `NSPrivacyTracking: false`, `NSPrivacyTrackingDomains: []`.
- Crash or performance data — **as long as Sentry stays disabled.** If
  `EXPO_PUBLIC_SENTRY_DSN` is ever set for a shipped build, this file and the
  App Privacy label must both gain a Crash Data / Performance Data row.

---

## Important nuances

**Email is optional and not collected by default.** The app never asks for one.
It exists only as a future opt-in to sync across devices; if a user supplies one,
it is stored by Supabase Auth solely to identify their account.

**Most users' data never leaves the device.** The collection is stored locally
first (`src/state/store.ts`). It is uploaded only when the user is a Premium
subscriber with cloud backup — `syncNow` returns early with
`skipped: 'not-premium'` otherwise. Free users' data is device-only.

**Photos are private.** The `bottle-photos` bucket is `public: false`, and every
storage policy checks that the first path segment equals `auth.uid()`, so a user
can only ever reach their own folder. Verified by `scripts/test-rls.js`.

**Analytics carry no content.** The event map in `src/lib/analytics.ts` is typed,
and no property is a bottle name, a note, a photo, or any free text the user
wrote. Properties are counts, booleans, and enum-like strings.

**Entitlement cannot be self-granted.** The `subscriptions` table has a read
policy and no write policy; only the service-role RevenueCat webhook writes it.

---

## Play Data Safety extras

| Question | Answer |
|---|---|
| Is data encrypted in transit? | Yes — all Supabase traffic is HTTPS/TLS. |
| Can users request deletion? | Yes — Settings → "Delete everything", which calls the `delete-account` Edge Function. Every user table cascades from `auth.users`, and the user's storage folder is emptied first. |
| Is data collection optional? | Yes — the app is fully functional with no account and no cloud sync. |
| Committed to the Play Families policy? | Not applicable — not targeted at children. |
| Independent security review? | **No.** Do not claim one. |

---

## Deletion — what actually happens

1. `purgeCloud(userId)` deletes the user's `sotd_entries` then `fragrances`.
2. `delete-account` verifies the caller's JWT with `admin.auth.getUser(jwt)` —
   the token is verified, never merely decoded.
3. It empties the user's `bottle-photos/<uid>/` folder (storage is outside
   Postgres, so the cascade cannot reach it).
4. It deletes the `auth.users` row. `ON DELETE CASCADE` removes `profiles`,
   `fragrances`, `sotd_entries`, `settings` and `subscriptions`.
5. `clearAll()` wipes the local device copy.

Verified on 2026-07-28: deleting the auth rows dropped every dependent row to
zero across all five tables.

---

## Claims we must NOT make

Carried forward from a previous launch where overclaiming cost trust:

- ❌ "SOC 2 compliant" — we are not.
- ❌ "Independently penetration tested" — it has not been.
- ❌ "End-to-end encrypted" — it is not; data is encrypted in transit and at
  rest by the provider, which is a different claim.
- ❌ "We never store your data" — untrue for Premium cloud sync.

What we CAN say, because the code backs it:
- ✅ Row-level security is on for every user table, with per-user policies.
- ✅ No ads, no ad SDKs, no cross-app tracking.
- ✅ No account or email required to use the app.
- ✅ Export and permanent deletion are both available in-app.
