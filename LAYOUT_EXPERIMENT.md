# Home layout experiment - Today-first

Local experiment, 26 Aug 2026. Not shipped to a store. No GitHub remote.

## Current state (before)

Tabs were Wardrobe, Diary, Insights, Settings.

Home was the wardrobe grid. Scent of the Day sat in a compact card above filters, then a Today's pick if nothing was logged. After a log, Home never showed what you logged. Streak lived only on Diary.

Diary: streak, heatmap, wear list, 30-day free history. Implemented.
Log screen: pick a bottle, optional details, one-time reminder ask. Implemented.
Insights: collection dashboard. Advanced stats and the full neglected list are Premium.
Half-done: rediscoverSuggestion() was tested and unused in UI. Rediscover notification copy existed, never scheduled.

Free limits unchanged: 12 bottles, 5 wishes, 30-day diary. Premium prices unchanged.

## Directions considered

A - Today-first Home (shipped). Tab becomes Today. Hero is SOTD with one-tap Wear this. After log, show bottles on skin plus one Been a while bottle. Shelf stays on the same screen.
B - Pinned daily bar. Grid stays the star. Weakest habit change.
C - Split Today vs Wardrobe into separate surfaces. Strong daily focus, extra navigation. Too much IA for a local experiment.

A and C were close. A wins: habit-forming without hiding the shelf.

## What shipped

Direction A. Tab label Today. Wear this logs immediately. Reminder ask can appear inline after a one-tap log, once, dismissible. Streak in header subtitle. No badges or fake urgency.

## Habit feature finished

Rediscover / Been a while. Domain already existed. After today is logged, Home shows one neglected or never-worn bottle. Full 90-day neglected list stays Premium on Insights. Weekly rediscover notifications were left unwired on purpose (default-on would nag).

## How to preview

Package scripts in package.json: start, web, ios, android, type-check, lint, test.
Expo: expo start from this folder, then web / iOS / Expo Go.
EAS: preview profile in eas.json. No GitHub remote; do not push.

## Files changed

- src/app/(tabs)/index.tsx
- src/app/(tabs)/_layout.tsx
- src/components/TodayHero.tsx (new)
- src/components/RediscoverCard.tsx (new)
- LAYOUT_EXPERIMENT.md

## Screenshots

See docs/layout-experiment/ if captures succeeded. Empty folder means screenshots were not possible here (no simulator session).

## Empty first-open (this slice)

0 bottles now get a Today hero: add the first bottle, existing add-bottle flow. Optional wishlist secondary only if wishes already exist. 1+ bottles unchanged. Preview: clear local data, Expo start script, land on Today. See EMPTY_TODAY.md. Weekly rediscover notifications still unwired.
