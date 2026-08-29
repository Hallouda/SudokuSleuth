// "Remove Ads" one-time IAP (design doc section 5).
//
// TODO(iap-sdk): this is a MOCK purchase flow with no StoreKit / Play Billing
// wired in. Per the design doc, digital-good purchases MUST route through
// Apple's StoreKit / Google Play Billing respectively — neither platform
// allows an external payment system for this. Replace `purchaseRemoveAds()`
// with a real Capacitor IAP plugin call once store listings + product IDs
// exist, and verify receipts server-side or via the platform API before
// trusting `isAdsRemoved()`.
window.DGIap = (function () {
  const KEY = 'dg_ads_removed_v1';
  let adsRemoved = false;

  async function load() {
    const raw = await window.DGStorage.get(KEY);
    adsRemoved = raw === '1';
    return adsRemoved;
  }

  function isAdsRemoved() {
    return adsRemoved;
  }

  // Resolves true if the (mock) purchase succeeded.
  async function purchaseRemoveAds() {
    const confirmed = window.confirm(
      '[MOCK PURCHASE] Remove Ads — this would open the platform store sheet. Simulate a successful purchase?'
    );
    if (!confirmed) return false;
    adsRemoved = true;
    await window.DGStorage.set(KEY, '1');
    return true;
  }

  return { load, isAdsRemoved, purchaseRemoveAds };
})();
