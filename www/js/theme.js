// Dark/light theme. Defaults to the system preference on first run, then
// remembers an explicit user choice via DGStorage from then on.
window.DGTheme = (function () {
  const KEY = 'dg_theme_v1';
  let current = 'dark';

  function systemDefault() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function apply() {
    document.documentElement.setAttribute('data-theme', current);
  }

  async function load() {
    const stored = await window.DGStorage.get(KEY);
    current = stored === 'light' || stored === 'dark' ? stored : systemDefault();
    apply();
    return current;
  }

  function get() {
    return current;
  }

  async function toggle() {
    current = current === 'dark' ? 'light' : 'dark';
    apply();
    await window.DGStorage.set(KEY, current);
    return current;
  }

  return { load, get, toggle };
})();
