# credentials/

**Everything in this folder is git-ignored except this README.** Never commit a
key, and never paste one into code, a commit message, or a log.

## What belongs here

### `AuthKey_X25AAYH8QT.p8` — App Store Connect API key
Used by `eas submit` (see `eas.json` → `submit.production.ios`) and by
`scripts/asc.js`.

- **Issuer ID:** `905684d2-c99b-4bb1-91dc-98bcf84d2c81`
- **Key ID:** `X25AAYH8QT` (Admin, all apps)

Verified working: `node scripts/asc.js verify`.

> **Why not `IGE22WY96LJX`?** That key id is in the founder's notes and is real —
> it is an *Individual* key with Account Holder access — but its `.p8` was never
> saved, and Apple lets a `.p8` be downloaded **exactly once**. Rather than burn
> a new key, this project reuses the team's existing Admin key, whose `.p8` was
> kept. Admin access covers every app on the team, including ScentKeep.

### `SubscriptionKey_K3778CNYXU.p8` — In-App Purchase key
Required by RevenueCat before it will create an App Store app configuration.
Generated for ScentKeep on 28 July 2026.

- **Issuer ID:** `905684d2-c99b-4bb1-91dc-98bcf84d2c81`
- **Key ID:** `K3778CNYXU`

This is a *different key type* from the App Store Connect API key above —
App Store Connect → Users and Access → Integrations → **In-App Purchase**.
It signs client-to-server IAP requests, which is why StoreKit 2 transactions
fail to record without it.

### `play-service-account.json` — Google Play service account
Used by `eas submit` for the Play internal track.

Google Play Console → Setup → API access → create/link a service account in
Google Cloud, grant it *Release manager*, download the JSON key, then invite
that service-account email under Users and permissions.

## Rotation

If a key is ever exposed, revoke it at the provider first, then generate a
replacement. Both providers let you hold several active keys, so rotation does
not require downtime.
