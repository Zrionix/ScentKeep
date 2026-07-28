# credentials/

**Everything in this folder is git-ignored except this README.** Never commit a
key, and never paste one into code, a commit message, or a log.

## What belongs here

### `AuthKey_IGE22WY96LJX.p8` — App Store Connect API key
Used by `eas submit` (see `eas.json` → `submit.production.ios`) and by any
App Store Connect REST API script.

- **Issuer ID:** `905684d2-c99b-4bb1-91dc-98bcf84d2c81`
- **Key ID:** `IGE22WY96LJX`

Apple lets you download a `.p8` **exactly once**, at creation. If this file is
missing, the existing key cannot be re-downloaded — generate a new one at
App Store Connect → Users and Access → Integrations → App Store Connect API,
with the **App Manager** role, then update the Key ID in `eas.json`.

### `play-service-account.json` — Google Play service account
Used by `eas submit` for the Play internal track.

Google Play Console → Setup → API access → create/link a service account in
Google Cloud, grant it *Release manager*, download the JSON key, then invite
that service-account email under Users and permissions.

## Rotation

If a key is ever exposed, revoke it at the provider first, then generate a
replacement. Both providers let you hold several active keys, so rotation does
not require downtime.
