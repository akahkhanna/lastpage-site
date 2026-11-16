// Today's mini sudoku (6×6, boxes of 2 rows by 3 columns) — kept identical to the app
// (Sudoku.swift): same random numbers (mulberry32), same shuffles in the same order, same pairs taken out.
(function (root) {
  const N = 6, BR = 2, BC = 3, CELLS = N * N, FEWEST = 12;
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
      return (t ^ (t >>> 14)) >>> 0;
    };
  }
  const range = (k) => [...Array(k)].map((_, i) => i);
  const units = [];
  for (let r = 0; r < N; r++) units.push(range(N).map((i) => r * N + i));
  for (let c = 0; c < N; c++) units.push(range(N).map((i) => i * N + c));
  for (let b = 0; b < N; b++) {
    const r0 = Math.floor(b / (N / BC)) * BR, c0 = (b % (N / BC)) * BC;
    units.push(range(N).map((i) => (r0 + Math.floor(i / BC)) * N + c0 + (i % BC)));
  }
  const peers = range(CELLS).map((cell) => [...new Set(units.filter((u) => u.includes(cell)).flat())].filter((x) => x !== cell).sort((a, b) => a - b));
  const digitsAll = range(N).map((i) => i + 1);
  function candidates(g, cell) { const used = new Set(peers[cell].map((p) => g[p])); return digitsAll.filter((d) => !used.has(d)); }
  function solvesStepByStep(start) {
    const g = start.slice();
    let progress = true;
    while (progress) {
      progress = false;
      for (let cell = 0; cell < CELLS; cell++) {
        if (g[cell] !== 0) continue;
        const c = candidates(g, cell);
        if (!c.length) return false;
        if (c.length === 1) { g[cell] = c[0]; progress = true; }
      }
      for (const unit of units) for (let d = 1; d <= N; d++) {
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
    const digits = shuffled(digitsAll);
    const bands = shuffled(range(N / BR)), stacks = shuffled(range(N / BC));
    const rows = [], cols = [];
    for (const b of bands) rows.push(...shuffled(range(BR)).map((x) => b * BR + x));
    for (const s of stacks) cols.push(...shuffled(range(BC)).map((x) => s * BC + x));
    const solution = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const pr = rows[r], pc = cols[c]; solution.push(digits[(BC * (pr % BR) + Math.floor(pr / BR) + pc) % N]); }
    let grid = solution.slice();
    for (const i of shuffled(range(CELLS / 2))) {
      if (grid.filter((x) => x !== 0).length <= FEWEST) break;
      const trial = grid.slice(); trial[i] = 0; trial[CELLS - 1 - i] = 0;
      if (solvesStepByStep(trial)) grid = trial;
    }
    return { number: day + 1, givens: grid, solution };
  }
  function clashes(g) { const out = new Set(); for (let c = 0; c < CELLS; c++) if (g[c] && peers[c].some((p) => g[p] === g[c])) out.add(c); return out; }
  root.Sudoku = { make, clashes, candidates, peers, N, BR, BC, CELLS };
})(typeof window !== "undefined" ? window : globalThis);
