// Ad placement logic per the design doc (section 3.2). Trigger points,
// frequency capping, and the one-rewarded-per-game rule are real product
// logic and live here regardless of SDK; only the two low-level "actually
// show an ad" implementations below differ:
//
// - Native (Capacitor Android/iOS, @capacitor-community/admob installed):
//   real AdMob interstitial/rewarded ads, gated by a Google UMP consent
//   flow. Ad unit IDs come from DGConfig (js/config.js) — defaulted to
//   Google's public *test* IDs, see the TODO there before a real release.
// - Browser dev (no native bridge, e.g. `npx serve www`): a blocking mock
//   overlay stands in, so the game is still fully playable/testable without
//   a device. Same pattern as js/storage.js and js/haptics.js.
window.DGAds = (function () {
  const admob = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob;
  const isIos = !!(window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform() === 'ios');

  // Mirrors the string values of @capacitor-community/admob's
  // InterstitialAdPluginEvents / RewardAdPluginEvents / AdmobConsentStatus
  // enums. Hardcoded because this project has no bundler to import the
  // plugin's TS enums from a plain <script> file (same reasoning as
  // js/storage.js and js/haptics.js reaching into window.Capacitor.Plugins
  // directly instead of importing anything).
  const INTERSTITIAL_EVENTS = {
    Dismissed: 'interstitialAdDismissed',
    FailedToShow: 'interstitialAdFailedToShow',
  };
  const REWARD_EVENTS = {
    Rewarded: 'onRewardedVideoAdReward',
    Dismissed: 'onRewardedVideoAdDismissed',
    FailedToShow: 'onRewardedVideoAdFailedToShow',
  };
  const CONSENT_STATUS_REQUIRED = 'REQUIRED';

  let cfg = null;
  let hasShownInterstitialThisGame = false;
  let rewardedShownCount = 0;
  let sdkInitStarted = false;

  // Game-boundary interstitial state (end-of-game + before-next-game
  // placements — see registerGameBoundary/tryShowBoundaryInterstitial
  // below) and a cooldown shared by every interstitial placement, so two
  // triggers landing close together (e.g. a fast replay right after an
  // end-of-game ad) never show back-to-back.
  let boundaryCount = 0;
  let boundaryIsAdSlot = false;
  let boundaryConsumed = true;
  let lastInterstitialAt = 0;

  function init(adsConfig) {
    cfg = adsConfig;
  }

  function newGame() {
    hasShownInterstitialThisGame = false;
    rewardedShownCount = 0;
  }

  function cooldownElapsed() {
    return Date.now() - lastInterstitialAt >= (cfg.interstitialCooldownMs || 0);
  }

  function adUnitId(kind) {
    const ids = cfg.admob;
    return isIos ? ids[kind + 'Ios'] : ids[kind + 'Android'];
  }

  // Initializes the Google Mobile Ads SDK and runs the UMP consent flow
  // (GDPR/EEA + iOS App Tracking Transparency, when configured in the AdMob
  // console). Call once at app boot (see app.js boot()). No-ops safely in
  // browser dev and never throws — ads just won't show if this fails, the
  // game itself must never be blocked by ad setup.
  async function initializeSdk() {
    if (!admob || sdkInitStarted) return;
    sdkInitStarted = true;
    try {
      await admob.initialize();
      const consentInfo = await admob.requestConsentInfo();
      if (consentInfo.isConsentFormAvailable && consentInfo.status === CONSENT_STATUS_REQUIRED) {
        await admob.showConsentForm();
      }
    } catch (e) {
      console.warn('[ads] AdMob initialization failed:', e);
    }
  }

  // Whether a "Privacy Options" entry should be shown in Settings so the
  // user can revisit their consent choice (mainly EEA/UK users under GDPR).
  async function privacyOptionsRequired() {
    if (!admob) return false;
    try {
      const info = await admob.requestConsentInfo();
      return info.status === CONSENT_STATUS_REQUIRED;
    } catch (e) {
      return false;
    }
  }

  // Re-opens the UMP consent form. This plugin has no dedicated "privacy
  // options" API (unlike newer UMP SDKs), so the closest equivalent is
  // resetting stored consent and re-running the request/show flow.
  async function showPrivacyOptions() {
    if (!admob) return;
    try {
      await admob.resetConsentInfo();
      const consentInfo = await admob.requestConsentInfo();
      if (consentInfo.isConsentFormAvailable) {
        await admob.showConsentForm();
      }
    } catch (e) {
      console.warn('[ads] showPrivacyOptions failed:', e);
    }
  }

  // Call this right after a row is completed (never while the player has a
  // partially-typed guess in the input — callers must only invoke this
  // between input sessions, e.g. immediately after a successful submit).
  async function maybeShowInterstitialAfterRow(rowNumberOneIndexed, adsRemoved) {
    if (adsRemoved) return false;
    if (!cfg || !cfg.interstitialEnabled) return false;
    if (hasShownInterstitialThisGame) return false;
    if (!cfg.interstitialTriggerRows.includes(rowNumberOneIndexed)) return false;
    if (Math.random() > cfg.interstitialFrequency) return false;
    if (!cooldownElapsed()) return false;

    hasShownInterstitialThisGame = true;
    await showInterstitial();
    return true;
  }

  // Decides whether the game boundary that just occurred (a game finished
  // OR was quit — see app.js endGame()/onQuitGame()) is an "ad boundary":
  // roughly every other game gets exactly one interstitial across the two
  // placements below, not one each. Call once per boundary, before trying
  // to show anything.
  function registerGameBoundary() {
    boundaryCount++;
    boundaryIsAdSlot = boundaryCount % 2 === 0;
    boundaryConsumed = false;
  }

  // Tries to show the current boundary's interstitial (if it's an ad slot
  // and nothing has claimed it yet). Called from two spots that together
  // cover every path into a new game — endGame() right before the result
  // screen appears (the player is already paused, ad plays "for free"), and
  // startNewGame() right before a fresh game starts (catches the boundary
  // when endGame()'s attempt was skipped — cooldown still active — or never
  // ran at all, e.g. the previous game was quit rather than finished).
  // Whichever call reaches an unconsumed ad-slot boundary first shows it;
  // the other becomes a no-op for that same boundary.
  async function tryShowBoundaryInterstitial(adsRemoved) {
    if (adsRemoved) return false;
    if (!cfg || !cfg.interstitialEnabled) return false;
    if (!boundaryIsAdSlot || boundaryConsumed) return false;
    if (!cooldownElapsed()) return false;

    boundaryConsumed = true;
    await showInterstitial();
    return true;
  }

  function canOfferRewarded() {
    return !!cfg && rewardedShownCount < cfg.rewardedMaxPerGame;
  }

  // Resolves { granted: boolean, guesses: number }
  async function showRewarded() {
    if (!canOfferRewarded()) return { granted: false, guesses: 0 };
    rewardedShownCount += 1;
    if (admob) return showRealRewarded();
    const watched = await mockAdOverlay(
      'Watch a short video for +' + cfg.rewardedGuessGrant + ' guesses?',
      'Watch Ad'
    );
    return watched ? { granted: true, guesses: cfg.rewardedGuessGrant } : { granted: false, guesses: 0 };
  }

  async function showInterstitial() {
    // Marked at the moment we commit to showing, before the (possibly slow)
    // load/show completes, so a second trigger can't sneak in during that
    // window and race past the cooldown check above.
    lastInterstitialAt = Date.now();
    if (admob) return showRealInterstitial();
    await mockAdOverlay('Interstitial ad (mock)', 'Continue', true);
  }

  // Unlike showRewarded(), this isn't limited to one-per-game — used for
  // Expert-mode hints, which are explicitly repeatable (every hint past the
  // first free one costs a fresh ad view). Resolves true if watched.
  async function showRewardedUncapped(message) {
    if (admob) {
      const result = await showRealRewarded();
      return result.granted;
    }
    return await mockAdOverlay(message || 'Watch a short video?', 'Watch Ad');
  }

  // Registers listeners before preparing the ad, then waits for the ad to
  // load (bounded by a timeout — the game must never hang if fill rate is
  // low) and be dismissed (unbounded — a rewarded/interstitial view can run
  // 15-30s and must never be cut off on a fixed timer once it's showing).
  function showRealInterstitial() {
    const adId = adUnitId('interstitial');
    return new Promise((resolve) => {
      let settled = false;
      let handles = [];
      const cleanup = () => handles.forEach((h) => h.remove());
      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      Promise.all([
        admob.addListener(INTERSTITIAL_EVENTS.Dismissed, finish),
        admob.addListener(INTERSTITIAL_EVENTS.FailedToShow, finish),
      ]).then((h) => {
        handles = h;
        const loadTimeout = setTimeout(finish, 8000);
        admob
          .prepareInterstitial({ adId, isTesting: !!cfg.admob.testing })
          .then(() => {
            clearTimeout(loadTimeout);
            return admob.showInterstitial();
          })
          .catch(finish);
      });
    });
  }

  // Resolves { granted, guesses }. `granted` is only true if the Rewarded
  // event actually fired before the ad was dismissed (policy-compliant —
  // never grant just because the ad was requested or shown).
  function showRealRewarded() {
    const adId = adUnitId('rewarded');
    return new Promise((resolve) => {
      let settled = false;
      let earned = false;
      let handles = [];
      const cleanup = () => handles.forEach((h) => h.remove());
      const finish = (granted) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({ granted, guesses: granted ? cfg.rewardedGuessGrant : 0 });
      };

      Promise.all([
        admob.addListener(REWARD_EVENTS.Rewarded, () => {
          earned = true;
        }),
        admob.addListener(REWARD_EVENTS.Dismissed, () => finish(earned)),
        admob.addListener(REWARD_EVENTS.FailedToShow, () => finish(false)),
      ]).then((h) => {
        handles = h;
        const loadTimeout = setTimeout(() => finish(false), 10000);
        admob
          .prepareRewardVideoAd({ adId, isTesting: !!cfg.admob.testing })
          .then(() => {
            clearTimeout(loadTimeout);
            return admob.showRewardVideoAd();
          })
          .catch(() => finish(false));
      });
    });
  }

  // Minimal blocking overlay standing in for a real ad unit when there's no
  // native AdMob bridge (browser dev via `npx serve`).
  function mockAdOverlay(message, actionLabel, autoDismiss) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'dg-ad-overlay';
      overlay.innerHTML =
        '<div class="dg-ad-card">' +
        '<div class="dg-ad-badge">MOCK AD</div>' +
        '<p>' + message + '</p>' +
        '<button class="primary" id="dgAdAction">' + actionLabel + '</button>' +
        '</div>';
      document.body.appendChild(overlay);
      const finish = (result) => {
        overlay.remove();
        resolve(result);
      };
      document.getElementById('dgAdAction').addEventListener('click', () => finish(true));
      if (autoDismiss) setTimeout(() => finish(true), 1200);
    });
  }

  return {
    init,
    newGame,
    initializeSdk,
    privacyOptionsRequired,
    showPrivacyOptions,
    maybeShowInterstitialAfterRow,
    registerGameBoundary,
    tryShowBoundaryInterstitial,
    canOfferRewarded,
    showRewarded,
    showRewardedUncapped,
  };
})();
