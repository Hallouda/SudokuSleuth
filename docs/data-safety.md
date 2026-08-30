# Data safety (Google Play) — answer sheet

For **Play Console → App content → Data safety**. Based on what Sudoku Sleuth
actually does: Google AdMob ads, a one-time Play Billing purchase, and
device-local stats/settings. **No account, no login, no leaderboard, no server
of ours, no analytics or crash reporting.**

> Cross-check the AdMob rows against Google's own publisher guidance
> (<https://support.google.com/admob/answer/11902743>) — the exact list AdMob
> asks you to declare depends on whether personalized ads are enabled. The
> table below is the conservative set that covers personalized ads.

## Does your app collect or share user data?

**Yes** — via the Google Mobile Ads (AdMob) SDK. Nothing else leaves the
device.

On-device stats and settings (games played, streaks, theme, sound, the
"ads removed" flag) are stored with `@capacitor/preferences` and **never
transmitted**, so per Google's definitions they are *not* "collected" and are
not declared here.

## Data types

| Data type | Collected | Shared | Processed ephemerally? | Purpose | Optional? |
|---|---|---|---|---|---|
| **Device or other IDs** (advertising ID) | Yes | Yes | No | Advertising or marketing | Required |
| **Location — Approximate location** (from IP, by the ad SDK) | Yes | Yes | No | Advertising or marketing | Required |
| **App activity — App interactions** (ad impressions/clicks) | Yes | Yes | No | Advertising or marketing | Required |
| **App info and performance — Diagnostics** (ad SDK operational data) | Yes | Yes | No | Advertising or marketing | Required |

"Shared" recipient in every row: **Google** (AdMob / Google Mobile Ads SDK).

### In-app purchase ("Remove Ads")

Handled entirely by **Google Play Billing**. The app receives only a
success/fail result and stores a local flag — it does not see or store any
payment details, name, or address. Google's own processing of the transaction
is not declared as *your* collection. If Play Console's questionnaire asks
about "Purchase history," answer **No** (your app has no visibility into it).

## Security practices

- **Is all user data encrypted in transit?** Yes (HTTPS to Google).
- **Do you provide a way for users to request that their data is deleted?**
  Yes — contact `mahdi.mohamed542@gmail.com`. Also: the app holds no
  server-side data; users can reset or delete their advertising ID and opt out
  of ad personalization in Android Settings, and uninstalling clears all
  on-device data.
- **Committed to Google Play Families Policy?** No — the app targets 13+ and is
  not child-directed (see content rating / target audience).

## Ads declaration

Play Console → App content → **Ads** → **Yes, my app contains ads.**

## If you later add crash reporting / analytics (e.g. Crashlytics)

Add rows for **Crash logs**, **Diagnostics**, and possibly **App interactions**
(Analytics purpose), update the shared-recipient list, and update the privacy
policy at the same time. Data safety and the policy must always agree.
