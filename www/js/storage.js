// Local persistence. Uses @capacitor/preferences on-device, falls back to
// localStorage when running plain-web (browser dev, no Capacitor bridge).
// Cloud sync (accounts) is a deliberate v2 item per the design doc, once
// multiplayer identity exists — do not add it here.
window.DGStorage = (function () {
  const prefs = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences;

  async function get(key) {
    if (prefs) {
      const { value } = await prefs.get({ key });
      return value;
    }
    return localStorage.getItem(key);
  }

  async function set(key, value) {
    if (prefs) {
      await prefs.set({ key, value });
    } else {
      localStorage.setItem(key, value);
    }
  }

  async function getJSON(key, fallback) {
    const raw = await get(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  async function setJSON(key, obj) {
    await set(key, JSON.stringify(obj));
  }

  return { get, set, getJSON, setJSON };
})();
