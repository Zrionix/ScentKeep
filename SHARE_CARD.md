# Share cards - shelf and SOTD

Local 1.1 slice. Not shipped. No GitHub remote. No commit.

## Already shipped (shelf)

Settings -> Share your shelf opens /share.

A 4:5 (1080x1350) dark-gold card of the collection: bottle name, house, photo if they already have one. Modes: most worn / top rated / latest additions. Captured with react-native-view-shot and handed to the system share sheet (expo-sharing).

Free on purpose. Never prices, dates, diary text, or collection-value totals.

## This slice (SOTD)

Today, after a log, Share today's scent opens /share with kind=sotd and a fragranceId.

Same frame and honesty rules. Composition is a single bottle - name, house, family if set, photo if they already have one - because that is what people actually post. No date on the image: Scent of the Day is the idea, not a timestamp.

Wishlist bottles are refused. The card is what is on skin.

## How to preview

From C:\Project\new app use the start script in package.json (Expo).

Then:
1. Shelf: Settings -> Share your shelf (needs at least 3 owned bottles).
2. SOTD: log a wear from Today, then tap Share today's scent.

## Tests

Use the project test and type-check scripts.

Domain coverage: src/domain/shelfCard.test.ts (existing) and src/domain/sotdCard.test.ts (this slice).

## Files

- src/domain/sotdCard.ts + src/domain/sotdCard.test.ts - allow-list of what the SOTD card may show
- src/components/SotdCard.tsx - 4:5 dark-gold poster
- src/app/share.tsx - collection (default) and SOTD (kind=sotd)
- src/components/TodayHero.tsx - Share today's scent after a log
- src/app/(tabs)/index.tsx - wires the hero to /share

## Not in this slice

Weekly rediscover notifications (still unwired). Layout pass. Git commit. Push. Store submit. Social network.
Preview from the project folder: the Expo start script (package.json "start").
