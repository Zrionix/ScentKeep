# ScentKeep — the human's checklist

Everything reversible and non-credential is already done. This is the list only
you can clear, in the order that unblocks the most.

Verify each step **by API where possible, not by a UI banner** — App Store
Connect's web UI lies about state more often than it should.

---

## The short version, as of build 6

**Done and verified by API:** description, keywords, subtitle, promo text,
support/marketing/privacy URLs, categories (Lifestyle / Utilities), age rating
4+, copyright, content-rights declaration, App Review contact and notes, eight
screenshots in order, app price (Free), 175 territories with
`availableInNewTerritories`, build 6 attached to version 1.0, and all three IAPs
at `READY_TO_SUBMIT`. `node scripts/asc-listing.js` re-checks the lot.

**Left, and only you can do them:**

1. **Agreements, Tax and Banking.** Paid Apps agreement plus the tax and banking
   forms, at App Store Connect → Business. There is no API for it, and no
   in-app purchase can be sold until it is accepted. This is the real blocker.
2. **The App Privacy questionnaire.** `appDataUsages` is not a relationship this
   app exposes — I checked, it 404s — so it is genuinely web-UI only. The
   answers are drafted in `store/data-safety.md`; copy them exactly.
3. **Press Submit.** Both for Beta App Review (external TestFlight) and for the
   App Store. Outward-facing and hard to reverse, so it stays yours.

---

## A. Before anything else (5 minutes, decides the rest)

- [x] ~~Decide on the domain~~ — **bought.** `scentkeep.com`, $10.46/yr on
      Cloudflare Registrar (at cost, renews at the same price), auto-renew on,
      expires 28 Jul 2027. Attached to the Vercel project, with an apex A record
      to `76.76.21.21` and `www` CNAME to `cname.vercel-dns.com`, both set to
      **DNS only** — Cloudflare's proxy in front of Vercel breaks certificate
      provisioning.

- [x] ~~Wait for DNS, then flip `SITE_BASE`~~ — **done.** DNS propagated,
      `https://scentkeep.com/privacy` serves the real page, and `SITE_BASE` now
      points at the owned domain. Confirmed by `npm run check:links`.

- [ ] **Click the Cloudflare verification email.** Email Routing is configured
      for `scentkeep.com` — all five DNS records (3× MX, DKIM, SPF) are in place
      and Cloudflare-managed, and `nathan@zrionix.dev` is registered as the
      destination. It sits at **Pending** until you click the verification link
      Cloudflare emailed to that address. Cloudflare will not let a rule target
      an unverified mailbox, and that is a proof-of-ownership check worth
      respecting rather than routing around.

      Once you've clicked it, tell me and I'll create the
      `support@scentkeep.com → nathan@zrionix.dev` rule — about ten seconds.

      (`zrionix.dev` is on Proton Mail, not Cloudflare Email Routing, so there
      is no forward-to-a-forward problem.)

---

## B. Apple — required for TestFlight

- [ ] **Sign in to Apple for EAS credentials.**
      ```bash
      npx eas-cli credentials --platform ios
      ```
      Needs your Apple ID and 2FA, which is why I can't do it. EAS then creates
      the distribution certificate and provisioning profile for
      `com.scentkeep.app`.

- [x] ~~Put the App Store Connect API key in place~~ — **done and verified.**
      `credentials/AuthKey_X25AAYH8QT.p8` (git-ignored), Key ID `X25AAYH8QT`,
      Admin/all-apps. `eas.json` points at it and
      `node scripts/asc.js verify` authenticates against Apple.

      The `IGE22WY96LJX` id in your notes is real but is an *Individual* key
      whose `.p8` was never saved, and Apple only allows one download — so this
      reuses the team's existing Admin key rather than burning a new one.

- [x] ~~Create the App Store Connect app record~~ — **done and verified by API.**

      | | |
      |---|---|
      | Apple app id | **6795710068** |
      | Name | ScentKeep: Fragrance Wardrobe |
      | Bundle ID | `com.scentkeep.app` (registered as an explicit App ID under team DRPPNG8QV4) |
      | SKU | `SCENTKEEP-IOS-001` |
      | Primary language | English (U.S.) |

      The developer-name trap did not apply: the account is already an
      **Organization** (Zrionix Technology, Inc), so that is what the App Store
      will show. `eas.json` now carries `ascAppId`, so `eas submit` knows where
      to send the build.

      Still to set on the record itself: subtitle, keywords, description,
      category (Lifestyle / Utilities) and age rating 4+ — all drafted in
      `store/aso-metadata.md`.

- [ ] **Then build and submit:**
      ```bash
      npx eas-cli build --platform ios --profile production
      ```
      ```bash
      npx eas-cli submit --platform ios --profile production
      ```
      `eas submit` reporting "Something went wrong" is **often a false error** —
      the binary usually uploaded fine. Check
      `GET /v1/builds?filter[version]=N` before re-running it.

---

## C. Monetisation — required before the app can actually earn

Without these the app runs the purchases **stub**, which refuses to grant
premium in a release build. That's deliberate (a missing key must never hand out
the paid tier), but it means no one can buy anything.

- [x] ~~Create a RevenueCat project~~ — **done.** Project `ScentKeep`
      (id `0770dfee`), entitlement id **`premium`** (matches the code), default
      offering Monthly / Yearly / Lifetime. The Test Store key is wired into the
      local `.env` for dev testing and is deliberately kept out of the EAS
      production environment.

- [x] ~~Generate an App Store Connect In-App Purchase key~~ — **done.**
      Key `ScentKeep`, Key ID **`K3778CNYXU`**, downloaded to
      `credentials/SubscriptionKey_K3778CNYXU.p8` (git-ignored, PEM shape
      validated).

- [x] ~~Attach the In-App Purchase key in RevenueCat~~ — **done, and no file
      upload was needed after all.**

      App Store Connect In-App Purchase keys are **team-wide**, not per-app, and
      RevenueCat already held the team's key (`9Y6X8BL4GM`, used by Drippyy and
      EmberFree iOS). Selecting it covered ScentKeep too, so the app
      configuration was created without handling a private key at all — a
      strictly better outcome than uploading one.

      The `K3778CNYXU` key I generated earlier is now a documented spare, with
      its `.p8` safely in `credentials/`. Worth keeping: the team key's own
      `.p8` was never saved anywhere, so this is the only IAP key on this
      machine that could be re-registered if the other were ever revoked.

- [x] ~~Get the `appl_…` SDK key into the build~~ — **done.**
      `appl_jqcEfGxgCCtbfsdwuOpyuHSkOyb`, in both the local `.env` and the EAS
      **production** environment (verified with `eas env:list production`).
      That was the last thing standing between the app and real purchases.

      > ⚠️ RevenueCat has an **open incident**: *"Newly created apps error with
      > 'The key is not valid or is not compatible with the Bundle ID of your
      > app'."* If the first sandbox purchase misbehaves, check
      > https://status.revenuecat.com/incidents/mr3l9wqygn3d before debugging
      > your own code.

- [ ] **Confirm the RevenueCat account email.** The dashboard is showing *"Your
      email address is not yet confirmed"*, which can restrict actions.

- [x] ~~Create the three products in App Store Connect~~ — **done, and all three
      report `READY_TO_SUBMIT` by API.**

      | Product | Type | Price | Offer |
      |---|---|---|---|
      | `scentkeep_premium_monthly` | Auto-renewing | $4.99 / month | — |
      | `scentkeep_premium_annual` | Auto-renewing | $24.99 / year | 30-day free trial |
      | `scentkeep_lifetime` | Non-consumable | $59.99 | — |

      All priced across **175 territories**, availability set everywhere with
      `availableInNewTerritories: true`, and each carries its App Review
      screenshot. `node scripts/finish-iap.js` re-checks the lot and repairs
      anything missing; `--apply` to act.

      > ⚠️ **Prices went through the UI, not the API.**
      > `POST /v1/subscriptionPrices` silently sets a **US-only** price: the
      > product displays the price but stays `MISSING_METADATA` and the
      > validator says "You must add a subscription price." The working path is
      > subscription → Subscription Prices → View all → Starting Price → Edit
      > Price → **"Recalculate prices for all countries or regions"**.

      > Two API notes worth keeping: a missing availability record **404s**
      > while a missing screenshot returns **200 with `data: null`** — both mean
      > "unset". And an introductory offer **requires** a territory, so the
      > 30-day trial is 175 rows, which is exactly what the UI's country picker
      > creates behind the scenes.

- [ ] **Wire the RevenueCat webhook.**
      - URL: `https://iqpknjohrjieepvzgqoz.supabase.co/functions/v1/revenuecat-webhook`
      - Set an Authorization header value, then store the same value as a
        Supabase Edge Function secret named `REVENUECAT_WEBHOOK_SECRET`.
      - The function **fails closed**: with no secret set it rejects everything
        with 401, by design. Verified.

- [ ] **First IAP submission = FOUR items in ONE draft submission.**
      The app version **+ each subscription + the subscription group** (the
      group has its own "Add for Review" button). Omit the group and you get
      *"must be submitted with its subscription group."* The ASC API **cannot**
      add subscriptions or the group to a submission — `reviewSubmissionItems`
      only accepts `appStoreVersion`. This step is UI-only.

---

---

## C2. TestFlight — one field left

- [x] ~~Fill in the Test Information~~ — **done**, via
      `node scripts/testflight-info.js`. Beta app description, the per-build
      "What to Test" on build 5, marketing and privacy URLs, and the beta review
      notes are all in place.

      Feedback email points at `nathan@zrionix.dev` rather than
      `support@scentkeep.com`, because Email Routing is still pending your
      verification click and an address that bounces is worse than a personal
      one that works. Re-run the script once routing is green and it flips.

- [ ] **Give it the App Review contact phone number.** Apple requires one before
      beta review will accept the app, and it is not in the repo on purpose —
      it is your personal data and you should be the one who types it:
      ```bash
      SCENTKEEP_REVIEW_PHONE="+1 555 123 4567" node scripts/testflight-info.js --apply
      ```

- [ ] **Submit for Beta App Review** (external testing only). Internal testers
      can install build 5 right now without it. I have deliberately not pressed
      this — it is an outward-facing submission.

---

## D. Analytics (optional, but §11's metrics need it)

- [ ] **PostHog project API key** (`phc_…`) → I'll add it to the EAS production
      environment. Without it the funnel (install → onboarding → trial → paid)
      collects nothing, and the paywall A/B variant always serves the default.

- [ ] **Sentry — decide yes or no.** If yes, the App Privacy label **must** gain
      a Crash Data / Performance Data declaration. A label that doesn't match
      reality is a rejection and a trust problem.

---

## E. Android (whenever you want it)

- [ ] Play Console → Setup → API access → service account with *Release
      manager* → download JSON → save at
      `credentials/play-service-account.json`.
- [ ] The Android production build already works with an EAS-generated keystore
      — no login needed.

---

## E2. Home-screen widget and Apple Watch — assessed, deliberately deferred

Both were asked for. Neither belongs in 1.0, and one of them is not worth
building yet at all. The reasoning, so this does not get re-litigated later:

**Both require leaving the managed workflow.** They are native Apple targets,
added by a config plugin
([`expo-apple-targets`](https://github.com/EvanBacon/expo-apple-targets), which
describes itself as experimental) plus a `prebuild`. That changes the native
project, which means the binary already sitting in TestFlight as build 5 is no
longer the thing being tested. Shipping them with 1.0 would throw away the
verification that build already has.

**The widget is worth doing, in 1.1.** It is bounded: an App Group, a small
Swift WidgetKit extension, and a native write of a "today's pick" snapshot the
extension reads. The domain logic it needs already exists and is tested
(`src/domain/suggest.ts`) — only the plumbing is missing.

The real cost is iteration speed, not difficulty. Xcode is macOS-only and this
machine is Windows, so the Swift can be authored and compiled on EAS Build's
macOS workers but never previewed, simulated or stepped through. Every attempt
is a ~20-minute cloud build. Budget for that rather than being surprised by it.

**The Watch app is not worth it yet.** React Native does not run on watchOS at
all, so it is a from-scratch SwiftUI app plus a WatchConnectivity bridge — not a
config change. On top of the no-Xcode problem, it cannot be verified without a
physical Apple Watch paired to a device running the TestFlight build. It should
follow the widget, not precede it, and only once the widget has proven the App
Group plumbing works.

**What you can have today, for free:** the app registers the `scentkeep://`
scheme and expo-router maps `scentkeep://log-sotd` straight to the logging
screen. A user can already put a one-tap "log my scent" button on their Home
Screen with the Shortcuts app. Worth confirming on the TestFlight build before
mentioning it anywhere — see the check in section F.

---

## F. Before you hit Submit — verify by API

- [ ] `npm run ship-check` green (type-check, lint, 401 tests, ASO limits)
- [ ] `npm run test:rls` green (18 cross-user denial assertions)
- [ ] `npm run e2e` green (97 steps)
- [ ] `scentkeep://log-sotd` opens the logging screen from Safari or Shortcuts
      on the TestFlight build. This is what lets someone build their own
      one-tap Home Screen button before the real widget exists.
- [ ] `npm run check:links` green (all four review URLs public, no SSO wall)
- [ ] `npx eas-cli env:list production` shows **every** `EXPO_PUBLIC_*`
      > This is the #1 silent failure in Expo. `.env` is git-ignored, so cloud
      > build workers never see it. Any missing var ships as a stub.
- [ ] Sandbox purchase on TestFlight opens the **native StoreKit sheet**, the
      entitlement flips, and Restore works.
      > The native sheet appearing is the *only* proof the production RevenueCat
      > key made it into the binary. Silent premium, or a "test store" sheet,
      > means the key is missing.
- [ ] App Privacy label matches `store/data-safety.md` exactly
- [ ] Review notes pasted from `store/review-notes.md`
- [ ] Screenshots uploaded from `store/screenshots/` (1320×2868)
- [ ] Developer name reads **Zrionix Technology, INC**
- [ ] Version + every IAP + the group all show `WAITING_FOR_REVIEW`
- [ ] Repo pushed to a remote and the shipped build tagged (`v1.0-buildN`)

---

## What I already did, so you don't redo it

- Supabase project provisioned, schema + RLS applied, advisors clean
- Anonymous sign-in enabled
- Both Edge Functions deployed and ACTIVE, both verified to reject
  unauthenticated calls
- Private per-user photo bucket with policies, verified by the RLS test
- Marketing/privacy/terms/support site written and deployed, SSO protection
  turned off so App Review isn't met with a login wall
- EAS project created, production env vars set and verified
- Icons, splash, adaptive icon and store screenshots generated from the real app
- ASO metadata written and character-limit checked
- Test data purged from the database — it starts clean
