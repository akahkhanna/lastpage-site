// Today's dot to dot — kept identical to the app (DotToDot.swift): same random numbers
// (mulberry32 from rules.js order), same path-building steps, same dot placement.
(function (root) {
  const SIZE = 6, DOTS = 8;
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
      return (t ^ (t >>> 14)) >>> 0;
    };
  }
  function neighbours(cell) {
    const r = Math.floor(cell / SIZE), c = cell % SIZE, out = [];
    if (r > 0) out.push(cell - SIZE);
    if (c < SIZE - 1) out.push(cell + 1);
    if (r < SIZE - 1) out.push(cell + SIZE);
    if (c > 0) out.push(cell - 1);
    return out;
  }
  function make(day) {
    let attempt = 0, path = [];
    while (path.length < SIZE * SIZE) {
      const seed = (((day * 40503 + 977) >>> 0) + Math.imul(attempt, 7919)) >>> 0;
      const next = mulberry32(seed), int = (k) => next() % k;
      const visited = new Set();
      let cell = int(SIZE * SIZE);
      path = [cell]; visited.add(cell);
      while (path.length < SIZE * SIZE) {
        const options = neighbours(cell).filter((x) => !visited.has(x));
        if (options.length === 0) break;
        const onward = options.map((o) => neighbours(o).filter((x) => !visited.has(x) && x !== o).length);
        const fewest = Math.min(...onward);
        const best = options.map((_, i) => i).filter((i) => onward[i] === fewest);
        cell = options[best[int(best.length)]];
        path.push(cell); visited.add(cell);
      }
      attempt++;
    }
    const dots = {}, last = path.length - 1;
    for (let k = 0; k < DOTS; k++) dots[path[Math.floor((k * last) / (DOTS - 1))]] = k + 1;
    return { number: day + 1, dots, solution: path };
  }
  const adjacent = (a, b) => neighbours(a).includes(b);
  function isSolved(p, line) {
    if (line.length !== SIZE * SIZE || new Set(line).size !== line.length) return false;
    for (let i = 1; i < line.length; i++) if (!adjacent(line[i - 1], line[i])) return false;
    const seen = line.filter((c) => p.dots[c]).map((c) => p.dots[c]);
    return seen.length === DOTS && seen.every((v, i) => v === i + 1);
  }
  root.DotToDot = { SIZE, DOTS, make, neighbours, adjacent, isSolved };
  if (typeof module !== "undefined") module.exports = root.DotToDot;
})(typeof window !== "undefined" ? window : globalThis);
