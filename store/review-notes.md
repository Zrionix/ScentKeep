# App Review Notes — ScentKeep 1.0.0

*Paste the "For Review" section into App Store Connect → App Review Information → Notes.*

---

## For Review

**What ScentKeep does**

ScentKeep is a personal catalogue for a fragrance collection. A user records the
perfumes they own — photo, house, note pyramid, size, price, ratings — keeps a
wishlist, and logs a "Scent of the Day". That wear history produces the
insights: most-worn bottles, cost per wear, how much of the collection is in
rotation, and which bottles have gone untouched.

**No account is required.** The app is fully usable on first launch with no
sign-up, no email and no personal details. Please do not wait for a login
screen — there isn't one.

**How to reach each feature**

1. Launch → a three-step onboarding (skippable from step 2).
2. **Wardrobe** tab → the "+" button (bottom right) adds a bottle. Only a name
   is required.
3. **Wardrobe** → the "Scent of the Day" card at the top → pick a bottle → "Log
   today's scent".
4. **Wardrobe** → "Today's pick", below that card, once three bottles are on the
   shelf and nothing has been logged today. Free.
5. **Diary** tab → the dated history, streaks, and eight-week activity view.
6. **Insights** tab → collection statistics. Rotation, neglected bottles, the
   family/season breakdowns and the discovery sections are Premium; they show a
   "Premium" card when locked. "Share" in the top right makes the shelf card.
7. **Any bottle** → "Smells like this" and "Layers well with", Premium.
8. **Settings** tab → share your shelf, daily reminder, theme, currency, data
   export, account deletion, and Restore Purchases.

**On the recommendations**

Every suggestion — the daily pick, similarity matches, layering pairs, wishlist
triage — is computed on the device from what the user typed. No bundled or
scraped fragrance database, no server call, no third-party model. Each shows the
reason that produced it, and returns nothing when the data cannot support a
claim.

The share card carries no price, no date and nothing from the diary.

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

- Anonymous-first: a random ID only. No email, name, phone, contacts or
  location is collected at any point.
- The collection lives on the device. It uploads only for Premium subscribers
  with cloud backup, and only into that user's own rows, enforced by Postgres
  row-level security.
- Photos come from the user's own library or camera into a private, per-user
  bucket. Never public.
- Settings offers a complete JSON export and a real account deletion that
  removes everything from our servers (guideline 5.1.1(v)).
- No ads, no ad SDKs, no cross-app tracking. No App Tracking Transparency
  prompt, because we do not track.

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
- **Reasoning over that model.** Tier-weighted note similarity (base counts more
  than top, because that is what persists on skin), anchor/lift layering
  judgement, and remaining-volume estimates from wear history. A list app with a
  fragrance theme cannot produce any of these.
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
