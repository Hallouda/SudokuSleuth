(function () {
  let cfg = null;
  let state = null;
  let adsRemoved = false;
  let currentGuess = [];
  let timerHandle = null;

  async function boot() {
    await window.DGConfig.loadConfig();
    cfg = window.DGConfig.get();
    await window.DGStorage.get('__init__'); // warms storage backend
    await window.DGTheme.load();
    await window.DGSound.load();
    await window.DGColorblind.load();
    adsRemoved = await window.DGIap.load();
    window.DGAds.init(cfg.ads);
    window.DGAds.initializeSdk();

    wireControls();
    updateSoundBtn();
    updateColorblindBtn();
    updateRemoveAdsBtn();
    updateThemeBtn();
    showScreen('home');

    window.addEventListener('resize', () => {
      if (state) updateBoardSize();
    });
  }

  function wireControls() {
    document.getElementById('playBtn').addEventListener('click', () => openModal('difficultyModal'));
    document.getElementById('difficultyCloseBtn').addEventListener('click', () => closeModal('difficultyModal'));
    document.getElementById('diffPicker').addEventListener('click', (e) => {
      const btn = e.target.closest('.diff-pick-btn');
      if (!btn) return;
      closeModal('difficultyModal');
      startNewGame(btn.dataset.diff);
    });
    document.getElementById('quitGameBtn').addEventListener('click', onQuitGame);

    document.getElementById('shareBtn').addEventListener('click', onShareClick);

    document.getElementById('statsNavBtn').addEventListener('click', openLifetimeStats);
    document.getElementById('statsCloseBtn').addEventListener('click', () => closeModal('statsModal'));

    document.getElementById('settingsNavBtn').addEventListener('click', onOpenSettings);
    document.getElementById('settingsCloseBtn').addEventListener('click', () => closeModal('settingsModal'));
    document.getElementById('soundToggleBtn').addEventListener('click', onToggleSound);
    document.getElementById('colorblindToggleBtn').addEventListener('click', onToggleColorblind);
    document.getElementById('removeAdsBtn').addEventListener('click', onRemoveAds);
    document.getElementById('privacyOptionsBtn').addEventListener('click', () => window.DGAds.showPrivacyOptions());
    document.getElementById('themeToggleBtn').addEventListener('click', onToggleTheme);

    document.getElementById('endGameHomeBtn').addEventListener('click', () => {
      closeModal('endGameModal');
      showScreen('home');
    });
    document.getElementById('endGameReplayBtn').addEventListener('click', () => {
      closeModal('endGameModal');
      startNewGame(state.diffKey);
    });

    document.getElementById('oogAddGuessesBtn').addEventListener('click', onOutOfGuessesAddGuesses);
    document.getElementById('oogEndGameBtn').addEventListener('click', onOutOfGuessesEndGame);
  }

  function showScreen(name) {
    document.getElementById('screenHome').classList.toggle('active', name === 'home');
    document.getElementById('screenGame').classList.toggle('active', name === 'game');
  }

  function openModal(id) {
    document.getElementById(id).classList.add('open');
  }
  function closeModal(id) {
    document.getElementById(id).classList.remove('open');
  }

  function onQuitGame() {
    if (state && !state.over && !window.confirm('Quit this game? Your progress will be lost.')) return;
    // A quit never reaches endGame() (which is where a finished game
    // registers its ad boundary), so an abandoned game would otherwise
    // never count toward the alternating interstitial cadence at all —
    // register it here instead. No ad is shown on quit itself (interrupting
    // an explicit "get me out" tap reads as punitive); if this boundary
    // turns out to be an ad slot, startNewGame() picks it up next time.
    if (state && !state.over) window.DGAds.registerGameBoundary();
    stopTimer();
    showScreen('home');
  }

  // Shared by both ways a new game can start (difficulty picker, replay).
  // Gives the "before new game" interstitial a chance to fire first — see
  // js/ads.js registerGameBoundary/tryShowBoundaryInterstitial — before
  // switching to the game screen, mirroring the end-of-game placement in
  // endGame() below (same alternating boundary, whichever moment hits it
  // first "wins").
  async function startNewGame(diffKey) {
    await window.DGAds.tryShowBoundaryInterstitial(adsRemoved);
    // Screen must be visible BEFORE newGame()'s render() runs, or
    // updateBoardSize() measures a display:none box (all zeros) and
    // clamps the board to its minimum size until the next render.
    showScreen('game');
    newGame(diffKey);
  }

  function newGame(diffKey) {
    const diffCfg = cfg.difficulties[diffKey];
    const isSudoku = diffCfg.mode === 'sudoku';
    const size = diffCfg.size;
    const secretGrid = isSudoku
      ? window.DGGame.generateSudokuGrid(size)
      : window.DGGame.generateGrid(size, diffCfg.pool);

    state = {
      diffKey,
      diffCfg,
      secretGrid,
      rowSolved: Array(size).fill(false),
      rowHistory: Array.from({ length: size }, () => []),
      selectedRow: 0,
      over: false,
      won: false,
      startedAt: Date.now(),
      endedAt: null,
      // Classic-mode (shared budget) fields — unused in sudoku mode.
      budgetTotal: isSudoku ? null : diffCfg.budget,
      budgetUsed: 0,
      // Sudoku-mode (Expert) fields — unused in classic mode.
      phase: isSudoku ? 'guessing' : null,
      rowGuessesUsed: isSudoku ? Array(size).fill(0) : null,
      rowLocked: isSudoku ? Array(size).fill(false) : null,
      rowExtraGuesses: isSudoku ? Array(size).fill(0) : null,
      confirmed: isSudoku ? Array.from({ length: size }, () => Array(size).fill(null)) : null,
      pendingRowReopen: false,
      fillGrid: null,
      draftGrid: null,
      draftMode: false,
      selectedCell: null,
      hintsFreeUsed: 0,
      digitCompleted: null,
      flashDigits: null,
      flashUntil: 0,
    };
    currentGuess = [];
    window.DGAds.newGame();

    // Sudoku mode drops the row-number column entirely (row selection still
    // works via clicking any cell) so all available width goes to the grid.
    document.getElementById('boardGrid').style.gridTemplateColumns = isSudoku
      ? 'repeat(' + size + ', 1fr)'
      : 'auto repeat(' + size + ', 1fr)';
    document.getElementById('shareBox').style.display = 'none';
    closeModal('endGameModal');
    startTimer();
    render();
  }

  function budgetRemaining() {
    return state.budgetTotal - state.budgetUsed;
  }

  // Expert/sudoku-mode helpers ------------------------------------------

  function rowCapFor(r) {
    const extra = (state.rowExtraGuesses && state.rowExtraGuesses[r]) || 0;
    return state.diffCfg.guessesPerRow + extra;
  }

  function allRowsLocked() {
    return state.rowLocked.every(Boolean);
  }

  function firstUnlockedRow() {
    const i = state.rowLocked.findIndex((l) => !l);
    return i === -1 ? state.selectedRow : i;
  }

  function isFullyConfirmed() {
    const size = state.diffCfg.size;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!state.confirmed[r][c]) return false;
      }
    }
    return true;
  }

  function firstEmptyFillCell() {
    const size = state.diffCfg.size;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!state.confirmed[r][c] && !state.fillGrid[r][c]) return { r, c };
      }
    }
    return null;
  }

  function countFilled() {
    const size = state.diffCfg.size;
    let n = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (state.confirmed[r][c] || state.fillGrid[r][c]) n++;
      }
    }
    return n;
  }

  // True if `val` at (r,c) duplicates another filled cell in the same row,
  // column, or box — a soft assist highlight, not a hard block on input.
  function isConflict(r, c, val) {
    const size = state.diffCfg.size;
    const box = Math.round(Math.sqrt(size));
    const valueAt = (rr, cc) => state.confirmed[rr][cc] || state.fillGrid[rr][cc];
    for (let cc = 0; cc < size; cc++) if (cc !== c && valueAt(r, cc) === val) return true;
    for (let rr = 0; rr < size; rr++) if (rr !== r && valueAt(rr, c) === val) return true;
    const br = Math.floor(r / box) * box;
    const bc = Math.floor(c / box) * box;
    for (let i = 0; i < box; i++) {
      for (let j = 0; j < box; j++) {
        const rr = br + i;
        const cc = bc + j;
        if ((rr !== r || cc !== c) && valueAt(rr, cc) === val) return true;
      }
    }
    return false;
  }

  // Runs once every row is locked (solved or guess-capped). The win
  // condition only requires a fully valid Sudoku (see maybeCheckFillWin),
  // not a match against a uniquely-determined solution, so a unique answer
  // was never required for correctness — only offered as a bonus. If the
  // confirmed cells already pin down exactly one completion (or are already
  // complete), the transition is instant; otherwise the player is offered
  // the option to lock in more digits via a rewarded ad before starting, but
  // can always just start solving by hand instead (see onOutOfGuessesEndGame).
  async function runSudokuTransition() {
    const size = state.diffCfg.size;
    const solutionCount = window.DGGame.countSudokuSolutions(state.confirmed, size, 2);
    if (solutionCount !== 1) {
      showOutOfGuessesModal('ambiguous');
      return;
    }
    await enterFillingPhase();
  }

  async function enterFillingPhase() {
    if (isFullyConfirmed()) {
      await endGame(true);
      return;
    }
    const size = state.diffCfg.size;
    state.phase = 'filling';
    state.fillGrid = Array.from({ length: size }, () => Array(size).fill(null));
    state.draftGrid = Array.from({ length: size }, () => Array.from({ length: size }, () => new Set()));
    state.draftMode = false;
    state.hintsFreeUsed = 0;
    state.flashDigits = null;
    state.flashUntil = 0;
    state.selectedCell = firstEmptyFillCell();
    // Any digit that was already fully confirmed during guessing (all 9
    // rows revealed correctly) starts pre-disabled — no flash, since the
    // player already saw those come in one at a time during guessing.
    initDigitCompletionFlags();
    render();
  }

  // One-time pass at fill-in start: marks digits whose 9 correct occurrences
  // are already all present in `confirmed` (from the guessing phase), so
  // their pad buttons start disabled without a "just completed" flash.
  function initDigitCompletionFlags() {
    const size = state.diffCfg.size;
    state.digitCompleted = Array(size + 1).fill(false);
    for (let d = 1; d <= size; d++) {
      let count = 0;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (state.confirmed[r][c] === d) count++;
        }
      }
      if (count === size) state.digitCompleted[d] = true;
    }
  }

  // Live check run after every fill/hint action during the fill-in phase:
  // any digit that JUST reached all 9 correct occurrences gets flashed and
  // its pad button permanently disabled.
  function checkDigitCompletionLive() {
    const size = state.diffCfg.size;
    const newlyCompleted = [];
    for (let d = 1; d <= size; d++) {
      if (state.digitCompleted[d]) continue;
      let count = 0;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const val = state.confirmed[r][c] || state.fillGrid[r][c];
          if (val === d && state.secretGrid[r][c] === d) count++;
        }
      }
      if (count === size) {
        state.digitCompleted[d] = true;
        newlyCompleted.push(d);
      }
    }
    if (newlyCompleted.length) triggerDigitCompleteFlash(newlyCompleted);
  }

  // Flags the completed digit(s) for a 2s highlight. Render-driven (checks
  // state.flashUntil on every render) rather than a per-element timeout, so
  // it survives the grid being fully rebuilt on each render() call.
  function triggerDigitCompleteFlash(digits) {
    state.flashDigits = digits;
    state.flashUntil = Date.now() + 2000;
    window.DGHaptics.notificationSuccess();
    render();
    setTimeout(() => {
      if (state.flashUntil && Date.now() >= state.flashUntil) {
        state.flashDigits = null;
        render();
      }
    }, 2000);
  }

  // A cell is permanently locked once it's a given, or once the player has
  // filled it with the actually-correct digit — matches the erase rule
  // below (correct entries can't be erased, so they can't be overwritten
  // either, otherwise "can't erase" would be trivially bypassable).
  function isCellLocked(r, c) {
    if (state.confirmed[r][c]) return true;
    const val = state.fillGrid[r][c];
    return !!(val && val === state.secretGrid[r][c]);
  }

  function selectCell(r, c) {
    if (isCellLocked(r, c)) return;
    state.selectedCell = { r, c };
    render();
  }

  function onFillDigitTap(d) {
    const sel = state.selectedCell;
    if (!sel || isCellLocked(sel.r, sel.c)) return;
    state.fillGrid[sel.r][sel.c] = d;
    state.draftGrid[sel.r][sel.c].clear();
    window.DGHaptics.impactLight();
    // Stays selected on the cell just filled (no auto-advance) — the player
    // moves on by tapping the next cell themselves.
    maybeCheckFillWin();
  }

  // Draft (pencil-mark) mode: toggles a digit in/out of the selected cell's
  // draft set instead of setting a final answer. Requires the cell to not
  // already hold a final digit — erase it first to go back to drafting.
  function onDraftDigitTap(d) {
    const sel = state.selectedCell;
    if (!sel || isCellLocked(sel.r, sel.c)) return;
    if (state.fillGrid[sel.r][sel.c]) return;
    const set = state.draftGrid[sel.r][sel.c];
    if (set.has(d)) set.delete(d);
    else set.add(d);
    render();
  }

  function onToggleDraftMode() {
    state.draftMode = !state.draftMode;
    render();
  }

  // Erase clears whatever's in the selected cell — but only if it's
  // actually erasable: givens and correctly-filled cells are locked, so
  // only a wrong final digit or draft marks can be cleared.
  function canEraseSelectedCell() {
    const sel = state.selectedCell;
    if (!sel) return false;
    if (state.confirmed[sel.r][sel.c]) return false;
    const val = state.fillGrid[sel.r][sel.c];
    if (val) return val !== state.secretGrid[sel.r][sel.c];
    return state.draftGrid[sel.r][sel.c].size > 0;
  }

  function onEraseCell() {
    if (!canEraseSelectedCell()) return;
    const sel = state.selectedCell;
    state.fillGrid[sel.r][sel.c] = null;
    state.draftGrid[sel.r][sel.c].clear();
    render();
  }

  function hasEmptyFillCells() {
    return firstEmptyFillCell() !== null;
  }

  function hintButtonLabel() {
    return state.hintsFreeUsed < 1 ? '💡 Hint' : '💡 Hint (Ad)';
  }

  // First hint per game is free; every one after that costs a fresh ad view
  // (not capped like the guessing-phase rewarded ad — see showRewardedUncapped).
  async function onHintClick() {
    if (!hasEmptyFillCells()) return;
    if (state.hintsFreeUsed < 1) {
      state.hintsFreeUsed++;
      revealRandomHintCell();
      return;
    }
    const watched = await window.DGAds.showRewardedUncapped('Watch a short video to reveal a random cell?');
    if (watched) revealRandomHintCell();
    else render();
  }

  function revealRandomHintCell() {
    const size = state.diffCfg.size;
    const empties = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!state.confirmed[r][c] && !state.fillGrid[r][c]) empties.push({ r, c });
      }
    }
    if (!empties.length) {
      render();
      return;
    }
    const pick = empties[Math.floor(Math.random() * empties.length)];
    state.fillGrid[pick.r][pick.c] = state.secretGrid[pick.r][pick.c];
    state.draftGrid[pick.r][pick.c].clear();
    state.selectedCell = pick;
    window.DGHaptics.impactMedium();
    maybeCheckFillWin();
  }

  // Fires the win check once the grid has no empty cells left; async
  // (endGame awaits stats/rendering) but sets state.over synchronously
  // before its first await, so the render() call right after is safe.
  async function maybeCheckFillWin() {
    checkDigitCompletionLive();
    const size = state.diffCfg.size;
    const full = [];
    for (let r = 0; r < size; r++) {
      const row = [];
      for (let c = 0; c < size; c++) {
        const v = state.confirmed[r][c] || state.fillGrid[r][c];
        if (!v) {
          render();
          return;
        }
        row.push(v);
      }
      full.push(row);
    }
    if (window.DGGame.isValidCompleteSudoku(full, size)) {
      await endGame(true);
    }
    render();
  }

  function updateStatusBar() {
    const diffCfg = state.diffCfg;
    const label = document.getElementById('budgetLabel');
    const text = document.getElementById('budgetText');
    const fill = document.getElementById('budgetFill');

    if (diffCfg.mode === 'sudoku') {
      if (state.phase === 'filling') {
        label.textContent = 'Progress:';
        const total = diffCfg.size * diffCfg.size;
        const filled = countFilled();
        text.textContent = filled + ' / ' + total;
        fill.style.width = (filled / total) * 100 + '%';
        fill.style.background = 'var(--accent)';
        return;
      }
      label.textContent = 'Row Guesses:';
      const r = state.selectedRow;
      const cap = rowCapFor(r);
      const remaining = cap - state.rowGuessesUsed[r];
      text.textContent = remaining + ' / ' + cap;
      const pct = Math.max(0, (remaining / cap) * 100);
      fill.style.width = pct + '%';
      fill.style.background = pct < 25 ? 'var(--danger)' : pct < 50 ? 'var(--yellow)' : 'var(--accent)';
      return;
    }

    label.textContent = 'Guesses:';
    text.textContent = budgetRemaining() + ' / ' + state.budgetTotal;
    const pct = Math.max(0, (budgetRemaining() / state.budgetTotal) * 100);
    fill.style.width = pct + '%';
    fill.style.background = pct < 25 ? 'var(--danger)' : pct < 50 ? 'var(--yellow)' : 'var(--accent)';
  }

  function allSolved() {
    return state.rowSolved.every(Boolean);
  }

  function firstUnsolvedRow() {
    const i = state.rowSolved.findIndex((s) => !s);
    return i === -1 ? state.selectedRow : i;
  }

  function formatDuration(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function startTimer() {
    stopTimer();
    updateTimerDisplay();
    timerHandle = setInterval(updateTimerDisplay, 500);
  }

  function stopTimer() {
    if (timerHandle) clearInterval(timerHandle);
    timerHandle = null;
  }

  function updateTimerDisplay() {
    const el = document.getElementById('timerText');
    if (!el || !state) return;
    const end = state.over ? state.endedAt || Date.now() : Date.now();
    el.textContent = formatDuration(end - state.startedAt);
  }

  async function endGame(won) {
    state.over = true;
    state.won = won;
    state.endedAt = Date.now();
    stopTimer();
    updateTimerDisplay();

    if (won) {
      window.DGSound.playWin();
      window.DGHaptics.notificationSuccess();
    } else {
      window.DGSound.playLose();
      window.DGHaptics.notificationError();
    }

    const lifetime = await window.DGStats.recordResult(won, state.diffKey);

    // End-of-game placement: the win/lose sound and stats are already
    // committed above, so the result itself is never delayed by an ad —
    // this is a natural pause before the result screen appears, roughly
    // every other game (see js/ads.js). Shares its cadence with
    // startNewGame()'s "before new game" placement via the same boundary,
    // so a given game gap gets at most one of the two, not both.
    window.DGAds.registerGameBoundary();
    await window.DGAds.tryShowBoundaryInterstitial(adsRemoved);

    showEndGameModal(lifetime);
  }

  function sumRowGuesses() {
    return state.rowGuessesUsed.reduce((a, b) => a + b, 0);
  }

  function showEndGameModal(lifetime) {
    document.getElementById('endGameTitle').textContent = state.won ? 'Solved!' : 'Not Solved';
    const grid = document.getElementById('endGameStats');
    grid.innerHTML = '';
    const guessesStat =
      state.diffCfg.mode === 'sudoku'
        ? [sumRowGuesses() + ' (row guesses)', 'Guesses Used']
        : [state.budgetUsed + ' / ' + state.budgetTotal, 'Guesses Used'];
    const items = [
      [state.won ? 'Won' : 'Lost', 'Result'],
      guessesStat,
      [formatDuration(state.endedAt - state.startedAt), 'Time'],
      [window.DGStats.winPercent(lifetime.overall) + '%', 'Win % (lifetime)'],
      [lifetime.overall.currentStreak, 'Current Streak'],
      [lifetime.overall.bestStreak, 'Best Streak'],
    ];
    items.forEach(([val, lbl]) => {
      const el = document.createElement('div');
      el.className = 'stat-item';
      el.innerHTML = '<div class="val">' + val + '</div><div class="lbl">' + lbl + '</div>';
      grid.appendChild(el);
    });

    const breakdown = document.getElementById('rowBreakdown');
    breakdown.innerHTML = '<div style="text-transform:uppercase;font-size:0.7rem;letter-spacing:0.05em;margin-bottom:6px;">Per-row guesses</div>';
    state.rowHistory.forEach((hist, i) => {
      const row = document.createElement('div');
      row.className = 'row-breakdown-item';
      row.innerHTML = '<span>Row ' + (i + 1) + (state.rowSolved[i] ? ' ✓' : '') + '</span><span>' + hist.length + '</span>';
      breakdown.appendChild(row);
    });

    document.getElementById('shareBox').style.display = 'none';

    openModal('endGameModal');
  }

  // Shown instead of an immediate loss the moment the guess budget hits zero
  // (reason 'budget' — classic mode, a real loss if declined), or when
  // Expert's per-row guessing phase finishes without pinning down a unique
  // Sudoku solution (reason 'ambiguous'). The ambiguous case is NOT a dead
  // end: any fully valid Sudoku completion wins (see maybeCheckFillWin), so
  // uniqueness is only a bonus, not a requirement — declining just means
  // starting the hand-fill with a bit more of the grid still unknown.
  let oogReason = 'budget';

  function showOutOfGuessesModal(reason) {
    oogReason = reason || 'budget';
    const title = document.getElementById('oogTitle');
    const addBtn = document.getElementById('oogAddGuessesBtn');
    const endBtn = document.getElementById('oogEndGameBtn');
    const msg = document.getElementById('oogMessage');
    const ambiguous = oogReason === 'ambiguous';

    title.textContent = ambiguous ? 'Lock In More Digits?' : 'You Are Out Of Guesses';
    endBtn.textContent = ambiguous ? 'Solve By Hand' : 'End Game';

    if (window.DGAds.canOfferRewarded()) {
      const grant = cfg.ads.rewardedGuessGrant;
      addBtn.style.display = 'inline-block';
      if (ambiguous) {
        addBtn.textContent = '▶ Bonus Guess (Ad)';
        msg.textContent = "The grid isn't fully pinned down by deduction yet. Watch a short ad for one bonus guess — you'll pick which row to spend it on — or just start solving now, any valid completion wins.";
      } else {
        addBtn.textContent = '▶ Add ' + grant + ' Guesses (Ad)';
        msg.textContent = 'You are out of guesses. Watch a short ad for +' + grant + ' more, or end the game now.';
      }
    } else {
      addBtn.style.display = 'none';
      msg.textContent = ambiguous
        ? "The grid isn't fully pinned down by deduction yet, but any valid completion wins — go ahead and start solving."
        : 'You are out of guesses.';
    }
    openModal('outOfGuessesModal');
  }

  async function onOutOfGuessesAddGuesses() {
    const result = await window.DGAds.showRewarded();
    if (!result.granted) {
      // Ad wasn't watched / no longer available — stay on the popup so the
      // player can still choose to proceed.
      showOutOfGuessesModal(oogReason);
      return;
    }
    if (oogReason === 'ambiguous') {
      // Grants exactly one guess, spent on whichever locked row the player
      // taps next (see selectRow) — not a blanket reopen of every row.
      state.pendingRowReopen = true;
      closeModal('outOfGuessesModal');
      render();
    } else {
      state.budgetTotal += result.guesses;
      closeModal('outOfGuessesModal');
      render();
    }
  }

  async function onOutOfGuessesEndGame() {
    closeModal('outOfGuessesModal');
    if (oogReason === 'ambiguous') {
      // Not a loss — the player just starts the hand-fill with whatever's
      // confirmed so far; the conflict-highlight assist covers the rest.
      await enterFillingPhase();
    } else {
      await endGame(false);
    }
  }

  function selectRow(r) {
    // A pending bonus guess (from watching an ad after the grid came up
    // ambiguous) is spent on whichever locked row the player taps next.
    if (state.pendingRowReopen && state.rowLocked[r] && !state.rowSolved[r]) {
      state.rowExtraGuesses[r] += 1;
      state.rowLocked[r] = false;
      state.pendingRowReopen = false;
    }
    state.selectedRow = r;
    currentGuess = [];
    render();
  }

  async function submitGuess(rowIndex, guessRow) {
    const diffCfg = state.diffCfg;
    if (state.over || state.rowSolved[rowIndex]) return;
    if (guessRow.length !== diffCfg.size) return;

    if (diffCfg.mode === 'sudoku') {
      await submitSudokuGuess(rowIndex, guessRow);
      return;
    }

    if (budgetRemaining() <= 0) return;

    const feedback = window.DGGame.computeFeedback(guessRow, state.secretGrid[rowIndex]);
    state.budgetUsed++;
    state.rowHistory[rowIndex].push({ guess: guessRow, feedback });

    const justSolved = feedback.every((f) => f === 'green');
    if (justSolved) {
      state.rowSolved[rowIndex] = true;
      window.DGSound.playRowSolved();
      window.DGHaptics.impactMedium();
      if (!allSolved()) {
        state.selectedRow = firstUnsolvedRow();
      }
    } else {
      window.DGSound.playGreen();
      window.DGHaptics.impactLight();
    }

    if (allSolved()) {
      await endGame(true);
    } else if (budgetRemaining() <= 0) {
      showOutOfGuessesModal('budget');
    } else if (justSolved) {
      // Safe point to consider an interstitial: input session just ended,
      // nothing is mid-type.
      await window.DGAds.maybeShowInterstitialAfterRow(rowIndex + 1, adsRemoved);
    }
    render();
  }

  // Expert-mode guessing: each row has its own guess cap instead of one
  // shared budget. A row that caps out without solving just locks — it
  // doesn't end the game — but any green digit it revealed along the way
  // stays confirmed for the eventual Sudoku fill-in.
  async function submitSudokuGuess(rowIndex, guessRow) {
    if (state.rowLocked[rowIndex]) return;

    const feedback = window.DGGame.computeFeedback(guessRow, state.secretGrid[rowIndex]);
    state.rowGuessesUsed[rowIndex]++;
    state.rowHistory[rowIndex].push({ guess: guessRow, feedback });
    feedback.forEach((f, c) => {
      if (f === 'green') state.confirmed[rowIndex][c] = guessRow[c];
    });

    const justSolved = feedback.every((f) => f === 'green');
    if (justSolved) {
      state.rowSolved[rowIndex] = true;
      state.rowLocked[rowIndex] = true;
      window.DGSound.playRowSolved();
      window.DGHaptics.impactMedium();
    } else {
      window.DGSound.playGreen();
      window.DGHaptics.impactLight();
      if (state.rowGuessesUsed[rowIndex] >= rowCapFor(rowIndex)) {
        state.rowLocked[rowIndex] = true;
      }
    }

    if (state.rowLocked[rowIndex] && !allRowsLocked()) {
      state.selectedRow = firstUnlockedRow();
    }

    if (allRowsLocked()) {
      await runSudokuTransition();
    } else if (justSolved) {
      await window.DGAds.maybeShowInterstitialAfterRow(rowIndex + 1, adsRemoved);
    }
    render();
  }

  function onDigitTap(d) {
    const diffCfg = state.diffCfg;
    if (currentGuess.length >= diffCfg.size) return;
    currentGuess.push(d);
    render();
  }

  function onErase() {
    currentGuess = [];
    render();
  }

  function onBackspace() {
    currentGuess.pop();
    render();
  }

  function onSubmitCurrentGuess(rowIndex) {
    const diffCfg = state.diffCfg;
    if (currentGuess.length !== diffCfg.size) return;
    const guess = currentGuess.slice();
    currentGuess = [];
    submitGuess(rowIndex, guess);
  }

  function buildShareText() {
    const diffCfg = state.diffCfg;
    const lines = [];
    lines.push('Sudoku Sleuth — ' + diffCfg.label + ' (' + diffCfg.size + '×' + diffCfg.size + ')');
    if (state.won) {
      lines.push(
        diffCfg.mode === 'sudoku'
          ? 'Solved (' + sumRowGuesses() + ' row guesses)'
          : 'Solved in ' + state.budgetUsed + '/' + state.budgetTotal + ' guesses'
      );
    } else {
      lines.push('Not solved');
    }
    state.rowHistory.forEach((hist, i) => {
      const last = hist[hist.length - 1];
      const squares = last
        ? last.feedback.map((f) => (f === 'green' ? '🟩' : f === 'yellow' ? '🟨' : '⬜')).join('')
        : '⬜'.repeat(diffCfg.size);
      lines.push('Row ' + (i + 1) + ': ' + squares + '  (' + hist.length + ' guess' + (hist.length === 1 ? '' : 'es') + ')');
    });
    return lines.join('\n');
  }

  function onShareClick() {
    const box = document.getElementById('shareBox');
    box.textContent = buildShareText();
    box.style.display = 'block';
    if (navigator.clipboard) {
      navigator.clipboard.writeText(box.textContent).catch(() => {});
    }
  }

  async function openLifetimeStats() {
    const stats = await window.DGStats.load();
    const grid = document.getElementById('lifetimeStats');
    grid.innerHTML = '';
    const overall = stats.overall;
    const items = [
      [overall.gamesPlayed, 'Games Played'],
      [window.DGStats.winPercent(overall) + '%', 'Win %'],
      [overall.currentStreak, 'Current Streak'],
      [overall.bestStreak, 'Best Streak'],
    ];
    items.forEach(([val, lbl]) => {
      const el = document.createElement('div');
      el.className = 'stat-item';
      el.innerHTML = '<div class="val">' + val + '</div><div class="lbl">' + lbl + '</div>';
      grid.appendChild(el);
    });

    const byDiff = document.getElementById('lifetimeStatsByDiff');
    byDiff.innerHTML = '';
    window.DGStats.DIFF_KEYS.forEach((key) => {
      const bucket = stats.byDifficulty[key];
      const label = (cfg.difficulties[key] && cfg.difficulties[key].label) || key;
      const block = document.createElement('div');
      block.className = 'diff-stats-block';
      block.innerHTML =
        '<div class="diff-stats-label">' + label + '</div>' +
        '<div class="diff-stats-row">' +
        '<span>Games <strong>' + bucket.gamesPlayed + '</strong></span>' +
        '<span>Win % <strong>' + window.DGStats.winPercent(bucket) + '%</strong></span>' +
        '<span>Streak <strong>' + bucket.currentStreak + '</strong></span>' +
        '<span>Best <strong>' + bucket.bestStreak + '</strong></span>' +
        '</div>';
      byDiff.appendChild(block);
    });

    openModal('statsModal');
  }

  function updateSoundBtn() {
    document.getElementById('soundToggleBtn').textContent = window.DGSound.isMuted() ? 'Off' : 'On';
  }

  async function onToggleSound() {
    await window.DGSound.setMuted(!window.DGSound.isMuted());
    updateSoundBtn();
  }

  function updateColorblindBtn() {
    document.getElementById('colorblindToggleBtn').textContent = window.DGColorblind.isEnabled() ? 'On' : 'Off';
  }

  async function onToggleColorblind() {
    await window.DGColorblind.setEnabled(!window.DGColorblind.isEnabled());
    updateColorblindBtn();
  }

  async function onOpenSettings() {
    openModal('settingsModal');
    const required = await window.DGAds.privacyOptionsRequired();
    document.getElementById('privacyOptionsRow').style.display = required ? 'flex' : 'none';
  }

  function updateRemoveAdsBtn() {
    const btn = document.getElementById('removeAdsBtn');
    if (adsRemoved) {
      btn.textContent = 'Ads Removed ✓';
      btn.disabled = true;
    } else {
      btn.textContent = 'Remove Ads';
      btn.disabled = false;
    }
  }

  async function onRemoveAds() {
    const ok = await window.DGIap.purchaseRemoveAds();
    if (ok) {
      adsRemoved = true;
      updateRemoveAdsBtn();
    }
  }

  function updateThemeBtn() {
    const isDark = window.DGTheme.get() === 'dark';
    document.getElementById('themeToggleBtn').textContent = isDark ? '🌙 Dark' : '☀️ Light';
  }

  async function onToggleTheme() {
    await window.DGTheme.toggle();
    updateThemeBtn();
  }

  function render() {
    updateScreenModeClasses();
    updateStatusBar();
    renderGrid();
    renderGuessArea();
    updateBoardSize();
  }

  // Sudoku mode has no fixed max-width for the board — it's sized in JS to
  // exactly fill whichever dimension (width or height) is tighter, so the
  // grid is as big as it can be while staying square and never overlapping
  // the topbar, the panel below it, or the fixed bottom digit pad.
  function updateBoardSize() {
    const boardGrid = document.getElementById('boardGrid');
    const screenEl = document.getElementById('screenGame');
    if (!state || state.diffCfg.mode !== 'sudoku') {
      boardGrid.style.width = '';
      boardGrid.style.height = '';
      screenEl.style.paddingBottom = '';
      return;
    }
    const boardWrap = document.getElementById('boardWrap');
    const panel = document.getElementById('activePanel');
    const padBar = document.getElementById('digitPadBar');
    const padBarVisible = padBar.classList.contains('visible');

    // screenGame reserves bottom padding so normal content never renders
    // under the fixed pad. The pad is fixed to the *viewport* bottom, but
    // screenGame's own box stops short of the viewport (body has its own
    // bottom padding below it) — so the right reservation is "how much of
    // screenGame's own box overlaps the pad", not the pad's full height.
    const screenBottom = screenEl.getBoundingClientRect().bottom;
    const bottomLimit = padBarVisible ? padBar.getBoundingClientRect().top : screenBottom;
    screenEl.style.paddingBottom = Math.max(0, screenBottom - bottomLimit) + 'px';

    const topLimit = boardWrap.getBoundingClientRect().top;
    const panelHeight = panel.style.display === 'none' ? 0 : panel.offsetHeight;

    const availableWidth = boardWrap.clientWidth;
    const availableHeight = bottomLimit - topLimit - panelHeight - 16;

    const size = Math.max(150, Math.floor(Math.min(availableWidth, availableHeight)));
    boardGrid.style.width = size + 'px';
    boardGrid.style.height = size + 'px';
  }

  // Expert's guessing phase is compact (grid + guess line + digit pad all
  // share the screen); the fill-in phase drops the guess line entirely
  // (digits go straight onto the grid), so it gets a bigger, roomier grid.
  function updateScreenModeClasses() {
    const screenEl = document.getElementById('screenGame');
    const isSudoku = state.diffCfg.mode === 'sudoku';
    screenEl.classList.toggle('sudoku-mode', isSudoku);
    screenEl.classList.toggle('filling', isSudoku && state.phase === 'filling');
  }

  function renderGuessArea() {
    renderActivePanel();
    renderDigitPad();
  }

  // Digit pad is docked to the bottom of the screen (outside #activePanel)
  // so it stays fixed and always spans one full row regardless of pool size.
  function renderDigitPad() {
    const bar = document.getElementById('digitPadBar');
    const diffCfg = state.diffCfg;

    if (state.over) {
      bar.classList.remove('visible');
      bar.innerHTML = '';
      return;
    }

    if (diffCfg.mode === 'sudoku' && state.phase === 'filling') {
      bar.classList.add('visible');
      bar.innerHTML = '';
      for (let d = 1; d <= diffCfg.size; d++) {
        const btn = document.createElement('button');
        btn.className = 'digit-btn';
        btn.textContent = d;
        btn.disabled = !!(state.digitCompleted && state.digitCompleted[d]);
        btn.addEventListener('click', () => (state.draftMode ? onDraftDigitTap(d) : onFillDigitTap(d)));
        bar.appendChild(btn);
      }
      return;
    }

    const r = state.selectedRow;
    const solved = state.rowSolved[r];
    const locked = diffCfg.mode === 'sudoku' && state.rowLocked[r] && !solved;

    if (solved || locked) {
      bar.classList.remove('visible');
      bar.innerHTML = '';
      return;
    }

    bar.classList.add('visible');
    bar.innerHTML = '';
    const full = currentGuess.length >= diffCfg.size;
    for (let d = 1; d <= diffCfg.pool; d++) {
      const btn = document.createElement('button');
      btn.className = 'digit-btn';
      btn.textContent = d;
      btn.disabled = full;
      btn.addEventListener('click', () => onDigitTap(d));
      bar.appendChild(btn);
    }
    const backBtn = document.createElement('button');
    backBtn.className = 'digit-btn backspace';
    backBtn.textContent = '⌫';
    backBtn.disabled = currentGuess.length === 0;
    backBtn.addEventListener('click', onBackspace);
    bar.appendChild(backBtn);
  }

  function renderGrid() {
    const diffCfg = state.diffCfg;
    const gridEl = document.getElementById('boardGrid');
    gridEl.innerHTML = '';

    const fillMode = diffCfg.mode === 'sudoku' && state.phase === 'filling';
    const box = diffCfg.mode === 'sudoku' ? Math.round(Math.sqrt(diffCfg.size)) : null;

    for (let r = 0; r < diffCfg.size; r++) {
      // Sudoku mode has no row-number column at all (row selection still
      // works by clicking any cell in the row) — every bit of width goes
      // to the grid itself.
      if (diffCfg.mode !== 'sudoku') {
        const head = document.createElement('div');
        const isSelected = r === state.selectedRow;
        const solved = state.rowSolved[r];
        const revealedLoss = state.over && !state.won && !solved;
        const hist = state.rowHistory[r];
        head.className =
          'row-head' + (isSelected ? ' selected' : '') + (solved ? ' solved' : '') + (revealedLoss ? ' revealed' : '');
        head.innerHTML = '<span class="num">' + (r + 1) + '</span><span>' + (solved ? '✓' : hist.length) + '</span>';
        head.addEventListener('click', () => selectRow(r));
        gridEl.appendChild(head);
      }

      for (let c = 0; c < diffCfg.size; c++) {
        const cell = document.createElement('div');
        let cls = 'grid-cell';
        let content = '';

        if (fillMode) {
          const given = state.confirmed[r][c];
          const finalVal = state.fillGrid[r][c];
          const draftSet = state.draftGrid[r][c];
          const correctLocked = !given && finalVal && finalVal === state.secretGrid[r][c];
          const val = given || finalVal;

          if (given) {
            cls += ' given';
            content = given;
          } else if (finalVal) {
            cls += correctLocked ? ' filled locked-correct' : ' filled';
            if (!correctLocked && isConflict(r, c, finalVal)) cls += ' conflict';
            content = finalVal;
          } else if (draftSet && draftSet.size) {
            cls += ' draft';
            content = null;
          } else {
            cls += ' empty';
            content = '·';
          }

          if (
            state.flashDigits &&
            state.flashUntil &&
            Date.now() < state.flashUntil &&
            state.flashDigits.includes(state.secretGrid[r][c]) &&
            val === state.secretGrid[r][c]
          ) {
            cls += ' digit-flash';
          }

          if (state.selectedCell && state.selectedCell.r === r && state.selectedCell.c === c) cls += ' selected-row';
          if (!given && !correctLocked) cell.addEventListener('click', () => selectCell(r, c));

          if (content === null) {
            const marks = document.createElement('div');
            marks.className = 'draft-marks';
            for (let d = 1; d <= diffCfg.size; d++) {
              const span = document.createElement('span');
              span.textContent = draftSet.has(d) ? d : '';
              marks.appendChild(span);
            }
            cell.appendChild(marks);
          }
        } else {
          const isSelected = r === state.selectedRow;
          const solved = state.rowSolved[r];
          const locked = diffCfg.mode === 'sudoku' && state.rowLocked[r] && !solved;
          const revealedLoss = state.over && !state.won && !solved;
          const hist = state.rowHistory[r];
          const lastGuess = hist.length ? hist[hist.length - 1] : null;
          // While the player is actively tapping out a new guess for this
          // row, show those digits on the board itself (not just in the
          // guess line below) instead of the previous attempt's feedback.
          const typingHere = isSelected && !solved && !locked && !revealedLoss && !state.over && currentGuess.length > 0;
          if (solved) {
            cls += ' green';
            content = state.secretGrid[r][c];
          } else if (revealedLoss) {
            cls += ' revealed';
            content = state.secretGrid[r][c];
          } else if (typingHere) {
            if (currentGuess[c] !== undefined) {
              cls += ' typing';
              content = currentGuess[c];
            } else {
              cls += ' empty';
              content = '·';
            }
          } else if (diffCfg.mode === 'sudoku') {
            // Only the digits confirmed green across ALL guesses so far for
            // this row stay on the board — yellow/gray only describe the
            // single most-recent guess, so they'd be misleading to keep
            // displayed once a later guess moves on.
            if (state.confirmed[r][c]) {
              cls += ' green';
              content = state.confirmed[r][c];
            } else {
              cls += ' empty';
              content = '·';
            }
          } else if (lastGuess) {
            cls += ' ' + lastGuess.feedback[c];
            content = lastGuess.guess[c];
          } else {
            cls += ' empty';
            content = '·';
          }
          if (isSelected) cls += ' selected-row';
          cell.addEventListener('click', () => selectRow(r));
        }

        if (box) {
          if (c % box === box - 1 && c !== diffCfg.size - 1) cls += ' box-edge-r';
          if (r % box === box - 1 && r !== diffCfg.size - 1) cls += ' box-edge-b';
          // Checkerboard-shade alternating 3x3 blocks so the box grouping
          // reads at a glance, not just from the border lines.
          const blocksPerSide = diffCfg.size / box;
          const blockIndex = Math.floor(r / box) * blocksPerSide + Math.floor(c / box);
          if (blockIndex % 2 === 1) cls += ' block-shade';
        }

        cell.className = cls;
        if (content !== null) cell.textContent = content;
        gridEl.appendChild(cell);
      }
    }
  }

  function renderActivePanel() {
    const diffCfg = state.diffCfg;
    const panel = document.getElementById('activePanel');
    panel.innerHTML = '';
    panel.style.display = '';

    // Once the game has ended the result lives in the end-game modal (opened
    // immediately by endGame()), which covers this panel — so a single
    // generic message here is enough; no need to reconstruct per-row detail.
    if (state.over) {
      const note = document.createElement('div');
      note.className = 'row-note' + (state.won ? ' win' : '');
      note.textContent = state.won ? 'Puzzle solved!' : 'Game over — grid revealed.';
      panel.appendChild(note);
      return;
    }

    // Fill-in phase has no guess-line block: tap a cell on the (now larger)
    // grid to select it, then tap a digit on the bottom pad — it lands
    // directly on the board. Draft/Erase/Hint sit here, above the pad.
    if (diffCfg.mode === 'sudoku' && state.phase === 'filling') {
      renderFillControls(panel);
      return;
    }

    const r = state.selectedRow;
    const solved = state.rowSolved[r];
    const hist = state.rowHistory[r];

    const headRow = document.createElement('div');
    headRow.className = 'active-panel-head';
    headRow.innerHTML = '<span>Row ' + (r + 1) + '</span><span>' + hist.length + ' guess' + (hist.length === 1 ? '' : 'es') + '</span>';
    panel.appendChild(headRow);

    if (hist.length) {
      const history = document.createElement('div');
      history.className = 'history';
      hist.forEach((h) => {
        const gr = document.createElement('div');
        gr.className = 'guess-row';
        h.guess.forEach((d, i) => {
          const c = document.createElement('div');
          c.className = 'cell ' + h.feedback[i];
          c.textContent = d;
          gr.appendChild(c);
        });
        history.appendChild(gr);
      });
      panel.appendChild(history);
    }

    if (solved) {
      const note = document.createElement('div');
      note.className = 'row-note win';
      note.textContent = 'Row solved in ' + hist.length + ' guess' + (hist.length === 1 ? '' : 'es') + '.';
      panel.appendChild(note);
      return;
    }

    if (diffCfg.mode === 'sudoku' && state.rowLocked[r]) {
      const note = document.createElement('div');
      if (state.pendingRowReopen) {
        note.className = 'row-note win';
        note.textContent = 'You have a bonus guess — tap any locked row above to use it here.';
      } else {
        note.className = 'row-note';
        note.textContent =
          'Row locked (' + hist.length + '/' + rowCapFor(r) + ' guesses used). Confirmed digits are kept for the Sudoku solve.';
      }
      panel.appendChild(note);
      return;
    }

    // Current-guess line: N boxes (filled left-to-right as digits are tapped
    // on the fixed bottom pad), with Erase/Guess sitting right next to them.
    const guessLine = document.createElement('div');
    guessLine.className = 'guess-line';

    const display = document.createElement('div');
    display.className = 'guess-display';
    for (let i = 0; i < diffCfg.size; i++) {
      const c = document.createElement('div');
      const d = currentGuess[i];
      c.className = 'cell' + (d === undefined ? ' blank' : '');
      c.textContent = d === undefined ? '?' : d;
      display.appendChild(c);
    }
    guessLine.appendChild(display);

    const eraseBtn = document.createElement('button');
    eraseBtn.className = 'ghost erase';
    eraseBtn.textContent = 'Erase';
    eraseBtn.addEventListener('click', onErase);
    guessLine.appendChild(eraseBtn);

    const guessBtn = document.createElement('button');
    guessBtn.className = 'primary';
    guessBtn.textContent = 'Guess';
    guessBtn.disabled = currentGuess.length !== diffCfg.size;
    guessBtn.addEventListener('click', () => onSubmitCurrentGuess(r));
    guessLine.appendChild(guessBtn);

    panel.appendChild(guessLine);

    const err = document.createElement('div');
    err.className = 'row-error';
    err.id = 'rowError';
    panel.appendChild(err);
  }

  // Fill-in phase's control row: Draft (toggle pencil-mark mode), Erase
  // (clears the selected cell, subject to the lock rules above), and Hint
  // (first one free, every one after costs an ad view).
  function renderFillControls(panel) {
    const row = document.createElement('div');
    row.className = 'fill-controls';

    const draftBtn = document.createElement('button');
    draftBtn.className = 'ghost fill-control-btn' + (state.draftMode ? ' active' : '');
    draftBtn.textContent = '✎ Draft';
    draftBtn.addEventListener('click', onToggleDraftMode);
    row.appendChild(draftBtn);

    const eraseBtn = document.createElement('button');
    eraseBtn.className = 'ghost fill-control-btn erase';
    eraseBtn.textContent = '⌫ Erase';
    eraseBtn.disabled = !canEraseSelectedCell();
    eraseBtn.addEventListener('click', onEraseCell);
    row.appendChild(eraseBtn);

    const hintBtn = document.createElement('button');
    hintBtn.className = 'ghost fill-control-btn';
    hintBtn.textContent = hintButtonLabel();
    hintBtn.disabled = !hasEmptyFillCells();
    hintBtn.addEventListener('click', onHintClick);
    row.appendChild(hintBtn);

    panel.appendChild(row);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
