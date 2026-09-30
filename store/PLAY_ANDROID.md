# ScentKeep on Google Play

Package: `com.scentkeep.app`. First upload is an internal-track AAB, not a production release.

## Ready in repo
- `android.package` and `android.versionCode`
- `POST_NOTIFICATIONS` so the daily Scent of the Day reminder can fire on Android 13+
- `eas.json` profile `preview-play` builds an app bundle (Play rejects a raw APK for new apps)
- `submit.production.android.track` is `internal`

## Still needed before a build can be uploaded
1. Create the Play Console app for `com.scentkeep.app` (one-time Play developer account).
2. Place the Play service-account JSON at `credentials/play-service-account.json` and upload that key to the EAS Android credentials. Do not commit the JSON.
3. Content rating, store listing, privacy URL (`https://scentkeep.com`), and Data safety before production. Internal testing can start before those are finished.
4. Play Billing products if the paid track should match the App Store subscriptions.

## Build only (no submit)
```
eas build --platform android --profile preview-play
```
