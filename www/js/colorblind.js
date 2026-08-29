// Colorblind-safe feedback mode: swaps the green/yellow feedback colors for
// a blue/orange pair (distinguishable across red-green color-vision
// deficiencies, the most common type) and adds a non-color pattern cue on
// top, via a `colorblind` class on <html> — see css/style.css. Off by
// default; remembers an explicit user choice via DGStorage, same pattern as
// js/theme.js and js/sound.js.
window.DGColorblind = (function () {
  const KEY = 'dg_colorblind_v1';
  let enabled = false;

  function apply() {
    document.documentElement.classList.toggle('colorblind', enabled);
  }

  async function load() {
    const stored = await window.DGStorage.get(KEY);
    enabled = stored === '1';
    apply();
    return enabled;
  }

  function isEnabled() {
    return enabled;
  }

  async function setEnabled(value) {
    enabled = !!value;
    apply();
    await window.DGStorage.set(KEY, enabled ? '1' : '0');
  }

  return { load, isEnabled, setEnabled };
})();
