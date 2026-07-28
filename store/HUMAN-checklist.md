# ScentKeep — the human's checklist

Everything reversible and non-credential is already done. This is the list only
you can clear, in the order that unblocks the most.

Verify each step **by API where possible, not by a UI banner** — App Store
Connect's web UI lies about state more often than it should.

---

## A. Before anything else (5 minutes, decides the rest)

- [ ] **Pick the public support email.** The site and App Review both need a
      mailbox a human reads. Options: buy `scentkeep.app` (~$10/yr, available)
      and use `support@scentkeep.app`, or use an address you already own. Tell
      me which and I'll update `site/support.html`, `site/privacy.html`,
      `site/terms.html` and redeploy.

- [ ] **Decide on the domain.** `scentkeep.app` ($9.99/yr) and `scentkeep.com`
      ($11.25/yr) are both free right now. Not required — the live site at
      `https://scentkeep.vercel.app` satisfies App Review as-is — but the name
      is unclaimed and cheap to hold.

---

## B. Apple — required for TestFlight

- [ ] **Sign in to Apple for EAS credentials.**
      ```bash
      npx eas-cli credentials --platform ios
      ```
      Needs your Apple ID and 2FA, which is why I can't do it. EAS then creates
      the distribution certificate and provisioning profile for
      `com.scentkeep.app`.

- [ ] **Put the App Store Connect API key in place** at
      `credentials/AuthKey_IGE22WY96LJX.p8` (git-ignored). Issuer ID
      `905684d2-c99b-4bb1-91dc-98bcf84d2c81`, Key ID `IGE22WY96LJX`, already
      referenced by `eas.json`. Apple lets a `.p8` be downloaded **once** — if
      it's lost, generate a new key (App Manager role) and tell me the new ID.

- [ ] **Create the App Store Connect app record.**
      > ⚠️ **The trap:** the "Company Name" you type at *first* record creation
      > becomes the app's public developer name and **cannot be edited later**.
      > Set it to **Zrionix Technology, INC**, not a person's name. Fixing it
      > afterwards means a support request to Apple, and an Individual account
      > can't show a company name at all.

      - Bundle ID: `com.scentkeep.app`
      - Name / subtitle / keywords: copy from `store/aso-metadata.md`
      - Primary category Lifestyle, secondary Utilities
      - Age rating **4+**

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

- [ ] **Create a RevenueCat project** for ScentKeep and send me the **public**
      SDK keys (`appl_…` and `goog_…`). The `sk_` key in the tokens file is
      scoped to EmberFree and is a *secret* key — not the one the app uses.

- [ ] **Create the three products in App Store Connect**, all in **one
      subscription group**:
      | Product | Type | Price | Offer |
      |---|---|---|---|
      | `scentkeep_premium_monthly` | Auto-renewing | $3.99 / month | — |
      | `scentkeep_premium_annual` | Auto-renewing | $19.99 / year | 30-day free trial |
      | `scentkeep_lifetime` | Non-consumable | $39.99 | — |

      > ⚠️ **Set subscription prices in the UI, not the API.**
      > `POST /v1/subscriptionPrices` silently sets a **US-only** price: the
      > product displays the price but stays `MISSING_METADATA` and the
      > validator says "You must add a subscription price." Do it via
      > subscription → Subscription Prices → View all → Starting Price → Edit
      > Price → **"Recalculate prices for all countries or regions"** → set base
      > price → Confirm. It should then read "175 Countries or Regions" and go
      > `READY_TO_SUBMIT`.

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

## F. Before you hit Submit — verify by API

- [ ] `npm run ship-check` green (type-check, lint, 203 tests, ASO limits)
- [ ] `npm run test:rls` green (18 cross-user denial assertions)
- [ ] `npm run e2e` green (53 steps)
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
