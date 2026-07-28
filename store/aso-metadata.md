# ScentKeep — App Store & Play metadata

The chosen growth engine is **App Store search** (brief §6), so this is a build
artefact, not an afterthought. Character counts are enforced by
`node scripts/check-aso.js`, which fails if any field is over its store limit.

---

## Apple App Store

### App Name — 29 / 30 characters
```
ScentKeep: Fragrance Wardrobe
```

### Subtitle — 29 / 30 characters
```
Perfume collection & SOTD log
```

### Keywords — 93 / 100 characters
Comma-separated, **no spaces after commas** (each space wastes a character).
Apple already indexes every word in the App Name and Subtitle, so none of
*scentkeep / fragrance / wardrobe / perfume / collection / sotd / log* is
repeated here — repeating them buys nothing and costs the slot.

```
cologne,scent,tracker,organizer,diary,wishlist,inventory,niche,bottle,parfum,journal,rotation
```

**Term rationale**
| Term | Why |
|---|---|
| `cologne` | The other half of the audience searches "cologne collection", not "perfume". |
| `scent` | Pairs with the indexed `wardrobe` to catch "scent wardrobe" exactly. |
| `tracker`, `organizer`, `inventory` | The three nouns people actually type for this job. |
| `diary`, `journal` | Catches the SOTD-logging intent specifically. |
| `wishlist` | High-intent: someone with a wishlist is a collector. |
| `niche`, `parfum` | Enthusiast vocabulary — low volume, very high conversion. |
| `bottle` | "perfume bottle organizer" is a real, recurring query. |
| `rotation` | Community term for the set you actually wear. |

### Promotional Text — 163 / 170 characters
*(Editable without a new build — use it for seasonal pushes.)*
```
Your fragrance collection, kept properly. Log every bottle, record what you wear each day, and see what you actually reach for — and what's been sitting untouched.
```

### Description
```
ScentKeep is a digital wardrobe for the fragrances you own.

Log every bottle with a photo, its note pyramid, size, price and your own ratings for longevity and sillage. Keep a wishlist of what you're hunting. And each day, record your Scent of the Day in a single tap — building a wear history you'll actually want to look back on.

Over time that history turns into something useful: which bottles you really reach for, which have sat untouched for months, what your collection is actually made of, and what each bottle has cost you per wear.

— YOUR WARDROBE —
• Every bottle with photo, house, notes, size, price and purchase date
• Longevity, sillage and overall ratings
• Season and occasion tags
• Search across names, houses and notes — accents optional
• Filter by family, sort by name, house, rating or price

— SCENT OF THE DAY —
• One tap to log what you're wearing
• Optional occasion, weather, mood and a note
• A dated diary with streaks and an eight-week activity view
• A gentle daily reminder, at a time you choose

— INSIGHTS —
• Collection value and total volume
• Most-worn bottles and cost per wear
• Rotation: how much of your collection is actually in play
• Bottles not worn in 90 days
• Breakdowns by olfactory family and by season

— WISHLIST —
• Track the bottles you're hunting
• Move one to your wardrobe the day you buy it

— BUILT TO RESPECT YOU —
• No account required. Start using it immediately.
• Works fully offline — your collection lives on your device
• No ads, ever
• Export everything you've entered as a file you can keep
• Delete your data, for real, from inside the app

FREE
Up to 12 bottles, a 3-bottle wishlist, unlimited daily logging, and the last 30 days of your diary.

PREMIUM
Unlimited wardrobe and wishlist, your complete diary history, full insights, cloud backup and sync, and extra themes.

Premium is available monthly, annually, or as a one-time lifetime purchase. The annual plan includes a 30-day free trial. Subscriptions renew automatically unless cancelled at least 24 hours before the period ends; manage or cancel any time in your device account settings.

Privacy Policy: https://scentkeep.com/privacy
Terms of Use: https://scentkeep.com/terms
```

### Category
- Primary: **Lifestyle**
- Secondary: **Utilities**

Lifestyle is where the fragrance audience browses and where the comparable apps
sit. Utilities is the honest second — this is a cataloguing tool.

### Age rating
**4+**. No user-generated content shown to others, no web browser, no ads, no
mature themes. Perfume is a consumer product, not a restricted one, so nothing
here triggers a higher band.

### Support & marketing URLs
- Support URL: `https://scentkeep.com/support`
- Marketing URL: `https://scentkeep.com`
- Privacy Policy URL: `https://scentkeep.com/privacy`

---

## Google Play

### Title — 29 / 30
```
ScentKeep: Fragrance Wardrobe
```

### Short description — 79 / 80
```
Log the perfumes you own, record your scent of the day, and see what you wear.
```

### Full description
Reuse the App Store description above (Play allows 4000 characters; it fits).
Play indexes the full description, so the natural repetition of *fragrance*,
*perfume*, *cologne* and *collection* in the body copy is doing real work there —
unlike on Apple, where only name/subtitle/keywords are indexed.

---

## Screenshots

Generated from the real running app, never mocked up:

```bash
node scripts/screenshots.js --store
```

Output: `store/screenshots/*.png` at **1320×2868** — App Store Connect's 6.9"
iPhone requirement, which also satisfies the 6.5" slot and Play's minimums.

| Order | File | What it sells |
|---|---|---|
| 1 | `01-wardrobe.png` | The signature screen: the collection as a shelf |
| 2 | `02-diary.png` | The daily loop, with streaks and the activity grid |
| 3 | `03-insights.png` | The paid hook: value, most-worn, cost per wear |
| 4 | `04-log-sotd.png` | How little effort a daily log takes |
| 5 | `05-bottle.png` | The depth behind a single bottle |
| 6 | `06-paywall.png` | Honest, itemised Premium |

Captions are burned in by the store listing, not the image — Apple prefers
screenshots that read without them.

---

## Positioning note (4.3 spam-clone defence)

The category is not a clone graveyard, but the differentiation is stated plainly
in `review-notes.md`: a genuine daily-logging loop plus derived collection
analytics (rotation, cost-per-wear, neglect detection), not a list app with a
fragrance skin.
