# Sudoku Sleuth — Google Play Console runbook

Step-by-step for the account-gated work. Tailored to where the project is:
Capacitor Android app, package `com.sudokusleuth.app`, real AdMob wired
(`admob.testing: true`), release signing via `android/keystore.properties`,
privacy policy live at <https://hallouda.github.io/privacy_policy_sudokusleuth/>.

Two things are **not done yet** and block a *production* release (but not
internal testing): the Remove Ads IAP is still a mock (`www/js/iap.js`), and
there is no `app-ads.txt` (needs an owned domain).

---

## A. Developer account (one-time, ~1–3 days)

1. <https://play.google.com/console> → pay the **$25 one-time** fee.
2. Account type: **Personal** (or Organization if you have a registered
   business + D-U-N-S number).
3. Complete **identity verification** — legal name, address, phone, a photo of
   a government ID. Google can take up to a few days to approve; you can start
   the app setup while it's pending but can't publish until verified.
4. Set up a **payments profile** only if you'll sell the Remove Ads IAP
   (you will) — Play Console → Setup → Payments profile.

> **New personal accounts:** Google requires a **closed test with ≥12 testers
> opted in for ≥14 continuous days** before you may apply for production
> access. Plan for this — line up 12 people early. Internal testing does not
> count and has no such requirement.

## B. Create the app

Play Console → **All apps → Create app**.

| Field | Value |
|---|---|
| App name | `Sudoku Sleuth` (30 char max) |
| Default language | English (United States) or your choice |
| App or game | **Game** |
| Free or paid | **Free** (Remove Ads is an in-app product, not a paid app) |
| Declarations | Confirm Play policies + US export laws |

## C. "Set up your app" checklist (App content + Store settings)

Work top to bottom through **Dashboard → Set up your app**:

1. **App access** — "All functionality is available without special access."
2. **Ads** — **Yes, my app contains ads.**
3. **Content rating** — start the **IARC questionnaire**. It's a casual number
   puzzle: no violence/sexual content/etc. Answer honestly; declare that the
   app shows ads. Expect *Everyone / PEGI 3*.
4. **Target audience and content** — target age **13 and older** (do NOT
   include under-13 age bands — that triggers Families Policy + certified ad
   SDK requirements you don't need). "Appealing to children" → No.
5. **News app** — No.
6. **COVID-19 contact tracing / status** — No.
7. **Data safety** — fill from [`data-safety.md`](data-safety.md).
8. **Government apps** — No.
9. **Financial features** — No.
10. **Health** — No.
11. **Privacy policy** — `https://hallouda.github.io/privacy_policy_sudokusleuth/`

## D. Main store listing

Fill from [`store-listing.md`](store-listing.md):

- Short description (≤80 chars), full description (≤4000 chars)
- **App icon** 512×512 PNG (32-bit). Source: `assets/logo.svg` — export at
  512 or run `npx capacitor-assets` and grab a mipmap-xxxhdpi as a base.
- **Feature graphic** 1024×500 PNG/JPG, no alpha. Required.
- **Phone screenshots** — 2 to 8, PNG/JPG, 16:9 or 9:16, min 320px shortest
  side. Capture from a device/emulator: home screen, a Classic game mid-solve,
  the Expert guessing phase, the end-of-game stats screen.
- App category: **Games → Puzzle**. Tags: add "Puzzle", "Board", "Brain games".
- Contact details: `mahdi.mohamed542@gmail.com`, website optional.

## E. Build the release artifact

From the repo (needs JDK 17 + Android SDK 35 — see main README):

```bash
# one-time: create the upload keystore and android/keystore.properties
keytool -genkeypair -v -keystore android/upload-keystore.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias upload
cp android/keystore.properties.example android/keystore.properties   # then edit

npm run sync
cd android && ./gradlew clean bundleRelease
# -> android/app/build/outputs/bundle/release/app-release.aab
```

## F. Internal testing (do this first)

1. Play Console → **Testing → Internal testing → Create new release**.
2. **Play App Signing**: accept (recommended). Your `upload-keystore.jks`
   becomes the *upload key*; Google holds the real app signing key. **Back up
   `upload-keystore.jks` and its passwords** — losing the upload key is
   recoverable via support; losing it before enrolling is not.
3. Upload `app-release.aab`. Release name auto-fills from `versionName`
   (`1.0`, `versionCode 1`). Add release notes.
4. **Testers** tab → create an email list (add your own accounts + a couple of
   others) → copy the **opt-in URL**, open it on the test device's Google
   account, install from Play.
5. Smoke-test on a real device: both mode families, ads showing **test
   creatives** (because `admob.testing: true`), the UMP consent prompt if you
   set your device region to the EEA, Settings → privacy options row, stats
   persistence across app restarts.

## G. Before promoting past internal testing

- [ ] **Replace the IAP mock** (`www/js/iap.js`) with real Play Billing, and
      create the **in-app product** in Play Console → Monetize → Products →
      In-app products (product id e.g. `remove_ads`, matching the code).
- [ ] Set `admob.testing: false` in `www/js/config.js`, rebuild, bump
      `versionCode`.
- [ ] Publish the **EEA consent message** in AdMob → Privacy & messaging.
- [ ] `app-ads.txt` on your developer domain (once you own one).
- [ ] Review the **pre-launch report** (Play runs your app on real devices —
      catches crashes, accessibility, and policy issues).

## H. Closed testing → production

1. **Testing → Closed testing** → create a track, upload the same (or newer)
   AAB, add your ≥12 testers, keep it running **14+ days**.
2. When eligible, Play Console shows an **"Apply for production access"** form
   in the Production track — fill it (how you tested, target audience, etc.).
3. **Production → Create new release** → upload AAB → roll out (start at a
   staged % if you want). First production review can take a few days to
   a couple of weeks.

## I. Every subsequent upload

Bump `versionCode` (and usually `versionName`) in `android/app/build.gradle`,
`npm run sync`, `./gradlew bundleRelease`, upload to the relevant track.
There is no OTA path — every change ships as a new build.
