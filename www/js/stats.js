// Lifetime stats + streak tracking, persisted via DGStorage.
// Streak/best-streak is called out in the design doc as the highest-priority
// addition beyond the original ask, so it's tracked front and center here.
// Stats are tracked both combined ("overall", across every difficulty) and
// broken out per difficulty, since a streak on Hard shouldn't be masked by
// a run of Easy wins or vice versa.
window.DGStats = (function () {
  const KEY = 'dg_stats_v2';
  const OLD_KEY = 'dg_stats_v1';
  const DIFF_KEYS = ['easy', 'medium', 'hard', 'expert'];

  function emptyBucket() {
    return { gamesPlayed: 0, gamesWon: 0, currentStreak: 0, bestStreak: 0 };
  }

  function emptyStats() {
    const byDifficulty = {};
    DIFF_KEYS.forEach((k) => (byDifficulty[k] = emptyBucket()));
    return { overall: emptyBucket(), byDifficulty, lastResultDate: null };
  }

  async function load() {
    const stored = await window.DGStorage.getJSON(KEY, null);
    if (stored && stored.overall && stored.byDifficulty) {
      const stats = emptyStats();
      Object.assign(stats.overall, stored.overall);
      DIFF_KEYS.forEach((k) => Object.assign(stats.byDifficulty[k], stored.byDifficulty[k] || {}));
      stats.lastResultDate = stored.lastResultDate || null;
      return stats;
    }
    // Migrate the old flat (pre-per-difficulty) shape if present.
    const old = await window.DGStorage.getJSON(OLD_KEY, null);
    if (old) {
      const stats = emptyStats();
      Object.assign(stats.overall, old);
      stats.lastResultDate = old.lastResultDate || null;
      return stats;
    }
    return emptyStats();
  }

  async function save(stats) {
    await window.DGStorage.setJSON(KEY, stats);
  }

  function bump(bucket, won) {
    bucket.gamesPlayed += 1;
    if (won) {
      bucket.gamesWon += 1;
      bucket.currentStreak += 1;
      bucket.bestStreak = Math.max(bucket.bestStreak, bucket.currentStreak);
    } else {
      bucket.currentStreak = 0;
    }
  }

  // Records the outcome of a finished single-player run and returns the
  // updated stats object. Updates both the combined "overall" bucket and the
  // bucket for the given difficulty independently.
  async function recordResult(won, diffKey) {
    const stats = await load();
    bump(stats.overall, won);
    if (diffKey && stats.byDifficulty[diffKey]) {
      bump(stats.byDifficulty[diffKey], won);
    }
    stats.lastResultDate = new Date().toISOString();
    await save(stats);
    return stats;
  }

  function winPercent(bucket) {
    if (!bucket || bucket.gamesPlayed === 0) return 0;
    return Math.round((bucket.gamesWon / bucket.gamesPlayed) * 100);
  }

  return { load, save, recordResult, winPercent, DIFF_KEYS };
})();
