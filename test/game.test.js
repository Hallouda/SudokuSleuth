// Unit tests for the pure puzzle-generation/scoring logic in www/js/game.js.
// game.js is a plain browser script (attaches itself to `window`, no
// module.exports) and touches nothing but Math.random/window, so it's safe
// to load under Node by aliasing `global.window` to the global object
// itself before requiring it.
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = globalThis;
require('../www/js/game.js');
const DGGame = globalThis.DGGame;

// Deterministic PRNG (mulberry32) so generator tests are reproducible and
// fast instead of depending on Math.random.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('generateGrid produces a size x size grid with no row/column repeats', () => {
  const size = 5;
  const pool = 8;
  const grid = DGGame.generateGrid(size, pool, mulberry32(1));

  assert.equal(grid.length, size);
  for (const row of grid) {
    assert.equal(row.length, size);
    assert.equal(new Set(row).size, size);
    for (const v of row) assert.ok(v >= 1 && v <= pool);
  }
  for (let c = 0; c < size; c++) {
    const col = grid.map((r) => r[c]);
    assert.equal(new Set(col).size, size);
  }
});

test('generateGrid throws when the digit pool is smaller than the grid size', () => {
  assert.throws(() => DGGame.generateGrid(4, 3, mulberry32(2)));
});

test('computeFeedback marks an exact match as all green', () => {
  const secret = [1, 2, 3, 4];
  assert.deepEqual(DGGame.computeFeedback(secret.slice(), secret), ['green', 'green', 'green', 'green']);
});

test('computeFeedback marks completely disjoint digits as all gray', () => {
  const secret = [1, 2, 3, 4];
  const guess = [5, 6, 7, 8];
  assert.deepEqual(DGGame.computeFeedback(guess, secret), ['gray', 'gray', 'gray', 'gray']);
});

test('computeFeedback marks the right digit in the wrong spot as yellow', () => {
  const secret = [1, 2, 3, 4];
  const guess = [4, 3, 2, 1];
  assert.deepEqual(DGGame.computeFeedback(guess, secret), ['yellow', 'yellow', 'yellow', 'yellow']);
});

test('computeFeedback does not double-count a duplicated guess digit against a single secret occurrence', () => {
  // secret has exactly one 2. Guessing 2 twice should only credit one of
  // them (the exact-position match) — standard two-pass Mastermind scoring,
  // not "every occurrence of a present digit counts".
  const secret = [2, 1, 3, 4];
  const guess = [2, 2, 3, 4];
  assert.deepEqual(DGGame.computeFeedback(guess, secret), ['green', 'gray', 'green', 'green']);
});

test('generateSudokuGrid produces a valid complete 9x9 sudoku', () => {
  const size = 9;
  const grid = DGGame.generateSudokuGrid(size, mulberry32(3));
  assert.ok(DGGame.isValidCompleteSudoku(grid, size));
});

test('generateSudokuGrid also works for a non-9 size (4x4, 2x2 boxes)', () => {
  const size = 4;
  const grid = DGGame.generateSudokuGrid(size, mulberry32(4));
  assert.ok(DGGame.isValidCompleteSudoku(grid, size));
});

test('isValidCompleteSudoku accepts a genuinely valid 4x4 grid', () => {
  const grid = [
    [1, 2, 3, 4],
    [3, 4, 1, 2],
    [2, 1, 4, 3],
    [4, 3, 2, 1],
  ];
  assert.ok(DGGame.isValidCompleteSudoku(grid, 4));
});

test('isValidCompleteSudoku rejects a row with a repeated digit', () => {
  const grid = [
    [1, 2, 3, 4],
    [3, 4, 1, 2],
    [2, 1, 4, 3],
    [4, 3, 2, 2],
  ];
  assert.equal(DGGame.isValidCompleteSudoku(grid, 4), false);
});

test('isValidCompleteSudoku rejects a box duplicate even when every row/column is a valid permutation', () => {
  // A valid Latin square that still breaks the 2x2 box constraint: box (0,0)
  // holds 1,2,2,1 — this is exactly the kind of grid row/col checks alone
  // would wrongly accept.
  const grid = [
    [1, 2, 3, 4],
    [2, 1, 4, 3],
    [3, 4, 1, 2],
    [4, 3, 2, 1],
  ];
  assert.equal(DGGame.isValidCompleteSudoku(grid, 4), false);
});

test('countSudokuSolutions returns exactly 1 for a fully specified valid grid', () => {
  const grid = [
    [1, 2, 3, 4],
    [3, 4, 1, 2],
    [2, 1, 4, 3],
    [4, 3, 2, 1],
  ];
  assert.equal(DGGame.countSudokuSolutions(grid, 4, 5), 1);
});

test('countSudokuSolutions hits the search limit (ambiguous) for a fully empty grid', () => {
  const empty = Array.from({ length: 4 }, () => Array(4).fill(null));
  assert.equal(DGGame.countSudokuSolutions(empty, 4, 2), 2);
});
