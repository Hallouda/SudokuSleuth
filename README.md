# Sudoku Sleuth

A Capacitor-wrapped mobile puzzle game, built from `design-doc.md` (included in
this folder — that's the original product spec and is worth reading first;
it predates the "Sudoku Sleuth" name and still calls the app "Deduction Grid"
throughout — same app, just renamed since).

Row-based Mastermind-style deduction game with two families of difficulty:

- **Classic** (Easy 4×4 / Medium 5×5 / Hard 6×6): a shared guess budget across
  the whole grid, digit pool larger than the grid size.
- **Expert**: a real 9×9 Sudoku. Guess rows Mastermind-style (3 guesses/row,
  own cap per row) until every row is solved or capped, then finish the grid
  by hand like a normal Sudoku — see "Expert mode" below, it has a lot of its
  own mechanics.

Status: **Phase 1 (single-player) is built and playable**, including the
Expert/Sudoku hybrid mode, on top of the Phase 1 scope from the design doc.
Multiplayer (Phase 2) and growth features (Phase 3) are not started.

## Project layout

```
www/                     the actual app — plain HTML/CSS/JS, no build step, no framework
  index.html
  css/style.css
  js/
    config.js             difficulty tiers + ad config (remote-config-shaped)
    game.js                mode-agnostic core: generateGrid, computeFeedback,
                             generateSudokuGrid, countSudokuSolutions, isValidCompleteSudoku
    storage.js             persistence via @capacitor/preferences, localStorage fallback in-browser
    stats.js               lifetime stats: combined ("overall") + per-difficulty buckets
    theme.js               dark/light theme, defaults to system preference
    colorblind.js          colorblind-safe feedback palette toggle (Settings screen)
    sound.js, haptics.js   feedback hooks
    ads.js                 real AdMob ads (native) / mock overlay (browser dev) — see "Real ads" below
    iap.js                 MOCKED purchase flow — see "What's still mocked" below
    app.js                 the UI controller; most of the game logic lives here
test/game.test.js         unit tests for game.js's pure logic (Node's built-in test runner)
assets/logo.svg           app icon/splash source — see "App icon & splash screen" below
android/                  native Android shell (added via `npx cap add android`)
capacitor.config.json
package.json
design-doc.md             original product spec this was built from
docs/                     release paperwork — Play Console runbook, store
                            listing copy, Data safety answer sheet
.claude/launch.json       dev-server config for Claude Code's browser-preview tool
```

No `ios/` yet — adding it (`npx cap add ios`) requires Xcode, so it has to
happen on a Mac.

## Run in a browser (fastest way to iterate)

```bash
npx serve www -l 8100
```

Then open `http://localhost:8100`. (Claude Code users: `.claude/launch.json`
already has a `deduction-grid-web` config for the browser-preview tool.)

## Tests

```bash
npm test
```

Runs `www/js/game.js`'s pure logic (grid generation, Mastermind-style
feedback scoring, Sudoku generation/solution-counting) under Node's built-in
test runner — no extra dependencies. `game.js` is a plain browser script, so
the test file aliases `global.window` to the global object before requiring
it; nothing else in the app is currently under test.

## Setting up the Android build on a new machine

This zip does **not** include `node_modules/`, Gradle's `.gradle/` cache,
`android/app/build/` output, or `android/local.properties` — all regenerable
and either large or machine-specific. To get building again:

1. `npm install` in the project root.
2. Install a JDK 17 — e.g. `winget install --id Microsoft.OpenJDK.17` on
   Windows, `brew install openjdk@17` on Mac, or your distro's package manager
   on Linux. (Previous machine used Microsoft's OpenJDK 17 build; any JDK 17
   works.)
3. Install the Android SDK command-line tools — **full Android Studio is not
   required** for command-line builds:
   - Download `commandlinetools-<platform>-*.zip` from
     https://developer.android.com/studio#command-tools
   - Unzip so the layout ends up `<sdk-root>/cmdline-tools/latest/bin/...`
     (the zip extracts to a `cmdline-tools/` folder that needs renaming to
     `latest/` one level deeper — the tools error out at launch if the path
     isn't exactly right).
   - `sdkmanager --licenses` (accept all)
   - `sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"`
4. Create `android/local.properties` with a single line:
   `sdk.dir=<path-to-sdk-root>` (forward slashes work fine on Windows too).
5. Set `JAVA_HOME` / `ANDROID_HOME` for your shell session, then:
   ```bash
   cd android
   ./gradlew assembleDebug   # gradlew.bat on Windows
   ```
   First build downloads the Gradle distribution + dependencies — can take
   several minutes; rebuilds after that are fast (Gradle caching).
6. APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`. Install
   with `adb install -r app-debug.apk`, or copy it to a phone and tap it
   (enable "install from unknown sources" first).

After editing anything in `www/`, run `npm run sync` before rebuilding so the
native project picks up the changes.

## Release build & signing

`android/app/build.gradle`'s `release` build type has R8 (`minifyEnabled` +
`shrinkResources`) on and is wired to sign from `android/keystore.properties`,
which is **gitignored** — without it the release build falls back to debug
signing (Play Console rejects that).

1. Generate an upload keystore once (keep it and its passwords backed up
   outside the repo):
   ```bash
   keytool -genkeypair -v -keystore android/upload-keystore.jks \
     -keyalg RSA -keysize 2048 -validity 10000 -alias upload
   ```
2. `cp android/keystore.properties.example android/keystore.properties` and
   fill in the four values.
3. Build the App Bundle for the Play Store:
   ```bash
   cd android && ./gradlew bundleRelease
   ```
   Output: `android/app/build/outputs/bundle/release/app-release.aab`.
   (`assembleRelease` produces a signed APK for sideload testing instead.)
4. Enrol the app in **Play App Signing** when you first upload — Google then
   holds the real signing key and `upload-keystore.jks` only signs uploads.

Toolchain: JDK 17, AGP 8.7.2 / Gradle 8.9, `compileSdk`/`targetSdk` 35
(Play's minimum for new submissions). If R8 strips something the app needs
at runtime, add a keep rule to `android/app/proguard-rules.pro` (the
Capacitor and AdMob SDKs already ship their own).

## App icon & splash screen

Generated from `assets/logo.svg` via `@capacitor/assets` (dev dependency) —
a 3×3 grid mark using the app's own guess-feedback colors. To regenerate
after changing the logo:

```bash
npx capacitor-assets generate --android --iconBackgroundColor '#121213' --iconBackgroundColorDark '#121213' --splashBackgroundColor '#121213' --splashBackgroundColorDark '#121213' --logoSplashScale 0.55
```

This overwrites everything under `android/app/src/main/res/mipmap-*` and
`res/drawable*/splash.png` — safe to rerun any time, nothing there is
hand-edited. (No `--ios` here since there's no `ios/` project yet.)

## Expert mode — how it actually works

This is the most involved part of the codebase (`app.js` branches heavily on
`diffCfg.mode === 'sudoku'`), worth understanding before touching it:

- **Guessing phase**: each of the 9 rows gets its own guess cap
  (`guessesPerRow`, currently 3) instead of one shared budget. A row that
  caps out without being solved just *locks* — it does not end the game.
  Any digit confirmed green in *any* guess for that row stays confirmed
  (`state.confirmed`), even across multiple guesses; the main grid only ever
  shows this accumulated-green view, never a stale yellow/gray from the last
  guess.
- **Transition**: once every row is locked, `countSudokuSolutions()`
  (`game.js`) checks whether the confirmed cells pin down a unique Sudoku
  solution. If yes (or the grid's already fully confirmed → instant win),
  the game moves to the fill-in phase. If ambiguous, the player is offered a
  rewarded ad for **one bonus guess** (they pick which locked row to spend it
  on — see `pendingRowReopen` / `selectRow`) or can just start solving by
  hand regardless ("Solve By Hand") — **uniqueness was only ever a nicety,
  never required**: the win condition (`maybeCheckFillWin`) accepts *any*
  fully valid Sudoku completion, not just the one true secret grid.
- **Fill-in phase**: no row-number column, the whole screen is a dynamically
  JS-sized square grid (`updateBoardSize()` — sized to fit whichever
  dimension is tighter, see the long comment there before changing anything
  around board layout/sizing, there were a couple of subtle bugs already
  found and fixed: pad-position vs. reserved-padding mismatch, and
  render-before-screen-is-visible). Controls above the digit pad:
  - **Draft**: pencil-mark toggle mode — multiple candidate digits per cell.
  - **Erase**: clears the selected cell, but a cell holding the *actually
    correct* digit (matches the secret grid) is permanently locked, same as
    a given clue — can't be erased or overwritten.
  - **Hint**: first use per game is free (fills a random empty cell); every
    use after that requires a fresh ad view each time (see
    `DGAds.showRewardedUncapped` — deliberately NOT subject to the
    one-rewarded-ad-per-game cap used elsewhere).
  - When all 9 occurrences of a digit are confirmed correct, those 9 cells
    flash for 2s and that digit's pad button disables permanently
    (`checkDigitCompletionLive` / `initDigitCompletionFlags` — the latter
    runs once at fill-in start to silently pre-disable anything already
    fully confirmed from guessing, no flash).
  - Filling a cell (or a hint) leaves the same cell selected — no
    auto-advance to the next empty cell.

## Real ads (AdMob)

`js/ads.js` uses real AdMob interstitial/rewarded ads
(`@capacitor-community/admob`) on native builds, including the Google UMP
consent flow (GDPR/EEA) run once at boot (`DGAds.initializeSdk()`) and a
"Ad Privacy Choices" row in Settings (only shown when UMP says consent is
revisitable). In browser dev (`npx serve www`, no native bridge) it falls
back to the same "MOCK AD" overlay as before — that workflow is unchanged.

**Android** ships with this app's real AdMob IDs (App ID in
`android/app/src/main/res/values/strings.xml`, ad unit IDs in
`www/js/config.js`'s `DEFAULTS.ads.admob`), but `admob.testing` is `true`,
which forces **test creatives** through those real units — so dev and
internal-testing builds are safe from invalid-traffic strikes. **iOS**
entries are still Google's public test units (no `ios/` project yet).

Remaining before a public release:

1. Set `admob.testing` to `false` in `www/js/config.js` — only once the app
   is live or in a Play testing track. Before flipping it, register your
   device as an AdMob test device and never tap your own live ads.
2. In AdMob console → **Privacy & messaging**, set up a GDPR/EEA consent
   message (and an ATT message if `ios/` gets added later) — without this,
   `requestConsentInfo()` has nothing to show and the consent flow is a
   no-op (fine for non-EEA traffic, required before EEA/UK launch).
3. Publish `app-ads.txt` (line shown in AdMob → Sites & apps) on the
   developer domain once you own one, and set that domain as the developer
   website in the Play listing.
4. When an `ios/` project is added: create a separate iOS AdMob App ID +
   iOS ad units, replace the `*Ios` IDs in `config.js` — don't reuse the
   Android IDs cross-platform.
5. `npm run sync` then rebuild.

Trigger points, frequency capping, and the one-rewarded-per-game rule
(section 3.2 of the design doc) are unchanged by any of this — they're
plain product logic in `ads.js`, independent of the SDK underneath.

## What's still mocked / not wired up

Per the design doc's own sequencing, these need external accounts/credentials
before they can be real:

- **Remove Ads IAP** (`js/iap.js`): a `confirm()` dialog stands in for the
  platform purchase sheet. Must route through StoreKit / Google Play Billing
  before submission.
- **Remote config** (`js/config.js`): returns hardcoded defaults shaped like
  a Remote Config response. Wire up Firebase Remote Config (or similar) in
  `loadConfig()` to tune difficulty/ad-frequency without a release.
- **iOS**: needs `npx cap add ios` on a Mac with Xcode.
- **Privacy policy**: drafted and hosted at
  https://hallouda.github.io/privacy_policy_sudokusleuth/ (source repo:
  github.com/Hallouda/privacy_policy_sudokusleuth). Use that URL in the Play
  listing, the Play Data Safety form, and AdMob Privacy & messaging. Must be
  updated (and Data Safety kept in sync) if analytics/crash reporting is
  added later. App Tracking Transparency copy still needed if `ios/` ships.

## Not yet built (later phases per the design doc)

- Multiplayer lobbies + real-time backend (Firebase/Supabase) — Phase 2.
- Puzzle archive/subscription, public lobbies with moderation, cosmetic IAP —
  Phase 3.
