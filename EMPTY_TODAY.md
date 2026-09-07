# Empty Today - first-open shelf

Local 1.1 slice. Not shipped. No GitHub remote. No commit.

## Before

A brand-new collection (0 owned bottles) still opened Today. The SOTD hero was hidden, so the top of Home was a hollow header ("Add a bottle and the day starts here") and the only add tap sat under Your shelf. Wear this / Today's pick / Rediscover / Share today's scent were already off when the wardrobe was empty. Nothing fake was seeded.

## After

0 bottles: a Today hero that says they need a first bottle, with one primary tap into the existing add-bottle flow (/bottle/new, wardrobe). Optional small secondary: Add from the wishlist only if wishes already exist (switches to the wishlist shelf). No tutorial, no demo bottles, no account wall, no paywall.

1+ bottles: existing Today Home unchanged (SOTD hero, Wear this, Rediscover after a log, Share today's scent).

Weekly rediscover notifications stay unwired.

## How to preview

From the project folder C:\Project\new app:

1. Empty store: a first-open install, or Settings -> Delete everything (clears the local collection). Do not seed demo bottles.
2. Run the Expo start script from package.json.
3. Finish the existing short onboarding if it appears, then land on Today.
4. Hero should read Add a bottle to start Today with one add tap. No What are you wearing today?
5. Add a bottle. Today should return to the populated SOTD hero.

## Tests

Use the project test and type-check scripts in package.json.

## Files

- src/components/TodayHero.tsx - EmptyTodayHero + todayHeroKind
- src/components/TodayHero.test.tsx - empty vs populated
- src/app/(tabs)/index.tsx - wires the empty hero
- EMPTY_TODAY.md

## Not in this slice

Weekly rediscover notifications. Git commit. Push. Store submit. Limits and prices.
