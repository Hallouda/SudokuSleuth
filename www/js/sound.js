// Minimal WebAudio beeps for key events (green digit, row solved, win, loss).
// Mute preference persists via DGStorage; no external audio files/deps.
window.DGSound = (function () {
  const KEY = 'dg_sound_muted_v1';
  let muted = false;
  let ctx = null;

  async function load() {
    const raw = await window.DGStorage.get(KEY);
    muted = raw === '1';
    return muted;
  }

  async function setMuted(value) {
    muted = value;
    await window.DGStorage.set(KEY, value ? '1' : '0');
  }

  function isMuted() {
    return muted;
  }

  function ensureCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  function beep(freq, durationMs, type) {
    if (muted) return;
    try {
      const c = ensureCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      gain.gain.value = 0.06;
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + durationMs / 1000);
      osc.stop(c.currentTime + durationMs / 1000);
    } catch (e) {
      // Audio not available (e.g. no user gesture yet) — fail silently.
    }
  }

  return {
    load,
    setMuted,
    isMuted,
    playGreen: () => beep(660, 90),
    playRowSolved: () => beep(880, 160),
    playWin: () => beep(990, 300),
    playLose: () => beep(220, 300, 'sawtooth'),
  };
})();
