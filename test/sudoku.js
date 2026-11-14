// Today's sudoku — kept identical to the app (Sudoku.swift): same random numbers (mulberry32),
// same shuffles in the same order, same pairs taken out.
(function (root) {
  const FEWEST = 32;
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
      return (t ^ (t >>> 14)) >>> 0;
    };
  }
  const units = [];
  for (let r = 0; r < 9; r++) units.push([...Array(9)].map((_, i) => r * 9 + i));
  for (let c = 0; c < 9; c++) units.push([...Array(9)].map((_, i) => i * 9 + c));
  for (let b = 0; b < 9; b++) { const r0 = Math.floor(b / 3) * 3, c0 = (b % 3) * 3; units.push([...Array(9)].map((_, i) => (r0 + Math.floor(i / 3)) * 9 + c0 + (i % 3))); }
  const peers = [...Array(81)].map((_, cell) => [...new Set(units.filter((u) => u.includes(cell)).flat())].filter((x) => x !== cell).sort((a, b) => a - b));
  function candidates(g, cell) { const used = new Set(peers[cell].map((p) => g[p])); return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => !used.has(d)); }
  function solvesStepByStep(start) {
    const g = start.slice();
    let progress = true;
    while (progress) {
      progress = false;
      for (let cell = 0; cell < 81; cell++) {
        if (g[cell] !== 0) continue;
        const c = candidates(g, cell);
        if (!c.length) return false;
        if (c.length === 1) { g[cell] = c[0]; progress = true; }
      }
      for (const unit of units) for (let d = 1; d <= 9; d++) {
        if (unit.some((x) => g[x] === d)) continue;
        const spots = unit.filter((x) => g[x] === 0 && candidates(g, x).includes(d));
        if (!spots.length) return false;
        if (spots.length === 1) { g[spots[0]] = d; progress = true; }
      }
    }
    return !g.includes(0);
  }
  function make(day) {
    const next = mulberry32(((day * 69621 + 4241) >>> 0)), int = (k) => next() % k;
    const shuffled = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const digits = shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const bands = shuffled([0, 1, 2]), stacks = shuffled([0, 1, 2]);
    const rows = [], cols = [];
    for (const b of bands) rows.push(...shuffled([0, 1, 2]).map((x) => b * 3 + x));
    for (const s of stacks) cols.push(...shuffled([0, 1, 2]).map((x) => s * 3 + x));
    const solution = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) { const pr = rows[r], pc = cols[c]; solution.push(digits[(3 * (pr % 3) + Math.floor(pr / 3) + pc) % 9]); }
    let grid = solution.slice();
    for (const i of shuffled([...Array(41)].map((_, k) => k))) {
      if (grid.filter((x) => x !== 0).length <= FEWEST) break;
      const trial = grid.slice(); trial[i] = 0; trial[80 - i] = 0;
      if (solvesStepByStep(trial)) grid = trial;
    }
    return { number: day + 1, givens: grid, solution };
  }
  function clashes(g) { const out = new Set(); for (let c = 0; c < 81; c++) if (g[c] && peers[c].some((p) => g[p] === g[c])) out.add(c); return out; }
  root.Sudoku = { make, clashes, candidates, peers };
})(typeof window !== "undefined" ? window : globalThis);
