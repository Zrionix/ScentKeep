# App Review Notes — ScentKeep 1.0.0

*Paste the "For Review" section into App Store Connect → App Review Information → Notes.*

---

## For Review

**What ScentKeep does**

ScentKeep is a personal catalogue for a fragrance collection. A user records the
perfumes they own — photo, house, note pyramid, size, price, personal ratings —
keeps a wishlist, and logs a "Scent of the Day" each day. The accumulated wear
history produces collection insights: most-worn bottles, cost per wear, how much
of the collection is in rotation, and which bottles have gone untouched.

**No account is required.** The app is fully usable on first launch with no
sign-up, no email, and no personal details. Everything below is reachable
immediately — please do not wait for a login screen, there isn't one.

**How to reach each feature**

1. Launch → a three-step onboarding (skippable from step 2).
2. **Wardrobe** tab → the "+" button (bottom right) adds a bottle. Only a name
   is required.
3. **Wardrobe** → the "Scent of the Day" card at the top → pick a bottle → "Log
   today's scent".
4. **Diary** tab → the dated history, streaks, and eight-week activity view.
5. **Insights** tab → collection statistics. Rotation, neglected bottles and the
   family/season breakdowns are Premium; they show a "Premium" card when locked.
6. **Settings** tab → daily reminder, theme, currency, data export, account
   deletion, and Restore Purchases.

**Reaching the paywall**

Add 12 bottles (the free limit) and tap "+" again — the paywall opens. It is
also reachable directly from Settings → the "ScentKeep Premium" card, and from
any locked card on the Insights tab. No demo account is needed.

**In-app purchases**

Three products, one non-consumable and two auto-renewing subscriptions in a
single group:
- Monthly — $4.99/month
- Annual — $24.99/year, with a 30-day free trial
- Lifetime — $59.99 one-time

The paywall shows, on screen: the price and period of every plan, the free-trial
length, the auto-renewal disclosure, a Restore Purchases control, and links to
Terms of Use and Privacy Policy. Everything Premium is advertised as unlocking is
actually gated in code (see `src/domain/entitlements.ts`) — nothing is listed
that the free tier already has.

**Privacy and data**

- Anonymous-first. A user is identified only by a random ID; no email, name,
  phone number, contacts, or location is collected at any point.
- The collection lives on the device. It is uploaded only for Premium
  subscribers who have cloud backup, and then only to that user's own rows,
  enforced by Postgres row-level security.
- Bottle photos are chosen by the user from their library or camera. They are
  stored in a private, per-user bucket and are never public.
- Settings → "Export my data" produces a complete JSON file of everything the
  user has entered.
- Settings → "Delete everything" removes the account and all associated data
  from our servers (guideline 5.1.1(v)).
- No advertising, no third-party ad SDKs, no tracking across apps. The App
  Tracking Transparency prompt is not shown because we do not track.

**Permissions and why**

- **Photos / Camera** — only when the user taps the photo area on the add-bottle
  form, to attach a picture of their own bottle. Both are optional; the app is
  fully functional without granting either.
- **Notifications** — only for the optional local daily reminder to log a scent.
  Local only; there is no push server and no device token is transmitted.

**Nothing restricted**

No health or medical claims, no financial services, no user-to-user content, no
social feed, no messaging, no web browser, no login, no age-restricted subject
matter. Perfume is discussed strictly as a consumer product the user owns.

---

## 4.3 (spam / duplicate) — differentiation

The fragrance-tracking category is small, but the distinction is worth stating.
ScentKeep is not a generic list app with a fragrance theme:

- **A real daily loop.** The Scent of the Day diary, streaks, and the activity
  grid are the core of the product, not a field on a record.
- **Derived analytics, not stored fields.** Rotation ratio, cost per wear,
  neglect detection and family/season breakdowns are computed from wear history.
  These are implemented and unit-tested in `src/domain/stats.ts`.
- **Domain-specific data model.** Note pyramid (top/heart/base), longevity and
  sillage ratings, olfactory family, and season/occasion tagging are fragrance
  concepts, not generic inventory fields.
- **Honest numbers.** Collection value counts only bottles that carry a price and
  says so on screen ("Based on 9 of 14 bottles") rather than implying it covers
  the whole shelf.

---

## 2.1 — completeness

- No placeholder content, no "coming soon", no dead links.
- Every screen has a designed empty state; a brand-new install shows guidance,
  never a blank list.
- The app launches and is fully usable with no network connection.
- Support, Privacy and Terms URLs are live before submission.

## 3.1.2 — subscription disclosure

Present on the paywall, visible without scrolling past the plans:
price + period per plan, free-trial length, auto-renew terms, Restore Purchases,
Terms of Use link, Privacy Policy link, and a link to manage the subscription.

## 5.1.1 — permissions & data

Purpose strings are specific to the actual use. Account deletion is available
in-app at Settings → "Delete everything". The App Privacy label declares exactly
what is listed in `data-safety.md` and nothing more.

---

## Known limitations in 1.0

Stated for transparency; none block review:

- Cloud sync resolves conflicts last-write-wins. This is a single-user
  collection, so there is no second editor whose edit could be lost.
- The fragrance database is user-entered. ScentKeep deliberately does not scrape
  or bundle a third-party fragrance encyclopedia.
- iPhone only for 1.0 (`supportsTablet: false`). iPad is not claimed.
