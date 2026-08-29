// Mode-agnostic puzzle core. Both single-player and (future) multiplayer
// reuse generateGrid()/computeFeedback() unchanged — only guess budgeting
// and state sync differ between modes.
window.DGGame = (function () {
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Backtracking generator: fills an N x N grid with digits 1..pool such that
  // no row or column repeats a digit. pool > size guarantees room to place freely.
  function generateGrid(size, pool, rng) {
    const random = rng || Math.random;
    const grid = Array.from({ length: size }, () => Array(size).fill(null));
    const digits = Array.from({ length: pool }, (_, i) => i + 1);

    function shuffleWith(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    function validAt(r, c, d) {
      for (let cc = 0; cc < c; cc++) if (grid[r][cc] === d) return false;
      for (let rr = 0; rr < r; rr++) if (grid[rr][c] === d) return false;
      return true;
    }

    function backtrack(r, c) {
      if (r === size) return true;
      const nr = c + 1 === size ? r + 1 : r;
      const nc = (c + 1) % size;
      for (const d of shuffleWith(digits)) {
        if (validAt(r, c, d)) {
          grid[r][c] = d;
          if (backtrack(nr, nc)) return true;
          grid[r][c] = null;
        }
      }
      return false;
    }

    const ok = backtrack(0, 0);
    if (!ok) throw new Error('Failed to generate grid (pool too small for size)');
    return grid;
  }

  // Two-pass Mastermind-style feedback for a single row guess.
  function computeFeedback(guessRow, secretRow) {
    const size = guessRow.length;
    const result = Array(size).fill('gray');
    const used = Array(size).fill(false);
    for (let i = 0; i < size; i++) {
      if (guessRow[i] === secretRow[i]) {
        result[i] = 'green';
        used[i] = true;
      }
    }
    for (let i = 0; i < size; i++) {
      if (result[i] === 'green') continue;
      for (let j = 0; j < size; j++) {
        if (!used[j] && secretRow[j] === guessRow[i]) {
          result[i] = 'yellow';
          used[j] = true;
          break;
        }
      }
    }
    return result;
  }

  // Backtracking generator for a real Sudoku: same row/col uniqueness as
  // generateGrid(), plus the sqrt(size) x sqrt(size) box constraint. Used by
  // the Expert difficulty (size 9). Randomized digit order finds a full valid
  // grid quickly in practice, same technique as generateGrid().
  function generateSudokuGrid(size, rng) {
    const random = rng || Math.random;
    const box = Math.round(Math.sqrt(size));
    const grid = Array.from({ length: size }, () => Array(size).fill(null));
    const digits = Array.from({ length: size }, (_, i) => i + 1);

    function shuffleWith(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    function validAt(r, c, d) {
      for (let cc = 0; cc < size; cc++) if (grid[r][cc] === d) return false;
      for (let rr = 0; rr < size; rr++) if (grid[rr][c] === d) return false;
      const br = Math.floor(r / box) * box;
      const bc = Math.floor(c / box) * box;
      for (let i = 0; i < box; i++) {
        for (let j = 0; j < box; j++) {
          if (grid[br + i][bc + j] === d) return false;
        }
      }
      return true;
    }

    function backtrack(r, c) {
      if (r === size) return true;
      const nr = c + 1 === size ? r + 1 : r;
      const nc = (c + 1) % size;
      for (const d of shuffleWith(digits)) {
        if (validAt(r, c, d)) {
          grid[r][c] = d;
          if (backtrack(nr, nc)) return true;
          grid[r][c] = null;
        }
      }
      return false;
    }

    const ok = backtrack(0, 0);
    if (!ok) throw new Error('Failed to generate sudoku grid');
    return grid;
  }

  // Counts how many valid Sudoku completions exist for a partially-filled
  // grid (`givens`: size x size array, null for unknown cells), stopping as
  // soon as `limit` distinct solutions are found. Used to check whether the
  // cells confirmed during the guessing phase are enough to hand the player
  // off to a logic-only Sudoku fill-in (unique solution) or not (ambiguous).
  // Uses a minimum-remaining-values heuristic so it stays fast even when
  // few cells are given.
  function countSudokuSolutions(givens, size, limit) {
    const box = Math.round(Math.sqrt(size));
    const grid = givens.map((row) => row.slice());
    let count = 0;

    function candidates(r, c) {
      const used = new Set();
      for (let i = 0; i < size; i++) {
        if (grid[r][i]) used.add(grid[r][i]);
        if (grid[i][c]) used.add(grid[i][c]);
      }
      const br = Math.floor(r / box) * box;
      const bc = Math.floor(c / box) * box;
      for (let i = 0; i < box; i++) {
        for (let j = 0; j < box; j++) {
          const v = grid[br + i][bc + j];
          if (v) used.add(v);
        }
      }
      const out = [];
      for (let d = 1; d <= size; d++) if (!used.has(d)) out.push(d);
      return out;
    }

    // Finds the empty cell with the fewest legal candidates (prunes dead
    // ends early); returns null when the grid is completely filled.
    function findMRVCell() {
      let best = null;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (grid[r][c]) continue;
          const cands = candidates(r, c);
          if (cands.length === 0) return { r, c, cands };
          if (!best || cands.length < best.cands.length) best = { r, c, cands };
        }
      }
      return best;
    }

    function backtrack() {
      if (count >= limit) return;
      const cell = findMRVCell();
      if (!cell) {
        count++;
        return;
      }
      if (cell.cands.length === 0) return;
      for (const d of cell.cands) {
        grid[cell.r][cell.c] = d;
        backtrack();
        grid[cell.r][cell.c] = null;
        if (count >= limit) return;
      }
    }

    backtrack();
    return count;
  }

  // True if every row, column, and box of a completely-filled grid is a
  // permutation of 1..size — i.e. a valid, complete Sudoku.
  function isValidCompleteSudoku(grid, size) {
    const box = Math.round(Math.sqrt(size));
    const isPermutation = (arr) => {
      if (arr.some((v) => !v || v < 1 || v > size)) return false;
      return new Set(arr).size === size;
    };
    for (let r = 0; r < size; r++) if (!isPermutation(grid[r])) return false;
    for (let c = 0; c < size; c++) {
      const col = [];
      for (let r = 0; r < size; r++) col.push(grid[r][c]);
      if (!isPermutation(col)) return false;
    }
    for (let br = 0; br < size; br += box) {
      for (let bc = 0; bc < size; bc += box) {
        const cell = [];
        for (let i = 0; i < box; i++) for (let j = 0; j < box; j++) cell.push(grid[br + i][bc + j]);
        if (!isPermutation(cell)) return false;
      }
    }
    return true;
  }

  return {
    shuffle,
    generateGrid,
    computeFeedback,
    generateSudokuGrid,
    countSudokuSolutions,
    isValidCompleteSudoku,
  };
})();
