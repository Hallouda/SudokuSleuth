// "Remove Ads" one-time IAP (design doc section 5).
//
// Native (Android): real Google Play Billing via cordova-plugin-purchase
// (`window.CdvPurchase`). One non-consumable product, id `remove_ads` — it
// must exist in Play Console → Monetize → Products → In-app products with
// that exact id, and the app must be uploaded to a track (even internal
// testing) before Play will return it.
//
// There is no backend, so purchases are trusted once Google Play reports
// them and are acknowledged locally with `transaction.finish()` (Google
// auto-refunds a purchase that isn't acknowledged within 3 days). A
// device-local flag (DGStorage) mirrors ownership so the rest of the app
// has a synchronous read and the "ads removed" state survives offline
// launches; it is reconciled against Play every launch once receipts load,
// and on an explicit "Restore purchases".
//
// Browser dev (no CdvPurchase global, e.g. `npx serve www`): a `confirm()`
// dialog stands in so the flow stays clickable without a device. Same
// pattern as js/storage.js / js/ads.js.
window.DGIap = (function () {
  const KEY = 'dg_ads_removed_v1';
  const PRODUCT_ID = 'remove_ads';

  const CDV = window.CdvPurchase;
  const store = CDV && CDV.store;
  const PLATFORM = CDV && CDV.Platform.GOOGLE_PLAY;

  let adsRemoved = false;
  let changeCbs = [];
  let pendingPurchase = []; // resolvers for in-flight purchaseRemoveAds()
  let storeInitStarted = false;

  function emitChange() {
    changeCbs.forEach((fn) => {
      try { fn(adsRemoved); } catch (e) { /* listener bug — don't break others */ }
    });
  }

  async function setRemoved(value) {
    value = !!value;
    if (value === adsRemoved) return;
    adsRemoved = value;
    await window.DGStorage.set(KEY, value ? '1' : '0');
    emitChange();
  }

  function settlePurchase(ok) {
    if (!pendingPurchase.length) return;
    const resolvers = pendingPurchase;
    pendingPurchase = [];
    resolvers.forEach((r) => r(ok));
  }

  function txnHasProduct(txn) {
    const products = (txn && txn.products) || [];
    return products.some((p) => p && p.id === PRODUCT_ID);
  }

  function ownedAccordingToStore() {
    try {
      return !!store.owned(PRODUCT_ID);
    } catch (e) {
      return adsRemoved; // can't tell — keep current
    }
  }

  // Both directions, but only called from events that mean receipt data is
  // actually loaded (receiptsReady / receiptUpdated) — so a slow startup
  // never transiently clears a real purchase.
  function reconcile() {
    setRemoved(ownedAccordingToStore());
  }

  function initStore() {
    if (storeInitStarted) return;
    storeInitStarted = true;
    try {
      store.verbosity = CDV.LogLevel.WARNING;

      store.register([{
        id: PRODUCT_ID,
        type: CDV.ProductType.NON_CONSUMABLE,
        platform: PLATFORM,
      }]);

      store.when()
        .productUpdated(() => emitChange())         // price string may have loaded
        .approved((txn) => txn.finish())            // no validator — acknowledge directly
        .finished((txn) => {
          if (txnHasProduct(txn)) {
            setRemoved(true);
            settlePurchase(true);
          }
        })
        .receiptUpdated(() => reconcile())          // restore / refund / another device
        .receiptsReady(() => reconcile());          // initial ownership at startup

      store.error((err) => {
        if (!err) return;
        console.warn('[iap] store error', err.code, err.message);
        // A cancelled or failed Play sheet surfaces here; resolve any
        // in-flight purchase as unsuccessful.
        settlePurchase(false);
      });

      store.initialize([PLATFORM]);
    } catch (e) {
      console.warn('[iap] Play Billing init failed:', e);
    }
  }

  async function load() {
    const raw = await window.DGStorage.get(KEY);
    adsRemoved = raw === '1';

    if (store) {
      // Kick native setup off in the background — boot() must not wait on a
      // store round-trip. onChange() delivers the reconciled state.
      if (window.cordova) initStore();
      else document.addEventListener('deviceready', initStore, { once: true });
    }
    return adsRemoved;
  }

  function isAdsRemoved() {
    return adsRemoved;
  }

  // Localized price (e.g. "$1.99") once the product has loaded, else null.
  function getPrice() {
    if (!store) return null;
    try {
      const p = store.get(PRODUCT_ID, PLATFORM);
      return (p && p.pricing && p.pricing.price) || null;
    } catch (e) {
      return null;
    }
  }

  // Resolves true if ads are now removed, false otherwise (cancelled,
  // failed, or the product isn't available yet).
  async function purchaseRemoveAds() {
    if (adsRemoved) return true;

    if (!store) {
      const ok = window.confirm(
        '[MOCK PURCHASE] Remove Ads — this would open the Google Play purchase ' +
        'sheet. Simulate a successful purchase?'
      );
      if (ok) await setRemoved(true);
      return ok;
    }

    const product = store.get(PRODUCT_ID, PLATFORM);
    const offer = product && product.getOffer();
    if (!offer) {
      console.warn('[iap] remove_ads not available yet (product/offer not loaded)');
      return false;
    }

    const settled = new Promise((resolve) => pendingPurchase.push(resolve));
    const orderErr = await store.order(offer);
    if (orderErr) {
      settlePurchase(false);
      return false;
    }
    // Resolved by .finished (true) or .error (false). Cap the wait so a
    // wedged sheet can't hang the caller forever.
    return Promise.race([
      settled,
      new Promise((resolve) => setTimeout(() => resolve(adsRemoved), 120000)),
    ]);
  }

  // Re-check ownership with Google Play (for a reinstall / new device).
  // Resolves the resulting adsRemoved state.
  async function restore() {
    if (!store) return adsRemoved;
    try {
      await store.restorePurchases(); // fires receiptUpdated -> reconcile()
    } catch (e) {
      console.warn('[iap] restore failed', e);
    }
    return adsRemoved;
  }

  function onChange(cb) {
    if (typeof cb === 'function') changeCbs.push(cb);
  }

  return { load, isAdsRemoved, getPrice, purchaseRemoveAds, restore, onChange };
})();
