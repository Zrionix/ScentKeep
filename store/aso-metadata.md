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

Log every bottle with a photo, its note pyramid, size, concentration, price and your own ratings for longevity and sillage. Decants and samples get their own type, so a 5 ml split never gets counted as a full bottle. Keep a wishlist of what you're hunting. And each day, record your Scent of the Day in a single tap — building a wear history you'll actually want to look back on.

Over time that history turns into something useful: which bottles you really reach for, which have sat untouched for months, what your collection is actually made of, what each bottle has cost you per wear — and roughly how much juice you have left.

— YOUR WARDROBE —
• Every bottle with photo, house, notes, size, concentration, price and purchase date
• Bottles, decants and samples kept as distinct types
• Longevity, sillage and overall ratings
• Season and occasion tags
• Search across names, houses and notes — accents optional
• Filter by family, sort by name, house, rating or price

— WHAT SHOULD I WEAR TODAY? —
• A daily pick from your own shelf, in one tap
• It tells you why: the season you tagged it for, how long it has rested, how you rated it
• Don't like it? Another suggestion is one tap away

— SCENT OF THE DAY —
• One tap to log what you're wearing
• Optional occasion, weather, mood and a note
• A dated diary with streaks and an eight-week activity view
• A gentle daily reminder, at a time you choose

— WHAT ELSE YOU ALREADY OWN —
• Which bottles on your shelf smell like each other, and the notes they share
• Which two work layered, and which goes on first
• Where your collection is concentrated, and the families you own nothing in
• Whether that wishlist entry is really just something you already have

— SHARE YOUR SHELF —
• A card of your collection for wherever you post
• Never carries a price, a date or anything from your diary

— HOW MUCH IS LEFT —
• Live bottle levels, worked out from your own wear history
• A warning before a favourite runs dry
• An estimate of when each bottle runs out at your current rate
• Correct the level any time you top up or measure

— INSIGHTS —
• Collection value and total volume
• Most-worn bottles and cost per wear
• Rotation: how much of your collection is actually in play
• Bottles not worn in 90 days
• Breakdowns by olfactory family and by season

— WISHLIST, SPLIT IN TWO —
• What you mean to buy, and what you only mean to sniff first
• Move one to your wardrobe the day you buy it

— WORTH INSURING —
• An itemised export of your collection with prices, dates and photos
• A record you can hand to an insurer, kept honest: purchase prices only, never a valuation

— BUILT TO RESPECT YOU —
• No account required. Start using it immediately.
• Works fully offline — your collection lives on your device
• No ads, ever
• Export everything you've entered as a file you can keep
• Delete your data, for real, from inside the app

FREE
Up to 12 bottles, a 5-slot wishlist, unlimited daily logging, the last 30 days of your diary, the daily pick, and the share card.

PREMIUM
Bottle levels and rebuy warnings, the discovery tools, unlimited wardrobe and wishlist, your complete diary history, full insights, the insurance-ready export, cloud backup and sync, and extra themes.

Everything is worked out on your device from what you have entered. ScentKeep does not bundle or scrape a fragrance encyclopedia, and nothing about your collection is sent anywhere to produce a suggestion.

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

Only the first three appear on the App Store install sheet, so the order is
load-bearing: the reason to open the app daily comes first, the collection
second, the payoff third.

| Order | File | What it sells |
|---|---|---|
| 1 | `01b-today.png` | The reason to open it: today's pick, explaining itself |
| 2 | `01-wardrobe.png` | The signature screen: the collection as a shelf |
| 3 | `03-insights.png` | The paid hook: value, most-worn, cost per wear |
| 4 | `02-diary.png` | The daily loop, with streaks and the activity grid |
| 5 | `05-bottle.png` | The depth behind a single bottle |
| 6 | `09-share.png` | The card people post, with no prices on it |
| 7 | `04-log-sotd.png` | How little effort a daily log takes |
| 8 | `06-paywall.png` | Honest, itemised Premium |

`01b-today` is the same wardrobe screen as `01`, seeded with today not yet
logged — which is the only state the daily pick appears in. The seeder dates
diary entries in the **local** zone, matching what the app writes; using
`toISOString()` there puts every entry a day ahead west of Greenwich and the
pick never shows.

Captions are burned in by the store listing, not the image — Apple prefers
screenshots that read without them.

---

## Positioning note (4.3 spam-clone defence)

The category is not a clone graveyard, but the differentiation is stated plainly
in `review-notes.md`: a genuine daily-logging loop plus derived collection
analytics (rotation, cost-per-wear, neglect detection), not a list app with a
fragrance skin.
