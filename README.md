# ScentKeep

A digital fragrance wardrobe. Log the bottles you own, keep a wishlist, and
record a daily Scent of the Day — then get real insight out of the wear history:
what you actually reach for, what's been neglected, and what each bottle has cost
you per wear.

Expo SDK 57 · React Native · TypeScript · Supabase · RevenueCat

---

## Quick start

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
npm run web
```

The app runs with an **empty `.env`**. Every integration stubs itself when its
key is absent, so you get a fully working app with no accounts, no network, and
no setup. Add keys to switch an integration from stub to live.

For a device:

```bash
npm start
```

---

## Commands

| Command | What it does |
|---|---|
| `npm run ship-check` | The gate: type-check + lint + tests + ASO limits. Green before every commit. |
| `npm test` | 203 unit tests |
| `npm run test:rls` | 18 cross-user denial assertions against the live database |
| `npm run e2e` | 53-step walk through the real UI (needs `npm run web` running) |
| `npm run check:links` | Confirms every App Review URL is live and public |
| `npm run icons` | Regenerates every icon from one vector definition |
| `npm run screenshots:store` | Store screenshots at 1320×2868, from the real app |

`e2e` and `screenshots` need the dev server up in another terminal.

---

## Layout

```
src/
  app/          expo-router screens (file = route)
  components/   UI primitives + BottleTile
  domain/       Pure logic: stats, entitlements, wardrobe, sotd. No React, no I/O.
  lib/          Integrations: supabase, purchases, analytics, notifications, sync
  state/        zustand store (the source of truth), persisted to AsyncStorage
  theme/        Design tokens + ThemeProvider
supabase/       Migrations and Edge Functions
store/          ASO metadata, review notes, privacy label, screenshots
site/           The marketing/privacy/terms/support site (deployed to Vercel)
scripts/        Icons, screenshots, e2e, RLS test, ASO + link checks
```

`src/domain` holds every rule worth testing and imports nothing that needs a
device, which is why the test suite runs in seconds.

---

## How it works

**Local-first.** Every write lands on the device immediately, so the app is
usable offline, on first launch, with no account. Supabase is a mirror, not the
write path.

**Anonymous-first auth.** A user gets an identity without typing anything. Email
is only ever an optional upgrade for syncing to a second device.

**Gating lives in the store.** `addFragrance`, `moveToWardrobe` and friends
enforce the free-tier caps themselves and return a discriminated result. No
screen can route around a limit, and there's one place to get it right.

**RevenueCat is the authority on entitlement.** The persisted `isPremium` flag is
a cache so the app opens in the right tier offline. The `subscriptions` table has
a read policy and *no* write policy — only the service-role webhook writes it.

**RLS is the security floor.** Every user table has row-level security with
policies scoped to `auth.uid()`, and `sotd_entries` carries a composite foreign
key so a diary row cannot reference someone else's bottle even with a valid
token. `npm run test:rls` proves it against the real database.

---

## Environment

See `.env.example` for the full list. The rule that matters:

- `EXPO_PUBLIC_*` is **inlined into the client bundle** — only put values there
  that are safe to ship publicly.
- Everything else is server-only and must never gain that prefix.

> **The trap:** `.env` is git-ignored, so EAS cloud build workers never see it.
> Any `EXPO_PUBLIC_*` missing from the EAS **production** environment ships as a
> stub. Always verify with `npx eas-cli env:list production`.

Read every public var as a *static* `process.env.EXPO_PUBLIC_X`. Dynamic access
is not inlined by Expo and silently resolves to `undefined` on device.

---

## Free vs Premium

| | Free | Premium |
|---|---|---|
| Wardrobe | 12 bottles | Unlimited |
| Wishlist | 3 items | Unlimited |
| SOTD logging | Unlimited | Unlimited |
| Diary history | Last 30 days | Everything |
| Insights | Basic tiles | Rotation, neglected, family & season |
| Cloud backup | — | Included |

Limits live in `src/domain/entitlements.ts` — one source of truth for the
paywall copy, the cap banners, and the enforcement.

---

## Status

Feature-complete v1.0.0. See `BUILD_LOG.md` for what was built, what was tested,
the bugs found along the way, and the open items that need a human sign-in.
`store/HUMAN-checklist.md` is the submission runbook.

---

© 2026 Zrionix Technology, INC.
