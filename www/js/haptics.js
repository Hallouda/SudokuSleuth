// Thin wrapper over @capacitor/haptics; no-ops silently in plain-browser dev.
window.DGHaptics = (function () {
  const haptics = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;

  function impactLight() {
    if (haptics) haptics.impact({ style: 'LIGHT' });
  }

  function impactMedium() {
    if (haptics) haptics.impact({ style: 'MEDIUM' });
  }

  function notificationSuccess() {
    if (haptics) haptics.notification({ type: 'SUCCESS' });
  }

  function notificationError() {
    if (haptics) haptics.notification({ type: 'ERROR' });
  }

  return { impactLight, impactMedium, notificationSuccess, notificationError };
})();
