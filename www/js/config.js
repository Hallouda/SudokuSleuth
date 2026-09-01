// Central config, shaped the way Firebase Remote Config would hand it back:
// a flat key/value bag with JSON-string values. `loadConfig()` is the single
// seam to swap in a real remote-config fetch later without touching callers.
window.DGConfig = (function () {
  const DEFAULTS = {
    difficulties: {
      easy: { label: 'Easy', size: 4, pool: 6, budget: 12, mode: 'classic' },
      medium: { label: 'Medium', size: 5, pool: 8, budget: 18, mode: 'classic' },
      hard: { label: 'Hard', size: 6, pool: 9, budget: 25, mode: 'classic' },
      // Expert: a real 9x9 Sudoku (box constraint, pool locked to exactly 9).
      // Each row gets its own small guess cap instead of one shared budget;
      // once every row is solved or capped, a uniqueness check hands the
      // player off to fill in the rest like a normal Sudoku. See js/app.js
      // (runSudokuTransition) and js/game.js (generateSudokuGrid /
      // countSudokuSolutions) for the mechanic.
      expert: { label: 'Expert', size: 9, pool: 9, guessesPerRow: 3, mode: 'sudoku' },
    },
    ads: {
      interstitialEnabled: true,
      // Fire only after finishing row 3 or 4, and only for this fraction of
      // games. Lowered from the original 0.4 now that two more interstitial
      // placements exist (see js/ads.js registerGameBoundary /
      // tryShowBoundaryInterstitial: end-of-game + before-next-game, shared
      // ~1-in-2-games cadence) — this one stays as an independent, smaller
      // chance on top, so a single game can rarely get two ads but most
      // don't get more than one across all three placements combined.
      interstitialTriggerRows: [3, 4],
      interstitialFrequency: 0.25,
      // Minimum gap between any two interstitials (any placement), so a
      // fast replay right after an end-of-game ad can't trigger a second
      // one back-to-back.
      interstitialCooldownMs: 60000,
      rewardedGuessGrant: 2,
      rewardedMaxPerGame: 1,
      // Android IDs are this app's real AdMob units (project "Sudoku Sleuth",
      // App ID ca-app-pub-3794065271065209~2698853479, set in
      // android/app/src/main/res/values/strings.xml).
      //
      // `testing` controls the plugin's per-request isTesting flag. false =
      // real production ads. Set true again for local dev / emulator work so
      // you never risk an invalid-traffic strike; to test on a real device
      // with testing:false, register that device in AdMob → Settings → Test
      // devices instead. Never tap a live ad on your own device. See README
      // ("Real ads (AdMob)").
      //
      // iOS IDs are still Google's public test units — there's no ios/
      // project yet; create real iOS units (and a matching iOS App ID) when
      // one is added, don't reuse the Android IDs cross-platform.
      admob: {
        testing: false,
        interstitialAndroid: 'ca-app-pub-3794065271065209/7727818878',
        interstitialIos: 'ca-app-pub-3940256099942544/4411468910',
        rewardedAndroid: 'ca-app-pub-3794065271065209/2475492192',
        rewardedIos: 'ca-app-pub-3940256099942544/1712485313',
      },
    },
  };

  let current = null;

  // TODO(remote-config): once Firebase Remote Config (or similar) is wired in,
  // replace this with a real fetch-and-activate call and merge over DEFAULTS.
  async function loadConfig() {
    if (current) return current;
    current = JSON.parse(JSON.stringify(DEFAULTS));
    return current;
  }

  function get() {
    if (!current) throw new Error('DGConfig not loaded yet — call loadConfig() first.');
    return current;
  }

  return { loadConfig, get };
})();
